import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useRouter } from 'expo-router';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { radius, topicOf } from '@/theme';
import { useTheme } from '@/lib/theme';
import { Txt, Press, EasedScrim, LIcon } from './ui';
import { type Article, timeAgo } from '@/lib/content';
import { trackImpression } from '@/lib/telemetry';
import { artFor } from '@/lib/topicArt';
import { useMotionAllowed } from '@/lib/motion';
import { useIsActiveCard } from '@/lib/activeCard';
import { playbackFor } from '@/lib/media';

/* The video slot in the feed.

   This was a *simulated* video for a long time: the story's own photograph on
   a slow push-in, because the pipeline had no video column and stock footage
   under a real headline reads as filler. The CMS publishes actual clips now,
   so when there is one, this plays it — a card promising motion and delivering
   a still is the single most broken-looking thing in the app.

   It plays only while it is the card on screen (lib/activeCard, fed by Home's
   viewability callback). A feed list keeps several cards mounted either side
   of the viewport, and a video decoder each would cost battery and frames for
   footage nobody is looking at.

   The Ken Burns pan survives for stories that are photographs — most of the
   feed — and for a clip that has not started yet, so the poster never sits
   perfectly still while the video wakes up. */

const DURATION = 9000;

function MotionCardBase({
  a,
  index = 0,
  height = 260,
}: {
  a: Article;
  index?: number;
  /** taller in the full-screen reader deck than in the Home list */
  height?: number;
}) {
  const { c, isDark } = useTheme();
  const router = useRouter();
  const t = topicOf(a.topic);
  const p = useSharedValue(0);

  useEffect(() => trackImpression(a.id, a.topic), [a.id, a.topic]);

  /* What this card actually has. A CMS video carries a file; everything else
     is a photograph and keeps the pan it always had. */
  const pb = useMemo(() => playbackFor(a.mediaUrl), [a.mediaUrl]);
  const isVideo = pb.kind === 'file';
  const onScreen = useIsActiveCard(a.id);
  const [firstFrame, setFirstFrame] = useState(false);

  /* A decoder only while the card is actually on screen.

     The source was `isVideo ? url : null`, which builds a player for every
     video card in the mounted window — and both tabs stay mounted when you
     switch between them, so the deck's players and the feed's players are
     alive at the same time. Android hands out a small, fixed number of
     hardware MediaCodec instances; past it the app does not degrade, it dies.
     That is what "cannot take the load" was.

     Passing null releases the player. Coming back to a card rebuilds it, which
     costs a moment of buffering — covered by the poster, which is held until
     the first frame arrives anyway. */
  const player = useVideoPlayer(isVideo && onScreen ? pb.url : null, (pl) => {
    pl.loop = true;
    // A feed that starts talking as you scroll is how an app gets closed.
    // Sound belongs to the full-screen card, where it can be asked for.
    pl.muted = true;
  });

  useEffect(() => {
    if (!isVideo) return;
    try {
      if (onScreen) player.play();
      else player.pause();
    } catch {
      // the player can be released as the list recycles this row; nothing to
      // recover and nothing worth reporting
    }
  }, [isVideo, onScreen, player]);

  /* Hold the poster until there is a frame to replace it with.
     A VideoView paints black before its first frame, and a black rectangle
     dropping into a scrolling feed reads as a broken card. */
  useEffect(() => {
    if (!isVideo || !onScreen) {
      setFirstFrame(false);
      return;
    }
    const id = setInterval(() => {
      try {
        if (player.currentTime > 0) setFirstFrame(true);
      } catch {}
    }, 120);
    const bail = setTimeout(() => setFirstFrame(true), 2000);
    return () => {
      clearInterval(id);
      clearTimeout(bail);
    };
  }, [isVideo, onScreen, player]);

  // with Reduce Motion on this is simply a photograph — see lib/motion.ts
  const motion = useMotionAllowed();
  useEffect(() => {
    // a clip has its own movement; panning it as well is two things at once
    if (isVideo && onScreen) return;
    if (!motion) {
      p.value = 0.35;
      return;
    }
    p.value = withRepeat(
      withTiming(1, { duration: DURATION, easing: Easing.inOut(Easing.quad) }),
      -1,
      true, // reverse, so it breathes instead of snapping back
    );
  }, [p, motion, isVideo, onScreen]);

  const ken = useAnimatedStyle(() => ({
    transform: [
      { scale: 1 + p.value * 0.14 },
      { translateX: p.value * -14 },
      { translateY: p.value * -10 },
    ],
  }));

  return (
    <Press
      haptic={false}
      scaleTo={0.985}
      onPress={() => router.push(`/article/${a.id}`)}
      accessibilityRole="button"
      accessibilityLabel={a.title}
      style={[s.wrap, isDark ? null : s.lift]}
    >
      <View style={[s.clip, { height }]}>
        {/* overflow:hidden lives on the parent so the scaling image is cropped
            rather than pushing the card's own bounds around */}
        {isVideo ? (
          <VideoView
            player={player}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            nativeControls={false}
            allowsPictureInPicture={false}
          />
        ) : null}

        {/* The poster: the whole card for a photograph, and the first moment
            of a video. Kept mounted underneath rather than swapped out, so
            there is never a frame with nothing in it. */}
        {!isVideo || !firstFrame ? (
          <Animated.View style={[StyleSheet.absoluteFill, ken]}>
            <Image
              source={a.imageUrl ? { uri: a.imageUrl } : artFor(a.topic)}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              recyclingKey={a.id}
              transition={320}
            />
          </Animated.View>
        ) : null}

        <EasedScrim variant="bottom" style={s.scrim} />

        <View style={s.top}>
          <View style={s.pill}>
            <Txt size={11} weight="semibold" color="#fff" ls={0.3}>
              {a.topic}
            </Txt>
          </View>
          <View style={s.pill}>
            <Txt size={11} weight="medium" color="#fff">
              {timeAgo(a.publishedAt)}
            </Txt>
          </View>
        </View>

        <View style={s.copy}>
          <Txt display size={21} lh={27} weight="extrabold" ls={-0.6} color="#fff" numberOfLines={3}>
            {a.title}
          </Txt>
          <View style={s.meta}>
            <LIcon name="circle-play" size={13} color="rgba(255,255,255,0.85)" strokeWidth={2.2} />
            <Txt size={11.5} weight="semibold" color="rgba(255,255,255,0.85)">
              {a.publisher} · {a.readMins} min read
            </Txt>
          </View>
        </View>
      </View>
    </Press>
  );
}

/* Memoised: a feed cell must not re-render because the list array was rebuilt.
   See the note on ArticleRow in components/cards.tsx. */
export const MotionCard = React.memo(MotionCardBase);

const s = StyleSheet.create({
  wrap: { marginHorizontal: 24, marginTop: 8, marginBottom: 22 },
  lift: { boxShadow: '0 14px 34px rgba(10,20,40,0.16)' },
  clip: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#0E1524',
  },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 190 },
  top: {
    position: 'absolute',
    top: 13,
    left: 13,
    right: 13,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pill: {
    backgroundColor: 'rgba(11,13,18,0.42)',
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  copy: { position: 'absolute', left: 18, right: 18, bottom: 16 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 9 },
});
