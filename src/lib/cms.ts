import { createClient } from '@supabase/supabase-js';
import { type Article, cleanText } from './content';
import { categoryOfSlug } from './categories';
import { usableCover } from './media';

/* DB B — the CMS.
 *
 * Two databases feed one reader. DB A is raw supply: whatever the scraper and
 * the fact-check pipeline produced. DB B is editorial truth: the items a writer
 * authored here, and the approvals and corrections applied on top of pipeline
 * stories. Where they disagree, DB B wins — that is the whole point of it.
 *
 * Read-only from the app, and RLS is the only thing standing between this
 * publishable key and the data, so nothing here assumes a query is safe just
 * because the app issued it.
 */

const CMS_URL = process.env.EXPO_PUBLIC_CMS_URL;
const CMS_ANON_KEY = process.env.EXPO_PUBLIC_CMS_ANON_KEY;

/* The CMS is additive: the app worked before it existed and must keep working
   if it is unreachable or unconfigured. Every call below returns empty rather
   than throwing, so a CMS outage costs the editorial layer, not the feed. */
export const cmsEnabled = !!(CMS_URL && CMS_ANON_KEY);

/* The cut, and what survives it.
 *
 * The CMS is now the app's only content source. Nothing reaches a reader that
 * an editor did not put in front of them: the desk's own pix and qix, and the
 * pipeline stories it approved into `article_selections`. DB A is still read —
 * it holds the *bodies* of those approved stories, and it holds the runtime
 * (comments, telemetry, saves, the streak) — but it is no longer somewhere the
 * app goes looking for something to show.
 *
 * This used to be a `CMS_ONLY` flag, off, because every policy on DB B was
 * scoped to `authenticated` and the app's publishable key read zero rows.
 * Anon read policies now exist for `content_items` (published only), and for
 * `article_selections` and `categories`, so the flag had nothing left to guard.
 *
 * Engagement is the part that has not moved. There is no likes/comments table
 * in DB B — see §6 of the integration brief — so a CMS item has no thread and
 * no per-article telemetry row. Both degrade quietly rather than erroring; the
 * guards are `commentsSupported` and `pipelineIdOnly`.
 */

export const cms = cmsEnabled
  ? createClient(CMS_URL!, CMS_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

/* CMS ids and pipeline ids are both uuids, so a bare id says nothing about
   which database to read it back from. Prefixing is what lets one feed carry
   both and one route resolve either. */
/* Logged once per reason, not once per call.

   Every console.warn on device goes through the native logger, and a failure
   that repeats — an unreachable region, a policy that returns nothing — repeats
   the log with it. That flood is itself the crash people see, so a reason is
   reported the first time and counted silently after. */
const warned = new Set<string>();
function warnOnce(reason: string, detail: string) {
  if (warned.has(reason)) return;
  warned.add(reason);
  console.warn(`[cms] ${reason}: ${detail}`);
}

export const CMS_PREFIX = 'cms:';
export const isCmsId = (id: string) => id.startsWith(CMS_PREFIX);
export const bareCmsId = (id: string) => id.slice(CMS_PREFIX.length);

/* The desk's eight are the app's eight — see lib/categories.
   This used to be a translation table onto the pipeline's own thirteen topics,
   which is how `entertainment` ended up displayed as "Explained". */
type ContentRow = {
  id: string;
  kind: 'article' | 'pix' | 'qix' | 'trax';
  title: string;
  summary: string | null;
  body: Record<string, unknown> | null;
  category_slug: string | null;
  cover_url: string | null;
  media_url: string | null;
  duration_sec: number | null;
  source_links: { title: string; url: string }[] | null;
  fact_score: number | null;
  fact_label: string | null;
  published_at: string | null;
  created_at: string;
};

/** The columns a feed needs. `body` is included only where the format uses it. */
const FEED_COLS =
  'id,kind,title,summary,body,category_slug,cover_url,media_url,duration_sec,source_links,fact_score,fact_label,published_at,created_at';

function mapContentItem(r: ContentRow): Article {
  const links = Array.isArray(r.source_links) ? r.source_links : [];
  const first = links[0];
  const summary = cleanText(r.summary ?? '');
  const words = summary.trim() ? summary.trim().split(/\s+/).length : 0;
  // Pix keeps its three key points in body.points; the app already renders an
  // article's tldr as bullets, so they land there rather than inventing a field.
  const points = Array.isArray((r.body as any)?.points)
    ? ((r.body as any).points as unknown[]).map(String).filter(Boolean)
    : null;

  return {
    id: CMS_PREFIX + r.id,
    title: cleanText(r.title),
    summary,
    // CMS articles are a headline and 300 characters — there is no long body,
    // and the article page already falls back to the summary when body is null.
    body: null,
    url: first?.url ?? '',
    topic: categoryOfSlug(r.category_slug),
    publisher: first?.title ?? 'Daily Mattr',
    /* Normalised here rather than at each card.
       Some rows point `cover_url` at the same YouTube page as their media, and
       an <Image> handed an HTML document fails silently — a black card with a
       headline on it and no clue why. Nulling it at the boundary means every
       surface falls back to the topic's own artwork, which they all already do
       when a story has no photo. */
    imageUrl: usableCover(r.cover_url),
    publishedAt: r.published_at ?? r.created_at,
    prominence: 0,
    factLabel: r.fact_label,
    // same arithmetic mapArticle uses for pipeline rows, so a CMS card and a
    // pipeline card quote read time on the same basis
    readMins: Math.max(1, Math.round(words / 220)),
    wordCount: words,
    modes: points?.length ? { eli5: null, tldr: points, keyNumbers: null, deepDive: null } : null,
    /* The desk's own kinds map onto the three the app renders. `trax` is audio
       and has no slot yet, so it reads as a plain story rather than being
       dropped — a published trax should still be reachable, just not pretending
       to be a video. */
    format: r.kind === 'pix' ? 'pix' : r.kind === 'qix' ? 'qix' : 'article',
    featured: false,
    mediaUrl: r.media_url,
    // bigint over the wire arrives as a string
    durationSec: r.duration_sec == null ? null : Number(r.duration_sec) || null,
  };
}

/**
 * Everything the desk has published, newest first. With `kind` set it returns
 * just that format — which is how the Pix and Video decks are built, rather
 * than by filtering a mixed feed the app already paid to fetch.
 */
export async function fetchCmsFeed(limit = 40, kind?: ContentRow['kind']): Promise<Article[]> {
  if (!cms) return [];
  /* Wrapped, not just error-checked.

     supabase-js reports a query problem on `error`, but a transport failure —
     the second region unreachable, DNS, an offline device — REJECTS. This runs
     inside a Promise.all beside the main feed, so a rejection here took the
     whole feed down and react-query retried it forever. The CMS is additive:
     it can be absent, and the feed must not notice. */
  try {
    let q = cms.from('content_items').select(FEED_COLS).eq('status', 'published');
    if (kind) q = q.eq('kind', kind);
    const { data, error } = await q
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) {
      // RLS denials arrive as an empty array, never here — this is transport.
      warnOnce('feed unavailable', error.message);
      return [];
    }
    return (data ?? []).map((r) => mapContentItem(r as ContentRow));
  } catch (e) {
    warnOnce('feed unreachable', String((e as Error)?.message ?? e));
    return [];
  }
}

/** Saved items, looked up in one round trip. Unpublished ids simply don't return. */
export async function fetchCmsByIds(ids: string[]): Promise<Article[]> {
  if (!cms || !ids.length) return [];
  try {
    const { data, error } = await cms
      .from('content_items')
      .select(FEED_COLS)
      .in('id', ids.map(bareCmsId))
      .eq('status', 'published');
    if (error) {
      warnOnce('lookup unavailable', error.message);
      return [];
    }
    return (data ?? []).map((r) => mapContentItem(r as ContentRow));
  } catch (e) {
    warnOnce('lookup unreachable', String((e as Error)?.message ?? e));
    return [];
  }
}

export async function fetchCmsItem(id: string): Promise<Article | null> {
  if (!cms) return null;
  try {
    const { data, error } = await cms
      .from('content_items')
      .select(FEED_COLS)
      .eq('id', bareCmsId(id))
      .eq('status', 'published')
      .maybeSingle();
    if (error || !data) return null;
    return mapContentItem(data as ContentRow);
  } catch {
    return null;
  }
}

/* ---------- editorial overrides on pipeline stories ---------- */

export type Selection = {
  articleId: string;
  isFeatured: boolean;
  approvedAt: string | null;
  titleOverride: string | null;
  summaryOverride: string | null;
  imageOverride: string | null;
};

/* A very short cache, and short on purpose.
 *
 * This exists so the handful of surfaces that read the approved set within the
 * same second — home, the deck, search, the quiz — don't each pay a round trip
 * to a second region for the same few dozen rows. It is *not* a freshness
 * policy: it was two minutes, which meant an editor could save a change, watch
 * the app refresh, and still see the old headline. Two seconds collapses the
 * burst without ever being the reason something looks stale.
 *
 * The Map's insertion order is the feed's order — see fetchSelections. */
let cache: { at: number; rows: Map<string, Selection> } | null = null;
const TTL_MS = 2_000;

/** Forget the approved set now — used when a refresh must actually re-read. */
export function invalidateSelections(): void {
  cache = null;
}

export async function fetchSelections(): Promise<Map<string, Selection>> {
  if (!cms) return new Map();
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;

  try {
    /* Ascending, and it is not a detail: the CMS says "order follows approval —
       the first story approved leads the feed", and §5 of the integration brief
       is explicit that there is no rank column to read instead. Descending here
       would silently invert the desk's running order. */
    const { data, error } = await cms
      .from('article_selections')
      .select('article_id,is_featured,approved_at,title_override,summary_override,image_override')
      .order('approved_at', { ascending: true, nullsFirst: false });

    if (error) {
      warnOnce('selections unavailable', error.message);
      return cache?.rows ?? new Map();
    }

    const rows = new Map<string, Selection>();
    for (const r of data ?? []) {
      rows.set(String(r.article_id), {
        articleId: String(r.article_id),
        isFeatured: !!r.is_featured,
        approvedAt: r.approved_at,
        titleOverride: r.title_override,
        summaryOverride: r.summary_override,
        imageOverride: r.image_override,
      });
    }
    cache = { at: Date.now(), rows };
    return rows;
  } catch (e) {
    warnOnce('selections unreachable', String((e as Error)?.message ?? e));
    // Cache the miss briefly so an unreachable CMS is retried on a timer
    // rather than on every single feed read.
    cache = { at: Date.now(), rows: cache?.rows ?? new Map() };
    return cache.rows;
  }
}

/* Resolution order, and it matters:
 *
 *     CMS override  →  pipeline's own edit  →  raw scrape
 *
 * mapArticle has already collapsed the last two, so what arrives here is the
 * pipeline's best version and this only has to apply the desk's correction on
 * top. Get the order wrong and an editor's fix silently never reaches a reader,
 * which is the failure mode nobody notices because nothing breaks.
 */
export function applyOverride(a: Article, sel: Selection | undefined): Article {
  if (!sel) return a;
  const title = sel.titleOverride?.trim() || a.title;
  const summary = sel.summaryOverride?.trim() || a.summary;
  const imageUrl = sel.imageOverride?.trim() || a.imageUrl;
  const featured = sel.isFeatured;
  if (
    title === a.title &&
    summary === a.summary &&
    imageUrl === a.imageUrl &&
    featured === a.featured
  ) {
    return a;
  }
  return { ...a, title, summary, imageUrl, featured };
}

/** Applies the desk's corrections across a list, fetching them once. */
export async function withOverrides(list: Article[]): Promise<Article[]> {
  if (!cms || !list.length) return list;
  try {
    const sels = await fetchSelections();
    if (!sels.size) return list;
    return list.map((a) => applyOverride(a, sels.get(a.id)));
  } catch {
    // uncorrected is better than no feed
    return list;
  }
}
