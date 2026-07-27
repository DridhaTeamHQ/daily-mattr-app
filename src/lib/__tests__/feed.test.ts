import { composeFeed, pixPoints, isPixEligible, isMotionEligible } from '../feed';
import { article, articles } from './helpers';

/** the deck as a shape: '.' article, 'P' picture story, 'V' motion */
const shape = (as: ReturnType<typeof articles>) =>
  composeFeed(as)
    .map((f) => (f.kind === 'pix' ? 'P' : f.kind === 'motion' ? 'V' : '.'))
    .join('');

const RICH = {
  summary:
    'The minister resigned on Sunday evening after a week of protests. Demonstrators had gathered at Jantar Mantar since the exam results. The government accepted the compensation demand in full.',
};

describe('composeFeed', () => {
  it('lays down the 3-articles / pix / 3-articles / motion beat', () => {
    expect(shape(articles(24, () => RICH))).toBe('...P...V...P...V...P...V');
  });

  it('never repeats an article', () => {
    const out = composeFeed(articles(40, () => RICH));
    expect(new Set(out.map((f) => f.article.id)).size).toBe(40);
  });

  it('emits every article exactly once', () => {
    expect(composeFeed(articles(40, () => RICH))).toHaveLength(40);
  });

  it('is deterministic', () => {
    const input = articles(40, () => RICH);
    expect(shape(input)).toBe(shape(input));
  });

  /* The slot degrades to a plain row rather than stalling the cycle or
     shipping a card with nothing to render. Without a photo nothing can carry
     either format, so the whole deck is articles. */
  it('degrades to a plain row when nothing nearby can carry the format', () => {
    expect(shape(articles(16, () => ({ imageUrl: null, ...RICH })))).toBe('................');
  });

  it('still fills the motion slot when only photos are available', () => {
    // one-sentence summaries: motion needs a photo, pix needs three points
    const thin = articles(16, () => ({ summary: 'Short.' }));
    const s = shape(thin);
    expect(s).toContain('V');
    expect(s).not.toContain('P');
  });

  it('promotes a story from within the lookahead window to fill a slot', () => {
    // only index 5 can carry a picture story; slot 3 should reach for it
    const as = articles(9, (i) => (i === 5 ? RICH : { summary: 'Short.' }));
    expect(shape(as)[3]).toBe('P');
  });

  it('does not reach past the lookahead window', () => {
    // the only eligible story is far away — slot 3 must not scramble the order
    const as = articles(20, (i) => (i === 18 ? RICH : { summary: 'Short.' }));
    expect(shape(as)[3]).toBe('.');
  });

  it('ignores rows with no id', () => {
    const as = [...articles(4, () => RICH), { ...article(), id: '' }];
    expect(composeFeed(as as any)).toHaveLength(4);
  });

  it('handles an empty deck', () => {
    expect(composeFeed([])).toEqual([]);
  });
});

describe('pixPoints', () => {
  it('prefers three tl;dr bullets when the summariser has run', () => {
    const a = article({ modes: { eli5: null, tldr: ['One.', 'Two.', 'Three.', 'Four.'], keyNumbers: null, deepDive: null } });
    expect(pixPoints(a)).toEqual(['One.', 'Two.', 'Three.']);
  });

  /* The bug this function was written for: gating on tl;dr alone starved the
     Pix slot, because only ~12% of rows carry `versions` at all. */
  it('falls back to the summary when there is no tl;dr', () => {
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

describe('eligibility', () => {
  it('requires a photo and three showable points for a picture story', () => {
    expect(isPixEligible(article(RICH))).toBe(true);
    expect(isPixEligible(article({ ...RICH, imageUrl: null }))).toBe(false);
    expect(isPixEligible(article({ summary: 'Short.' }))).toBe(false);
  });

  it('requires only a photo for a motion card', () => {
    expect(isMotionEligible(article())).toBe(true);
    expect(isMotionEligible(article({ imageUrl: null }))).toBe(false);
  });

  /* The gate and the renderer must agree. If isPixEligible could pass a story
     that pixPoints then cannot fill, the deck would promote it into a Pix slot
     and render an empty key-points slide. */
  it('never passes a story that pixPoints cannot fill', () => {
    const cases = [article(RICH), article({ summary: 'Short.' }), article({ ...RICH, imageUrl: null }), article({ summary: '' })];
    for (const a of cases) {
      if (isPixEligible(a)) expect(pixPoints(a)).toHaveLength(3);
    }
  });
});
