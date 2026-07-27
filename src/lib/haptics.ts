import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Premium haptic language: sparse, semantic, and CRISP.
//
// On Android, impactAsync/selectionAsync fall back to raw vibrator waveforms —
// a soft rubbery buzz that reads as "springy". The system haptic constants
// (performAndroidHapticsAsync) fire the same sharp actuator events the OS
// keyboard uses, and Expo documents them as the recommended path on Android,
// so every primitive routes through them there. Sequences are also flattened
// on Android: one decisive event beats a double-pulse echo on most motors.

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

// Rate gate.
//
// The actuator needs time to settle. Calls that land on top of each other
// don't produce two taps — they smear into one long mushy buzz, which is what
// made fast scrolling through the reader feel bad: onViewableItemsChanged
// fires a tick per card, and flicking through several lands them milliseconds
// apart. 40ms is under the ~90ms gap of the deliberate sequences below, so
// those still play in full; only unintended pile-ups get thinned.
const MIN_GAP_MS = 40;
let lastAt = 0;

function gate(): boolean {
  if (!enabled) return false;
  const now = Date.now();
  if (now - lastAt < MIN_GAP_MS) return false;
  lastAt = now;
  return true;
}

// Every call is fire-and-forget. Haptics reject on devices without an
// actuator and in Low Power Mode, and an unhandled rejection in a release
// build is a crash, so all of them swallow.
const android = (type: Haptics.AndroidHaptics) => {
  if (Haptics.performAndroidHapticsAsync) Haptics.performAndroidHapticsAsync(type).catch(() => {});
  else Haptics.selectionAsync().catch(() => {});
};

// Pending tails of the iOS sequences, so a rapid second gesture replaces the
// first instead of layering an echo on top of it.
let tail: ReturnType<typeof setTimeout> | null = null;
const scheduleTail = (fn: () => void, ms: number) => {
  if (tail) clearTimeout(tail);
  tail = setTimeout(() => {
    tail = null;
    fn();
  }, ms);
};

// barely-felt detent: tabs, mode switch, page snap
export const tick = () => {
  if (!gate()) return;
  if (isAndroid) android(Haptics.AndroidHaptics.Segment_Tick);
  else Haptics.selectionAsync().catch(() => {});
};

// meaningful state change: one clean click, no buzz
export const soft = () => {
  if (!gate()) return;
  if (isAndroid) android(Haptics.AndroidHaptics.Context_Click);
  else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
};

export const medium = () => {
  if (!gate()) return;
  if (isAndroid) android(Haptics.AndroidHaptics.Confirm);
  else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
};

export const success = () => {
  if (!gate()) return;
  if (isAndroid) android(Haptics.AndroidHaptics.Confirm);
  else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
};

/* Sequences — timed patterns on iOS, single decisive events on Android
   (stacked pulses smear together on most Android actuators). */

// collecting something
export const save = () => {
  if (!enabled) return;
  if (isAndroid) {
    if (gate()) android(Haptics.AndroidHaptics.Confirm);
    return;
  }
  soft();
  scheduleTail(tick, 90);
};

// committing a big choice (dial select)
export const commit = (settleMs = 560) => {
  if (!enabled) return;
  if (isAndroid) {
    if (gate()) android(Haptics.AndroidHaptics.Long_Press);
    return;
  }
  medium();
  scheduleTail(soft, settleMs);
};

// fresh content arrived
export const arrive = () => {
  if (!enabled) return;
  if (isAndroid) {
    if (gate()) android(Haptics.AndroidHaptics.Segment_Tick);
    return;
  }
  tick();
  scheduleTail(tick, 110);
};
