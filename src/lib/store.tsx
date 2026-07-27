import React, { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { hydrate as progressHydrate } from './progress';
import { track } from './telemetry';

// All personal state (saved, history, likes) is local to the device.
// The database is never written to.

type HistoryEntry = { id: string; topic: string; at: number };

type Store = {
  saved: string[];
  savedTopics: Record<string, string>; // id -> topic
  history: HistoryEntry[];
  liked: string[];
  disliked: string[];
  toggleSaved: (id: string, topic: string) => void;
  isSaved: (id: string) => boolean;
  toggleLiked: (id: string, topic: string) => void;
  isDisliked: (id: string) => boolean;
  toggleDisliked: (id: string, topic: string) => void;
  isLiked: (id: string) => boolean;
  recordRead: (id: string, topic: string) => void;
  clearAll: () => void;
  topTopics: string[]; // most-read topics, for "Because you read …"
};

const Ctx = createContext<Store | null>(null);
const KEY = 'dailymattr.local.v1';

/* ---------- leaf subscriptions ----------

   A module-level mirror of the collections, so a single card can subscribe to
   one boolean instead of to the whole context.

   This exists because of a specific, measured problem. The context value is a
   useMemo keyed on `history`, and `recordRead` pushes to `history` for every
   card that becomes viewable in the reader — so the provider value got a new
   identity on every swipe. React re-renders every consumer of a changed
   context REGARDLESS of props, so the React.memo around ReaderCard could not
   stop it, and ReaderCard is the most expensive component in the app: two
   full-screen images, a MaskedView and five gradients, three of them mounted
   at once. useSyncExternalStore over a boolean re-renders only when that
   card's own saved/liked state actually flips. */

type Snap = { saved: string[]; liked: string[]; disliked: string[] };
let snap: Snap = { saved: [], liked: [], disliked: [] };
const snapSubs = new Set<() => void>();
const emitSnap = () => snapSubs.forEach((f) => f());
const subscribeSnap = (f: () => void) => {
  snapSubs.add(f);
  return () => {
    snapSubs.delete(f);
  };
};

export function useIsSaved(id: string): boolean {
  const get = () => snap.saved.includes(id);
  return useSyncExternalStore(subscribeSnap, get, get);
}
export function useIsLiked(id: string): boolean {
  const get = () => snap.liked.includes(id);
  return useSyncExternalStore(subscribeSnap, get, get);
}
export function useIsDisliked(id: string): boolean {
  const get = () => snap.disliked.includes(id);
  return useSyncExternalStore(subscribeSnap, get, get);
}

/* Stable-identity actions. Reading them through a function rather than a hook
   means a card can fire a toggle without subscribing to anything at all. */
type Actions = Pick<Store, 'toggleSaved' | 'toggleLiked' | 'toggleDisliked' | 'recordRead'>;
const NOOP: Actions = {
  toggleSaved: () => {},
  toggleLiked: () => {},
  toggleDisliked: () => {},
  recordRead: () => {},
};
let liveActions: Actions = NOOP;
export const storeActions = (): Actions => liveActions;

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [saved, setSaved] = useState<string[]>([]);
  const [savedTopics, setSavedTopics] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [liked, setLiked] = useState<string[]>([]);
  const [disliked, setDisliked] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((raw) => {
      let hist: HistoryEntry[] = [];
      if (raw) {
        try {
          const s = JSON.parse(raw);
          setSaved(s.saved ?? []);
          setSavedTopics(s.savedTopics ?? {});
          hist = s.history ?? [];
          setHistory(hist);
          setLiked(s.liked ?? []);
          setDisliked(s.disliked ?? []);
        } catch {}
      }
      setLoaded(true);
      // Progress hydrates from here rather than from the root layout: this is
      // the one moment the legacy history array is known to be loaded, and
      // progress needs it to seed day records for users upgrading from the old
      // on-the-fly streak. hydrate() is idempotent, so a second call is free.
      // never let a bad stored blob reject into the boot path
      progressHydrate(hist).catch(() => {});
    });
  }, []);

  /* Debounced, and flushed when the app leaves the foreground.

     This used to serialise the whole blob and hit the disk on every change of
     these arrays — and `recordRead` changes `history` for every card that
     becomes viewable in the reader. That was ~15KB of JSON.stringify plus a
     native write on the JS thread per swipe, to persist one array element,
     landing exactly during the snap settle. 800ms trailing matches the
     discipline already in lib/progress.ts. */
  useEffect(() => {
    if (!loaded) return;
    const write = () =>
      AsyncStorage.setItem(
        KEY,
        JSON.stringify({ saved, savedTopics, history, liked, disliked }),
      ).catch(() => {});
    const t = setTimeout(write, 800);
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') write();
    });
    return () => {
      clearTimeout(t);
      sub.remove();
    };
  }, [saved, savedTopics, history, liked, disliked, loaded]);

  const value = useMemo<Store>(() => {
    const topicCounts: Record<string, number> = {};
    for (const h of history) topicCounts[h.topic] = (topicCounts[h.topic] ?? 0) + 1;
    const topTopics = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([t]) => t);

    return {
      saved,
      savedTopics,
      history,
      liked,
      disliked,
      isSaved: (id) => saved.includes(id),
      isLiked: (id) => liked.includes(id),
      isDisliked: (id) => disliked.includes(id),
      toggleSaved: (id, topic) => {
        const wasSaved = saved.includes(id);
        track({ article_id: id, event_type: wasSaved ? 'unsave' : 'save', topic });
        setSaved((s) => (s.includes(id) ? s.filter((x) => x !== id) : [id, ...s]));
        setSavedTopics((m) => ({ ...m, [id]: topic }));
      },
      toggleLiked: (id, topic) => {
        const wasLiked = liked.includes(id);
        track({ article_id: id, event_type: wasLiked ? 'unlike' : 'like', topic });
        setLiked((s) => (s.includes(id) ? s.filter((x) => x !== id) : [id, ...s]));
        // the two are opposites — liking clears a dislike
        if (!wasLiked) setDisliked((s) => s.filter((x) => x !== id));
      },
      toggleDisliked: (id, topic) => {
        const wasDisliked = disliked.includes(id);
        // tracked so it feeds the ranking as a negative signal, not just UI state
        track({ article_id: id, event_type: wasDisliked ? 'undislike' : 'dislike', topic });
        setDisliked((s) => (s.includes(id) ? s.filter((x) => x !== id) : [id, ...s]));
        if (!wasDisliked) setLiked((s) => s.filter((x) => x !== id));
      },
      recordRead: (id, topic) =>
        setHistory((h) => {
          const rest = h.filter((e) => e.id !== id);
          return [{ id, topic, at: Date.now() }, ...rest].slice(0, 200);
        }),
      clearAll: () => {
        setSaved([]);
        setSavedTopics({});
        setHistory([]);
        setLiked([]);
        setDisliked([]);
      },
      topTopics,
    };
  }, [saved, savedTopics, history, liked, disliked]);

  // Feed the module mirror that leaf components subscribe to. Keeping this in
  // an effect (not during render) is what makes it React-Compiler-safe.
  useEffect(() => {
    snap = { saved, liked, disliked };
    emitSnap();
  }, [saved, liked, disliked]);

  useEffect(() => {
    liveActions = value;
  }, [value]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}
