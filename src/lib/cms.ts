import { createClient } from '@supabase/supabase-js';
import { type Article, cleanText } from './content';

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

/* The hard cut, and the one line that performs it.
 *
 * The intent is for the CMS to be the app's only content source and for the
 * pipeline to be supply that reaches readers only once the desk has approved
 * it. That is what this flag does when true: no pipeline story appears unless
 * an editor selected it, and nothing else is read from DB A for content.
 *
 * It is false because DB B cannot serve the app yet, and that is a fact about
 * the database rather than a preference. Every policy on content_items and
 * article_selections is scoped to `authenticated`; there is no `anon` policy,
 * so the app's publishable key reads zero rows — a 200 with an empty array,
 * never an error. Flipping this today produces an empty app, not a small one.
 *
 * What unblocks it, on DB B:
 *
 *   create policy content_read_public on public.content_items
 *     for select to anon using (status = 'published');
 *   create policy selections_read_public on public.article_selections
 *     for select to anon using (true);
 *   create policy categories_read_public on public.categories
 *     for select to anon using (is_active);
 *
 * Note the first one is narrower than the staff policy on purpose: staff read
 * every status, readers must only ever see `published`, or drafts ship.
 *
 * Personalisation, comments, breaking news, push and search still live in DB A
 * and are unaffected by this flag — they are runtime, not content. Moving them
 * is the schema project in §6 of the integration brief.
 */
export const CMS_ONLY = false;

export const cms = cmsEnabled
  ? createClient(CMS_URL!, CMS_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

/* CMS ids and pipeline ids are both uuids, so a bare id says nothing about
   which database to read it back from. Prefixing is what lets one feed carry
   both and one route resolve either. */
export const CMS_PREFIX = 'cms:';
export const isCmsId = (id: string) => id.startsWith(CMS_PREFIX);
export const bareCmsId = (id: string) => id.slice(CMS_PREFIX.length);

/* CMS categories are the desk's eight; the app's topics are the pipeline's
   thirteen, and they carry the artwork and colour. Map onto what the app can
   already render rather than adding topics with no identity behind them. */
const CATEGORY_TO_TOPIC: Record<string, string> = {
  india: 'India',
  world: 'World',
  politics: 'Politics',
  business: 'Business',
  technology: 'Tech & AI',
  science: 'Science',
  sports: 'Sports',
  entertainment: 'Explained',
};

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
    topic: CATEGORY_TO_TOPIC[(r.category_slug ?? '').toLowerCase()] ?? 'Explained',
    publisher: first?.title ?? 'Daily Mattr',
    imageUrl: r.cover_url,
    publishedAt: r.published_at ?? r.created_at,
    prominence: 0,
    factLabel: r.fact_label,
    // same arithmetic mapArticle uses for pipeline rows, so a CMS card and a
    // pipeline card quote read time on the same basis
    readMins: Math.max(1, Math.round(words / 220)),
    wordCount: words,
    modes: points?.length ? { eli5: null, tldr: points, keyNumbers: null, deepDive: null } : null,
  };
}

/** Everything the desk has published, newest first. */
export async function fetchCmsFeed(limit = 40): Promise<Article[]> {
  if (!cms) return [];
  const { data, error } = await cms
    .from('content_items')
    .select(FEED_COLS)
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) {
    // An unreadable CMS must not take the feed down with it. RLS denials arrive
    // as empty rather than as errors, so this is for transport failures.
    console.warn('[cms] feed unavailable:', error.message);
    return [];
  }
  return (data ?? []).map((r) => mapContentItem(r as ContentRow));
}

export async function fetchCmsItem(id: string): Promise<Article | null> {
  if (!cms) return null;
  const { data, error } = await cms
    .from('content_items')
    .select(FEED_COLS)
    .eq('id', bareCmsId(id))
    .eq('status', 'published')
    .maybeSingle();
  if (error || !data) return null;
  return mapContentItem(data as ContentRow);
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

/* Selections change when an editor acts, not when a reader scrolls, so they are
   fetched once and reused. Without this every feed call would pay a second
   round trip to a different region for a table of a few dozen rows. */
let cache: { at: number; rows: Map<string, Selection> } | null = null;
const TTL_MS = 120_000;

export async function fetchSelections(): Promise<Map<string, Selection>> {
  if (!cms) return new Map();
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;

  const { data, error } = await cms
    .from('article_selections')
    .select('article_id,is_featured,approved_at,title_override,summary_override,image_override')
    .order('approved_at', { ascending: false, nullsFirst: false });

  if (error) {
    console.warn('[cms] selections unavailable:', error.message);
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
  if (title === a.title && summary === a.summary && imageUrl === a.imageUrl) return a;
  return { ...a, title, summary, imageUrl };
}

/** Applies the desk's corrections across a list, fetching them once. */
export async function withOverrides(list: Article[]): Promise<Article[]> {
  if (!cms || !list.length) return list;
  const sels = await fetchSelections();
  if (!sels.size) return list;
  return list.map((a) => applyOverride(a, sels.get(a.id)));
}
