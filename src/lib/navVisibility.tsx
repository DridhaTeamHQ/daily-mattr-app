import React, { createContext, useContext, useMemo, useState } from 'react';

// Global navbar visibility: screens hide it while reading/scrolling and a
// tap brings it back — freeing the bottom of the screen for content.
type NavVis = {
  visible: boolean;
  show: () => void;
  hide: () => void;
  toggle: () => void;
};

const Ctx = createContext<NavVis>({ visible: true, show: () => {}, hide: () => {}, toggle: () => {} });

export function NavVisibilityProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(true);
  const value = useMemo<NavVis>(
    () => ({
      visible,
      show: () => setVisible(true),
      hide: () => setVisible(false),
      toggle: () => setVisible((v) => !v),
    }),
    [visible],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useNavVisibility = () => useContext(Ctx);
