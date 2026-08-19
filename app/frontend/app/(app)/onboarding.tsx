import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/src/api';
import { Button } from '@/src/components/Button';
import { Input } from '@/src/components/Input';
import { Press } from '@/src/components/Press';
import { useTheme } from '@/src/context/ThemeContext';
import { haptics } from '@/src/haptics';
import { registerForPushNotifications } from '@/src/notifications';

// ─── Constants ──────────────────────────────────────────────────────────────

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const LOVE_LANGS = [
  { key: 'words',   emoji: '💬', label: 'Words of Affirmation' },
  { key: 'acts',    emoji: '🛠️', label: 'Acts of Service'      },
  { key: 'gifts',   emoji: '🎁', label: 'Receiving Gifts'      },
  { key: 'time',    emoji: '⏰', label: 'Quality Time'         },
  { key: 'touch',   emoji: '🤝', label: 'Physical Touch'       },
];

const CONFETTI = ['💕', '✨', '🌟', '💫', '💕', '✨', '💫', '🌟', '💕', '✨',
                  '💫', '🌟', '💕', '✨', '💫'];

const WELCOME_GRAD: readonly [string, string, string] = ['#9F1239', '#E8607A', '#F97316'];
const DONE_GRAD:    readonly [string, string, string] = ['#9F1239', '#E8607A', '#F97316'];

// ─── Custom Picker ───────────────────────────────────────────────────────────

interface PickerModalProps {
  visible: boolean;
  title: string;
  items: (string | number)[];
  selected: string | number | null;
  onSelect: (v: string | number) => void;
  onClose: () => void;
  roseColor: string;
  bgColor: string;
  textColor: string;
  lineColor: string;
}

function PickerModal({ visible, title, items, selected, onSelect, onClose,
  roseColor, bgColor, textColor, lineColor }: PickerModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={pickerStyles.overlay} onPress={onClose} />
      <View style={[pickerStyles.sheet, { backgroundColor: bgColor }]}>
        <View style={[pickerStyles.handle, { backgroundColor: lineColor }]} />
        <Text style={[pickerStyles.title, { color: textColor }]}>{title}</Text>
        <FlatList
          data={items}
          keyExtractor={item => String(item)}
          style={{ maxHeight: 280 }}
          renderItem={({ item }) => {
            const isSelected = item === selected;
            return (
              <Pressable
                onPress={() => { haptics.light(); onSelect(item); onClose(); }}
                style={[pickerStyles.item, isSelected && { backgroundColor: roseColor + '22' }]}
              >
                <Text style={[pickerStyles.itemText, { color: isSelected ? roseColor : textColor },
                  isSelected && { fontWeight: '700' }]}>
                  {item}
                </Text>
                {isSelected && <Ionicons name="checkmark" size={18} color={roseColor} />}
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const pickerStyles = StyleSheet.create({
  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:     { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, paddingHorizontal: 16 },
  handle:    { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginVertical: 12 },
  title:     { fontSize: 16, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  item:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
               paddingVertical: 14, paddingHorizontal: 12, borderRadius: 10 },
  itemText:  { fontSize: 16 },
});

// ─── DatePicker row ──────────────────────────────────────────────────────────

interface DatePickerProps {
  day:      number | null;
  month:    number | null;  // 1-12
  year:     number | null;
  onChange: (d: number | null, m: number | null, y: number | null) => void;
  colors: { rose: string; surface: string; text: string; muted: string; line: string };
}

function DatePicker({ day, month, year, onChange, colors: c }: DatePickerProps) {
  const [open, setOpen] = useState<'day' | 'month' | 'year' | null>(null);

  const days   = Array.from({ length: 31 }, (_, i) => i + 1);
  const months = MONTHS.map((m, i) => ({ label: m, value: i + 1 }));
  const thisYear = new Date().getFullYear();
  const years  = Array.from({ length: 100 }, (_, i) => thisYear - i);

  const pillStyle = (filled: boolean) => ({
    flex: 1,
    backgroundColor: filled ? c.rose + '22' : c.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: filled ? c.rose : c.line,
    paddingVertical: 14,
    alignItems: 'center' as const,
  });

  const pillText = (filled: boolean) => ({
    fontSize: 15,
    fontWeight: (filled ? '700' : '500') as '700' | '500',
    color: filled ? c.rose : c.muted,
  });

  return (
    <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
      <Pressable style={pillStyle(day !== null)} onPress={() => setOpen('day')}>
        <Text style={pillText(day !== null)}>{day !== null ? String(day) : 'Day'}</Text>
      </Pressable>
      <Pressable style={[pillStyle(month !== null), { flex: 1.8 }]} onPress={() => setOpen('month')}>
        <Text style={pillText(month !== null)}>
          {month !== null ? MONTHS[month - 1].slice(0, 3) : 'Month'}
        </Text>
      </Pressable>
      <Pressable style={[pillStyle(year !== null), { flex: 1.3 }]} onPress={() => setOpen('year')}>
        <Text style={pillText(year !== null)}>{year !== null ? String(year) : 'Year'}</Text>
      </Pressable>

      <PickerModal
        visible={open === 'day'}
        title="Day"
        items={days}
        selected={day}
        onSelect={v => onChange(v as number, month, year)}
        onClose={() => setOpen(null)}
        roseColor={c.rose} bgColor={c.surface} textColor={c.text} lineColor={c.line}
      />
      <PickerModal
        visible={open === 'month'}
        title="Month"
        items={MONTHS}
        selected={month !== null ? MONTHS[month - 1] : null}
        onSelect={v => {
          const idx = MONTHS.indexOf(v as string);
          onChange(day, idx + 1, year);
        }}
        onClose={() => setOpen(null)}
        roseColor={c.rose} bgColor={c.surface} textColor={c.text} lineColor={c.line}
      />
      <PickerModal
        visible={open === 'year'}
        title="Year"
        items={years}
        selected={year}
        onSelect={v => onChange(day, month, v as number)}
        onClose={() => setOpen(null)}
        roseColor={c.rose} bgColor={c.surface} textColor={c.text} lineColor={c.line}
      />
    </View>
  );
}

// ─── Confetti ────────────────────────────────────────────────────────────────

function ConfettiParticle({ emoji, delay, startX, screenHeight }: { emoji: string; delay: number; startX: number; screenHeight: number }) {
  const y = useRef(new Animated.Value(-30)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(y, { toValue: screenHeight + 40, duration: 2800, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.delay(2000),
          Animated.timing(opacity, { toValue: 0, duration: 600, useNativeDriver: true }),
        ]),
      ]),
    ]);
    anim.start();
    return () => anim.stop();
  }, [screenHeight]);

  return (
    <Animated.Text style={{
      position: 'absolute',
      top: 0,
      left: startX,
      fontSize: 20,
      transform: [{ translateY: y }],
      opacity,
    }}>
      {emoji}
    </Animated.Text>
  );
}

// ─── Progress Dots ───────────────────────────────────────────────────────────

function ProgressDots({ current, total, roseColor, lineColor }: {
  current: number; total: number; roseColor: string; lineColor: string;
}) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={{
          width: i === current ? 20 : 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: i === current ? roseColor : lineColor,
        }} />
      ))}
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const { colors } = useTheme();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // Guard: already onboarded
  useEffect(() => {
    AsyncStorage.getItem('@ourspace_onboarded').then(val => {
      if (val) router.replace('/(app)');
    });
  }, []);

  // Step state
  const [step, setStep] = useState(0);
  // steps: 0=Welcome 1=Name 2=Birthday 3=Pair 4=Anniversary 5=LoveLang 6=Notifications 7=Done
  const DOT_STEPS = 6;   // steps 1-6 show progress dots
  const dotIndex = step - 1; // 0-based dot index for steps 1-6

  // Page transition
  const pageOpacity = useRef(new Animated.Value(1)).current;
  const pageScale   = useRef(new Animated.Value(1)).current;

  const goNext = (toStep?: number) => {
    const target = toStep !== undefined ? toStep : step + 1;
    haptics.light();
    Animated.parallel([
      Animated.timing(pageOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(pageScale,   { toValue: 0.94, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      setStep(target);
      pageOpacity.setValue(0);
      pageScale.setValue(1.04);
      Animated.parallel([
        Animated.timing(pageOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(pageScale,   { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    });
  };

  // ── Step 0 – Welcome ──
  const heartScale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(heartScale, { toValue: 1.12, duration: 900, useNativeDriver: true }),
      Animated.timing(heartScale, { toValue: 1,    duration: 900, useNativeDriver: true }),
      Animated.delay(200),
    ]));
    animation.start();
    return () => animation.stop();
  }, []);

  // ── Step 1 – Name ──
  const [name, setName] = useState('');

  // ── Step 2 – Birthday ──
  const [bdDay,   setBdDay]   = useState<number | null>(null);
  const [bdMonth, setBdMonth] = useState<number | null>(null);
  const [bdYear,  setBdYear]  = useState<number | null>(null);

  // ── Step 3 – Pairing ──
  const [myCode,       setMyCode]       = useState('');
  const [partnerCode,  setPartnerCode]  = useState('');
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingSuccess, setPairingSuccess] = useState(false);
  const [pairingError, setPairingError] = useState('');
  const leftHeart  = useRef(new Animated.Value(-screenWidth * 0.35)).current;
  const rightHeart = useRef(new Animated.Value(screenWidth * 0.35)).current;
  const mergedScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (step === 3 && !myCode) {
      api.post<{ code: string }>('/api/pair/create').then(res => {
        setMyCode(res.code);
      }).catch(() => {
        // already paired or error – ignore
      });
    }
  }, [step]);

  const handleConnect = async () => {
    if (!partnerCode.trim()) return;
    setPairingLoading(true);
    setPairingError('');
    try {
      await api.post('/api/pair/join', { code: partnerCode.trim().toUpperCase() });
      haptics.success();
      // Hearts animation
      Animated.parallel([
        Animated.spring(leftHeart,  { toValue: 0, useNativeDriver: true, damping: 12 }),
        Animated.spring(rightHeart, { toValue: 0, useNativeDriver: true, damping: 12 }),
      ]).start(() => {
        Animated.spring(mergedScale, { toValue: 1, useNativeDriver: true }).start(() => {
          setPairingSuccess(true);
          setTimeout(() => goNext(), 1200);
        });
      });
    } catch (err: any) {
      haptics.error?.() ?? haptics.light();
      const msg = err?.message ?? 'Check the code and try again.';
      setPairingError(msg.includes('yourself') ? '🚫 That\'s your own code!' : `❌ ${msg}`);
    } finally {
      setPairingLoading(false);
    }
  };

  const shareCode = async () => {
    if (!myCode) return;
    haptics.light();
    try {
      await Share.share({ message: `Join me on OurSpace! My code is: ${myCode}` });
    } catch {}
  };

  // ── Step 4 – Anniversary ──
  const [annDay,   setAnnDay]   = useState<number | null>(null);
  const [annMonth, setAnnMonth] = useState<number | null>(null);
  const [annYear,  setAnnYear]  = useState<number | null>(null);

  // ── Step 5 – Love language ──
  const [loveLang, setLoveLang] = useState<string | null>(null);

  const handleLoveLang = async (key: string) => {
    setLoveLang(key);
    haptics.light();
    try {
      await api.post('/api/love-language', { answers: [], result: key });
    } catch {}
  };

  // ── Step 6 – Notifications ──
  const [notifDone, setNotifDone] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);

  const enableNotifs = async () => {
    setNotifLoading(true);
    try {
      const token = await registerForPushNotifications();
      if (token) {
        await api.post('/api/push-token', { token, platform: 'expo' });
        setNotifDone(true);
        haptics.success();
      }
    } catch {} finally {
      setNotifLoading(false);
    }
  };

  // ── Step 7 – Finish ──
  const finish = async () => {
    // Batch-save collected data
    try {
      if (name.trim()) {
        await api.put('/api/profile', { name: name.trim() });
      }
    } catch {}
    try {
      const payload: Record<string, string> = {};
      if (annDay && annMonth && annYear) {
        payload.anniversary = `${annYear}-${String(annMonth).padStart(2, '0')}-${String(annDay).padStart(2, '0')}`;
      }
      if (bdDay && bdMonth && bdYear) {
        payload.my_birthday = `${bdYear}-${String(bdMonth).padStart(2, '0')}-${String(bdDay).padStart(2, '0')}`;
      }
      if (Object.keys(payload).length) {
        await api.put('/api/couple-profile', payload);
        api.post('/api/calendar/sync-profile-events', {}).catch(() => {});
      }
    } catch {}

    await AsyncStorage.setItem('@ourspace_onboarded', 'true');
    haptics.success();
    router.replace('/(app)');
  };

  // ── Shared Styles ──
  const c = colors;
  const s = {
    page:    { flexGrow: 1, minHeight: screenHeight, alignItems: 'center' as const, justifyContent: 'space-between' as const,
               paddingTop: screenHeight < 700 ? 24 : 56, paddingBottom: 28, paddingHorizontal: Math.min(28, Math.max(16, screenWidth * 0.07)) },
    center:  { alignItems: 'center' as const, flex: 1, justifyContent: 'center' as const, gap: 20, width: '100%' as const },
    emojiTxt:{ fontSize: 64 },
    title:   { fontSize: 32, fontWeight: '900' as const, color: c.text, textAlign: 'center' as const, lineHeight: 38 },
    titleWh: { fontSize: 36, fontWeight: '900' as const, color: '#fff', textAlign: 'center' as const, lineHeight: 44 },
    sub:     { fontSize: 16, color: c.textSec, textAlign: 'center' as const, lineHeight: 24 },
    subWh:   { fontSize: 17, color: 'rgba(255,255,255,0.82)', textAlign: 'center' as const, lineHeight: 26, fontStyle: 'italic' as const },
    btn:     { backgroundColor: c.rose, borderRadius: 16, paddingVertical: 18, alignItems: 'center' as const, width: '100%' as const },
    btnWh:   { backgroundColor: '#fff', borderRadius: 16, paddingVertical: 18, alignItems: 'center' as const, width: '100%' as const },
    btnTxt:  { color: '#fff', fontSize: 17, fontWeight: '800' as const },
    btnTxtR: { color: c.rose, fontSize: 17, fontWeight: '800' as const },
    skipBtn: { paddingVertical: 14, alignItems: 'center' as const, width: '100%' as const },
    skipTxt: { color: c.muted, fontSize: 15 },
    bottom:  { width: '100%' as const, gap: 4 },
  };

  const animatedStyle = {
    flex: 1,
    opacity: pageOpacity,
    transform: [{ scale: pageScale }],
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  // Step 0 — Welcome
  if (step === 0) {
    return (
      <LinearGradient colors={WELCOME_GRAD} style={{ flex: 1 }} start={{ x: 0, y: 0 }} end={{ x: 0.5, y: 1 }}>
        <SafeAreaView style={{ flex: 1 }}>
          <Animated.View style={[s.page, animatedStyle]}>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 28 }}>
              <Animated.Text style={[s.emojiTxt, { transform: [{ scale: heartScale }] }]}>💕</Animated.Text>
              <Text style={s.titleWh}>OurSpace</Text>
              <Text style={s.subWh}>
                {"The app built for two people who\nrefuse to let distance win."}
              </Text>
            </View>
            <Press haptic="medium" onPress={() => goNext()} style={s.btnWh}>
              <Text style={s.btnTxtR}>Get Started →</Text>
            </Press>
          </Animated.View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // Step 7 — All Set (completion)
  if (step === 7) {
    return (
      <LinearGradient colors={DONE_GRAD} style={{ flex: 1 }} start={{ x: 0, y: 0 }} end={{ x: 0.5, y: 1 }}>
        <SafeAreaView style={{ flex: 1 }}>
          {/* Confetti */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {CONFETTI.map((emoji, i) => (
              <ConfettiParticle
                key={i}
                emoji={emoji}
                delay={i * 120}
                startX={Math.random() * Math.max(1, screenWidth - 30)}
                screenHeight={screenHeight}
              />
            ))}
          </View>
          <Animated.View style={[s.page, animatedStyle]}>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 }}>
              <Text style={{ fontSize: 72 }}>🎉</Text>
              <Text style={s.titleWh}>
                {name.trim() ? `You're all set,\n${name.trim()}!` : "You're all set!"}
              </Text>
              <Text style={s.subWh}>Your story starts here.{"\n"}Make it count.</Text>
            </View>
            <Press haptic="medium" onPress={finish} style={s.btnWh}>
              <Text style={s.btnTxtR}>Start Exploring →</Text>
            </Press>
          </Animated.View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // Steps 1-6 — Main flow
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Animated.View style={[s.page, animatedStyle]}>

          {/* Step 1 — Name */}
          {step === 1 && (
            <>
              <View style={s.center}>
                <Text style={s.emojiTxt}>😊</Text>
                <Text style={s.title}>What should{"\n"}we call you?</Text>
                <Input
                  label="Your name"
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  keyboardType="default"
                />
              </View>
              <View style={s.bottom}>
                <ProgressDots current={0} total={DOT_STEPS} roseColor={c.rose} lineColor={c.line} />
                <Button
                  label="Continue →"
                  size="lg"
                  fullWidth
                  disabled={name.length < 2}
                  onPress={() => name.length >= 2 && goNext()}
                />
              </View>
            </>
          )}

          {/* Step 2 — Birthday */}
          {step === 2 && (
            <>
              <View style={s.center}>
                <Text style={s.emojiTxt}>🎂</Text>
                <Text style={s.title}>When were{"\n"}you born?</Text>
                <Text style={{ fontSize: 14, color: c.textSec, textAlign: 'center', marginTop: -8 }}>
                  {name.trim()
                    ? `We'll make sure your partner never forgets 😉`
                    : `We'll make sure they never forget 😉`}
                </Text>
                <DatePicker
                  day={bdDay} month={bdMonth} year={bdYear}
                  onChange={(d, m, y) => { setBdDay(d); setBdMonth(m); setBdYear(y); }}
                  colors={{ rose: c.rose, surface: c.surface, text: c.text, muted: c.muted, line: c.line }}
                />
              </View>
              <View style={s.bottom}>
                <ProgressDots current={1} total={DOT_STEPS} roseColor={c.rose} lineColor={c.line} />
                <Button label="Continue →" size="lg" fullWidth onPress={() => goNext()} />
                <Press haptic="none" onPress={() => goNext()} style={s.skipBtn}>
                  <Text style={s.skipTxt}>Skip for now</Text>
                </Press>
              </View>
            </>
          )}

          {/* Step 3 — Connect */}
          {step === 3 && (
            <>
              <View style={s.center}>
                <Text style={s.emojiTxt}>🔗</Text>
                <Text style={s.title}>Connect with{"\n"}your person</Text>

                {pairingSuccess ? (
                  /* Hearts merge animation */
                  <View style={{ height: 120, justifyContent: 'center', alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                      <Animated.Text style={{ fontSize: 40, transform: [{ translateX: leftHeart }] }}>💕</Animated.Text>
                      <Animated.Text style={{ fontSize: 40, transform: [{ translateX: rightHeart }] }}>💕</Animated.Text>
                    </View>
                    <Animated.Text style={{ fontSize: 52, transform: [{ scale: mergedScale }], marginTop: 8 }}>💞</Animated.Text>
                    <Text style={{ color: c.green ?? '#5CB87A', fontWeight: '700', fontSize: 16, marginTop: 12 }}>
                      Connected! 🎉
                    </Text>
                  </View>
                ) : (
                  <View style={{ width: '100%', gap: 16 }}>
                    {/* My code */}
                    <View>
                      <Text style={{ fontSize: 13, color: c.textSec, textAlign: 'center', marginBottom: 8 }}>
                        Your code
                      </Text>
                      <Pressable
                        onPress={shareCode}
                        style={{
                          backgroundColor: c.roseDim,
                          borderRadius: 14,
                          borderWidth: 1.5,
                          borderColor: c.rose,
                          paddingVertical: 16,
                          paddingHorizontal: 20,
                          alignItems: 'center',
                          flexDirection: 'row',
                          justifyContent: 'center',
                          gap: 10,
                        }}
                      >
                        <Text style={{ fontSize: 24, fontWeight: '900', color: c.rose, letterSpacing: 4 }}>
                          {myCode || '...'}
                        </Text>
                        <Ionicons name="share-outline" size={18} color={c.rose} />
                      </Pressable>
                      <Text style={{ fontSize: 12, color: c.muted, textAlign: 'center', marginTop: 6 }}>
                        Tap to share with your partner
                      </Text>
                    </View>

                    {/* Divider */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ flex: 1, height: 1, backgroundColor: c.line }} />
                      <Text style={{ color: c.muted, fontSize: 13 }}>or</Text>
                      <View style={{ flex: 1, height: 1, backgroundColor: c.line }} />
                    </View>

                    {/* Partner code input */}
                    <Input
                      label="Their invite code"
                      value={partnerCode}
                      onChangeText={t => { setPartnerCode(t.toUpperCase()); setPairingError(''); }}
                      placeholder="e.g. ABC123"
                      autoCapitalize="characters"
                    />
                  </View>
                )}
              </View>

              <View style={s.bottom}>
                {!!pairingError && (
                  <Text style={{ color: '#FF6B6B', fontSize: 13, fontWeight: '600', textAlign: 'center', marginBottom: 12, paddingHorizontal: 16 }}>
                    {pairingError}
                  </Text>
                )}
                <ProgressDots current={2} total={DOT_STEPS} roseColor={c.rose} lineColor={c.line} />
                {!pairingSuccess && (
                  <Button
                    label={pairingLoading ? 'Connecting…' : 'Connect Now'}
                    size="lg"
                    fullWidth
                    loading={pairingLoading}
                    disabled={partnerCode.length < 4 || pairingLoading}
                    onPress={handleConnect}
                  />
                )}
                <Press haptic="none" onPress={() => goNext()} style={s.skipBtn}>
                  <Text style={s.skipTxt}>Skip for now</Text>
                </Press>
              </View>
            </>
          )}

          {/* Step 4 — Anniversary */}
          {step === 4 && (
            <>
              <View style={s.center}>
                <Text style={s.emojiTxt}>💍</Text>
                <Text style={s.title}>When did your{"\n"}story begin?</Text>
                <DatePicker
                  day={annDay} month={annMonth} year={annYear}
                  onChange={(d, m, y) => { setAnnDay(d); setAnnMonth(m); setAnnYear(y); }}
                  colors={{ rose: c.rose, surface: c.surface, text: c.text, muted: c.muted, line: c.line }}
                />
                <Text style={{ fontSize: 14, color: c.muted, textAlign: 'center', lineHeight: 20 }}>
                  Even if you're not 100% sure,{"\n"}pick the day that feels right.
                </Text>
              </View>
              <View style={s.bottom}>
                <ProgressDots current={3} total={DOT_STEPS} roseColor={c.rose} lineColor={c.line} />
                <Button label="Continue →" size="lg" fullWidth onPress={() => goNext()} />
                <Press haptic="none" onPress={() => goNext()} style={s.skipBtn}>
                  <Text style={s.skipTxt}>Skip for now</Text>
                </Press>
              </View>
            </>
          )}

          {/* Step 5 — Love Language */}
          {step === 5 && (
            <>
              <View style={s.center}>
                <Text style={s.emojiTxt}>💬</Text>
                <Text style={s.title}>How do you feel{"\n"}most loved?</Text>
                <View style={{ width: '100%', gap: 10 }}>
                  {LOVE_LANGS.map(ll => {
                    const active = loveLang === ll.key;
                    return (
                      <Pressable
                        key={ll.key}
                        onPress={() => handleLoveLang(ll.key)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 14,
                          backgroundColor: active ? c.roseDim : c.surface,
                          borderRadius: 14,
                          borderWidth: 1.5,
                          borderColor: active ? c.rose : c.line,
                          paddingVertical: 15,
                          paddingHorizontal: 18,
                        }}
                      >
                        <Text style={{ fontSize: 22 }}>{ll.emoji}</Text>
                        <Text style={{ flex: 1, fontSize: 16, fontWeight: active ? '700' : '500',
                          color: active ? c.rose : c.text }}>
                          {ll.label}
                        </Text>
                        <View style={{
                          width: 22, height: 22, borderRadius: 11,
                          borderWidth: 2, borderColor: active ? c.rose : c.line,
                          backgroundColor: active ? c.rose : 'transparent',
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          {active && <Ionicons name="checkmark" size={13} color="#fff" />}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <View style={s.bottom}>
                <ProgressDots current={4} total={DOT_STEPS} roseColor={c.rose} lineColor={c.line} />
                <Button label="Continue →" size="lg" fullWidth onPress={() => goNext()} />
                <Press haptic="none" onPress={() => goNext()} style={s.skipBtn}>
                  <Text style={s.skipTxt}>Skip for now</Text>
                </Press>
              </View>
            </>
          )}

          {/* Step 6 — Notifications */}
          {step === 6 && (
            <>
              <View style={s.center}>
                <Text style={s.emojiTxt}>🔔</Text>
                <Text style={s.title}>
                  {name.trim() ? `Never miss a moment` : `Never miss a moment`}
                </Text>
                <Text style={s.sub}>
                  Get notified when they send a message, log their mood, or just want to say hi.
                </Text>

                {/* Benefit rows */}
                <View style={{ width: '100%', gap: 10 }}>
                  {[
                    { icon: '🔥', text: 'Streak reminders so you never lose momentum' },
                    { icon: '🎂', text: 'Birthday & anniversary alerts' },
                    { icon: '💭', text: 'Nudges from your partner' },
                    { icon: '💌', text: 'Notifications when letters are opened' },
                  ].map(item => (
                    <View key={item.text} style={{
                      flexDirection: 'row', alignItems: 'center', gap: 12,
                      backgroundColor: c.surface, borderRadius: 14, padding: 14,
                      borderWidth: 1, borderColor: c.line,
                    }}>
                      <Text style={{ fontSize: 22 }}>{item.icon}</Text>
                      <Text style={{ fontSize: 14, color: c.textSec, flex: 1, lineHeight: 20 }}>{item.text}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={s.bottom}>
                <ProgressDots current={5} total={DOT_STEPS} roseColor={c.rose} lineColor={c.line} />
                {notifDone ? (
                  <Press haptic="medium" onPress={() => goNext(7)} style={[s.btn, { backgroundColor: c.green ?? '#5CB87A' }]}>
                    <Text style={s.btnTxt}>All set — Let's go!</Text>
                  </Press>
                ) : (
                  <>
                    <Button
                      label={notifLoading ? 'Enabling…' : 'Enable Notifications'}
                      size="lg"
                      fullWidth
                      loading={notifLoading}
                      disabled={notifLoading}
                      onPress={enableNotifs}
                    />
                    <Press haptic="none" onPress={() => goNext(7)} style={s.skipBtn}>
                      <Text style={s.skipTxt}>Maybe later</Text>
                    </Press>
                  </>
                )}
              </View>
            </>
          )}

          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
