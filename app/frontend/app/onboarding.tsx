import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, Dimensions, Easing, Image,
  Pressable, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Press } from '@/src/components/Press';
import { useTheme } from '@/src/context/ThemeContext';
import { haptics } from '@/src/haptics';

const { width: W } = Dimensions.get('window');

const SLIDES = [
  {
    id: '1',
    title: 'Deeper',
    highlight: 'Connection.',
    highlightColor: '#4F46E5',
    subtitle: 'A digital sanctuary designed to help you and your partner grow closer through shared moments.',
    image: 'https://storage.googleapis.com/uxpilot-auth.appspot.com/gen_2efe58967f_0d7f7881a523b2f5.png',
    badgeIcon: 'heart' as const,
    badgeTag: 'DAILY TASK',
    badgeText: `"What's one thing you appreciate about them today?"`,
    bg: '#F0EFFF',
    bgGrad: ['rgba(99,102,241,0.08)', 'transparent'] as [string, string],
    dotActiveColor: '#4F46E5',
  },
  {
    id: '2',
    title: 'Capture',
    highlight: 'Memories.',
    highlightColor: '#F43F5E',
    subtitle: 'Build a private journal of your journey. Every photo and note is safely tucked away in your vault.',
    image: 'https://storage.googleapis.com/uxpilot-auth.appspot.com/gen_2efe58967f_998476bc44d31c95.png',
    subImage: 'https://storage.googleapis.com/uxpilot-auth.appspot.com/gen_22961421f2_e38dc6fb99d91eae.png',
    badgeIcon: 'lock-closed' as const,
    badgeTag: 'ENCRYPTED VAULT',
    badgeText: 'Your memories are safe & private',
    bg: '#FFF0F2',
    bgGrad: ['rgba(244,63,94,0.08)', 'transparent'] as [string, string],
    dotActiveColor: '#F43F5E',
  },
  {
    id: '3',
    title: 'Stay in',
    highlight: 'Sync.',
    highlightColor: '#4F46E5',
    subtitle: "Experience your partner's presence in real-time. Feel their pulse, breathe together, and stay connected.",
    image: 'https://storage.googleapis.com/uxpilot-auth.appspot.com/gen_048672d085_e74c5f697ba4aa01.png',
    badgeIcon: 'flash' as const,
    badgeTag: 'REAL-TIME',
    badgeText: 'Partner is Active · SYNCED ⚡',
    bg: '#FFFFFF',
    bgGrad: ['rgba(99,102,241,0.06)', 'transparent'] as [string, string],
    dotActiveColor: '#4F46E5',
  },
];

export default function OnboardingScreen() {
  const { colors } = useTheme();
  const [index, setIndex] = useState(0);

  // UXPilot bounce-slow continuous animation (4s ease-in-out loop: 0 -> -10 -> 0)
  const floatAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -10,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  // Slide transition animation
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const nextSlide = () => {
    haptics.medium();
    if (index < SLIDES.length - 1) {
      Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
        setIndex(i => i + 1);
        slideAnim.setValue(20);
        Animated.parallel([
          Animated.timing(fadeAnim, { toValue: 1, duration: 240, useNativeDriver: true }),
          Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 16, stiffness: 140 }),
        ]).start();
      });
    } else {
      router.replace('/(auth)');
    }
  };

  const skip = () => {
    haptics.light();
    router.replace('/(auth)');
  };

  const slide = SLIDES[index];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: slide.bg }]} edges={['top', 'bottom']}>
      {/* Background Gradient */}
      <View style={styles.bgGradientContainer}>
        <LinearGradient
          colors={slide.bgGrad}
          style={styles.bgGradient}
        />
      </View>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <Image
            source={require('@/assets/images/logo.png')}
            style={{ width: 28, height: 28, borderRadius: 8 }}
            resizeMode="contain"
          />
          <Text style={styles.logoText}>ourspace</Text>
        </View>
        <Pressable onPress={skip} hitSlop={12}>
          <Text style={styles.skipBtn}>SKIP</Text>
        </Pressable>
      </View>

      {/* Hero Section */}
      <View style={styles.content}>
        <Animated.View style={[styles.heroWrap, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          {/* Main Editorial Image Card */}
          <View style={[styles.imageCard, index === 1 && { transform: [{ rotate: '-2deg' }] }]}>
            <Image
              source={{ uri: slide.image }}
              style={styles.image}
              resizeMode="cover"
            />
          </View>

          {/* Secondary Overlapping Memory Card for Slide 2 */}
          {slide.subImage ? (
            <View style={styles.subImageCard}>
              <Image
                source={{ uri: slide.subImage }}
                style={styles.image}
                resizeMode="cover"
              />
            </View>
          ) : null}

          {/* Floating UXPilot Bounce-Slow Card */}
          <Animated.View
            style={[
              styles.floatCard,
              index === 1 && { top: -14, right: -10, bottom: undefined },
              { transform: [{ translateY: floatAnim }] },
            ]}
          >
            <View style={styles.floatRow}>
              <View style={styles.badgeCircle}>
                <Ionicons name={slide.badgeIcon as any} size={14} color="#F43F5E" />
              </View>
              <Text style={styles.badgeTag}>{slide.badgeTag}</Text>
            </View>
            <Text style={styles.badgeText}>{slide.badgeText}</Text>
          </Animated.View>
        </Animated.View>

        {/* Content Details */}
        <Animated.View style={[styles.textWrap, { opacity: fadeAnim }]}>
          <Text style={styles.title}>
            {slide.title} {'\n'}
            <Text style={[styles.titleHighlight, { color: slide.highlightColor }]}>{slide.highlight}</Text>
          </Text>
          <Text style={styles.subtitle}>{slide.subtitle}</Text>
        </Animated.View>
      </View>

      {/* Footer Navigation */}
      <View style={[styles.footer, index === 2 && { flexDirection: 'column', gap: 20 }]}>
        {/* Step Indicator Dots */}
        <View style={[styles.indicatorRow, index === 2 && { justifyContent: 'center', width: '100%' }]}>
          {SLIDES.map((s, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === index
                  ? [styles.dotActive, { backgroundColor: slide.dotActiveColor }]
                  : styles.dotInactive,
              ]}
            />
          ))}
        </View>

        {index === 2 ? (
          <Press haptic="medium" onPress={() => router.replace('/(auth)/pair')} style={{ width: '100%' }}>
            <View style={styles.fullWidthBtn}>
              <Text style={styles.fullWidthBtnText}>Get Started</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </View>
          </Press>
        ) : (
          <Press haptic="medium" onPress={nextSlide}>
            <View style={styles.nextBtn}>
              <Ionicons name="arrow-forward" size={22} color="#FFFFFF" />
            </View>
          </Press>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  bgGradientContainer: { position: 'absolute', top: -40, left: 0, right: 0, height: 300 },
  bgGradient: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingVertical: 16,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoText: { fontSize: 16, fontWeight: '900', color: '#1E1B4B', letterSpacing: -0.5 },
  skipBtn: { fontSize: 12, fontWeight: '800', color: '#94A3B8', letterSpacing: 1.5 },

  content: { flex: 1, paddingHorizontal: 28, justifyContent: 'space-between', paddingTop: 10 },

  heroWrap: { position: 'relative', width: '100%', alignItems: 'center' },
  imageCard: {
    width: '100%',
    height: W * 0.85,
    maxHeight: 340,
    borderRadius: 36,
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    shadowColor: '#6366F1',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  subImageCard: {
    position: 'absolute',
    bottom: -30,
    left: -14,
    width: 140,
    height: 140,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    transform: [{ rotate: '6deg' }],
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 7,
  },
  image: { width: '100%', height: '100%' },

  // UXPilot Floating Card
  floatCard: {
    position: 'absolute',
    bottom: -20,
    right: -10,
    width: 210,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  floatRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  badgeCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFE4E6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeTag: { fontSize: 10, fontWeight: '800', color: '#94A3B8', letterSpacing: 1 },
  badgeText: { fontSize: 12, fontWeight: '800', color: '#1E1B4B', lineHeight: 16 },

  textWrap: { marginTop: 36, marginBottom: 24 },
  title: { fontSize: 38, fontWeight: '900', color: '#1E1B4B', letterSpacing: -1.2, lineHeight: 42 },
  titleHighlight: { color: '#4F46E5' },
  subtitle: { fontSize: 15, fontWeight: '500', color: '#64748B', lineHeight: 22, marginTop: 10, maxWidth: 280 },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingBottom: 24,
  },
  indicatorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { height: 6, borderRadius: 3 },
  dotActive: { width: 36, backgroundColor: '#4F46E5' },
  dotInactive: { width: 6, backgroundColor: '#E2E8F0' },

  nextBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1E1B4B',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6366F1',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  fullWidthBtn: {
    width: '100%',
    height: 58,
    borderRadius: 32,
    backgroundColor: '#1E1B4B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#6366F1',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  fullWidthBtnText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
});
