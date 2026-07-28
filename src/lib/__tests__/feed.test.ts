import { composeFeed, featuredFirst, kindOf, pixPoints } from '../feed';
import { article, articles } from './helpers';

/** the deck as a shape: '.' article, 'P' picture story, 'V' video */
const shape = (as: ReturnType<typeof articles>) =>
  composeFeed(as)
    .map((f) => (f.kind === 'pix' ? 'P' : f.kind === 'motion' ? 'V' : '.'))
    .join('');

const RICH = {
  summary:
    'The minister resigned on Sunday evening after a week of protests. Demonstrators had gathered at Jantar Mantar since the exam results. The government accepted the compensation demand in full.',
};

/** n stories, m of them pix and k of them video — the shape the CMS produces. */
function mixed(rows: number, pix: number, video: number) {
  return [
    ...articles(rows, (i) => ({ id: `r${i}`, ...RICH })),
    ...articles(pix, (i) => ({ id: `p${i}`, format: 'pix' as const, ...RICH })),
    ...articles(video, (i) => ({ id: `v${i}`, format: 'qix' as const, ...RICH })),
  ];
}

describe('kindOf', () => {
  /* The format is the desk's, and this is the only place the app reads it.
     It used to be inferred — a photo plus three bullets meant "picture story" —
     which is how readers came to see pix nobody had made. */
  it('reads the published format rather than inferring one', () => {
    expect(kindOf(article({ format: 'pix' }))).toBe('pix');
    expect(kindOf(article({ format: 'qix' }))).toBe('motion');
    expect(kindOf(article({ format: 'article' }))).toBe('row');
  });

  it('does not promote a plain story that happens to have a photo and points', () => {
    expect(kindOf(article(RICH))).toBe('row');
  });
});

describe('composeFeed', () => {
  it('lays down the 3-articles / pix / 3-articles / video beat', () => {
    expect(shape(mixed(18, 3, 3))).toBe('...P...V...P...V...P...V');
  });

  it('never repeats an article', () => {
    const out = composeFeed(mixed(30, 5, 5));
    expect(new Set(out.map((f) => f.article.id)).size).toBe(40);
  });

  it('emits every article exactly once', () => {
    expect(composeFeed(mixed(30, 5, 5))).toHaveLength(40);
  });

  it('is deterministic', () => {
    const input = mixed(20, 4, 4);
    expect(shape(input)).toBe(shape(input));
  });

  it('holds the articles in the order the desk approved them', () => {
    const out = composeFeed(mixed(12, 2, 2));
    const rowIds = out.filter((f) => f.kind === 'row').map((f) => f.article.id);
    expect(rowIds).toEqual(Array.from({ length: 12 }, (_, i) => `r${i}`));
  });

  /* The reason the lookahead bound had to go. The CMS hands over every approved
     article first and then its pix and qix, so a bounded search would never see
     past the articles — and the feed would read as a dozen headlines followed
     by every picture story in a row. */
  it('reaches past the articles for a format waiting at the end of the queue', () => {
    expect(shape(mixed(12, 2, 0))[3]).toBe('P');
  });

  it('spends the slot on a plain story when no card of that format is left', () => {
    expect(shape(mixed(16, 0, 0))).toBe('................');
  });

  it('fills the video slot when there are videos but no pix', () => {
    const s = shape(mixed(14, 0, 2));
    expect(s).toContain('V');
    expect(s).not.toContain('P');
  });

  it('renders a format card as itself even when the slot wanted something else', () => {
    // one pix, no articles: it must still render as a picture story
    expect(shape(mixed(0, 1, 0))).toBe('P');
  });

  it('ignores rows with no id', () => {
    const as = [...articles(4, () => RICH), { ...article(), id: '' }];
    expect(composeFeed(as as any)).toHaveLength(4);
  });

  it('handles an empty deck', () => {
    expect(composeFeed([])).toEqual([]);
  });
});

describe('featuredFirst', () => {
  it('leads with what the desk flagged', () => {
    const as = articles(4, (i) => ({ id: `a${i}`, featured: i === 2 }));
    expect(featuredFirst(as).map((a) => a.id)).toEqual(['a2', 'a0', 'a1', 'a3']);
  });

  it('keeps two featured stories in approval order relative to each other', () => {
    const as = articles(4, (i) => ({ id: `a${i}`, featured: i === 1 || i === 3 }));
    expect(featuredFirst(as).map((a) => a.id)).toEqual(['a1', 'a3', 'a0', 'a2']);
  });

  /* Referential identity matters: this runs inside the feed query, and a fresh
     array on every call would re-render every mounted card. */
  it('returns the same array when nothing is featured', () => {
    const as = articles(3);
    expect(featuredFirst(as)).toBe(as);
  });
});

describe('pixPoints', () => {
  it('prefers three tl;dr bullets — where a CMS pix keeps its key points', () => {
    const a = article({ modes: { eli5: null, tldr: ['One.', 'Two.', 'Three.', 'Four.'], keyNumbers: null, deepDive: null } });
    expect(pixPoints(a)).toEqual(['One.', 'Two.', 'Three.']);
  });

  it('falls back to the summary when the desk left the points empty', () => {
    expect(pixPoints(article(RICH))).toHaveLength(3);
  });

  it('tops up a partial tl;dr from the summary without repeating it', () => {
    const a = article({
      ...RICH,
      modes: { eli5: null, tldr: ['The minister resigned on Sunday evening after a week of protests.'], keyNumbers: null, deepDive: null },
    });
    const out = pixPoints(a);
    expect(out).toHaveLength(3);
    expect(new Set(out).size).toBe(3);
  });

  it('returns fewer than three when the summary cannot supply them', () => {
    expect(pixPoints(article({ summary: 'Short.' })).length).toBeLessThan(3);
  });
});
