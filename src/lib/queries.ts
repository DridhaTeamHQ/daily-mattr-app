import { supabase } from './supabase';
import { ARTICLE_COLS, mapArticle, type Article } from './content';
import { featuredFirst } from './feed';
import { applyOverride, fetchCmsByIds, fetchCmsFeed, fetchCmsItem, fetchSelections, isCmsId } from './cms';

/* Reading the app's content.
 *
 * There is exactly one rule in this file, and everything else follows from it:
 * **nothing reaches a reader that an editor did not put in front of them.**
 *
 * That means the pipeline's `articles` table is no longer somewhere the app
 * goes looking for stories. It is a body store: it holds the text of the
 * stories the desk approved into `article_selections`, and the app fetches
 * those rows *by id*. It never selects from it by topic, by recency, by rank,
 * or by anything else — because any such query answers "what did the scraper
 * collect", and the app's question is "what did the newsroom publish".
 *
 * The whole content set is small on purpose: the desk's published pix and qix,
 * plus the stories it approved. `liveArticles` and `fetchCmsFeed` are the only
 * two doors, and every function below is built from them.
 */

/* Options for anything showing the desk's work.
 *
 * The app is a window onto a CMS someone is editing right now, so the feed
 * cannot only update when the reader happens to pull down on it. Thirty
 * seconds is short enough that an editor watching a phone sees their change
 * land while they are still looking at it, and long enough that a feed of two
 * dozen rows costs nothing to keep current. Polling stops when the app is
 * backgrounded — react-query pauses intervals for unfocused clients, and focus
 * is wired to AppState in lib/network.
 *
 * This is the floor, not the ceiling: DB B's `supabase_realtime` publication
 * has no tables in it, so nothing is broadcast and there is nothing to
 * subscribe to. Adding `content_items` and `article_selections` to it turns
 * this into instant updates. */
export const LIVE_QUERY = {
  refetchInterval: 30_000,
  refetchOnWindowFocus: true,
  refetchOnMount: true,
} as const;

/* A selection can point at an id the pipeline never had, and Postgres errors on
   a malformed uuid rather than ignoring it — which would take down the feed
   instead of dropping one row. The CMS guards its own reads the same way. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* Deliberately uncached.
 *
 * There was a 60-second memo here, so that the four surfaces reading the
 * approved set within the same second — home, the deck, search, the quiz —
 * didn't each pay a round trip. It also meant an editor's change could sit
 * invisible for a minute *after* a refetch had already been triggered, which
 * made the app look broken in exactly the way a CMS must not: you press save,
 * you pull to refresh, and nothing happens.
 *
 * react-query is the cache, and it is the one the refresh gesture and the
 * polling interval can actually invalidate. A dozen rows by id is a cheap
 * request; a stale newsroom is not.
 */

/**
 * The stories the desk approved into the app feed: DB A bodies, DB B
 * corrections, the desk's running order — featured first, then approval order.
 */
export async function liveArticles(): Promise<Article[]> {
  const sels = await fetchSelections();
  // Insertion order is approval order (fetchSelections orders ascending), and
  // it is the only place the feed's running order comes from.
  const ids = [...sels.keys()].filter((id) => UUID_RE.test(id));
  if (!ids.length) return [];

  const { data, error } = await supabase
    .from('articles')
    .select(ARTICLE_COLS + ',versions')
    .in('id', ids);
  if (error) throw error;

  const byId = new Map((data ?? []).map((r: any) => [r.id, r]));
  const rows: Article[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    // an approval can outlive the row it points at; skip rather than blank-card
    if (!row) continue;
    rows.push(applyOverride(mapArticle(row), sels.get(id)));
  }

  return featuredFirst(rows);
}

/** Everything live, in one list: approved stories, then the desk's own items. */
async function liveEverything(): Promise<Article[]> {
  const [approved, authored] = await Promise.all([liveArticles(), fetchCmsFeed(60)]);
  return [...approved, ...authored];
}

/* Home. No ranking pass and no diversity pass: both existed to impose order on
   thousands of scraped rows, and the desk's running order is now the answer to
   that question. composeFeed lays the pix and qix onto the reading rhythm. */
export async function fetchForYou(): Promise<Article[]> {
  return liveEverything();
}

/** The reader deck. A category filter narrows the same set — never widens it. */
export async function fetchReaderFeed(topics?: string[]): Promise<Article[]> {
  const all = await liveEverything();
  if (!topics?.length) return all;
  // Every story carries one of the desk's eight by the time it gets here — the
  // fold from the pipeline's own taxonomy happens in lib/categories, at the
  // point a row is mapped. There is nothing left to expand or alias.
  const want = new Set(topics);
  return all.filter((a) => want.has(a.topic));
}

/** Picture stories — authored in the CMS, never derived from a photo. */
export async function fetchPix(limit = 40): Promise<Article[]> {
  return fetchCmsFeed(limit, 'pix');
}

/** Short vertical video. */
export async function fetchQix(limit = 40): Promise<Article[]> {
  return fetchCmsFeed(limit, 'qix');
}

export async function fetchArticle(id: string): Promise<Article | null> {
  // A prefixed id belongs to the CMS; anything else is a pipeline story.
  if (isCmsId(id)) return fetchCmsItem(id);

  /* Approval is checked before the row is even fetched.
     A route is reachable by a stale link, a notification tap, or a saved id
     that has since been unapproved — and every one of those would otherwise
     open a story the desk took down. Returning null puts the reader on "Story
     not found · it may have been removed since you opened it", which is what
     actually happened. */
  const sels = await fetchSelections();
  const sel = sels.get(id);
  if (!sel) return null;

  const { data, error } = await supabase
    .from('articles')
    .select(ARTICLE_COLS + ',raw_content,versions')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  // the desk's correction applies here too — a reader who opens a story must
  // see the same words the card showed them
  return applyOverride(mapArticle(data), sel);
}

/** Related reading: the same topic, from what else is live. */
export async function fetchRelated(a: Article, limit = 6): Promise<Article[]> {
  const all = await liveEverything();
  return all.filter((x) => x.id !== a.id && x.topic === a.topic).slice(0, limit);
}

/* Search runs in memory.
 *
 * It used to be a semantic edge function over the pipeline's embeddings, with
 * an `ilike` fallback — both of which search the scraped corpus, and so would
 * hand a reader a story the desk never approved. Over a content set this size
 * a substring match is not a downgrade: it is instant, works offline against
 * the cached feed, and cannot return something that isn't live.
 */
export async function searchArticles(qtext: string, limit = 30): Promise<Article[]> {
  const q = qtext.trim().toLowerCase();
  if (!q) return [];
  const all = await liveEverything();
  const hit = (a: Article) =>
    a.title.toLowerCase().includes(q) ||
    a.summary.toLowerCase().includes(q) ||
    a.topic.toLowerCase().includes(q);
  return all.filter(hit).slice(0, limit);
}

/** What to offer before anything has been typed. */
export async function fetchSuggestions(limit = 6): Promise<Article[]> {
  return (await liveEverything()).slice(0, limit);
}

/* The quiz corpus.

   Every live story, whether or not it carries reading modes — the generator
   needs distractors as much as it needs subjects, and a story without a tldr
   is still a usable wrong answer. */
export async function fetchQuizPool(): Promise<Article[]> {
  return liveEverything();
}

export async function fetchArticlesWithModes(ids: string[]): Promise<Article[]> {
  if (!ids.length) return [];
  const byId = new Map((await liveEverything()).map((a) => [a.id, a]));
  return ids.map((id) => byId.get(id)).filter(Boolean) as Article[];
}

/* Saved articles and reading history — the one place ids arrive from somewhere
 * other than a feed. They come off the device, were stored possibly weeks ago,
 * and freely mix both databases.
 *
 * This is also the last door the old corpus could walk back in through. A
 * device that was used before the cut has saves and history full of scraped
 * ids, and looking a row up by id works perfectly whether or not anyone
 * approved it — so Profile went on listing stories the feed had stopped
 * showing. The selection set is the filter, exactly as it is everywhere else.
 *
 * The ids are not discarded, only unresolved: re-approve a story and the saved
 * card comes back rather than having been quietly deleted from under someone.
 */
export async function fetchByIds(ids: string[]): Promise<Article[]> {
  if (!ids.length) return [];
  const sels = await fetchSelections();
  const cmsIds = ids.filter(isCmsId);
  const pipelineIds = ids.filter((id) => !isCmsId(id) && UUID_RE.test(id) && sels.has(id));

  const [pipeline, authored] = await Promise.all([
    pipelineIds.length
      ? supabase.from('articles').select(ARTICLE_COLS).in('id', pipelineIds)
      : Promise.resolve({ data: [], error: null }),
    fetchCmsByIds(cmsIds),
  ]);
  if (pipeline.error) throw pipeline.error;

  const map = new Map<string, Article>();
  for (const r of (pipeline.data ?? []) as any[]) {
    map.set(r.id, applyOverride(mapArticle(r), sels.get(r.id)));
  }
  for (const a of authored) map.set(a.id, a);
  // caller's order is the reader's order — most recently saved first
  return ids.map((id) => map.get(id)).filter(Boolean) as Article[];
}

/** Topic counts for the dial, over what is actually live. */
export async function fetchTopicStats(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const a of await liveEverything()) {
    if (!a.topic) continue;
    counts[a.topic] = (counts[a.topic] ?? 0) + 1;
  }
  return counts;
}
