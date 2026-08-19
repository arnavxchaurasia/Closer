import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, Easing, Modal, Pressable,
  RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/src/api';
import { Button } from '@/src/components/Button';
import { DateField } from '@/src/components/DateTimeField';
import { HamburgerButton } from '@/src/components/Drawer';
import { NotConnected } from '@/src/components/NotConnected';
import { Press } from '@/src/components/Press';
import { useAuth } from '@/src/context/AuthContext';
import { useCouple } from '@/src/context/CoupleContext';
import { useTheme } from '@/src/context/ThemeContext';
import { haptics } from '@/src/haptics';
import { useNicknames } from '@/src/hooks/useNicknames';
import { Colors, TAB_BAR_HEIGHT, radius, space } from '@/src/theme';

const NEXT_VISIT_KEY = '@ourspace_next_visit';

type Memory = { id: string; title: string; content?: string; memory_date: string; image_url?: string };
type TimeCapsule = { id: string; message?: string; opens_at: string; locked?: boolean };
type CoupleProfile = {
  my_love_language?: string;
  partner_love_language?: string;
};
type StatsData = {
  messages_this_week?: number;
  rituals_this_week?: number;
  total_memories?: number;
  messages_sent?: number;
  goals_completed?: number;
  moods_logged?: number;
  letters_sent?: number;
  longest_streak?: number;
};

type Milestone = { id: string; title: string; date: string; emoji?: string; note?: string };

// ── Weekly check-in questions ─────────────────────────────────────────────────
const CHECKIN_QUESTIONS = [
  { key: 'connection',   type: 'scale5' as const, text: 'How connected did you feel this week? (1–5 ❤️)' },
  { key: 'best_moment',  type: 'text' as const,   text: 'What was the best moment this week?' },
  { key: 'appreciation', type: 'text' as const,   text: 'One thing you appreciate about your partner?' },
  { key: 'mood',         type: 'scale10' as const, text: 'How are you feeling right now? (1–10)' },
] as const;
const HEART_EMOJIS = ['💔', '🩶', '❤️', '💕', '💞'];
const MOOD_EMOJIS  = ['😔', '😕', '😐', '🙂', '😊', '😄', '🥰', '😁', '🤩', '🥳'];

const LOVE_LANGUAGES: Record<string, { emoji: string; label: string }> = {
  'words_of_affirmation': { emoji: '💬', label: 'Words of Affirmation' },
  'acts_of_service':      { emoji: '🛠️', label: 'Acts of Service' },
  'receiving_gifts':      { emoji: '🎁', label: 'Receiving Gifts' },
  'quality_time':         { emoji: '⏰', label: 'Quality Time' },
  'physical_touch':       { emoji: '🤝', label: 'Physical Touch' },
};

const MILESTONES = [50, 100, 200, 365, 500, 750, 1000, 1500, 2000];
function nextMilestone(days: number): number {
  return MILESTONES.find(m => m > days) ?? MILESTONES[MILESTONES.length - 1];
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    root:    { flex: 1, backgroundColor: c.bg },
    scroll:  { paddingBottom: TAB_BAR_HEIGHT + 16 },

    // Header
    headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.md },

    // Hero gradient card
    heroWrap: { marginHorizontal: space.lg, borderRadius: 20, overflow: 'hidden', marginBottom: space.lg },
    heroGrad: { padding: 24 },
    heroLabel:  { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600', letterSpacing: 1 },
    heroDays:   { color: '#fff', fontSize: 48, fontWeight: '900', marginTop: 4 },
    heroSub:    { color: 'rgba(255,255,255,0.9)', fontSize: 16 },
    heroStats:  { flexDirection: 'row', marginTop: 20, gap: 24 },
    heroStatLbl: { color: 'rgba(255,255,255,0.7)', fontSize: 11 },
    heroStatVal: { color: '#fff', fontSize: 22, fontWeight: '800' },

    // Section
    secWrap:  { marginHorizontal: space.lg, marginBottom: space.xl },
    secRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    secLbl:   { fontSize: 11, fontWeight: '800', color: c.muted, letterSpacing: 1.6, textTransform: 'uppercase' },
    secLink:  { fontSize: 13, color: c.rose, fontWeight: '700' },

    // Card base
    card:     { backgroundColor: c.surface, borderRadius: 18, padding: space.lg, borderWidth: 1, borderColor: c.line },

    // Countdown card
    countCard:    { backgroundColor: c.surface, borderRadius: 18, padding: space.lg, borderWidth: 1, borderColor: c.line, alignItems: 'center' },
    countLabel:   { fontSize: 11, fontWeight: '800', color: c.muted, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 6 },
    countNumber:  { fontSize: 56, fontWeight: '900', color: c.rose, letterSpacing: -2 },
    countSub:     { fontSize: 16, color: c.textSec, marginTop: 2 },
    countDate:    { fontSize: 13, color: c.muted, marginTop: 6, fontWeight: '600' },
    countEdit:    { marginTop: 14, paddingVertical: 8, paddingHorizontal: 20, borderRadius: 20, backgroundColor: c.roseDim },
    countEditTxt: { fontSize: 13, color: c.rose, fontWeight: '700' },

    countEmpty:    { backgroundColor: c.surface, borderRadius: 18, padding: space.lg, borderWidth: 1.5, borderColor: c.roseDim, flexDirection: 'row', alignItems: 'center', gap: space.md },
    countEmptyTxt: { fontSize: 15, color: c.rose, fontWeight: '700', flex: 1 },

    // Love language
    llRow:  { flexDirection: 'row', gap: 12 },
    llCard: { flex: 1, backgroundColor: c.surface, borderRadius: 16, padding: space.md, borderWidth: 1, borderColor: c.line, alignItems: 'center', gap: 6 },
    llEmoji: { fontSize: 28 },
    llName:  { fontSize: 11, fontWeight: '700', color: c.muted, textAlign: 'center' },
    llLang:  { fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'center' },

    // Memories horizontal scroll
    memScroll:  { marginLeft: -space.lg },
    memCard:    { width: 140, marginLeft: space.lg, backgroundColor: c.surface, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: c.line },
    memThumb:   { width: 140, height: 90, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface2 },
    memEmoji:   { fontSize: 36 },
    memBody:    { padding: 10 },
    memTitle:   { fontSize: 13, fontWeight: '700', color: c.text, lineHeight: 17 },
    memDate:    { fontSize: 10, color: c.muted, marginTop: 4, fontWeight: '600' },

    // Quick actions grid
    gridWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    gridBtn:  { width: '31%', aspectRatio: 1, backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center', gap: 6,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
    gridEmoji: { fontSize: 28 },
    gridLbl:   { fontSize: 11, fontWeight: '700', color: c.textSec, textAlign: 'center' },

    // Stats row
    statsRow: { flexDirection: 'row', gap: 10 },
    statBox:  { flex: 1, backgroundColor: c.surface, borderRadius: 14, padding: space.md, alignItems: 'center', borderWidth: 1, borderColor: c.line },
    statNum:  { fontSize: 24, fontWeight: '900', color: c.rose, letterSpacing: -0.5 },
    statLbl:  { fontSize: 10, color: c.muted, fontWeight: '700', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.6, textAlign: 'center' },

    // Time capsule preview
    capCard:  { backgroundColor: c.surface, borderRadius: 18, padding: space.lg, borderWidth: 1, borderColor: c.line, flexDirection: 'row', alignItems: 'center', gap: space.md },
    capIcon:  { width: 48, height: 48, borderRadius: 24, backgroundColor: c.goldDim, alignItems: 'center', justifyContent: 'center' },
    capTitle: { fontSize: 15, fontWeight: '700', color: c.text },
    capSub:   { fontSize: 13, color: c.muted, marginTop: 3 },

    // Skeleton
    shimmer:  { backgroundColor: c.surface2, borderRadius: 14, opacity: 0.7 },

    // Expanded stats
    statsExpGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    statsExpCard: { backgroundColor: c.surface2, borderRadius: 12, padding: space.md, alignItems: 'center', flexBasis: '47%', flexGrow: 1 },
    statsExpNum:  { fontSize: 22, fontWeight: '900', color: c.text, letterSpacing: -0.5 },
    statsExpLbl:  { fontSize: 10, color: c.muted, fontWeight: '700', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.6, textAlign: 'center' },

    // Milestones
    milestoneRow:  { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
    milestoneLine: { width: 2, backgroundColor: c.roseDim, position: 'absolute', left: 15, top: 26, bottom: -14 },
    milestoneDot:  { width: 32, height: 32, borderRadius: 16, backgroundColor: c.roseDim, alignItems: 'center', justifyContent: 'center', marginRight: 12, zIndex: 1 },
    milestoneEmoji: { fontSize: 16 },
    milestoneBody:  { flex: 1 },
    milestoneTitle: { fontSize: 14, fontWeight: '700', color: c.text },
    milestoneDate:  { fontSize: 11, color: c.muted, marginTop: 2, fontWeight: '600' },
    milestoneNote:  { fontSize: 12, color: c.textSec, marginTop: 2, lineHeight: 17 },

    // Check-in card
    checkinCard:    { backgroundColor: c.surface, borderRadius: 18, borderWidth: 1, borderColor: c.line, overflow: 'hidden' },
    checkinHeader:  { flexDirection: 'row', alignItems: 'center', padding: space.lg, gap: space.md },
    checkinProgress: { height: 3, backgroundColor: c.surface2, overflow: 'hidden' },
    checkinFill:    { height: 3, backgroundColor: c.rose },
    checkinBody:    { padding: space.lg, paddingTop: space.md },
    checkinQ:       { fontSize: 16, fontWeight: '700', color: c.text, lineHeight: 22, marginBottom: space.md, textAlign: 'center' },
    checkinScaleRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: space.md },
    checkinDot:     { width: 48, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface2, borderWidth: 1, borderColor: c.line },
    checkinDotSel:  { backgroundColor: c.rose, borderColor: c.rose },
    checkinDotTxt:  { fontSize: 20 },
    checkinDotNum:  { fontSize: 11, fontWeight: '600', color: c.muted, marginTop: 1 },
    checkinDotNumSel: { color: '#fff' },
    checkinInput:   { backgroundColor: c.surface2, borderRadius: 12, borderWidth: 1, borderColor: c.line, padding: space.md, color: c.text, fontSize: 15, minHeight: 80, textAlignVertical: 'top', marginBottom: space.md },
    checkinNextBtn: { backgroundColor: c.rose, borderRadius: 12, height: 46, alignItems: 'center', justifyContent: 'center' },
    checkinNextTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
    checkinDoneBox: { alignItems: 'center', padding: space.lg, gap: 8 },

    // Modal
    modalBg:     { flex: 1, backgroundColor: c.bg, padding: space.lg },
    modalTitle:  { fontSize: 22, fontWeight: '800', color: c.text, flex: 1 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: space.lg },
    saveBtn:     { backgroundColor: c.rose, borderRadius: 16, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: space.md },
    saveBtnTxt:  { color: '#fff', fontSize: 16, fontWeight: '800' },
  });
}

function FadeSlide({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 500, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);
  const y = a.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  return <Animated.View style={{ opacity: a, transform: [{ translateY: y }] }}>{children}</Animated.View>;
}

function SkeletonRow({ height = 80 }: { height?: number }) {
  const anim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View style={{ height, borderRadius: 14, backgroundColor: '#9896A420', marginBottom: 10, opacity: anim }} />
  );
}

const QUICK_ACTIONS = [
  { emoji: '🫁', label: 'Breathe Together', route: '/(app)/breathe' },
  { emoji: '💓', label: 'Heartbeat',         route: '/(app)/heartbeat' },
  { emoji: '⏳', label: 'Time Capsule',       route: '/(app)/time-capsule' },
  { emoji: '📖', label: 'Our Journal',        route: '/(app)/our-journal' },
] as const;

export default function UsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { partner, couple, isPaired, isLoading: coupleLoading } = useCouple();
  const { myNickname, partnerNickname } = useNicknames(user?.name, partner?.name);

  const [memories, setMemories]         = useState<Memory[]>([]);
  const [coupleProfile, setCoupleProfile] = useState<CoupleProfile | null>(null);
  const [timeCapsule, setTimeCapsule]   = useState<TimeCapsule | null>(null);
  const [stats, setStats]               = useState<StatsData>({});
  const [streak, setStreak]             = useState(0);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);

  // Stats expansion
  const [statsExpanded, setStatsExpanded] = useState(false);

  // Milestones
  const [milestones, setMilestones] = useState<Milestone[]>([]);

  // Weekly check-in inline
  const [checkinExpanded, setCheckinExpanded] = useState(false);
  const [checkinStep, setCheckinStep] = useState(0);
  const [checkinAnswers, setCheckinAnswers] = useState({ connection: 0, best_moment: '', appreciation: '', mood: 0 });
  const [checkinDone, setCheckinDone] = useState(false);
  const [checkinSubmitting, setCheckinSubmitting] = useState(false);
  const [checkinStatus, setCheckinStatus] = useState<{ my_checkin: any; partner_checkin: any } | null>(null);

  // Next visit
  const [nextVisit, setNextVisit]       = useState<string | null>(null);
  const [showVisitModal, setShowVisitModal] = useState(false);
  const [pickerDate, setPickerDate]     = useState<string>(new Date().toISOString().slice(0, 10));

  const s = useMemo(() => makeStyles(colors), [colors]);

  const daysTogether = couple?.created_at
    ? Math.floor((Date.now() - new Date(couple.created_at).getTime()) / 86_400_000)
    : null;

  const displayName1 = myNickname || user?.name?.split(' ')[0] || 'You';
  const displayName2 = partnerNickname || partner?.name?.split(' ')[0] || 'Partner';

  const load = useCallback(async () => {
    try {
      const [mem, profile, capsules, statsData, streakData, savedVisit, milestonesData, statusData] = await Promise.all([
        api.get<Memory[]>('/api/memories?limit=5').catch(() => [] as Memory[]),
        api.get<CoupleProfile>('/api/couple-profile').catch(() => null),
        api.get<TimeCapsule[]>('/api/time-capsule').catch(() => [] as TimeCapsule[]),
        api.get<StatsData>('/api/stats/summary').catch(() => ({} as StatsData)),
        api.get<{ streak: number }>('/api/streak').catch(() => ({ streak: 0 })),
        AsyncStorage.getItem(NEXT_VISIT_KEY),
        api.get<Milestone[]>('/api/milestones').catch(() => [] as Milestone[]),
        api.get<any>('/api/weekly-checkin/status').catch(() => null),
      ]);
      setMemories(mem);
      setCoupleProfile(profile);
      setTimeCapsule(capsules?.length ? capsules[capsules.length - 1] : null);
      setStats(statsData ?? {});
      setStreak(streakData.streak);
      setNextVisit(savedVisit);
      setMilestones(milestonesData ?? []);
      setCheckinStatus(statusData);
      if (statusData?.my_checkin) {
        setCheckinDone(true);
      }
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submitCheckin = useCallback(async () => {
    setCheckinSubmitting(true);
    try {
      await api.post('/api/weekly-checkin', checkinAnswers);
      const statusData = await api.get<any>('/api/weekly-checkin/status').catch(() => null);
      setCheckinStatus(statusData);
      setCheckinDone(true);
      haptics.success();
    } catch {
      Alert.alert('Error', 'Could not save weekly check-in');
    }
    setCheckinSubmitting(false);
  }, [checkinAnswers]);

  const saveVisit = async () => {
    await AsyncStorage.setItem(NEXT_VISIT_KEY, pickerDate);
    setNextVisit(pickerDate);
    setShowVisitModal(false);
    haptics.success();
  };

  if (coupleLoading) {
    return (
      <SafeAreaView style={[s.root, { alignItems: 'center', justifyContent: 'center' }]} edges={['top']}>
        <ActivityIndicator color={colors.rose} size="large" />
      </SafeAreaView>
    );
  }

  if (!isPaired) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <NotConnected message="The 'Us' space is shared with your partner. Connect to unlock it." />
      </SafeAreaView>
    );
  }

  const visitDays = nextVisit ? daysUntil(nextVisit) : null;
  const myLL = coupleProfile?.my_love_language;
  const partnerLL = coupleProfile?.partner_love_language;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={colors.rose}
          />
        }
      >
        {/* Header */}
        <FadeSlide delay={0}>
          <View style={s.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: colors.rose, letterSpacing: 1.5, textTransform: 'uppercase' }}>Your shared space</Text>
              <Text style={{ fontSize: 28, fontWeight: '900', color: colors.text, letterSpacing: -0.8, marginTop: 3 }}>OurSpace</Text>
            </View>
            <HamburgerButton />
          </View>
        </FadeSlide>

        {/* ── Section 1: Hero ── */}
        <FadeSlide delay={60}>
          <View style={s.heroWrap}>
            <LinearGradient colors={[colors.rose, colors.rose, colors.rose]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.heroGrad}>
              <Text style={s.heroLabel}>TOGETHER SINCE</Text>
              <Text style={s.heroDays}>{daysTogether ?? '—'}</Text>
              <Text style={s.heroSub}>days of us 💕</Text>

              <View style={s.heroStats}>
                <View>
                  <Text style={s.heroStatLbl}>STREAK</Text>
                  <Text style={s.heroStatVal}>🔥 {streak} days</Text>
                </View>
                {daysTogether !== null && (
                  <View>
                    <Text style={s.heroStatLbl}>NEXT MILESTONE</Text>
                    <Text style={s.heroStatVal}>{nextMilestone(daysTogether)} days</Text>
                  </View>
                )}
              </View>
            </LinearGradient>
          </View>
        </FadeSlide>

        {/* ── Section 2: Next Visit Countdown ── */}
        <FadeSlide delay={110}>
          <View style={s.secWrap}>
            <View style={s.secRow}>
              <Text style={s.secLbl}>Next Visit</Text>
              {nextVisit && (
                <Press onPress={() => { haptics.light(); setPickerDate(nextVisit ?? new Date().toISOString().slice(0, 10)); setShowVisitModal(true); }} haptic="none">
                  <Text style={s.secLink}>Edit →</Text>
                </Press>
              )}
            </View>
            {nextVisit && visitDays !== null ? (
              <View style={s.countCard}>
                <Text style={s.countLabel}>NEXT TIME TOGETHER</Text>
                <Text style={s.countNumber}>{visitDays > 0 ? visitDays : 0}</Text>
                <Text style={s.countSub}>{visitDays === 1 ? 'day to go ✈️' : visitDays <= 0 ? "it's today! 🎉" : 'days to go ✈️'}</Text>
                <Text style={s.countDate}>{formatDate(nextVisit)}</Text>
              </View>
            ) : (
              <Press
                style={s.countEmpty}
                onPress={() => { haptics.light(); setShowVisitModal(true); }}
                haptic="none"
              >
                <Text style={{ fontSize: 22 }}>✈️</Text>
                <Text style={s.countEmptyTxt}>Set your next visit date</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.rose} />
              </Press>
            )}
          </View>
        </FadeSlide>

        {/* ── Section 3: Love Language Summary ── */}
        <FadeSlide delay={160}>
          <View style={s.secWrap}>
            <View style={s.secRow}>
              <Text style={s.secLbl}>Love Languages</Text>
              <Press onPress={() => { haptics.light(); router.push('/(app)/couple-profile'); }} haptic="none">
                <Text style={s.secLink}>Edit →</Text>
              </Press>
            </View>
            {myLL || partnerLL ? (
              <View style={s.llRow}>
                <View style={s.llCard}>
                  <Text style={s.llEmoji}>{myLL ? LOVE_LANGUAGES[myLL]?.emoji ?? '❤️' : '❓'}</Text>
                  <Text style={s.llName}>YOU</Text>
                  <Text style={s.llLang}>{myLL ? LOVE_LANGUAGES[myLL]?.label ?? myLL : 'Not set'}</Text>
                </View>
                <View style={s.llCard}>
                  <Text style={s.llEmoji}>{partnerLL ? LOVE_LANGUAGES[partnerLL]?.emoji ?? '❤️' : '❓'}</Text>
                  <Text style={s.llName}>{displayName2.toUpperCase()}</Text>
                  <Text style={s.llLang}>{partnerLL ? LOVE_LANGUAGES[partnerLL]?.label ?? partnerLL : 'Not set'}</Text>
                </View>
              </View>
            ) : (
              <Press
                style={s.countEmpty}
                onPress={() => { haptics.light(); router.push('/(app)/couple-profile'); }}
                haptic="none"
              >
                <Text style={{ fontSize: 22 }}>💝</Text>
                <Text style={s.countEmptyTxt}>Set your love languages</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.rose} />
              </Press>
            )}
          </View>
        </FadeSlide>

        {/* ── Section 4: Recent Memories ── */}
        <FadeSlide delay={210}>
          <View style={s.secWrap}>
            <View style={s.secRow}>
              <Text style={s.secLbl}>Recent Memories</Text>
              <Press onPress={() => { haptics.light(); router.push('/(app)/memories'); }} haptic="none">
                <Text style={s.secLink}>See all →</Text>
              </Press>
            </View>
            {loading ? (
              <View style={{ flexDirection: 'row', gap: 12 }}>
                {[0, 1, 2].map(i => <View key={i} style={{ width: 140, height: 130, backgroundColor: colors.surface2, borderRadius: 16, opacity: 0.7 }} />)}
              </View>
            ) : memories.length === 0 ? (
              <Press
                style={s.countEmpty}
                onPress={() => { haptics.light(); router.push('/(app)/memories'); }}
                haptic="none"
              >
                <Text style={{ fontSize: 22 }}>📸</Text>
                <Text style={s.countEmptyTxt}>Add your first memory</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.rose} />
              </Press>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.memScroll} contentContainerStyle={{ paddingRight: space.lg }}>
                {memories.slice(0, 5).map(mem => (
                  <TouchableOpacity
                    key={mem.id}
                    style={s.memCard}
                    onPress={() => { haptics.light(); router.push('/(app)/memories'); }}
                    activeOpacity={0.8}
                  >
                    <View style={s.memThumb}>
                      <Text style={s.memEmoji}>📸</Text>
                    </View>
                    <View style={s.memBody}>
                      <Text style={s.memTitle} numberOfLines={2}>{mem.title}</Text>
                      <Text style={s.memDate}>{new Date(mem.memory_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </FadeSlide>

        {/* ── Section 5: Quick Actions ── */}
        <FadeSlide delay={260}>
          <View style={s.secWrap}>
            <View style={s.secRow}>
              <Text style={s.secLbl}>Quick Actions</Text>
            </View>
            <View style={s.gridWrap}>
              {QUICK_ACTIONS.map(action => (
                <Press
                  key={action.route}
                  style={s.gridBtn}
                  onPress={() => { haptics.light(); router.push(action.route as any); }}
                  haptic="none"
                >
                  <Text style={s.gridEmoji}>{action.emoji}</Text>
                  <Text style={s.gridLbl}>{action.label}</Text>
                </Press>
              ))}
            </View>
          </View>
        </FadeSlide>

        {/* ── Section 6: Relationship Stats (expandable) ── */}
        <FadeSlide delay={310}>
          <View style={s.secWrap}>
            <TouchableOpacity style={s.secRow} onPress={() => { haptics.light(); setStatsExpanded(v => !v); }} activeOpacity={0.7}>
              <Text style={s.secLbl}>This Week</Text>
              <Text style={s.secLink}>{statsExpanded ? 'Less ↑' : 'More Stats ↓'}</Text>
            </TouchableOpacity>
            <View style={s.statsRow}>
              <View style={s.statBox}>
                <Text style={s.statNum}>{stats.messages_this_week ?? '—'}</Text>
                <Text style={s.statLbl}>Messages</Text>
              </View>
              <View style={s.statBox}>
                <Text style={s.statNum}>{stats.rituals_this_week ?? '—'}</Text>
                <Text style={s.statLbl}>Rituals</Text>
              </View>
              <View style={s.statBox}>
                <Text style={s.statNum}>{stats.total_memories ?? memories.length}</Text>
                <Text style={s.statLbl}>Memories</Text>
              </View>
            </View>
            {statsExpanded && (
              <View style={s.statsExpGrid}>
                <View style={s.statsExpCard}>
                  <Text style={s.statsExpNum}>{streak}</Text>
                  <Text style={s.statsExpLbl}>🔥 Current Streak</Text>
                </View>
                <View style={s.statsExpCard}>
                  <Text style={s.statsExpNum}>{stats.longest_streak ?? '—'}</Text>
                  <Text style={s.statsExpLbl}>⚡ Longest Streak</Text>
                </View>
                <View style={s.statsExpCard}>
                  <Text style={s.statsExpNum}>{stats.messages_sent ?? '—'}</Text>
                  <Text style={s.statsExpLbl}>💬 Total Messages</Text>
                </View>
                <View style={s.statsExpCard}>
                  <Text style={s.statsExpNum}>{stats.goals_completed ?? '—'}</Text>
                  <Text style={s.statsExpLbl}>🎯 Goals Done</Text>
                </View>
                <View style={s.statsExpCard}>
                  <Text style={s.statsExpNum}>{stats.letters_sent ?? '—'}</Text>
                  <Text style={s.statsExpLbl}>💌 Letters Sent</Text>
                </View>
                <View style={s.statsExpCard}>
                  <Text style={s.statsExpNum}>{stats.moods_logged ?? '—'}</Text>
                  <Text style={s.statsExpLbl}>😊 Moods Logged</Text>
                </View>
              </View>
            )}
          </View>
        </FadeSlide>

        {/* ── Section 7a: Weekly Check-in ── */}
        <FadeSlide delay={340}>
          <View style={s.secWrap}>
            <View style={s.checkinCard}>
              <TouchableOpacity style={s.checkinHeader} onPress={() => { haptics.light(); setCheckinExpanded(v => !v); if (!checkinExpanded) { setCheckinStep(0); setCheckinDone(false); setCheckinAnswers({ connection: 0, best_moment: '', appreciation: '', mood: 0 }); } }} activeOpacity={0.8}>
                <Text style={{ fontSize: 22 }}>📋</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>Weekly Check-in</Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 1 }}>A quick reflection on your week</Text>
                </View>
                <Ionicons name={checkinExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
              </TouchableOpacity>

              {checkinExpanded && !checkinDone && (
                <>
                  <View style={s.checkinProgress}>
                    <View style={[s.checkinFill, { width: `${((checkinStep + 1) / CHECKIN_QUESTIONS.length) * 100}%` }]} />
                  </View>
                  <View style={s.checkinBody}>
                    <Text style={{ fontSize: 11, color: colors.muted, textAlign: 'center', marginBottom: space.sm }}>
                      Question {checkinStep + 1} of {CHECKIN_QUESTIONS.length}
                    </Text>
                    <Text style={s.checkinQ}>{CHECKIN_QUESTIONS[checkinStep].text}</Text>

                    {CHECKIN_QUESTIONS[checkinStep].type === 'scale5' && (
                      <View style={s.checkinScaleRow}>
                        {HEART_EMOJIS.map((emoji, i) => {
                          const val = i + 1;
                          const sel = checkinAnswers.connection === val;
                          return (
                            <Pressable key={val} style={[s.checkinDot, sel && s.checkinDotSel]} onPress={() => { haptics.light(); setCheckinAnswers(a => ({ ...a, connection: val })); }}>
                              <Text style={s.checkinDotTxt}>{emoji}</Text>
                              <Text style={[s.checkinDotNum, sel && s.checkinDotNumSel]}>{val}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    )}

                    {CHECKIN_QUESTIONS[checkinStep].type === 'scale10' && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginBottom: space.md }}>
                        {MOOD_EMOJIS.map((emoji, i) => {
                          const val = i + 1;
                          const sel = checkinAnswers.mood === val;
                          return (
                            <Pressable key={val} style={[s.checkinDot, sel && s.checkinDotSel, { width: 46, height: 52 }]} onPress={() => { haptics.light(); setCheckinAnswers(a => ({ ...a, mood: val })); }}>
                              <Text style={s.checkinDotTxt}>{emoji}</Text>
                              <Text style={[s.checkinDotNum, sel && s.checkinDotNumSel]}>{val}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    )}

                    {(CHECKIN_QUESTIONS[checkinStep].key === 'best_moment' || CHECKIN_QUESTIONS[checkinStep].key === 'appreciation') && (
                      <TextInput
                        style={s.checkinInput}
                        value={checkinAnswers[CHECKIN_QUESTIONS[checkinStep].key as 'best_moment' | 'appreciation']}
                        onChangeText={val => setCheckinAnswers(a => ({ ...a, [CHECKIN_QUESTIONS[checkinStep].key]: val }))}
                        placeholder={CHECKIN_QUESTIONS[checkinStep].key === 'best_moment' ? 'Describe a moment you loved…' : 'What do you appreciate most?'}
                        placeholderTextColor={colors.muted}
                        multiline
                      />
                    )}

                    <Pressable
                      style={[s.checkinNextBtn, (checkinSubmitting) && { opacity: 0.5 }]}
                      onPress={() => {
                        haptics.light();
                        if (checkinStep < CHECKIN_QUESTIONS.length - 1) { setCheckinStep(s => s + 1); }
                        else { submitCheckin(); }
                      }}
                      disabled={checkinSubmitting}
                    >
                      <Text style={s.checkinNextTxt}>{checkinSubmitting ? 'Saving…' : checkinStep < CHECKIN_QUESTIONS.length - 1 ? 'Next' : 'Complete'}</Text>
                    </Pressable>
                  </View>
                </>
              )}

              {checkinExpanded && checkinDone && (
                <View style={[s.checkinBody, { gap: space.md }]}>
                  {checkinStatus?.partner_checkin ? (
                    <>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: colors.rose, textAlign: 'center', marginBottom: 4 }}>
                        Weekly Summary 📈
                      </Text>
                      
                      {/* Connection Rating */}
                      <View style={{ backgroundColor: colors.surface2, borderRadius: radius.md, padding: 10, borderWidth: 1, borderColor: colors.line }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSec, marginBottom: 6, textAlign: 'center' }}>How connected we felt</Text>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                          <View style={{ alignItems: 'center' }}>
                            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.rose }}>Me</Text>
                            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 2 }}>
                              {checkinStatus.my_checkin.connection} / 5
                            </Text>
                          </View>
                          <View style={{ alignItems: 'center' }}>
                            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.rose }}>Partner</Text>
                            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 2 }}>
                              {checkinStatus.partner_checkin.connection} / 5
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Mood Rating */}
                      <View style={{ backgroundColor: colors.surface2, borderRadius: radius.md, padding: 10, borderWidth: 1, borderColor: colors.line }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSec, marginBottom: 6, textAlign: 'center' }}>Our average mood</Text>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                          <View style={{ alignItems: 'center' }}>
                            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.green }}>Me</Text>
                            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 2 }}>
                              {checkinStatus.my_checkin.mood} / 10
                            </Text>
                          </View>
                          <View style={{ alignItems: 'center' }}>
                            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.green }}>Partner</Text>
                            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 2 }}>
                              {checkinStatus.partner_checkin.mood} / 10
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Best Moment */}
                      <View style={{ backgroundColor: colors.surface2, borderRadius: radius.md, padding: 10, borderWidth: 1, borderColor: colors.line }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSec, marginBottom: 4 }}>Best Moment</Text>
                        <Text style={{ fontSize: 13, color: colors.text, fontStyle: 'italic', marginBottom: 6 }}>Me: &quot;{checkinStatus.my_checkin.best_moment}&quot;</Text>
                        <Text style={{ fontSize: 13, color: colors.text, fontStyle: 'italic' }}>Partner: &quot;{checkinStatus.partner_checkin.best_moment}&quot;</Text>
                      </View>

                      {/* Appreciation */}
                      <View style={{ backgroundColor: colors.surface2, borderRadius: radius.md, padding: 10, borderWidth: 1, borderColor: colors.line }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSec, marginBottom: 4 }}>Appreciation</Text>
                        <Text style={{ fontSize: 13, color: colors.text, fontStyle: 'italic', marginBottom: 6 }}>Me: &quot;{checkinStatus.my_checkin.appreciation}&quot;</Text>
                        <Text style={{ fontSize: 13, color: colors.text, fontStyle: 'italic' }}>Partner: &quot;{checkinStatus.partner_checkin.appreciation}&quot;</Text>
                      </View>
                    </>
                  ) : (
                    <View style={{ alignItems: 'center', gap: 12, paddingVertical: 10 }}>
                      <Text style={{ fontSize: 44 }}>⏳</Text>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text, textAlign: 'center' }}>
                        Waiting for partner to check in
                      </Text>
                      <Text style={{ fontSize: 13, color: colors.textSec, textAlign: 'center', lineHeight: 20 }}>
                        You&apos;ve completed your weekly check-in! Once your partner submits theirs, the comparison will be revealed here.
                      </Text>
                    </View>
                  )}
                  <Pressable style={[s.checkinNextBtn, { marginTop: 10 }]} onPress={() => setCheckinExpanded(false)}>
                    <Text style={s.checkinNextTxt}>Close</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        </FadeSlide>

        {/* ── Section 7b: Milestones ── */}
        <FadeSlide delay={370}>
          <View style={s.secWrap}>
            <View style={s.secRow}>
              <Text style={s.secLbl}>Milestones</Text>
            </View>
            {milestones.length === 0 && !loading ? (
              <View style={s.countEmpty}>
                <Text style={{ fontSize: 22 }}>🗺️</Text>
                <Text style={s.countEmptyTxt}>No milestones yet</Text>
              </View>
            ) : (
              <View style={[s.card, { paddingVertical: space.md }]}>
                {milestones.slice(0, 5).map((m, idx) => (
                  <View key={m.id} style={s.milestoneRow}>
                    {idx < Math.min(milestones.length, 5) - 1 && <View style={s.milestoneLine} />}
                    <View style={s.milestoneDot}>
                      <Text style={s.milestoneEmoji}>{m.emoji ?? '❤️'}</Text>
                    </View>
                    <View style={s.milestoneBody}>
                      <Text style={s.milestoneTitle}>{m.title}</Text>
                      <Text style={s.milestoneDate}>{new Date(m.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
                      {m.note ? <Text style={s.milestoneNote}>{m.note}</Text> : null}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </FadeSlide>

        {/* ── Section 8: Time Capsule Preview ── */}
        <FadeSlide delay={400}>
          <View style={s.secWrap}>
            <View style={s.secRow}>
              <Text style={s.secLbl}>Time Capsule</Text>
              <Press onPress={() => { haptics.light(); router.push('/(app)/time-capsule'); }} haptic="none">
                <Text style={s.secLink}>Open →</Text>
              </Press>
            </View>
            {timeCapsule ? (
              <Press
                style={s.capCard}
                onPress={() => { haptics.light(); router.push('/(app)/time-capsule'); }}
                haptic="none"
              >
                <View style={s.capIcon}>
                  <Text style={{ fontSize: 22 }}>🔒</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.capTitle}>Opens on {formatDate(timeCapsule.opens_at)}</Text>
                  <Text style={s.capSub} numberOfLines={1}>
                    {timeCapsule.message ? '••••••••••' : 'A message from the past'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Press>
            ) : (
              <Press
                style={s.countEmpty}
                onPress={() => { haptics.light(); router.push('/(app)/time-capsule'); }}
                haptic="none"
              >
                <Text style={{ fontSize: 22 }}>⏳</Text>
                <Text style={s.countEmptyTxt}>Create a time capsule</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.rose} />
              </Press>
            )}
          </View>
        </FadeSlide>
      </ScrollView>

      {/* Next Visit Date Picker Modal */}
      <Modal visible={showVisitModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowVisitModal(false)}>
        <SafeAreaView style={s.modalBg} edges={['top']}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Next Visit Date</Text>
            <Pressable onPress={() => setShowVisitModal(false)} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.muted} />
            </Pressable>
          </View>

          <Text style={{ color: colors.textSec, marginBottom: space.lg, fontSize: 15, lineHeight: 22 }}>
            When will you next be together? We&apos;ll count down to your reunion. ✈️
          </Text>

          <DateField
            label="Visit date"
            value={pickerDate}
            onChange={setPickerDate}
            placeholder="Pick a date…"
          />

          <Button label="Set Visit Date" onPress={saveVisit} fullWidth size="lg" style={{ marginTop: space.md }} />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
