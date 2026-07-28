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

/** How far ahead we'll look for a story that can carry a given format. */
const LOOKAHEAD = 6;

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

/** A Pix needs a photo and three points it can actually show. */
export function isPixEligible(a: Article): boolean {
  return !!a.imageUrl && pixPoints(a).length >= POINTS;
}

/** A motion card is the story's own photo, slowly moving. It just needs one. */
export function isMotionEligible(a: Article): boolean {
  return !!a.imageUrl;
}

export function composeFeed(articles: Article[]): FeedItem[] {
  const queue = articles.filter((a) => !!a?.id);
  const out: FeedItem[] = [];
  let slot = 0;

  while (queue.length) {
    const pos = slot % CYCLE;
    const want: FeedKind = pos === PIX_SLOT ? 'pix' : pos === MOTION_SLOT ? 'motion' : 'row';

    if (want === 'row') {
      const a = queue.shift()!;
      out.push({ key: a.id, kind: 'row', article: a });
      slot++;
      continue;
    }

    /* Promote the nearest story that can carry the format rather than settling
       for whichever one happens to land on the slot. Without this the cadence
       collapses on any day where the ranked order puts photo-less stories at
       positions 3 and 7 — and the whole point is that the beat is reliable.
       Bounded by LOOKAHEAD so it can't reach far enough to visibly scramble
       the ranking. */
    const test = want === 'pix' ? isPixEligible : isMotionEligible;
    const found = queue.findIndex((a, i) => i < LOOKAHEAD && test(a));

    // nothing nearby can carry it — spend the slot on a plain row and move on,
    // rather than stalling the cycle or shipping a broken card
    const a = queue.splice(found >= 0 ? found : 0, 1)[0];
    out.push({ key: a.id, kind: found >= 0 ? want : 'row', article: a });
    slot++;
  }

  return out;
}

/* CMS items join the ranked feed on published time.

   Not appended, not given a fixed slot: an item a writer published an hour ago
   belongs among the stories from an hour ago. Ranking still decides the order of
   pipeline stories among themselves — this only decides where the desk's work
   lands relative to them.

   Pure, like the rest of this module, so the rule can be tested against fixed
   timestamps rather than against whatever the feed happens to hold today. */
export function mergeByRecency(ranked: Article[], authored: Article[]): Article[] {
  if (!authored.length) return ranked;
  const seen = new Set(ranked.map((a) => a.id));
  const fresh = authored.filter((a) => !seen.has(a.id));
  if (!fresh.length) return ranked;

  const at = (a: Article) => new Date(a.publishedAt).getTime() || 0;
  const out = [...ranked];
  for (const item of fresh) {
    const i = out.findIndex((a) => at(a) < at(item));
    if (i === -1) out.push(item);
    else out.splice(i, 0, item);
  }
  return out;
}
