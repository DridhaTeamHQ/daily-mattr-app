import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

/* Which card the reader is actually on.
 *
 * Only one thing needs this, and it needs it badly: a video must not play on a
 * card that is mounted but off screen. The deck keeps a window of pages either
 * side of the visible one, so without this every qix in that window would start
 * at once — several decoders running, several audio sessions, and the battery
 * cost of all of them for a card nobody is looking at.
 *
 * "Off screen" turned out to mean more than "scrolled past". A tab screen stays
 * mounted when you leave it, so walking away from the deck left the card
 * mounted, active, and audible — a clip narrating away behind Home with no
 * visible source and no way to stop it. Leaving is now a first-class event:
 * see `useActiveCardWhileFocused`.
 *
 * Deliberately not React state on the deck. Putting it there would re-render
 * every mounted page on every swipe, which is the one thing a paging list must
 * not do. Cards that care subscribe; the rest never hear about it.
 */

let current: string | null = null;
/** What to resume when the app comes back. */
let parked: string | null = null;
/** Whether a screen that owns playback is in front right now. */
let focused = false;
const subscribers = new Set<() => void>();

export function setActiveCard(id: string | null): void {
  if (id === current) return;
  current = id;
  if (id) parked = id;
  for (const notify of subscribers) notify();
}

/* Backgrounding is leaving too.
 *
 * Whether a player keeps running when the app goes away is the platform's
 * decision, and for video the answer is often yes — which is right for a music
 * app and wrong for a news feed someone just swiped away from. Cleared on the
 * way out and restored on the way back, so returning to the app returns to the
 * card, still playing, rather than to a still that needs poking. */
AppState.addEventListener('change', (s) => {
  if (s === 'active') {
    if (current === null && parked) setActiveCard(parked);
  } else if (current !== null) {
    setActiveCard(null);
  }
});

function subscribe(notify: () => void): () => void {
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
  };
}

/** True while this card is the one on screen. */
export function useIsActiveCard(id: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => current === id,
    // server snapshot: nothing is active before the deck has scrolled
    () => false,
  );
}

/**
 * Ties the active card to a screen's focus.
 *
 * `getId` rather than an id: the deck's current card changes as it scrolls, and
 * this has to read it at focus time rather than close over whatever it was when
 * the screen mounted. Returning null means "nothing to resume", which is the
 * honest answer for a list that has not been scrolled yet.
 */
export function useActiveCardWhileFocused(getId: () => string | null): void {
  /* Through a ref, because the focus callback is created once and the id it
     should read is not settled when it is. On the article route the screen
     focuses while the story is still loading, so a `getId` captured then
     closes over `undefined` and reports null for the life of the screen —
     which is a video that never starts, indistinguishable from one that will
     not play. */
  const latest = useRef(getId);
  latest.current = getId;

  useFocusEffect(
    useCallback(() => {
      focused = true;
      const id = latest.current();
      if (id) setActiveCard(id);
      return () => {
        focused = false;
        setActiveCard(null);
      };
    }, []),
  );

  /* And again whenever the id arrives or changes, since focus has long since
     happened by then. Guarded on `focused` so a screen sitting behind another
     cannot claim playback by finishing a fetch. */
  const id = getId();
  useEffect(() => {
    if (focused && id) setActiveCard(id);
  }, [id]);
}
