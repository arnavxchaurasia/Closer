import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Tabs, router } from 'expo-router';
import { useEffect } from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';

import { Drawer } from '@/src/components/Drawer';
import { DrawerProvider } from '@/src/context/DrawerContext';
import { useAuth } from '@/src/context/AuthContext';
import { useCouple } from '@/src/context/CoupleContext';
import { useTheme } from '@/src/context/ThemeContext';
import { radius, space } from '@/src/theme';

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{
      alignItems: 'center', justifyContent: 'center',
      width: 48, height: 36, borderRadius: radius.lg,
      backgroundColor: focused ? colors.roseDim : 'transparent',
    }}>
      <Ionicons
        name={name as any}
        size={22}
        color={focused ? colors.rose : colors.muted}
      />
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
  const { width } = useWindowDimensions();
  const tabInset = width > 560 ? Math.max(16, (width - 520) / 2) : 8;
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarHideOnKeyboard: true,
          animation: 'shift',
          sceneStyle: {
            paddingBottom: Platform.OS === 'ios' ? 84 : 68,
            backgroundColor: colors.bg,
          },
          tabBarStyle: {
            backgroundColor: colors.bg === '#F9F7F2' ? 'rgba(249,247,242,0.97)' : 'rgba(10,10,26,0.97)',
            borderTopWidth: 0,
            borderWidth: 1,
            borderColor: colors.line,
            paddingTop: space.sm,
            paddingBottom: Platform.OS === 'ios' ? space.lg : space.md,
            height: Platform.OS === 'ios' ? 80 : 64,
            position: 'absolute',
            left: tabInset, right: tabInset, bottom: Platform.OS === 'ios' ? 8 : 12,
            borderRadius: 28,
            elevation: 8,
            shadowColor: '#000',
            shadowOpacity: 0.3,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 4 },
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
            tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'home' : 'home-outline'} focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="calendar"
          options={{
            title: 'Calendar',
            tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'calendar' : 'calendar-outline'} focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="chat"
          options={{
            title: 'Chat',
            tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'chatbubble' : 'chatbubble-outline'} focused={focused} />,
            tabBarStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="date-ideas"
          options={{
            title: 'Explore',
            tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'sparkles' : 'sparkles-outline'} focused={focused} />,
          }}
        />
        {/* Hidden tab screens */}
        {['us','goals','more','open-when','memories','journal','our-journal','couple-profile',
          'wishlist','todo','expenses','couple-quiz',
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
