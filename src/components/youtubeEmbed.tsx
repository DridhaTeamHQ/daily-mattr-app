import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { Image } from 'expo-image';
import { youtubeEmbedUrl } from '@/lib/media';

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
}: {
  videoId: string;
  muted?: boolean;
  poster?: string | null;
  /** false while the card is off screen — unmounts the player rather than
      leaving a hidden webview holding a decoder and an audio session */
  playing?: boolean;
}) {
  const [ready, setReady] = useState(false);
  const web = useRef<WebView>(null);

  /* Built once per video, NOT per mute state.
     Rebuilding the html on unmute would reload the iframe and restart the clip
     from zero — the reader taps the speaker and loses their place. The embed is
     started muted (autoplay is refused otherwise on every mobile browser) and
     the sound is turned on afterwards through the player's own command API. */
  const uri = useMemo(() => youtubeEmbedUrl(videoId, { muted: true }), [videoId]);

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
<body><div class="wrap"><iframe src="${uri}"
  allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div></body></html>`,
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

  if (!playing) {
    return poster ? (
      <Image source={{ uri: poster }} style={StyleSheet.absoluteFill} contentFit="cover" />
    ) : (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} />
    );
  }

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]}>
      <WebView
        ref={web}
        source={{ html, baseUrl: 'https://www.youtube-nocookie.com' }}
        style={[StyleSheet.absoluteFill, { opacity: ready ? 1 : 0, backgroundColor: '#000' }]}
        onLoadEnd={() => setReady(true)}
        // autoplay is the whole point of a feed video; without these two the
        // player waits for a tap that the deck deliberately doesn't forward
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        // the card owns every gesture — the deck's swipe must never be eaten
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        scalesPageToFit={false}
        setBuiltInZoomControls={false}
        pointerEvents="none"
        androidLayerType="hardware"
      />
      {/* Painted over the webview until its first frame lands, then faded out
          by the opacity above — a webview is white before it draws. */}
      {!ready && poster ? (
        <Image source={{ uri: poster }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : null}
    </View>
  );
}
