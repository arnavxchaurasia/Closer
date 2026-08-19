import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import {
  Animated, Dimensions, Easing, StyleSheet, Text, View,
} from 'react-native';

const { width: W } = Dimensions.get('window');

interface Props {
  exiting?: boolean;
}

export function LaunchScreen({ exiting }: Props) {
  // Entry animations (native driver)
  const entryAnim = useRef(new Animated.Value(0)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  // Letter-spacing collapse (JS driver — letterSpacing isn't natively animatable)
  const letterSpacing = useRef(new Animated.Value(8)).current;

  // Loop animations (native driver)
  const floatAnim = useRef(new Animated.Value(0)).current;
  const glowPulse = useRef(new Animated.Value(0.5)).current;
  const shimmer = useRef(new Animated.Value(-50)).current;

  // Exit animation (native driver)
  const exitScale = useRef(new Animated.Value(1)).current;
  const exitOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Entry: logo + bg expand
    Animated.timing(entryAnim, {
      toValue: 1,
      duration: 1200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    // Letter-spacing collapse: "ourspace" wide → tight
    Animated.timing(letterSpacing, {
      toValue: -2,
      duration: 1500,
      delay: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    // Subtitle fade in after text settles
    Animated.timing(subtitleOpacity, {
      toValue: 1,
      duration: 600,
      delay: 1000,
      useNativeDriver: true,
    }).start();

    // Float loop (starts immediately, invisible during entry)
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: -12, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();

    // Glow pulse loop
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glowPulse, { toValue: 0.5, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();

    // Shimmer loop
    Animated.loop(
      Animated.timing(shimmer, { toValue: 50, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true })
    ).start();
  }, []);

  // Exit: scale up + fade out (mirrors HTML exit-scale-out)
  useEffect(() => {
    if (!exiting) return;
    Animated.parallel([
      Animated.timing(exitScale, {
        toValue: 1.5,
        duration: 800,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(exitOpacity, {
        toValue: 0,
        duration: 700,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [exiting]);

  // Entry-derived values
  const logoOpacity = entryAnim.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0.2, 1] });
  const logoScale   = entryAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] });
  const logoUp      = entryAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] });
  const titleOpacity = entryAnim.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0, 1] });
  const glowBgOpacity = entryAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const glowBgScale   = entryAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });

  return (
    <Animated.View style={[styles.container, {
      transform: [{ scale: exitScale }],
      opacity: exitOpacity,
    }]}>
      {/* Expanding background glow (bg-expand) */}
      <Animated.View style={[styles.glowCenter, {
        opacity: glowBgOpacity,
        transform: [{ scale: glowBgScale }],
      }]} />
      <Animated.View style={[styles.glowPulseRing, { opacity: glowPulse }]} />

      {/* Central content */}
      <View style={styles.center}>
        {/* Logo reveal wrapper — native: opacity + scale + translateY */}
        <Animated.View style={{
          opacity: logoOpacity,
          transform: [{ scale: logoScale }, { translateY: logoUp }],
          marginBottom: 36,
        }}>
          {/* Float loop wrapper — nested so native drivers don't conflict */}
          <Animated.View style={[styles.logoWrap, { transform: [{ translateY: floatAnim }] }]}>
            <Animated.View style={[styles.glowRing, { opacity: glowPulse }]} />
            <View style={styles.teardropBase} />
            <LinearGradient
              colors={['#F472B6', '#C084FC', '#818CF8']}
              start={{ x: 0, y: 1 }}
              end={{ x: 1, y: 0 }}
              style={styles.teardropGrad}
            />
            <View style={styles.innerGlow} />
          </Animated.View>
        </Animated.View>

        {/* Brand name — JS driver for letterSpacing, native for opacity */}
        <Animated.Text style={[styles.title, {
          opacity: titleOpacity,
          letterSpacing,
        }]}>
          ourspace
        </Animated.Text>

        {/* Subtitle */}
        <Animated.View style={[styles.subtitleRow, { opacity: subtitleOpacity }]}>
          <View style={styles.subtitleLine} />
          <Text style={styles.subtitle}>OPENING YOUR WORLD</Text>
          <View style={styles.subtitleLine} />
        </Animated.View>
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
    </Animated.View>
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
    top: '15%',
    width: W * 0.85,
    height: W * 0.85,
    borderRadius: W * 0.425,
    backgroundColor: 'rgba(79,70,229,0.2)',
  },
  glowPulseRing: {
    position: 'absolute',
    top: '12%',
    width: W * 0.9,
    height: W * 0.9,
    borderRadius: W * 0.45,
    backgroundColor: 'rgba(244,114,182,0.06)',
  },
  center: { alignItems: 'center' },
  logoWrap: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowRing: {
    position: 'absolute',
    width: LOGO_SIZE * 1.3,
    height: LOGO_SIZE * 1.3,
    borderRadius: LOGO_SIZE * 0.65,
    backgroundColor: 'rgba(192,132,252,0.2)',
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
