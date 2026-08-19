import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import {
  Animated, Dimensions, Easing, StyleSheet, Text, View,
} from 'react-native';

const { width: W } = Dimensions.get('window');

export function LaunchScreen() {
  // Floating logo
  const floatAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: -14, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Pulsing glow behind logo
  const glowPulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glowPulse, { toValue: 0.5, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Loading bar shimmer
  const shimmer = useRef(new Animated.Value(-50)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(shimmer, { toValue: 50, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true })
    ).start();
  }, []);

  return (
    <View style={styles.container}>
      {/* Radial background glow */}
      <Animated.View style={[styles.glowCenter, { opacity: glowPulse }]} />

      {/* Central content */}
      <View style={styles.center}>
        {/* Logo */}
        <Animated.View style={[styles.logoWrap, { transform: [{ translateY: floatAnim }] }]}>
          {/* Outer glow ring */}
          <Animated.View style={[styles.glowRing, { opacity: glowPulse }]} />
          {/* Dark teardrop base */}
          <View style={styles.teardropBase} />
          {/* Gradient teardrop overlay */}
          <LinearGradient
            colors={['#F472B6', '#C084FC', '#818CF8']}
            start={{ x: 0, y: 1 }}
            end={{ x: 1, y: 0 }}
            style={styles.teardropGrad}
          />
          {/* Inner glow spot */}
          <View style={styles.innerGlow} />
        </Animated.View>

        {/* Brand name */}
        <Text style={styles.title}>ourspace</Text>

        {/* Subtitle with side lines */}
        <View style={styles.subtitleRow}>
          <View style={styles.subtitleLine} />
          <Text style={styles.subtitle}>OPENING YOUR WORLD</Text>
          <View style={styles.subtitleLine} />
        </View>
      </View>

      {/* Bottom gradient loading bar */}
      <View style={styles.loaderWrap}>
        <View style={styles.loaderTrack}>
          <LinearGradient
            colors={['#4F46E5', '#F47B6A']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.loaderFill}
          />
          <Animated.View style={[styles.loaderShimmer, { transform: [{ translateX: shimmer }] }]} />
        </View>
      </View>
    </View>
  );
}

const LOGO_SIZE = 130;
const TEARDROP = 72;

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#050510',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99999,
  },

  glowCenter: {
    position: 'absolute',
    top: '20%',
    width: W * 0.8,
    height: W * 0.8,
    borderRadius: W * 0.4,
    backgroundColor: 'rgba(99, 82, 240, 0.18)',
  },

  center: { alignItems: 'center' },

  logoWrap: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 36,
  },

  glowRing: {
    position: 'absolute',
    width: LOGO_SIZE * 1.3,
    height: LOGO_SIZE * 1.3,
    borderRadius: LOGO_SIZE * 0.65,
    backgroundColor: 'rgba(192, 132, 252, 0.2)',
  },

  teardropBase: {
    position: 'absolute',
    width: TEARDROP,
    height: TEARDROP,
    borderRadius: TEARDROP / 2,
    borderTopRightRadius: 0,
    backgroundColor: '#1E1B4B',
    transform: [{ rotate: '45deg' }],
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },

  teardropGrad: {
    position: 'absolute',
    width: TEARDROP,
    height: TEARDROP,
    borderRadius: TEARDROP / 2,
    borderTopRightRadius: 0,
    transform: [{ rotate: '-135deg' }, { translateX: 7 }, { translateY: 7 }],
    shadowColor: '#C084FC',
    shadowOpacity: 0.8,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },

  innerGlow: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.35)',
    transform: [{ translateX: 6 }, { translateY: 6 }],
  },

  title: {
    fontSize: 54,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -2,
    lineHeight: 54,
    marginBottom: 16,
  },

  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  subtitleLine: {
    width: 24,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  subtitle: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 3.5,
    textTransform: 'uppercase',
  },

  loaderWrap: {
    position: 'absolute',
    bottom: 56,
    alignItems: 'center',
  },
  loaderTrack: {
    width: 56,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  loaderFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 2,
  },
  loaderShimmer: {
    position: 'absolute',
    top: 0,
    width: 20,
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderRadius: 2,
  },
});
