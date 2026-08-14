import AsyncStorage from '@react-native-async-storage/async-storage';
import { Tabs, router } from 'expo-router';
import { useEffect } from 'react';
import { Platform, Text, View } from 'react-native';

import { Drawer } from '@/src/components/Drawer';
import { DrawerProvider } from '@/src/context/DrawerContext';
import { useAuth } from '@/src/context/AuthContext';
import { useCouple } from '@/src/context/CoupleContext';
import { useTheme } from '@/src/context/ThemeContext';
import { radius, space } from '@/src/theme';

function EmojiTabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{
      alignItems: 'center', justifyContent: 'center',
      width: 46, height: 34, borderRadius: radius.lg,
      backgroundColor: focused ? colors.roseDim : 'transparent',
    }}>
      <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>{emoji}</Text>
    </View>
  );
}

function useOnboardingCheck() {
  const { user } = useAuth();
  const { isPaired } = useCouple();
  useEffect(() => {
    if (!user || !isPaired) return;
    AsyncStorage.getItem('@ourspace_onboarded').then(val => {
      if (!val) router.replace('/(app)/onboarding');
    });
  }, [user, isPaired]);
}

function AppTabs() {
  useOnboardingCheck();
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarHideOnKeyboard: true,
          animation: 'fade',
          sceneStyle: {
            paddingBottom: Platform.OS === 'ios' ? 84 : 68,
            backgroundColor: colors.bg,
          },
          tabBarStyle: {
            backgroundColor: colors.bg === '#F9F7F2' ? 'rgba(249,247,242,0.97)' : 'rgba(18,16,14,0.97)',
            borderTopWidth: 1,
            borderTopColor: colors.line,
            paddingTop: space.sm,
            paddingBottom: Platform.OS === 'ios' ? space.lg : space.md,
            height: Platform.OS === 'ios' ? 84 : 68,
            position: 'absolute',
            left: 0, right: 0, bottom: 0,
            elevation: 4,
          },
          tabBarActiveTintColor: colors.rose,
          tabBarInactiveTintColor: colors.muted,
          tabBarLabelStyle: {
            fontSize: 10, fontWeight: '600',
            letterSpacing: 0.2, marginTop: 2,
            opacity: 1,
          },
          tabBarItemStyle: { paddingTop: space.xs },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ focused }) => <EmojiTabIcon emoji="🏠" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="calendar"
          options={{
            title: 'Calendar',
            tabBarIcon: ({ focused }) => <EmojiTabIcon emoji="📅" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="chat"
          options={{
            title: 'Chat',
            tabBarIcon: ({ focused }) => <EmojiTabIcon emoji="💬" focused={focused} />,
            tabBarStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="us"
          options={{
            title: 'Us',
            tabBarIcon: ({ focused }) => <EmojiTabIcon emoji="💕" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="goals"
          options={{
            title: 'Goals',
            tabBarIcon: ({ focused }) => <EmojiTabIcon emoji="🎯" focused={focused} />,
          }}
        />
        {/* Hidden tab screens — no tab bar icon; hide the tab bar on immersive screens */}
        {['more','open-when','memories','journal','our-journal','couple-profile',
          'wishlist','date-ideas','todo','expenses','couple-quiz',
          'aria','health','health-partner','savings','notes','onboarding','photos',
          'heartbeat','time-capsule','breathe','connect','shared-lists','edit-profile',
          'notifications','shared-note','trip-planner'].map(name => (
          <Tabs.Screen key={name} name={name} options={{ href: null }} />
        ))}
        {/* Immersive screens — hide the tab bar entirely */}
        <Tabs.Screen name="snaps" options={{ href: null, tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="video-call" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      </Tabs>

      {/* Drawer sits above everything in the (app) group */}
      <Drawer />
    </View>
  );
}

export default function AppLayout() {
  return (
    <DrawerProvider>
      <AppTabs />
    </DrawerProvider>
  );
}
