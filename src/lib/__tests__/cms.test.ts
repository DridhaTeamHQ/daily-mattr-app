import { applyOverride, isCmsId, bareCmsId, CMS_PREFIX, type Selection } from '../cms';
import { article } from './helpers';

const sel = (over: Partial<Selection> = {}): Selection => ({
  articleId: 'a1',
  isFeatured: false,
  approvedAt: '2026-07-26T10:00:00.000Z',
  titleOverride: null,
  summaryOverride: null,
  imageOverride: null,
  ...over,
});

/* The resolution order is the thing most likely to be got wrong, and when it is
   wrong nothing breaks — an editor's correction just never reaches a reader.
   So it gets tested rather than trusted. */
describe('editorial overrides', () => {
  it("lets the desk's title win over the pipeline's", () => {
    const out = applyOverride(article({ title: 'Raw scrape headline' }), sel({ titleOverride: 'Desk headline' }));
    expect(out.title).toBe('Desk headline');
  });

  it('falls through to the pipeline where no override was written', () => {
    const out = applyOverride(article({ title: 'Pipeline headline' }), sel());
    expect(out.title).toBe('Pipeline headline');
  });

  it('treats a blank override as no override, not as an empty headline', () => {
    const out = applyOverride(
      article({ title: 'Pipeline headline', summary: 'Pipeline summary.' }),
      sel({ titleOverride: '   ', summaryOverride: '' }),
    );
    expect(out.title).toBe('Pipeline headline');
    expect(out.summary).toBe('Pipeline summary.');
  });

  it('overrides each field independently', () => {
    const out = applyOverride(
      article({ title: 'T', summary: 'S', imageUrl: 'https://img/1.jpg' }),
      sel({ summaryOverride: 'Corrected summary.' }),
    );
    expect(out.title).toBe('T');
    expect(out.summary).toBe('Corrected summary.');
    expect(out.imageUrl).toBe('https://img/1.jpg');
  });

  it('returns the same object when nothing changed, so lists stay referentially stable', () => {
    const a = article();
    expect(applyOverride(a, sel())).toBe(a);
    expect(applyOverride(a, undefined)).toBe(a);
  });

  /* The hero slot lives on the selection, not on the pipeline row, so it can
     only reach the reader through here. */
  it("carries the desk's featured flag onto the story", () => {
    expect(applyOverride(article(), sel({ isFeatured: true })).featured).toBe(true);
  });

  it('clears the flag again when the desk unfeatures a story', () => {
    const a = article({ featured: true });
    expect(applyOverride(a, sel({ isFeatured: false })).featured).toBe(false);
  });
});

describe('cms ids', () => {
  it('round-trips, and never claims a pipeline id', () => {
    const id = CMS_PREFIX + '0b6a1f3e-1111-4222-8333-444455556666';
    expect(isCmsId(id)).toBe(true);
    expect(bareCmsId(id)).toBe('0b6a1f3e-1111-4222-8333-444455556666');
    expect(isCmsId('0b6a1f3e-1111-4222-8333-444455556666')).toBe(false);
  });
});

