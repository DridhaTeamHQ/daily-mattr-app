import React, { useEffect } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { tick } from '@/lib/haptics';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
} from 'react-native-reanimated';

const APressable = Animated.createAnimatedComponent(Pressable);
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { shadow, spring } from '@/theme';
import { useTheme } from '@/lib/theme';
import { useNavVisible } from '@/lib/navVisibility';
import { LIcon, Txt, Press } from './ui';

type TabBarProps = { state: any; navigation: any };

const TABS: Record<string, { icon: string; label: string }> = {
  index: { icon: 'house', label: 'Home' },
  reader: { icon: 'layers', label: 'Articles' },
  profile: { icon: 'user-round', label: 'Profile' },
};

const BAR_HEIGHT = 60;
const PILL_PAD = 8;
// how many "shares" of the pill the focused tab takes vs an unfocused one
const ACTIVE_SHARE = 1.9;

// Wabi-style floating cluster: circular search button + white tab pill.
// Active tab = solid icon + label; inactive = quiet outline icon.
export function GlassNavbar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { c, isDark } = useTheme();

  // 0..1, animated by the provider. Read only — never animated from in here,
  // because starting an animation inside useAnimatedStyle restarts it on every
  // render (see lib/navVisibility.tsx).
  const visible = useNavVisible();
  const visAnim = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - visible.value) * 150 }],
    opacity: visible.value,
  }));

  // The focused tab used to be widened by flipping flexGrow in React and
  // letting a LinearTransition layout animation catch up. Layout animations
  // over flex are unreliable — the pill would jump straight to its end state
  // or leave a tab collapsed, which is the glitch. Each tab now springs its
  // own flexGrow on the UI thread instead (see TabButton): no layout
  // animation, no measurement, and no React render inside the loop.
  const surface = isDark
    ? { backgroundColor: 'rgba(21,28,44,0.92)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' }
    : { backgroundColor: '#FFFFFF' };

  return (
    /* pointerEvents is a static style, not an animated one. Driving it from
       the shared value meant Reanimated applying a non-numeric, non-animatable
       prop on the UI thread every frame; hidden, the bar is translated 150pt
       clear of the screen anyway, so there is nothing there to tap. */
    <Animated.View
      pointerEvents="box-none"
      style={[s.wrap, { bottom: Math.max(insets.bottom, 14) + 6 }, visAnim]}
    >
      <Press onPress={() => router.push('/search')} scaleTo={0.9} style={[s.searchCircle, shadow.nav, surface]}>
        <LIcon name="search" size={21} color={c.ink} strokeWidth={2} />
      </Press>

      <View style={[s.pill, shadow.nav, surface]}>
        {state.routes.map((route: any, i: number) => {
          const meta = TABS[route.name] ?? TABS.index;
          const focused = state.index === i;
          return (
            <TabButton
              key={route.key}
              focused={focused}
              icon={meta.icon}
              label={meta.label}
              brand={c.brand}
              idle={c.inkFaint}
              onPress={() => {
                tick();
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
              }}
            />
          );
        })}
      </View>
    </Animated.View>
  );
}

function TabButton({
  focused,
  icon,
  label,
  brand,
  idle,
  onPress,
}: {
  focused: boolean;
  icon: string;
  label: string;
  brand: string;
  idle: string;
  onPress: () => void;
}) {
  // Each tab owns its own 0..1 focus progress. Deriving all three from one
  // index in the parent looked tidier but left the styles stale — this is the
  // shape that actually tracks, and it is also more forgiving: flexGrow is a
  // ratio, so the row fills the pill exactly whatever the three values happen
  // to be mid-transition. Nothing has to sum to anything.
  const p = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    p.value = withSpring(focused ? 1 : 0, spring.snappy);
  }, [focused, p]);

  const growStyle = useAnimatedStyle(() => ({
    flexGrow: 1 + (ACTIVE_SHARE - 1) * p.value,
  }));

  const bgStyle = useAnimatedStyle(() => ({ opacity: p.value }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + p.value * 0.03 }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: p.value,
    maxWidth: interpolate(p.value, [0, 1], [0, 88]),
    transform: [{ translateX: interpolate(p.value, [0, 1], [-3, 0]) }],
  }));

  return (
    <APressable
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      onPress={onPress}
      style={[s.tab, growStyle]}
    >
      <Animated.View style={[s.tabBg, { backgroundColor: brand }, shadow.tab, bgStyle]} />
      <View style={s.tabRow}>
        <Animated.View style={iconStyle}>
          <LIcon
            name={icon}
            size={20}
            color={focused ? '#fff' : idle}
            strokeWidth={focused ? 2.4 : 1.9}
            fill={focused ? '#fff' : 'none'}
          />
        </Animated.View>
        <Animated.View style={[labelStyle, { overflow: 'hidden' }]}>
          <Txt size={13.5} weight="bold" color="#fff" numberOfLines={1}>
            {label}
          </Txt>
        </Animated.View>
      </View>
    </APressable>
  );
}

export const NAVBAR_CLEARANCE = BAR_HEIGHT + 48;

const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchCircle: {
    width: BAR_HEIGHT,
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flex: 1,
    height: BAR_HEIGHT,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: PILL_PAD,
  },
  tab: {
    // flexGrow comes from the animated style; basis 0 makes it a pure ratio
    flexShrink: 1,
    flexBasis: 0,
    height: BAR_HEIGHT - 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tabBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 999,
  },
  tabRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
