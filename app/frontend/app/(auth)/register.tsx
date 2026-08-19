import { useSignUp, useOAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import * as AuthSession from 'expo-auth-session';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useRef, useState } from 'react';
import {
  Alert, Image, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Press } from '@/src/components/Press';
import { useAuth } from '@/src/context/AuthContext';
import { useTheme } from '@/src/context/ThemeContext';
import { haptics } from '@/src/haptics';
import { radius, space } from '@/src/theme';

WebBrowser.maybeCompleteAuthSession();

export default function RegisterScreen() {
  const { colors } = useTheme();
  const { register } = useAuth();
  const { signUp, setActive, isLoaded: signUpLoaded } = useSignUp();
  const { startOAuthFlow } = useOAuth({ strategy: 'oauth_google' });

  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [loading, setLoading]   = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errors, setErrors]     = useState<Record<string, string>>({});
  const [pwVisible, setPwVisible] = useState(false);
  const [focused, setFocused]   = useState<string | null>(null);

  const emailRef   = useRef<TextInput>(null);
  const pwRef      = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const handleGoogleSignUp = React.useCallback(async () => {
    setGoogleLoading(true);
    try {
      const redirectUrl = AuthSession.makeRedirectUri({ path: 'sso-callback' });
      const { createdSessionId, setActive: setOAuthActive } = await startOAuthFlow({ redirectUrl });
      if (createdSessionId && setOAuthActive) {
        await setOAuthActive({ session: createdSessionId });
        haptics.success();
        router.replace('/(auth)/pair');
      }
    } catch (err: any) {
      haptics.error();
      const msg = err?.errors?.[0]?.message ?? err?.message ?? 'Google Sign-Up was cancelled or failed.';
      Alert.alert('Google Sign-Up', msg);
    } finally {
      setGoogleLoading(false);
    }
  }, [startOAuthFlow]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim())           e.name     = 'Name is required';
    if (!email.includes('@'))   e.email    = 'Enter a valid email';
    if (password.length < 8)   e.password  = 'Min 8 characters';
    if (password !== confirm)  e.confirm   = 'Passwords don\'t match';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validate()) { haptics.error(); return; }
    setLoading(true);
    try {
      if (signUpLoaded && signUp) {
        const result = await signUp.create({
          emailAddress: email.trim().toLowerCase(),
          password,
          firstName: name.trim().split(' ')[0],
          lastName: name.trim().split(' ').slice(1).join(' ') || undefined,
        });
        if (result.status === 'complete') {
          await setActive({ session: result.createdSessionId });
          await haptics.success();
          router.replace('/(auth)/pair');
          return;
        }
      }
      await register(email.trim().toLowerCase(), password, name.trim());
      await haptics.success();
      router.replace('/(auth)/pair');
    } catch (err: any) {
      await haptics.error();
      const msg = err?.errors?.[0]?.message ?? err?.message ?? 'Could not create account';
      Alert.alert('Could not create account', msg);
    } finally { setLoading(false); }
  };

  const inp = (key: string, hasErr: boolean) => ({
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    height: 54,
    color: colors.text,
    fontSize: 15,
    borderWidth: 1.5,
    borderColor: hasErr ? colors.rose : focused === key ? colors.rose : colors.line,
    flex: 1,
  });

  const fields = [
    { key: 'name',     label: 'Full name',       value: name,     set: setName,     ph: 'Alex',              next: () => emailRef.current?.focus(),   extra: { autoCapitalize: 'words' as const } },
    { key: 'email',    label: 'Email',            value: email,    set: setEmail,    ph: 'you@example.com',   ref: emailRef, next: () => pwRef.current?.focus(),    extra: { keyboardType: 'email-address' as const, autoCapitalize: 'none' as const } },
    { key: 'password', label: 'Password',         value: password, set: setPassword, ph: 'At least 8 chars', ref: pwRef,    next: () => confirmRef.current?.focus(), extra: { secureTextEntry: !pwVisible } },
    { key: 'confirm',  label: 'Confirm password', value: confirm,  set: setConfirm,  ph: 'Repeat password',  ref: confirmRef, extra: { secureTextEntry: !pwVisible } },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: space.lg, flexGrow: 1, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Press haptic="light" onPress={() => router.back()} style={{ width: 40, height: 40, justifyContent: 'center', marginBottom: space.md }}>
            <Text style={{ fontSize: 24, color: colors.text }}>←</Text>
          </Press>

          {/* Heading with Official Logo */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <Image source={require('@/assets/images/logo.png')} style={{ width: 44, height: 44, borderRadius: 12 }} resizeMode="contain" />
            <View>
              <Text style={{ fontSize: 11, fontWeight: '800', color: colors.rose, letterSpacing: 1.5, textTransform: 'uppercase' }}>OurSpace</Text>
              <Text style={{ fontSize: 26, fontWeight: '900', color: colors.text, letterSpacing: -0.8 }}>Create account</Text>
            </View>
          </View>
          <Text style={{ fontSize: 14, color: colors.muted, marginBottom: space.md, lineHeight: 20 }}>Your private space for exactly two people.</Text>

          {/* Clerk Social Auth Option */}
          <Press
            haptic="medium"
            onPress={handleGoogleSignUp}
            disabled={googleLoading || loading}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              height: 52,
              borderWidth: 1.5,
              borderColor: colors.line,
              marginBottom: space.md,
              gap: 10,
              opacity: googleLoading ? 0.7 : 1,
            }}
          >
            <Ionicons name="logo-google" size={20} color="#EA4335" />
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>
              {googleLoading ? 'Signing up with Google…' : 'Continue with Google'}
            </Text>
          </Press>

          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md, gap: 12 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.muted, letterSpacing: 1 }}>OR EMAIL</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
          </View>

          <View style={{ gap: 12, marginBottom: space.lg }}>
            {fields.map(f => (
              <View key={f.key} style={{ gap: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: errors[f.key] ? colors.rose : colors.textSec, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                  {f.label}
                </Text>
                <View style={{ position: 'relative' }}>
                  <TextInput
                    ref={(f as any).ref}
                    style={[inp(f.key, !!errors[f.key]), (f.key === 'password' || f.key === 'confirm') && { paddingRight: 52 }]}
                    value={f.value} onChangeText={t => { f.set(t); if (errors[f.key]) setErrors(p => ({ ...p, [f.key]: '' })); }}
                    placeholder={f.ph} placeholderTextColor={colors.muted}
                    returnKeyType={(f as any).next ? 'next' : 'done'}
                    onSubmitEditing={(f as any).next ?? submit}
                    onFocus={() => setFocused(f.key)} onBlur={() => setFocused(null)}
                    {...f.extra}
                  />
                  {(f.key === 'password' || f.key === 'confirm') && (
                    <Pressable
                      onPress={() => setPwVisible(v => !v)}
                      hitSlop={12}
                      style={{ position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' }}
                    >
                      <Ionicons name={pwVisible ? 'eye-off-outline' : 'eye-outline'} size={22} color={focused === f.key ? colors.rose : colors.muted} />
                    </Pressable>
                  )}
                </View>
                {errors[f.key] ? <Text style={{ fontSize: 12, color: colors.rose, fontWeight: '600' }}>{errors[f.key]}</Text> : null}
              </View>
            ))}
          </View>

          <Press haptic="medium" onPress={submit} disabled={loading || googleLoading}>
            <View style={{ borderRadius: radius.lg, height: 56, alignItems: 'center', justifyContent: 'center', opacity: loading ? 0.7 : 1, backgroundColor: colors.rose }}>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>
                {loading ? 'Creating account…' : 'Create account →'}
              </Text>
            </View>
          </Press>

          <Text style={{ fontSize: 14, textAlign: 'center', color: colors.textSec, marginTop: space.md }}>
            Already have an account?{'  '}
            <Text style={{ color: colors.rose, fontWeight: '700' }} onPress={() => router.replace('/(auth)/login')}>Sign in</Text>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
