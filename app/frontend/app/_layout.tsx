import React, { useEffect } from 'react';
import { ClerkProvider } from '@clerk/clerk-expo';
import { Stack, router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as SplashScreen from 'expo-splash-screen';
import { LogBox, Platform } from 'react-native';

import { LaunchScreen } from '@/src/components/LaunchScreen';
import { AuthProvider, useAuth } from '@/src/context/AuthContext';
import { CoupleProvider } from '@/src/context/CoupleContext';
import { ThemeProvider } from '@/src/context/ThemeContext';
import { useIconFonts } from '@/src/hooks/use-icon-fonts';
import { registerForPushNotifications, scheduleDailyCheckIn } from '@/src/notifications';

LogBox.ignoreAllLogs(true);

SplashScreen.preventAutoHideAsync();

const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? 'pk_test_demo';

const tokenCache = {
  async getToken(key: string) {
    try { return await SecureStore.getItemAsync(key); } catch { return null; }
  },
  async saveToken(key: string, value: string) {
    try { await SecureStore.setItemAsync(key, value); } catch {}
  },
  async clearToken(key: string) {
    try { await SecureStore.deleteItemAsync(key); } catch {}
  },
};

function RootNavigator() {
  const { user, isLoading } = useAuth();
  const [fontsLoaded, fontsError] = useIconFonts();

  const ready = (fontsLoaded || fontsError) && !isLoading;

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
      registerForPushNotifications().then(token => {
        if (token) scheduleDailyCheckIn().catch(() => {});
      }).catch(() => {});
    }
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace('/(auth)');
    else router.replace('/(app)');
  }, [ready, user]);

  if (!ready) return <LaunchScreen />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: Platform.OS === 'ios' ? 'default' : 'fade',
        gestureEnabled: true,
      }}
    />
  );
}

export default function RootLayout() {
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
      <ThemeProvider>
        <AuthProvider>
          <CoupleProvider>
            <RootNavigator />
          </CoupleProvider>
        </AuthProvider>
      </ThemeProvider>
    </ClerkProvider>
  );
}
