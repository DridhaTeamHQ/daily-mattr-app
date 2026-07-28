import { useSyncExternalStore } from 'react';

/* Which card the reader is actually on.
 *
 * Only one thing needs this, and it needs it badly: a video must not play on a
 * card that is mounted but off screen. The deck keeps a window of pages either
 * side of the visible one, so without this every qix in that window would start
 * at once — several decoders running, several audio sessions, and the battery
 * cost of all of them for a card nobody is looking at.
 *
 * Deliberately not React state on the deck. Putting it there would re-render
 * every mounted page on every swipe, which is the one thing a paging list must
 * not do. Cards that care subscribe; the rest never hear about it.
 */

let current: string | null = null;
const subscribers = new Set<() => void>();

export function setActiveCard(id: string | null): void {
  if (id === current) return;
  current = id;
  for (const notify of subscribers) notify();
}

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
