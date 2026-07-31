import { toSlices } from '../radar';
import { CATEGORY_NAMES } from '../categories';

/* The chart is geometry over these numbers, so the numbers are what gets
   tested — a wrong normalisation draws a plausible shape that means nothing,
   which is the worst kind of wrong for a chart. */

describe('toSlices', () => {
  it('returns one slice per category, in the desk’s order', () => {
    const out = toSlices({}, {});
    expect(out.map((s) => s.topic)).toEqual(CATEGORY_NAMES);
  });

  it('normalises each series against its own maximum', () => {
    const out = toSlices(
      { India: 10, World: 5 },
      // an order of magnitude more available, on a different category
      { Politics: 100, India: 50 },
    );
    const by = (t: string) => out.find((s) => s.topic === t)!;

    // read: India is the most-read, so it is the full radius
    expect(by('India').read).toBe(1);
    expect(by('World').read).toBe(0.5);
    // available is scaled separately — India is half of Politics, not 50/10
    expect(by('Politics').available).toBe(1);
    expect(by('India').available).toBe(0.5);
  });

  it('gives an untouched category zero rather than NaN', () => {
    const out = toSlices({ India: 3 }, { India: 3 });
    const sports = out.find((s) => s.topic === 'Sports')!;
    expect(sports.read).toBe(0);
    expect(sports.available).toBe(0);
  });

  /* An empty history divides by zero unless the maximum is floored. A NaN
     reaches the SVG as `points="NaN,NaN …"`, which renders nothing at all —
     a blank card with no error anywhere. */
  it('survives a reader who has read nothing', () => {
    const out = toSlices({}, {});
    for (const s of out) {
      expect(Number.isFinite(s.read)).toBe(true);
      expect(Number.isFinite(s.available)).toBe(true);
      expect(s.read).toBe(0);
    }
  });

  it('ignores categories the desk does not publish', () => {
    const out = toSlices({ Cryptozoology: 99, India: 1 }, {});
    expect(out.find((s) => s.topic === 'India')!.read).toBe(1);
    expect(out).toHaveLength(CATEGORY_NAMES.length);
  });
});
