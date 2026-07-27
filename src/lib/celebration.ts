import { useSyncExternalStore } from 'react';

/* Signal for the caught-up overlay.

   Same module pub/sub shape as lib/onboardingKey.ts and lib/speech.ts. It has
   to live outside React because the moment is raised from the reader's
   onViewable — a callback FlatList captures once in a ref — and rendered by
   the root layout, which is the only mount point that can cover any tab. */

export type CelebrationPhase = 'caughtup' | 'quiz' | 'result';

export type Celebration = {
  storiesRead: number;
  editionSize: number;
  minutes: number;
  topTopic: string | null;
  streak: number;
  /** 'quiz' when opened from Profile — skips straight past the summary */
  startPhase: CelebrationPhase;
};

let current: Celebration | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function openCelebration(c: Celebration): void {
  current = c;
  emit();
}

export function closeCelebration(): void {
  if (!current) return;
  current = null;
  emit();
}

const snapshot = (): Celebration | null => current;

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useCelebration(): Celebration | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
