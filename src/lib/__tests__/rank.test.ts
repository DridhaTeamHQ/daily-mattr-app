import {
  DROP_DISLIKED,
  DROP_READ,
  LIFT_FAVOURITE,
  NO_SIGNALS,
  personalise,
  type ReadSignals,
} from '../rank';
import { article, articles } from './helpers';

const signals = (p: Partial<Record<keyof ReadSignals, string[]>>): ReadSignals => ({
  readIds: new Set(p.readIds ?? []),
  dislikedIds: new Set(p.dislikedIds ?? []),
  favouriteTopics: new Set(p.favouriteTopics ?? []),
  savedTopics: new Set(p.savedTopics ?? []),
});

const ids = (as: { id: string }[]) => as.map((a) => a.id);

/** n stories in the desk's order, a0 first. */
const desk = (n: number, topic = 'News') =>
  articles(n, (i) => ({ id: `a${i}`, topic }));

describe('personalise', () => {
  /* The invariant the whole thing rests on. A ranking pass that can drop a
     story is a ranking pass that can un-publish one, and the desk would have
     no way of knowing. */
  it('is always a permutation — nothing added, nothing lost', () => {
    const list = desk(12);
    const out = personalise(
      list,
      signals({ readIds: ['a3', 'a7'], dislikedIds: ['a1'], favouriteTopics: ['News'] }),
    );
    expect(out).toHaveLength(list.length);
    expect(ids(out).slice().sort()).toEqual(ids(list).slice().sort());
  });

  it('leaves the order alone when the reader has done nothing yet', () => {
    const list = desk(8);
    expect(ids(personalise(list, NO_SIGNALS))).toEqual(ids(list));
  });

  /* A lead story is an editorial decision. One that moves because of what
     somebody read last week is not a lead. */
  it('keeps featured stories first and in the desk’s order', () => {
    const list = [
      article({ id: 'f0', featured: true, topic: 'Sports' }),
      article({ id: 'f1', featured: true, topic: 'Sports' }),
      ...desk(6, 'Business'),
    ];
    const out = personalise(
      list,
      // every signal pushing against the featured pair
      signals({
        readIds: ['f0', 'f1'],
        dislikedIds: ['f0', 'f1'],
        favouriteTopics: ['Business'],
      }),
    );
    expect(ids(out).slice(0, 2)).toEqual(['f0', 'f1']);
  });

  it('sinks a story the reader already opened below one they have not', () => {
    const list = desk(6);
    const out = ids(personalise(list, signals({ readIds: ['a0'] })));
    expect(out.indexOf('a0')).toBeGreaterThan(out.indexOf('a1'));
  });

  it('sinks a disliked story below one merely read', () => {
    const list = desk(20);
    const out = ids(
      personalise(list, signals({ readIds: ['a0'], dislikedIds: ['a1'] })),
    );
    expect(out.indexOf('a1')).toBeGreaterThan(out.indexOf('a0'));
  });

  it('lifts a favourite category above neighbours it started behind', () => {
    const list = [
      ...articles(5, (i) => ({ id: `n${i}`, topic: 'News' })),
      article({ id: 'sport', topic: 'Sports' }),
    ];
    const out = ids(personalise(list, signals({ favouriteTopics: ['Sports'] })));
    expect(out.indexOf('sport')).toBeLessThan(out.indexOf('n4'));
  });

  /* The bound is the point. Without it this is just a sort by affinity, which
     is what the cutover removed. */
  it('cannot lift a favourite past the whole feed', () => {
    const list = [
      ...articles(30, (i) => ({ id: `n${i}`, topic: 'News' })),
      article({ id: 'late', topic: 'Sports' }),
    ];
    const out = ids(personalise(list, signals({ favouriteTopics: ['Sports'] })));
    // it climbs, but nowhere near the top of a 31-story feed
    expect(out.indexOf('late')).toBeGreaterThan(30 - LIFT_FAVOURITE - 2);
  });

  it('cannot bury a disliked story at the end of the feed', () => {
    const list = desk(40);
    const out = ids(personalise(list, signals({ dislikedIds: ['a0'] })));
    expect(out.indexOf('a0')).toBeLessThan(DROP_DISLIKED + DROP_READ);
  });

  /* Two refetches of the same feed must agree, or the list reshuffles under a
     thumb mid-scroll — the exact failure the band logic warns about. */
  it('is deterministic for the same input', () => {
    const list = desk(15);
    const s = signals({ readIds: ['a2', 'a9'], favouriteTopics: ['News'] });
    expect(ids(personalise(list, s))).toEqual(ids(personalise(list, s)));
  });

  it('handles the empty and single-story cases', () => {
    expect(personalise([], NO_SIGNALS)).toEqual([]);
    const one = [article({ id: 'only' })];
    expect(ids(personalise(one, signals({ dislikedIds: ['only'] })))).toEqual(['only']);
  });
});
