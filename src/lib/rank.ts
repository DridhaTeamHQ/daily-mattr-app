import type { Article } from './content';

/* Personalisation, inside the desk's running order.
 *
 * The app deliberately has no ranking pass: when it moved onto the CMS, the
 * old score-and-diversity machinery went with it, because that machinery
 * existed to impose order on thousands of scraped rows and the desk's running
 * order is now the answer to that question. Nothing here takes that back.
 *
 * What this does is nudge. Every story keeps its approval position as its
 * starting point, and the reader's own behaviour moves it a bounded number of
 * places either way — a favourite category climbs a little, something already
 * read sinks, something explicitly disliked sinks further. The desk's sequence
 * is still legible in the result, the lead story is still the lead story, and
 * nothing is ever removed: a reader who scrolls far enough sees everything
 * that was approved.
 *
 * The bounds are the whole design. A free sort by affinity would bury a story
 * the desk put third under a fortnight of the reader's habits, which is the
 * behaviour the cutover was meant to end.
 */

/** How far each signal moves a story, in list positions. */
export const LIFT_FAVOURITE = 4;
export const LIFT_SAVED_TOPIC = 2;
export const DROP_READ = 8;
export const DROP_DISLIKED = 14;

export type ReadSignals = {
  /** Stories already opened. Demoted, never hidden. */
  readIds: ReadonlySet<string>;
  /** Explicit thumbs-down. */
  dislikedIds: ReadonlySet<string>;
  /** The reader's most-read categories. */
  favouriteTopics: ReadonlySet<string>;
  /** Categories they have saved something from — a weaker, deliberate signal. */
  savedTopics: ReadonlySet<string>;
};

export const NO_SIGNALS: ReadSignals = {
  readIds: new Set(),
  dislikedIds: new Set(),
  favouriteTopics: new Set(),
  savedTopics: new Set(),
};

/** How far this story moves from where the desk put it. Negative climbs. */
export function displacement(a: Article, s: ReadSignals): number {
  let d = 0;
  if (s.favouriteTopics.has(a.topic)) d -= LIFT_FAVOURITE;
  if (s.savedTopics.has(a.topic)) d -= LIFT_SAVED_TOPIC;
  /* Read and disliked stack on purpose: a story they opened and then thumbed
     down should sit below one they merely opened. */
  if (s.readIds.has(a.id)) d += DROP_READ;
  if (s.dislikedIds.has(a.id)) d += DROP_DISLIKED;
  return d;
}

/**
 * Reorders a live feed around one reader, without overruling the desk.
 *
 * Always a permutation — same stories, same count. Featured stories are left
 * exactly where the desk put them: they are an editorial decision, and a lead
 * that moves because of what someone read last week is not a lead.
 */
export function personalise(list: Article[], s: ReadSignals): Article[] {
  if (list.length < 2) return list;

  const featured: Article[] = [];
  const rest: { a: Article; i: number }[] = [];
  list.forEach((a, i) => {
    if (a.featured) featured.push(a);
    else rest.push({ a, i });
  });

  /* Sorted on `i + displacement` rather than on a score of its own, so the
     approval position stays the dominant term and the signals only ever shift
     a story within its neighbourhood. Ties fall back to `i`, which keeps the
     sort stable and stops the tail of untouched stories reshuffling between
     one refetch and the next. */
  const ordered = rest
    .map((r) => ({ ...r, at: r.i + displacement(r.a, s) }))
    .sort((x, y) => x.at - y.at || x.i - y.i)
    .map((r) => r.a);

  return [...featured, ...ordered];
}
