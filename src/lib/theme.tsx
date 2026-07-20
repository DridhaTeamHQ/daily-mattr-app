import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { light, darkPalette, type Palette } from '@/theme';

// App-wide theme. Dark is the default — gradient canvas + glass surfaces.
type ThemeCtx = {
  c: Palette;
  isDark: boolean;
  toggle: () => void;
};

const Ctx = createContext<ThemeCtx>({ c: darkPalette, isDark: true, toggle: () => {} });
const KEY = 'dailymattr.theme.v1';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => {
      if (v === 'light') setIsDark(false);
    });
  }, []);

  const value = useMemo<ThemeCtx>(
    () => ({
      c: isDark ? darkPalette : light,
      isDark,
      toggle: () => {
        setIsDark((d) => {
          AsyncStorage.setItem(KEY, d ? 'light' : 'dark');
          return !d;
        });
      },
    }),
    [isDark],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  return useContext(Ctx);
}

// Glass card style helper — translucent + hairline in dark, white + clean in light.
export function glassCard(c: Palette, isDark: boolean) {
  return isDark
    ? { backgroundColor: c.glass, borderWidth: 1, borderColor: c.glassBorder }
    : { backgroundColor: c.card };
}
