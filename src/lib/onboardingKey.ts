export const ONBOARDED_KEY = 'dailymattr.onboarded.v1';

// In-memory mirror of the onboarded flag so the root layout's redirect gate
// updates the instant onboarding completes (AsyncStorage alone is only read
// once at mount, which caused a redirect loop back to the splash).
type Listener = (v: boolean) => void;
let value: boolean | null = null;
const listeners = new Set<Listener>();

export function setOnboardedFlag(v: boolean): void {
  value = v;
  listeners.forEach((l) => l(v));
}

export function getOnboardedFlag(): boolean | null {
  return value;
}

export function subscribeOnboarded(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
