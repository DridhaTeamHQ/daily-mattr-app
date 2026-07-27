import { useSyncExternalStore } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { onlineManager, focusManager } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';

/* Connectivity, and telling react-query about it.

   react-query ships a browser-shaped default: it watches `window.online`,
   which does not exist in React Native, so `onlineManager` sat permanently on
   "online". Two consequences, both of which a news app on a train runs into:

   1. Nothing refetched when the connection came back. A query that failed in a
      tunnel stayed failed until something else invalidated it.
   2. Every failure surfaced as "Couldn't load stories", which reads as the
      app being broken rather than the phone being offline.

   Query results are already persisted to AsyncStorage (see app/_layout.tsx),
   so the cached-content half of offline has always worked. This is only the
   signal.

   `isInternetReachable` is deliberately part of the test: Android reports a
   captive-portal wifi as connected, and treating that as online means silent
   timeouts instead of an honest message. It is null while the reachability
   probe is still in flight, and null must not read as offline — a cold start
   would otherwise flash the offline state before the first probe returns. */

/* Idempotent, because the caller is at module scope in the router's root
   layout and Fast Refresh re-executes that on every hot update. Without the
   latch each reload stacked another AppState listener, and by the twentieth
   edit of a session every foreground was firing twenty refetches. */
let started = false;

export function startNetworkWatch(): () => void {
  if (started) return () => {};
  started = true;

  /* setEventListener returns void — react-query holds the setup function and
     runs its cleanup itself when a new listener replaces this one. The NetInfo
     unsubscribe is the return value of the *inner* callback, which is what the
     manager keeps. */
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      setOnline(!!state.isConnected && state.isInternetReachable !== false);
    }),
  );

  // Refetch on foreground too. Without this a phone that slept for an hour
  // shows an hour-old feed until something is scrolled.
  const onAppState = (status: AppStateStatus) => focusManager.setFocused(status === 'active');
  const sub = AppState.addEventListener('change', onAppState);

  return () => {
    sub.remove();
    started = false;
  };
}

/* Reads the same source react-query does, rather than a second NetInfo
   subscription — one definition of "online" for the whole app, so a screen can
   never disagree with the query layer about why a fetch failed. */
const subscribe = (cb: () => void) => onlineManager.subscribe(cb);
const snapshot = () => onlineManager.isOnline();

export function useIsOnline(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
