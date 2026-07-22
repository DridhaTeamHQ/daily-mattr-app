import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Premium haptic language: sparse, semantic, and CRISP.
//
// On Android, impactAsync falls back to raw vibrator waveforms — a soft
// rubbery buzz that reads as "springy". The system haptic constants
// (performAndroidHapticsAsync) fire the same sharp actuator events the OS
// keyboard uses, so every primitive routes through them on Android.
// Sequences are also flattened on Android: one decisive event beats a
// double-pulse echo on most Android motors.

const KEY = 'dailymattr.haptics.v1';
let enabled = true;
AsyncStorage.getItem(KEY).then((v) => {
  if (v === 'off') enabled = false;
});

export function getHapticsEnabled(): boolean {
  return enabled;
}

export function setHapticsEnabled(v: boolean): void {
  enabled = v;
  AsyncStorage.setItem(KEY, v ? 'on' : 'off');
}

const isAndroid = Platform.OS === 'android';

const android = (type: Haptics.AndroidHaptics) => {
  // guarded: older runtimes without the API fall back to selection
  if (Haptics.performAndroidHapticsAsync) Haptics.performAndroidHapticsAsync(type);
  else Haptics.selectionAsync();
};

// barely-felt detent: tabs, mode switch, page snap
export const tick = () => {
  if (!enabled) return;
  if (isAndroid) android(Haptics.AndroidHaptics.Segment_Tick);
  else Haptics.selectionAsync();
};

// meaningful state change: one clean click, no buzz
export const soft = () => {
  if (!enabled) return;
  if (isAndroid) android(Haptics.AndroidHaptics.Context_Click);
  else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft ?? Haptics.ImpactFeedbackStyle.Light);
};

export const medium = () => {
  if (!enabled) return;
  if (isAndroid) android(Haptics.AndroidHaptics.Confirm);
  else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
};

export const success = () => {
  if (!enabled) return;
  if (isAndroid) android(Haptics.AndroidHaptics.Confirm);
  else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
};

/* Sequences — timed patterns on iOS, single decisive events on Android
   (stacked pulses smear together on most Android actuators). */

// collecting something
export const save = () => {
  if (!enabled) return;
  if (isAndroid) {
    android(Haptics.AndroidHaptics.Confirm);
    return;
  }
  soft();
  setTimeout(tick, 90);
};

// committing a big choice (dial select)
export const commit = (settleMs = 560) => {
  if (!enabled) return;
  if (isAndroid) {
    android(Haptics.AndroidHaptics.Long_Press);
    return;
  }
  medium();
  setTimeout(soft, settleMs);
};

// fresh content arrived
export const arrive = () => {
  if (!enabled) return;
  if (isAndroid) {
    android(Haptics.AndroidHaptics.Segment_Tick);
    return;
  }
  tick();
  setTimeout(tick, 110);
};
