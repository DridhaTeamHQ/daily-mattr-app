import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { useMotionAllowed } from '@/lib/motion';

/* Pages visibly hand off: leaving page scales to 0.94 and dims.

   The dim is a black overlay rather than `opacity` on the card, and that
   distinction is the single most expensive thing in this file.

   Setting opacity < 1 on a ViewGroup whose children overlap makes Android take
   the hasOverlappingRendering() path and allocate a screen-sized offscreen
   buffer — a saveLayer — on EVERY frame. This card's children all overlap: a
   full-screen sharp image, a full-screen blurred backdrop, a MaskedView (which
   is itself already a hardware layer) and five gradients. With windowSize 3,
   three cards are mounted and during any swipe all three sit strictly between
   0.55 and 1, so that was three screen-sized buffers, each containing a second
   nested one, allocated and composited per frame for the whole gesture.

   A solid-colour View has nothing to composite against, so animating ITS
   opacity is close to free. `scale` on the card was never the problem —
   transforms don't trigger the offscreen path. */
export function PageShell({ index, pageH, scrollY, children }: { index: number; pageH: number; scrollY: SharedValue<number>; children: React.ReactNode }) {
  /* Reduce Motion drops the scale but keeps the dim.
     The guidance is about movement, not about contrast: a full-screen card
     scaling as it leaves is exactly the effect to suppress, whereas a page
     that darkens on its way out is a crossfade and carries the same
     information without moving anything. */
  const motion = useMotionAllowed();
  const a = useAnimatedStyle(() => {
    if (!motion) return { transform: [{ scale: 1 }] };
    const pos = [(index - 1) * pageH, index * pageH, (index + 1) * pageH];
    return {
      transform: [{ scale: interpolate(scrollY.value, pos, [0.94, 1, 0.94], Extrapolation.CLAMP) }],
    };
  }, [motion, index, pageH]);
  const dim = useAnimatedStyle(() => {
    const pos = [(index - 1) * pageH, index * pageH, (index + 1) * pageH];
    return { opacity: interpolate(scrollY.value, pos, [0.45, 0, 0.45], Extrapolation.CLAMP) };
  });
  return (
    <Animated.View style={[{ height: pageH }, a]}>
      {children}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, s.pageDim, dim]} />
    </Animated.View>
  );
}

const s = StyleSheet.create({
  pageDim: { backgroundColor: '#000' },
});
