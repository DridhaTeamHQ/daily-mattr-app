import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { TOPICS_KEY } from './categories';
import type { Article } from './content';
import { NO_SIGNALS, personalise, type ReadSignals } from './rank';
import { useStore } from './store';

/* The reader's half of lib/rank, wired to the store.
 *
 * The important part is *when* this recomputes, not what it computes. Reading
 * a story changes the signals immediately, and if the order followed the
 * signals live, finishing a story would sink it — under the thumb, mid-scroll,
 * taking everything below it up a place. The feed would rearrange itself as a
 * direct consequence of being used.
 *
 * So the signals are snapshotted per visit. The order settles when the screen
 * comes into focus and then holds, however much the reader does while they are
 * there; what they did this session shows up the next time they open the tab.
 * Same reason Home pins `now` for its time bands instead of calling Date.now()
 * in the render.
 */
export function usePersonalisedFeed(list: Article[]): Article[] {
  const { history, disliked, topTopics, savedTopics } = useStore();

  /* What the reader said they wanted, before they had read anything.
     `topTopics` is derived from history, so on a fresh install it is empty and
     the feed is the desk's order with no personalisation at all — for exactly
     the reader who has just finished telling us what they like. Read once;
     onboarding writes it and nothing else touches it. */
  const [seed, setSeed] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(TOPICS_KEY)
      .then((raw) => {
        if (!alive || !raw) return;
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) setSeed(parsed.filter((x) => typeof x === 'string'));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  /* Read through a ref so the memo below can use the newest signals without
     listing them as dependencies — depending on them is exactly the live
     reordering this is avoiding. */
  const live = useRef<ReadSignals>(NO_SIGNALS);
  live.current = useMemo(
    () => ({
      readIds: new Set(history.map((h) => h.id)),
      dislikedIds: new Set(disliked),
      /* Stated interests count until read history has something to say. Once
         a reader has actually read enough for `topTopics` to mean anything,
         that is the better signal — what someone does beats what they said
         they would do — so the seed stops being merged in. */
      favouriteTopics: new Set(topTopics.length ? topTopics : seed),
      // savedTopics is id → topic; the categories are what matter here
      savedTopics: new Set(Object.values(savedTopics)),
    }),
    [history, disliked, topTopics, savedTopics, seed],
  );

  /* Bumped on focus, which is what makes a snapshot a snapshot. Also covers
     the first mount, since focus fires then too — and by that point the store
     has come back from AsyncStorage, so the first order is a personalised one
     rather than a default that visibly rearranges a moment later. */
  const [visit, setVisit] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setVisit((v) => v + 1);
    }, []),
  );

  const snapshot = useMemo(() => live.current, [visit]);

  /* Recomputes when the desk publishes something or the reader changes tab —
     both cases where the list is genuinely different and a settled order is
     expected. */
  return useMemo(() => personalise(list, snapshot), [list, snapshot]);
}
