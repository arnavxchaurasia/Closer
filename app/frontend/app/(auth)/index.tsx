import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Dimensions, Image, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Press } from '@/src/components/Press';
import { useTheme } from '@/src/context/ThemeContext';
import { radius, space } from '@/src/theme';

const { width: W } = Dimensions.get('window');

const FEATURES = [
  { emoji: '📅', text: 'Shared calendar' },
  { emoji: '💌', text: 'Open When letters' },
  { emoji: '🎯', text: 'Couple goals' },
  { emoji: '📸', text: 'Memories timeline' },
];

export default function WelcomeScreen() {
  const { colors, isDark } = useTheme();

  const fadeAnim   = useRef(new Animated.Value(0)).current;
  const slideAnim  = useRef(new Animated.Value(40)).current;
  const scaleAnim  = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 120 }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 14, stiffness: 100 }),
    ]).start();
  }, []);

  const grad: [string, string, string] = isDark
    ? ['#1A0A12', '#140820', '#0B0C15']
    : ['#FFF0F3', '#F5EEFF', '#F7F5F2'];

  const glowColor = isDark ? 'rgba(232,96,122,0.22)' : 'rgba(201,75,100,0.12)';

  return (
    <LinearGradient colors={grad} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Glow blob behind logo */}
        <View style={{ position: 'absolute', top: W * 0.1, left: W * 0.1, width: W * 0.8, height: W * 0.8, borderRadius: W * 0.4, backgroundColor: glowColor }} />

        <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          {/* Logo */}
          <Animated.View style={{ alignItems: 'center', marginTop: 40, transform: [{ scale: scaleAnim }] }}>
            <View style={{ width: 100, height: 100, borderRadius: 24, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, marginBottom: 16, overflow: 'hidden', shadowColor: colors.rose, shadowOpacity: 0.2, shadowRadius: 10, elevation: 4 }}>
              <Image source={require('@/assets/images/icon.png')} style={{ width: 100, height: 100 }} resizeMode="cover" />
            </View>
            <Text style={{ fontSize: 36, fontWeight: '900', color: colors.text, letterSpacing: -1.2, lineHeight: 40 }}>OurSpace</Text>
            <Text style={{ fontSize: 15, color: colors.textSec, marginTop: 6, fontWeight: '600', letterSpacing: 0.3 }}>Closer, Every Day.</Text>
          </Animated.View>

          {/* Features */}
          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: space.lg }}>
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.xl, padding: space.lg, borderWidth: 1, borderColor: colors.line, gap: 16 }}>
              {FEATURES.map((f, i) => (
                <Animated.View key={f.text} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, opacity: fadeAnim, transform: [{ translateX: slideAnim.interpolate({ inputRange: [0, 40], outputRange: [0, 20 + i * 8] }) }] }}>
                  <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 20 }}>{f.emoji}</Text>
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>{f.text}</Text>
                  <View style={{ marginLeft: 'auto', width: 20, height: 20, borderRadius: 10, backgroundColor: colors.roseDim, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: colors.rose, fontSize: 12, fontWeight: '800' }}>✓</Text>
                  </View>
                </Animated.View>
              ))}
            </View>
          </View>

          {/* CTAs */}
          <View style={{ paddingHorizontal: space.lg, paddingBottom: space.xl, gap: 12 }}>
            <Press haptic="medium" onPress={() => router.push('/(auth)/register')}>
              <LinearGradient colors={['#E8607A', '#C94B9B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: radius.lg, height: 56, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 }}>Get started</Text>
              </LinearGradient>
            </Press>

            <Press haptic="light" onPress={() => router.push('/(auth)/login')}>
              <View style={{ height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface }}>
                <Text style={{ color: colors.textSec, fontSize: 15, fontWeight: '700' }}>I already have an account</Text>
              </View>
            </Press>

            <Text style={{ textAlign: 'center', fontSize: 12, color: colors.muted, marginTop: 4 }}>
              Private · Encrypted · Just for two
            </Text>
          </View>
        </Animated.View>
      </SafeAreaView>
    </LinearGradient>
  );
}
