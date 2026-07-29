// Row → Article mapping and text helpers. The DB is read-only for this app.

import { categoryOfTopic } from './categories';

/* The retellings a card can offer, and deliberately not `deep_dive`.
 *
 * The pipeline writes four; the app renders three. Each of these is *shorter*
 * than the summary it sits beside — that is what lets them work on a
 * line-clamped card. The deep dive is the one that is longer, so it arrived
 * pre-truncated on the single mode whose whole promise is more to read.
 *
 * Dropped from the model rather than just hidden in the reader: a field that
 * is parsed, mapped, cached to disk and shipped to every device, and then
 * rendered nowhere, is the kind of thing that gets re-added by accident. */
export type ReadingModes = {
  eli5: string | null;
  tldr: string[] | null;
  keyNumbers: string[] | null;
};

/* What a card *is*, decided by the desk rather than inferred from the row.

   The app used to work this out for itself: a story with a photo and three
   bullets became a picture story, anything with a photo could become a motion
   card. That guess is why readers saw "pix" nobody had made — the format was a
   property of the data being lucky, not of an editor's choice. The CMS models
   the three formats explicitly (`content_items.kind`), so the app carries the
   answer instead of deriving it. */
export type Format = 'article' | 'pix' | 'qix';

export type Article = {
  id: string;
  title: string;
  summary: string;
  body: string | null;
  url: string;
  topic: string;
  publisher: string;
  imageUrl: string | null;
  publishedAt: string; // ISO
  prominence: number;
  factLabel: string | null;
  readMins: number;
  wordCount: number;
  modes: ReadingModes | null;
  format: Format;
  /** The desk's hero flag (`article_selections.is_featured`) — leads the feed. */
  featured: boolean;
  /** Qix only: the clip itself, and how long it runs. */
  mediaUrl?: string | null;
  durationSec?: number | null;
  sim?: number; // similarity to the user's taste vector, 0..1
};

export const ARTICLE_COLS =
  'id,title,edited_title,summary,edited_summary,source,topic,url,image_url,prominence,rank_score,fact_label,scraped_at,reviewed_at';

// Topics fold into the desk's eight categories — see lib/categories. The old
// one-off alias here (`Technology` → `Tech & AI`) is part of that map now.

// `source` holds RSS feed names, not publishers.
const PUBLISHER_MAP: [RegExp, string][] = [
  [/indian express|ie /i, 'Indian Express'],
  [/livemint|mint/i, 'Mint'],
  [/the hindu/i, 'The Hindu'],
  [/times of india|toi/i, 'Times of India'],
  [/hindustan times|ht /i, 'Hindustan Times'],
  [/economic times|et /i, 'Economic Times'],
  [/ndtv/i, 'NDTV'],
  [/moneycontrol/i, 'Moneycontrol'],
  [/business standard/i, 'Business Standard'],
  [/reuters/i, 'Reuters'],
  [/bbc/i, 'BBC'],
];

/* Collapses syndicated duplicates — the same story pushed by several feeds
   arrives with near-identical headlines. Hoisted out of the Home screen so the
   edition builder agrees with the feed about what counts as "the same story";
   two different definitions would let a story the user already read reappear
   in tomorrow's edition. */
export function normTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 80);
}

export function publisherOf(source: string | null): string {
  if (!source) return 'Daily Mattr';
  for (const [re, name] of PUBLISHER_MAP) if (re.test(source)) return name;
  return source;
}

const TAG_RE = /<[^>]+>/g;
const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ', '&rsquo;': '’', '&lsquo;': '‘', '&rdquo;': '”', '&ldquo;': '“', '&mdash;': '—', '&ndash;': '–',
};
export function cleanText(s: string | null | undefined): string {
  if (!s) return '';
  let out = s.replace(TAG_RE, ' ');
  out = out.replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m] ?? ' ');
  return out.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

export function mapModes(v: any): ReadingModes | null {
  if (!v || typeof v !== 'object') return null;
  /* Empty means absent, and the distinction matters more than it looks.

     This used to return the filtered array whatever its length, and `[]` is
     truthy — so a row whose `versions` is `{"tldr": []}` (the summariser ran,
     produced nothing, and wrote the blob anyway) came back as a non-null
     ReadingModes. Everything reading `modes?.tldr ?? []` shrugged that off,
     but `hasAiSummary` is a plain null check, so such a row would carry the
     sparkles mark and the words "AI Summary" over text no AI wrote — the exact
     claim that badge now exists to make honestly. */
  const arr = (x: any): string[] | null => {
    if (!Array.isArray(x)) return null;
    const out = x.map((s) => cleanText(String(s))).filter(Boolean);
    return out.length ? out : null;
  };
  const str = (x: any): string | null => (typeof x === 'string' && x.trim() ? cleanText(x) : null);
  // `v.deep_dive` is read by nothing — see the note on ReadingModes.
  const modes: ReadingModes = {
    eli5: str(v.eli5),
    tldr: arr(v.tldr),
    keyNumbers: arr(v.key_numbers),
  };
  return modes.eli5 || modes.tldr || modes.keyNumbers ? modes : null;
}

export function mapArticle(row: any): Article {
  const summary = cleanText(row.edited_summary ?? row.summary);
  const body: string | null = row.raw_content ? cleanText(row.raw_content) : null;
  const words = (body ?? summary).split(/\s+/).length;
  return {
    id: row.id,
    title: cleanText(row.edited_title ?? row.title),
    summary,
    body,
    url: row.url,
    topic: categoryOfTopic(row.topic),
    publisher: publisherOf(row.source),
    imageUrl: row.image_url ?? null,
    publishedAt: row.reviewed_at ?? row.scraped_at,
    prominence: row.prominence ?? 0,
    factLabel: row.fact_label ?? null,
    readMins: Math.max(1, Math.round(words / 220)),
    wordCount: summary.split(/\s+/).length,
    modes: mapModes(row.versions),
    // A pipeline row is always a plain story. Pix and Qix are authored in the
    // CMS; `featured` is the desk's flag and is applied by applyOverride.
    format: 'article',
    featured: false,
    sim: typeof row.sim === 'number' ? row.sim : undefined,
  };
}

/* Did the summariser actually touch this row?

   `versions` is where the AI output lands — eli5, tldr, key_numbers — and
   `mapModes` returns null when none of them are present. The `summary` field,
   by contrast, is populated for every row: it is the publisher's own RSS blurb
   unless an editor replaced it.

   The distinction matters because the article page was labelling every
   summary "AI Summary" under a sparkles mark, and on live data only about one
   row in eight has been through the summariser. The other seven were being
   credited to an AI that never read them. One definition, here, so no surface
   has to re-derive it and get it subtly different. */
export function hasAiSummary(a: Article): boolean {
  return !!a.modes;
}

export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/* The same age, spelled out for a screen reader.

   timeAgo is written to be *read*, so it abbreviates: "20m ago". TalkBack
   pronounces that "twenty m ago", which is the kind of detail that makes an
   app sound broken to someone who only ever hears it. */
export function spokenAge(iso: string): string {
  const label = timeAgo(iso);
  if (label === 'now') return 'just now';
  const m = /^(\d+)([mhd]) ago$/.exec(label);
  if (!m) return `published ${label}`;
  const n = Number(m[1]);
  const unit = m[2] === 'm' ? 'minute' : m[2] === 'h' ? 'hour' : 'day';
  return `${n} ${unit}${n === 1 ? '' : 's'} ago`;
}

/** One line describing a story card, for `accessibilityLabel`. */
export function cardLabel(a: Article): string {
  return `${a.title}. ${a.topic}, ${spokenAge(a.publishedAt)}, ${a.readMins} minute read.`;
}

export function isBreaking(a: Article): boolean {
  return a.prominence >= 8 && Date.now() - new Date(a.publishedAt).getTime() < 6 * 3600_000;
}

// Stable pseudo-random from id — used for decorative counts (likes) so the UI
// matches the mock without inventing server data.
export function seeded(id: string, min: number, max: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const t = (Math.abs(h) % 1000) / 1000;
  return Math.round(min + t * (max - min));
}

export function compact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}
