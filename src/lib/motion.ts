import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/* Whether this app is allowed to move.

   Reduce Motion was honoured in exactly one file — the celebration overlay —
   and ignored everywhere else. The worst offender was the reel: a photograph
   on a nine-second Ken Burns loop that never stops, plus a sweeping playhead,
   which is precisely the kind of continuous large-area movement that triggers
   vestibular symptoms. Someone who has turned Reduce Motion on has said so
   about that.

   Two inputs, one answer:

     system   follow the OS setting (the default, and the right default)
     reduced  always still, even if the OS is not asking for it
     full     always animate — for a device where the OS flag is on for some
              other reason and the reader wants this app lively anyway

   Shaped like lib/haptics.ts on purpose: a module-level value readable
   synchronously during render, hydrated from storage in the background,
   because a hook that returns the wrong answer on the first frame produces
   exactly the animation it was meant to prevent. */

const KEY = 'dailymattr.motion.v1';

export type MotionPref = 'system' | 'reduced' | 'full';

let pref: MotionPref = 'system';
let systemReduced = false;

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/* Snapshot must be referentially stable for useSyncExternalStore — returning a
   freshly computed boolean is fine (primitives compare by value), but the
   computation has to be cheap, so it is cached rather than recomputed. */
let allowed = true;
function recompute() {
  const next = pref === 'reduced' ? false : pref === 'full' ? true : !systemReduced;
  if (next === allowed) return;
  allowed = next;
  emit();
}

AsyncStorage.getItem(KEY)
  .then((v) => {
    if (v === 'reduced' || v === 'full' || v === 'system') {
      pref = v;
      recompute();
    }
  })
  .catch(() => {});

AccessibilityInfo.isReduceMotionEnabled()
  .then((on) => {
    systemReduced = on;
    recompute();
  })
  .catch(() => {});

// the OS setting can change while the app is open
AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => {
  systemReduced = on;
  recompute();
});

export function getMotionPref(): MotionPref {
  return pref;
}

export function setMotionPref(next: MotionPref): void {
  pref = next;
  recompute();
  AsyncStorage.setItem(KEY, next).catch(() => {});
}

/** True when the OS reports Reduce Motion on, whatever the app override says. */
export function isSystemReduced(): boolean {
  return systemReduced;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const snapshot = () => allowed;

/** False means: no loops, no parallax, no page-scale. Fades are still fine. */
export function useMotionAllowed(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
