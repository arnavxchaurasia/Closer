import React, { useEffect, useRef } from 'react';
import {
  Animated, Dimensions, Easing, Image,
  StyleSheet, Text, View,
} from 'react-native';

const { width: W } = Dimensions.get('window');

interface AnimatedSplashProps {
  onFinish?: () => void;
}

export function AnimatedSplash({ onFinish }: AnimatedSplashProps) {
  // 1. UXPilot animate-float (6s continuous loop: translateY 0 -> -20 -> 0)
  const floatAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -20,
          duration: 3000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 3000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  // 2. UXPilot animate-pulse-glow (4s continuous opacity loop: 0.4 -> 0.7 -> 0.4)
  const pulseGlow = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseGlow, {
          toValue: 0.75,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseGlow, {
          toValue: 0.4,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  // 3. UXPilot loading bar animation (-40 -> 40 loop)
  const loadTrans = useRef(new Animated.Value(-40)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(loadTrans, {
        toValue: 40,
        duration: 1500,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      })
    ).start();
  }, []);

  // Fade out screen after 1.8s
  const opacityAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }).start(() => {
        onFinish?.();
      });
    }, 1800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: opacityAnim }]}>
      {/* Mesh-like pulsing gradient background */}
      <Animated.View style={[styles.glowBlob, { opacity: pulseGlow }]} />

      {/* Central Branding */}
      <View style={styles.center}>
        {/* Floating Logo Ring */}
        <Animated.View style={[styles.logoCard, { transform: [{ translateY: floatAnim }] }]}>
          <Image
            source={require('@/assets/images/logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </Animated.View>

        {/* Typography */}
        <Text style={styles.title}>ourspace</Text>
        <Text style={styles.subtitle}>PREMIUM PRIVATE SPACE</Text>
      </View>

      {/* Elegant Loading Indicator */}
      <View style={styles.loaderWrap}>
        <View style={styles.loaderTrack}>
          <Animated.View style={[styles.loaderFill, { transform: [{ translateX: loadTrans }] }]} />
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99999,
  },
  glowBlob: {
    position: 'absolute',
    top: -40,
    width: W * 1.2,
    height: W * 1.2,
    borderRadius: W * 0.6,
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
  },

  center: { alignItems: 'center' },

  logoCard: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#1E1B4B',
    shadowOpacity: 0.1,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  logoImage: { width: 100, height: 100 },

  title: {
    fontSize: 52,
    fontWeight: '900',
    color: '#1E1B4B',
    letterSpacing: -2,
    lineHeight: 52,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 4,
    textTransform: 'uppercase',
  },

  loaderWrap: {
    position: 'absolute',
    bottom: 60,
    alignItems: 'center',
  },
  loaderTrack: {
    width: 48,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#F1F5F9',
    overflow: 'hidden',
  },
  loaderFill: {
    width: 16,
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#4F46E5',
  },
});
