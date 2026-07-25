/* Pix presets.
   One card component, many looks. Variety lives here as data so the feed reads
   like a magazine rather than a template, while the layout logic stays in one
   place. A style is picked by hashing the article id, so a given story always
   looks the same but neighbouring stories rarely match. */

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

export const PIX_STYLES: PixStyle[] = [
  // full-bleed, cinematic — closest to the reference
  { id: 'bleed-ink', frame: 'bleed', anchor: 'bottom', scrim: 'ink', accent: 'fill', back: 'dim', marker: 'dot', align: 'left', size: 'lg' },
  { id: 'bleed-topic', frame: 'bleed', anchor: 'bottom', scrim: 'topic', accent: 'fill', back: 'dim', marker: 'dot', align: 'left', size: 'lg' },
  { id: 'bleed-quiet', frame: 'bleed', anchor: 'bottom', scrim: 'ink', accent: 'underline', back: 'dim', marker: 'rule', align: 'left', size: 'md' },
  { id: 'bleed-loud', frame: 'bleed', anchor: 'bottom', scrim: 'ink', accent: 'fill', back: 'dim', marker: 'numeral', align: 'left', size: 'xl' },
  { id: 'bleed-duo', frame: 'bleed', anchor: 'bottom', scrim: 'duotone', accent: 'bar', back: 'dim', marker: 'dot', align: 'left', size: 'lg' },

  // headline over the top of the frame instead of under it
  { id: 'top-ink', frame: 'bleed', anchor: 'top', scrim: 'ink', accent: 'fill', back: 'dim', marker: 'dot', align: 'left', size: 'lg' },
  { id: 'top-duo', frame: 'bleed', anchor: 'top', scrim: 'duotone', accent: 'underline', back: 'band', marker: 'numeral', align: 'left', size: 'md' },

  // centred, poster-like
  { id: 'poster', frame: 'bleed', anchor: 'centre', scrim: 'ink', accent: 'fill', back: 'dim', marker: 'dot', align: 'centre', size: 'xl' },
  { id: 'poster-topic', frame: 'bleed', anchor: 'centre', scrim: 'topic', accent: 'none', back: 'canvas', marker: 'rule', align: 'centre', size: 'lg' },

  // photo as an inset, type carries the card
  { id: 'inset-editorial', frame: 'inset', anchor: 'bottom', scrim: 'ink', accent: 'underline', back: 'canvas', marker: 'numeral', align: 'left', size: 'lg' },
  { id: 'inset-quiet', frame: 'inset', anchor: 'bottom', scrim: 'ink', accent: 'bar', back: 'canvas', marker: 'rule', align: 'left', size: 'md' },
  { id: 'inset-duo', frame: 'inset', anchor: 'bottom', scrim: 'duotone', accent: 'fill', back: 'band', marker: 'dot', align: 'left', size: 'lg' },

  // photo reduced to a cinematic band, key points get the room
  { id: 'band-type', frame: 'band', anchor: 'bottom', scrim: 'ink', accent: 'underline', back: 'canvas', marker: 'numeral', align: 'left', size: 'xl' },
  { id: 'band-topic', frame: 'band', anchor: 'bottom', scrim: 'topic', accent: 'bar', back: 'canvas', marker: 'rule', align: 'left', size: 'lg' },
  { id: 'band-centre', frame: 'band', anchor: 'bottom', scrim: 'ink', accent: 'fill', back: 'band', marker: 'dot', align: 'centre', size: 'lg' },
];

/* Same idiom as nameFor() in comments.ts — unsigned shift, because a signed one
   turns hashes past 2^31 negative and indexes off the front of the array. */
export function pixStyleFor(id: string): PixStyle {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PIX_STYLES[h % PIX_STYLES.length];
}

export const HEADLINE_SIZE: Record<PixStyle['size'], { size: number; lh: number }> = {
  xl: { size: 27, lh: 32 },
  lg: { size: 23, lh: 28 },
  md: { size: 20, lh: 25 },
};
