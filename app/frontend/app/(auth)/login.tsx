import { useSignIn } from '@clerk/clerk-expo';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert, Animated, Easing, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Press } from '@/src/components/Press';
import { useAuth } from '@/src/context/AuthContext';
import { useTheme } from '@/src/context/ThemeContext';
import { haptics } from '@/src/haptics';
import { radius, space } from '@/src/theme';

function FadeSlide({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 500, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);
  const y = a.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });
  return <Animated.View style={{ opacity: a, transform: [{ translateY: y }] }}>{children}</Animated.View>;
}

export default function LoginScreen() {
  const { colors } = useTheme();
  const { login } = useAuth();
  const { signIn, setActive, isLoaded: signInLoaded } = useSignIn();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [pwVisible, setPwVisible] = useState(false);
  const [focused, setFocused]   = useState<string | null>(null);
  const pwRef = useRef<TextInput>(null);

  const submit = async () => {
    if (!email.trim() || !password) { Alert.alert('Fill in all fields'); return; }
    setLoading(true);
    try {
      if (signInLoaded && signIn) {
        const result = await signIn.create({
          identifier: email.trim().toLowerCase(),
          password,
        });
        if (result.status === 'complete') {
          await setActive({ session: result.createdSessionId });
          haptics.success();
          router.replace('/(app)');
          return;
        }
      }
      await login(email.trim().toLowerCase(), password);
      haptics.success();
      router.replace('/(app)');
    } catch (err: any) {
      haptics.error();
      const msg = err?.errors?.[0]?.message ?? err?.message ?? 'Check your email and password.';
      Alert.alert('Sign in failed', msg);
    } finally { setLoading(false); }
  };

  const fieldStyle = (key: string) => ({
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    height: 58,
    color: colors.text,
    fontSize: 16,
    borderWidth: 1.5,
    borderColor: focused === key ? colors.rose : colors.line,
    width: '100%' as const,
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ padding: space.lg, flexGrow: 1, justifyContent: 'center', paddingTop: 60 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back */}
          <FadeSlide delay={0}>
            <Press haptic="light" onPress={() => router.back()} style={{ width: 40, height: 40, justifyContent: 'center', marginBottom: space.xl * 1.5 }}>
              <Text style={{ fontSize: 24, color: colors.text }}>←</Text>
            </Press>
          </FadeSlide>

          {/* Heading */}
          <FadeSlide delay={60}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: colors.rose, letterSpacing: 1.8, textTransform: 'uppercase', marginBottom: 8 }}>Welcome back</Text>
            <Text style={{ fontSize: 36, fontWeight: '900', color: colors.text, letterSpacing: -1, lineHeight: 42, marginBottom: 8 }}>Sign in</Text>
            <Text style={{ fontSize: 15, color: colors.muted, marginBottom: space.xl * 1.5, lineHeight: 22 }}>Continue your shared journey.</Text>
          </FadeSlide>

          {/* Fields */}
          <FadeSlide delay={140}>
            <View style={{ gap: 16, marginBottom: space.xl }}>
              {/* Email */}
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSec, letterSpacing: 1, textTransform: 'uppercase' }}>Email</Text>
                <TextInput
                  style={fieldStyle('email')}
                  value={email} onChangeText={setEmail}
                  placeholder="you@example.com" placeholderTextColor={colors.muted}
                  keyboardType="email-address" autoCapitalize="none" returnKeyType="next"
                  onSubmitEditing={() => pwRef.current?.focus()}
                  onFocus={() => setFocused('email')} onBlur={() => setFocused(null)}
                />
              </View>

              {/* Password — eye button absolutely positioned inside */}
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSec, letterSpacing: 1, textTransform: 'uppercase' }}>Password</Text>
                <View style={{ position: 'relative' }}>
                  <TextInput
                    ref={pwRef}
                    style={[fieldStyle('pw'), { paddingRight: 52 }]}
                    value={password} onChangeText={setPassword}
                    placeholder="Your password" placeholderTextColor={colors.muted}
                    secureTextEntry={!pwVisible} returnKeyType="done"
                    onSubmitEditing={submit}
                    onFocus={() => setFocused('pw')} onBlur={() => setFocused(null)}
                  />
                  <Pressable
                    onPress={() => setPwVisible(v => !v)}
                    hitSlop={12}
                    style={{ position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' }}
                  >
                    <Text style={{ fontSize: 20 }}>{pwVisible ? '🙈' : '👁️'}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </FadeSlide>

          {/* CTA */}
          <FadeSlide delay={220}>
            <Press haptic="medium" onPress={submit} disabled={loading}>
              <LinearGradient
                colors={['#E8607A', '#C94B9B']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ borderRadius: radius.xl, height: 60, alignItems: 'center', justifyContent: 'center', opacity: loading ? 0.7 : 1 }}
              >
                <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 0.3 }}>
                  {loading ? 'Signing in…' : 'Sign in →'}
                </Text>
              </LinearGradient>
            </Press>

            <Text style={{ fontSize: 14, textAlign: 'center', color: colors.textSec, marginTop: space.xl }}>
              New here?{'  '}
              <Text style={{ color: colors.rose, fontWeight: '700' }} onPress={() => router.replace('/(auth)/register')}>
                Create account
              </Text>
            </Text>
          </FadeSlide>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
