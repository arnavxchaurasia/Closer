import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, AppState, Dimensions, Easing, Modal, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/src/api';
import { Press } from '@/src/components/Press';
import { Toast, useToast } from '@/src/components/Toast';
import { HamburgerButton } from '@/src/components/Drawer';
import { useAuth } from '@/src/context/AuthContext';
import { useCouple } from '@/src/context/CoupleContext';
import { useTheme } from '@/src/context/ThemeContext';
import { haptics } from '@/src/haptics';
import { useNicknames } from '@/src/hooks/useNicknames';
import { canSendNudge, recordNudgeSent, getNudgeStatus } from '@/src/notificationRules';
import { LOVE_QUOTES } from '@/src/quotes';
import { getNextFestival } from '@/src/festivals';
import { Colors, TAB_BAR_HEIGHT, radius, space } from '@/src/theme';

// ─── Types ────────────────────────────────────────────────────────────────────
type DashboardData = {
  events?: Array<{ id: string; title: string; start_dt: string; end_dt: string; owner_id: string; visibility: string; color?: string }>;
  goals?:  Array<{ id: string; title: string; category: string; current_value: number; target_value?: number; unit?: string }>;
  trips?:  Array<{ id: string; title: string; date: string }>;
};
type AvailData = { my_status?: string; partner_status?: string };
type Occasion = { type: string; emoji: string; title: string; message: string; priority: number };
type ThisDayMemory = { id?: string; title?: string; date?: string; years_ago?: number };
type PartnerPhase = { phase: string; emoji: string; label: string; tip: string };
type Memory = { id: string; title?: string; date?: string; created_at?: string; photo_url?: string };
type PartnerActivity = { type: string; text: string; time: string };

// ─── Constants ────────────────────────────────────────────────────────────────
const MOODS: [string, number][] = [['😔', 1], ['😕', 2], ['😐', 3], ['🙂', 4], ['😄', 5]];
const MOOD_EMOJIS = ['😔', '😕', '😐', '🙂', '😄'];

const QUICK = [
  { icon: '💬', label: 'Chat',       route: '/(app)/chat'       },
  { icon: '💘', label: 'Date Idea',  route: '/(app)/date-ideas' },
  { icon: '📅', label: 'Calendar',   route: '/(app)/calendar'   },
  { icon: '📸', label: 'Memories',   route: '/(app)/memories'   },
  { icon: '✨', label: 'Aria',       route: '/(app)/aria'       },
  { icon: '🎯', label: 'Goals',      route: '/(app)/goals'      },
  { icon: '💊', label: 'My Health',  route: '/(app)/health'     },
  { icon: '💰', label: 'Savings',    route: '/(app)/savings'    },
];

const GOAL_ICONS: Record<string, string> = {
  relationship: '❤️', health: '💪', learning: '📚',
  finance: '💰', travel: '✈️', career: '💼', lifestyle: '🌿', hobbies: '🎨',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getRitualLabel() {
  const h = new Date().getHours();
  if (h < 12) return 'Send Good Morning ☀️';
  if (h >= 21 || h < 5) return 'Send Good Night 🌙';
  return 'Send a Thinking of You 💭';
}

function getRitualType() {
  const h = new Date().getHours();
  if (h < 12) return 'goodmorning';
  if (h >= 21 || h < 5) return 'goodnight';
  return 'thinking_of_you';
}

function daysAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) {
    const hrs = Math.floor(ms / 3_600_000);
    if (hrs === 0) return 'just now';
    return `${hrs}h ago`;
  }
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function memoryTimeLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? 'last month' : `${months} months ago`;
  const years = Math.floor(months / 12);
  return years === 1 ? 'last year' : `${years} years ago`;
}

function nextOccurrence(mmdd: string): { daysAway: number } {
  const [m, d] = mmdd.split('-').map(Number);
  const now = new Date();
  let next = new Date(now.getFullYear(), m - 1, d);
  if (next.getTime() < now.getTime()) next = new Date(now.getFullYear() + 1, m - 1, d);
  return { daysAway: Math.ceil((next.getTime() - now.getTime()) / 86_400_000) };
}

// ─── Skeleton shimmer ─────────────────────────────────────────────────────────
function Skel({ w, h, r = 12 }: { w: number | `${number}%`; h: number; r?: number }) {
  const { colors } = useTheme();
  const a = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 0.85, duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      Animated.timing(a, { toValue: 0.35, duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
    ])).start();
  }, []);
  return <Animated.View style={{ width: w as any, height: h, borderRadius: r, backgroundColor: colors.surface3, opacity: a, marginBottom: 8 }} />;
}

// ─── Fade + slide up animation wrapper ───────────────────────────────────────
function FadeSlide({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, {
      toValue: 1, duration: 480, delay,
      easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start();
  }, []);
  const y = a.interpolate({ inputRange: [0, 1], outputRange: [20, 0] });
  return (
    <Animated.View style={{ opacity: a, transform: [{ translateY: y }] }}>
      {children}
    </Animated.View>
  );
}

// ─── Floating pill component ──────────────────────────────────────────────────
function FloatingPill({ children, offsetDelay = 0 }: { children: React.ReactNode; offsetDelay?: number }) {
  const { colors } = useTheme();
  const floatY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(offsetDelay),
        Animated.timing(floatY, { toValue: -8, duration: 2500, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
        Animated.timing(floatY, { toValue: 0,  duration: 2500, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);
  return (
    <Animated.View style={{
      transform: [{ translateY: floatY }],
      backgroundColor: colors.surface,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: colors.lineStr,
      shadowColor: '#000',
      shadowOpacity: 0.06,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    }}>
      {children}
    </Animated.View>
  );
}

// ─── Eyebrow label ────────────────────────────────────────────────────────────
function Eyebrow({ children, color }: { children: string; color?: string }) {
  const { colors } = useTheme();
  return (
    <Text style={{
      fontSize: 9, fontWeight: '700', letterSpacing: 2,
      textTransform: 'uppercase', opacity: 0.4,
      color: color ?? colors.text, marginBottom: 4,
    }}>
      {children}
    </Text>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const { partner, couple, isPaired } = useCouple();
  const { partnerNickname } = useNicknames(user?.name, partner?.name);

  // State
  const [dash, setDash]             = useState<DashboardData | null>(null);
  const [avail, setAvail]           = useState<AvailData | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [streak, setStreak]         = useState<number | null>(null);
  const [todayMood, setTodayMood]   = useState<number | null>(null);
  const [partnerMood, setPartnerMood] = useState<number | null>(null);
  const [loggingMood, setLoggingMood] = useState(false);

  const [ritualSent, setRitualSent] = useState(false);
  const [ritualDisabled, setRitualDisabled] = useState(false);

  const [coupleProfile, setCoupleProfile] = useState<{ anniversary?: string; my_birthday?: string; partner_birthday?: string } | null>(null);
  const [occasions, setOccasions]   = useState<Occasion[]>([]);
  const [memory, setMemory]         = useState<Memory | null>(null);
  const [partnerActivity, setPartnerActivity] = useState<PartnerActivity[]>([]);
  const [partnerPhase, setPartnerPhase] = useState<PartnerPhase | null>(null);
  const [partnerOnlineTime, setPartnerOnlineTime] = useState<string | null>(null);
  const [trips, setTrips] = useState<any[]>([]);
  const [savings, setSavings] = useState<{ current: number; goal: number } | null>(null);
  const [openTasks, setOpenTasks] = useState<{ id: string; title: string; done?: boolean }[]>([]);

  const [sendingThinking, setSendingThinking] = useState(false);
  const sendThinkingOfYou = async () => {
    setSendingThinking(true);
    haptics.medium();
    try {
      await api.post('/api/messages', { content: '💭 thinking of you', msg_type: 'text' });
      haptics.success();
      Alert.alert('Sent!', `Sent "💭 thinking of you" to ${partnerName}.`);
    } catch {
      haptics.error();
      Alert.alert('Error', 'Could not send message.');
    } finally {
      setSendingThinking(false);
    }
  };

  // Weekly love letter
  const [weeklyLetter, setWeeklyLetter] = useState<{ summary: string } | null>(null);
  const [letterExpanded, setLetterExpanded] = useState(false);
  const [letterDismissed, setLetterDismissed] = useState(false);

  // Love notes
  const [notes, setNotes]           = useState<{ note_id: string; text: string; author_id: string }[]>([]);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteText, setNoteText]     = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [quoteIdx, setQuoteIdx]     = useState(() => Math.floor(Date.now() / 86_400_000) % LOVE_QUOTES.length);
  const [dynamicQuote, setDynamicQuote] = useState<{ text: string; author: string } | null>(null);
  const quoteAnim  = useRef(new Animated.Value(1)).current;
  const quoteScale = useRef(new Animated.Value(1)).current;

  // Nudge
  const [nudgeRemaining, setNudgeRemaining] = useState(2);
  const [nudgeCooldown, setNudgeCooldown]   = useState(0);

  // Flying heart animation
  const heartY   = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(0)).current;

  const { toast, show: showToast, hide: hideToast } = useToast();

  const heroGrad: [string, string] = ['#9F1239', '#E8607A'];

  // ─── Derived ────────────────────────────────────────────────────────────────
  const firstName      = user?.name?.split(' ')[0] ?? 'you';
  const partnerName    = partnerNickname || partner?.name?.split(' ')[0] || 'Partner';
  const partnerInitials = partner?.name?.[0]?.toUpperCase() ?? '?';
  const greeting       = getGreeting();
  const ritualLabel    = getRitualLabel();
  const ritualType     = getRitualType();

  const isPartnerOnline = partnerOnlineTime
    ? (Date.now() - new Date(partnerOnlineTime).getTime()) < 60_000
    : false;

  const daysTogether = couple?.created_at
    ? Math.floor((Date.now() - new Date(couple.created_at).getTime()) / 86_400_000)
    : null;

  // Hero stat — for editorial number display
  const heroStat = useMemo(() => {
    // 0. Check upcoming trips countdown (next 30 days)
    const upcomingTrip = trips.find(t => {
      const tTime = new Date(t.date).getTime();
      return tTime >= Date.now() && (tTime - Date.now()) <= 30 * 86_400_000;
    });
    if (upcomingTrip) {
      const diff = new Date(upcomingTrip.date).getTime() - Date.now();
      const days = Math.floor(diff / 86_400_000);
      return {
        eyebrow: 'REUNION HORIZON',
        number: days,
        unit: 'days',
        sub: `to ${upcomingTrip.title}`,
      };
    }

    // 1. Check partner's birthday countdown (next 14 days)
    if (coupleProfile?.partner_birthday) {
      const pb = coupleProfile.partner_birthday.slice(5);
      const { daysAway } = nextOccurrence(pb);
      if (daysAway <= 14) {
        return {
          eyebrow: `${partnerName.toUpperCase()}'S BIRTHDAY`,
          number: daysAway,
          unit: 'days',
          sub: daysAway === 0 ? 'is today!' : 'away',
        };
      }
    }

    // 2. Check anniversary countdown (next 14 days)
    if (coupleProfile?.anniversary) {
      const ann = coupleProfile.anniversary.slice(5);
      const { daysAway } = nextOccurrence(ann);
      if (daysAway <= 14) {
        return {
          eyebrow: 'ANNIVERSARY',
          number: daysAway,
          unit: 'days',
          sub: 'away',
        };
      }
    }

    // 3. Fallback to days together
    if (daysTogether !== null) {
      return {
        eyebrow: 'DAYS TOGETHER',
        number: daysTogether,
        unit: 'days',
        sub: 'and counting',
      };
    }
    return null;
  }, [daysTogether, coupleProfile, partnerName, trips]);

  const hasNotes  = notes.length > 0;
  const activeNote = hasNotes ? notes[quoteIdx % notes.length] : null;
  const quote = activeNote
    ? { text: activeNote.text, author: activeNote.author_id === user?.user_id ? 'You' : partnerName }
    : dynamicQuote ?? LOVE_QUOTES[quoteIdx % LOVE_QUOTES.length];

  const festival = getNextFestival(couple?.created_at);
  const today    = new Date().toISOString().slice(0, 10);
  const todayEvts = (dash?.events ?? []).filter(e => e.start_dt.startsWith(today));
  const topGoals  = (dash?.goals ?? []).slice(0, 2);
  const nextEvt   = (dash?.events ?? []).find(e => new Date(e.start_dt) > new Date());

  // Context banner — pick highest priority
  const contextBanner = useMemo(() => {
    if (!coupleProfile && !streak && occasions.length === 0) return null;

    if (coupleProfile?.anniversary) {
      const ann = coupleProfile.anniversary.slice(5);
      const todayMMDD = new Date().toISOString().slice(5, 10);
      const { daysAway } = nextOccurrence(ann);
      const startYear = coupleProfile.anniversary.slice(0, 4);
      const years = new Date().getFullYear() - parseInt(startYear, 10);
      if (todayMMDD === ann) return { emoji: '🎉', text: `Happy Anniversary! ${years} year${years !== 1 ? 's' : ''} together`, color: colors.gold, bg: colors.goldDim };
      if (daysAway <= 7) return { emoji: '🥂', text: `Anniversary in ${daysAway} days — plan something special`, color: colors.gold, bg: colors.goldDim };
    }
    if (coupleProfile?.partner_birthday) {
      const pb = coupleProfile.partner_birthday.slice(5);
      const todayMMDD = new Date().toISOString().slice(5, 10);
      const { daysAway } = nextOccurrence(pb);
      if (todayMMDD === pb) return { emoji: '🎂', text: `It's ${partnerName}'s birthday!`, color: colors.gold, bg: colors.goldDim };
      if (daysAway <= 3) return { emoji: '🎁', text: `${partnerName}'s birthday is in ${daysAway} days`, color: colors.gold, bg: colors.goldDim };
    }
    const phaseOcc = occasions.find(o => o.type === 'partner_pms' || o.type === 'partner_period');
    if (phaseOcc) return { emoji: '💜', text: phaseOcc.message, color: '#A855F7', bg: 'rgba(168,85,247,0.12)' };
    if (streak && streak >= 7) {
      return { emoji: '🔥', text: `Don't lose your ${streak}-day streak!`, color: colors.rose, bg: colors.roseDim };
    }
    return null;
  }, [coupleProfile, occasions, streak, partnerName]);

  // ─── Data loading ──────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const [d, a, streakData, ritualData, cp, moodHistory, partnerMoodData, occ, phaseData, memData, actData, notesData, partnerData, tripsData, todosData] = await Promise.all([
        api.get<DashboardData>('/api/dashboard').catch(() => ({} as DashboardData)),
        api.get<AvailData>('/api/availability').catch(() => ({} as AvailData)),
        api.get<{ streak: number }>('/api/streak').catch(() => ({ streak: 0 })),
        api.get<{ done: boolean }>('/api/ritual/today').catch(() => ({ done: false })),
        api.get<{ anniversary?: string; my_birthday?: string; partner_birthday?: string }>('/api/couple-profile').catch(() => null),
        api.get<{ date: string; value: number }[]>('/api/mood/history?days=1').catch(() => []),
        api.get<{ value: number } | null>('/api/mood/partner').catch(() => null),
        api.get<Occasion[]>('/api/occasion').catch(() => []),
        api.get<PartnerPhase>('/api/health/partner-phase').catch(() => null),
        api.get<Memory[]>('/api/memories?limit=20').catch(() => []),
        api.get<PartnerActivity[]>('/api/partner-activity').catch(() => []),
        api.get<{ note_id: string; text: string; author_id: string }[]>('/api/notes').catch(() => []),
        api.get<{ last_active?: string }>('/api/partner').catch(() => null),
        api.get<any[]>('/api/trips').catch(() => []),
        api.get<{ id: string; title: string; done?: boolean }[]>('/api/todos/assigned-to-me').catch(() => []),
      ]);

      setDash(d);
      setAvail(a);
      setStreak(streakData.streak);
      setRitualSent(ritualData.done);
      setCoupleProfile(cp);
      setOccasions(Array.isArray(occ) ? occ : []);
      setPartnerPhase(phaseData?.phase && phaseData.phase !== 'unknown' ? phaseData : null);
      setPartnerActivity(Array.isArray(actData) ? actData : []);
      setNotes(Array.isArray(notesData) ? notesData : []);
      if (partnerData?.last_active) setPartnerOnlineTime(partnerData.last_active);
      setTrips(Array.isArray(tripsData) ? tripsData : []);
      setOpenTasks((Array.isArray(todosData) ? todosData : []).filter((t: any) => !t.done).slice(0, 3));

      api.get<{ text: string; author: string }>('/api/daily-quote')
        .then(q => setDynamicQuote(q))
        .catch(() => {});

      const mems = Array.isArray(memData) ? memData : [];
      if (mems.length > 0) {
        setMemory(mems[Math.floor(Math.random() * mems.length)]);
      }

      api.post('/api/calendar/sync-profile-events', {}).catch(() => {});

      const todayStr = new Date().toISOString().slice(0, 10);
      const todayEntry = (moodHistory as { date: string; value: number }[]).find(m => m.date?.startsWith(todayStr));
      if (todayEntry) setTodayMood(todayEntry.value);
      if (partnerMoodData?.value) setPartnerMood(partnerMoodData.value);

      const lastRitual = await AsyncStorage.getItem('@ritual_last_sent').catch(() => null);
      if (lastRitual) {
        const diff = Date.now() - new Date(lastRitual).getTime();
        if (diff < 4 * 3_600_000) setRitualDisabled(true);
      }

      // Fetch savings
      api.get<{ current: number; goal: number }>('/api/savings/summary')
        .then(s => setSavings(s))
        .catch(() => {});
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const refreshNudge = useCallback(async () => {
    const { allowed, remainingToday } = await canSendNudge();
    setNudgeRemaining(remainingToday ?? 0);
    if (!allowed) {
      const { cooldownMinsLeft } = await getNudgeStatus();
      setNudgeCooldown(cooldownMinsLeft);
    } else setNudgeCooldown(0);
  }, []);

  useEffect(() => { load(); refreshNudge(); }, []);

  // Heartbeat: ping every 60s while home screen is in foreground
  useEffect(() => {
    api.post('/api/activity/ping').catch(() => {});
    const appStateRef = { current: AppState.currentState };
    const sub = AppState.addEventListener('change', next => {
      if (next === 'active') api.post('/api/activity/ping').catch(() => {});
      appStateRef.current = next;
    });
    const interval = setInterval(() => {
      if (appStateRef.current === 'active') api.post('/api/activity/ping').catch(() => {});
    }, 60_000);
    return () => { sub.remove(); clearInterval(interval); };
  }, []);

  // Weekly love letter
  useEffect(() => {
    const loadWeeklyLetter = async () => {
      const now = new Date();
      const weekNum = Math.floor(now.getTime() / (7 * 86_400_000));
      const key = `@ourspace_weekly_letter_${now.getFullYear()}-${weekNum}`;
      const dismissed = await AsyncStorage.getItem(key).catch(() => null);
      if (dismissed) { setLetterDismissed(true); return; }
      if (now.getDay() === 0) {
        try {
          const data = await api.get<{ summary: string }>('/api/ai/weekly-summary');
          setWeeklyLetter(data);
        } catch { /* ignore */ }
      }
    };
    loadWeeklyLetter();
  }, []);

  const dismissLetter = async () => {
    const now = new Date();
    const weekNum = Math.floor(now.getTime() / (7 * 86_400_000));
    const key = `@ourspace_weekly_letter_${now.getFullYear()}-${weekNum}`;
    await AsyncStorage.setItem(key, '1').catch(() => {});
    setLetterDismissed(true);
  };

  // ─── Actions ───────────────────────────────────────────────────────────────
  const logMood = async (value: number) => {
    if (todayMood === value || loggingMood) return;
    haptics.light();
    setLoggingMood(true);
    try {
      await api.post('/api/mood', { value });
      setTodayMood(value);
      showToast('Mood logged', 'success');
    } catch { haptics.error(); }
    finally { setLoggingMood(false); }
  };

  const sendRitual = async () => {
    if (ritualSent || ritualDisabled) return;
    haptics.medium();
    heartOpacity.setValue(1);
    heartY.setValue(0);
    Animated.parallel([
      Animated.timing(heartY, { toValue: -80, duration: 600, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      Animated.sequence([
        Animated.delay(400),
        Animated.timing(heartOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]),
    ]).start(() => { heartY.setValue(0); heartOpacity.setValue(0); });

    try {
      await api.post('/api/ritual', { type: ritualType });
      setRitualSent(true);
      setRitualDisabled(true);
      await AsyncStorage.setItem('@ritual_last_sent', new Date().toISOString());
      const label = ritualType === 'goodmorning' ? '☀️ Good morning sent!' : ritualType === 'goodnight' ? '🌙 Good night sent!' : '💭 Sent!';
      showToast(label, 'success');
    } catch { haptics.error(); showToast('Could not send', 'error'); }
  };

  const sendNudge = async () => {
    const { allowed, reason } = await canSendNudge();
    if (!allowed) {
      haptics.warning();
      if (reason === 'daily_limit') showToast(`You've sent enough nudges today`, 'info');
      else showToast(`Give them a moment — ${nudgeCooldown}m left`, 'info');
      return;
    }
    haptics.medium();
    try {
      await api.post('/api/nudge', { type: 'thinking_of_you' });
      await recordNudgeSent();
      haptics.success();
      refreshNudge();
      showToast(`Nudge sent to ${partnerName}`, 'success');
    } catch { haptics.error(); showToast('Could not send right now', 'error'); }
  };

  const saveNote = async () => {
    const text = noteText.trim();
    if (!text) return;
    setSavingNote(true); haptics.light();
    try {
      const created = await api.post<{ note_id: string; text: string; author_id: string }>('/api/notes', { text });
      setNotes(prev => [created, ...prev]);
      setQuoteIdx(0);
      setNoteText(''); setShowNoteModal(false);
      showToast('Note saved');
    } catch { haptics.error(); }
    finally { setSavingNote(false); }
  };

  const crossfadeTo = (newIdx: number) => {
    Animated.parallel([
      Animated.timing(quoteAnim,  { toValue: 0, duration: 250, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
      Animated.timing(quoteScale, { toValue: 0.94, duration: 250, useNativeDriver: true }),
    ]).start(() => {
      setQuoteIdx(newIdx);
      Animated.parallel([
        Animated.timing(quoteAnim,  { toValue: 1, duration: 400, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
        Animated.spring(quoteScale, { toValue: 1, useNativeDriver: true, damping: 14, stiffness: 160, mass: 0.8 }),
      ]).start();
    });
  };

  const cycleLen = () => (notes.length > 0 ? notes.length : LOVE_QUOTES.length);
  const refreshQuote = () => {
    if (notes.length > 0) {
      const len = notes.length;
      if (len <= 1) { crossfadeTo(0); return; }
      crossfadeTo((quoteIdx + 1) % len);
    } else {
      api.post<{ text: string; author: string }>('/api/daily-quote/refresh')
        .then(q => {
          setDynamicQuote(q);
          Animated.parallel([
            Animated.timing(quoteAnim,  { toValue: 0, duration: 250, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
            Animated.timing(quoteScale, { toValue: 0.94, duration: 250, useNativeDriver: true }),
          ]).start(() => {
            Animated.parallel([
              Animated.timing(quoteAnim,  { toValue: 1, duration: 400, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
              Animated.spring(quoteScale, { toValue: 1, useNativeDriver: true, damping: 14, stiffness: 160, mass: 0.8 }),
            ]).start();
          });
        })
        .catch(() => {
          const len = LOVE_QUOTES.length;
          crossfadeTo((quoteIdx + 1) % len);
        });
    }
  };

  const nudgeDisabled = nudgeRemaining === 0 || nudgeCooldown > 0;

  // ─── Render ────────────────────────────────────────────────────────────────
  const screenW   = Dimensions.get('window').width;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <Toast {...toast} onHide={hideToast} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.rose} />}
        contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + 24 }}
      >
        {/* ── [1] HEADER ── */}
        <FadeSlide delay={0}>
          <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            {/* Partner avatar + info */}
            {isPaired && partner ? (
              <Pressable onPress={() => router.push('/(app)/chat')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ position: 'relative' }}>
                  <View style={{
                    width: 48, height: 48, borderRadius: 16,
                    backgroundColor: colors.roseDim,
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 2, borderColor: colors.surface,
                  }}>
                    <Text style={{ fontSize: 20, fontWeight: '700', color: colors.rose }}>{partnerInitials}</Text>
                  </View>
                  {isPartnerOnline && (
                    <View style={{ position: 'absolute', bottom: -1, right: -1, width: 12, height: 12, borderRadius: 6, backgroundColor: '#5A8A6A', borderWidth: 2, borderColor: colors.bg }} />
                  )}
                </View>
                <View>
                  <Text style={{ fontSize: 22, fontWeight: '300', fontStyle: 'italic', color: colors.text, letterSpacing: -0.3 }}>{partnerName}</Text>
                  <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.5, color: isPartnerOnline ? '#5A8A6A' : colors.muted, marginTop: 2 }}>
                    {isPartnerOnline ? '● online now' : partnerOnlineTime ? `active ${daysAgo(partnerOnlineTime)}` : greeting}
                  </Text>
                </View>
              </Pressable>
            ) : (
              <View>
                <Text style={{ fontSize: 13, color: colors.muted }}>{greeting}</Text>
                <Text style={{ fontSize: 22, fontWeight: '300', fontStyle: 'italic', color: colors.text }}>{firstName}</Text>
              </View>
            )}

            {/* Right actions */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Pressable
                onPress={() => router.push('/(app)/notifications' as any)}
                style={{
                  width: 38, height: 38, borderRadius: 12,
                  backgroundColor: colors.surface2,
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 1, borderColor: colors.line,
                }}
                hitSlop={8}
               
              >
                <Ionicons name="notifications-outline" size={18} color={colors.textSec} />
              </Pressable>
              <HamburgerButton />
            </View>
          </View>
        </FadeSlide>

        {/* ── [2] HERO — editorial countdown number ── */}
        {isPaired && (
          <FadeSlide delay={60}>
            <View style={{ paddingHorizontal: 24, marginBottom: 24 }}>
              {loading ? (
                <Skel w="60%" h={120} r={8} />
              ) : heroStat ? (
                <View style={{ position: 'relative' }}>
                  <Eyebrow>{heroStat.eyebrow}</Eyebrow>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 110, fontWeight: '200', fontStyle: 'italic', color: colors.text, lineHeight: 110 }}>
                      {heroStat.number}
                    </Text>
                    <Text style={{ fontSize: 26, fontWeight: '300', fontStyle: 'italic', color: colors.rose, marginBottom: 14, marginLeft: 6 }}>
                      {heroStat.unit}
                    </Text>
                  </View>
                  {heroStat.sub ? (
                    <Text style={{ fontSize: 13, color: colors.muted, fontStyle: 'italic', marginTop: -4 }}>{heroStat.sub}</Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          </FadeSlide>
        )}

        {/* Not paired — invite card */}
        {!isPaired && (
          <FadeSlide delay={60}>
            <Press haptic="light" onPress={() => router.push('/(auth)/pair')} style={{ marginHorizontal: 24, marginBottom: 24 }}>
              <View style={{
                borderRadius: 32,
                backgroundColor: colors.surface,
                borderWidth: 1, borderColor: colors.roseDim,
                padding: 24,
                flexDirection: 'row', alignItems: 'center', gap: 16,
              }}>
                <Text style={{ fontSize: 36 }}>💑</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>Connect your partner</Text>
                  <Text style={{ fontSize: 13, color: colors.muted, marginTop: 3 }}>Create your shared space.</Text>
                </View>
                <Text style={{ color: colors.rose, fontSize: 20 }}>→</Text>
              </View>
            </Press>
          </FadeSlide>
        )}

        {/* ── [3] FLOATING PILLS — mood + next event ── */}
        {isPaired && (
          <FadeSlide delay={120}>
            <View style={{ paddingHorizontal: 24, flexDirection: 'row', gap: 10, marginBottom: 28 }}>
              <FloatingPill offsetDelay={0}>
                <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase', color: colors.muted, opacity: 0.8 }}>Moods</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 18 }}>{todayMood !== null ? MOOD_EMOJIS[todayMood - 1] : '🙂'}</Text>
                    <Text style={{ fontSize: 9, color: colors.muted, marginTop: 1 }}>You</Text>
                  </View>
                  <Text style={{ fontSize: 10, color: colors.line }}>·</Text>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 18 }}>{partnerMood !== null ? MOOD_EMOJIS[partnerMood - 1] : '❓'}</Text>
                    <Text style={{ fontSize: 9, color: colors.muted, marginTop: 1 }}>{partnerName}</Text>
                  </View>
                </View>
              </FloatingPill>
              <FloatingPill offsetDelay={2500}>
                <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase', color: colors.muted, opacity: 0.8 }}>Next</Text>
                <Text style={{ fontSize: 13, fontWeight: '500', color: colors.text, marginTop: 2 }} numberOfLines={1}>
                  {nextEvt ? nextEvt.title.slice(0, 20) : 'No events'}
                </Text>
                {nextEvt && (
                  <Text style={{ fontSize: 10, color: colors.muted, marginTop: 1 }}>
                    {new Date(nextEvt.start_dt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Text>
                )}
              </FloatingPill>
            </View>
          </FadeSlide>
        )}

        {/* ── [4] DAILY RITUAL CARD ── */}
        {isPaired && (
          <FadeSlide delay={160}>
            <View style={{ marginHorizontal: 24, marginBottom: 24 }}>
              <View style={{
                borderRadius: 32, backgroundColor: colors.surface,
                borderWidth: 1, borderColor: colors.line,
                overflow: 'hidden',
              }}>
                {/* Quote area */}
                <View style={{ padding: 24, paddingBottom: 16 }}>
                  <Animated.View style={{ opacity: quoteAnim, transform: [{ scale: quoteScale }] }}>
                    <Eyebrow>{hasNotes ? 'LOVE NOTES' : 'A THOUGHT FOR TODAY'}</Eyebrow>
                    <Text style={{ fontSize: 17, fontWeight: '300', fontStyle: 'italic', lineHeight: 26, color: colors.text, marginTop: 6 }}>
                      {quote.text}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.muted, marginTop: 8 }}>— {quote.author}</Text>
                  </Animated.View>
                </View>
                {/* Divider */}
                <View style={{ height: 1, backgroundColor: colors.line, marginHorizontal: 24 }} />
                {/* Ritual row */}
                <View style={{ padding: 16, flexDirection: 'row', gap: 10 }}>
                  <View style={{ position: 'relative', flex: 1 }}>
                    <Pressable
                      onPress={sendRitual}
                      disabled={ritualSent || ritualDisabled}
                     
                      style={{
                        flex: 1,
                        borderRadius: 20,
                        paddingVertical: 14,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: ritualSent || ritualDisabled ? colors.surface2 : colors.text,
                      }}
                    >
                      {ritualSent || ritualDisabled ? (
                        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.muted }}>Sent today</Text>
                      ) : (
                        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.bg }}>{ritualLabel}</Text>
                      )}
                    </Pressable>
                    <Animated.Text style={{ position: 'absolute', alignSelf: 'center', top: 4, fontSize: 24, opacity: heartOpacity, transform: [{ translateY: heartY }] }}>
                      💗
                    </Animated.Text>
                  </View>
                  <Pressable
                    onPress={() => setShowNoteModal(true)}
                   
                    style={{
                      width: 48, height: 48, borderRadius: 16,
                      backgroundColor: colors.roseDim,
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 20 }}>✍️</Text>
                  </Pressable>
                  {cycleLen() > 1 && (
                    <Pressable
                      onPress={refreshQuote}
                     
                      style={{
                        width: 48, height: 48, borderRadius: 16,
                        backgroundColor: colors.surface2,
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 16, color: colors.muted }}>↺</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </View>
          </FadeSlide>
        )}

        {/* ── [5] STAT STRIP — savings + streak ── */}
        {isPaired && (
          <FadeSlide delay={200}>
            <View style={{ marginHorizontal: 24, marginBottom: 24, flexDirection: 'row', gap: 0 }}>
              {/* Travel fund */}
              <View style={{ flex: 1, paddingRight: 20 }}>
                <Eyebrow>Travel Fund</Eyebrow>
                <Text style={{ fontSize: 38, fontWeight: '200', color: colors.text, lineHeight: 42 }}>
                  ${savings?.current ? savings.current.toLocaleString() : '0'}
                </Text>
                {savings?.goal ? (
                  <>
                    <View style={{ height: 2, backgroundColor: colors.surface3, borderRadius: 1, marginTop: 8, overflow: 'hidden' }}>
                      <View style={{ height: 2, backgroundColor: colors.gold, borderRadius: 1, width: `${Math.min(100, Math.round((savings.current / savings.goal) * 100))}%` as any }} />
                    </View>
                    <Text style={{ fontSize: 10, color: colors.muted, marginTop: 4 }}>{Math.round((savings.current / savings.goal) * 100)}% of goal</Text>
                  </>
                ) : null}
              </View>

              {/* Divider */}
              <View style={{ width: 1, backgroundColor: colors.line, marginVertical: 4 }} />

              {/* Streak */}
              <View style={{ flex: 1, paddingLeft: 20 }}>
                <Eyebrow>Connection</Eyebrow>
                <Text style={{ fontSize: 38, fontWeight: '200', color: colors.text, lineHeight: 42 }}>
                  {streak ?? 0}
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>🔥 day streak</Text>
              </View>
            </View>
          </FadeSlide>
        )}

        {/* ── [5b] QUICK ACTION ROW — Vibe, Chat, Date Idea ── */}
        {isPaired && (
          <FadeSlide delay={210}>
            <View style={{ paddingHorizontal: 24, marginBottom: 24, flexDirection: 'row', gap: 10 }}>
              <Press haptic="medium" style={{ flex: 1 }} onPress={sendThinkingOfYou}>
                <View style={{
                  borderRadius: 20, padding: 14, alignItems: 'center',
                  backgroundColor: colors.roseDim, borderWidth: 1, borderColor: colors.rose + '44',
                  gap: 4,
                }}>
                  <Text style={{ fontSize: 22 }}>💌</Text>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: colors.rose }}>Send Vibe</Text>
                </View>
              </Press>
              <Press haptic="light" style={{ flex: 1 }} onPress={() => router.push('/(app)/chat')}>
                <View style={{
                  borderRadius: 20, padding: 14, alignItems: 'center',
                  backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line,
                  gap: 4,
                }}>
                  <Text style={{ fontSize: 22 }}>💬</Text>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textSec }}>Open Chat</Text>
                </View>
              </Press>
              <Press haptic="light" style={{ flex: 1 }} onPress={() => router.push('/(app)/date-ideas')}>
                <View style={{
                  borderRadius: 20, padding: 14, alignItems: 'center',
                  backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line,
                  gap: 4,
                }}>
                  <Text style={{ fontSize: 22 }}>💘</Text>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textSec }}>Date Idea</Text>
                </View>
              </Press>
            </View>
          </FadeSlide>
        )}

        {/* ── [6] QUICK ACTIONS ── */}
        <FadeSlide delay={220}>
          <View style={{ marginBottom: 24 }}>
            <View style={{ paddingHorizontal: 24, marginBottom: 12 }}>
              <Eyebrow>Quick Access</Eyebrow>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, gap: 8 }}>
              {QUICK.map(a => (
                <Press key={a.label} haptic="light" scale={0.95} onPress={() => router.push(a.route as any)}>
                  <View style={{
                    borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12,
                    backgroundColor: colors.surface2,
                    borderWidth: 1, borderColor: colors.line,
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                  }}>
                    <Text style={{ fontSize: 16 }}>{a.icon}</Text>
                    <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSec }}>{a.label}</Text>
                  </View>
                </Press>
              ))}
            </ScrollView>
          </View>
        </FadeSlide>

        {/* ── Mood check-in (subtle) ── */}
        <FadeSlide delay={240}>
          <View style={{ paddingHorizontal: 24, marginBottom: 24 }}>
            <Eyebrow>How are you feeling?</Eyebrow>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              {MOODS.map(([emoji, value]) => {
                const isSelected = todayMood === value;
                return (
                  <Pressable
                    key={value}
                    disabled={loggingMood}
                    onPress={() => logMood(value)}
                   
                    style={{
                      flex: 1,
                      height: 44,
                      borderRadius: 14,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isSelected ? colors.roseDim : colors.surface2,
                      borderWidth: isSelected ? 1.5 : 1,
                      borderColor: isSelected ? colors.rose : colors.line,
                    }}
                  >
                    <Text style={{ fontSize: 22, opacity: loggingMood && !isSelected ? 0.4 : 1 }}>{emoji}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </FadeSlide>

        {/* ── [7] PARTNER ACTIVITY ── */}
        {partnerActivity.length > 0 && (
          <FadeSlide delay={260}>
            <View style={{ paddingHorizontal: 24, marginBottom: 24 }}>
              {partnerActivity.slice(0, 2).map((act, i) => (
                <Text key={i} style={{ fontSize: 13, fontStyle: 'italic', color: colors.muted, lineHeight: 20, marginBottom: 2 }}>
                  <Text style={{ fontWeight: '600', color: colors.textSec }}>{partnerName}</Text>
                  {' '}{act.text} · {daysAgo(act.time)}
                </Text>
              ))}
            </View>
          </FadeSlide>
        )}

        {/* ── Context / occasion banner ── */}
        {contextBanner && (
          <FadeSlide delay={270}>
            <View style={{
              marginHorizontal: 24, marginBottom: 20,
              borderRadius: 20, padding: 16,
              backgroundColor: contextBanner.bg,
              flexDirection: 'row', alignItems: 'center', gap: 12,
            }}>
              <Text style={{ fontSize: 22 }}>{contextBanner.emoji}</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: contextBanner.color, flex: 1 }}>{contextBanner.text}</Text>
            </View>
          </FadeSlide>
        )}

        {/* ── [8] UPCOMING EVENT ── */}
        {todayEvts.length > 0 && (
          <FadeSlide delay={280}>
            <View style={{ paddingHorizontal: 24, marginBottom: 24 }}>
              <Eyebrow>Today</Eyebrow>
              {todayEvts.map(evt => {
                const isMe = evt.owner_id === user?.user_id;
                const dotColor = evt.color ?? (isMe ? colors.rose : colors.gold);
                return (
                  <Press key={evt.id} haptic="light" onPress={() => router.push('/(app)/calendar')}>
                    <View style={{
                      flexDirection: 'row', alignItems: 'center', gap: 14,
                      backgroundColor: colors.surface,
                      borderRadius: 20, padding: 16, marginBottom: 8,
                      borderWidth: 1, borderColor: colors.line,
                      borderLeftWidth: 3, borderLeftColor: dotColor,
                    }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 3 }}>
                          {new Date(evt.start_dt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </Text>
                        <Text style={{ fontSize: 15, fontWeight: '500', color: colors.text }}>
                          {(!isMe && evt.visibility === 'private') ? 'Busy' : evt.title}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 11, color: colors.muted }}>{isMe ? 'You' : partnerName}</Text>
                    </View>
                  </Press>
                );
              })}
            </View>
          </FadeSlide>
        )}

        {/* ── Open assigned tasks ── */}
        {openTasks.length > 0 && (
          <FadeSlide delay={285}>
            <View style={{ paddingHorizontal: 24, marginBottom: 24 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <Eyebrow>Your Tasks</Eyebrow>
                <Press haptic="light" onPress={() => router.push('/(app)/todo' as any)}>
                  <Text style={{ fontSize: 12, color: colors.rose }}>See all</Text>
                </Press>
              </View>
              {openTasks.map(task => (
                <Press key={task.id} haptic="light" onPress={() => router.push('/(app)/todo' as any)}>
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    backgroundColor: colors.surface, borderRadius: 16,
                    padding: 14, marginBottom: 8,
                    borderWidth: 1, borderColor: colors.line,
                  }}>
                    <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: colors.muted }} />
                    <Text style={{ flex: 1, fontSize: 14, color: colors.text }} numberOfLines={1}>{task.title}</Text>
                  </View>
                </Press>
              ))}
            </View>
          </FadeSlide>
        )}

        {/* ── [9] SHARED JOURNEYS — journal + memories ── */}
        <FadeSlide delay={300}>
          <View style={{ paddingHorizontal: 24, marginBottom: 24, flexDirection: 'row', gap: 12 }}>
            {/* Journal card */}
            <Press haptic="light" onPress={() => router.push('/(app)/our-journal' as any)} style={{ flex: 1 }}>
              <View style={{
                height: 160, borderRadius: 28,
                backgroundColor: colors.surface2,
                borderWidth: 1, borderColor: colors.line,
                justifyContent: 'flex-end', padding: 20,
                overflow: 'hidden',
              }}>
                <LinearGradient
                  colors={[colors.surface2, colors.surface3]}
                  style={StyleSheet.absoluteFill}
                />
                <Eyebrow>Journal</Eyebrow>
                <Text style={{ fontSize: 16, fontWeight: '300', fontStyle: 'italic', color: colors.text }}>Our Journal</Text>
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 3 }}>Write together</Text>
              </View>
            </Press>
            {/* Memories card */}
            <Press haptic="light" onPress={() => router.push('/(app)/memories')} style={{ flex: 1 }}>
              <View style={{
                height: 160, borderRadius: 28,
                backgroundColor: colors.surface3,
                borderWidth: 1, borderColor: colors.line,
                justifyContent: 'flex-end', padding: 20,
                overflow: 'hidden',
              }}>
                <LinearGradient
                  colors={[colors.surface3, colors.surface2]}
                  style={StyleSheet.absoluteFill}
                />
                <Eyebrow>Memories</Eyebrow>
                <Text style={{ fontSize: 16, fontWeight: '300', fontStyle: 'italic', color: colors.text }}>Memories</Text>
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 3 }}>Add a moment</Text>
              </View>
            </Press>
          </View>
        </FadeSlide>

        {/* ── Shared goals ── */}
        {!loading && topGoals.length > 0 && (
          <FadeSlide delay={320}>
            <View style={{ paddingHorizontal: 24, marginBottom: 24 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Eyebrow>Growing Together</Eyebrow>
                <Press haptic="light" onPress={() => router.push('/(app)/goals')}>
                  <Text style={{ fontSize: 12, color: colors.rose }}>See all</Text>
                </Press>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {topGoals.map(g => {
                  const pct = g.target_value ? Math.min(1, g.current_value / g.target_value) : 0;
                  return (
                    <Press key={g.id} haptic="light" onPress={() => router.push('/(app)/goals')} style={{ flex: 1 }}>
                      <View style={{
                        backgroundColor: colors.surface, borderRadius: 20,
                        padding: 16, borderWidth: 1, borderColor: colors.line, gap: 8,
                      }}>
                        <Text style={{ fontSize: 22 }}>{GOAL_ICONS[g.category] ?? '🎯'}</Text>
                        <Text style={{ fontSize: 13, fontWeight: '500', color: colors.text, lineHeight: 18 }} numberOfLines={2}>{g.title}</Text>
                        <View style={{ height: 2, backgroundColor: colors.surface3, borderRadius: 1, overflow: 'hidden' }}>
                          <View style={{ height: 2, backgroundColor: colors.rose, borderRadius: 1, width: `${Math.round(pct * 100)}%` as any }} />
                        </View>
                        <Text style={{ fontSize: 10, color: colors.muted }}>{Math.round(pct * 100)}%</Text>
                      </View>
                    </Press>
                  );
                })}
              </View>
            </View>
          </FadeSlide>
        )}

        {/* ── [10] FESTIVAL / OCCASION banner ── */}
        {festival && (
          <FadeSlide delay={340}>
            <View style={{ marginHorizontal: 24, marginBottom: 24 }}>
              <View style={{
                borderRadius: 28, padding: 20,
                backgroundColor: colors.roseDim,
                flexDirection: 'row', alignItems: 'center', gap: 14,
              }}>
                <Text style={{ fontSize: 28 }}>{festival.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.rose }}>{festival.name}</Text>
                  <Text style={{ fontSize: 12, color: colors.textSec, marginTop: 3 }}>{festival.personalGreeting}</Text>
                </View>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.rose }}>
                  {festival.daysAway === 0 ? 'Today' : festival.daysAway === 1 ? 'Tomorrow' : `${festival.daysAway}d`}
                </Text>
              </View>
            </View>
          </FadeSlide>
        )}

        {/* ── Weekly letter from Aria ── */}
        {weeklyLetter && !letterDismissed && (
          <FadeSlide delay={360}>
            <View style={{ marginHorizontal: 24, marginBottom: 24, borderRadius: 28, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, padding: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Eyebrow>Weekly Letter from Aria</Eyebrow>
                  <Text style={{ fontSize: 14, color: colors.textSec, lineHeight: 22, fontStyle: 'italic', marginTop: 6 }} numberOfLines={letterExpanded ? undefined : 3}>
                    {weeklyLetter.summary}
                  </Text>
                  {!letterExpanded && (
                    <Pressable onPress={() => setLetterExpanded(true)} style={{ marginTop: 8 }}>
                      <Text style={{ fontSize: 13, color: colors.rose }}>Read more</Text>
                    </Pressable>
                  )}
                </View>
                <Pressable onPress={dismissLetter} hitSlop={10} style={{ marginLeft: 8, padding: 4 }}>
                  <Text style={{ fontSize: 14, color: colors.muted }}>✕</Text>
                </Pressable>
              </View>
            </View>
          </FadeSlide>
        )}

      </ScrollView>

      {/* Write a love note modal */}
      <Modal visible={showNoteModal} transparent animationType="fade" onRequestClose={() => setShowNoteModal(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }} onPress={() => setShowNoteModal(false)}>
          <Pressable style={{ backgroundColor: colors.surface, borderRadius: 32, padding: 24, borderWidth: 1, borderColor: colors.line }} onPress={() => {}}>
            <Text style={{ fontSize: 18, fontWeight: '300', fontStyle: 'italic', color: colors.text, marginBottom: 4 }}>Write a love note</Text>
            <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 16 }}>It'll appear on both your home screens.</Text>
            <TextInput
              style={{ backgroundColor: colors.surface2, borderRadius: 16, minHeight: 100, padding: 16, color: colors.text, fontSize: 15, borderWidth: 1, borderColor: colors.line, textAlignVertical: 'top' }}
              value={noteText} onChangeText={setNoteText} multiline autoFocus
              placeholder="Something you want them to remember…" placeholderTextColor={colors.muted}
            />
            <Pressable
              style={{ backgroundColor: colors.text, borderRadius: 20, height: 50, alignItems: 'center', justifyContent: 'center', marginTop: 16, opacity: savingNote || !noteText.trim() ? 0.5 : 1 }}
              onPress={saveNote} disabled={savingNote || !noteText.trim()}
             
            >
              <Text style={{ color: colors.bg, fontSize: 15, fontWeight: '600' }}>{savingNote ? 'Saving…' : 'Save note'}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Floating heart button */}
      <Pressable
        onPress={sendThinkingOfYou}
        disabled={sendingThinking}
       
        style={{
          position: 'absolute',
          bottom: TAB_BAR_HEIGHT + 12,
          right: 24,
          backgroundColor: colors.rose,
          width: 52,
          height: 52,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          elevation: 4,
          shadowColor: colors.rose,
          shadowOpacity: 0.25,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
          opacity: sendingThinking ? 0.6 : 1,
        }}
      >
        {sendingThinking ? (
          <ActivityIndicator size="small" color={colors.bg} />
        ) : (
          <Ionicons name="heart" size={24} color={colors.bg} />
        )}
      </Pressable>
    </SafeAreaView>
  );
}
