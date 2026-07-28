import type { Article } from './content';
import { sentencesOf } from './sentences';

/* Feed composition — the rhythm of the mixed feed.

   The cycle is a block of eight slots:

     row row row [PIX] row row row [MOTION]   and repeat

   i.e. three articles, a picture story, three articles, a motion card. Fixed
   positions on purpose. The earlier version of this feed dropped a Pix in at
   whatever point the data happened to allow, and the complaint — correctly —
   was that it interrupted a scan-able list unpredictably. A beat you can feel
   is the difference between a mixed feed and a jumbled one.

   What changed with the CMS: the format is no longer this module's decision.
   It used to *promote* a story into the Pix slot if the story happened to have
   a photo and three bullets, which is how the app came to show picture stories
   nobody had made. Now a card renders as whatever the desk published it as,
   and this module only decides the *order* they appear in — placing each
   authored format on the beat where it reads best, and never inventing one.

   Pure and deterministic: same articles in, same feed out. That is what makes
   it testable offline against real data. */

export type FeedKind = 'row' | 'pix' | 'motion';

export type FeedItem = {
  key: string;
  kind: FeedKind;
  article: Article;
};

const CYCLE = 8;
const PIX_SLOT = 3;
const MOTION_SLOT = 7;

/* The three lines on a Pix card's second slide.

   This used to read `a.modes.tldr` and nothing else, and that quietly broke
   the cadence. The AI summariser has only reached a fraction of the feed: on
   a live deck of forty stories, five carry `versions` at all and three have
   three tl;dr bullets. So the Pix slot almost never found a story that could
   carry it, degraded to a plain article, and the beat the mixed feed exists
   for collapsed into articles-and-reels.

   Every row does carry a summary, so the fallback is that summary split into
   sentences — see lib/sentences.ts, which the article page's pull quote now
   shares. The gate and the card call this same function on purpose: if they
   disagreed, a story could be promoted into a Pix slot and then render its
   key-points slide empty. */
const MIN_POINT = 25;
const POINTS = 3;

export function pixPoints(a: Article): string[] {
  const tldr = (a.modes?.tldr ?? []).map((s) => s.trim()).filter(Boolean);
  if (tldr.length >= POINTS) return tldr.slice(0, POINTS);

  const out = [...tldr];
  for (const s of sentencesOf(a.summary, MIN_POINT)) {
    if (out.length >= POINTS) break;
    // don't restate a bullet the summariser already produced
    const head = s.slice(0, 30).toLowerCase();
    if (out.some((b) => b.toLowerCase().includes(head))) continue;
    out.push(s);
  }
  return out.slice(0, POINTS);
}

/** The card a story is published as. Motion is the app's name for a Qix. */
export function kindOf(a: Article): FeedKind {
  return a.format === 'pix' ? 'pix' : a.format === 'qix' ? 'motion' : 'row';
}

export function composeFeed(articles: Article[]): FeedItem[] {
  const queue = articles.filter((a) => !!a?.id);
  const out: FeedItem[] = [];
  let slot = 0;

  while (queue.length) {
    const pos = slot % CYCLE;
    const want: FeedKind = pos === PIX_SLOT ? 'pix' : pos === MOTION_SLOT ? 'motion' : 'row';

    /* Pull the next card of the format this slot wants, from anywhere in the
       queue; if there is none left, spend the slot on whatever is next and
       render it as what it actually is.

       This used to be bounded to a six-item lookahead, back when the queue was
       a ranked list of scraped stories and reaching further would have visibly
       scrambled the ranking. It arrives sorted differently now — the desk's
       approved stories in running order, then its pix and qix — so a bounded
       search would never see past the articles, and the feed would read as a
       dozen headlines followed by every picture story in a row. Articles hold
       their order either way; the formats have no position of their own to
       lose. */
    const found = queue.findIndex((a) => kindOf(a) === want);
    const a = queue.splice(found >= 0 ? found : 0, 1)[0];
    out.push({ key: a.id, kind: kindOf(a), article: a });
    slot++;
  }

  return out;
}

/* The desk's hero slot.

   `is_featured` in the CMS is described as exactly that, and the app honours it
   the simplest way there is: the featured stories lead, everything else keeps
   the order it arrived in. A stable partition, not a sort — two featured
   stories stay in approval order relative to each other.

   Deliberately not a carousel. Home used to open on six big picture cards
   chosen by the pipeline's own prominence score, which is to say chosen by
   nobody; a lead story is an editorial decision and now reads as one — the top
   of the same list everything else is in. */
export function featuredFirst(list: Article[]): Article[] {
  if (!list.some((a) => a.featured)) return list;
  return [...list.filter((a) => a.featured), ...list.filter((a) => !a.featured)];
}
