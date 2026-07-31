import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle, G, Line, Polygon, Text as SvgText } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Txt } from './ui';
import { useTheme } from '@/lib/theme';
import { useMotionAllowed } from '@/lib/motion';
import { toSlices, type RadarSlice } from '@/lib/radar';

export { toSlices, type RadarSlice };

/* What this reader actually reads, by category.
 *
 * A bar chart would rank the categories; a radar shows the *shape* of someone's
 * attention — where it is broad, where it is a spike, and which directions are
 * empty. The empty directions are the interesting part, and they are the one
 * thing a ranked list cannot show you.
 *
 * Two rings, like the reference: what they read against what was there to read.
 * Reading a lot of Sports in a week with little Sports in it is a different
 * fact from reading a lot of Sports in a week full of it, and only the second
 * ring can tell them apart.
 *
 * Drawn with react-native-svg, which the app already uses for ProgressRing.
 * No chart library and no image — the shape is the data.
 */

const AnimatedPolygon = Animated.createAnimatedComponent(Polygon);

/** Rings behind the shape. Four reads as a grid without becoming a target. */
const RINGS = 4;

/* Polar → cartesian, starting at twelve o'clock and going clockwise.
 *
 * Both of these are worklets because useAnimatedProps below runs on the UI
 * thread and calls them every frame. Without the directive Reanimated treats
 * them as remote functions and throws the moment the chart animates — which is
 * immediately, since the entrance is the first thing it does. */
function point(cx: number, cy: number, r: number, i: number, n: number) {
  'worklet';
  const a = (Math.PI * 2 * i) / n - Math.PI / 2;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
}

function polygon(values: number[], cx: number, cy: number, radius: number): string {
  'worklet';
  return values
    .map((v, i) => {
      // A floor, so a category with nothing still has a vertex — otherwise the
      // shape collapses through the centre and reads as a crossed-out star.
      const [x, y] = point(cx, cy, radius * (0.06 + 0.94 * Math.max(0, Math.min(1, v))), i, values.length);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export function InterestRadar({
  slices,
  size = 260,
}: {
  slices: RadarSlice[];
  size?: number;
}) {
  const { c } = useTheme();
  const motion = useMotionAllowed();

  // Room for the labels, which sit outside the plot.
  const pad = 34;
  const radius = (size - pad * 2) / 2;
  const cx = size / 2;
  const cy = size / 2;

  const grow = useSharedValue(motion ? 0 : 1);
  useEffect(() => {
    if (!motion) {
      grow.value = 1;
      return;
    }
    grow.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [grow, motion, slices]);

  const readValues = useMemo(() => slices.map((s) => s.read), [slices]);
  const availValues = useMemo(() => slices.map((s) => s.available), [slices]);

  /* Animated by re-deriving the polygon on the UI thread rather than by
     scaling the whole SVG — scaling would drag the axis labels in with it. */
  const readProps = useAnimatedProps(() => ({
    points: polygon(
      readValues.map((v) => v * grow.value),
      cx,
      cy,
      radius,
    ),
  }));
  const availProps = useAnimatedProps(() => ({
    points: polygon(
      availValues.map((v) => v * grow.value),
      cx,
      cy,
      radius,
    ),
  }));

  const grid = c.inkFaint;

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size}>
        <G>
          {Array.from({ length: RINGS }, (_, i) => (
            <Circle
              key={i}
              cx={cx}
              cy={cy}
              r={(radius * (i + 1)) / RINGS}
              stroke={grid}
              strokeOpacity={0.16}
              strokeWidth={1}
              fill="none"
            />
          ))}

          {slices.map((s, i) => {
            const [x, y] = point(cx, cy, radius, i, slices.length);
            return (
              <Line
                key={s.topic}
                x1={cx}
                y1={cy}
                x2={x}
                y2={y}
                stroke={grid}
                strokeOpacity={0.16}
                strokeWidth={1}
              />
            );
          })}

          {/* What was on offer, underneath — context, not a result. */}
          <AnimatedPolygon
            animatedProps={availProps}
            fill={grid}
            fillOpacity={0.1}
            stroke={grid}
            strokeOpacity={0.32}
            strokeWidth={1.25}
          />

          {/* What they read, on top. */}
          <AnimatedPolygon
            animatedProps={readProps}
            fill={c.brand}
            fillOpacity={0.28}
            stroke={c.brand}
            strokeWidth={2}
          />

          {slices.map((s, i) => {
            const [x, y] = point(cx, cy, radius + 15, i, slices.length);
            // Anchor by which side of the circle the label sits on, so nothing
            // overhangs the edge of the card.
            const anchor = x < cx - 4 ? 'end' : x > cx + 4 ? 'start' : 'middle';
            return (
              <SvgText
                key={s.topic}
                x={x}
                y={y + 3.5}
                fill={c.inkSoft}
                fontSize={9.5}
                fontWeight="700"
                textAnchor={anchor}
              >
                {s.topic}
              </SvgText>
            );
          })}
        </G>
      </Svg>

      <View style={s.key}>
        <Key colour={c.brand} label="What you read" />
        <Key colour={c.inkFaint} label="What was published" />
      </View>
    </View>
  );
}

function Key({ colour, label }: { colour: string; label: string }) {
  return (
    <View style={s.keyItem}>
      <View style={[s.swatch, { backgroundColor: colour }]} />
      <Txt size={11.5} weight="semibold" color={colour}>
        {label}
      </Txt>
    </View>
  );
}

const s = StyleSheet.create({
  key: { flexDirection: 'row', gap: 18, marginTop: 6 },
  keyItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 9, height: 9, borderRadius: 3 },
});
