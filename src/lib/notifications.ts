import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { supabase } from './supabase';
import { fetchBreaking, type BreakingItem } from './queries';
import { getDeviceId } from './telemetry';

// Breaking-news notifications.
// - Server cron detects breaking + sends remote push to registered tokens
//   (works in dev/EAS builds; Expo Go on Android cannot receive remote push).
// - Client also polls on app-open/foreground and fires a LOCAL notification
//   for anything new — works everywhere, including Expo Go.

const LAST_SEEN_KEY = 'dailymattr.breaking.lastseen.v1';
const LAST_NOTIFIED_KEY = 'dailymattr.breaking.lastnotified.v1';

try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
} catch {
  // Expo Go strips parts of expo-notifications — never let init take the app down
}

export async function ensurePermissions(): Promise<boolean> {
  try {
    const settings = await Notifications.getPermissionsAsync();
    if (settings.granted) return true;
    const req = await Notifications.requestPermissionsAsync();
    return req.granted;
  } catch {
    return false;
  }
}

// Register for remote push. Silently no-ops where unsupported (Expo Go).
export async function registerPushToken(): Promise<void> {
  try {
    if (!Device.isDevice) return;
    const ok = await ensurePermissions();
    if (!ok) return;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('breaking', {
        name: 'Breaking news',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
      });
    }
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    const deviceId = await getDeviceId();
    await supabase.rpc('app_register_push', {
      p_device_id: deviceId,
      p_token: token,
      p_platform: Platform.OS,
    });
  } catch {
    // Expo Go on Android or missing project id — local notifications still work.
  }
}

// Poll for new breaking stories; fire a local notification for the newest
// unseen one. Returns the full list for the bell screen.
export async function checkBreaking(): Promise<{ items: BreakingItem[]; unread: number }> {
  const items = await fetchBreaking(20);
  const lastSeen = Number((await AsyncStorage.getItem(LAST_SEEN_KEY)) ?? 0);
  const lastNotified = Number((await AsyncStorage.getItem(LAST_NOTIFIED_KEY)) ?? 0);

  const unread = items.filter((b) => new Date(b.detectedAt).getTime() > lastSeen).length;

  const fresh = items.filter((b) => new Date(b.detectedAt).getTime() > lastNotified);
  if (fresh.length > 0) {
    const top = fresh[0];
    await AsyncStorage.setItem(LAST_NOTIFIED_KEY, String(Date.now()));
    const ok = await ensurePermissions();
    if (ok) {
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: '🔴 Breaking — Daily Mattr',
            body: top.title,
            data: { articleId: top.id },
          },
          trigger: null,
        });
      } catch {}
    }
  }

  return { items, unread };
}

export async function markBreakingSeen(): Promise<void> {
  await AsyncStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
}

// Badge count only — no notification side effects.
export async function getUnreadBreaking(): Promise<number> {
  try {
    const items = await fetchBreaking(20);
    const lastSeen = Number((await AsyncStorage.getItem(LAST_SEEN_KEY)) ?? 0);
    return items.filter((b) => new Date(b.detectedAt).getTime() > lastSeen).length;
  } catch {
    return 0;
  }
}
