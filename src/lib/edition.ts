import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dayKey, type DayKey } from './day';
import { normTitle, type Article } from './content';
import { fetchForYou } from './queries';
import { snapshot as progressSnapshot, subscribe as subscribeProgress } from './progress';

/* Today's Edition — a bounded, pinned set of stories that constitutes "a day".

   The feed publishes ~234 stories a day, so "read everything published today"
   is not achievable by anyone and a caught-up moment defined that way would
   never fire. The edition is the top slice, chosen once and then frozen.

   Pinning is the whole point. app_get_feed ranks against a server-side
   seen_count that impression telemetry bumps, so calling it twice returns
   different sets — an unpinned edition would silently reshuffle mid-day and
   "12 of 18" would be meaningless. We persist the id list, never the bodies:
   articles are re-fetched by id, so an editorial correction still lands, but
   the set and its order cannot move. */

const KEY = 'dailymattr.edition.v1';

const TARGET = 18;
const MIN = 12;
const FRESH_WINDOW_MS = 36 * 3_600_000;
const MAX_PER_TOPIC = 4;

export type EditionItem = { id: string; topic: string; publishedAt: string };

export type Edition = {
  version: 1;
  day: DayKey;
  builtAt: number;
  items: EditionItem[];
  size: number;
  /** set once the caught-up moment has been shown for this edition */
  celebratedAt: number | null;
};

export type EditionStatus = 'idle' | 'building' | 'ready' | 'error';

let edition: Edition | null = null;
let status: EditionStatus = 'idle';
let hydrated = false;
let building: Promise<Edition | null> | null = null;

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function persist(): void {
  if (!edition) return;
  AsyncStorage.setItem(KEY, JSON.stringify(edition)).catch(() => {});
}

export async function hydrateEdition(): Promise<void> {
  if (hydrated) return;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Edition;
      if (parsed?.version === 1 && Array.isArray(parsed.items)) {
        edition = parsed;
        status = 'ready';
      }
    }
  } catch {
    edition = null;
  }
  hydrated = true;
  emit();
}

function ts(iso: string | null | undefined): number {
  const t = Date.parse(iso ?? '');
  return Number.isFinite(t) ? t : 0;
}

/** Picks today's stories. Exported for testing — pure given `pool`. */
export function selectEdition(pool: Article[], now: number, exclude: Set<string>): EditionItem[] {
  const seenTitle = new Set<string>();
  const perTopic: Record<string, number> = {};
  const fresh: Article[] = [];
  const stale: Article[] = [];

  for (const a of pool) {
    if (!a?.id || exclude.has(a.id)) continue;
    const key = normTitle(a.title ?? '');
    if (!key || seenTitle.has(key)) continue;
    seenTitle.add(key);
    (now - ts(a.publishedAt) <= FRESH_WINDOW_MS ? fresh : stale).push(a);
  }

  const out: EditionItem[] = [];
  // Global topic cap. diversify() already prevents more than 2 of a topic in
  // any window of 5, but that is a *local* rule — on a heavy news day it still
  // permits nine Politics stories out of eighteen.
  const take = (list: Article[]) => {
    for (const a of list) {
      if (out.length >= TARGET) return;
      const t = a.topic ?? 'Explained';
      if ((perTopic[t] ?? 0) >= MAX_PER_TOPIC) continue;
      perTopic[t] = (perTopic[t] ?? 0) + 1;
      out.push({ id: a.id, topic: t, publishedAt: a.publishedAt });
    }
  };

  take(fresh);
  // Relax the freshness gate rather than ship a thin edition on a quiet day.
  if (out.length < MIN) take(stale);
  return out;
}

/** Builds today's edition if there isn't one, or if the local day has rolled. */
export async function ensureEdition(now: number = Date.now()): Promise<Edition | null> {
  if (!hydrated) await hydrateEdition();
  const today = dayKey(now);

  // Rebuild only when the day has moved FORWARD. A backwards jump — the user
  // flew west, or set the clock back — must keep the existing edition, or they
  // get two editions in one day and lose the progress they already made.
  if (edition && edition.day >= today) return edition;
  if (building) return building;

  status = 'building';
  emit();

  building = (async () => {
    try {
      const pool = await fetchForYou(60);
      const already = new Set(progressSnapshot().recent[today]?.readIds ?? []);
      const items = selectEdition(pool, now, already);

      // Never persist an empty edition. Pinning zero items would lock the user
      // into an empty day until midnight — the worst failure mode here — so an
      // empty result stays in `error` and retries on next foreground.
      if (!items.length) {
        status = 'error';
        emit();
        return null;
      }

      edition = { version: 1, day: today, builtAt: now, items, size: items.length, celebratedAt: null };
      status = 'ready';
      persist();
      emit();
      return edition;
    } catch {
      status = 'error';
      emit();
      return null;
    } finally {
      building = null;
    }
  })();

  return building;
}

export function markCelebrated(at: number = Date.now()): void {
  if (!edition || edition.celebratedAt) return;
  edition = { ...edition, celebratedAt: at };
  persist();
  emit();
}

export const editionSnapshot = (): Edition | null => edition;
export const editionStatus = (): EditionStatus => status;

export function useEdition(): { edition: Edition | null; status: EditionStatus } {
  const e = useSyncExternalStore(subscribe, editionSnapshot, editionSnapshot);
  const s = useSyncExternalStore(subscribe, editionStatus, editionStatus);
  return { edition: e, status: s };
}

export type EditionProgress = {
  read: number;
  total: number;
  complete: boolean;
  celebrated: boolean;
  remaining: string[];
};

/** Reads come from lib/progress (dwell-qualified), intersected with the pinned
    id list — so skimming stories outside the edition doesn't advance it. */
export function editionProgressOf(e: Edition | null, readIds: readonly string[]): EditionProgress {
  if (!e) return { read: 0, total: 0, complete: false, celebrated: false, remaining: [] };
  const done = new Set(readIds);
  const ids = e.items.map((i) => i.id);
  const remaining = ids.filter((id) => !done.has(id));
  const read = ids.length - remaining.length;
  return {
    read,
    total: e.size,
    complete: e.size > 0 && read >= e.size,
    celebrated: e.celebratedAt != null,
    remaining,
  };
}

export function useEditionProgress(): EditionProgress {
  const e = useSyncExternalStore(subscribe, editionSnapshot, editionSnapshot);
  const p = useSyncExternalStore(subscribeProgress, progressSnapshot, progressSnapshot);
  return editionProgressOf(e, p.recent[dayKey()]?.readIds ?? []);
}
