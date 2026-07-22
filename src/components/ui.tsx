import React, { useEffect } from 'react';
import { Text, TextProps, View, Pressable, StyleSheet, ViewStyle, PressableProps } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  interpolateColor,
  ZoomIn,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { artFor } from '@/lib/topicArt';
import * as Lucide from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { tick } from '@/lib/haptics';
import { colors, font, type, radius, spring, scrim } from '@/theme';
import { useTheme } from '@/lib/theme';

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

type TStyle = { size: number; lh: number; ls: number; f: string };
function makeText(t: TStyle, extra?: object) {
  return function T(props: TextProps & { color?: string }) {
    const { c } = useTheme();
    const { color = c.ink, style, ...rest } = props;
    return (
      <Text
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

export function Txt(props: TextProps & { size?: number; lh?: number; color?: string; weight?: keyof typeof font; ls?: number }) {
  const { c } = useTheme();
  const { size = 14, lh, color = c.ink, weight = 'regular', ls = 0, style, ...rest } = props;
  return (
    <Text {...rest} style={[{ fontFamily: font[weight], fontSize: size, lineHeight: lh ?? size * 1.45, letterSpacing: ls, color, userSelect: 'none' as const }, style]} />
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
        if (haptic) Haptics.selectionAsync();
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

/* ---------- Category pill — borderless, stretches when active ---------- */

export function Chip({
  label,
  active,
  onPress,
  icon,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: string;
}) {
  const t = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    t.value = withSpring(active ? 1 : 0, spring.snappy);
  }, [active, t]);

  const { c, isDark } = useTheme();
  const inactiveBg = isDark ? 'rgba(255,255,255,0.08)' : '#EEF1F6';
  const a = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(t.value, [0, 1], [inactiveBg, c.brand]),
    paddingHorizontal: 17 + t.value * 5,
    transform: [{ scale: 1 + t.value * 0.02 }],
  }));

  return (
    <AnimatedPressable
      onPress={() => {
        tick();
        onPress?.();
      }}
      style={[s.chip, a, active ? { boxShadow: '0 6px 20px rgba(57,121,255,0.35)' } : null]}
    >
      {icon ? <LIcon name={icon} size={13.5} color={active ? '#fff' : c.inkSoft} style={{ marginRight: 6 }} /> : null}
      <Txt size={13.5} weight="semibold" color={active ? '#fff' : c.inkSoft}>
        {label}
      </Txt>
    </AnimatedPressable>
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
  return (
    <Press onPress={onPress} scaleTo={0.93} style={{ alignItems: 'center', justifyContent: 'center' }}>
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
            entering={ZoomIn.springify().damping(18).stiffness(260)}
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
    </Press>
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
  const { isDark } = useTheme();
  const v = useSharedValue(0.5);
  useEffect(() => {
    v.value = withRepeat(withSequence(withTiming(1, { duration: 650 }), withTiming(0.5, { duration: 650 })), -1);
  }, [v]);
  const a = useAnimatedStyle(() => ({ opacity: v.value }));
  return <Animated.View style={[{ backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : '#EDF1F7', borderRadius: 14 }, style, a]} />;
}

/* ---------- Breaking badge ---------- */

export function BreakingBadge() {
  const v = useSharedValue(1);
  useEffect(() => {
    v.value = withRepeat(withSequence(withTiming(0.5, { duration: 700 }), withTiming(1, { duration: 700 })), -1);
  }, [v]);
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
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    borderRadius: radius.pill,
    marginRight: 9,
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
});
