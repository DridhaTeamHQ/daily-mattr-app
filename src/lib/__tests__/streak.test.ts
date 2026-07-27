import { computeStreak, qualifiedDays, STREAK_MIN_READS, MAX_FREEZES } from '../streak';

const counts = (days: string[], n = STREAK_MIN_READS) => Object.fromEntries(days.map((d) => [d, n]));
const run = (start: string, n: number) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() - i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

describe('qualifiedDays', () => {
  it('needs the minimum number of reads', () => {
    const q = qualifiedDays({ counts: { '2026-07-26': STREAK_MIN_READS - 1, '2026-07-25': STREAK_MIN_READS }, seededDays: [] });
    expect(q.has('2026-07-26')).toBe(false);
    expect(q.has('2026-07-25')).toBe(true);
  });

  it('accepts seeded days on presence alone', () => {
    // migrated from the old capped history array, where per-day counts are lost
    const q = qualifiedDays({ counts: {}, seededDays: ['2026-07-20'] });
    expect(q.has('2026-07-20')).toBe(true);
  });
});

describe('computeStreak', () => {
  it('counts an unbroken run ending today', () => {
    const days = run('2026-07-26', 5);
    expect(computeStreak({ counts: counts(days), seededDays: [] }, '2026-07-26').current).toBe(5);
  });

  /* Today is still in progress. Treating an unfinished day as a miss would
     show 0 all morning until the third story, which is exactly when a reader
     is most likely to think the streak has already been lost. */
  it('does not break when today has not qualified yet', () => {
    const days = run('2026-07-25', 4);
    expect(computeStreak({ counts: counts(days), seededDays: [] }, '2026-07-26').current).toBe(4);
  });

  it('is zero with no history', () => {
    const r = computeStreak({ counts: {}, seededDays: [] }, '2026-07-26');
    expect(r.current).toBe(0);
    expect(r.lastQualifiedDay).toBeNull();
  });

  it('reports the newest qualified day', () => {
    const r = computeStreak({ counts: counts(['2026-07-20', '2026-07-24', '2026-07-22']), seededDays: [] }, '2026-07-26');
    expect(r.lastQualifiedDay).toBe('2026-07-24');
  });

  describe('freezes', () => {
    /* Budget is earned: one freeze per seven qualified days, capped. A short
       history has none, so a gap simply ends the run. */
    it('are not granted before enough days are banked', () => {
      const days = [...run('2026-07-26', 3), ...run('2026-07-22', 2)]; // gap at 07-23
      expect(computeStreak({ counts: counts(days), seededDays: [] }, '2026-07-26').current).toBe(3);
    });

    it('bridge a single missed day once the budget is earned', () => {
      // 07-26..07-24 qualified, 07-23 missed, 07-22..07-14 qualified => 9 banked
      const days = [...run('2026-07-26', 3), ...run('2026-07-22', 9)];
      const r = computeStreak({ counts: counts(days), seededDays: [] }, '2026-07-26');
      expect(r.freezesUsedOn).toEqual(['2026-07-23']);
      expect(r.current).toBe(12);
    });

    it('never bridge two misses in a row, however much budget remains', () => {
      const days = [...run('2026-07-26', 3), ...run('2026-07-21', 20)]; // 07-23 and 07-22 both missed
      const r = computeStreak({ counts: counts(days), seededDays: [] }, '2026-07-26');
      expect(r.current).toBe(3);
      expect(r.freezesUsedOn).toEqual([]);
    });

    it('are capped', () => {
      // every other day qualified, so the walk hits a bridgeable gap each step
      // and would run forever if the cap were not enforced
      const alternating = run('2026-07-26', 60).filter((_, i) => i % 2 === 0);
      const r = computeStreak({ counts: counts(alternating), seededDays: [] }, '2026-07-26');
      expect(r.freezesUsedOn.length).toBeLessThanOrEqual(MAX_FREEZES);
      expect(r.freezesRemaining).toBe(MAX_FREEZES - r.freezesUsedOn.length);
    });

    /* A freeze may only bridge to a day that actually counts — spending one to
       extend into nothing would inflate the streak off the end of the history. */
    it('are not spent extending into nothing', () => {
      const days = run('2026-07-26', 10);
      const oldest = days[days.length - 1];
      const r = computeStreak({ counts: counts(days), seededDays: [] }, '2026-07-26');
      expect(r.current).toBe(10);
      expect(r.freezesUsedOn).not.toContain(oldest);
    });
  });

  it('terminates on a long unbroken history', () => {
    const days = run('2026-07-26', 500);
    const r = computeStreak({ counts: counts(days), seededDays: [] }, '2026-07-26');
    expect(r.current).toBeGreaterThan(0);
    expect(r.current).toBeLessThanOrEqual(500);
  });
});
