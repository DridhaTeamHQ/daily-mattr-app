import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Premium haptic language: sparse and semantic.
// tick    — selection detents (tabs, mode switch, page snap). Barely felt.
// soft    — meaningful state change (save, like). One soft thud, no buzz.
// success — rare completion moments.

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

export const tick = () => {
  if (enabled) Haptics.selectionAsync();
};

export const soft = () => {
  if (enabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft ?? Haptics.ImpactFeedbackStyle.Light);
};

export const medium = () => {
  if (enabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
};

export const success = () => {
  if (enabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
};

/* Sequences — premium feel comes from timed patterns, not intensity.
   Each answers one question: "did that happen?" */

// collecting something: a thump, then a tiny settle tick
export const save = () => {
  if (!enabled) return;
  soft();
  setTimeout(tick, 90);
};

// committing a big choice (dial select): decisive thump now,
// soft landing when the bloom dissolves
export const commit = (settleMs = 560) => {
  if (!enabled) return;
  medium();
  setTimeout(soft, settleMs);
};

// fresh content arrived: two feather ticks
export const arrive = () => {
  if (!enabled) return;
  tick();
  setTimeout(tick, 110);
};
