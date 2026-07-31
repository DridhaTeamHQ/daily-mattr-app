import type { Article } from './content';

/* Feed ranking.
 *
 * What replaced what, and why:
 *
 * The first version was the desk's approval order, untouched. That was right
 * when the question was "does the newsroom control the feed" and wrong as soon
 * as the app had more than a day of content in it — approval order ascending
 * means the oldest approved story leads, so a reader opening the app at 8am
 * got yesterday morning first. For a news app that is the worst possible
 * default.
 *
 * The second was a bounded nudge: keep approval order, shift each story a few
 * places on the reader's signals. It preserved editorial intent but inherited
 * the same broken spine.
 *
 * This is a score. It follows the shape every news ranker converges on —
 * Hacker News' (points / age^gravity), Reddit's log(votes) + age term,
 * EdgeRank's affinity × weight × decay — which is: something that decays with
 * age, something that says who this reader is, and something the editor can
 * put a thumb on. Written additively rather than multiplicatively so a zero in
 * one term cannot silently annihilate a story, which is the classic failure of
 * the multiplicative form.
 *
 * What it deliberately does NOT use: global popularity. The engagement counts
 * exist (CMS migration 10) but `content_stats` is readable only by the desk,
 * and rightly — handing every reader a live table of what everyone else clicked
 * is both a privacy question and the mechanism by which a feed collapses onto
 * whatever is already winning. Personalisation here is built from what *this*
 * device did, which never leaves it.
 */

// ── weights ────────────────────────────────────────────────────────────────
//
// Kept as named constants at one scale (roughly 0..1 each before weighting) so
// the relative pull of each term is legible rather than buried in arithmetic.

/** How fast news goes cold. A story is worth half as much after this long. */
export const HALF_LIFE_HOURS = 9;
/** Recency is the spine of a news feed, so it carries the most weight. */
export const W_RECENCY = 1.0;
/** The desk's thumb. Large enough to lead, not so large it pins junk forever. */
export const W_FEATURED = 0.55;
/** Reader said, or reader did. */
export const W_FAVOURITE = 0.42;
export const W_SAVED_TOPIC = 0.18;
/** Seen it. Not hidden — a re-read is legitimate — but it steps aside. */
export const P_READ = 0.75;
/** Said no. Stronger than read, and deliberately not removal. */
export const P_DISLIKED = 1.4;
/** How many of one topic may run consecutively before one is held back. */
export const MAX_TOPIC_RUN = 2;

export type ReadSignals = {
  /** Stories already opened. Demoted, never hidden. */
  readIds: ReadonlySet<string>;
  /** Explicit thumbs-down. */
  dislikedIds: ReadonlySet<string>;
  /** Most-read categories, or the ones chosen at onboarding. */
  favouriteTopics: ReadonlySet<string>;
  /** Categories they have saved something from — weaker, but deliberate. */
  savedTopics: ReadonlySet<string>;
};

export const NO_SIGNALS: ReadSignals = {
  readIds: new Set(),
  dislikedIds: new Set(),
  favouriteTopics: new Set(),
  savedTopics: new Set(),
};

/**
 * 1 at publication, 0.5 after one half-life, approaching 0 thereafter.
 *
 * Exponential rather than Hacker News' `1/(age+2)^1.8`, because that curve is
 * tuned for a ranking that is re-sorted continuously against new arrivals. This
 * feed is a finite daily set, and an exponential gives a gentler shoulder in
 * the first few hours — where most of a news app's stories actually live.
 *
 * Clamped at zero age: a clock skewed a few minutes into the future should not
 * hand a story a score above everything else.
 */
export function freshness(publishedAt: string, now: number): number {
  const t = Date.parse(publishedAt);
  if (!Number.isFinite(t)) return 0.5; // undated: neither promoted nor buried
  const ageHours = Math.max(0, (now - t) / 3_600_000);
  return Math.pow(0.5, ageHours / HALF_LIFE_HOURS);
}

/** The score a story carries for this reader, at this moment. Higher leads. */
export function scoreOf(a: Article, s: ReadSignals, now: number): number {
  let score = W_RECENCY * freshness(a.publishedAt, now);

  if (a.featured) score += W_FEATURED;
  if (s.favouriteTopics.has(a.topic)) score += W_FAVOURITE;
  if (s.savedTopics.has(a.topic)) score += W_SAVED_TOPIC;

  /* Read and disliked stack: a story someone opened and then thumbed down
     belongs below one they merely opened. */
  if (s.readIds.has(a.id)) score -= P_READ;
  if (s.dislikedIds.has(a.id)) score -= P_DISLIKED;

  return score;
}

/**
 * Breaks up runs of the same category without re-sorting.
 *
 * A pure score sort clusters — six Politics stories filed within an hour of
 * each other all score alike and arrive together, and the feed reads like one
 * story told six times. This walks the sorted list and defers any story that
 * would extend a run past `MAX_TOPIC_RUN`, taking the next different one
 * instead. Deferred stories are not dropped; they land as soon as the run
 * breaks, so the result is always a permutation.
 */
export function breakUpRuns(list: Article[]): Article[] {
  if (list.length < 3) return list;

  const out: Article[] = [];
  const held: Article[] = [];
  const queue = [...list];
  let lastTopic: string | null = null;
  let run = 0;

  const take = (a: Article) => {
    run = a.topic === lastTopic ? run + 1 : 1;
    lastTopic = a.topic;
    out.push(a);
  };

  while (queue.length || held.length) {
    // A held story goes back in the moment it no longer extends a run.
    const readyIdx = held.findIndex((a) => !(a.topic === lastTopic && run >= MAX_TOPIC_RUN));
    if (readyIdx !== -1) {
      take(held.splice(readyIdx, 1)[0]);
      continue;
    }
    if (!queue.length) {
      // Nothing left but held stories that all extend the run — the feed is
      // one topic. Emit them in order rather than looping forever.
      take(held.shift()!);
      continue;
    }
    const next = queue.shift()!;
    if (next.topic === lastTopic && run >= MAX_TOPIC_RUN) held.push(next);
    else take(next);
  }

  return out;
}

/**
 * Ranks a live feed for one reader.
 *
 * Featured stories are pinned to the front rather than scored into it. A boost
 * large enough to guarantee the lead would also be large enough to keep a
 * two-day-old featured story above this morning's news; pinning says what the
 * desk means without distorting everything below it.
 *
 * Always a permutation — same stories, same count. A ranker that can drop a
 * story can silently un-publish one, and the desk would have no way of knowing.
 */
export function personalise(list: Article[], s: ReadSignals, now: number = Date.now()): Article[] {
  if (list.length < 2) return list;

  const featured: Article[] = [];
  const rest: { a: Article; i: number; score: number }[] = [];

  list.forEach((a, i) => {
    if (a.featured) featured.push(a);
    else rest.push({ a, i, score: scoreOf(a, s, now) });
  });

  /* Ties broken by the original position rather than left to the sort's own
     stability, so two stories filed in the same minute keep the desk's order
     between them and the feed does not reshuffle between refetches. */
  rest.sort((x, y) => y.score - x.score || x.i - y.i);

  return [...featured, ...breakUpRuns(rest.map((r) => r.a))];
}
