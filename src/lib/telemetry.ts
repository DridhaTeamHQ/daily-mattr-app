import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { supabase } from './supabase';

// Behavioural telemetry → app_log_events RPC (security definer; the anon key
// cannot touch the tables directly). Batched: flush at 20 events, every 12s,
// or when the app backgrounds.

export type AppEvent = {
  article_id?: string | null;
  event_type:
    | 'impression'
    | 'dwell'
    | 'read_complete'
    | 'open_full'
    | 'save'
    | 'unsave'
    | 'share'
    | 'like'
    | 'unlike'
    | 'skip'
    | 'mode_switch';
  dwell_ms?: number;
  words?: number;
  topic?: string;
  meta?: Record<string, unknown>;
};

const DEVICE_KEY = 'dailymattr.device.v1';
let deviceId: string | null = null;
let buffer: AppEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
const seenThisSession = new Set<string>();

export async function getDeviceId(): Promise<string> {
  if (deviceId) return deviceId;
  let id = await AsyncStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = 'dm-' + Array.from({ length: 24 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
    await AsyncStorage.setItem(DEVICE_KEY, id);
  }
  deviceId = id;
  return id;
}

export function track(e: AppEvent) {
  buffer.push(e);
  if (buffer.length >= 20) {
    void flush();
  } else if (!timer) {
    timer = setTimeout(() => void flush(), 12_000);
  }
}

// One impression per article per session — enough for exposure debiasing
// without flooding the events table.
export function trackImpression(articleId: string, topic: string) {
  if (seenThisSession.has(articleId)) return;
  seenThisSession.add(articleId);
  track({ article_id: articleId, event_type: 'impression', topic });
}

export async function flush() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!buffer.length) return;
  const batch = buffer.splice(0, 100);
  try {
    const id = await getDeviceId();
    const { error } = await supabase.rpc('app_log_events', {
      p_device_id: id,
      p_events: batch,
    });
    if (error) throw error;
  } catch {
    // put the batch back; retry on next flush
    buffer = [...batch, ...buffer].slice(0, 300);
  }
}

AppState.addEventListener('change', (s) => {
  if (s === 'background' || s === 'inactive') void flush();
});

// Foreground-only dwell timer for one article view.
export function createDwellTimer() {
  let startedAt = Date.now();
  let accumulated = 0;
  let running = true;

  const sub = AppState.addEventListener('change', (s) => {
    if (s === 'active') {
      if (!running) {
        startedAt = Date.now();
        running = true;
      }
    } else if (running) {
      accumulated += Date.now() - startedAt;
      running = false;
    }
  });

  return {
    stop(): number {
      if (running) accumulated += Date.now() - startedAt;
      running = false;
      sub.remove();
      return Math.min(accumulated, 180_000);
    },
  };
}
