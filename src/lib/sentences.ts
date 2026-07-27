/* Splitting prose into sentences.

   Lifted out of lib/feed.ts because two features now need it and they must not
   drift: the Pix card's key points and the article page's pull quote. Both
   exist for the same reason — only a fraction of rows carry AI-generated
   `versions`, so anything built on tl;dr bullets alone is absent from most of
   the feed, and the summary is the one field every row does have.

   Lookahead only, never lookbehind. Hermes is the runtime, and a regex that
   works in a browser and throws on device is a class of bug this codebase has
   already paid for once. */

/* Terminator, whitespace, then something that can open a sentence.

   Exported so the constraint above can be asserted rather than merely
   commented — see the test. Reading the source file off disk would have done
   it too, but that needs Node's fs types in scope, and putting those in the
   app's tsconfig is how `process.env` ends up type-checking in a bundle. */
export const SENTENCE_BREAK = /([.!?])\s+(?=["'(“‘A-Z])/g;
/* A character prose never contains, so the split lands on sentence ends and
   not on every space. Built rather than typed: a literal U+0001 in source is
   invisible in an editor and does not survive every tool that touches it. */
const MARK = String.fromCharCode(1);

/* Requiring an opening character after the break is what keeps "the U.S. said"
   and "Rs. 500 crore" in one piece — in both, the character after the period
   and space is lowercase or a digit, so no break is inserted. The cost is that
   a sentence ending in a closing quote ("…a barbaric assault.' He demanded…")
   stays joined to the next one, which reads as one long point rather than two
   wrong ones. That is the right way round. */
export function sentencesOf(text: string | null | undefined, min = 25): string[] {
  if (!text) return [];
  return text
    .replace(SENTENCE_BREAK, `$1${MARK}`)
    .split(MARK)
    .map((s) => s.trim())
    .filter((s) => s.length >= min);
}

/* One sentence worth setting as a pull quote.

   Wants something that stands alone: long enough to say something, short
   enough to read as a quote rather than a paragraph. Returns null rather than
   settling — a bad pull quote is worse than no pull quote, and the article
   body reads fine without one. */
const QUOTE_MIN = 60;
const QUOTE_MAX = 165;

export function pullQuoteFrom(tldr: string[] | null | undefined, summary: string | null | undefined): string | null {
  // an editor's or the summariser's own first bullet beats anything we pick
  const bullet = (tldr ?? []).map((s) => s.trim()).find((s) => s.length >= 40 && s.length <= QUOTE_MAX);
  if (bullet) return bullet;

  const inBand = sentencesOf(summary, QUOTE_MIN).filter((s) => s.length <= QUOTE_MAX);
  if (!inBand.length) return null;
  // the longest one inside the band: the most substantial thing that still fits
  return inBand.reduce((best, s) => (s.length > best.length ? s : best));
}
