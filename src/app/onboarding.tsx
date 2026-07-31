import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { radius, spring, topicOf } from '@/theme';
import { useTheme } from '@/lib/theme';
import { useMotionAllowed } from '@/lib/motion';
import { Txt, Press, LIcon } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { getDeviceId } from '@/lib/telemetry';
import { tick, soft } from '@/lib/haptics';
import { ONBOARDED_KEY, setOnboardedFlag } from '@/lib/onboardingKey';
import { enterContent, enterItem } from '@/lib/transitions';
import { CATEGORY_NAMES, TOPICS_KEY } from '@/lib/categories';
import { artFor } from '@/lib/topicArt';

/* First run, in two beats.
 *
 * A photograph, then a choice. The old version opened on a brand mark in the
 * middle of an empty screen — correct, and forgettable. What a news app is
 * actually offering is a few quiet minutes with the world, and a picture says
 * that in less time than a tagline does.
 *
 * The hero is a city at dawn, monochrome, with nobody in it. A portrait was
 * tried first and read as a lifestyle app — a face invites you to look at a
 * person, and this one is meant to say "the world, this morning". Monochrome
 * because the app is one blue on near-black and a colour photograph would be
 * the loudest thing in it; it also lets the headline sit on the image without
 * a scrim heavy enough to bury the picture.
 */

const MIN_PICKS = 3;

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { c } = useTheme();
  const motion = useMotionAllowed();
  const { width: W, height: H } = useWindowDimensions();

  const [step, setStep] = useState<0 | 1>(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  /* The picture breathes.
     A still image behind a still headline reads as a screenshot; a slow drift
     reads as a photograph. 18 seconds each way is below the threshold where
     the eye tracks it as movement — it is felt rather than seen. */
  const drift = useSharedValue(0);
  useEffect(() => {
    if (!motion) {
      drift.value = 0;
      return;
    }
    drift.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 18000, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 18000, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [drift, motion]);

  const heroStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: 1.08 + drift.value * 0.06 },
      { translateY: drift.value * -14 },
    ],
  }));

  const toggle = useCallback((t: string) => {
    tick();
    setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
  }, []);

  const finish = async () => {
    if (picked.length < MIN_PICKS || busy) return;
    setBusy(true);
    soft();

    /* Kept on the device, which it never used to be.
       These went to the server and nowhere else — `picked` was component state
       that died with the screen — so a reader who named three interests got a
       feed that knew nothing about them until enough reading history built up
       to infer it. lib/rank reads this as a seed affinity. */
    try {
      await AsyncStorage.setItem(TOPICS_KEY, JSON.stringify(picked));
    } catch {
      /* the server copy below is still worth attempting */
    }

    try {
      const deviceId = await getDeviceId();
      await supabase.rpc('app_seed_topics', { p_device_id: deviceId, p_topics: picked });
    } catch {
      // seeding is best-effort; the feed degrades to the desk's running order
    }

    await AsyncStorage.setItem(ONBOARDED_KEY, '1');
    setOnboardedFlag(true); // open the layout gate BEFORE navigating
    router.replace('/(tabs)');
  };

  // Three across on every phone still sold; the gutter is what gives.
  const GUTTER = 20;
  const GAP = 10;
  const TILE = Math.floor((W - GUTTER * 2 - GAP * 2) / 3);

  const enough = picked.length >= MIN_PICKS;

  if (step === 0) {
    return (
      <View style={[s.root, { backgroundColor: '#07090F' }]}>
        <Animated.View style={[StyleSheet.absoluteFill, heroStyle]}>
          <Image
            source={require('../../assets/images/onboarding-hero.webp')}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            // The first frame of the app should not be a grey rectangle.
            cachePolicy="memory-disk"
            priority="high"
          />
        </Animated.View>

        {/* Two scrims rather than one. A single top-to-bottom ramp either
            crushes the picture or leaves the headline unreadable; this darkens
            the ends and lets the middle stay a photograph. */}
        <LinearGradient
          colors={['rgba(7,9,15,0.75)', 'rgba(7,9,15,0.12)', 'rgba(7,9,15,0)']}
          locations={[0, 0.35, 0.5]}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={['rgba(7,9,15,0)', 'rgba(7,9,15,0.72)', 'rgba(7,9,15,0.97)']}
          locations={[0.34, 0.66, 1]}
          style={StyleSheet.absoluteFill}
        />

        <View style={[s.heroBody, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 22 }]}>
          <Animated.View entering={enterContent()}>
            <Image
              source={require('../../assets/images/wordmark.svg')}
              style={{ width: 132, height: 26 }}
              contentFit="contain"
              tintColor="#fff"
            />
          </Animated.View>

          <View style={{ flex: 1 }} />

          <Animated.View entering={enterItem(0, 90)}>
            <Txt size={40} lh={44} weight="extrabold" ls={-1.4} color="#fff" display>
              The world,{'\n'}in the time{'\n'}you have.
            </Txt>
            <Txt
              size={15.5}
              lh={22}
              weight="medium"
              color="rgba(255,255,255,0.66)"
              style={{ marginTop: 14, maxWidth: Math.min(320, W - 48) }}
            >
              Every story worth your morning, written short enough to finish.
            </Txt>
          </Animated.View>

          <Animated.View entering={enterItem(1, 90)} style={{ marginTop: 30 }}>
            <Press
              onPress={() => {
                tick();
                setStep(1);
              }}
              scaleTo={0.98}
            >
              <View style={s.ctaLight}>
                <Txt size={16} weight="bold" color="#07090F">
                  Get started
                </Txt>
                <LIcon name="arrow-right" size={18} color="#07090F" strokeWidth={2.4} />
              </View>
            </Press>

            <Press
              haptic={false}
              onPress={() => {
                tick();
                router.push('/signin');
              }}
              scaleTo={0.98}
              style={s.already}
            >
              <Txt size={13.5} weight="medium" color="rgba(255,255,255,0.55)">
                Already have an account?{'  '}
                <Txt size={13.5} weight="bold" color="#fff">
                  Log in
                </Txt>
              </Txt>
            </Press>
          </Animated.View>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: c.bg }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 132,
          paddingHorizontal: GUTTER,
        }}
      >
        <Animated.View entering={enterContent()}>
          <Press
            haptic={false}
            onPress={() => {
              tick();
              setStep(0);
            }}
            scaleTo={0.9}
            style={[s.back, { backgroundColor: c.card }]}
          >
            <LIcon name="arrow-left" size={17} color={c.ink} strokeWidth={2.4} />
          </Press>

          <Txt size={31} lh={37} weight="extrabold" ls={-1.1} style={{ marginTop: 22 }} display>
            What should we{'\n'}bring you?
          </Txt>
          <Txt size={14.5} lh={21} weight="medium" color={c.inkSoft} style={{ marginTop: 9 }}>
            Choose at least three. You can change these any time.
          </Txt>
        </Animated.View>

        <View style={[s.grid, { marginTop: 26, gap: GAP }]}>
          {CATEGORY_NAMES.map((name, i) => (
            <TopicTile
              key={name}
              name={name}
              size={TILE}
              index={i}
              selected={picked.includes(name)}
              onPress={() => toggle(name)}
            />
          ))}
        </View>
      </ScrollView>

      <View style={[s.bar, { paddingBottom: insets.bottom + 14 }]}>
        <LinearGradient
          colors={[c.bg + '00', c.bg + 'E8', c.bg]}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
        />
        <Press onPress={finish} scaleTo={enough ? 0.98 : 1}>
          <View
            style={[
              s.ctaSolid,
              { backgroundColor: enough ? c.brand : c.card },
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Txt size={16} weight="bold" color={enough ? '#fff' : c.inkFaint}>
                {enough
                  ? 'Build my feed'
                  : `Choose ${MIN_PICKS - picked.length} more`}
              </Txt>
            )}
          </View>
        </Press>
      </View>
    </View>
  );
}

/* One category.
 *
 * A photograph per category, washed with that category's colour.
 *
 * The artwork used to be 3D glass renders — glossy trophies and atoms that on
 * a grid of eight read as a mobile game rather than a news app. The photographs
 * behind these are editorial and monochrome, cut from the same cloth as the
 * opening screen, so the colour wash is what distinguishes them rather than
 * eight competing illustration styles.
 */
function TopicTile({
  name,
  size,
  index,
  selected,
  onPress,
}: {
  name: string;
  size: number;
  index: number;
  selected: boolean;
  onPress: () => void;
}) {
  const { c } = useTheme();
  const motion = useMotionAllowed();
  const t = topicOf(name);
  const on = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    on.value = motion ? withSpring(selected ? 1 : 0, spring.snappy) : selected ? 1 : 0;
  }, [selected, on, motion]);

  // scale, never width or height: a layout animation here would reflow the
  // whole grid on every tap
  const wrap = useAnimatedStyle(() => ({ transform: [{ scale: 1 + on.value * 0.03 }] }));
  /* Unselected sits back rather than disappearing. At full strength all eight
     gradients shout at once and nothing reads as chosen. */
  const paint = useAnimatedStyle(() => ({ opacity: 0.42 + on.value * 0.58 }));
  const ring = useAnimatedStyle(() => ({ opacity: on.value }));
  const check = useAnimatedStyle(() => ({
    opacity: on.value,
    transform: [{ scale: 0.6 + on.value * 0.4 }],
  }));

  return (
    <Animated.View entering={enterItem(index, 46)}>
      <Animated.View style={wrap}>
        <Press haptic={false} onPress={onPress} scaleTo={0.95}>
          <View style={[s.tile, { width: size, height: size, backgroundColor: c.card }]}>
            <Animated.View style={[StyleSheet.absoluteFill, paint]}>
              <Image source={artFor(name)} style={StyleSheet.absoluteFill} contentFit="cover" />
              {/* The category's own colour, laid over the photograph at low
                  strength — enough to tell eight monochrome frames apart at a
                  glance, not enough to tint them into stickers. */}
              <LinearGradient
                colors={[t.grad[0] + '00', t.grad[1] + 'AA']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>

            {/* Grounds the label without a second gradient fighting the first. */}
            <LinearGradient
              colors={['rgba(7,9,15,0)', 'rgba(7,9,15,0.42)']}
              style={StyleSheet.absoluteFill}
            />

            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                ring,
                { borderRadius: radius.md, borderWidth: 2.5, borderColor: '#fff' },
              ]}
              pointerEvents="none"
            />

            <Animated.View style={[s.check, check]} pointerEvents="none">
              <LIcon name="check" size={12} color={t.grad[1]} strokeWidth={3.2} />
            </Animated.View>

            <View style={s.tileIcon}>
              <LIcon name={t.icon} size={Math.round(size * 0.3)} color="#fff" strokeWidth={1.6} />
            </View>

            <View style={s.tileLabel}>
              <Txt size={12.5} weight="bold" color="#fff" numberOfLines={2}>
                {name}
              </Txt>
            </View>
          </View>
        </Press>
      </Animated.View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  heroBody: { flex: 1, paddingHorizontal: 24 },
  ctaLight: {
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  already: { alignItems: 'center', paddingVertical: 16 },
  back: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: {
    borderRadius: radius.md,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  tileIcon: { position: 'absolute', top: 10, left: 10 },
  tileLabel: { paddingHorizontal: 9, paddingBottom: 9 },
  check: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#fff',
    width: 21,
    height: 21,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 30,
  },
  ctaSolid: {
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
