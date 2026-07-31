import { CATEGORY_NAMES } from './categories';

/* The numbers behind the interest radar.
 *
 * Kept out of the component for the same reason lib/rank is: this is the part
 * that can be wrong in a way nobody sees. A bad normalisation still draws a
 * plausible shape — it just means something else — so it is pure, and it is
 * tested.
 */

export type RadarSlice = {
  topic: string;
  /** 0..1 against the most-read category. */
  read: number;
  /** 0..1 against the most-published category. */
  available: number;
};

/**
 * Counts per category → the two series the chart draws.
 *
 * Each series is normalised against its own maximum rather than against the
 * other. The question the chart answers is "where does my attention go",
 * not "how many did I read" — the count beside the chart already says that,
 * and scaling both against one total would flatten the reader's shape to
 * nothing whenever the desk had a busy week.
 *
 * Always returns one slice per category in the desk's own order, so the chart
 * has a fixed number of axes and a story about a topic the app does not
 * publish cannot bend it out of shape.
 */
export function toSlices(
  readByTopic: Record<string, number>,
  availableByTopic: Record<string, number>,
): RadarSlice[] {
  // Floored at 1: an empty history would otherwise divide by zero, and a NaN
  // reaches the SVG as points="NaN,NaN …", which renders nothing at all — a
  // blank card with no error anywhere to explain it.
  const maxRead = Math.max(1, ...CATEGORY_NAMES.map((t) => readByTopic[t] ?? 0));
  const maxAvail = Math.max(1, ...CATEGORY_NAMES.map((t) => availableByTopic[t] ?? 0));

  return CATEGORY_NAMES.map((topic) => ({
    topic,
    read: (readByTopic[topic] ?? 0) / maxRead,
    available: (availableByTopic[topic] ?? 0) / maxAvail,
  }));
}
