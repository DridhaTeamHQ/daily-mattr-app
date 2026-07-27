import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import { supabase } from './supabase';
import { fetchBreaking, type BreakingItem } from './queries';
import { getDeviceId } from './telemetry';

// Breaking-news notifications.
// expo-notifications THROWS ON IMPORT in Expo Go on Android (removed in
// SDK 53+), so it must be loaded lazily behind a guard. In Expo Go the app
// still gets the bell screen + unread badge (pure Supabase); local/remote
// notifications light up automatically in a real dev/EAS build.

let N: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  N = require('expo-notifications');
  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
} catch {
  N = null; // Expo Go on Android — notifications unavailable, app runs fine
}

const LAST_SEEN_KEY = 'dailymattr.breaking.lastseen.v1';
const LAST_NOTIFIED_KEY = 'dailymattr.breaking.lastnotified.v1';
const ENABLED_KEY = 'dailymattr.notify.v1';

/* An in-app off switch for breaking alerts.

   Until now the only way to stop them was to revoke the OS permission, which
   is a blunt instrument: it also kills the notification the reader might
   actually want later, and there was nothing in the app to say the setting
   existed. Same shape as lib/haptics.ts — a module-level flag readable
   synchronously, hydrated in the background — because checkBreaking runs at
   boot and must not wait on storage to decide whether to stay quiet.

   Defaults to on: a news app that never tells you about breaking news is not
   what anyone installed. */
let notifyEnabled = true;
AsyncStorage.getItem(ENABLED_KEY)
  .then((v) => {
    if (v === 'off') notifyEnabled = false;
  })
  .catch(() => {});

export function getNotifyEnabled(): boolean {
  return notifyEnabled;
}

export function setNotifyEnabled(v: boolean): void {
  notifyEnabled = v;
  AsyncStorage.setItem(ENABLED_KEY, v ? 'on' : 'off').catch(() => {});
}

export async function ensurePermissions(): Promise<boolean> {
  if (!N) return false;
  try {
    const settings = await N.getPermissionsAsync();
    if (settings.granted) return true;
    const req = await N.requestPermissionsAsync();
    return req.granted;
  } catch {
    return false;
  }
}

// Register for remote push. Silently no-ops where unsupported.
export async function registerPushToken(): Promise<void> {
  if (!N) return;
  try {
    if (!Device.isDevice) return;
    const ok = await ensurePermissions();
    if (!ok) return;
    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync('breaking', {
        name: 'Breaking news',
        importance: N.AndroidImportance.HIGH,
        sound: 'default',
      });
    }
    const token = (await N.getExpoPushTokenAsync()).data;
    const deviceId = await getDeviceId();
    await supabase.rpc('app_register_push', {
      p_device_id: deviceId,
      p_token: token,
      p_platform: Platform.OS,
    });
  } catch {
    // missing project id etc. — remote push simply stays off
  }
}

// Notification tap → callback with the articleId. No-op where unsupported.
export function addNotificationTapListener(cb: (articleId: string) => void): { remove: () => void } {
  if (!N) return { remove: () => {} };
  try {
    const sub = N.addNotificationResponseReceivedListener((resp: any) => {
      const id = resp?.notification?.request?.content?.data?.articleId;
      if (id) cb(String(id));
    });
    return { remove: () => sub.remove() };
  } catch {
    return { remove: () => {} };
  }
}

// Poll for new breaking stories; fire a local notification for the newest
// unseen one when the platform allows it. Returns the list for the bell screen.
export async function checkBreaking(): Promise<{ items: BreakingItem[]; unread: number }> {
  const items = await fetchBreaking(20);
  const lastSeen = Number((await AsyncStorage.getItem(LAST_SEEN_KEY)) ?? 0);
  const lastNotified = Number((await AsyncStorage.getItem(LAST_NOTIFIED_KEY)) ?? 0);

  const unread = items.filter((b) => new Date(b.detectedAt).getTime() > lastSeen).length;

  const fresh = items.filter((b) => new Date(b.detectedAt).getTime() > lastNotified);
  if (fresh.length > 0) {
    // The watermark advances whether or not a notification is sent, so turning
    // alerts back on does not immediately fire one for a story from last week.
    await AsyncStorage.setItem(LAST_NOTIFIED_KEY, String(Date.now()));
    if (notifyEnabled && N && (await ensurePermissions())) {
      try {
        await N.scheduleNotificationAsync({
          content: {
            title: '🔴 Breaking — Daily Mattr',
            body: fresh[0].title,
            data: { articleId: fresh[0].id },
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
