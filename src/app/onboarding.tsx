import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, Dimensions, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeIn, ZoomIn } from 'react-native-reanimated';
import { radius, shadow } from '@/theme';
import { useTheme } from '@/lib/theme';
import { Txt, Press, EasedScrim, LIcon } from '@/components/ui';
import { topicArt } from '@/lib/topicArt';
import { supabase } from '@/lib/supabase';
import { getDeviceId } from '@/lib/telemetry';
import { tick, soft } from '@/lib/haptics';

const { width: W } = Dimensions.get('window');
const TILE = (W - 56) / 2;

export const ONBOARDED_KEY = 'dailymattr.onboarded.v1';

const TOPICS = [
  'Tech & AI', 'Business', 'Politics', 'India', 'World', 'Sports',
  'Science', 'Markets & Startups', 'Health & Wellness', 'Automobile',
  'Real Estate', 'Explained',
];

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
          <Animated.View entering={FadeInDown.delay(200).springify().damping(30).stiffness(250).mass(0.9)} style={{ alignItems: 'center' }}>
            <Image
              source={require('../../assets/images/wordmark.svg')}
              style={{ width: 210, height: 42, marginTop: 28 }}
              contentFit="contain"
            />
            <Txt size={16} weight="medium" color={c.inkSoft} style={{ marginTop: 10 }}>
              News that matters.
            </Txt>
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(420).springify().damping(30).stiffness(250).mass(0.9)} style={{ position: 'absolute', left: 24, right: 24, bottom: insets.bottom + 32 }}>
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
            <Animated.View entering={FadeIn.duration(350)} style={{ paddingHorizontal: 24 }}>
              <Txt size={30} lh={36} weight="extrabold" ls={-1}>
                What matters{'\n'}to you?
              </Txt>
              <Txt size={14.5} weight="medium" color={c.inkSoft} style={{ marginTop: 8 }}>
                Pick at least 3 topics — your feed learns from there.
              </Txt>
            </Animated.View>

            <View style={s.grid}>
              {TOPICS.map((t, i) => {
                const on = picked.includes(t);
                return (
                  <Animated.View key={t} entering={FadeInDown.delay(Math.min(i, 8) * 60).springify().damping(30).stiffness(250).mass(0.9)}>
                    <Press onPress={() => togglePick(t)} scaleTo={0.96} style={[s.tile, on ? s.tileOn : null, shadow.soft]}>
                      <Image source={topicArt[t]} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
                      <EasedScrim variant="bottom" />
                      {on ? <View style={s.tileOverlay} /> : null}
                      <View style={s.tileCheck}>
                        {on ? (
                          <Animated.View entering={ZoomIn.springify().damping(16)}>
                            <View style={s.checkOn}>
                              <LIcon name="check" size={13} color="#fff" strokeWidth={3} />
                            </View>
                          </Animated.View>
                        ) : (
                          <View style={s.checkOff} />
                        )}
                      </View>
                      <Txt size={15} weight="bold" color="#fff" ls={-0.3} style={s.tileLabel}>
                        {t}
                      </Txt>
                    </Press>
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 22,
    marginTop: 26,
  },
  tile: {
    width: TILE,
    height: TILE * 0.78,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#0E1524',
  },
  tileOn: {
    borderWidth: 2,
    borderColor: '#4D88FF',
  },
  tileOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(57,121,255,0.18)',
  },
  tileCheck: { position: 'absolute', top: 10, right: 10 },
  checkOn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#3979FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOff: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  tileLabel: { position: 'absolute', left: 12, right: 12, bottom: 10 },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingTop: 28,
  },
});
