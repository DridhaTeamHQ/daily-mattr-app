import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, Switch, Alert, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { radius } from '@/theme';
import { useTheme, glassCard } from '@/lib/theme';
import { Txt, Press, IconButton, LIcon } from '@/components/ui';
import { getHapticsEnabled, setHapticsEnabled, tick, soft } from '@/lib/haptics';
import { clearAll as clearProgress } from '@/lib/progress';
import { clearAll as clearXp, useXp, levelOf } from '@/lib/xp';
import { getMotionPref, setMotionPref, isSystemReduced, useMotionAllowed, type MotionPref } from '@/lib/motion';
import { getNotifyEnabled, setNotifyEnabled } from '@/lib/notifications';
import { useStore } from '@/lib/store';

export default function Settings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { c, isDark, toggle } = useTheme();
  const { clearAll } = useStore();
  const xp = useXp();
  const [haptics, setHaptics] = useState(getHapticsEnabled());
  const [motionPref, setPref] = useState<MotionPref>(getMotionPref());
  const [notify, setNotify] = useState(getNotifyEnabled());
  const motionOn = useMotionAllowed();

  /* Two destructive actions, deliberately separate.

     They used to be one: "Clear saved & history" also wiped the day log, and
     there was no way at all to reset the quiz. Someone who wants a fresh start
     on the challenge should not have to throw away everything they have saved
     to get it — and someone clearing their reading history should not silently
     lose a hundred-day streak they never mentioned. */
  const confirm = (title: string, body: string, onConfirm: () => void) => {
    if (Platform.OS === 'web') {
      onConfirm();
      return;
    }
    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: onConfirm },
    ]);
  };

  const confirmClearLibrary = () =>
    confirm(
      'Clear saved & history?',
      'Saved articles, reading history and your streak on this device will be reset. Your level and quiz record are kept.',
      () => {
        clearAll();
        // the day-log lives in its own key, so it has to be cleared explicitly —
        // otherwise "reset" leaves the streak standing on data the user just
        // asked to delete
        clearProgress();
        AsyncStorage.removeItem('dailymattr.breaking.lastseen.v1').catch(() => {});
      },
    );

  const confirmClearQuiz = () =>
    confirm(
      'Reset quiz progress?',
      'Your level, XP and per-topic accuracy will start again from zero. Saved articles and history are kept.',
      () => {
        clearXp().catch(() => {});
      },
    );

  const Section = ({ children }: { children: string }) => (
    <Txt size={11.5} weight="semibold" color={c.inkFaint} ls={1.2} style={s.section}>
      {children}
    </Txt>
  );

  const Row = ({
    icon,
    label,
    hint,
    right,
    onPress,
    danger,
  }: {
    icon: string;
    label: string;
    hint?: string;
    right?: React.ReactNode;
    onPress?: () => void;
    danger?: boolean;
  }) => (
    <Press
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      style={[s.row, glassCard(c, isDark)]}
    >
      <LIcon name={icon} size={18} color={danger ? c.danger : c.inkSoft} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Txt size={14.5} weight="semibold" color={danger ? c.danger : c.ink}>
          {label}
        </Txt>
        {hint ? (
          <Txt size={12} weight="medium" color={c.inkFaint} style={{ marginTop: 2 }}>
            {hint}
          </Txt>
        ) : null}
      </View>
      {right}
    </Press>
  );

  const lvl = levelOf(xp.xp);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <LinearGradient colors={c.canvas} style={StyleSheet.absoluteFill} />
      <View style={[s.bar, { paddingTop: insets.top + 8 }]}>
        <IconButton name="chevron-left" onPress={() => router.back()} />
        <Txt size={17.5} weight="extrabold" ls={-0.4}>
          Settings
        </Txt>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingTop: 10, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Section>APPEARANCE</Section>
        <Row
          icon={isDark ? 'moon' : 'sun'}
          label="Dark theme"
          right={
            <Switch
              value={isDark}
              onValueChange={() => {
                tick();
                toggle();
              }}
              trackColor={{ true: c.brand }}
            />
          }
        />
        <Row
          icon="type"
          label="Text size"
          hint="Follows your device setting, up to 130%"
          right={<Txt size={13} weight="bold" color={c.inkFaint}>System</Txt>}
        />

        <Section>MOTION</Section>
        {/* Three states rather than a switch, because "off" and "follow the
            system" are genuinely different answers — and the OS flag being on
            for some other reason should not force this app to be still. */}
        <View style={[s.row, glassCard(c, isDark), { flexDirection: 'column', alignItems: 'stretch', gap: 12 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <LIcon name="accessibility" size={18} color={c.inkSoft} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Txt size={14.5} weight="semibold">
                Animation
              </Txt>
              <Txt size={12} weight="medium" color={c.inkFaint} style={{ marginTop: 2 }}>
                {motionOn ? 'Cards pan and loop' : 'Photos hold still'}
                {isSystemReduced() ? ' · Reduce Motion is on' : ''}
              </Txt>
            </View>
          </View>
          <View style={[s.segment, { backgroundColor: c.bgSoft }]}>
            {(
              [
                ['system', 'System'],
                ['full', 'Full'],
                ['reduced', 'Reduced'],
              ] as [MotionPref, string][]
            ).map(([value, label]) => (
              <Press
                key={value}
                onPress={() => {
                  soft();
                  setPref(value);
                  setMotionPref(value);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: motionPref === value }}
                style={[
                  s.segmentItem,
                  motionPref === value ? { backgroundColor: isDark ? c.brand : '#0B0D12' } : null,
                ]}
              >
                <Txt size={13} weight="semibold" color={motionPref === value ? '#fff' : c.inkSoft}>
                  {label}
                </Txt>
              </Press>
            ))}
          </View>
        </View>

        <Section>FEEL</Section>
        <Row
          icon="vibrate"
          label="Haptic feedback"
          right={
            <Switch
              value={haptics}
              onValueChange={(v) => {
                setHaptics(v);
                setHapticsEnabled(v);
                if (v) tick();
              }}
              trackColor={{ true: c.brand }}
            />
          }
        />

        <Section>NOTIFICATIONS</Section>
        <Row
          icon="bell-ring"
          label="Breaking news alerts"
          hint="A notification when a major story lands"
          right={
            <Switch
              value={notify}
              onValueChange={(v) => {
                tick();
                setNotify(v);
                setNotifyEnabled(v);
              }}
              trackColor={{ true: c.brand }}
            />
          }
        />

        <Section>DATA</Section>
        <Row
          icon="rotate-ccw"
          label="Reset quiz progress"
          hint={
            xp.lifetimeAsked > 0
              ? `Level ${lvl.level} · ${xp.xp} XP · ${xp.lifetimeAsked} answered`
              : 'Nothing recorded yet'
          }
          onPress={xp.lifetimeAsked > 0 ? confirmClearQuiz : undefined}
        />
        <Row icon="trash-2" label="Clear saved & history" danger onPress={confirmClearLibrary} />

        <Section>ABOUT</Section>
        {/* What the app sends where, in one screen the reader can find. It
            reaches exactly one server and stores everything else on the phone;
            saying so plainly is cheaper than a privacy policy nobody opens. */}
        <View style={[s.row, glassCard(c, isDark), { flexDirection: 'column', alignItems: 'stretch', gap: 8 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <LIcon name="info" size={18} color={c.inkSoft} />
            <Txt size={14.5} weight="semibold" style={{ flex: 1, marginLeft: 12 }}>
              Daily Mattr
            </Txt>
            <Txt size={13} weight="bold" color={c.inkFaint}>
              {Constants.expoConfig?.version ?? '—'}
            </Txt>
          </View>
          <Txt size={12.5} lh={19} weight="medium" color={c.inkFaint}>
            Stories come from publisher feeds. What you save, read and score stays on this device.
            The app sends anonymous view counts so the feed can stop showing you the same story twice.
          </Txt>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  section: { paddingHorizontal: 24, marginTop: 22, marginBottom: 10, textTransform: 'uppercase' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: 20,
    marginBottom: 10,
  },
  segment: { flexDirection: 'row', borderRadius: radius.pill, padding: 4 },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
});
