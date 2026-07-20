import { supabase } from './supabase';
import { ARTICLE_COLS, mapArticle, type Article } from './content';
import { getDeviceId } from './telemetry';

const PUBLISHED = ['approved', 'sent'];

// Personalized feed via the app_get_feed RPC (two-stage retrieve+score in
// Postgres), followed by a client-side diversity pass: max 2 of the same
// topic in any window of 5.
export async function fetchForYou(limit = 60): Promise<Article[]> {
  const deviceId = await getDeviceId();
  const { data, error } = await supabase.rpc('app_get_feed', {
    p_device_id: deviceId,
    p_limit: limit,
  });
  if (error) throw error;
  const ranked = (data ?? []).map(mapArticle);
  return diversify(ranked);
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
// (ELI5 / TL;DR / key numbers / deep dive).
export async function fetchReaderFeed(limit = 40): Promise<Article[]> {
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
  const { data, error } = await supabase
    .from('articles')
    .select(ARTICLE_COLS + ',raw_content,versions')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapArticle(data) : null;
}

// Related stories: same topic, recent, excluding the current article.
export async function fetchRelated(a: Article, limit = 6): Promise<Article[]> {
  const { data, error } = await supabase
    .from('articles')
    .select(ARTICLE_COLS)
    .in('status', PUBLISHED)
    .in('topic', expandTopics([a.topic]))
    .neq('id', a.id)
    .order('reviewed_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapArticle);
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
