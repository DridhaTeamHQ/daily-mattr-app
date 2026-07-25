import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [saved, setSaved] = useState<string[]>([]);
  const [savedTopics, setSavedTopics] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [liked, setLiked] = useState<string[]>([]);
  const [disliked, setDisliked] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((raw) => {
      if (raw) {
        try {
          const s = JSON.parse(raw);
          setSaved(s.saved ?? []);
          setSavedTopics(s.savedTopics ?? {});
          setHistory(s.history ?? []);
          setLiked(s.liked ?? []);
          setDisliked(s.disliked ?? []);
        } catch {}
      }
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(KEY, JSON.stringify({ saved, savedTopics, history, liked, disliked }));
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

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}
