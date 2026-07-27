import { dayKey, dayKeyOf, addDays, daysBetween, lastNDays, startOfLocalDay, msUntilNextLocalMidnight } from '../day';

/* These all exist because the streak used to bucket days as
   `Math.floor(at / 86400000)`. That is UTC, so in IST the day rolled over at
   05:30 local and reading at 2am counted toward yesterday. Every assertion
   below is about the local calendar, never about elapsed milliseconds. */

describe('day keys', () => {
  it('formats from local calendar fields, zero-padded', () => {
    expect(dayKeyOf(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(dayKeyOf(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31');
  });

  it('reads local midnight, not UTC midnight', () => {
    // 23:30 local is still today whatever the offset does to the UTC date
    const late = new Date(2026, 6, 26, 23, 30).getTime();
    expect(dayKey(late)).toBe('2026-07-26');
    const early = new Date(2026, 6, 26, 0, 30).getTime();
    expect(dayKey(early)).toBe('2026-07-26');
  });

  it('round-trips through startOfLocalDay', () => {
    for (const k of ['2026-01-01', '2026-03-29', '2026-07-26', '2026-12-31']) {
      expect(dayKey(startOfLocalDay(k))).toBe(k);
    }
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
  });

  /* A DST day is 23 or 25 hours long. Stepping by 86_400_000ms lands on the
     wrong calendar date across the transition; stepping by date fields does
     not. Both EU and US spring-forward dates are covered so the test means
     something wherever it runs. */
  it('steps one calendar day across DST transitions', () => {
    for (const k of ['2026-03-28', '2026-03-29', '2026-10-24', '2026-10-25', '2026-03-07', '2026-11-01']) {
      const next = addDays(k, 1);
      expect(daysBetween(k, next)).toBe(1);
      expect(addDays(next, -1)).toBe(k);
    }
  });
});

describe('daysBetween', () => {
  it('counts calendar days in both directions', () => {
    expect(daysBetween('2026-07-26', '2026-07-26')).toBe(0);
    expect(daysBetween('2026-07-26', '2026-07-27')).toBe(1);
    expect(daysBetween('2026-07-27', '2026-07-26')).toBe(-1);
    expect(daysBetween('2026-01-01', '2026-12-31')).toBe(364);
  });

  it('is exact across a DST boundary', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
  });
});

describe('lastNDays', () => {
  it('runs oldest to newest and ends today', () => {
    const at = new Date(2026, 6, 26, 12).getTime();
    expect(lastNDays(7, at)).toEqual([
      '2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25', '2026-07-26',
    ]);
  });
});

describe('msUntilNextLocalMidnight', () => {
  it('never returns zero — a self-rearming timer on 0 is a hot loop', () => {
    const midnight = startOfLocalDay('2026-07-26');
    expect(msUntilNextLocalMidnight(midnight)).toBeGreaterThanOrEqual(1000);
  });

  it('lands on the next local midnight', () => {
    const at = new Date(2026, 6, 26, 15, 0).getTime();
    expect(dayKey(at + msUntilNextLocalMidnight(at))).toBe('2026-07-27');
  });
});
