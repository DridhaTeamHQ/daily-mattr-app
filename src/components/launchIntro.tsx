import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useMotionAllowed } from '@/lib/motion';

/* The first three seconds of the app.
 *
 * A launch animation is usually a logo doing something. This is the opening
 * screen's own photograph, moving — the clip was generated from that exact
 * frame, so when it finishes it *is* the still, and the app appears to settle
 * into the picture rather than cut to it. There is no visible handover.
 *
 * It is a courtesy, not a gate. It plays once per launch, never blocks, and
 * anything that could make it fail — a codec, a missing file, Reduce Motion —
 * ends with the same still image the app would have shown anyway.
 */

/** Long enough to read as a shot, short enough not to be a toll booth. */
const HOLD_MS = 2600;
const FADE_MS = 620;
/** Insurance: if the player never reports readiness, leave anyway. */
const BAIL_MS = 4200;

export function LaunchIntro({ onDone }: { onDone: () => void }) {
  const motion = useMotionAllowed();
  const [gone, setGone] = useState(false);
  const veil = useSharedValue(0);

  const player = useVideoPlayer(
    // Reduce Motion gets no video at all — not a paused one, which would still
    // pay the decode cost for something the reader asked not to see.
    motion ? require('../../assets/video/launch.mp4') : null,
    (p) => {
      p.loop = false;
      p.muted = true;
      /* Silent, and it must stay silent even if something else is playing.
         An intro that ducks the reader's music to say nothing is a bad trade. */
      if (motion) p.play();
    },
  );

  const finish = useCallback(() => {
    setGone(true);
    onDone();
  }, [onDone]);

  useEffect(() => {
    if (!motion) {
      // Straight through, no fade to wait on.
      finish();
      return;
    }

    const start = setTimeout(() => {
      veil.value = withTiming(1, { duration: FADE_MS, easing: Easing.out(Easing.quad) }, (done) => {
        if (done) runOnJS(finish)();
      });
    }, HOLD_MS);

    /* A second timer rather than trusting the first.
       If the video errors, the fade still runs; if the fade's callback is
       dropped — a real possibility when the JS thread is busy on first
       launch — this is what stops the app sitting on a black frame. */
    const bail = setTimeout(finish, BAIL_MS);

    return () => {
      clearTimeout(start);
      clearTimeout(bail);
    };
  }, [motion, veil, finish]);

  const fade = useAnimatedStyle(() => ({ opacity: 1 - veil.value }));

  if (gone) return null;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, s.root, fade]} pointerEvents="none">
      {/* The still sits underneath the whole time. The video fades into it, so
          a dropped frame or a slow first decode shows the photograph rather
          than black. */}
      <Image
        source={require('../../assets/images/onboarding-hero.webp')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
      />

      {motion ? (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          nativeControls={false}
          // Nothing here should offer to leave for another window.
          allowsPictureInPicture={false}
        />
      ) : null}

      <LinearGradient
        colors={['rgba(7,9,15,0.55)', 'rgba(7,9,15,0)', 'rgba(7,9,15,0.85)']}
        locations={[0, 0.42, 1]}
        style={StyleSheet.absoluteFill}
      />

      <WordmarkReveal motion={motion} />
    </Animated.View>
  );
}

/* The name arrives after the picture, not with it.
   Together they compete; a beat apart, the photograph reads first and the
   wordmark lands on top of an image the eye has already accepted. */
function WordmarkReveal({ motion }: { motion: boolean }) {
  const show = useSharedValue(motion ? 0 : 1);

  useEffect(() => {
    if (!motion) return;
    show.value = withDelay(
      620,
      withTiming(1, { duration: 760, easing: Easing.out(Easing.cubic) }),
    );
  }, [show, motion]);

  const style = useAnimatedStyle(() => ({
    opacity: show.value,
    // A few points of rise, not a slide. More than this and it reads as a
    // transition rather than as the title of a photograph.
    transform: [{ translateY: (1 - show.value) * 10 }],
  }));

  return (
    <View style={s.centre} pointerEvents="none">
      <Animated.View style={style}>
        <Image
          source={require('../../assets/images/wordmark.svg')}
          style={{ width: 208, height: 40 }}
          contentFit="contain"
          tintColor="#fff"
        />
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    backgroundColor: '#07090F',
    // Above every screen, including the splash the OS hands over from.
    zIndex: 100,
    elevation: Platform.OS === 'android' ? 100 : 0,
  },
  centre: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
