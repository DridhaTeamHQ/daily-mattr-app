import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { Image } from 'expo-image';
import { YOUTUBE_EMBED_ORIGIN, youtubeEmbedUrl } from '@/lib/media';

/* A YouTube video, playing inside the card.
 *
 * The desk attaches Shorts links, and a Short is a page rather than a file — no
 * video player can open one. The choice is between sending the reader out to
 * YouTube and rendering YouTube's own player in a webview; this is the second.
 *
 * Three things make it feel like part of the app rather than a browser sitting
 * in a hole in the deck:
 *
 *   - The iframe is stretched wider than the frame and centred, so a 16:9 video
 *     fills a 9:16 card the way `contentFit="cover"` would. YouTube letterboxes
 *     otherwise, and a Short inside two black bars inside a full-bleed card
 *     looks like a mistake.
 *   - Scrolling and zooming are off, and the page can't be dragged, so the
 *     deck's vertical swipe is never captured by the webview.
 *   - The cover stays painted underneath until the player reports it has
 *     loaded. A webview renders white before its first frame, which on a dark
 *     card is a flash on every swipe.
 *
 * `youtube-nocookie.com` is the privacy-preserving embed host — same player, no
 * tracking cookie set unless the video is actually played.
 */

export function YoutubeEmbed({
  videoId,
  muted = true,
  poster,
  playing = true,
  onRefused,
}: {
  videoId: string;
  muted?: boolean;
  poster?: string | null;
  /** false while the card is off screen — unmounts the player rather than
      leaving a hidden webview holding a decoder and an audio session */
  playing?: boolean;
  /** the owner has disabled embedding, or the player cannot start at all */
  onRefused?: () => void;
}) {
  const [ready, setReady] = useState(false);
  const web = useRef<WebView>(null);

  /* Wait for the swipe to settle before creating the webview.
   *
   * The deck marks a card active at 75% visibility, which is mid-gesture. A
   * webview is its own hardware-composited surface, and building one while the
   * list is still animating stalls the very frames the swipe is made of — the
   * card judders as it lands, every time. A quarter of a second is longer than
   * the snap takes and shorter than anyone waits deliberately, so the video
   * starts on a still deck and the poster covers the gap.
   *
   * It also spares the work entirely when someone is flicking through: pages
   * passed over never reach the timeout. */
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!playing) {
      setSettled(false);
      setReady(false);
      return;
    }
    const t = setTimeout(() => setSettled(true), 280);
    return () => clearTimeout(t);
  }, [playing]);
  const mounted = playing && settled;

  /* Clear the poster on a timer as well as on the event.
     The player is opaque underneath either way, so the only thing this
     protects is the poster outstaying its welcome — but a still that never
     lifts is indistinguishable, to a reader, from a video that never plays. */
  useEffect(() => {
    if (!mounted || ready) return;
    const t = setTimeout(() => setReady(true), 2500);
    return () => clearTimeout(t);
  }, [mounted, ready]);

  /* Built once per video, NOT per mute state.
     Rebuilding the html on unmute would reload the iframe and restart the clip
     from zero — the reader taps the speaker and loses their place. The embed is
     started muted (autoplay is refused otherwise on every mobile browser) and
     the sound is turned on afterwards through the player's own command API. */
  const uri = useMemo(() => youtubeEmbedUrl(videoId, { muted: true }), [videoId]);

  /* YouTube's own still, when the desk gave the clip no cover.
     Two of the live Shorts point `cover_url` at the YouTube *page*, which
     lib/cms correctly nulls — leaving nothing to paint under the player and a
     black rectangle for as long as it takes to load. This always exists for a
     public video, and it is the frame the reader would expect anyway. */
  const still = poster ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  /* YouTube always renders 16:9. To cover a portrait card the iframe has to be
     as wide as the card is tall × 16/9, which for any plausible phone is a lot
     wider than the screen — the overflow is clipped by the parent. */
  const html = useMemo(
    () => `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
  html,body{margin:0;padding:0;height:100%;background:#000;overflow:hidden}
  .wrap{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
        width:100vw;height:56.25vw;min-height:100vh;min-width:177.78vh}
  iframe{width:100%;height:100%;border:0;display:block;pointer-events:none}
</style></head>
<body><div class="wrap"><iframe id="p" src="${uri}"
  allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>
<script>
/* Forward the player's own verdict to the card.

   A video whose owner has disabled embedding does not fail to load — it loads
   perfectly and then refuses, inside a cross-origin iframe nothing on this
   side can read. News publishers disable it routinely, so the card cannot
   assume that "the page loaded" means "the reader is watching something".

   With enablejsapi the player posts its events to us, so its own onError is
   the honest signal. 101 and 150 are "embedding disabled by the owner"; 2 and
   5 are a bad request or an unplayable format. */
(function(){
  var send = function(m){ try { window.ReactNativeWebView.postMessage(m); } catch(e){} };
  window.addEventListener('message', function(e){
    var d = e.data;
    if (typeof d !== 'string') return;
    try { d = JSON.parse(d); } catch(_) { return; }
    if (d && d.event === 'onError') send('error:' + d.info);
    if (d && d.event === 'onReady') send('ready');
  });
  var f = document.getElementById('p');
  f.addEventListener('load', function(){
    // handshake: the player only starts posting once it has been addressed
    try {
      f.contentWindow.postMessage(JSON.stringify(
        {event:'listening', id:'p', channel:'widget'}), '*');
    } catch(e){}
  });
})();
</script></body></html>`,
    [uri],
  );

  /* `enablejsapi=1` (set in youtubeEmbedUrl) means the iframe listens for
     commands posted to it. No API script to load, no player handle to wait
     for — just a message the embed already understands. */
  useEffect(() => {
    if (!ready) return;
    const fn = muted ? 'mute' : 'unMute';
    web.current?.injectJavaScript(
      `(function(){var f=document.querySelector('iframe');` +
        `if(f&&f.contentWindow)f.contentWindow.postMessage(` +
        `JSON.stringify({event:'command',func:'${fn}',args:[]}),'*');})();true;`,
    );
  }, [muted, ready]);

  if (!mounted) {
    return <Image source={{ uri: still }} style={StyleSheet.absoluteFill} contentFit="cover" />;
  }

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]}>
      {/* The player is always fully opaque.

          It used to be `opacity: ready ? 1 : 0`, with `ready` set only by
          onLoadEnd — so a single event that failed to arrive left the webview
          invisible forever, playing perfectly behind an opacity of zero. On
          Android, loading an iframe through `source={{html}}` is exactly the
          case where that event is unreliable, and with every playable Qix
          being a YouTube Short, that one gate was the difference between all
          video working and none of it.

          The poster covers the load instead, layered on top and removed when
          the page reports in — or on a timer, so nothing depends on the event
          arriving at all. */}
      <WebView
        ref={web}
        source={{ html, baseUrl: YOUTUBE_EMBED_ORIGIN }}
        style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]}
        onLoadEnd={() => setReady(true)}
        onError={() => {
          setReady(true);
          onRefused?.();
        }}
        onHttpError={() => {
          setReady(true);
          onRefused?.();
        }}
        onMessage={(e) => {
          const m = e.nativeEvent.data;
          if (m === 'ready') setReady(true);
          else if (m.startsWith('error:')) {
            setReady(true);
            onRefused?.();
          }
        }}
        // autoplay is the whole point of a feed video; without these the player
        // waits for a tap that the deck deliberately doesn't forward
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        // YouTube's player is JavaScript and keeps its state in DOM storage.
        // Both default to on, and both are fatal if a future default changes.
        javaScriptEnabled
        domStorageEnabled
        // the card owns every gesture — the deck's swipe must never be eaten
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        scalesPageToFit={false}
        setBuiltInZoomControls={false}
        pointerEvents="none"
      />
      {!ready ? (
        <Image
          source={{ uri: still }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          pointerEvents="none"
        />
      ) : null}
    </View>
  );
}
