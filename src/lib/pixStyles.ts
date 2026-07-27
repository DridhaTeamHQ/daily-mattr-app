/* The Pix design.

   This started as fifteen presets hashed off the article id, on the theory
   that a varied feed reads like a magazine. In practice it read as
   inconsistent: the format had no recognisable shape, because the next
   picture story looked nothing like the last one. Pix is now ONE design, and
   the only thing that changes between cards is the story — the photograph,
   the headline, and which words inside it come up in blue.

   The shape is kept as a descriptor rather than inlined into the card so the
   layout branches stay readable and a variant remains cheap to reintroduce if
   it is ever wanted deliberately, rather than by hash. */

export type PixStyle = {
  id: string;
  frame: 'bleed' | 'inset' | 'band'; // how much of slide 1 the photo takes
  anchor: 'bottom' | 'top' | 'centre'; // where the headline sits on it
  scrim: 'ink' | 'topic' | 'duotone'; // what the photo melts into
  accent: 'fill' | 'underline' | 'bar' | 'none'; // how highlighted words are marked
  back: 'dim' | 'band' | 'canvas'; // slide 2 backdrop
  marker: 'dot' | 'numeral' | 'rule'; // slide 2 bullet markers
  align: 'left' | 'centre';
  size: 'xl' | 'lg' | 'md'; // headline scale
};

/* Photograph across the top, the story on a dark panel beneath it, the
   newsworthy words picked out in blue with a short rule under the block, and
   the key points over the dimmed photo on the second slide. */
export const PIX_STYLE: PixStyle = {
  id: 'pix',
  frame: 'inset',
  anchor: 'bottom',
  scrim: 'ink',
  // colour, not a filled block: a highlighter behind three words in a
  // three-line headline fights the photograph above it
  accent: 'bar',
  back: 'dim',
  marker: 'dot',
  align: 'left',
  size: 'lg',
};

export const PIX_STYLES: PixStyle[] = [PIX_STYLE];

/** Every story gets the same design; the id is kept so callers need no change. */
export function pixStyleFor(_id: string): PixStyle {
  return PIX_STYLE;
}

export const HEADLINE_SIZE: Record<PixStyle['size'], { size: number; lh: number }> = {
  xl: { size: 27, lh: 32 },
  lg: { size: 23, lh: 28 },
  md: { size: 20, lh: 25 },
};
