/* The app's categories are the desk's categories.
 *
 * There used to be thirteen, inherited from the scraper's own taxonomy —
 * Automobile, Real Estate, Markets & Startups, Corporate Case, Health &
 * Wellness, Explained. The CMS has eight, and they are the ones an editor can
 * actually file a story under, so six of the thirteen could never hold
 * anything: a reader spinning the dial to Automobile got an empty deck, every
 * time, by construction.
 *
 * This module is the single place the eight are written down. The dial, the
 * home tabs, the artwork and the colour all read from here, so adding a ninth
 * is one edit in the CMS and one here rather than a hunt through the UI.
 *
 * Mirrors `categories` in DB B (slug, name, sort_order, is_active). It is not
 * fetched at runtime on purpose: the list changes about never, every entry
 * needs artwork and a colour ramp shipped in the bundle beside it, and a
 * category the app has no identity for would render as a grey hole. When the
 * desk adds one, it ships with the app.
 */

export type Category = {
  /** `content_items.category_slug` in DB B. */
  slug: string;
  /** What the reader sees, and the value carried on `Article.topic`. */
  name: string;
};

/** In the desk's own `sort_order`. */
export const CATEGORIES: Category[] = [
  { slug: 'india', name: 'India' },
  { slug: 'world', name: 'World' },
  { slug: 'politics', name: 'Politics' },
  { slug: 'business', name: 'Business' },
  { slug: 'technology', name: 'Technology' },
  { slug: 'science', name: 'Science' },
  { slug: 'sports', name: 'Sports' },
  { slug: 'entertainment', name: 'Entertainment' },
];

export const CATEGORY_NAMES: string[] = CATEGORIES.map((c) => c.name);

const BY_SLUG = new Map(CATEGORIES.map((c) => [c.slug, c.name]));

/* Unclassified, and deliberately not a category.
 *
 * Some rows have no `category_slug` at all — four of the published pix do
 * today. The old code filed those under "Explained", which was a category in
 * the dial, so unclassified content became browsable content under a heading
 * nobody had chosen for it. This is a label and a look, nothing more: it never
 * appears in the dial or the tabs, because there is nothing to browse. */
export const UNCLASSIFIED = 'News';

/** A CMS slug → the category name the app shows. */
export function categoryOfSlug(slug: string | null | undefined): string {
  return BY_SLUG.get((slug ?? '').trim().toLowerCase()) ?? UNCLASSIFIED;
}

/* The pipeline's taxonomy folded into the desk's.
 *
 * DB A files stories under thirteen topics; an editor approving one has to put
 * it somewhere in the eight. These are the conventional desk groupings — cars,
 * property, markets and corporate law are all business pages; health sits with
 * science. `Explained` is a *format* rather than a subject, so it has no
 * category to fold into and falls through to unclassified.
 *
 * Applied when a row is mapped, so everything downstream — filters, the dial,
 * topic counts — only ever sees the eight. */
const PIPELINE_TOPIC_TO_CATEGORY: Record<string, string> = {
  'Tech & AI': 'Technology',
  Technology: 'Technology',
  Automobile: 'Business',
  'Real Estate': 'Business',
  'Markets & Startups': 'Business',
  'Corporate Case': 'Business',
  'Health & Wellness': 'Science',
};

/** The category a pipeline story belongs to. */
export function categoryOfTopic(topic: string | null | undefined): string {
  const t = (topic ?? '').trim();
  if (!t) return UNCLASSIFIED;
  if (PIPELINE_TOPIC_TO_CATEGORY[t]) return PIPELINE_TOPIC_TO_CATEGORY[t];
  return BY_SLUG.has(t.toLowerCase()) ? t : UNCLASSIFIED;
}
