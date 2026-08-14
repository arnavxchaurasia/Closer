/**
 * Heartbeat — tap a rhythm, your partner feels it 💓
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/src/api';
import { NotConnected } from '@/src/components/NotConnected';
import { useCouple } from '@/src/context/CoupleContext';
import { useTheme } from '@/src/context/ThemeContext';
import { haptics } from '@/src/haptics';

const RIPPLE_COUNT = 3;

function useRipples() {
  const ripples = useRef(
    Array.from({ length: RIPPLE_COUNT }, () => ({
      scale: new Animated.Value(1),
      opacity: new Animated.Value(0),
    }))
  ).current;
  const idx = useRef(0);

  const fire = () => {
    const r = ripples[idx.current % RIPPLE_COUNT];
    idx.current += 1;
    r.scale.setValue(1);
    r.opacity.setValue(0.5);
    Animated.parallel([
      Animated.timing(r.scale, { toValue: 2.6, duration: 700, useNativeDriver: true }),
      Animated.timing(r.opacity, { toValue: 0, duration: 700, useNativeDriver: true }),
    ]).start();
  };

  return { ripples, fire };
}

export default function HeartbeatScreen() {
  const { colors } = useTheme();
  const { isPaired, isLoading: coupleLoading } = useCouple();
  const heartScale = useRef(new Animated.Value(1)).current;
  const { ripples, fire: fireRipple } = useRipples();
  const [partnerActive, setPartnerActive] = useState(false);
  const [partnerTapping, setPartnerTapping] = useState(false);
  const partnerActiveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const partnerTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pulseHeart = () => {
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1.25, useNativeDriver: true, damping: 6, stiffness: 300 }),
      Animated.spring(heartScale, { toValue: 1, useNativeDriver: true, damping: 10, stiffness: 200 }),
    ]).start();
  };

  const sendTap = async () => {
    haptics.heavy();
    pulseHeart();
    fireRipple();
    try { await api.post('/api/heartbeat/tap', {}); } catch {}
  };

  // Poll for partner's taps
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const { taps } = await api.get<{ taps: { tapped_at: string }[] }>('/api/heartbeat/poll');
        if (taps && taps.length > 0) {
          // Partner is active
          setPartnerActive(true);
          if (partnerActiveTimer.current) clearTimeout(partnerActiveTimer.current);
          partnerActiveTimer.current = setTimeout(() => setPartnerActive(false), 5000);

          // Show "tapping back" state briefly
          setPartnerTapping(true);
          if (partnerTapTimer.current) clearTimeout(partnerTapTimer.current);
          partnerTapTimer.current = setTimeout(() => setPartnerTapping(false), 2000);

          taps.forEach((_: any, i: number) => {
            setTimeout(() => {
              haptics.heavy();
              pulseHeart();
              fireRipple();
            }, i * 150);
          });
        }
      } catch {}
    }, 500);
    return () => {
      clearInterval(interval);
      if (partnerActiveTimer.current) clearTimeout(partnerActiveTimer.current);
      if (partnerTapTimer.current) clearTimeout(partnerTapTimer.current);
    };
  }, []);

  const subtitle = partnerTapping
    ? "They're tapping back! 💓"
    : partnerActive
    ? 'They feel you 💕'
    : 'Hold me';

  if (coupleLoading || !isPaired) return (
    <View style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {!coupleLoading && <NotConnected />}
      </SafeAreaView>
    </View>
  );

  return (
    <View style={[s.container, { backgroundColor: '#0A0A0A' }]}>
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        {/* Back */}
        <Pressable onPress={() => router.back()} style={s.back} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>

        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>Heartbeat 💓</Text>
          <Text style={s.tagline}>Your touch, their feel</Text>
        </View>

        {/* Heart canvas */}
        <View style={s.canvas}>
          {/* Ripple rings */}
          {ripples.map((r, i) => (
            <Animated.View
              key={i}
              pointerEvents="none"
              style={[
                s.ripple,
                { borderColor: colors.rose, transform: [{ scale: r.scale }], opacity: r.opacity },
              ]}
            />
          ))}

          {/* Heart */}
          <Pressable onPress={sendTap} style={s.heartBtn}>
            <Animated.Text style={[s.heart, { transform: [{ scale: heartScale }] }]}>
              💗
            </Animated.Text>
          </Pressable>
        </View>

        {/* Status */}
        <View style={s.statusWrap}>
          <Text style={[s.subtitle, { color: partnerActive ? colors.rose : 'rgba(255,255,255,0.45)' }]}>
            {subtitle}
          </Text>
          {partnerActive && (
            <View style={[s.activeDot, { backgroundColor: colors.rose }]} />
          )}
        </View>

        <Text style={s.hint}>Tap the heart to send your rhythm</Text>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  back: { position: 'absolute', top: 56, left: 20, zIndex: 10, padding: 8 },
  header: { alignItems: 'center', marginTop: 80, marginBottom: 0 },
  title: { fontSize: 26, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  tagline: { fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 6, letterSpacing: 0.5 },
  canvas: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ripple: {
    position: 'absolute',
    width: 140, height: 140, borderRadius: 70,
    borderWidth: 2,
  },
  heartBtn: { padding: 16 },
  heart: { fontSize: 110, lineHeight: 130 },
  statusWrap: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 12 },
  subtitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  activeDot: { width: 8, height: 8, borderRadius: 4 },
  hint: { fontSize: 12, color: 'rgba(255,255,255,0.25)', textAlign: 'center', marginBottom: 32, letterSpacing: 0.3 },
});
