import React from 'react';
import { View, StyleSheet, type TextProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { spring } from '@/theme';
import { useTheme } from '@/lib/theme';
import { Txt } from './ui';

/* Text that follows the voice reading it.

   Three segments in one Text, not one view per word: a wrapped paragraph of
   ~120 word-views would cost more to lay out than the whole rest of the card,
   and it would break the hyphenation and line-breaking the reading type is
   tuned for. Slicing at the spoken word keeps native text layout intact and
   repaints three nodes a few times a second.

     already read  →  full-strength ink
     being read    →  brand ink
     still to come →  dimmed

   No block behind the current word. A filled rectangle was the first attempt
   and it read as a selection artefact rather than a design: hard edges, and
   because nested Text can't carry a border radius on Android there is no way
   to soften it into a pill.

   The colour swap is also the only thing the current word is allowed to do.
   Weight or size would re-measure that word on every boundary event and shove
   the rest of the paragraph around several times a second — the text has to
   stay perfectly still while the colour moves through it. So the motion lives
   in the wipe (each word lighting up and staying lit) and in the rule below,
   and the word itself changes instantly, which is what keeps it locked to the
   voice instead of trailing it. */

type Props = TextProps & {
  text: string;
  /** index of the word being spoken, or -1 when this text isn't playing */
  start: number;
  length: number;
  size?: number;
  lh?: number;
  color?: string;
  weight?: React.ComponentProps<typeof Txt>['weight'];
  ls?: number;
  display?: boolean;
  /** draws the thin progress rule underneath */
  progress?: boolean;
};

export function SpokenText({ text, start, length, progress = false, style, ...type }: Props) {
  const { c, isDark } = useTheme();
  const active = start >= 0 && start < text.length;

  if (!active) {
    return (
      <Txt {...type} style={style}>
        {text}
      </Txt>
    );
  }

  const end = Math.min(start + Math.max(length, 1), text.length);
  const said = text.slice(0, start);
  const saying = text.slice(start, end);
  const toCome = text.slice(end);

  const base = type.color ?? c.ink;
  const dim = isDark ? 'rgba(220,228,240,0.42)' : 'rgba(30,36,47,0.40)';

  return (
    <View style={{ alignSelf: 'stretch' }}>
      <Txt {...type} style={style}>
        <Txt {...type} color={base}>
          {said}
        </Txt>
        <Txt {...type} color={isDark ? c.brandLight : c.brand}>
          {saying}
        </Txt>
        <Txt {...type} color={dim}>
          {toCome}
        </Txt>
      </Txt>
      {progress ? <ProgressRule value={end / Math.max(text.length, 1)} color={c.brand} /> : null}
    </View>
  );
}

/* The one genuinely animated part. The word highlight itself is deliberately
   instant — a highlight that eases into place lags the voice and reads as
   broken — so the motion lives here instead, a rule that springs along under
   the paragraph and fades in with the first word. */
function ProgressRule({ value, color }: { value: number; color: string }) {
  const p = useSharedValue(0);
  const appear = useSharedValue(0);

  React.useEffect(() => {
    p.value = withSpring(value, spring.gentle);
  }, [value, p]);

  React.useEffect(() => {
    appear.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) });
    return () => {
      appear.value = 0;
    };
  }, [appear]);

  // scaleX rather than a percentage width: a width inside useAnimatedStyle is
  // a layout property, and this spring is re-aimed on every spoken word, so
  // that was a Yoga pass per frame for the length of the article
  const fill = useAnimatedStyle(() => ({
    transform: [{ scaleX: Math.min(Math.max(p.value, 0), 1) }],
    opacity: appear.value,
  }));
  const track = useAnimatedStyle(() => ({ opacity: appear.value * 0.5 }));

  return (
    <View style={s.rail}>
      <Animated.View style={[s.track, track]} />
      <Animated.View style={[s.fill, { backgroundColor: color }, fill]} />
    </View>
  );
}

const s = StyleSheet.create({
  rail: {
    height: 2,
    marginTop: 12,
    borderRadius: 1,
    overflow: 'hidden',
  },
  track: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(127,140,160,0.22)',
  },
  fill: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    transformOrigin: 'left center',
    borderRadius: 1,
  },
});
