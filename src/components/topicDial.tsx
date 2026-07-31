import React, { useMemo } from 'react';
import { View, StyleSheet, Dimensions, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { spring } from '@/theme';
import { tick } from '@/lib/haptics';
import { CATEGORY_NAMES } from '@/lib/categories';
import { Txt, Press, LIcon, TopicBubble } from './ui';

/* ---------- Full-screen topic dial ----------
   Big artwork bubbles centered over a dimmed backdrop; drag to spin with
   haptic detents — the centered bubble swells into the ring; tap to choose.

   Lifted out of app/(tabs)/reader.tsx, which had grown to 1600 lines holding
   the deck, this dial, the reader card and the page shell. No behaviour
   change — the same components, the same constants, the same gestures. */

const { width: W } = Dimensions.get('window');
/* The desk's categories, in the desk's order.
   This read `Object.keys(topicArt)` — every piece of artwork the app happened
   to ship, which is how the dial came to offer six categories no editor could
   file a story under. Artwork is now a consequence of the category list rather
   than the definition of it. */
const READER_TOPICS = CATEGORY_NAMES;

const WHEEL_ROW = 108;
/* Sentinels, not real topics. Pix and Video are *formats* — the desk publishes
   a story as one — so they sit in the same ring as the topics without being
   one, and the deck switches source rather than filtering. */
export const PIX_FILTER = '•Pix';
export const VIDEO_FILTER = '•Video';
export const FORMAT_FILTERS: string[] = [PIX_FILTER, VIDEO_FILTER];
export const isFormatFilter = (t: string | null): boolean =>
  t !== null && FORMAT_FILTERS.includes(t);
export const WHEEL_ITEMS: (string | null)[] = [null, PIX_FILTER, VIDEO_FILTER, ...READER_TOPICS]; // null = For You

/* The dial is a half-circle hinged off the right edge: every topic is placed
   by its angle, so the focused one swings out toward the middle of the screen
   and the rest curve back toward the edge above and below it. Driven by one
   shared value the press-drag gesture writes to. */

const ARC_STEP = 0.42; // radians between neighbours
// An ellipse, not a circle: the vertical radius reaches the top and bottom
// edges of the screen while the horizontal one keeps the focused bubble
// roughly centred instead of shoving it off the left side.
const ARC_RX = W * 0.58;
const ARC_CX = W + 26; // centre sits just off the right edge, so only half shows
const ARC_EDGE = 1.62; // past this angle a bubble has left the visible arc
const BUBBLE = 86;
export const DRAG_PX = 74; // finger travel per topic

// Shortest way round the ring, so topics always fill the arc above AND below
// the focus instead of fanning off in one direction from the first item.
function arcAngle(index: number, spin: number): number {
  'worklet';
  const n = WHEEL_ITEMS.length;
  let d = (((index - spin) % n) + n) % n;
  if (d > n / 2) d -= n;
  return d * ARC_STEP;
}

export function TopicWheel({
  selected,
  onSelect,
  onClose,
  brand,
  spin,
}: {
  selected: string | null;
  onSelect: (t: string | null) => void;
  onClose: () => void;
  brand: string;
  spin: SharedValue<number>;
}) {
  const { height: winH } = useWindowDimensions();
  const cy = winH / 2;
  const ry = winH * 0.54; // arc runs off the top and bottom edges

  // Once the dial is open by tap it still has to be spinnable — this drags the
  // wheel from any empty space, throws with the flick, and settles on a detent.
  // Tapping that same empty space dismisses.
  const dragFrom = useSharedValue(0);
  const browse = useMemo(() => {
    const drag = Gesture.Pan()
      .minDistance(6)
      .onStart(() => {
        dragFrom.value = spin.value;
      })
      .onUpdate((e) => {
        spin.value = dragFrom.value - e.translationY / DRAG_PX;
      })
      .onEnd((e) => {
        const thrown = spin.value - (e.velocityY / DRAG_PX) * 0.09;
        spin.value = withSpring(Math.round(thrown), spring.gentle);
      });
    const dismiss = Gesture.Tap().onEnd((_e, ok) => {
      if (ok) runOnJS(onClose)();
    });
    return Gesture.Exclusive(drag, dismiss);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  // a detent every time a new topic takes the focus point
  useAnimatedReaction(
    () => Math.round(spin.value),
    (cur, prev) => {
      if (prev !== null && cur !== prev) runOnJS(tick)();
    },
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* drag surface sits behind the bubbles so their taps still land */}
      <GestureDetector gesture={browse}>
        <View style={StyleSheet.absoluteFill} />
      </GestureDetector>
      {WHEEL_ITEMS.map((t, i) => (
        <ArcBubble key={t ?? 'foryou'} index={i} spin={spin} cy={cy} ry={ry}>
          {t === null || isFormatFilter(t) ? (
            <Press
              haptic={false}
              onPress={() => {
                spin.value = i;
                onSelect(t);
              }}
              scaleTo={0.94}
              style={{ alignItems: 'center' }}
            >
              {/* A format gets its own bubble rather than a topic artwork with
                  the sentinel showing through */}
              <FormatBubble
                kind={t === null ? 'foryou' : t === PIX_FILTER ? 'pix' : 'video'}
                brand={brand}
              />
            </Press>
          ) : (
            <TopicBubble
              topic={t}
              size={BUBBLE}
              selected={selected === t}
              onPress={() => {
                spin.value = i;
                onSelect(t);
              }}
            />
          )}
        </ArcBubble>
      ))}
    </View>
  );
}

// translate and scale live on separate views so the scale always pivots on the
// bubble's own centre rather than its translated origin
function ArcBubble({
  index,
  spin,
  cy,
  ry,
  children,
}: {
  index: number;
  spin: SharedValue<number>;
  cy: number;
  ry: number;
  children: React.ReactNode;
}) {
  const place = useAnimatedStyle(() => {
    const theta = arcAngle(index, spin.value);
    const ad = Math.abs(theta);
    return {
      opacity: interpolate(ad, [0, 0.42, 1.15, ARC_EDGE], [1, 0.66, 0.26, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: ARC_CX - ARC_RX * Math.cos(theta) - BUBBLE / 2 },
        { translateY: cy + ry * Math.sin(theta) - BUBBLE / 2 },
      ],
    };
  });
  const size = useAnimatedStyle(() => {
    const ad = Math.abs(arcAngle(index, spin.value));
    return { transform: [{ scale: interpolate(ad, [0, 0.42, 1.0, ARC_EDGE], [1.58, 0.98, 0.66, 0.48], Extrapolation.CLAMP) }] };
  });
  return (
    <Animated.View
      style={[{ position: 'absolute', left: 0, top: 0, width: BUBBLE, height: BUBBLE, alignItems: 'center', justifyContent: 'center' }, place]}
    >
      <Animated.View style={size}>{children}</Animated.View>
    </Animated.View>
  );
}


/* The For You and Pix bubbles.

   Shared rather than duplicated: the dial draws them in the ring, and the
   reader screen draws the chosen one again for the bloom that plays over the
   deck. Two copies of a 92pt circle drifted apart the moment either was
   touched, and the bloom's whole job is to look like the same object. */
const FORMAT_LOOK: Record<
  string,
  { grad: [string, string]; icon: string; label: string; art: any }
> = {
  pix: {
    grad: ['#9B6CFF', '#5B2BD9'],
    icon: 'images',
    label: 'Pix',
    art: require('../../assets/images/topics/pix.webp'),
  },
  // warm against Pix's violet, so the two format bubbles never read as the same
  // one glimpsed twice as the ring spins past
  video: {
    grad: ['#FF7A59', '#E03E7A'],
    icon: 'circle-play',
    label: 'Video',
    art: require('../../assets/images/topics/video.webp'),
  },
  foryou: {
    grad: ['#4D88FF', '#16295C'],
    icon: 'sparkles',
    label: 'For You',
    art: require('../../assets/images/topics/for-you.webp'),
  },
};

export function FormatBubble({
  kind,
  brand,
}: {
  kind: 'foryou' | 'pix' | 'video';
  brand: string;
}) {
  const look = FORMAT_LOOK[kind];
  return (
    /* A photograph, like every other bubble in the ring.

       These three were flat gradients while the eight categories carried
       artwork, so they read as unfinished next to them — the wheel looked like
       it was missing three images. Same treatment now: a monochrome frame with
       the format's own colour laid over it, so it is still the colour that
       tells them apart at a glance while the ring is spinning. */
    <View style={st.forYouBubble}>
      <Image source={look.art} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient
        colors={[look.grad[0] + 'B8', look.grad[1] + 'E0']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={st.formatInner}>
        <LIcon name={look.icon} size={20} color="#fff" strokeWidth={2.2} />
        <Txt size={12} weight="bold" color="#fff" style={{ marginTop: 3 }}>
          {look.label}
        </Txt>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  forYouBubble: {
    width: 92,
    height: 92,
    borderRadius: 46,
    overflow: 'hidden',
    boxShadow: '0 10px 30px rgba(57,121,255,0.45)',
  },
  formatInner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
