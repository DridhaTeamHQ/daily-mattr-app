import * as Haptics from 'expo-haptics';

// Premium haptic language: sparse and semantic.
// tick    — selection detents (tabs, mode switch, page snap). Barely felt.
// soft    — meaningful state change (save, like). One soft thud, no buzz.
// success — rare completion moments.
export const tick = () => Haptics.selectionAsync();

export const soft = () =>
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft ?? Haptics.ImpactFeedbackStyle.Light);

export const success = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
