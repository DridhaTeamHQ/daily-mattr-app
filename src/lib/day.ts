/* Local-calendar day math.

   This exists because the streak was bucketing days as
   `Math.floor(at / 86400000)` — epoch milliseconds divided by a day. That is
   UTC, so in IST the day rolled over at 05:30 local: reading at 2am counted
   toward yesterday, and the "This week" bars were shifted by five and a half
   hours. Every day boundary in the app now goes through here instead.

   Two rules the implementation must not break:

   1. Never divide milliseconds to move between days. A DST transition makes a
      day 23 or 25 hours long and ms-division then skips or duplicates one.
      Everything goes through Date's local Y/M/D fields, which handle it.
   2. There is no expo-localization dependency, so the device timezone is the
      only source of truth available. A device set to UTC gets UTC days — but
      that is the user's own setting, not a bug we're imposing. */

export type DayKey = string; // 'YYYY-MM-DD' in the device's local calendar

const pad = (n: number) => (n < 10 ? `0${n}` : String(n));

export function dayKeyOf(d: Date): DayKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dayKey(at: number = Date.now()): DayKey {
  return dayKeyOf(new Date(at));
}

function parts(key: DayKey): [number, number, number] {
  const [y, m, d] = key.split('-').map(Number);
  return [y, m, d];
}

export function startOfLocalDay(key: DayKey): number {
  const [y, m, d] = parts(key);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

/** DST-safe: the Date constructor normalises an out-of-range day-of-month. */
export function addDays(key: DayKey, n: number): DayKey {
  const [y, m, d] = parts(key);
  return dayKeyOf(new Date(y, m - 1, d + n));
}

/** Calendar days from a to b (b - a). Both sides are normalised to local noon
    first, so a 23h or 25h DST day can't round the division to the wrong int. */
export function daysBetween(a: DayKey, b: DayKey): number {
  const [ay, am, ad] = parts(a);
  const [by, bm, bd] = parts(b);
  const A = new Date(ay, am - 1, ad, 12).getTime();
  const B = new Date(by, bm - 1, bd, 12).getTime();
  return Math.round((B - A) / 86_400_000);
}

/** Clamped to ≥1s: at exactly 00:00:00.000 the raw value is 0, and a
    self-rearming setTimeout on 0 is a hot loop. */
export function msUntilNextLocalMidnight(at: number = Date.now()): number {
  return Math.max(1000, startOfLocalDay(addDays(dayKey(at), 1)) - at);
}

/** Oldest → newest, ending at today. */
export function lastNDays(n: number, at: number = Date.now()): DayKey[] {
  const today = dayKey(at);
  const out: DayKey[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(today, -i));
  return out;
}
