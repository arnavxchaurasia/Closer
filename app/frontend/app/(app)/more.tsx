import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Animated, Easing, Modal, Pressable, ScrollView,
  StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system';
import * as Notifications from 'expo-notifications';
import * as Sharing from 'expo-sharing';

import { api } from '@/src/api';
import { Button } from '@/src/components/Button';
import { HamburgerButton } from '@/src/components/Drawer';
import { Input } from '@/src/components/Input';
import { Press } from '@/src/components/Press';
import { useAuth } from '@/src/context/AuthContext';
import { useCouple } from '@/src/context/CoupleContext';
import { useTheme } from '@/src/context/ThemeContext';
import { getHapticsEnabled, haptics, setHapticsEnabled } from '@/src/haptics';
import { useNicknames } from '@/src/hooks/useNicknames';
import { Colors, radius, space } from '@/src/theme';

type SharingSettings = { calendar?: string; journal?: string; mood?: string };

const NOTIF_PREFS_KEY = '@soulsync_notif_prefs';

type NotifPrefs = {
  messages: boolean;
  nudges: boolean;
  moods: boolean;
  streakReminder: boolean;
  birthdayReminders: boolean;
  rituals: boolean;
};

const defaultPrefs: NotifPrefs = {
  messages: true,
  nudges: true,
  moods: true,
  streakReminder: true,
  birthdayReminders: true,
  rituals: true,
};

const NOTIF_PREF_ITEMS: { key: keyof NotifPrefs; label: string; sub: string }[] = [
  { key: 'messages',         label: '💬 New messages',              sub: 'When your partner sends a message' },
  { key: 'nudges',           label: '💭 Nudges',                    sub: 'Thinking of you pings' },
  { key: 'moods',            label: '😊 Partner mood updates',      sub: 'When they log their mood' },
  { key: 'streakReminder',   label: '🔥 Streak reminders',          sub: 'Keep your daily streak going' },
  { key: 'birthdayReminders',label: '🎂 Birthday reminders',        sub: 'Never miss an important date' },
  { key: 'rituals',          label: '🌙 Rituals',                   sub: 'Goodnight and goodmorning' },
];

function makeStyles(c: Colors) {
  return StyleSheet.create({
    root:        { flex: 1, backgroundColor: c.bg },
    scroll:      { paddingHorizontal: space.lg, paddingBottom: 120 },
    pageHeader:  { flexDirection: 'row', alignItems: 'center', paddingTop: space.md, marginBottom: space.xl },
    screenTitle: { fontSize: 28, fontWeight: '900', color: c.text, letterSpacing: -0.8, flex: 1 },
    secLbl:      { fontSize: 10, fontWeight: '800', color: c.muted, letterSpacing: 1.6, textTransform: 'uppercase', marginTop: space.xl, marginBottom: space.md },
    profileCard: { backgroundColor: c.surface, borderRadius: 20, padding: space.lg, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: c.line },
    avatar:      { width: 56, height: 56, borderRadius: 28, backgroundColor: c.roseDim, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: c.rose },
    avatarTxt:   { color: c.rose, fontWeight: '900', fontSize: 20 },
    pAvatar:     { width: 56, height: 56, borderRadius: 28, backgroundColor: c.goldDim, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: c.gold },
    pAvatarTxt:  { color: c.gold, fontWeight: '900', fontSize: 20 },
    name:        { fontSize: 17, fontWeight: '800', color: c.text, letterSpacing: -0.2 },
    email:       { fontSize: 12, color: c.muted, marginTop: 2 },
    card:        { backgroundColor: c.surface, borderRadius: 20, padding: space.lg, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: c.line, marginBottom: space.sm },
    cardCol:     { flexDirection: 'column', alignItems: 'flex-start', gap: space.sm },
    rowItem:     { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderRadius: 16, padding: space.md, borderWidth: 1, borderColor: c.line, marginBottom: space.sm },
    rowLbl:      { fontSize: 15, fontWeight: '600', color: c.text },
    sharingVal:  { fontSize: 12, fontWeight: '700', color: c.rose },
    badge:       { backgroundColor: c.blueDim, borderRadius: radius.full, paddingHorizontal: space.sm, paddingVertical: 4 },
    badgeTxt:    { fontSize: 11, fontWeight: '700', color: c.blue },
    pill:        { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.full, backgroundColor: c.surface2, borderWidth: 1, borderColor: c.line },
    pillActive:  { backgroundColor: c.roseDim, borderColor: c.rose },
    pillTxt:     { fontSize: 11, fontWeight: '700', color: c.textSec },
    pillTxtA:    { color: c.rose },
    onlineDot:   { width: 7, height: 7, borderRadius: 4, backgroundColor: '#5CB87A' },
    dangerTxt:   { color: '#EF4444' },
    dangerBorder:{ borderColor: 'rgba(239,68,68,0.2)' },
    version:     { fontSize: 11, color: c.muted, textAlign: 'center', marginTop: space.xl },
    themeRow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderRadius: 20, padding: space.lg, borderWidth: 1, borderColor: c.line, marginBottom: space.sm },

    // Nickname card
    nickCard:    { backgroundColor: c.surface, borderRadius: 20, borderWidth: 1, borderColor: c.line, marginBottom: space.sm, overflow: 'hidden' },
    nickRow:     { flexDirection: 'row', alignItems: 'center', padding: space.md + 2, borderBottomWidth: 1, borderBottomColor: c.line },
    nickLbl:     { fontSize: 13, fontWeight: '600', color: c.text, flex: 1 },
    nickVal:     { fontSize: 13, color: c.rose, fontWeight: '700', marginRight: 4 },

    // Nickname modal
    modalBg:     { flex: 1, backgroundColor: c.bg },
    modalTitle:  { fontSize: 22, fontWeight: '800', color: c.text, letterSpacing: -0.3, marginBottom: space.lg },
    fLabel:      { fontSize: 11, fontWeight: '700', color: c.textSec, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6 },
    fInput:      { backgroundColor: c.surface2, borderRadius: 14, height: 52, paddingHorizontal: space.md, color: c.text, fontSize: 15, borderWidth: 1, borderColor: c.line, marginBottom: space.md },
    saveBtn:     { backgroundColor: c.rose, borderRadius: 16, height: 56, alignItems: 'center', justifyContent: 'center', marginTop: space.sm },
    saveBtnTxt:  { color: '#fff', fontSize: 16, fontWeight: '800' },
  });
}

function FadeSlide({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 450, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);
  const y = a.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  return <Animated.View style={{ opacity: a, transform: [{ translateY: y }] }}>{children}</Animated.View>;
}

// ─── Animated Theme Toggle ───────────────────────────────────────────────────
function AnimatedThemeToggle({ value, onToggle }: { value: boolean; onToggle: () => void }) {
  const { colors } = useTheme();
  const thumbAnim = useRef(new Animated.Value(value ? 1 : 0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(thumbAnim, {
      toValue: value ? 1 : 0,
      useNativeDriver: true,
      damping: 15,
      stiffness: 250,
    }).start();
  }, [value]);

  const handlePress = () => {
    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 0.9, useNativeDriver: true, speed: 60, bounciness: 0 }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 8 }),
    ]).start();
    onToggle();
  };

  const thumbX = thumbAnim.interpolate({ inputRange: [0, 1], outputRange: [2, 30] });

  return (
    <Pressable onPress={handlePress} accessibilityRole="switch" accessibilityState={{ checked: value }} hitSlop={12} style={{ padding: 4, margin: -4 }}>
      <Animated.View style={[
        {
          width: 58, height: 30, borderRadius: 15,
          backgroundColor: value ? colors.rose : colors.surface3,
          justifyContent: 'center',
          transform: [{ scale: scaleAnim }],
        },
      ]}>
        <Animated.View style={{
          width: 26, height: 26, borderRadius: 13,
          backgroundColor: '#fff',
          shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4,
          shadowOffset: { width: 0, height: 2 }, elevation: 3,
          transform: [{ translateX: thumbX }],
          alignItems: 'center', justifyContent: 'center',
        }}>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { colors, typography, isDark, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { partner, isPaired, refresh: refreshCouple } = useCouple();
  const { myNickname, partnerNickname, setMyNickname, setPartnerNickname } = useNicknames(user?.name, partner?.name);

  const [sharing, setSharing]             = useState<SharingSettings>({});
  const [notifsEnabled, setNotifsEnabled] = useState(true);
  const [hapticsOn, setHapticsOn]         = useState(true);
  const [showNickModal, setShowNickModal] = useState(false);
  const [draftMy, setDraftMy]             = useState('');
  const [draftPartner, setDraftPartner]   = useState('');
  const [notifPrefs, setNotifPrefs]       = useState<NotifPrefs>(defaultPrefs);
  const [showNotifPrefs, setShowNotifPrefs] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const s = useMemo(() => makeStyles(colors), [colors]);

  useEffect(() => {
    api.get<SharingSettings>('/api/settings/sharing').then(setSharing).catch(() => {});
    getHapticsEnabled().then(setHapticsOn);
    Notifications.getPermissionsAsync().then(({ status }) => {
      setNotifsEnabled(status === 'granted');
    });
    AsyncStorage.getItem(NOTIF_PREFS_KEY).then(raw => {
      if (raw) {
        try { setNotifPrefs({ ...defaultPrefs, ...JSON.parse(raw) }); } catch {}
      }
    });
  }, []);

  const toggleNotifPref = async (key: keyof NotifPrefs) => {
    const updated = { ...notifPrefs, [key]: !notifPrefs[key] };
    setNotifPrefs(updated);
    await AsyncStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(updated));
  };

  const toggleHaptics = async (val: boolean) => {
    setHapticsOn(val);
    await setHapticsEnabled(val);
    if (val) haptics.medium();
  };

  const updateSharing = async (key: keyof SharingSettings, value: string) => {
    haptics.select();
    const updated = { ...sharing, [key]: value };
    setSharing(updated);
    await api.put('/api/settings/sharing', updated).catch(() => {});
  };

  const sharingLabel = (k: keyof SharingSettings) =>
    ({ private: 'Private', partner: 'Shared', busy_only: 'Busy only' }[sharing[k] ?? 'private'] ?? 'Private');

  const openNickModal = () => {
    setDraftMy(myNickname);
    setDraftPartner(partnerNickname);
    setShowNickModal(true);
  };
  const saveNicknames = async () => {
    await Promise.all([setMyNickname(draftMy.trim()), setPartnerNickname(draftPartner.trim())]);
    haptics.success();
    setShowNickModal(false);
  };

  const handleLogout = () => Alert.alert('Sign out?', '', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: () => logout() },
  ]);

  // ── Password Change ────────────────────────────────────────────────────────
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword]     = useState('');
  const [newPassword, setNewPassword]             = useState('');

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }
    try {
      await api.put('/api/auth/password', { current_password: currentPassword, new_password: newPassword });
      setShowPasswordModal(false);
      setCurrentPassword('');
      setNewPassword('');
      Alert.alert('Success', 'Your password has been changed.');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to change password');
    }
  };

  // ── Data Export ─────────────────────────────────────────────────────────────
  const handleExportData = async () => {
    try {
      const res = await api.get('/api/account/export');
      const fileUri = `${(FileSystem as any).documentDirectory}OurSpace_Export.json`;
      await (FileSystem as any).writeAsStringAsync(fileUri, JSON.stringify(res, null, 2));
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { UTI: 'public.json', mimeType: 'application/json' });
      } else {
        Alert.alert('Success', 'Data exported to ' + fileUri);
      }
    } catch (e: any) {
      Alert.alert('Export Failed', e.message);
    }
  };

  const handleUnpair = () => Alert.alert(
    'Unlink Partner?',
    'This will disconnect you from your partner. Both accounts will become unpaired. Your partner will be notified.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unlink', style: 'destructive',
        onPress: async () => {
          try {
            await api.del('/api/couple');
            await refreshCouple();
            haptics.success();
          } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'Could not unlink.');
          }
        },
      },
    ],
  );

  const handleDeleteAccount = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') return;
    setShowDeleteModal(false);
    setDeleteConfirmText('');
    try {
      await api.del('/api/account');
      logout();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not delete account.');
    }
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        <FadeSlide delay={0}>
          <View style={s.pageHeader}>
            <Text style={s.screenTitle}>Settings</Text>
            <HamburgerButton />
          </View>
        </FadeSlide>

        {/* Profile */}
        <FadeSlide delay={40}>
          <Text style={s.secLbl}>Profile</Text>
          <View style={s.profileCard}>
            <View style={s.avatar}>
              {user?.avatar_url
                ? <Image source={{ uri: user.avatar_url }} style={{ width: 56, height: 56, borderRadius: 28 }} />
                : <Text style={s.avatarTxt}>{user?.name?.[0]?.toUpperCase() ?? '?'}</Text>
              }
            </View>
            <View style={{ flex: 1, marginLeft: space.md }}>
              <Text style={s.name}>{user?.name}</Text>
              <Text style={s.email}>{user?.email}</Text>
            </View>
          </View>
          <Pressable
            style={[s.rowItem, { marginTop: space.sm, borderColor: colors.roseDim }]}
            onPress={() => router.push('/(app)/couple-profile')}
          >
            <Ionicons name="person-outline" size={20} color={colors.rose} />
            <Text style={[s.rowLbl, { flex: 1, marginLeft: space.md }]}>Edit Profile</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </Pressable>
          <Pressable
            style={[s.rowItem, { marginTop: space.xs, borderColor: colors.roseDim }]}
            onPress={() => router.push('/onboarding' as any)}
          >
            <Ionicons name="sparkles-outline" size={20} color={colors.rose} />
            <Text style={[s.rowLbl, { flex: 1, marginLeft: space.md }]}>View Onboarding Showcase 🚀</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </Pressable>
        </FadeSlide>

        {/* Couple */}
        <FadeSlide delay={80}>
          <Text style={s.secLbl}>Your couple</Text>
          {isPaired && partner ? (
            <>
              <View style={s.card}>
                <View style={s.pAvatar}>
                  <Text style={s.pAvatarTxt}>{partner.name[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: space.md }}>
                  <Text style={s.name}>{partner.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    <View style={s.onlineDot} />
                    <Text style={{ fontSize: 12, color: colors.muted }}>Connected</Text>
                  </View>
                </View>
              </View>
              <Pressable style={[s.rowItem, { marginTop: space.sm, borderColor: colors.roseDim }]} onPress={() => router.push('/(app)/couple-profile')}>
                <Ionicons name="heart-outline" size={20} color={colors.rose} />
                <Text style={[s.rowLbl, { flex: 1, marginLeft: space.md }]}>Couple Profile</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </Pressable>
              <Pressable style={[s.rowItem, s.dangerBorder]} onPress={handleUnpair}>
                <Ionicons name="person-remove-outline" size={18} color="#EF4444" />
                <Text style={[s.rowLbl, { flex: 1, marginLeft: space.md }, s.dangerTxt]}>Unlink Partner</Text>
              </Pressable>
            </>
          ) : (
            <Pressable style={[s.card, { borderColor: colors.roseDim }]} onPress={() => router.push('/(auth)/pair')}>
              <Ionicons name="heart-circle-outline" size={26} color={colors.rose} />
              <View style={{ flex: 1, marginLeft: space.md }}>
                <Text style={s.name}>Invite your person</Text>
                <Text style={s.email}>Connect and start your shared life.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          )}
        </FadeSlide>

        {/* Nicknames */}
        {isPaired && partner && (
          <FadeSlide delay={110}>
            <Text style={s.secLbl}>Nicknames</Text>
            <View style={s.nickCard}>
              <View style={s.nickRow}>
                <Text style={s.nickLbl}>You call them</Text>
                <Text style={s.nickVal}>{partnerNickname || partner.name.split(' ')[0]}</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.muted} />
              </View>
              <Pressable style={[s.nickRow, { borderBottomWidth: 0 }]} onPress={openNickModal}>
                <Text style={s.nickLbl}>They call you</Text>
                <Text style={s.nickVal}>{myNickname || user?.name?.split(' ')[0]}</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.muted} />
              </Pressable>
              <Pressable style={{ padding: space.md, alignItems: 'center' }} onPress={openNickModal}>
                <Text style={{ fontSize: 13, color: colors.rose, fontWeight: '700' }}>Edit nicknames ✏️</Text>
              </Pressable>
            </View>
          </FadeSlide>
        )}

        {/* Appearance */}
        <FadeSlide delay={140}>
          <Text style={s.secLbl}>Appearance</Text>
          <View style={s.themeRow}>
            <Text style={{ fontSize: 22 }}>{isDark ? '◑' : '○'}</Text>
            <View style={{ flex: 1, marginLeft: space.md }}>
              <Text style={s.rowLbl}>{isDark ? 'Dark mode' : 'Light mode'}</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>Tap to switch</Text>
            </View>
            <AnimatedThemeToggle value={isDark} onToggle={toggleTheme} />
          </View>
        </FadeSlide>

        {/* Privacy & sharing */}
        <FadeSlide delay={170}>
          <Text style={s.secLbl}>Privacy & sharing</Text>
          <Text style={{ fontSize: 13, color: colors.muted, marginBottom: space.md, lineHeight: 18 }}>
            Control what your partner sees. Changes apply instantly.
          </Text>
          {([
            { key: 'calendar' as const, label: 'Calendar events', options: ['private', 'busy_only', 'partner'] },
            { key: 'mood'     as const, label: 'Mood check-ins',  options: ['private', 'partner'] },
            { key: 'journal'  as const, label: 'Journal entries', options: ['private', 'partner'] },
          ]).map(item => (
            <View key={item.key} style={[s.card, s.cardCol]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
                <Text style={s.rowLbl}>{item.label}</Text>
                <Text style={s.sharingVal}>{sharingLabel(item.key)}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
                {item.options.map(o => (
                  <Pressable
                    key={o}
                    testID={`sharing-pill-${item.key}-${o}`}
                    style={[s.pill, sharing[item.key] === o && s.pillActive]}
                    onPress={() => updateSharing(item.key, o)}
                  >
                    <Text style={[s.pillTxt, sharing[item.key] === o && s.pillTxtA]}>
                      {{ private: 'Private', busy_only: 'Busy only', partner: 'Shared' }[o] ?? o}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </FadeSlide>

        {/* Notifications & Haptics */}
        <FadeSlide delay={200}>
          <Text style={s.secLbl}>Notifications & Feel</Text>
          <View style={[s.card, { justifyContent: 'space-between', marginBottom: space.sm }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.rowLbl}>Push notifications</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>Partner activity, reminders, nudges</Text>
            </View>
            <Switch value={notifsEnabled} onValueChange={async (val) => {
              if (val) {
                const { status } = await Notifications.requestPermissionsAsync();
                setNotifsEnabled(status === 'granted');
                if (status !== 'granted') {
                  Alert.alert('Permission needed', 'Enable notifications in your device settings.');
                } else if (Device.isDevice) {
                  const tokenData = await Notifications.getExpoPushTokenAsync({
                    projectId: Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId,
                  });
                  await api.post('/api/push-token', { token: tokenData.data, platform: 'expo' }).catch(() => {});
                }
              } else {
                setNotifsEnabled(false);
                await api.del('/api/push-token').catch(() => {});
                Alert.alert('Notifications off', 'Re-enable them in Settings → Notifications.');
              }
            }} trackColor={{ false: colors.surface3, true: colors.rose + 'AA' }} thumbColor={notifsEnabled ? colors.rose : colors.muted} />
          </View>
          {notifsEnabled && (
            <View style={{ backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.line, marginBottom: space.sm, overflow: 'hidden' }}>
              <Pressable
                onPress={() => setShowNotifPrefs(v => !v)}
                style={{ flexDirection: 'row', alignItems: 'center', padding: space.md, gap: space.md }}
              >
                <Ionicons name="options-outline" size={18} color={colors.rose} />
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: colors.text }}>Notification preferences</Text>
                <Ionicons name={showNotifPrefs ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
              </Pressable>
              {showNotifPrefs && NOTIF_PREF_ITEMS.map((item, i) => (
                <View key={item.key} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: colors.line }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{item.label}</Text>
                    <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>{item.sub}</Text>
                  </View>
                  <Switch
                    value={notifPrefs[item.key]}
                    onValueChange={() => toggleNotifPref(item.key)}
                    trackColor={{ false: colors.surface3, true: colors.rose + 'AA' }}
                    thumbColor={notifPrefs[item.key] ? colors.rose : colors.muted}
                  />
                </View>
              ))}
            </View>
          )}
          <View style={[s.card, { justifyContent: 'space-between' }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.rowLbl}>Haptic feedback</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>Vibrations when you tap buttons</Text>
            </View>
            <Switch value={hapticsOn} onValueChange={toggleHaptics} trackColor={{ false: colors.surface3, true: colors.rose + 'AA' }} thumbColor={hapticsOn ? colors.rose : colors.muted} />
          </View>
        </FadeSlide>

        {/* Connected accounts */}
        <FadeSlide delay={230}>
          <Text style={s.secLbl}>Connected accounts</Text>
          <Pressable style={s.card} onPress={() => Alert.alert('Coming soon', 'Google Calendar sync is coming in the next update.')}>
            <Ionicons name="calendar-outline" size={22} color={colors.blue} />
            <View style={{ flex: 1, marginLeft: space.md }}>
              <Text style={s.rowLbl}>Google Calendar</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>Two-way sync your events</Text>
            </View>
            <View style={s.badge}><Text style={s.badgeTxt}>Connect</Text></View>
          </Pressable>
        </FadeSlide>

        {/* Account */}
        <FadeSlide delay={260}>
          <Text style={s.secLbl}>Account</Text>
          {[
            { label: 'Change password', icon: 'key-outline',      onPress: () => setShowPasswordModal(true) },
            { label: 'Export my data',  icon: 'download-outline', onPress: handleExportData },
            { label: 'Delete account',  icon: 'warning-outline',  danger: true, onPress: () => { setDeleteConfirmText(''); setShowDeleteModal(true); } },
          ].map(item => (
            <Pressable key={item.label} style={[s.rowItem, item.danger && s.dangerBorder]} onPress={item.onPress}>
              <Ionicons name={item.icon as any} size={20} color={item.danger ? '#EF4444' : colors.muted} />
              <Text style={[s.rowLbl, { flex: 1, marginLeft: space.md }, item.danger && s.dangerTxt]}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
          ))}
          <Pressable style={[s.rowItem, { marginTop: space.sm }, s.dangerBorder]} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color="#EF4444" />
            <Text style={[s.rowLbl, { flex: 1, marginLeft: space.md }, s.dangerTxt]}>Sign out</Text>
          </Pressable>
        </FadeSlide>

        <Text style={s.version}>OurSpace v1.0.0 · Made with ❤️</Text>
      </ScrollView>

      {/* Delete Account Modal */}
      <Modal visible={showDeleteModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowDeleteModal(false)}>
        <SafeAreaView style={s.modalBg}>
          <ScrollView contentContainerStyle={{ padding: space.lg }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.lg }}>
              <Text style={[s.modalTitle, { marginBottom: 0, flex: 1 }]}>Delete Account</Text>
              <Pressable onPress={() => setShowDeleteModal(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={colors.muted} />
              </Pressable>
            </View>
            <Text style={{ fontSize: 14, color: colors.muted, marginBottom: space.xl, lineHeight: 20 }}>
              This is permanent and cannot be undone. All your data — messages, memories, journals, and everything else — will be deleted forever.
              {`\n\n`}Type <Text style={{ fontWeight: '800', color: '#EF4444' }}>DELETE</Text> below to confirm.
            </Text>
            <Input
              label="Type DELETE to confirm"
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              autoCapitalize="characters"
            />
            <Button
              variant="danger"
              label="Permanently delete my account"
              onPress={handleDeleteAccount}
              disabled={deleteConfirmText.trim().toUpperCase() !== 'DELETE'}
              fullWidth
              style={{ marginTop: space.md }}
            />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Nickname editor modal */}
      <Modal visible={showNickModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowNickModal(false)}>
        <SafeAreaView style={s.modalBg}>
          <ScrollView contentContainerStyle={{ padding: space.lg }} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.lg }}>
              <Text style={[s.modalTitle, { marginBottom: 0, flex: 1 }]}>Nicknames</Text>
              <Pressable onPress={() => setShowNickModal(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={colors.muted} />
              </Pressable>
            </View>
            <Text style={{ fontSize: 14, color: colors.muted, marginBottom: space.xl, lineHeight: 20 }}>
              Set the names you use for each other. These are private and only visible to you in the app.
            </Text>
            <Input
              label={`What ${partner?.name?.split(' ')[0] ?? 'they'} calls you`}
              value={draftMy}
              onChangeText={setDraftMy}
            />
            <View style={{ height: space.md }} />
            <Input
              label={`What you call ${partner?.name?.split(' ')[0] ?? 'them'}`}
              value={draftPartner}
              onChangeText={setDraftPartner}
            />
            <Button
              variant="primary"
              label="Save nicknames"
              onPress={saveNicknames}
              fullWidth
              style={{ marginTop: space.md }}
            />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Change Password Modal */}
      <Modal visible={showPasswordModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowPasswordModal(false)}>
        <SafeAreaView style={s.modalBg}>
          <ScrollView contentContainerStyle={{ padding: space.lg }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.lg }}>
              <Text style={[s.modalTitle, { marginBottom: 0, flex: 1 }]}>Change Password</Text>
              <Pressable onPress={() => setShowPasswordModal(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={colors.muted} />
              </Pressable>
            </View>
            <Input
              label="Current Password"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
            />
            <View style={{ height: space.md }} />
            <Input
              label="New Password"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
            />
            <Button
              variant="primary"
              label="Update Password"
              onPress={handleChangePassword}
              disabled={!currentPassword || !newPassword}
              fullWidth
              style={{ marginTop: space.md }}
            />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
