import {
  HALF_LIFE_HOURS,
  MAX_TOPIC_RUN,
  NO_SIGNALS,
  breakUpRuns,
  freshness,
  personalise,
  scoreOf,
  type ReadSignals,
} from '../rank';
import { article, articles } from './helpers';

const NOW = Date.parse('2026-07-31T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

const signals = (p: Partial<Record<keyof ReadSignals, string[]>>): ReadSignals => ({
  readIds: new Set(p.readIds ?? []),
  dislikedIds: new Set(p.dislikedIds ?? []),
  favouriteTopics: new Set(p.favouriteTopics ?? []),
  savedTopics: new Set(p.savedTopics ?? []),
});

const ids = (as: { id: string }[]) => as.map((a) => a.id);

describe('freshness', () => {
  it('is 1 at publication and halves each half-life', () => {
    expect(freshness(hoursAgo(0), NOW)).toBeCloseTo(1, 5);
    expect(freshness(hoursAgo(HALF_LIFE_HOURS), NOW)).toBeCloseTo(0.5, 5);
    expect(freshness(hoursAgo(HALF_LIFE_HOURS * 2), NOW)).toBeCloseTo(0.25, 5);
  });

  /* A device clock a few minutes fast would otherwise hand a story a freshness
     above 1 and pin it over everything genuinely new. */
  it('does not reward a timestamp in the future', () => {
    expect(freshness(new Date(NOW + 3_600_000).toISOString(), NOW)).toBeLessThanOrEqual(1);
  });

  it('treats an unparseable date as neither fresh nor stale', () => {
    expect(freshness('not a date', NOW)).toBe(0.5);
  });
});

describe('personalise', () => {
  /* The bug this whole model exists to fix: approval order ascending put the
     oldest approved story at the top of a news app. */
  it('leads with the newest story, not the oldest', () => {
    const list = [
      article({ id: 'old', publishedAt: hoursAgo(30) }),
      article({ id: 'mid', publishedAt: hoursAgo(10) }),
      article({ id: 'new', publishedAt: hoursAgo(1) }),
    ];
    expect(ids(personalise(list, NO_SIGNALS, NOW))[0]).toBe('new');
  });

  it('is always a permutation — nothing added, nothing lost', () => {
    const list = articles(14, (i) => ({ id: `a${i}`, publishedAt: hoursAgo(i * 3) }));
    const out = personalise(
      list,
      signals({ readIds: ['a2'], dislikedIds: ['a5'], favouriteTopics: ['News'] }),
      NOW,
    );
    expect(out).toHaveLength(list.length);
    expect(ids(out).slice().sort()).toEqual(ids(list).slice().sort());
  });

  it('keeps featured stories at the front whatever they score', () => {
    const list = [
      article({ id: 'fresh', publishedAt: hoursAgo(0) }),
      article({ id: 'lead', publishedAt: hoursAgo(40), featured: true }),
    ];
    expect(ids(personalise(list, NO_SIGNALS, NOW))[0]).toBe('lead');
  });

  it('sinks a story already read below an equally fresh one', () => {
    const list = [
      article({ id: 'read', publishedAt: hoursAgo(2) }),
      article({ id: 'unread', publishedAt: hoursAgo(2) }),
    ];
    const out = ids(personalise(list, signals({ readIds: ['read'] }), NOW));
    expect(out.indexOf('read')).toBeGreaterThan(out.indexOf('unread'));
  });

  it('sinks a disliked story below one merely read', () => {
    const list = [
      article({ id: 'read', publishedAt: hoursAgo(2) }),
      article({ id: 'nope', publishedAt: hoursAgo(2) }),
    ];
    const out = ids(
      personalise(list, signals({ readIds: ['read'], dislikedIds: ['nope'] }), NOW),
    );
    expect(out.indexOf('nope')).toBeGreaterThan(out.indexOf('read'));
  });

  it('lifts a favourite category over an equally fresh one', () => {
    const list = [
      article({ id: 'other', topic: 'Business', publishedAt: hoursAgo(3) }),
      article({ id: 'mine', topic: 'Sports', publishedAt: hoursAgo(3) }),
    ];
    const out = ids(personalise(list, signals({ favouriteTopics: ['Sports'] }), NOW));
    expect(out[0]).toBe('mine');
  });

  /* Interest must not outrank the news. A reader who likes Sports should still
     be told about this morning before yesterday's match report. */
  it('does not let a favourite category beat a much fresher story', () => {
    const list = [
      article({ id: 'breaking', topic: 'World', publishedAt: hoursAgo(0) }),
      article({ id: 'liked', topic: 'Sports', publishedAt: hoursAgo(24) }),
    ];
    const out = ids(personalise(list, signals({ favouriteTopics: ['Sports'] }), NOW));
    expect(out[0]).toBe('breaking');
  });

  it('is deterministic for the same inputs', () => {
    const list = articles(10, (i) => ({ id: `a${i}`, publishedAt: hoursAgo(i) }));
    const s = signals({ favouriteTopics: ['News'] });
    expect(ids(personalise(list, s, NOW))).toEqual(ids(personalise(list, s, NOW)));
  });

  it('handles the empty and single-story cases', () => {
    expect(personalise([], NO_SIGNALS, NOW)).toEqual([]);
    const one = [article({ id: 'only' })];
    expect(ids(personalise(one, signals({ dislikedIds: ['only'] }), NOW))).toEqual(['only']);
  });
});

describe('breakUpRuns', () => {
  it('does not let one category run past the limit', () => {
    const list = [
      ...articles(5, (i) => ({ id: `p${i}`, topic: 'Politics' })),
      ...articles(3, (i) => ({ id: `s${i}`, topic: 'Sports' })),
    ];
    const out = breakUpRuns(list);
    let run = 1;
    for (let i = 1; i < out.length; i++) {
      run = out[i].topic === out[i - 1].topic ? run + 1 : 1;
      expect(run).toBeLessThanOrEqual(MAX_TOPIC_RUN);
    }
  });

  it('holds stories back rather than dropping them', () => {
    const list = [
      ...articles(6, (i) => ({ id: `p${i}`, topic: 'Politics' })),
      ...articles(2, (i) => ({ id: `w${i}`, topic: 'World' })),
    ];
    const out = breakUpRuns(list);
    expect(ids(out).slice().sort()).toEqual(ids(list).slice().sort());
  });

  /* A feed of one category cannot satisfy the rule. It must emit them anyway
     rather than spinning looking for a topic that does not exist. */
  it('terminates when every story shares a category', () => {
    const list = articles(6, (i) => ({ id: `p${i}`, topic: 'Politics' }));
    const out = breakUpRuns(list);
    expect(ids(out)).toEqual(ids(list));
  });
});

describe('scoreOf', () => {
  it('ranks a fresh story above a stale one, all else equal', () => {
    const fresh = article({ id: 'f', publishedAt: hoursAgo(1) });
    const stale = article({ id: 's', publishedAt: hoursAgo(48) });
    expect(scoreOf(fresh, NO_SIGNALS, NOW)).toBeGreaterThan(scoreOf(stale, NO_SIGNALS, NOW));
  });
});
