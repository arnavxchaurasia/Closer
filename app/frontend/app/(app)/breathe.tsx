/**
 * Breathing Sync — breathe together in real time, no backend needed 🌬️
 * Both partners follow the same UTC-clock-synced breath cycle.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NotConnected } from '@/src/components/NotConnected';
import { useCouple } from '@/src/context/CoupleContext';
import { useTheme } from '@/src/context/ThemeContext';
import { space } from '@/src/theme';

const PHASES = [
  { label: 'Breathe in',  duration: 4, targetScale: 1.45, color: '#7C3AED' },
  { label: 'Hold',        duration: 4, targetScale: 1.45, color: '#A855F7' },
  { label: 'Breathe out', duration: 4, targetScale: 0.75, color: '#6D28D9' },
  { label: 'Rest',        duration: 4, targetScale: 0.75, color: '#4C1D95' },
];

const CYCLE = 16; // total seconds

function getPhaseIndex(): number {
  const sec = Math.floor(Date.now() / 1000);
  const pos = sec % CYCLE;
  if (pos < 4) return 0;
  if (pos < 8) return 1;
  if (pos < 12) return 2;
  return 3;
}

function getPhaseProgress(): number {
  const ms = Date.now();
  const sec = ms / 1000;
  const pos = sec % CYCLE;
  if (pos < 4) return pos / 4;
  if (pos < 8) return (pos - 4) / 4;
  if (pos < 12) return (pos - 8) / 4;
  return (pos - 12) / 4;
}

export default function BreatheScreen() {
  const { colors } = useTheme();
  const { isPaired, isLoading: coupleLoading } = useCouple();
  const circleScale = useRef(new Animated.Value(1)).current;
  const circleColor = useRef(new Animated.Value(0)).current;
  const [phaseIdx, setPhaseIdx] = useState(getPhaseIndex());
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  const runPhase = (idx: number, progress: number) => {
    const phase = PHASES[idx];
    const remaining = phase.duration * (1 - progress) * 1000;

    if (animRef.current) animRef.current.stop();
    animRef.current = Animated.timing(circleScale, {
      toValue: phase.targetScale,
      duration: remaining,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    });
    animRef.current.start(({ finished }) => {
      if (finished) {
        const next = (idx + 1) % PHASES.length;
        setPhaseIdx(next);
        runPhase(next, 0);
      }
    });
  };

  useEffect(() => {
    const idx = getPhaseIndex();
    const prog = getPhaseProgress();
    // Snap scale to current phase position instantly
    circleScale.setValue(
      PHASES[idx].targetScale * prog +
      (PHASES[(idx + PHASES.length - 1) % PHASES.length].targetScale) * (1 - prog)
    );
    runPhase(idx, prog);
    return () => { if (animRef.current) animRef.current.stop(); };
  }, []);

  const phase = PHASES[phaseIdx];

  // Pulsing glow opacity
  const glowAnim = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 0.6, duration: 2000, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.3, duration: 2000, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  if (coupleLoading || !isPaired) return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {!coupleLoading && <NotConnected />}
      </SafeAreaView>
    </View>
  );

  return (
    <View style={[s.container, { backgroundColor: colors.bg }]}>
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <Pressable onPress={() => router.back()} style={s.back} hitSlop={8} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>

        <View style={s.header}>
          <Text style={s.title}>Breathe Together 🌬️</Text>
          <Text style={s.subtitle}>Your partner is breathing with you right now</Text>
        </View>

        <View style={s.canvas}>
          {/* Glow halo */}
          <Animated.View
            pointerEvents="none"
            style={[
              s.glow,
              { backgroundColor: phase.color, opacity: glowAnim },
            ]}
          />

          {/* Main circle */}
          <Animated.View
            style={[
              s.circle,
              { backgroundColor: phase.color, transform: [{ scale: circleScale }] },
            ]}
          />
        </View>

        <View style={s.phaseWrap}>
          <Text style={s.phaseLabel}>{phase.label}</Text>
          <Text style={s.phaseHint}>
            {phase.label === 'Breathe in' ? 'Expand your belly' :
             phase.label === 'Hold' ? 'Keep still' :
             phase.label === 'Breathe out' ? 'Release slowly' :
             'Let your mind settle'}
          </Text>
        </View>

        {/* Phase indicators */}
        <View style={s.dots}>
          {PHASES.map((p, i) => (
            <View
              key={i}
              style={[
                s.dot,
                { backgroundColor: i === phaseIdx ? '#fff' : 'rgba(255,255,255,0.25)' },
              ]}
            />
          ))}
        </View>

        <Text style={s.syncNote}>Synced to UTC clock — no server needed</Text>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  back: { position: 'absolute', top: 56, left: 20, zIndex: 10, padding: 8 },
  header: { alignItems: 'center', marginTop: 80 },
  title: { fontSize: 24, fontWeight: '900', color: '#fff', letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 6, textAlign: 'center', paddingHorizontal: space.xl },
  canvas: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  glow: {
    position: 'absolute',
    width: 260, height: 260, borderRadius: 130,
    transform: [{ scale: 1.6 }],
  },
  circle: { width: 160, height: 160, borderRadius: 80 },
  phaseWrap: { alignItems: 'center', marginBottom: space.lg },
  phaseLabel: { fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  phaseHint: { fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 6 },
  dots: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: space.md },
  dot: { width: 8, height: 8, borderRadius: 4 },
  syncNote: { fontSize: 11, color: 'rgba(255,255,255,0.2)', textAlign: 'center', marginBottom: 32 },
});
