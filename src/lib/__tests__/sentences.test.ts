import { sentencesOf, pullQuoteFrom, SENTENCE_BREAK } from '../sentences';

describe('sentencesOf', () => {
  it('splits on a terminator followed by an opening character', () => {
    const out = sentencesOf(
      'The minister resigned on Sunday evening. Protesters had gathered for a week. The government accepted the demands.',
    );
    expect(out).toHaveLength(3);
    expect(out[0]).toBe('The minister resigned on Sunday evening.');
    expect(out[2]).toBe('The government accepted the demands.');
  });

  /* The two cases the lookahead exists for. Both were splitting mid-phrase
     with a naive /[.!?]\s+/ and producing fragments like "The U." and "S." */
  it('keeps abbreviations whole', () => {
    const out = sentencesOf('Trade with the U.S. said the ministry, remains the priority for exporters this year.');
    expect(out).toHaveLength(1);
  });

  it('keeps currency abbreviations whole', () => {
    const out = sentencesOf('Honda priced the SUV at Rs. 47.99 lakh and began deliveries across eleven cities.');
    expect(out).toHaveLength(1);
  });

  it('drops fragments below the minimum length', () => {
    const out = sentencesOf('Yes. This one is long enough to survive the length filter applied here.');
    expect(out).toEqual(['This one is long enough to survive the length filter applied here.']);
  });

  it('is safe on empty and missing input', () => {
    expect(sentencesOf('')).toEqual([]);
    expect(sentencesOf(null)).toEqual([]);
    expect(sentencesOf(undefined)).toEqual([]);
  });

  /* Hermes is the runtime. A lookbehind assertion works in every browser and
     used to throw on device, which is how this codebase learned the rule —
     so the constraint is asserted rather than merely commented. */
  it('uses no lookbehind assertions', () => {
    expect(SENTENCE_BREAK.source).not.toMatch(/\(\?<[=!]/);
  });
});

describe('pullQuoteFrom', () => {
  const summary =
    'Rajnath Singh warned Pakistan during a Kargil Vijay Diwas event in Delhi. He said the response to any aggression would be beyond imagination and ruled out talks. Officials confirmed the remarks.';

  it('prefers a well-sized tl;dr bullet over the summary', () => {
    const q = pullQuoteFrom(['The minister ruled out dialogue with Pakistan except on Kashmir.'], summary);
    expect(q).toBe('The minister ruled out dialogue with Pakistan except on Kashmir.');
  });

  it('falls back to the summary when there is no tl;dr — the ~88% case', () => {
    const q = pullQuoteFrom(null, summary);
    expect(q).not.toBeNull();
    expect(summary).toContain(q!);
  });

  it('picks the longest sentence that still fits the band', () => {
    const q = pullQuoteFrom(null, summary);
    expect(q!.length).toBeGreaterThanOrEqual(60);
    expect(q!.length).toBeLessThanOrEqual(165);
  });

  it('skips a bullet that is too long to set as a quote', () => {
    const tooLong = 'x'.repeat(200);
    const q = pullQuoteFrom([tooLong], summary);
    expect(q).not.toBe(tooLong);
  });

  /* A pull quote is optional furniture. Returning something bad — a fragment,
     or a 300-character paragraph — is worse than returning nothing, because
     the body reads perfectly well without one. */
  it('returns null rather than settling', () => {
    expect(pullQuoteFrom(null, 'Too short.')).toBeNull();
    expect(pullQuoteFrom(null, null)).toBeNull();
    expect(pullQuoteFrom([], 'x'.repeat(400))).toBeNull();
  });
});
