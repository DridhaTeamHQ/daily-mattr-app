import { playbackFor, usableCover, clipLength, youtubeId, youtubeEmbedUrl } from '../media';

/* These are written against the rows that are actually live in the CMS today:
   one direct .mp4, one YouTube Short, and two test rows whose media and cover
   are both the same YouTube link. The last of those is the one that matters —
   it is the shape that renders a black card with a headline on it if nothing
   checks. */

describe('playbackFor', () => {
  it('plays a direct file', () => {
    expect(playbackFor('https://storage.googleapis.com/b/ForBiggerJoyrides.mp4')).toEqual({
      kind: 'file',
      url: 'https://storage.googleapis.com/b/ForBiggerJoyrides.mp4',
    });
  });

  it('plays a stream', () => {
    expect(playbackFor('https://cdn.example/live/index.m3u8').kind).toBe('file');
  });

  it('still recognises a file behind a query string', () => {
    expect(playbackFor('https://cdn.example/clip.mp4?token=abc123').kind).toBe('file');
  });

  /* A Short is a page, not a file — no video player can open it. It plays
     in-app through YouTube's own embed instead, which needs the id rather than
     the url, so extracting it is what separates "plays" from "opens YouTube". */
  it('plays a YouTube Short in-app', () => {
    const url = 'https://youtube.com/shorts/AwnpjJi1PK0?si=P45v0mvX7_xhxZXN';
    expect(playbackFor(url)).toEqual({ kind: 'youtube', url, videoId: 'AwnpjJi1PK0' });
  });

  it('recognises every shape YouTube hands out', () => {
    const ids = [
      'https://youtu.be/AwnpjJi1PK0',
      'https://www.youtube.com/watch?v=AwnpjJi1PK0',
      'https://www.youtube.com/watch?t=30&v=AwnpjJi1PK0',
      'https://www.youtube.com/embed/AwnpjJi1PK0',
      'https://m.youtube.com/shorts/AwnpjJi1PK0',
    ].map((u) => youtubeId(u));
    expect(ids).toEqual(Array(5).fill('AwnpjJi1PK0'));
  });

  it('is not fooled by a page that merely mentions youtube', () => {
    expect(youtubeId('https://example.com/article/youtube-is-changing')).toBeNull();
  });

  /* Anything else with no id and no file extension is a page we have no player
     for — a publisher's article, an embed of some other kind. Out it goes. */
  it('sends an unplayable page out to the browser', () => {
    expect(playbackFor('https://www.bbc.com/news/video/abc').kind).toBe('link');
  });

  it('has nothing to show when the desk attached no media', () => {
    expect(playbackFor(null).kind).toBe('none');
    expect(playbackFor('').kind).toBe('none');
    expect(playbackFor('   ').kind).toBe('none');
  });

  it('refuses a non-http string rather than handing it to a player', () => {
    expect(playbackFor('javascript:alert(1)').kind).toBe('none');
    expect(playbackFor('not a url').kind).toBe('none');
  });
});

describe('youtubeEmbedUrl', () => {
  const url = youtubeEmbedUrl('AwnpjJi1PK0', { muted: true });

  it('uses the no-cookie host', () => {
    expect(url.startsWith('https://www.youtube-nocookie.com/embed/AwnpjJi1PK0?')).toBe(true);
  });

  /* playsinline is the one that matters on iOS: without it, playing hands the
     video to the system full-screen player and throws the reader out of the
     deck. The rest keep YouTube's chrome and end-screen off a news card. */
  it('plays inline, without controls or related videos', () => {
    const q = new URLSearchParams(url.split('?')[1]);
    expect(q.get('playsinline')).toBe('1');
    expect(q.get('controls')).toBe('0');
    expect(q.get('rel')).toBe('0');
    expect(q.get('autoplay')).toBe('1');
  });

  it('can be told to turn its sound on later', () => {
    expect(new URLSearchParams(url.split('?')[1]).get('enablejsapi')).toBe('1');
  });

  // `loop` is ignored on a single video unless it is also the playlist
  it('loops', () => {
    const q = new URLSearchParams(url.split('?')[1]);
    expect(q.get('loop')).toBe('1');
    expect(q.get('playlist')).toBe('AwnpjJi1PK0');
  });
});

describe('usableCover', () => {
  it('takes a real image', () => {
    expect(usableCover('https://i.ytimg.com/vi/AwnpjJi1PK0/hqdefault.jpg')).toBe(
      'https://i.ytimg.com/vi/AwnpjJi1PK0/hqdefault.jpg',
    );
  });

  it('takes an inline image', () => {
    expect(usableCover('data:image/png;base64,iVBOR')).toBe('data:image/png;base64,iVBOR');
  });

  /* The junk rows point cover_url at the YouTube page. An <Image> given an HTML
     document fails silently, so the card has to fall back to topic artwork
     instead of rendering nothing. */
  it('rejects a YouTube page posing as a cover', () => {
    expect(usableCover('https://youtube.com/shorts/cpTjDjlmmMM?si=MHgUd')).toBeNull();
  });

  it('rejects nothing at all', () => {
    expect(usableCover(null)).toBeNull();
    expect(usableCover('')).toBeNull();
  });
});

describe('clipLength', () => {
  it('reads a duration the way a player labels it', () => {
    expect(clipLength(92)).toBe('1:32');
    expect(clipLength(60)).toBe('1:00');
    expect(clipLength(9)).toBe('0:09');
    expect(clipLength(3600)).toBe('60:00');
  });

  // three of the four live qix have no duration_sec — the pill is simply absent
  it('has no label when the desk left the duration blank', () => {
    expect(clipLength(null)).toBeNull();
    expect(clipLength(0)).toBeNull();
    expect(clipLength(undefined)).toBeNull();
  });
});
