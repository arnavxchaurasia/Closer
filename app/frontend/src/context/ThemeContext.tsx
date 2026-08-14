import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { TextStyle } from 'react-native';

import { Colors, darkColors, lightColors, makeTypography } from '@/src/theme';

type ThemeMode = 'dark' | 'light';

type ThemeContextType = {
  mode: ThemeMode;
  colors: Colors;
  typography: Record<string, TextStyle>;
  isDark: boolean;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType>({
  mode: 'light',
  colors: lightColors,
  typography: makeTypography(lightColors),
  isDark: false,
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('light');

  useEffect(() => {
    AsyncStorage.getItem('@soulsync/theme').then(v => {
      if (v === 'light' || v === 'dark') setMode(v);
    }).catch(() => {});
  }, []);

  const toggleTheme = () => {
    setMode(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      AsyncStorage.setItem('@soulsync/theme', next).catch(() => {});
      return next;
    });
  };

  const colors = mode === 'dark' ? darkColors : lightColors;
  const typography = useMemo(() => makeTypography(colors), [colors]);

  return (
    <ThemeContext.Provider value={{ mode, colors, typography, isDark: mode === 'dark', toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
