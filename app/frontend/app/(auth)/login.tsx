import { useSignIn, useOAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import * as AuthSession from 'expo-auth-session';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, Animated, Easing, Image, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Press } from '@/src/components/Press';
import { useAuth } from '@/src/context/AuthContext';
import { useTheme } from '@/src/context/ThemeContext';
import { haptics } from '@/src/haptics';
import { radius, space } from '@/src/theme';

WebBrowser.maybeCompleteAuthSession();

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
  const { startOAuthFlow } = useOAuth({ strategy: 'oauth_google' });

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [pwVisible, setPwVisible] = useState(false);
  const [focused, setFocused]   = useState<string | null>(null);
  const pwRef = useRef<TextInput>(null);

  const handleGoogleSignIn = React.useCallback(async () => {
    setGoogleLoading(true);
    try {
      const redirectUrl = AuthSession.makeRedirectUri({ path: 'sso-callback' });
      const { createdSessionId, setActive: setOAuthActive } = await startOAuthFlow({ redirectUrl });
      if (createdSessionId && setOAuthActive) {
        await setOAuthActive({ session: createdSessionId });
        haptics.success();
        router.replace('/(app)');
      }
    } catch (err: any) {
      haptics.error();
      const msg = err?.errors?.[0]?.message ?? err?.message ?? 'Google Sign-In was cancelled or failed.';
      Alert.alert('Google Sign-In', msg);
    } finally {
      setGoogleLoading(false);
    }
  }, [startOAuthFlow]);

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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ padding: space.lg, flexGrow: 1, justifyContent: 'center', paddingTop: 40, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back */}
          <FadeSlide delay={0}>
            <Press haptic="light" onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/(auth)'); }} style={{ width: 40, height: 40, justifyContent: 'center', marginBottom: space.lg }}>
              <Text style={{ fontSize: 24, color: colors.text }}>←</Text>
            </Press>
          </FadeSlide>

          {/* Heading with Official Logo */}
          <FadeSlide delay={60}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <Image source={require('@/assets/images/logo.png')} style={{ width: 44, height: 44, borderRadius: 12 }} resizeMode="contain" />
              <View>
                <Text style={{ fontSize: 11, fontWeight: '800', color: colors.rose, letterSpacing: 1.8, textTransform: 'uppercase' }}>OurSpace</Text>
                <Text style={{ fontSize: 26, fontWeight: '900', color: colors.text, letterSpacing: -0.8 }}>Welcome back</Text>
              </View>
            </View>
            <Text style={{ fontSize: 14, color: colors.muted, marginBottom: space.lg, lineHeight: 20 }}>Continue your shared journey.</Text>
          </FadeSlide>

          {/* Clerk Social Auth Option */}
          <FadeSlide delay={100}>
            <Press
              haptic="medium"
              onPress={handleGoogleSignIn}
              disabled={googleLoading || loading}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.surface,
                borderRadius: radius.lg,
                height: 54,
                borderWidth: 1.5,
                borderColor: colors.line,
                marginBottom: space.lg,
                gap: 10,
                opacity: googleLoading ? 0.7 : 1,
              }}
            >
              <Ionicons name="logo-google" size={20} color="#EA4335" />
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>
                {googleLoading ? 'Signing in with Google…' : 'Continue with Google'}
              </Text>
            </Press>

            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.lg, gap: 12 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.muted, letterSpacing: 1 }}>OR EMAIL</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
            </View>
          </FadeSlide>

          {/* Fields */}
          <FadeSlide delay={140}>
            <View style={{ gap: 16, marginBottom: space.lg }}>
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

              {/* Password */}
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
                    <Ionicons name={pwVisible ? 'eye-off-outline' : 'eye-outline'} size={22} color={focused === 'pw' ? colors.rose : colors.muted} />
                  </Pressable>
                </View>
              </View>
            </View>
          </FadeSlide>

          {/* CTA */}
          <FadeSlide delay={220}>
            <Press haptic="medium" onPress={submit} disabled={loading || googleLoading}>
              <View style={{ borderRadius: radius.xl, height: 58, alignItems: 'center', justifyContent: 'center', opacity: loading ? 0.7 : 1, backgroundColor: colors.rose }}>
                <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 0.3 }}>
                  {loading ? 'Signing in…' : 'Sign in →'}
                </Text>
              </View>
            </Press>

            <Text style={{ fontSize: 14, textAlign: 'center', color: colors.textSec, marginTop: space.lg }}>
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
