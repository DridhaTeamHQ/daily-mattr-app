/* The fact-check verdict, made legible.

   `fact_label` has been fetched, mapped and stored since the beginning, and
   the article page rendered it as a bare blue shield with no text — the same
   blue shield for every value. Measured over 1000 published rows the column
   carries four distinct verdicts:

     verified        890
     mostly-factual   82
     mixed            16
     unverified       12

   So roughly one story in nine is something other than verified, and every one
   of them was showing the reader the identical reassuring mark. A shield that
   means nothing is worse than no shield: it reads as an endorsement the data
   does not support. Icon, colour and words now all move with the verdict.

   Unknown values fall through to null rather than a default badge — a verdict
   this file has not seen is not one it should be interpreting. */

export type FactTone = 'good' | 'ok' | 'warn' | 'unknown';

export type FactBadge = {
  label: string;
  icon: string;
  tone: FactTone;
};

const BADGES: Record<string, FactBadge> = {
  verified: { label: 'Verified', icon: 'shield-check', tone: 'good' },
  'mostly-factual': { label: 'Mostly factual', icon: 'shield-check', tone: 'ok' },
  mixed: { label: 'Mixed claims', icon: 'shield-alert', tone: 'warn' },
  unverified: { label: 'Unverified', icon: 'shield-x', tone: 'unknown' },
};

export function factBadge(label: string | null | undefined): FactBadge | null {
  if (!label) return null;
  return BADGES[label.trim().toLowerCase()] ?? null;
}
