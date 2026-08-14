import { useSignUp } from '@clerk/clerk-expo';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Press } from '@/src/components/Press';
import { useAuth } from '@/src/context/AuthContext';
import { useTheme } from '@/src/context/ThemeContext';
import { haptics } from '@/src/haptics';
import { radius, space } from '@/src/theme';

export default function RegisterScreen() {
  const { colors } = useTheme();
  const { register } = useAuth();
  const { signUp, setActive, isLoaded: signUpLoaded } = useSignUp();

  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [loading, setLoading]   = useState(false);
  const [errors, setErrors]     = useState<Record<string, string>>({});
  const [pwVisible, setPwVisible] = useState(false);
  const [focused, setFocused]   = useState<string | null>(null);

  const emailRef   = useRef<TextInput>(null);
  const pwRef      = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

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
        <ScrollView contentContainerStyle={{ padding: space.lg, flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Press haptic="light" onPress={() => router.back()} style={{ width: 40, height: 40, justifyContent: 'center', marginBottom: space.xl }}>
            <Text style={{ fontSize: 24, color: colors.text }}>←</Text>
          </Press>

          <Text style={{ fontSize: 13, fontWeight: '800', color: colors.rose, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>Start here</Text>
          <Text style={{ fontSize: 32, fontWeight: '900', color: colors.text, letterSpacing: -0.8, lineHeight: 38, marginBottom: 8 }}>Create account</Text>
          <Text style={{ fontSize: 15, color: colors.muted, marginBottom: space.xl, lineHeight: 22 }}>Your private space for exactly two people.</Text>

          <View style={{ gap: 14, marginBottom: space.xl }}>
            {fields.map(f => (
              <View key={f.key} style={{ gap: 6 }}>
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
                      <Text style={{ fontSize: 20 }}>{pwVisible ? '🙈' : '👁️'}</Text>
                    </Pressable>
                  )}
                </View>
                {errors[f.key] ? <Text style={{ fontSize: 12, color: colors.rose, fontWeight: '600' }}>{errors[f.key]}</Text> : null}
              </View>
            ))}
          </View>

          <Press haptic="medium" onPress={submit} disabled={loading}>
            <LinearGradient colors={['#E8607A', '#C94B9B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: radius.lg, height: 58, alignItems: 'center', justifyContent: 'center', opacity: loading ? 0.7 : 1 }}>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>
                {loading ? 'Creating account…' : 'Create account →'}
              </Text>
            </LinearGradient>
          </Press>

          <Text style={{ fontSize: 14, textAlign: 'center', color: colors.textSec, marginTop: space.lg }}>
            Already have an account?{'  '}
            <Text style={{ color: colors.rose, fontWeight: '700' }} onPress={() => router.replace('/(auth)/login')}>Sign in</Text>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
