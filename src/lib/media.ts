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
  });
  return `https://www.youtube-nocookie.com/embed/${videoId}?${q.toString()}`;
}

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
  return YOUTUBE_RE.test(url) ? null : url;
}

/** `92` → `1:32`. */
export function clipLength(seconds: number | null | undefined): string | null {
  const s = Math.round(Number(seconds));
  if (!Number.isFinite(s) || s <= 0) return null;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
