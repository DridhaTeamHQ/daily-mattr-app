import { bandOf, bandOfAge, bandById, groupByBand, BANDS } from '../timeBands';

const H = 3_600_000;
const NOW = Date.UTC(2026, 6, 26, 12, 0, 0);
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('bandOfAge', () => {
  it('is cumulative-exclusive at each boundary', () => {
    expect(bandOfAge(0).id).toBe('now');
    expect(bandOfAge(H - 1).id).toBe('now');
    expect(bandOfAge(H).id).toBe('h2');
    expect(bandOfAge(2 * H - 1).id).toBe('h2');
    expect(bandOfAge(2 * H).id).toBe('h10');
    expect(bandOfAge(10 * H).id).toBe('h18');
    expect(bandOfAge(18 * H).id).toBe('older');
    expect(bandOfAge(90 * H).id).toBe('older');
  });

  /* A server timestamp a few seconds ahead of the device gives a negative age.
     Left alone that compares false against every bound and lands the freshest
     story of the day in "Earlier". */
  it('treats a future timestamp as fresh, not ancient', () => {
    expect(bandOfAge(-60_000).id).toBe('now');
  });
});

describe('bandOf', () => {
  it('reads an ISO timestamp against the pinned now', () => {
    expect(bandOf(ago(30 * 60_000), NOW).id).toBe('now');
    expect(bandOf(ago(5 * H), NOW).id).toBe('h10');
  });

  /* publishedAt is `reviewed_at ?? scraped_at` with no further fallback, so it
     genuinely can be missing — and Date.parse(undefined) is NaN. */
  it('falls back to older on a missing or unparseable date', () => {
    expect(bandOf(null, NOW).id).toBe('older');
    expect(bandOf(undefined, NOW).id).toBe('older');
    expect(bandOf('not a date', NOW).id).toBe('older');
  });
});

describe('bandById', () => {
  it('round-trips every band', () => {
    for (const b of BANDS) expect(bandById(b.id)).toBe(b);
  });
});

describe('groupByBand', () => {
  const at = (t: { at: string }) => t.at;

  it('emits a group where the band changes', () => {
    const items = [{ at: ago(10 * 60_000) }, { at: ago(20 * 60_000) }, { at: ago(5 * H) }, { at: ago(6 * H) }];
    const groups = groupByBand(items, at, NOW);
    expect(groups.map((g) => g.band.id)).toEqual(['now', 'h10']);
    expect(groups[0].items).toHaveLength(2);
  });

  /* Deliberately does not sort: on the ranked surfaces re-sorting by age would
     throw the ranking away. A band that reappears later gets its own run. */
  it('does not reorder the list', () => {
    const items = [{ at: ago(5 * H) }, { at: ago(6 * H) }, { at: ago(10 * 60_000) }, { at: ago(20 * 60_000) }];
    const groups = groupByBand(items, at, NOW);
    expect(groups.flatMap((g) => g.items)).toEqual(items);
    expect(groups.map((g) => g.band.id)).toEqual(['h10', 'now']);
  });

  /* Without folding, a ranked feed whose bands alternate becomes a header
     sandwich with one row between each. */
  it('folds a run shorter than minRun into the previous group', () => {
    const items = [{ at: ago(10 * 60_000) }, { at: ago(20 * 60_000) }, { at: ago(5 * H) }];
    const groups = groupByBand(items, at, NOW, 2);
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(3);
  });

  it('keeps every item exactly once whatever the folding', () => {
    const items = Array.from({ length: 30 }, (_, i) => ({ at: ago(i * 40 * 60_000) }));
    for (const minRun of [1, 2, 3, 5]) {
      expect(groupByBand(items, at, NOW, minRun).flatMap((g) => g.items)).toEqual(items);
    }
  });

  it('handles an empty list', () => {
    expect(groupByBand([], at, NOW)).toEqual([]);
  });
});
