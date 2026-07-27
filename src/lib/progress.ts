import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDays, dayKey, lastNDays, type DayKey } from './day';
import { computeStreak as runStreak, STREAK_MIN_READS } from './streak';

export { STREAK_MIN_READS };

/* Per-day reading record, streak, and freezes.

   Kept deliberately separate from lib/store.tsx. That store's `history` is
   capped at 200 entries and deduped by article id, which makes it unusable as
   a streak substrate for two independent reasons: a heavy reader's older days
   fall off the end of the array (so a long streak becomes uncomputable and
   silently resets), and re-reading an old article moves its timestamp to now
   (so it can fabricate a day that never happened). This module stores one
   small record per *day* instead, so neither failure applies. */

const KEY = 'dailymattr.progress.v1';

const RECENT_DAYS = 14; // full fidelity; older days are compacted
const MAX_DAYS = 400;
const WRITE_DEBOUNCE_MS = 800;
const MAX_IDS_PER_DAY = 200;

export type DayRecord = {
  day: DayKey;
  readIds: string[];
  topics: Record<string, number>;
  /** summed foreground dwell, so "about N min" is measured rather than guessed */
  dwellMs: number;
  firstReadAt: number;
  lastReadAt: number;
  quizTakenAt: number | null;
};

export type DaySummary = { day: DayKey; count: number; quizTakenAt: number | null };

export type StreakState = {
  current: number;
  longest: number;
  lastQualifiedDay: DayKey | null;
  freezesUsedOn: DayKey[];
  /** days migrated from the old history array; they qualify at ≥1 read */
  seededDays: DayKey[];
};

export type ProgressState = {
  version: 1;
  recent: Record<DayKey, DayRecord>;
  summary: Record<DayKey, DaySummary>;
  streak: StreakState;
};

const empty = (): ProgressState => ({
  version: 1,
  recent: {},
  summary: {},
  streak: { current: 0, longest: 0, lastQualifiedDay: null, freezesUsedOn: [], seededDays: [] },
});

let state: ProgressState = empty();
let hydrated = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/* ---------- streak ---------- */

/** Bridges the stored shape into the pure calculator in lib/streak.ts. */
function recompute(s: ProgressState, today: DayKey): StreakState {
  const counts: Record<DayKey, number> = {};
  for (const [k, r] of Object.entries(s.recent)) counts[k] = r.readIds.length;
  for (const [k, r] of Object.entries(s.summary)) counts[k] = Math.max(counts[k] ?? 0, r.count);

  const r = runStreak({ counts, seededDays: s.streak.seededDays }, today);
  return {
    current: r.current,
    longest: Math.max(s.streak.longest, r.current),
    lastQualifiedDay: r.lastQualifiedDay,
    freezesUsedOn: r.freezesUsedOn,
    seededDays: s.streak.seededDays,
  };
}

/* ---------- persistence ---------- */

let writeTimer: ReturnType<typeof setTimeout> | null = null;

function persist(): void {
  if (!hydrated) return;
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(flush, WRITE_DEBOUNCE_MS);
}

export function flush(): void {
  if (!hydrated) return;
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
}

AppState.addEventListener('change', (s) => {
  if (s !== 'active') flush();
});

function compact(s: ProgressState, today: DayKey): ProgressState {
  const keepFull = new Set(lastNDays(RECENT_DAYS, Date.now()));
  const recent: Record<DayKey, DayRecord> = {};
  const summary: Record<DayKey, DaySummary> = { ...s.summary };

  for (const [k, r] of Object.entries(s.recent)) {
    if (keepFull.has(k)) recent[k] = r;
    else summary[k] = { day: k, count: r.readIds.length, quizTakenAt: r.quizTakenAt };
  }

  const cutoff = addDays(today, -MAX_DAYS);
  for (const k of Object.keys(summary)) if (k < cutoff) delete summary[k];

  return { ...s, recent, summary };
}

/* Coerces whatever came out of storage into a usable shape.

   Anything persisted by an older build, half-written during a crash, or
   corrupted, must not be able to throw — this runs during boot, and a throw
   here becomes an unhandled rejection that takes the whole app down rather
   than just costing the user their streak. Every field is checked rather than
   trusted. */
function sanitise(raw: unknown): ProgressState {
  const s = raw as Partial<ProgressState> | null;
  if (!s || typeof s !== 'object' || s.version !== 1) return empty();
  const base = empty();

  const recent: Record<DayKey, DayRecord> = {};
  const src = (s.recent && typeof s.recent === 'object' ? s.recent : {}) as Record<string, any>;
  for (const [k, r] of Object.entries(src)) {
    if (!r || typeof r !== 'object') continue;
    recent[k] = {
      day: typeof r.day === 'string' ? r.day : k,
      readIds: Array.isArray(r.readIds) ? r.readIds.filter((x: unknown) => typeof x === 'string') : [],
      topics: r.topics && typeof r.topics === 'object' ? r.topics : {},
      dwellMs: Number.isFinite(r.dwellMs) ? r.dwellMs : 0,
      firstReadAt: Number.isFinite(r.firstReadAt) ? r.firstReadAt : Date.now(),
      lastReadAt: Number.isFinite(r.lastReadAt) ? r.lastReadAt : Date.now(),
      quizTakenAt: Number.isFinite(r.quizTakenAt) ? r.quizTakenAt : null,
    };
  }

  const summary: Record<DayKey, DaySummary> = {};
  const ssrc = (s.summary && typeof s.summary === 'object' ? s.summary : {}) as Record<string, any>;
  for (const [k, r] of Object.entries(ssrc)) {
    if (!r || typeof r !== 'object') continue;
    summary[k] = {
      day: typeof r.day === 'string' ? r.day : k,
      count: Number.isFinite(r.count) ? r.count : 0,
      quizTakenAt: Number.isFinite(r.quizTakenAt) ? r.quizTakenAt : null,
    };
  }

  const st = s.streak && typeof s.streak === 'object' ? s.streak : base.streak;
  return {
    version: 1,
    recent,
    summary,
    streak: {
      current: Number.isFinite(st.current) ? st.current : 0,
      longest: Number.isFinite(st.longest) ? st.longest : 0,
      lastQualifiedDay: typeof st.lastQualifiedDay === 'string' ? st.lastQualifiedDay : null,
      freezesUsedOn: Array.isArray(st.freezesUsedOn) ? st.freezesUsedOn : [],
      seededDays: Array.isArray(st.seededDays) ? st.seededDays : [],
    },
  };
}

/** Idempotent; safe to await more than once. Cannot reject. */
export async function hydrate(seedFromHistory?: { at: number }[]): Promise<void> {
  if (hydrated) return;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      state = sanitise(JSON.parse(raw));
    } else if (seedFromHistory?.length) {
      // First run after upgrade. The old streak counted a day active on any
      // single read, so seed those days and let them qualify on presence.
      // Two losses are unavoidable and worth knowing about: history is capped
      // at 200 entries, so only the last week or two is recoverable; and it
      // dedupes by id with the entry moved to the front, so re-reading an old
      // article has already erased whichever day it was first read on.
      const days = new Set(seedFromHistory.map((h) => dayKey(h.at)));
      state.streak.seededDays = [...days].sort();
    }
  } catch {
    state = empty();
  }
  hydrated = true;
  // also guarded: compaction and the streak walk run over whatever survived
  // above, and neither is allowed to be the thing that breaks a cold start
  try {
    const today = dayKey();
    state = compact(state, today);
    state.streak = recompute(state, today);
  } catch {
    state = empty();
  }
  emit();
  persist();
}

export const isHydrated = (): boolean => hydrated;
export const snapshot = (): ProgressState => state;

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/* ---------- mutation ---------- */

type CaughtUpCb = (day: DayKey, count: number) => void;
const caughtUpCbs = new Set<CaughtUpCb>();
export function onDayQualified(cb: CaughtUpCb): () => void {
  caughtUpCbs.add(cb);
  return () => {
    caughtUpCbs.delete(cb);
  };
}

/** Records a *qualified* read — one the reader actually dwelled on. Silently
    drops before hydration: a write racing the initial read would persist an
    empty blob over a real streak, which is the worst outcome in this module. */
export function noteRead(
  id: string,
  topic: string,
  dwellMs = 0,
  at: number = Date.now(),
): void {
  if (!hydrated) return;

  const day = dayKey(at);
  const prev = state.recent[day];
  const rec: DayRecord = prev
    ? { ...prev, readIds: [...prev.readIds], topics: { ...prev.topics } }
    : { day, readIds: [], topics: {}, dwellMs: 0, firstReadAt: at, lastReadAt: at, quizTakenAt: null };

  if (rec.readIds.includes(id)) return; // re-read: already counted for this day
  rec.dwellMs = (rec.dwellMs ?? 0) + dwellMs;
  rec.readIds.push(id);
  if (rec.readIds.length > MAX_IDS_PER_DAY) rec.readIds.shift();
  rec.topics[topic] = (rec.topics[topic] ?? 0) + 1;
  rec.lastReadAt = at;

  const wasQualified = (prev?.readIds.length ?? 0) >= STREAK_MIN_READS;
  state = { ...state, recent: { ...state.recent, [day]: rec } };
  state.streak = recompute(state, dayKey(at));

  if (!wasQualified && rec.readIds.length >= STREAK_MIN_READS) {
    caughtUpCbs.forEach((cb) => cb(day, rec.readIds.length));
  }
  emit();
  persist();
}

export function markQuizTaken(at: number = Date.now()): void {
  if (!hydrated) return;
  const day = dayKey(at);
  const rec = state.recent[day];
  if (!rec || rec.quizTakenAt) return;
  state = { ...state, recent: { ...state.recent, [day]: { ...rec, quizTakenAt: at } } };
  emit();
  persist();
}

export async function clearAll(): Promise<void> {
  state = empty();
  hydrated = true;
  emit();
  await AsyncStorage.removeItem(KEY).catch(() => {});
}

/* ---------- selectors ---------- */

export function useProgress(): ProgressState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function useStreak(): {
  current: number;
  longest: number;
  atRisk: boolean;
  freezesUsed: number;
} {
  const s = useProgress();
  const today = dayKey();
  const todayCount = s.recent[today]?.readIds.length ?? 0;
  return {
    current: s.streak.current,
    longest: s.streak.longest,
    // today not yet counted, but yesterday did — one more session saves it
    atRisk: todayCount < STREAK_MIN_READS && s.streak.lastQualifiedDay === addDays(today, -1),
    freezesUsed: s.streak.freezesUsedOn.length,
  };
}

/** Read counts for the last 7 local days, oldest → newest. Replaces the
    UTC-bucketed computation that used to live in profile.tsx. */
export function weekCounts(s: ProgressState, at: number = Date.now()): number[] {
  return lastNDays(7, at).map(
    (k) => s.recent[k]?.readIds.length ?? s.summary[k]?.count ?? 0,
  );
}

export function totalDaysRead(s: ProgressState): number {
  return Object.keys(s.recent).length + Object.keys(s.summary).length;
}
