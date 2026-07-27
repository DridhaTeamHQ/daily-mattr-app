/* Recency bands for the feed.

   Bands of *age*, not time of day — "Just in" means published within the hour,
   whatever hour it currently is. Time-of-day bands (Morning/Evening) were the
   other candidate and are wrong here: a story filed at 9am is still "Morning"
   at midnight, which tells a reader nothing about whether they've seen it.

   Boundaries are 1h / 2h / 10h / 18h, cumulative-exclusive: a 90-minute-old
   story is in `h2`, not in both `now` and `h2`. Past 18h it's yesterday's and
   the band stops trying to be precise. */

export type BandId = 'now' | 'h2' | 'h10' | 'h18' | 'older';

export type Band = {
  id: BandId;
  label: string;
  /** exclusive upper bound on age, in ms */
  ltMs: number;
};

const H = 3_600_000;

export const BANDS: readonly Band[] = [
  { id: 'now', label: 'Just in', ltMs: 1 * H },
  { id: 'h2', label: 'Past 2 hours', ltMs: 2 * H },
  { id: 'h10', label: 'Past 10 hours', ltMs: 10 * H },
  { id: 'h18', label: 'Past 18 hours', ltMs: 18 * H },
  { id: 'older', label: 'Earlier', ltMs: Infinity },
];

const OLDER = BANDS[BANDS.length - 1];
const byId = new Map(BANDS.map((b) => [b.id, b]));

export function bandById(id: BandId): Band {
  return byId.get(id) ?? OLDER;
}

export function bandOfAge(ageMs: number): Band {
  // clock skew: a server timestamp ahead of the device gives a negative age.
  // Treat the future as fresh rather than letting it fall through to `older`.
  const age = Math.max(0, ageMs);
  return BANDS.find((b) => age < b.ltMs) ?? OLDER;
}

/* `now` is a required parameter, deliberately.

   Reading Date.now() in here would mean the band is recomputed on every
   render, so a story sitting near a boundary flips between bands as you
   scroll and the list reorders under your thumb. Callers hoist `now` into
   state and refresh it on foreground / pull-to-refresh instead. */
export function bandOf(publishedAt: string | null | undefined, now: number): Band {
  // publishedAt is `reviewed_at ?? scraped_at` with no further fallback, so it
  // genuinely can be missing — and Date.parse(undefined) is NaN, which would
  // otherwise compare false against every bound and silently land in `older`.
  const t = Date.parse(publishedAt ?? '');
  if (!Number.isFinite(t)) return OLDER;
  return bandOfAge(now - t);
}

export type BandGroup<T> = { band: Band; items: T[] };

/* Groups a list into consecutive runs by band.

   Deliberately does NOT sort. On the ranked surfaces (For You scores,
   Trending's rank_score) re-sorting by age would throw the ranking away — so
   this only emits a header where the band changes as it walks the list. Sort
   before calling if the surface is meant to be recency-ordered.

   `minRun` folds tiny groups into the previous one: on a ranked feed the bands
   alternate, and without this the list becomes a header sandwich with a single
   row between each. */
export function groupByBand<T>(
  items: T[],
  at: (t: T) => string | null | undefined,
  now: number,
  minRun = 2,
): BandGroup<T>[] {
  const runs: BandGroup<T>[] = [];
  for (const item of items) {
    const band = bandOf(at(item), now);
    const last = runs[runs.length - 1];
    if (last && last.band.id === band.id) last.items.push(item);
    else runs.push({ band, items: [item] });
  }

  const folded: BandGroup<T>[] = [];
  for (const run of runs) {
    const prev = folded[folded.length - 1];
    if (prev && run.items.length < minRun) prev.items.push(...run.items);
    else folded.push(run);
  }
  return folded;
}
