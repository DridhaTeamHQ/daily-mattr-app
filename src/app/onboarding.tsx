import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, Dimensions, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  ZoomIn,
} from 'react-native-reanimated';
import { radius, shadow, duration } from '@/theme';
import { useTheme } from '@/lib/theme';
import { Txt, Press, LIcon, TopicBubble } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { getDeviceId } from '@/lib/telemetry';
import { tick, soft } from '@/lib/haptics';
import { ONBOARDED_KEY, setOnboardedFlag } from '@/lib/onboardingKey';
import { enterContent, enterItem, enterScreen } from '@/lib/transitions';

const { width: W } = Dimensions.get('window');
const TILE = (W - 56) / 2;

const TOPICS = [
  'Tech & AI', 'Business', 'Politics', 'India', 'World', 'Sports',
  'Science', 'Markets & Startups', 'Health & Wellness', 'Automobile',
  'Real Estate', 'Explained',
];

// varied diameters + vertical offsets give the cluster its organic feel
const BUBBLE_SIZES = [116, 88, 102, 122, 86, 104, 92, 118, 90, 100, 86, 108];
const BUBBLE_LIFTS = [0, 22, 8, -4, 26, 4, 18, -2, 20, 6, 24, 2];

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { c, isDark } = useTheme();
  const [step, setStep] = useState<0 | 1>(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const togglePick = (t: string) => {
    tick();
    setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
  };

  const finish = async () => {
    if (picked.length < 3 || busy) return;
    setBusy(true);
    soft();
    try {
      const deviceId = await getDeviceId();
      await supabase.rpc('app_seed_topics', { p_device_id: deviceId, p_topics: picked });
    } catch {
      // seeding is best-effort; the feed degrades gracefully to editorial ranking
    }
    await AsyncStorage.setItem(ONBOARDED_KEY, '1');
    setOnboardedFlag(true); // open the layout gate BEFORE navigating
    router.replace('/(tabs)');
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <LinearGradient colors={c.canvas} style={StyleSheet.absoluteFill} />
      {isDark ? (
        <LinearGradient
          colors={['rgba(77,136,255,0.18)', 'rgba(77,136,255,0)']}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 320 }}
        />
      ) : null}

      {step === 0 ? (
        /* ---- Beat 1: brand splash ---- */
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Animated.View entering={ZoomIn.duration(600).springify().damping(26)}>
            <LinearGradient colors={[c.brandLight, c.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.mark}>
              <Txt size={38} weight="extrabold" color="#fff">
                D
              </Txt>
            </LinearGradient>
          </Animated.View>
          <Animated.View entering={enterContent().delay(duration.quick)} style={{ alignItems: 'center' }}>
            <Image
              source={require('../../assets/images/wordmark.svg')}
              style={{ width: 210, height: 42, marginTop: 28 }}
              contentFit="contain"
            />
            <Txt size={16} weight="medium" color={c.inkSoft} style={{ marginTop: 10 }}>
              News that matters.
            </Txt>
          </Animated.View>
          <Animated.View entering={enterContent().delay(duration.slow)} style={{ position: 'absolute', left: 24, right: 24, bottom: insets.bottom + 32 }}>
            <Press onPress={() => { tick(); setStep(1); }}>
              <LinearGradient colors={[c.brandLight, c.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.cta, shadow.glowBrand]}>
                <Txt size={15.5} weight="semibold" color="#fff">
                  Get started
                </Txt>
                <LIcon name="arrow-right" size={17} color="#fff" />
              </LinearGradient>
            </Press>
          </Animated.View>
        </View>
      ) : (
        /* ---- Beat 2: topic picker ---- */
        <>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: 140 }}
          >
            <Animated.View entering={enterScreen()} style={{ paddingHorizontal: 24 }}>
              <Txt size={30} lh={36} weight="extrabold" ls={-1}>
                What matters{'\n'}to you?
              </Txt>
              <Txt size={14.5} weight="medium" color={c.inkSoft} style={{ marginTop: 8 }}>
                Pick at least 3 topics — your feed learns from there.
              </Txt>
            </Animated.View>

            {/* organic circle cluster — varied sizes + offsets */}
            <View style={s.cluster}>
              {TOPICS.map((t, i) => {
                const size = BUBBLE_SIZES[i % BUBBLE_SIZES.length];
                const lift = BUBBLE_LIFTS[i % BUBBLE_LIFTS.length];
                return (
                  <Animated.View
                    key={t}
                    entering={enterItem(i)}
                    style={{ marginTop: lift, marginHorizontal: 2 }}
                  >
                    <TopicBubble topic={t} size={size} selected={picked.includes(t)} onPress={() => togglePick(t)} />
                  </Animated.View>
                );
              })}
            </View>
          </ScrollView>

          {/* CTA */}
          <View style={[s.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
            <LinearGradient
              colors={isDark ? ['rgba(8,11,18,0)', 'rgba(8,11,18,0.95)'] : ['rgba(247,248,250,0)', 'rgba(247,248,250,0.97)']}
              style={StyleSheet.absoluteFill}
            />
            <Press onPress={finish} style={{ opacity: picked.length >= 3 ? 1 : 0.45 }}>
              <LinearGradient colors={[c.brandLight, c.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.cta, picked.length >= 3 ? shadow.glowBrand : null]}>
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Txt size={15.5} weight="semibold" color="#fff">
                      {picked.length >= 3 ? 'Build my feed' : `Pick ${3 - picked.length} more`}
                    </Txt>
                    {picked.length >= 3 ? <LIcon name="sparkles" size={16} color="#fff" /> : null}
                  </>
                )}
              </LinearGradient>
            </Press>
          </View>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  mark: {
    width: 96,
    height: 96,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 20px 60px rgba(57,121,255,0.45)',
  },
  cta: {
    height: 54,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  cluster: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    marginTop: 20,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingTop: 28,
  },
});
