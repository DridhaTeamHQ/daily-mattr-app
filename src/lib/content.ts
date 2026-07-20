// Row → Article mapping and text helpers. The DB is read-only for this app.

export type ReadingModes = {
  eli5: string | null;
  tldr: string[] | null;
  keyNumbers: string[] | null;
  deepDive: string | null;
};

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
  score?: number; // personalization score from app_get_feed
  sim?: number; // similarity to the user's taste vector, 0..1
};

export const ARTICLE_COLS =
  'id,title,edited_title,summary,edited_summary,source,topic,url,image_url,prominence,rank_score,fact_label,scraped_at,reviewed_at';

// `Technology` and `Tech & AI` are the same thing to a reader.
const TOPIC_ALIAS: Record<string, string> = { Technology: 'Tech & AI' };

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

function mapModes(v: any): ReadingModes | null {
  if (!v || typeof v !== 'object') return null;
  const arr = (x: any): string[] | null =>
    Array.isArray(x) ? x.map((s) => cleanText(String(s))).filter(Boolean) : null;
  const str = (x: any): string | null => (typeof x === 'string' && x.trim() ? cleanText(x) : null);
  const modes: ReadingModes = {
    eli5: str(v.eli5),
    tldr: arr(v.tldr),
    keyNumbers: arr(v.key_numbers),
    deepDive: str(v.deep_dive),
  };
  return modes.eli5 || modes.tldr || modes.keyNumbers || modes.deepDive ? modes : null;
}

export function mapArticle(row: any): Article {
  const summary = cleanText(row.edited_summary ?? row.summary);
  const body: string | null = row.raw_content ? cleanText(row.raw_content) : null;
  const words = (body ?? summary).split(/\s+/).length;
  const rawTopic = row.topic ?? 'Explained';
  return {
    id: row.id,
    title: cleanText(row.edited_title ?? row.title),
    summary,
    body,
    url: row.url,
    topic: TOPIC_ALIAS[rawTopic] ?? rawTopic,
    publisher: publisherOf(row.source),
    imageUrl: row.image_url ?? null,
    publishedAt: row.reviewed_at ?? row.scraped_at,
    prominence: row.prominence ?? 0,
    factLabel: row.fact_label ?? null,
    readMins: Math.max(1, Math.round(words / 220)),
    wordCount: summary.split(/\s+/).length,
    modes: mapModes(row.versions),
    score: typeof row.score === 'number' ? row.score : undefined,
    sim: typeof row.sim === 'number' ? row.sim : undefined,
  };
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
