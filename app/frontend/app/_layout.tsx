import React, { useEffect, Component } from 'react';
import { ClerkProvider, ClerkLoaded } from '@clerk/clerk-expo';
import { Stack, router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as SplashScreen from 'expo-splash-screen';
import { Alert, Platform, Pressable, Text, View } from 'react-native';

import { LaunchScreen } from '@/src/components/LaunchScreen';
import { Sonner, sonner } from '@/src/components/Sonner';
import { AuthProvider, useAuth } from '@/src/context/AuthContext';
import { CoupleProvider } from '@/src/context/CoupleContext';
import { ThemeProvider } from '@/src/context/ThemeContext';
import { useIconFonts } from '@/src/hooks/use-icon-fonts';
import { registerForPushNotifications, scheduleDailyCheckIn } from '@/src/notifications';

SplashScreen.preventAutoHideAsync();

// Keep native confirmation dialogs (which require a decision), but replace
// informational alerts everywhere with unobtrusive Sonner-style notifications.
const nativeAlert = Alert.alert.bind(Alert);
Alert.alert = ((...args: Parameters<typeof Alert.alert>) => {
  const [title, message, buttons] = args;
  if (!buttons) {
    const text = typeof message === 'string' ? message : undefined;
    const kind = /error|failed|invalid|could not|permission|offline/i.test(`${title} ${text ?? ''}`) ? 'error' : 'info';
    sonner.show(title, text, kind);
    return;
  }
  nativeAlert(...args);
}) as typeof Alert.alert;

const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';

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

// Error boundary to prevent white-screen crashes
class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  reset = () => this.setState({ hasError: false, error: '' });
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F0818', padding: 24 }}>
          <Text style={{ color: '#E8607A', fontSize: 20, fontWeight: '800', marginBottom: 12 }}>Something went wrong</Text>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, textAlign: 'center' }}>{this.state.error}</Text>
          <Pressable onPress={this.reset} style={{ marginTop: 24, backgroundColor: '#E8607A', borderRadius: 14, paddingHorizontal: 22, paddingVertical: 13 }}>
            <Text style={{ color: '#fff', fontWeight: '800' }}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

function RootNavigator() {
  const { user, isLoading } = useAuth();
  const [fontsLoaded, fontsError] = useIconFonts();

  const ready = (fontsLoaded || fontsError) && !isLoading;
  const fontsReady = fontsLoaded || !!fontsError;

  // LaunchScreen always plays for at least MIN_LAUNCH_MS so animations complete
  const MIN_LAUNCH_MS = 2800;
  const launchStart = React.useRef(Date.now());

  const [showLaunch, setShowLaunch] = React.useState(true);
  const [exiting, setExiting] = React.useState(false);

  // Hide native splash as soon as fonts load — don't wait for auth
  useEffect(() => {
    if (fontsReady) SplashScreen.hideAsync();
  }, [fontsReady]);

  useEffect(() => {
    if (!ready) return;
    registerForPushNotifications().then(token => {
      if (token) scheduleDailyCheckIn().catch(() => {});
    }).catch(() => {});

    // Wait for minimum display time before starting exit animation
    const elapsed = Date.now() - launchStart.current;
    const delay = Math.max(0, MIN_LAUNCH_MS - elapsed);
    const t1 = setTimeout(() => setExiting(true), delay);
    // Unmount after exit animation (800ms) completes
    const t2 = setTimeout(() => setShowLaunch(false), delay + 900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [ready]);

  const initialRedirectDone = React.useRef(false);

  useEffect(() => {
    if (!ready) return;
    if (!initialRedirectDone.current) {
      initialRedirectDone.current = true;
      const timer = setTimeout(() => {
        try {
          if (!user) router.replace('/onboarding');
          else router.replace('/(app)');
        } catch {}
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [ready, user]);

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: Platform.OS === 'ios' ? 'default' : 'fade',
          gestureEnabled: true,
        }}
      />
      {showLaunch && <LaunchScreen exiting={exiting} />}
    </>
  );
}

export default function RootLayout() {
  const content = (
    <ThemeProvider>
      <AuthProvider>
        <CoupleProvider>
          <View style={{ flex: 1 }}>
            <RootNavigator />
            <Sonner />
          </View>
        </CoupleProvider>
      </AuthProvider>
    </ThemeProvider>
  );

  return (
    <ErrorBoundary>
      {CLERK_PUBLISHABLE_KEY ? (
        <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
          <ClerkLoaded>{content}</ClerkLoaded>
        </ClerkProvider>
      ) : (
        content
      )}
    </ErrorBoundary>
  );
}
