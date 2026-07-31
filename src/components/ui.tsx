import React, { useEffect } from 'react';
import { Text, TextProps, View, Pressable, StyleSheet, ViewStyle, PressableProps } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import Svg, { Circle } from 'react-native-svg';
import { artFor } from '@/lib/topicArt';
import * as Lucide from 'lucide-react-native';
import { tick } from '@/lib/haptics';
import { useMotionAllowed } from '@/lib/motion';
import { colors, font, display, type, radius, spring, scrim } from '@/theme';
import { useTheme } from '@/lib/theme';
import { enterReward } from '@/lib/transitions';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/* ---------- Lucide wrapper: kebab-case name → component ---------- */

export function LIcon({
  name,
  size = 22,
  color,
  strokeWidth = 1.8,
  fill,
  style,
}: {
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
  fill?: string;
  style?: ViewStyle;
}) {
  const { c } = useTheme();
  if (!color) color = c.ink;
  if (color === colors.ink) color = c.ink;
  if (fill === colors.ink) fill = c.ink;
  const pascal = name
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
  const Cmp = (Lucide as any)[pascal] ?? (Lucide as any).Newspaper;
  return <Cmp size={size} color={color} strokeWidth={strokeWidth} fill={fill ?? 'none'} style={style} />;
}

/* ---------- Typography ---------- */

/* Type scales with the reader's system font size, up to a point.

   Every size in this app is a fixed point value paired with a fixed
   lineHeight, and `numberOfLines` is used almost everywhere — so at Android's
   largest display sizes (which go well past 2x) headlines did not reflow, they
   clipped, and card layouts built around a known text height broke outright.
   Ignoring the setting entirely was not an option either: it is the single
   most-used accessibility feature there is.

   1.3 is the compromise: a third larger is a real, useful increase and every
   layout here survives it. Past that the app would need a genuinely different
   set of layouts rather than a bigger font, which is a larger piece of work
   than a multiplier. Applied at the two components every string in the app
   goes through, so there is one place to raise it later. */
const MAX_FONT_SCALE = 1.3;

type TStyle = { size: number; lh: number; ls: number; f: string };
function makeText(t: TStyle, extra?: object) {
  return function T(props: TextProps & { color?: string }) {
    const { c } = useTheme();
    const { color = c.ink, style, ...rest } = props;
    return (
      <Text
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        {...rest}
        style={[{ fontFamily: t.f, fontSize: t.size, lineHeight: t.lh, letterSpacing: t.ls, color, userSelect: 'none' as const }, extra, style]}
      />
    );
  };
}

export const Hero = makeText(type.hero);
export const StoryTitle = makeText(type.storyTitle);
export const Headline = makeText(type.headline);
export const Section = makeText(type.section);
export const CardTitle = makeText(type.cardTitle);
export const Subtitle = makeText(type.subtitle);
export const BodyText = makeText(type.body);
export const Caption = makeText(type.caption);
export const Meta = makeText(type.meta);
export const Overline = makeText(type.overline, { textTransform: 'uppercase' });

export function Txt(
  props: TextProps & {
    size?: number;
    lh?: number;
    color?: string;
    weight?: keyof typeof font;
    ls?: number;
    display?: boolean;
  },
) {
  const { c } = useTheme();
  const { size = 14, lh, color = c.ink, weight = 'regular', ls = 0, display: useDisplay, style, ...rest } = props;
  const family = useDisplay ? display[weight] ?? display.bold : font[weight];
  return (
    <Text
      // before the spread, so a caller that genuinely needs a different cap
      // can still pass one — see MAX_FONT_SCALE above
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      {...rest}
      style={[{ fontFamily: family, fontSize: size, lineHeight: lh ?? size * 1.45, letterSpacing: ls, color, userSelect: 'none' as const }, style]}
    />
  );
}

/* ---------- Eased scrims (6-stop, no banding) ---------- */

export function EasedScrim({ variant = 'bottom', style }: { variant?: keyof typeof scrim; style?: any }) {
  const { isDark } = useTheme();
  let cols: readonly string[] = scrim[variant].colors;
  if (variant === 'toWhite' && isDark) {
    // fade into the dark canvas instead of white
    cols = [
      'rgba(10,14,23,0)',
      'rgba(10,14,23,0.06)',
      'rgba(10,14,23,0.25)',
      'rgba(10,14,23,0.62)',
      'rgba(10,14,23,0.9)',
      'rgba(10,14,23,1)',
    ];
  }
  return <LinearGradient colors={cols as any} locations={scrim[variant].locations as any} style={style ?? StyleSheet.absoluteFill} />;
}

/* ---------- Aurora backdrop — soft gradient blobs ---------- */

export function Aurora({ style }: { style?: ViewStyle }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, style]}>
      <LinearGradient
        colors={['rgba(57,121,255,0.10)', 'rgba(57,121,255,0)']}
        style={{ position: 'absolute', top: -140, right: -120, width: 380, height: 380, borderRadius: 190 }}
      />
      <LinearGradient
        colors={['rgba(155,108,255,0.08)', 'rgba(155,108,255,0)']}
        style={{ position: 'absolute', top: 40, left: -150, width: 320, height: 320, borderRadius: 160 }}
      />
    </View>
  );
}

/* ---------- Animated pressable ---------- */

export function Press({
  children,
  onPress,
  style,
  haptic = false,
  scaleTo = 0.98,
  ...rest
}: PressableProps & { style?: any; haptic?: boolean; scaleTo?: number; children: React.ReactNode }) {
  const v = useSharedValue(0);
  const a = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + v.value * (scaleTo - 1) }],
  }));
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={() => (v.value = withSpring(1, spring.snappy))}
      onPressOut={() => (v.value = withSpring(0, spring.gentle))}
      onPress={(e) => {
        // tick() rather than Haptics.selectionAsync(): on Android
        // selectionAsync falls through to the raw vibrator, which is the soft
        // buzz this app deliberately avoids everywhere else. tick() routes to
        // performAndroidHapticsAsync and shares the global rate gate.
        if (haptic) tick();
        onPress?.(e);
      }}
      style={[a, style]}
    >
      {children}
    </AnimatedPressable>
  );
}

export function IconButton({
  name,
  onPress,
  size = 20,
  color = colors.ink,
  bg = 'transparent',
  badge,
  style,
}: {
  name: string;
  onPress?: () => void;
  size?: number;
  color?: string;
  bg?: string;
  badge?: boolean;
  style?: ViewStyle;
}) {
  const { c } = useTheme();
  return (
    <Press onPress={onPress} scaleTo={0.94} style={[s.iconBtn, { backgroundColor: bg }, style]}>
      <LIcon name={name} size={size} color={color === colors.ink ? c.ink : color} />
      {badge ? <View style={s.badge} /> : null}
    </Press>
  );
}

/* ---------- Editorial category tabs — text + underline dot, no pills ---------- */

export function CategoryTab({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  const { c } = useTheme();
  const t = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    t.value = withSpring(active ? 1 : 0, spring.snappy);
  }, [active, t]);

  const textStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + t.value * 0.02 }],
  }));
  const barStyle = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ scaleX: 0.3 + t.value * 0.7 }],
  }));

  return (
    <Pressable
      onPress={() => {
        tick();
        onPress?.();
      }}
      style={{ marginRight: 26, alignItems: 'center', paddingVertical: 6 }}
    >
      <Animated.Text
        style={[
          {
            fontFamily: active ? font.extrabold : font.medium,
            fontSize: 16,
            letterSpacing: -0.3,
            color: active ? c.ink : c.inkFaint,
          },
          textStyle,
        ]}
      >
        {label}
      </Animated.Text>
      <Animated.View
        style={[
          { marginTop: 5, width: 18, height: 3.5, borderRadius: 2, backgroundColor: c.brand },
          barStyle,
        ]}
      />
    </Pressable>
  );
}

/* ---------- Minimal pill tab: solid ink active, hairline outline inactive ---------- */

export function PillTab({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  const { c, isDark } = useTheme();
  const activeBg = isDark ? '#F2F5FA' : '#0B0D12';
  const activeInk = isDark ? '#0B0D12' : '#FFFFFF';
  return (
    <Press
      onPress={() => {
        tick();
        onPress?.();
      }}
      scaleTo={0.95}
      style={[
        s.pillTab,
        active
          ? { backgroundColor: activeBg }
          : { borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(11,13,18,0.14)' },
      ]}
    >
      <Txt size={13.5} weight={active ? 'bold' : 'medium'} color={active ? activeInk : c.inkSoft}>
        {label}
      </Txt>
    </Press>
  );
}

/* ---------- Circular topic bubble (artwork-filled, reference style) ---------- */

export function TopicBubble({
  topic,
  size = 96,
  selected,
  onPress,
  label,
}: {
  topic: string;
  size?: number;
  selected?: boolean;
  onPress?: () => void;
  label?: string;
}) {
  const { c } = useTheme();
  const fontSize = Math.max(11.5, Math.min(15, size * 0.14));
  // Without a handler this must NOT be a Pressable — a nested pressable
  // swallows taps meant for an outer one.
  const Wrapper: any = onPress ? Press : View;
  const wrapperProps: any = onPress
    ? { onPress, scaleTo: 0.93, style: { alignItems: 'center', justifyContent: 'center' } }
    : { style: { alignItems: 'center', justifyContent: 'center' } };
  return (
    <Wrapper {...wrapperProps}>
      <View
        style={{
          width: size + 8,
          height: size + 8,
          borderRadius: (size + 8) / 2,
          borderWidth: 2.5,
          borderColor: selected ? c.brand : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }}>
          <Image source={artFor(topic)} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={200} />
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              backgroundColor: selected ? 'rgba(6,10,20,0.28)' : 'rgba(6,10,20,0.44)',
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 8,
            }}
          >
            <Txt size={fontSize} weight="bold" color="#fff" ls={-0.2} style={{ textAlign: 'center' }} numberOfLines={2}>
              {label ?? topic}
            </Txt>
          </View>
        </View>
        {selected ? (
          <Animated.View
            entering={enterReward()}
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: c.brand,
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(57,121,255,0.5)',
            }}
          >
            <LIcon name="check" size={13} color="#fff" strokeWidth={3.2} />
          </Animated.View>
        ) : null}
      </View>
    </Wrapper>
  );
}

/* ---------- Progress ring ----------

   A stroked arc, drawn rather than animated. Every place this is used sits
   next to a number the reader can already read — the arc is that number's
   shape, not an effect, so there is nothing here that needs to move (and
   nothing for Reduce Motion to suppress). */

export function ProgressRing({
  size,
  stroke,
  value,
  color,
  track,
  children,
}: {
  size: number;
  stroke: number;
  /** 0..1; anything outside that, or NaN, is clamped */
  value: number;
  color: string;
  track: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        {v > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circ} ${circ}`}
            strokeDashoffset={circ * (1 - v)}
            // start at twelve o'clock rather than three
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      {children}
    </View>
  );
}

/* ---------- Section header ---------- */

export function SectionHeader({
  title,
  onSeeAll,
  style,
}: {
  title: string;
  onSeeAll?: () => void;
  style?: ViewStyle;
}) {
  const { c } = useTheme();
  return (
    <View style={[s.sectionRow, style]}>
      <Section>{title}</Section>
      {onSeeAll ? (
        <Press onPress={onSeeAll} scaleTo={0.94} style={{ paddingVertical: 4 }}>
          <Txt size={13.5} weight="semibold" color={c.brand}>
            See all
          </Txt>
        </Press>
      ) : null}
    </View>
  );
}

/* ---------- Shimmer ---------- */

export function Shimmer({ style }: { style: ViewStyle | ViewStyle[] }) {
  const { c } = useTheme();
  const motion = useMotionAllowed();
  const v = useSharedValue(0.5);
  useEffect(() => {
    // a still placeholder still says "loading"; a pulsing one is decoration
    if (!motion) {
      v.value = 0.8;
      return;
    }
    v.value = withRepeat(withSequence(withTiming(1, { duration: 650 }), withTiming(0.5, { duration: 650 })), -1);
  }, [v, motion]);
  const a = useAnimatedStyle(() => ({ opacity: v.value }));
  return <Animated.View style={[{ backgroundColor: c.bgSoft, borderRadius: 14 }, style, a]} />;
}

/* ---------- Breaking badge ---------- */

export function BreakingBadge() {
  const motion = useMotionAllowed();
  const v = useSharedValue(1);
  useEffect(() => {
    // the word BREAKING carries the urgency on its own; the pulse is emphasis
    if (!motion) {
      v.value = 1;
      return;
    }
    v.value = withRepeat(withSequence(withTiming(0.5, { duration: 700 }), withTiming(1, { duration: 700 })), -1);
  }, [v, motion]);
  const dot = useAnimatedStyle(() => ({ opacity: v.value }));
  return (
    <View style={s.breaking}>
      <Animated.View style={[s.breakingDot, dot]} />
      <Txt size={11} weight="bold" color="#fff" ls={0.8}>
        BREAKING
      </Txt>
    </View>
  );
}

/* The desk's lead story, said out loud.

   `is_featured` reached the app already, but its entire effect was position 1 —
   an editor toggling Feature saw two rows swap places and nothing else. On a
   feed that is already in the desk's running order, that is invisible: the top
   story looks like the top story either way.

   Deliberately quieter than BreakingBadge. Breaking is a claim about the world
   and pulses for attention; featured is a claim about editorial judgement and
   should read as a mark of quality, not an alarm. Brand blue, no animation. */
export function FeaturedBadge() {
  return (
    <View style={s.featured}>
      <LIcon name="sparkles" size={11} color="#fff" strokeWidth={2.6} />
      <Txt size={11} weight="bold" color="#fff" ls={0.6}>
        FEATURED
      </Txt>
    </View>
  );
}

/* ---------- Page loader: breathing gradient D mark ---------- */

export function LogoLoader({ size = 58 }: { size?: number }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withRepeat(
      withSequence(withTiming(1, { duration: 800 }), withTiming(0, { duration: 800 })),
      -1,
    );
  }, [v]);
  const mark = useAnimatedStyle(() => ({
    transform: [{ scale: 0.94 + v.value * 0.08 }],
  }));
  const halo = useAnimatedStyle(() => ({
    opacity: 0.5 - v.value * 0.5,
    transform: [{ scale: 1 + v.value * 0.55 }],
  }));
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 1.5,
            borderColor: colors.brand,
          },
          halo,
        ]}
      />
      <Animated.View style={mark}>
        <LinearGradient
          colors={['#6694FF', colors.brand]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 10px 30px rgba(57,121,255,0.35)',
          }}
        >
          <Txt size={size * 0.44} weight="extrabold" color="#fff">
            D
          </Txt>
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 7,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.breaking,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  pillTab: {
    height: 38,
    borderRadius: radius.pill,
    paddingHorizontal: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginTop: 48,
    marginBottom: 18,
  },
  breaking: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.breaking,
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 6,
    gap: 5,
    boxShadow: '0 4px 16px rgba(255,59,48,0.4)',
  },
  breakingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  featured: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5.5,
    gap: 5,
    boxShadow: '0 4px 16px rgba(57,121,255,0.38)',
  },
});
