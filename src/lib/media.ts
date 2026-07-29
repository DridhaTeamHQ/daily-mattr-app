/* What a Qix's `media_url` actually is, and what the app can do with it.
 *
 * The desk attaches whatever it has. Sometimes that is a file the app can play;
 * sometimes it is a link to a YouTube Short, which is a *page*, not a video —
 * handing it to a player produces a black rectangle and a decoder error, not a
 * clip. Neither is wrong of the desk, so the card handles both rather than the
 * CMS being asked to only ever supply one.
 *
 * A third case matters as much as the other two: no usable media at all. Two of
 * the qix live today are test rows whose media and cover are the same YouTube
 * link. A card that assumes it has something to play renders as a black screen
 * with a headline on it, and looks broken rather than empty.
 */

/** A file a video player can open directly. */
const PLAYABLE_RE = /\.(mp4|m4v|mov|webm|m3u8|mpd)(\?|#|$)/i;
const YOUTUBE_RE = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be|m\.youtube\.com)\//i;
const HTTP_RE = /^https?:\/\/\S+$/i;

/* Hosts that resolve to the device itself, or to a LAN it is not on.
 *
 * The CMS serves imported clips from its own machine, and a Qix went live
 * pointing at `http://localhost:3000/api/media/…`. That is a well-formed
 * absolute URL, so every check passed and the player accepted it — then sat on
 * a black frame, because on a phone `localhost` is the phone. Caught here so
 * the card falls back to its cover, which is honest, rather than to a black
 * rectangle, which looks like the app is broken. */
const UNREACHABLE_HOST =
  /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[^/]*\.local)(:\d+)?(\/|$)/i;

export type Playback =
  /** Hand it to the video player. */
  | { kind: 'file'; url: string }
  /** A YouTube video, played in-app through its embed. */
  | { kind: 'youtube'; url: string; videoId: string }
  /** Neither, and not decodable — the play button opens it outside the app. */
  | { kind: 'link'; url: string }
  /** Nothing to play — the card is a still. */
  | { kind: 'none' };

/* Every URL shape YouTube hands out, and where the id sits in each.
   A Short and a watch page are the same video; only the route differs. */
const YOUTUBE_ID_RE = [
  /youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/i,
  /youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/i,
  /youtube\.com\/live\/([A-Za-z0-9_-]{6,})/i,
  /youtube\.com\/watch\?(?:.*&)?v=([A-Za-z0-9_-]{6,})/i,
  /youtu\.be\/([A-Za-z0-9_-]{6,})/i,
];

export function youtubeId(url: string | null | undefined): string | null {
  const s = (url ?? '').trim();
  for (const re of YOUTUBE_ID_RE) {
    const m = re.exec(s);
    if (m) return m[1];
  }
  return null;
}

export function playbackFor(mediaUrl: string | null | undefined): Playback {
  const url = (mediaUrl ?? '').trim();
  if (!HTTP_RE.test(url)) return { kind: 'none' };
  // nothing on this device can reach it, so there is nothing to offer
  if (UNREACHABLE_HOST.test(url)) return { kind: 'none' };
  if (PLAYABLE_RE.test(url)) return { kind: 'file', url };
  const videoId = youtubeId(url);
  if (videoId) return { kind: 'youtube', url, videoId };
  /* Anything else is a page of some kind — a publisher's article, an embed we
     have no player for. Opening it externally is the honest move: the reader
     gets the thing, and the app doesn't pretend to decode something it can't. */
  return { kind: 'link', url };
}

/* The embed URL, configured for a feed rather than for a web page.
 *
 * `playsinline` is the one that matters on iOS: without it, tapping play hands
 * the video to the system full-screen player and the reader is thrown out of
 * the deck. `rel=0` keeps YouTube's end-screen from offering unrelated videos
 * on top of a news card, and `modestbranding` drops the watermark.
 */
/* The origin the embed is told it is running under.
 *
 * `enablejsapi=1` without a matching `origin` is the documented way to get
 * "Error 153 — video player configuration error", which is exactly what a
 * direct load of our embed returned. The webview is handed this as its
 * baseUrl, so the hosting page and the parameter agree — which is the whole
 * requirement, and it costs nothing to keep the no-cookie host while meeting
 * it. (`youtube-nocookie.com` serves the same player and sets no tracking
 * cookie unless the video is actually played.) */
export const YOUTUBE_EMBED_ORIGIN = 'https://www.youtube-nocookie.com';

export function youtubeEmbedUrl(videoId: string, opts: { muted: boolean }): string {
  const q = new URLSearchParams({
    autoplay: '1',
    mute: opts.muted ? '1' : '0',
    playsinline: '1',
    controls: '0',
    rel: '0',
    modestbranding: '1',
    loop: '1',
    playlist: videoId, // `loop` is ignored on a single video without this
    fs: '0',
    iv_load_policy: '3',
    // lets the card turn the sound on later without reloading the iframe and
    // restarting the clip — see components/youtubeEmbed
    enablejsapi: '1',
    origin: YOUTUBE_EMBED_ORIGIN,
  });
  return `${YOUTUBE_EMBED_ORIGIN}/embed/${videoId}?${q.toString()}`;
}

/** Where to send a reader whose video refuses to embed. */
export const youtubeWatchUrl = (videoId: string) =>
  `https://www.youtube.com/watch?v=${videoId}`;

/**
 * Whether a cover image is worth rendering. The junk rows point `cover_url` at
 * the same YouTube page as the media, and an <Image> given an HTML document
 * fails silently — leaving a black card with no indication why.
 */
export function usableCover(coverUrl: string | null | undefined): string | null {
  const url = (coverUrl ?? '').trim();
  if (!url) return null;
  if (url.startsWith('data:image/')) return url;
  if (!HTTP_RE.test(url)) return null;
  if (YOUTUBE_RE.test(url)) return null;
  /* A video file is not a poster. The CMS used to copy the media URL into
     cover_url when a clip was attached, so uploading an MP4 set the cover to
     the MP4 — and an <Image> handed a video draws nothing, silently. Fixed on
     that side too, but rows made before it are still in the table. */
  if (PLAYABLE_RE.test(url)) return null;
  return url;
}

/** `92` → `1:32`. */
export function clipLength(seconds: number | null | undefined): string | null {
  const s = Math.round(Number(seconds));
  if (!Number.isFinite(s) || s <= 0) return null;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
