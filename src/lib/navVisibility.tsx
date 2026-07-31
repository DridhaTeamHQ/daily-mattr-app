import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  useAnimatedScrollHandler,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { spring } from '@/theme';
import { useMotionAllowed } from './motion';

/* Navbar visibility.
 *
 * Held as a shared value rather than React state. It used to be useState, and
 * two things went wrong: the navbar built its spring *inside* useAnimatedStyle,
 * so every re-render restarted it from wherever it had got to; and every
 * hide()/show() re-rendered the provider's subtree mid-scroll, which is what
 * caused those re-renders. Assigning the spring to the value is the documented
 * pattern and it interpolates from the current position instead of snapping.
 *
 * What the context carries is shared values, never worklets. A worklet reached
 * through a Context value has to be serialised across the thread boundary, and
 * that is what once booted on web and died in Expo Go. The scroll logic below
 * gets onto the UI thread by being *created in the component that uses it*
 * (see `useNavScrollHandler`), not by being passed through a provider.
 */

type NavActions = {
  show: () => void;
  hide: () => void;
  toggle: () => void;
};

type NavRefs = {
  /** 1 = shown, 0 = hidden. Interpolated, so mid-flight most of the time. */
  visible: SharedValue<number>;
  /** Where the spring is *heading* — `visible` can't answer "already going
   *  there?" while it is animating, and without that check a scroll that fires
   *  hide() every frame restarts the spring every frame. */
  target: SharedValue<number>;
};

const RefsCtx = createContext<NavRefs | null>(null);
const ActionsCtx = createContext<NavActions>({
  show: () => {},
  hide: () => {},
  toggle: () => {},
});

export function NavVisibilityProvider({ children }: { children: React.ReactNode }) {
  const visible = useSharedValue(1);
  const target = useSharedValue(1);

  const refs = useMemo<NavRefs>(() => ({ visible, target }), [visible, target]);

  /* Plain JS functions, for taps — a card tap, an overlay opening. Not for
     scrolling; that path never leaves the UI thread. */
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
      <RefsCtx.Provider value={refs}>{children}</RefsCtx.Provider>
    </ActionsCtx.Provider>
  );
}

function useNavRefs(): NavRefs {
  const v = useContext(RefsCtx);
  if (!v) throw new Error('nav visibility used outside <NavVisibilityProvider>');
  return v;
}

/** navbar only — the animated 0..1 progress */
export const useNavVisible = (): SharedValue<number> => useNavRefs().visible;

/** screens and cards: show/hide/toggle from the JS thread, stable identity */
export const useNavVisibility = () => useContext(ActionsCtx);

/* How far the reader has to travel before the bar reacts.
 *
 * Accumulated distance, not a per-event delta. The old rule compared one
 * frame's `dy` against 14pt, which made hiding velocity-dependent — a flick
 * crossed it, a slow drag never did — and, worse, let a decelerating fling
 * flap either side of the threshold, restarting the spring each time. That
 * flapping is what read as jitter. Asymmetric on purpose: getting the bar back
 * should be easier than losing it. */
const HIDE_AFTER = 56;
const SHOW_AFTER = 32;
/** Near the top the bar is always shown, whatever the travel says. */
const TOP_ZONE = 60;

/**
 * The scroll handler that drives the navbar, and the only thing that should.
 *
 * Runs entirely on the UI thread — no runOnJS on the scroll path at all. Pass a
 * shared value as `mirror` to receive the raw offset for other effects (Home's
 * header, the reader's page shell) rather than attaching a second handler.
 *
 * Also resets on focus. Tab screens stay mounted (`freezeOnBlur`), and nothing
 * used to re-sync visibility when you came back — so hiding the bar in the
 * reader and switching to Home left it hidden, translated 150pt away and
 * untappable, until some scroll happened to cross a threshold.
 */
export function useNavScrollHandler(mirror?: SharedValue<number>) {
  const { visible, target } = useNavRefs();
  const motion = useMotionAllowed();

  const lastY = useSharedValue(0);
  const travel = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
      lastY.value = 0;
      travel.value = 0;
      target.value = 1;
      visible.value = motion ? withSpring(1, spring.gentle) : 1;
    }, [visible, target, lastY, travel, motion]),
  );

  return useAnimatedScrollHandler(
    (e) => {
      const y = e.contentOffset.y;
      if (mirror) mirror.value = y;

      const dy = y - lastY.value;
      lastY.value = y;

      const settle = (next: number) => {
        if (target.value === next) return;
        target.value = next;
        // Reduce Motion applies here too: the bar used to spring 150pt
        // regardless of the reader's setting.
        visible.value = motion ? withSpring(next, spring.gentle) : next;
      };

      if (y < TOP_ZONE) {
        travel.value = 0;
        settle(1);
        return;
      }

      // A change of direction starts the count again, so travel always means
      // "distance in the current direction" rather than a running total that
      // never resets.
      if (dy > 0 !== travel.value > 0) travel.value = 0;
      travel.value += dy;

      if (travel.value > HIDE_AFTER) {
        settle(0);
        travel.value = 0;
      } else if (travel.value < -SHOW_AFTER) {
        settle(1);
        travel.value = 0;
      }
    },
    [mirror, motion],
  );
}
