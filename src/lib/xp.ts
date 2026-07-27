import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/* Points, levels and per-topic accuracy.

   Same discipline as lib/progress.ts — own key, sanitised on read, debounced
   write — because the same failure mode applies: this runs at boot and a
   malformed blob must degrade to zero rather than take the app down.

   Deliberately its own store rather than a field on progress: XP changes once
   per quiz, progress changes on every qualified read, and putting them in one
   blob would mean re-serialising quiz history on every card swipe. */

const KEY = 'dailymattr.xp.v1';
const WRITE_DEBOUNCE_MS = 800;

export const XP_PER_CORRECT = 10;
export const XP_PERFECT_BONUS = 25;
/** each level costs a bit more than the last */
const LEVEL_STEP = 120;

export type TopicStat = { asked: number; correct: number };

export type XpState = {
  version: 1;
  xp: number;
  lifetimeCorrect: number;
  lifetimeAsked: number;
  bestCombo: number;
  topics: Record<string, TopicStat>;
};

const empty = (): XpState => ({
  version: 1,
  xp: 0,
  lifetimeCorrect: 0,
  lifetimeAsked: 0,
  bestCombo: 0,
  topics: {},
});

let state: XpState = empty();
let hydrated = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

const num = (v: unknown, d = 0) => (Number.isFinite(v as number) ? (v as number) : d);

function sanitise(raw: unknown): XpState {
  const s = raw as Partial<XpState> | null;
  if (!s || typeof s !== 'object' || s.version !== 1) return empty();
  const topics: Record<string, TopicStat> = {};
  const src = (s.topics && typeof s.topics === 'object' ? s.topics : {}) as Record<string, any>;
  for (const [k, t] of Object.entries(src)) {
    if (!t || typeof t !== 'object') continue;
    topics[k] = { asked: num(t.asked), correct: num(t.correct) };
  }
  return {
    version: 1,
    xp: num(s.xp),
    lifetimeCorrect: num(s.lifetimeCorrect),
    lifetimeAsked: num(s.lifetimeAsked),
    bestCombo: num(s.bestCombo),
    topics,
  };
}

let writeTimer: ReturnType<typeof setTimeout> | null = null;
function persist() {
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

/** Idempotent; cannot reject. */
export async function hydrate(): Promise<void> {
  if (hydrated) return;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    state = raw ? sanitise(JSON.parse(raw)) : empty();
  } catch {
    state = empty();
  }
  hydrated = true;
  emit();
}

/* Level curve: each level costs LEVEL_STEP more than the one before, so early
   levels arrive quickly and later ones mean something. Total XP to reach level
   n is LEVEL_STEP * n(n+1)/2. */
export function levelOf(xp: number): { level: number; into: number; span: number } {
  let level = 1;
  let spent = 0;
  for (;;) {
    const span = LEVEL_STEP * level;
    if (xp - spent < span) return { level, into: xp - spent, span };
    spent += span;
    level++;
  }
}

export type QuizOutcome = {
  correct: number;
  total: number;
  bestCombo: number;
  perTopic: { topic: string; correct: boolean }[];
};

/** Returns the XP awarded, so the UI can count it up. */
export function recordQuiz(o: QuizOutcome): number {
  if (!hydrated) return 0;
  const gained = o.correct * XP_PER_CORRECT + (o.correct === o.total && o.total > 0 ? XP_PERFECT_BONUS : 0);
  const topics = { ...state.topics };
  for (const r of o.perTopic) {
    const t = topics[r.topic] ?? { asked: 0, correct: 0 };
    topics[r.topic] = { asked: t.asked + 1, correct: t.correct + (r.correct ? 1 : 0) };
  }
  state = {
    ...state,
    xp: state.xp + gained,
    lifetimeCorrect: state.lifetimeCorrect + o.correct,
    lifetimeAsked: state.lifetimeAsked + o.total,
    bestCombo: Math.max(state.bestCombo, o.bestCombo),
    topics,
  };
  emit();
  persist();
  return gained;
}

export async function clearAll(): Promise<void> {
  state = empty();
  hydrated = true;
  emit();
  await AsyncStorage.removeItem(KEY).catch(() => {});
}

const snapshot = () => state;
export function useXp(): XpState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Topics sorted worst-first — the ones worth reading more of. */
export function weakestTopics(s: XpState, min = 3): { topic: string; pct: number; asked: number }[] {
  return Object.entries(s.topics)
    .filter(([, t]) => t.asked >= min)
    .map(([topic, t]) => ({ topic, pct: t.correct / t.asked, asked: t.asked }))
    .sort((a, b) => a.pct - b.pct);
}
