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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, shadow, spring } from '@/theme';
import { useTheme } from '@/lib/theme';
import { LIcon, Txt, Press } from './ui';

type TabBarProps = { state: any; navigation: any };

const TABS: Record<string, { icon: string; label: string }> = {
  index: { icon: 'house', label: 'Home' },
  categories: { icon: 'layout-grid', label: 'Categories' },
  reader: { icon: 'layers', label: 'Articles' },
  profile: { icon: 'user-round', label: 'Profile' },
};

const BAR_HEIGHT = 60;

// Wabi-style floating cluster: circular search button + white tab pill.
// Active tab = solid icon + label; inactive = quiet outline icon.
export function GlassNavbar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { c, isDark } = useTheme();
  const surface = isDark
    ? { backgroundColor: 'rgba(21,28,44,0.92)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' }
    : { backgroundColor: '#FFFFFF' };

  return (
    <View pointerEvents="box-none" style={[s.wrap, { bottom: Math.max(insets.bottom, 14) + 6 }]}>
      <Press onPress={() => router.push('/search')} scaleTo={0.9} style={[s.searchCircle, shadow.nav, surface]}>
        <LIcon name="search" size={21} color={c.ink} strokeWidth={2} />
      </Press>

      <View style={[s.pill, shadow.nav, surface]}>
        {state.routes.map((route: any, i: number) => {
          const meta = TABS[route.name] ?? TABS.index;
          const focused = state.index === i;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              onPress={() => {
                tick();
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
              }}
              style={[s.tab, focused ? s.tabActive : null]}
            >
              <TabItem icon={meta.icon} label={meta.label} focused={focused} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function TabItem({ icon, label, focused }: { icon: string; label: string; focused: boolean }) {
  const { c } = useTheme();
  const v = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    v.value = withSpring(focused ? 1 : 0, spring.snappy);
  }, [focused, v]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + v.value * 0.03 }],
  }));
  const labelStyle = useAnimatedStyle(() => ({
    opacity: v.value,
    maxWidth: interpolate(v.value, [0, 1], [0, 88]),
    transform: [{ translateX: interpolate(v.value, [0, 1], [-3, 0]) }],
  }));

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Animated.View style={iconStyle}>
        <LIcon
          name={icon}
          size={21}
          color={focused ? c.ink : c.inkFaint}
          strokeWidth={focused ? 2.4 : 1.9}
          fill={focused ? c.ink : 'none'}
        />
      </Animated.View>
      <Animated.View style={[labelStyle, { overflow: 'hidden' }]}>
        <Txt size={13.5} weight="bold" color={c.ink} numberOfLines={1}>
          {label}
        </Txt>
      </Animated.View>
    </View>
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
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    height: BAR_HEIGHT - 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    flexGrow: 1.9,
  },
});
