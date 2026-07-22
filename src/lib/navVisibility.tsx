import React, { createContext, useContext, useMemo, useState } from 'react';

// Global navbar visibility, split into two contexts so screens that only
// TRIGGER hide/show (on scroll) never re-render when visibility changes —
// only the navbar itself subscribes to the state.
type NavActions = {
  show: () => void;
  hide: () => void;
  toggle: () => void;
};

const StateCtx = createContext<boolean>(true);
const ActionsCtx = createContext<NavActions>({ show: () => {}, hide: () => {}, toggle: () => {} });

export function NavVisibilityProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(true);
  // stable identity forever — consumers of actions never re-render
  const actions = useMemo<NavActions>(
    () => ({
      show: () => setVisible(true),
      hide: () => setVisible(false),
      toggle: () => setVisible((v) => !v),
    }),
    [],
  );
  return (
    <ActionsCtx.Provider value={actions}>
      <StateCtx.Provider value={visible}>{children}</StateCtx.Provider>
    </ActionsCtx.Provider>
  );
}

// navbar only
export const useNavVisible = () => useContext(StateCtx);

// screens: stable, re-render-free
export const useNavVisibility = () => useContext(ActionsCtx);
