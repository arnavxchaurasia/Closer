import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import {
  Animated, Pressable, ScrollView, useWindowDimensions,
  StyleSheet, Switch, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/src/context/AuthContext';
import { useCouple } from '@/src/context/CoupleContext';
import { useDrawer } from '@/src/context/DrawerContext';
import { useTheme } from '@/src/context/ThemeContext';
import { radius, space } from '@/src/theme';

const NAV_SECTIONS = [
  {
    title: 'CONNECT',
    items: [
      { label: 'Messages 💬',    icon: 'chatbubble-outline',  route: '/(app)/chat' },
      { label: 'Heartbeat 💓',   icon: 'pulse-outline',       route: '/(app)/heartbeat' },
      { label: 'Connect Hub 🔗', icon: 'link-outline',        route: '/(app)/connect' },
      { label: 'Memories 📸',    icon: 'images-outline',      route: '/(app)/memories' },
      { label: 'Photo Album 🖼️', icon: 'image-outline',       route: '/(app)/photos' },
      { label: 'Shared Note 📝', icon: 'create-outline',      route: '/(app)/shared-note' },
      { label: 'Trip Planner ✈️', icon: 'airplane-outline',    route: '/(app)/trip-planner' },
      { label: 'Activity Feed 🔔', icon: 'notifications-outline', route: '/(app)/notifications' },
      { label: 'Open When 💌',   icon: 'mail-outline',        route: '/(app)/open-when' },
      { label: 'Love Notes 💛',  icon: 'heart-outline',       route: '/(app)/notes' },
    ],
  },
  {
    title: 'EXPLORE',
    items: [
      { label: 'Quiz & Games 🎲', icon: 'game-controller-outline', route: '/(app)/couple-quiz' },
      { label: 'Date Ideas 💡',   icon: 'bulb-outline',            route: '/(app)/date-ideas' },
      { label: 'Shared Lists 📋', icon: 'list-outline',            route: '/(app)/shared-lists' },
      { label: 'Time Capsule ⏳', icon: 'time-outline',            route: '/(app)/time-capsule' },
      { label: 'Together ✅',    icon: 'checkbox-outline',         route: '/(app)/todo' },
      { label: 'Wishlist 🎁',    icon: 'gift-outline',             route: '/(app)/wishlist' },
      { label: 'Expenses 💳',    icon: 'card-outline',             route: '/(app)/expenses' },
    ],
  },
  {
    title: 'WELLBEING',
    items: [
      { label: 'Ask Aria ✨',   icon: 'sparkles-outline', route: '/(app)/aria' },
      { label: 'My Health 💚',  icon: 'fitness-outline',  route: '/(app)/health' },
      { label: 'My Journal 📖', icon: 'book-outline',     route: '/(app)/journal' },
    ],
  },
  {
    title: 'SETTINGS',
    items: [
      { label: 'Settings ⚙️', icon: 'settings-outline', route: '/(app)/more' },
    ],
  },
];

export function Drawer() {
  const { isOpen, close } = useDrawer();
  const { colors, typography, isDark, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { partner, isPaired } = useCouple();
  const pathname = usePathname();
  const { width: screenWidth } = useWindowDimensions();
  const panelWidth = Math.min(screenWidth * 0.86, 360);

  const translateX = useRef(new Animated.Value(-panelWidth)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: isOpen ? 0 : -panelWidth,
        useNativeDriver: true,
        damping: 22,
        stiffness: 220,
        mass: 0.8,
      }),
      Animated.timing(backdropOpacity, {
        toValue: isOpen ? 1 : 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isOpen, panelWidth]);

  const navigate = (route: string) => {
    close();
    setTimeout(() => router.push(route as any), 120);
  };

  const handleLogout = () => {
    close();
    setTimeout(() => logout(), 200);
  };

  const isActive = (route: string) => {
    if (route === '/(app)/') return pathname === '/' || pathname === '/index';
    return pathname.includes(route.replace('/(app)/', ''));
  };

  return (
    <>
      {/* Backdrop */}
      <Animated.View
        pointerEvents={isOpen ? 'auto' : 'none'}
        style={[StyleSheet.absoluteFillObject, { opacity: backdropOpacity, zIndex: 200, backgroundColor: 'rgba(0,0,0,0.55)' }]}
      >
        <Pressable style={{ flex: 1 }} onPress={close} />
      </Animated.View>

      {/* Panel */}
      <Animated.View style={[s.panel, { width: panelWidth, backgroundColor: colors.surface, transform: [{ translateX }] }]}>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>

          {/* Profile header */}
          <View style={[s.profileSection, { borderBottomColor: colors.line }]}>
            <View style={[s.avatarLg, { backgroundColor: colors.roseDim, borderColor: colors.rose }]}>
              <Text style={[s.avatarTextLg, { color: colors.rose }]}>
                {user?.name?.[0]?.toUpperCase() ?? '?'}
              </Text>
            </View>
            <View style={{ flex: 1, marginLeft: space.md }}>
              <Text style={[typography.h4, { marginBottom: 2 }]}>{user?.name ?? 'You'}</Text>
              {isPaired && partner ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={[s.onlineDot, { backgroundColor: colors.green }]} />
                  <Text style={[typography.caption, { color: colors.textSec }]}>
                    with {partner.name.split(' ')[0]}
                  </Text>
                </View>
              ) : (
                <Text style={typography.caption}>Solo mode</Text>
              )}
            </View>
          </View>

          {/* Navigation */}
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {NAV_SECTIONS.map(section => (
              <View key={section.title}>
                <Text style={[s.sectionTitle, { color: colors.muted }]}>{section.title}</Text>
                {section.items.map(item => {
                  const active = isActive(item.route);
                  return (
                    <Pressable
                      key={item.label}
                      style={[s.navItem, active && { backgroundColor: colors.roseDim }]}
                      onPress={() => navigate(item.route)}
                    >
                      <View style={[s.navIconWrap, { backgroundColor: active ? colors.rose + '22' : colors.surface2 }]}>
                        <Ionicons
                          name={(active ? item.icon.replace('-outline', '') : item.icon) as any}
                          size={18}
                          color={active ? colors.rose : colors.muted}
                        />
                      </View>
                      <Text style={[typography.body, { fontWeight: active ? '700' : '500', color: active ? colors.rose : colors.text }]}>
                        {item.label}
                      </Text>
                      {active && <View style={[s.activePip, { backgroundColor: colors.rose }]} />}
                    </Pressable>
                  );
                })}
              </View>
            ))}
            <View style={{ height: space.xl }} />
          </ScrollView>

          {/* Footer */}
          <View style={[s.footer, { borderTopColor: colors.line }]}>
            {/* Theme toggle */}
            <View style={[s.themeRow, { backgroundColor: colors.surface2, borderColor: colors.line }]}>
              <Ionicons name={isDark ? 'moon-outline' : 'sunny-outline'} size={18} color={isDark ? colors.blue : colors.gold} />
              <Text style={[typography.body, { flex: 1, marginLeft: space.sm, fontWeight: '500' }]}>
                {isDark ? 'Dark mode' : 'Light mode'}
              </Text>
              <Switch
                value={isDark}
                onValueChange={toggleTheme}
                trackColor={{ false: colors.surface3, true: colors.blue + 'AA' }}
                thumbColor={isDark ? colors.blue : '#fff'}
              />
            </View>

            {/* Sign out */}
            <Pressable style={[s.signOutRow]} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={18} color="#EF4444" />
              <Text style={[typography.body, { marginLeft: space.sm, color: '#EF4444', fontWeight: '600' }]}>
                Sign out
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Animated.View>
    </>
  );
}

// Hamburger button — exported for screens to embed in their header
export function HamburgerButton() {
  const { open } = useDrawer();
  const { colors } = useTheme();
  return (
    <Pressable onPress={open} style={s.hamburgerBtn} hitSlop={10}>
      <View style={[s.hLine, { backgroundColor: colors.text }]} />
      <View style={[s.hLine, s.hLineShort, { backgroundColor: colors.text }]} />
      <View style={[s.hLine, { backgroundColor: colors.text }]} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  panel: {
    position: 'absolute', top: 0, bottom: 0, left: 0,
    zIndex: 201,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 24,
    borderTopRightRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    overflow: 'hidden',
  },
  profileSection: {
    flexDirection: 'row', alignItems: 'center',
    padding: space.lg,
    borderBottomWidth: 1,
    marginBottom: space.sm,
  },
  avatarLg: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5,
  },
  avatarTextLg: { fontSize: 20, fontWeight: '800' },
  onlineDot: { width: 7, height: 7, borderRadius: 4 },
  sectionTitle: {
    fontSize: 10, fontWeight: '800', letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginTop: space.md, marginBottom: space.xs,
    paddingHorizontal: space.lg,
  },
  navItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 11, paddingHorizontal: space.lg,
    marginHorizontal: space.sm, borderRadius: radius.lg,
    marginBottom: 2,
  },
  navIconWrap: {
    width: 32, height: 32, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
    marginRight: space.md,
  },
  activePip: {
    width: 6, height: 6, borderRadius: 3, marginLeft: 'auto',
  },
  footer: {
    padding: space.md,
    borderTopWidth: 1,
    gap: space.sm,
  },
  themeRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: space.md, borderRadius: radius.lg,
    borderWidth: 1,
  },
  signOutRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: space.md, borderRadius: radius.lg,
  },
  hamburgerBtn: {
    gap: 5, padding: 4, justifyContent: 'center',
  },
  hLine: { width: 22, height: 2, borderRadius: 1 },
  hLineShort: { width: 15 },
});
