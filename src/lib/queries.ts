import { supabase } from './supabase';
import { ARTICLE_COLS, mapArticle, mapModes, type Article } from './content';
import { isPixEligible, mergeByRecency } from './feed';
import { getDeviceId } from './telemetry';
import { CMS_ONLY, fetchCmsFeed, fetchCmsItem, fetchSelections, isCmsId, withOverrides } from './cms';

const PUBLISHED = ['approved', 'sent'];

// Personalized feed via the app_get_feed RPC (two-stage retrieve+score in
// Postgres), followed by a client-side diversity pass: max 2 of the same
// topic in any window of 5.
export async function fetchForYou(limit = 60): Promise<Article[]> {
  const deviceId = await getDeviceId();
  const [{ data, error }, authored] = await Promise.all([
    supabase.rpc('app_get_feed', { p_device_id: deviceId, p_limit: limit }),
    // the desk's own items, fetched alongside rather than after — two regions,
    // so serialising the round trips would be felt
    fetchCmsFeed(24),
  ]);
  if (error) throw error;
  const ranked = await withOverrides((data ?? []).map(mapArticle));
  // Under the hard cut a pipeline story reaches a reader only if the desk
  // approved it — everything else is supply the newsroom hasn't chosen.
  const supply = CMS_ONLY ? await approvedOnly(ranked) : ranked;
  return diversify(mergeByRecency(supply, authored));
}

/** Keeps only pipeline stories an editor has selected into the feed. */
async function approvedOnly(list: Article[]): Promise<Article[]> {
  const sels = await fetchSelections();
  return list.filter((a) => sels.has(a.id));
}


function diversify(list: Article[]): Article[] {
  const out: Article[] = [];
  const pool = [...list];
  while (pool.length) {
    const window = out.slice(-4);
    let idx = pool.findIndex(
      (a) => window.filter((w) => w.topic === a.topic).length < 2,
    );
    if (idx === -1) idx = 0; // relax rather than stall
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

// Reader stream for the Articles tab — includes the versions payload
// (ELI5 / TL;DR / key numbers / deep dive). With `topics` set it becomes a
// recency-ordered topic deck instead of the personalized ranking.
export async function fetchReaderFeed(limit = 40, topics?: string[]): Promise<Article[]> {
  if (topics?.length) {
    const { data, error } = await supabase
      .from('articles')
      .select(ARTICLE_COLS + ',versions')
      .in('status', PUBLISHED)
      .in('topic', expandTopics(topics))
      .order('reviewed_at', { ascending: false, nullsFirst: false })
      .order('scraped_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(mapArticle);
  }

  const deviceId = await getDeviceId();
  const { data, error } = await supabase.rpc('app_get_feed', {
    p_device_id: deviceId,
    p_limit: limit,
  });
  if (error) throw error;
  const ids = (data ?? []).map((r: any) => r.id);
  if (!ids.length) return [];
  const { data: full, error: e2 } = await supabase
    .from('articles')
    .select(ARTICLE_COLS + ',versions')
    .in('id', ids);
  if (e2) throw e2;
  const map = new Map((full ?? []).map((r: any) => [r.id, r]));
  return diversify(
    (data ?? [])
      .map((r: any) => {
        const fullRow = map.get(r.id);
        return fullRow ? mapArticle({ ...fullRow, score: r.score, sim: r.sim }) : null;
      })
      .filter(Boolean) as Article[],
  );
}

/* Pix needs a photo AND the three key points, which the personalized feed
   RPC does not carry. ~39% of the corpus qualifies, so a plain recency query
   over the versions payload is enough — no new RPC. */
export async function fetchPix(
  limit = 24,
  topics?: string[],
  before?: string | null,
): Promise<Article[]> {
  /* `versions->tldr is not null` used to be a server-side filter here, and it
     starved this deck: the summariser has reached a small fraction of the
     table, so the Pix category was drawing from roughly one story in fourteen
     while the rest of the app had thousands. The gate is now lib/feed's
     isPixEligible, which falls back to the summary — the same rule the mixed
     feed uses, so a story is a picture story in both places or neither.

     A photo is still required in SQL: that one is cheap, indexed, and no
     fallback can invent an image. */
  let q = supabase
    .from('articles')
    .select(ARTICLE_COLS + ',versions')
    .in('status', PUBLISHED)
    .not('image_url', 'is', null);
  if (topics?.length) q = q.in('topic', expandTopics(topics));
  // Keyset, same shape as fetchFeedPage: `before` is the publishedAt of the
  // last card already on screen, and publishedAt is reviewed_at ?? scraped_at,
  // which is exactly what ordered() sorts on. Offset paging would drift as new
  // articles land at the top; this cannot.
  if (before) {
    q = q.or(`reviewed_at.lt.${before},and(reviewed_at.is.null,scraped_at.lt.${before})`);
  }
  // 1.4x rather than 2x: nearly everything with a photo now qualifies, so the
  // old overfetch was mostly wasted rows over the wire
  const { data, error } = await ordered(q).limit(Math.ceil(limit * 1.4));
  if (error) throw error;
  return (data ?? []).map(mapArticle).filter(isPixEligible).slice(0, limit);
}

/* The quiz needs `versions` — fetchByIds selects ARTICLE_COLS only, and
   without tldr/key_numbers the generator can't tell which entities are
   central to a story and falls back to any capitalised word. */
export async function fetchArticlesWithModes(ids: string[]): Promise<Article[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from('articles')
    .select(ARTICLE_COLS + ',versions')
    .in('id', ids);
  if (error) throw error;
  const byId = new Map((data ?? []).map((r: any) => [r.id, mapArticle(r)]));
  return ids.map((id) => byId.get(id)).filter(Boolean) as Article[];
}

/* Just the reading-mode payloads for a set of ids.

   The personalized feed RPC (app_get_feed) does not return `versions`, so a
   story that arrives through For You has no tldr and can never pass the Pix
   gate — which silently meant no picture stories on the main feed at all.
   Rather than refetch whole rows, this pulls the one missing column and the
   caller merges it in. Small payload, one round trip. */
export async function fetchModesFor(ids: string[]): Promise<Record<string, Article['modes']>> {
  if (!ids.length) return {};
  const { data, error } = await supabase.from('articles').select('id,versions').in('id', ids);
  if (error) throw error;
  const out: Record<string, Article['modes']> = {};
  for (const r of data ?? []) out[(r as any).id] = mapModes((r as any).versions);
  return out;
}

/** Recent articles used only as a distractor corpus. */
export async function fetchQuizPool(limit = 150): Promise<Article[]> {
  const { data, error } = await ordered(
    supabase.from('articles').select(ARTICLE_COLS + ',versions').in('status', PUBLISHED),
  ).limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapArticle);
}

function ordered(q: any) {
  return q
    .order('reviewed_at', { ascending: false, nullsFirst: false })
    .order('scraped_at', { ascending: false });
}

export async function fetchFeed(opts: { topics?: string[]; limit?: number } = {}): Promise<Article[]> {
  let q = supabase.from('articles').select(ARTICLE_COLS).in('status', PUBLISHED);
  if (opts.topics?.length) q = q.in('topic', expandTopics(opts.topics));
  const { data, error } = await ordered(q).limit(opts.limit ?? 40);
  if (error) throw error;
  return (data ?? []).map(mapArticle);
}

export async function fetchHeroes(): Promise<Article[]> {
  const { data, error } = await supabase
    .from('articles')
    .select(ARTICLE_COLS)
    .in('status', PUBLISHED)
    .not('image_url', 'is', null)
    .order('prominence', { ascending: false, nullsFirst: false })
    .order('reviewed_at', { ascending: false, nullsFirst: false })
    .limit(30);
  if (error) throw error;
  // prefer fresh: among top-prominence rows keep the 5 most recent
  const arts = (data ?? []).map(mapArticle);
  return arts
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, 5);
}

export async function fetchTrending(limit = 8): Promise<Article[]> {
  const { data, error } = await supabase
    .from('articles')
    .select(ARTICLE_COLS)
    .in('status', PUBLISHED)
    .not('image_url', 'is', null)
    .order('rank_score', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapArticle);
}

export async function fetchArticle(id: string): Promise<Article | null> {
  // A prefixed id belongs to the CMS; anything else is a pipeline story.
  if (isCmsId(id)) return fetchCmsItem(id);

  const { data, error } = await supabase
    .from('articles')
    .select(ARTICLE_COLS + ',raw_content,versions')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  // the desk's correction applies here too — a reader who opens a story must
  // see the same words the card showed them
  const [withEdit] = await withOverrides([mapArticle(data)]);
  return withEdit;
}

// Related stories: true vector similarity via app_related (embedding cosine).
// Falls back to same-topic recency if the article has no embedding.
export async function fetchRelated(a: Article, limit = 6): Promise<Article[]> {
  /* app_related matches on the pipeline's title embedding, which a CMS item
     doesn't have — it was never scraped or embedded. Same-topic recency is the
     honest answer rather than an empty rail. */
  if (isCmsId(a.id)) {
    const { data, error } = await ordered(
      supabase.from('articles').select(ARTICLE_COLS).in('status', PUBLISHED).eq('topic', a.topic),
    ).limit(limit);
    if (error) return [];
    return (data ?? []).map(mapArticle);
  }

  const { data, error } = await supabase.rpc('app_related', {
    p_article_id: a.id,
    p_limit: limit,
  });
  if (!error && data?.length) return data.map(mapArticle);
  const { data: fb, error: e2 } = await supabase
    .from('articles')
    .select(ARTICLE_COLS)
    .in('status', PUBLISHED)
    .in('topic', expandTopics([a.topic]))
    .neq('id', a.id)
    .order('reviewed_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (e2) throw e2;
  return (fb ?? []).map(mapArticle);
}

// Breaking news for the bell screen / notification polling.
export type BreakingItem = Article & { breakingScore: number; sourceCount: number; detectedAt: string };
export async function fetchBreaking(limit = 20): Promise<BreakingItem[]> {
  const { data, error } = await supabase.rpc('app_get_breaking', { p_limit: limit });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    ...mapArticle(r),
    breakingScore: r.breaking_score,
    sourceCount: r.source_count,
    detectedAt: r.detected_at,
  }));
}

// Keyset pagination for "More stories" — stable under new inserts.
export async function fetchFeedPage(opts: {
  before?: string | null;
  topics?: string[];
  limit?: number;
}): Promise<Article[]> {
  let q = supabase.from('articles').select(ARTICLE_COLS).in('status', PUBLISHED);
  if (opts.topics?.length) q = q.in('topic', expandTopics(opts.topics));
  if (opts.before) {
    q = q.or(`reviewed_at.lt.${opts.before},and(reviewed_at.is.null,scraped_at.lt.${opts.before})`);
  }
  const { data, error } = await ordered(q).limit(opts.limit ?? 15);
  if (error) throw error;
  return (data ?? []).map(mapArticle);
}

// Semantic search via edge function; falls back to ilike when unavailable.
export async function searchSemantic(qtext: string, limit = 20): Promise<{ results: Article[]; semantic: boolean }> {
  try {
    const { data, error } = await supabase.functions.invoke('app-semantic-search', {
      body: { query: qtext, limit },
    });
    if (error) throw error;
    const rows = (data?.results ?? []) as any[];
    if (rows.length) return { results: rows.map(mapArticle), semantic: true };
  } catch {
    // fall through to keyword search
  }
  return { results: await searchArticles(qtext, limit), semantic: false };
}

export async function fetchByIds(ids: string[]): Promise<Article[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from('articles')
    .select(ARTICLE_COLS)
    .in('id', ids);
  if (error) throw error;
  const map = new Map((data ?? []).map((r: any) => [r.id, mapArticle(r)]));
  return ids.map((id) => map.get(id)).filter(Boolean) as Article[];
}

export async function searchArticles(qtext: string, limit = 30): Promise<Article[]> {
  const like = `%${qtext.replace(/[%_]/g, '')}%`;
  const { data, error } = await supabase
    .from('articles')
    .select(ARTICLE_COLS)
    .in('status', PUBLISHED)
    .or(`title.ilike.${like},edited_title.ilike.${like}`)
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapArticle);
}

// Topic counts for Explore — derived client-side from recent rows (read-only DB,
// no aggregate RPCs available to anon).
export async function fetchTopicStats(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('articles')
    .select('topic')
    .in('status', PUBLISHED)
    .limit(1000);
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const r of data ?? []) {
    const t = r.topic === 'Technology' ? 'Tech & AI' : r.topic;
    if (!t) continue;
    counts[t] = (counts[t] ?? 0) + 1;
  }
  return counts;
}

export async function fetchTopicCover(topic: string): Promise<Article | null> {
  const { data, error } = await supabase
    .from('articles')
    .select(ARTICLE_COLS)
    .in('status', PUBLISHED)
    .in('topic', expandTopics([topic]))
    .not('image_url', 'is', null)
    .order('prominence', { ascending: false, nullsFirst: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] ? mapArticle(data[0]) : null;
}

function expandTopics(topics: string[]): string[] {
  const out = new Set(topics);
  if (out.has('Tech & AI')) out.add('Technology');
  return [...out];
}
