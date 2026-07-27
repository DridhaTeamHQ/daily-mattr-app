import { addDays, type DayKey } from './day';

/* The streak rules, kept pure and dependency-free so they can be tested
   directly. progress.ts owns persistence and the React surface; this file
   owns nothing but the arithmetic. */

export const STREAK_MIN_READS = 3;
export const MAX_FREEZES = 2;
export const FREEZE_GRANT_EVERY = 7;
const WALK_LIMIT = 400;

export type StreakInput = {
  /** days with a full record: day -> number of qualified reads */
  counts: Record<DayKey, number>;
  /** days migrated from the old history array — qualify on presence */
  seededDays: readonly DayKey[];
};

export type StreakResult = {
  current: number;
  lastQualifiedDay: DayKey | null;
  /** which missed days a freeze bridged, newest first */
  freezesUsedOn: DayKey[];
  freezesRemaining: number;
};

export function qualifiedDays(input: StreakInput): Set<DayKey> {
  const out = new Set<DayKey>(input.seededDays);
  for (const [day, n] of Object.entries(input.counts)) {
    if (n >= STREAK_MIN_READS) out.add(day);
  }
  return out;
}

/* Pure function of (qualified days, today). Runs on hydrate and again on the
   first read of the day — if it consumed freezes by mutating state rather than
   deriving them, a cold start would burn the budget without a day ever being
   missed. */
export function computeStreak(input: StreakInput, today: DayKey): StreakResult {
  const q = qualifiedDays(input);
  const budget = Math.min(MAX_FREEZES, Math.floor(q.size / FREEZE_GRANT_EVERY));

  // Start at today only if today already counts. Otherwise start at yesterday:
  // today is still in progress, and treating an unfinished day as a miss would
  // read 0 all morning until the third story.
  let cursor = q.has(today) ? today : addDays(today, -1);
  let current = 0;
  const used: DayKey[] = [];

  for (let guard = 0; guard < WALK_LIMIT; guard++) {
    if (q.has(cursor)) {
      current++;
      cursor = addDays(cursor, -1);
      continue;
    }
    // One missed day is bridgeable with budget, but only if the day before it
    // counts — a freeze may not be spent extending into nothing. Two misses in
    // a row always break the run, however much budget remains.
    if (used.length < budget && q.has(addDays(cursor, -1))) {
      used.push(cursor);
      cursor = addDays(cursor, -1);
      continue;
    }
    break;
  }

  const sorted = [...q].sort();
  return {
    current,
    lastQualifiedDay: sorted[sorted.length - 1] ?? null,
    freezesUsedOn: used,
    freezesRemaining: Math.max(0, budget - used.length),
  };
}
