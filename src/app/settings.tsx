import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, Switch, Alert, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { radius } from '@/theme';
import { useTheme, glassCard } from '@/lib/theme';
import { Txt, Press, IconButton, LIcon } from '@/components/ui';
import { getHapticsEnabled, setHapticsEnabled, tick } from '@/lib/haptics';
import { useStore } from '@/lib/store';

export default function Settings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { c, isDark, toggle } = useTheme();
  const { clearAll } = useStore();
  const [haptics, setHaptics] = useState(getHapticsEnabled());

  const confirmClear = () => {
    const doClear = () => {
      clearAll();
      AsyncStorage.removeItem('dailymattr.breaking.lastseen.v1');
    };
    if (Platform.OS === 'web') {
      doClear();
    } else {
      Alert.alert('Clear local data?', 'Saved articles, history and reading stats on this device will be reset.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: doClear },
      ]);
    }
  };

  const Row = ({
    icon,
    label,
    right,
    onPress,
    danger,
  }: {
    icon: string;
    label: string;
    right?: React.ReactNode;
    onPress?: () => void;
    danger?: boolean;
  }) => (
    <Press onPress={onPress} style={[s.row, glassCard(c, isDark)]}>
      <LIcon name={icon} size={18} color={danger ? c.danger : c.inkSoft} />
      <Txt size={14.5} weight="semibold" color={danger ? c.danger : c.ink} style={{ flex: 1, marginLeft: 12 }}>
        {label}
      </Txt>
      {right}
    </Press>
  );

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

      <ScrollView contentContainerStyle={{ paddingTop: 10, paddingBottom: 40 }}>
        <Txt size={11.5} weight="semibold" color={c.inkFaint} ls={1.2} style={s.section}>
          APPEARANCE
        </Txt>
        <Row
          icon={isDark ? 'moon' : 'sun'}
          label="Dark theme"
          onPress={undefined}
          right={<Switch value={isDark} onValueChange={() => { tick(); toggle(); }} trackColor={{ true: c.brand }} />}
        />

        <Txt size={11.5} weight="semibold" color={c.inkFaint} ls={1.2} style={s.section}>
          FEEL
        </Txt>
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

        <Txt size={11.5} weight="semibold" color={c.inkFaint} ls={1.2} style={s.section}>
          DATA
        </Txt>
        <Row icon="trash-2" label="Clear saved & history" danger onPress={confirmClear} />

        <Txt size={12} weight="medium" color={c.inkFaint} style={{ textAlign: 'center', marginTop: 34 }}>
          Daily Mattr · prototype
        </Txt>
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
});
