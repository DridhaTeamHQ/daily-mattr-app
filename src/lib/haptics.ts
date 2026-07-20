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

export const success = () => {
  if (enabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
};
