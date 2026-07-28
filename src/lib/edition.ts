import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dayKey, type DayKey } from './day';
import { normTitle, type Article } from './content';
import { UNCLASSIFIED } from './categories';
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

/* v2, because v1 editions hold pipeline ids.
 *
 * The edition pins an id list for the day and re-fetches the bodies by id, so
 * a correction still lands but the set cannot move. That pinning outlived the
 * cut to the CMS: an edition built before it was drawn from the whole scraped
 * corpus, and re-fetching those ids by id works perfectly — which is exactly
 * the problem. Today's edition would keep serving unapproved stories until
 * midnight, on a device whose feed had otherwise been cleaned.
 *
 * The version bump discards them. hydrateEdition also drops any pinned id the
 * live set no longer contains, so an editor unapproving a story mid-day
 * removes it from the edition too rather than leaving a card that opens
 * something no longer published. */
const KEY = 'dailymattr.edition.v2';

const TARGET = 18;
const MIN = 12;
const FRESH_WINDOW_MS = 36 * 3_600_000;
const MAX_PER_TOPIC = 4;

export type EditionItem = { id: string; topic: string; publishedAt: string };

export type Edition = {
  version: 2;
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
      if (parsed?.version === 2 && Array.isArray(parsed.items)) {
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
      const t = a.topic || UNCLASSIFIED;
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
      const pool = await fetchForYou();
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

      edition = { version: 2, day: today, builtAt: now, items, size: items.length, celebratedAt: null };
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

/* Drop pinned stories the desk has since taken down.
 *
 * The edition is frozen on purpose — that is what makes "12 of 18" mean
 * anything — but frozen against a *reshuffling ranker*, not against an editor.
 * If someone unapproves a story at noon, the pinned id keeps resolving and the
 * edition goes on offering a card that opens something no longer published.
 *
 * Removing rather than replacing, and `size` shrinks with the list. It must:
 * progress is counted as reads against `size`, so keeping the old total after
 * dropping a story would leave an edition that can never be finished — "17 of
 * 18 read" with nothing left to read being the caught-up moment that never
 * fires.
 */
export function pruneEdition(liveIds: Set<string>): void {
  if (!edition || !liveIds.size) return;
  const kept = edition.items.filter((i) => liveIds.has(i.id));
  if (kept.length === edition.items.length) return;
  // never prune to nothing — an empty edition locks the reader out until
  // midnight, and a stale card is the lesser failure
  if (!kept.length) return;
  edition = { ...edition, items: kept, size: kept.length };
  persist();
  emit();
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
