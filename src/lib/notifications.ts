import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import { supabase } from './supabase';
import { cms } from './cms';
import { type Article } from './content';
import { getDeviceId } from './telemetry';

/* Notifications.
 *
 * Breaking alerts are off, and the reason is editorial rather than technical.
 * They were driven by `app_get_breaking`, which finds clusters in the *scraped*
 * corpus — by definition stories no editor has seen, let alone approved. The
 * app now shows only what the desk published, so pushing an unapproved story to
 * someone's lock screen would be the loudest possible way to break that rule.
 *
 * What remains is everything below the alert: permissions, the push token
 * registration, the channel and the tap listener. When the desk gets a way to
 * mark an item urgent, that is the piece to reconnect — the plumbing is here
 * and working.
 *
 * expo-notifications THROWS ON IMPORT in Expo Go on Android (removed in
 * SDK 53+), so it must be loaded lazily behind a guard.
 */

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
      /* The channel the desk broadcasts on. Its id stays `breaking` because the
         CMS sends that string and existing installs already have the channel —
         Android keys off the id, and a new one would leave every phone that has
         not updated receiving on a channel the app no longer configures.

         Worth knowing when changing this: only `name` and `description` can be
         edited after a channel exists. Importance, sound and lock-screen
         visibility are frozen at creation, deliberately — they are the reader's
         to change from that point, not ours. So the last two lines take effect
         on fresh installs and are a no-op on upgrades. */
      await N.setNotificationChannelAsync('breaking', {
        name: 'Top stories',
        description: 'The few stories the desk thinks are worth interrupting you for.',
        importance: N.AndroidImportance.HIGH,
        sound: 'default',
        // A headline is public by definition; there is nothing here to hide
        // behind "1 new notification" on the lock screen.
        lockscreenVisibility: N.AndroidNotificationVisibility.PUBLIC,
        lightColor: '#3979FF',
      });
    }
    const token = (await N.getExpoPushTokenAsync()).data;
    const deviceId = await getDeviceId();

    /* Registered in both projects, because each answers a different question.
       DB A has held tokens all along. But the thing that knows a story was
       featured is the Studio, which lives in DB B and has no service-role
       reach into DB A — so rather than bridge two projects with a new secret,
       the token is written to both and each side reads its own.

       Settled rather than awaited together: one project being unreachable
       should not cost the registration in the other. */
    const results = await Promise.allSettled([
      supabase.rpc('app_register_push', {
        p_device_id: deviceId,
        p_token: token,
        p_platform: Platform.OS,
      }),
      cms?.rpc('app_register_push_token', {
        p_device: deviceId,
        p_token: token,
        p_platform: Platform.OS,
      }) ?? Promise.resolve(null),
    ]);

    for (const r of results) {
      if (r.status === 'rejected') console.warn('[push] register:', r.reason);
    }
  } catch {
    /* Almost always the absence of FCM credentials, which is a build-time fact
       the reader can do nothing about: without them getExpoPushTokenAsync
       throws and there is no token to register. Swallowed rather than surfaced
       — a notification that cannot arrive is not an error the reader caused. */
  }
}

/**
 * The tap that launched the app, if that is why it launched.
 *
 * The listener below only hears taps that happen while the app is alive. When
 * the app was killed, Android delivers the response during startup — before
 * any JavaScript has run, let alone before an effect gated on a value read out
 * of AsyncStorage. Nobody is listening yet, so the tap is simply lost and the
 * reader lands on the feed wondering where their story went.
 *
 * expo-notifications keeps that response for exactly this, so it has to be
 * asked for rather than waited for. Cleared once read: without that, every
 * later remount would open the same story again, days after it was tapped.
 */
export async function consumeLaunchNotification(): Promise<string | null> {
  if (!N) return null;
  try {
    const resp = await N.getLastNotificationResponseAsync();
    const id = resp?.notification?.request?.content?.data?.articleId;
    if (!id) return null;
    await N.clearLastNotificationResponseAsync();
    return String(id);
  } catch {
    return null;
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

export type BreakingItem = Article & { detectedAt: string; sourceCount: number };

/* The bell screen, with nothing behind it.
 *
 * Kept as a function rather than deleted along with its callers: the screen,
 * the badge and the poll are all still wired, and reconnecting them is a matter
 * of giving this something to return. Deleting it would mean rebuilding three
 * surfaces to get urgent stories back.
 */
export async function checkBreaking(): Promise<{ items: BreakingItem[]; unread: number }> {
  return { items: [], unread: 0 };
}

export async function markBreakingSeen(): Promise<void> {
  await AsyncStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
}

/** Badge count. Zero until the desk can mark an item urgent. */
export async function getUnreadBreaking(): Promise<number> {
  return 0;
}
