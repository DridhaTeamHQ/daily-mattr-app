import React, { useCallback, useEffect, useState } from 'react';
import { Modal, StyleSheet, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Image, type ImageSource } from 'expo-image';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { duration, spring } from '@/theme';
import { useMotionAllowed } from '@/lib/motion';
import { Txt } from './ui';
import { soft } from '@/lib/haptics';

/* Hold a photograph to see all of it.

   Every photo in the app is cropped to fill its frame — a Pix card shows the
   middle 66% of a landscape press shot, the reader card a tall slice of it.
   Holding lifts the same image out at `contain`, so nothing is cut off, over a
   black ground with the card's chrome gone.

   It is a peek, not a screen: the image is up while the finger is down and
   settles back on release. Nothing to dismiss, nothing to navigate back from,
   and no way to end up somewhere you didn't mean to be.

   Long-press fails if the finger travels more than a few points, so this never
   competes with the deck's vertical paging, the Pix pager, or the sideways
   swipe through retellings — a drag is a drag, and only a still finger peeks. */
export function ImagePeek({
  source,
  caption,
  style,
  children,
}: {
  source: ImageSource | number;
  /** shown under the image while held — usually the headline */
  caption?: string;
  /** Position the target yourself when the photo can't be wrapped — the reader
      card's image lives inside a mask, so it gets a transparent hit area laid
      over the image instead. */
  style?: ViewStyle;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { width: winW, height: winH } = useWindowDimensions();
  const animate = useMotionAllowed();

  // 0 closed, 1 fully lifted
  const p = useSharedValue(0);

  const close = useCallback(() => {
    if (!animate) {
      p.value = 0;
      setOpen(false);
      return;
    }
    p.value = withTiming(0, { duration: duration.quick, easing: Easing.in(Easing.cubic) }, (done) => {
      if (done) runOnJS(setOpen)(false);
    });
  }, [animate, p]);

  useEffect(() => {
    if (!open) return;
    p.value = animate
      ? withSpring(1, spring.snappy)
      : 1;
  }, [open, animate, p]);

  const peek = React.useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(240)
        // a moving finger is a scroll or a swipe, never a peek
        .maxDistance(12)
        .shouldCancelWhenOutside(false)
        .onStart(() => {
          runOnJS(soft)();
          runOnJS(setOpen)(true);
        })
        // fires on release AND on cancel, so the image can never be left up
        .onFinalize(() => {
          runOnJS(close)();
        }),
    [close],
  );

  const backdrop = useAnimatedStyle(() => ({ opacity: p.value }));

  const frame = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [
      // rises the last of the way rather than starting from nothing — the
      // photo is already on screen behind it, so it should feel lifted, not born
      { scale: 0.94 + p.value * 0.06 },
    ],
  }));

  const hint = useAnimatedStyle(() => ({ opacity: p.value * 0.85 }));

  return (
    <>
      <GestureDetector gesture={peek}>
        <View style={style}>{children}</View>
      </GestureDetector>

      <Modal
        visible={open}
        transparent
        // driven by Reanimated instead, so the two don't fight over the same frames
        animationType="none"
        statusBarTranslucent
        onRequestClose={close}
      >
        <Animated.View style={[StyleSheet.absoluteFill, s.backdrop, backdrop]} pointerEvents="none">
          <Animated.View style={[s.frame, frame]}>
            <Image
              source={source}
              style={{ width: winW, height: winH * 0.72 }}
              // the whole point: nothing cropped
              contentFit="contain"
              transition={0}
            />
            {caption ? (
              <Animated.View style={[s.caption, hint]}>
                <Txt size={13.5} lh={19} weight="semibold" color="rgba(255,255,255,0.9)" numberOfLines={2} style={{ textAlign: 'center' }}>
                  {caption}
                </Txt>
              </Animated.View>
            ) : null}
            <Animated.View style={[s.release, hint]}>
              <Txt size={10.5} weight="bold" color="rgba(255,255,255,0.5)" ls={1.4}>
                RELEASE TO CLOSE
              </Txt>
            </Animated.View>
          </Animated.View>
        </Animated.View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  backdrop: { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  frame: { alignItems: 'center', justifyContent: 'center' },
  caption: { paddingHorizontal: 34, marginTop: 22 },
  release: { marginTop: 14 },
});
