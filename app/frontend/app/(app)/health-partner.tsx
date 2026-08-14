import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/src/api';
import { Press } from '@/src/components/Press';
import { useCouple } from '@/src/context/CoupleContext';
import { useTheme } from '@/src/context/ThemeContext';
import { useNicknames } from '@/src/hooks/useNicknames';
import { useAuth } from '@/src/context/AuthContext';
import { Colors, radius, space } from '@/src/theme';

type PartnerPhase = {
  phase: string;
  day: number;
  cycle_length: number;
  days_until_next: number;
  emoji: string;
  label: string;
  tip: string;
};

const CARE_TIPS: Record<string, { emoji: string; text: string }[]> = {
  menstrual: [
    { emoji: '🍫', text: 'Bring them comfort food' },
    { emoji: '🛋️', text: "Don't plan anything demanding" },
    { emoji: '🎙️', text: 'Send a warm voice note' },
    { emoji: '💛', text: 'Extra patience today' },
  ],
  pms: [
    { emoji: '📋', text: 'Check their care profile' },
    { emoji: '🌿', text: 'Low-key plans only' },
    { emoji: '🫂', text: 'Extra reassurance goes far' },
    { emoji: '🧘', text: "Don't take moodiness personally" },
  ],
  ovulation: [
    { emoji: '🌹', text: 'Great time for a date!' },
    { emoji: '🎉', text: "They're feeling social" },
    { emoji: '✨', text: 'Plan something fun' },
    { emoji: '⚡', text: 'Energy is high — go for it' },
  ],
  follicular: [
    { emoji: '🌱', text: 'Energy is picking up — make plans' },
    { emoji: '💬', text: "Good time for deeper conversations" },
    { emoji: '🏃', text: 'Suggest an active date' },
    { emoji: '😊', text: "They're feeling optimistic" },
  ],
  luteal: [
    { emoji: '🌙', text: 'Keep things calm and cozy' },
    { emoji: '🫶', text: 'Check in a little more often' },
    { emoji: '🍵', text: 'Tea and a movie night hits right' },
    { emoji: '🤍', text: 'Small gestures mean a lot now' },
  ],
};

const PHASE_GRADIENTS: Record<string, [string, string]> = {
  menstrual:  ['#C94B7A', '#8B2A5A'],
  pms:        ['#7B4BAA', '#4A2A7A'],
  ovulation:  ['#2A9D8F', '#1A6B60'],
  follicular: ['#4B7BF5', '#2A4BA8'],
  luteal:     ['#E8A030', '#B06020'],
  unknown:    ['#6B7280', '#4B5563'],
};

function FadeSlide({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 380, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 380, delay, useNativeDriver: true }),
    ]).start();
  }, []);
  return <Animated.View style={{ opacity, transform: [{ translateY }] }}>{children}</Animated.View>;
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.md },
    headerTitle: { flex: 1, fontSize: 20, fontWeight: '800', color: c.text },
    backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
    content: { paddingHorizontal: space.lg, paddingBottom: 100 },
    // Hero
    heroCard: { borderRadius: 24, overflow: 'hidden', marginBottom: space.lg },
    heroGrad: { padding: space.xl, paddingBottom: space.lg },
    heroEmoji: { fontSize: 56, textAlign: 'center', marginBottom: space.sm },
    heroLabel: { fontSize: 22, fontWeight: '900', color: '#fff', textAlign: 'center', letterSpacing: -0.4 },
    heroTip: { fontSize: 14, color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginTop: 8, lineHeight: 20 },
    heroDays: { marginTop: space.lg, flexDirection: 'row', justifyContent: 'center', gap: space.lg },
    heroStat: { alignItems: 'center', gap: 4 },
    heroStatNum: { fontSize: 28, fontWeight: '900', color: '#fff' },
    heroStatLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
    heroDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'stretch' },
    // Tips section
    sectionLabel: { fontSize: 11, fontWeight: '800', color: c.muted, letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: space.md },
    tipCard: { backgroundColor: c.surface, borderRadius: radius.lg, padding: space.md, marginBottom: space.sm, borderWidth: 1, borderColor: c.line, flexDirection: 'row', alignItems: 'center', gap: space.md },
    tipEmoji: { fontSize: 24, width: 36, textAlign: 'center' },
    tipText: { fontSize: 15, color: c.text, fontWeight: '500', flex: 1, lineHeight: 20 },
    // Care button
    careBtn: { backgroundColor: c.surface, borderRadius: radius.lg, padding: space.md, borderWidth: 1.5, borderColor: c.green, flexDirection: 'row', alignItems: 'center', marginBottom: space.lg, gap: space.md },
    careBtnTxt: { flex: 1, fontSize: 15, fontWeight: '700', color: c.green },
    // Unknown state
    unknownCard: { backgroundColor: c.surface, borderRadius: 24, padding: space.xl, alignItems: 'center', borderWidth: 1, borderColor: c.line, gap: space.md },
    unknownEmoji: { fontSize: 56 },
    unknownTitle: { fontSize: 18, fontWeight: '800', color: c.text, textAlign: 'center' },
    unknownSub: { fontSize: 14, color: c.textSec, textAlign: 'center', lineHeight: 20 },
  });
}

export default function HealthPartnerScreen() {
  const { colors, isDark } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useAuth();
  const { partner } = useCouple();
  const { partnerNickname } = useNicknames(user?.name, partner?.name);

  const [phase, setPhase] = useState<PartnerPhase | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<PartnerPhase>('/api/health/partner-phase')
      .then(d => setPhase(d))
      .catch(() => setPhase(null))
      .finally(() => setLoading(false));
  }, []);

  const partnerFirstName = partnerNickname || partner?.name?.split(' ')[0] || 'Partner';
  const phaseKey = phase?.phase ?? 'unknown';
  const gradColors = PHASE_GRADIENTS[phaseKey] ?? PHASE_GRADIENTS.unknown;
  const tips = CARE_TIPS[phaseKey] ?? [];
  const isUnknown = phaseKey === 'unknown' || !phase;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <FadeSlide delay={0}>
        <View style={s.header}>
          <Press haptic="light" onPress={() => router.back()}>
            <View style={s.backBtn}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </View>
          </Press>
          <Text style={s.headerTitle}>{partnerFirstName}'s Energy 💚</Text>
        </View>
      </FadeSlide>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
        {loading ? null : isUnknown ? (
          <FadeSlide delay={60}>
            <View style={s.unknownCard}>
              <Text style={s.unknownEmoji}>❓</Text>
              <Text style={s.unknownTitle}>Tracking not started</Text>
              <Text style={s.unknownSub}>
                {partnerFirstName} hasn't started tracking yet. Share the app with them!
              </Text>
            </View>
          </FadeSlide>
        ) : (
          <>
            {/* Hero phase card */}
            <FadeSlide delay={60}>
              <View style={s.heroCard}>
                <LinearGradient colors={gradColors as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.heroGrad}>
                  <Text style={s.heroEmoji}>{phase!.emoji}</Text>
                  <Text style={s.heroLabel}>{phase!.label}</Text>
                  <Text style={s.heroTip}>{phase!.tip}</Text>
                  <View style={s.heroDays}>
                    <View style={s.heroStat}>
                      <Text style={s.heroStatNum}>{phase!.day}</Text>
                      <Text style={s.heroStatLabel}>Day of cycle</Text>
                    </View>
                    <View style={s.heroDivider} />
                    <View style={s.heroStat}>
                      <Text style={s.heroStatNum}>{phase!.days_until_next}</Text>
                      <Text style={s.heroStatLabel}>Days until next phase</Text>
                    </View>
                    <View style={s.heroDivider} />
                    <View style={s.heroStat}>
                      <Text style={s.heroStatNum}>{phase!.cycle_length}</Text>
                      <Text style={s.heroStatLabel}>Cycle length</Text>
                    </View>
                  </View>
                </LinearGradient>
              </View>
            </FadeSlide>

            {/* Care tips */}
            {tips.length > 0 && (
              <FadeSlide delay={120}>
                <Text style={s.sectionLabel}>How to show up today</Text>
                {tips.map((tip, i) => (
                  <View key={i} style={s.tipCard}>
                    <Text style={s.tipEmoji}>{tip.emoji}</Text>
                    <Text style={s.tipText}>{tip.text}</Text>
                  </View>
                ))}
              </FadeSlide>
            )}

            {/* View care profile */}
            <FadeSlide delay={180}>
              <Press haptic="light" onPress={() => router.push('/(app)/couple-profile')}>
                <View style={s.careBtn}>
                  <Text style={{ fontSize: 20 }}>💚</Text>
                  <Text style={s.careBtnTxt}>View their Care Profile →</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.green} />
                </View>
              </Press>
            </FadeSlide>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
