import React, { createContext, useContext, useMemo } from 'react';
import { useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import { spring } from '@/theme';

// Navbar visibility is a shared value, not React state.
//
// It used to be useState. Two things went wrong with that:
//
//   1. The navbar drove its transform with withSpring() *inside*
//      useAnimatedStyle. Reanimated only animates when the animation is
//      assigned to a shared value — inside a style callback the spring is
//      rebuilt from scratch on every re-render, so it restarted from wherever
//      it had got to. That is the stutter.
//   2. Every hide()/show() was a setState, so each one re-rendered the
//      provider's whole subtree mid-scroll — and re-rendering is exactly what
//      restarted the spring in (1).
//
// Now the scroll handler writes to the shared value straight from the UI
// thread, nothing re-renders, and the spring is assigned to the value (the
// documented pattern) so it interpolates from its current position instead of
// snapping back.
type NavActions = {
  show: () => void;
  hide: () => void;
  toggle: () => void;
};

const StateCtx = createContext<SharedValue<number> | null>(null);
const ActionsCtx = createContext<NavActions>({ show: () => {}, hide: () => {}, toggle: () => {} });

export function NavVisibilityProvider({ children }: { children: React.ReactNode }) {
  // 1 = shown, 0 = hidden. Interpolated, so it is mid-flight most of the time.
  const visible = useSharedValue(1);
  // Where the spring is *heading*. Kept separate because `visible` is mid-flight
  // during the animation, so it can't answer "are we already going there?" —
  // and without that check a scroll that fires hide() on every frame restarts
  // the spring on every frame.
  const target = useSharedValue(1);

  /* Plain JS functions, deliberately NOT worklets.

     They were worklets so a scroll handler could call them without a runOnJS
     hop. That works on web — Reanimated runs everything on the JS thread there
     — but on device the handler runs on the UI thread and Reanimated has to
     serialise this object, with its worklet members, across the thread
     boundary. A worklet reached through a React Context value is the fragile
     case, and it is why the app booted on web and died in Expo Go.

     Callers on the UI thread now wrap these in runOnJS. That costs one hop per
     visibility *change* — not per frame, because of the target check below —
     which is nothing, and it is the mechanism the app used before. The part
     that actually fixed the stutter was moving visibility off React state and
     onto a shared value; that is untouched. */
  const actions = useMemo<NavActions>(
    () => ({
      show: () => {
        if (target.value === 1) return;
        target.value = 1;
        visible.value = withSpring(1, spring.gentle);
      },
      hide: () => {
        if (target.value === 0) return;
        target.value = 0;
        visible.value = withSpring(0, spring.gentle);
      },
      toggle: () => {
        const next = target.value === 1 ? 0 : 1;
        target.value = next;
        visible.value = withSpring(next, spring.gentle);
      },
    }),
    [visible, target],
  );

  return (
    <ActionsCtx.Provider value={actions}>
      <StateCtx.Provider value={visible}>{children}</StateCtx.Provider>
    </ActionsCtx.Provider>
  );
}

// navbar only — the animated 0..1 progress
export const useNavVisible = (): SharedValue<number> => {
  const v = useContext(StateCtx);
  if (!v) throw new Error('useNavVisible must be used inside <NavVisibilityProvider>');
  return v;
};

// screens: stable identity, and every action is a worklet so it can be called
// directly from a scroll handler without a runOnJS hop
export const useNavVisibility = () => useContext(ActionsCtx);
