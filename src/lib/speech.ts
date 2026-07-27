import { useSyncExternalStore } from 'react';
import * as Speech from 'expo-speech';

/* One utterance at a time, owned here rather than by whichever screen started
   it. Speech.stop() is global — it kills whatever is playing anywhere — so
   local `speaking` state in two components drifts apart the moment a second
   one starts: the first keeps rendering a Stop button for audio that is no
   longer playing. A single owner means the card that lost the floor finds out.

   Word timing comes from real boundary events, not an estimate. expo-speech
   forwards Android's UtteranceProgressListener.onRangeStart and iOS's
   willSpeakRangeOfSpeechString as { charIndex, charLength }, so the highlight
   tracks the synthesiser instead of guessing from word length. Engines that
   don't report ranges (pre-API-26 Android, or a TTS engine that skips it)
   simply never fire it — the audio still plays, the highlight just never
   advances, which is why nothing else depends on it arriving. */

type Snapshot = {
  id: string | null; // article whose audio is playing
  charIndex: number; // start of the word being spoken, within the spoken text
  charLength: number;
};

let snap: Snapshot = { id: null, charIndex: 0, charLength: 0 };
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function clear(id: string) {
  // a newer utterance already took the floor — leave its state alone
  if (snap.id !== id) return;
  snap = { id: null, charIndex: 0, charLength: 0 };
  emit();
}

export function speak(id: string, text: string): void {
  Speech.stop();
  snap = { id, charIndex: 0, charLength: 0 };
  emit();
  Speech.speak(text, {
    rate: 0.98,
    onBoundary: (ev: any) => {
      if (snap.id !== id) return;
      snap = { id, charIndex: ev?.charIndex ?? 0, charLength: ev?.charLength ?? 0 };
      emit();
    },
    onDone: () => clear(id),
    onStopped: () => clear(id),
    onError: () => clear(id),
  });
}

/** non-reactive read, for unmount cleanup where a hook is not available */
export const speakingId = (): string | null => snap.id;

export function stop(): void {
  Speech.stop();
  if (snap.id === null) return;
  snap = { id: null, charIndex: 0, charLength: 0 };
  emit();
}

export function toggleSpeech(id: string, text: string): void {
  if (snap.id === id) stop();
  else speak(id, text);
}

/* Hooks return primitives so a component only re-renders when the thing it
   actually reads changes: the Listen button re-renders twice per playback,
   while the text that repaints per word is a leaf of its own. */

export function useIsSpeaking(id: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => snap.id === id,
    () => false,
  );
}

// -1 when this article is not the one playing
export function useSpokenStart(id: string): number {
  return useSyncExternalStore(
    subscribe,
    () => (snap.id === id ? snap.charIndex : -1),
    () => -1,
  );
}

export function useSpokenLength(id: string): number {
  return useSyncExternalStore(
    subscribe,
    () => (snap.id === id ? snap.charLength : 0),
    () => 0,
  );
}
