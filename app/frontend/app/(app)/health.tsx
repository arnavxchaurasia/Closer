/**
 * Health & Cycle Tracker — tracks energy, mood, symptoms, and cycle phases
 * for both partners regardless of gender.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, Dimensions, Modal, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { api } from '@/src/api';
import { Button } from '@/src/components/Button';
import { Input } from '@/src/components/Input';
import { Press } from '@/src/components/Press';
import { useTheme } from '@/src/context/ThemeContext';
import { haptics } from '@/src/haptics';
import { Colors, radius, space } from '@/src/theme';

function FadeSlide({ delay = 0, children, style }: { delay?: number; children: React.ReactNode; style?: any }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 350, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 350, delay, useNativeDriver: true }),
    ]).start();
  }, []);
  return <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>{children}</Animated.View>;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface HealthLog {
  id: string;
  date: string;
  log_type: 'period_start' | 'period_end' | 'symptom' | 'energy' | 'mood_note';
  value?: number;
  symptoms?: string[];
  note?: string;
  cycle_length?: number;
}

interface PhaseInfo {
  phase: string;
  day: number;
  cycle_length: number;
  days_until_next: number;
  emoji: string;
  label: string;
  tip: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ENERGY_LEVELS = [
  { emoji: '😴', label: 'Very low', value: 2 },
  { emoji: '😕', label: 'Low',      value: 4 },
  { emoji: '😐', label: 'Okay',     value: 6 },
  { emoji: '🙂', label: 'Good',     value: 8 },
  { emoji: '⚡', label: 'Great',    value: 10 },
];

const SYMPTOM_CHIPS = [
  { key: 'cramps',       label: 'Cramps',      emoji: '🥺' },
  { key: 'fatigue',      label: 'Fatigue',     emoji: '😴' },
  { key: 'headache',     label: 'Headache',    emoji: '🤕' },
  { key: 'mood_swings',  label: 'Mood swings', emoji: '🎭' },
  { key: 'low_energy',   label: 'Low energy',  emoji: '🔋' },
  { key: 'high_energy',  label: 'High energy', emoji: '⚡' },
  { key: 'anxious',      label: 'Anxious',     emoji: '😰' },
  { key: 'tender',       label: 'Tender',      emoji: '💙' },
  { key: 'bloated',      label: 'Bloated',     emoji: '🫧' },
  { key: 'happy',        label: 'Happy',       emoji: '😊' },
  { key: 'irritable',    label: 'Irritable',   emoji: '😤' },
  { key: 'calm',         label: 'Calm',        emoji: '🧘' },
];

function logEmoji(log: HealthLog): string {
  switch (log.log_type) {
    case 'period_start': return '🔴';
    case 'period_end':   return '✅';
    case 'energy': {
      const e = ENERGY_LEVELS.find(l => l.value === log.value);
      return e?.emoji ?? '⚡';
    }
    case 'symptom': return '💊';
    case 'mood_note': return '📝';
    default: return '📍';
  }
}

function logLabel(log: HealthLog): string {
  switch (log.log_type) {
    case 'period_start': return 'Period started';
    case 'period_end':   return 'Period ended';
    case 'energy': {
      const e = ENERGY_LEVELS.find(l => l.value === log.value);
      return `Energy: ${e?.label ?? log.value}`;
    }
    case 'symptom': return log.symptoms?.slice(0, 2).join(', ') ?? 'Symptoms';
    case 'mood_note': return log.note?.slice(0, 30) ?? 'Note';
    default: return log.log_type;
  }
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const diff = Math.floor((today.getTime() - d.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Phase gradient helper ────────────────────────────────────────────────────

function phaseGradient(phase: string): [string, string] {
  const p = phase?.toLowerCase() ?? '';
  if (p.includes('follicular') || p.includes('ovulation')) return ['#34D399', '#06B6D4'];
  if (p.includes('luteal'))    return ['#A78BFA', '#7C3AED'];
  if (p.includes('period') || p.includes('menstrual')) return ['#F472B6', '#EC4899'];
  // default / pms
  return ['#818CF8', '#6366F1'];
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function HealthScreen() {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [phase, setPhase]           = useState<PhaseInfo | null>(null);
  const [logs, setLogs]             = useState<HealthLog[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [moodHistory, setMoodHistory] = useState<{ mine: { date: string; value: number }[]; partner: { date: string; value: number }[] }>({ mine: [], partner: [] });

  // Today's entry state
  const [energy, setEnergy]         = useState<number | null>(null);
  const [symptoms, setSymptoms]     = useState<string[]>([]);
  const [note, setNote]             = useState('');

  // Cycle length picker
  const [cycleLength, setCycleLength]       = useState(28);
  const [showCyclePicker, setShowCyclePicker] = useState(false);

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [phaseData, logsData, moodData] = await Promise.allSettled([
        api.get<PhaseInfo>('/api/health/phase'),
        api.get<HealthLog[]>('/api/health/logs?days=90'),
        api.get<any>('/api/mood/history?days=30'),
      ]);
      if (phaseData.status === 'fulfilled') setPhase(phaseData.value);
      if (logsData.status === 'fulfilled')  setLogs(logsData.value ?? []);
      if (moodData.status === 'fulfilled')  setMoodHistory(moodData.value ?? { mine: [], partner: [] });
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Toggle symptom ────────────────────────────────────────────────────────
  const toggleSymptom = (key: string) => {
    haptics.light();
    setSymptoms(prev =>
      prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key]
    );
  };

  // ── Log period event ──────────────────────────────────────────────────────
  const logPeriodEvent = async (logType: 'period_start' | 'period_end') => {
    haptics.medium();
    try {
      await api.post('/api/health/log', { date: new Date().toISOString().slice(0, 10), log_type: logType });
      loadData();
      Alert.alert(logType === 'period_start' ? 'Logged ✅' : 'Logged ✅', logType === 'period_start' ? 'Period start recorded.' : 'Period end recorded.');
    } catch { haptics.error(); Alert.alert('Error', 'Could not save log.'); }
  };

  // ── Save today's log ──────────────────────────────────────────────────────
  const saveLog = async () => {
    if (energy === null && symptoms.length === 0 && !note.trim()) {
      Alert.alert('Nothing to log', 'Select an energy level or symptoms first.');
      return;
    }
    setSaving(true); haptics.light();
    try {
      const today = new Date().toISOString().slice(0, 10);
      if (energy !== null) {
        await api.post('/api/health/log', { date: today, log_type: 'energy', value: energy });
      }
      if (symptoms.length > 0) {
        await api.post('/api/health/log', { date: today, log_type: 'symptom', symptoms });
      }
      if (note.trim()) {
        await api.post('/api/health/log', { date: today, log_type: 'mood_note', note: note.trim() });
      }
      setEnergy(null); setSymptoms([]); setNote('');
      loadData();
      haptics.success?.();
      Alert.alert('Logged 💚', 'Today\'s entry saved.');
    } catch { haptics.error(); Alert.alert('Error', 'Could not save log.'); }
    finally { setSaving(false); }
  };

  // ── Save cycle length ─────────────────────────────────────────────────────
  const saveCycleLength = async (len: number) => {
    setCycleLength(len);
    setShowCyclePicker(false);
    try {
      await api.post('/api/health/log', {
        date: new Date().toISOString().slice(0, 10),
        log_type: 'period_start',
        cycle_length: len,
      });
      loadData();
    } catch {}
  };

  const recentLogs = logs.slice(0, 7);
  const gradColors = phase ? phaseGradient(phase.phase) : (['#34D399', '#06B6D4'] as [string, string]);

  // Compute average cycle length from logged period_start dates
  const periodStartDates = logs
    .filter(l => l.log_type === 'period_start')
    .map(l => new Date(l.date).getTime())
    .sort((a, b) => a - b);

  let avgCycleLength: number | null = null;
  let predictedNextPeriod: string | null = null;
  if (periodStartDates.length >= 2) {
    const gaps: number[] = [];
    for (let i = 1; i < periodStartDates.length; i++) {
      gaps.push(Math.round((periodStartDates[i] - periodStartDates[i - 1]) / 86_400_000));
    }
    avgCycleLength = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
    const lastStart = periodStartDates[periodStartDates.length - 1];
    const predicted = new Date(lastStart + avgCycleLength * 86_400_000);
    predictedNextPeriod = predicted.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={s.header}>
        <Press haptic="light" onPress={() => router.canGoBack() ? router.back() : router.replace('/' as any)} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Press>
        <Text style={s.headerTitle}>My Health 💚</Text>
        <Press haptic="light" onPress={() => router.push('/(app)/health-partner')} style={s.backBtn}>
          <Ionicons name="heart-circle-outline" size={24} color={colors.green} />
        </Press>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.green} size="large" />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: space.md, gap: 16 }}>

          {/* Phase card */}
          <LinearGradient
            colors={[gradColors[0] + 'DD', gradColors[1] + 'DD']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={s.phaseCard}
          >
            {phase ? (
              <>
                <Text style={{ fontSize: 52, marginBottom: 8 }}>{phase.emoji}</Text>
                <Text style={{ fontSize: 22, fontWeight: '900', color: '#fff', marginBottom: 4 }}>{phase.label}</Text>
                <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', textAlign: 'center', lineHeight: 18, marginBottom: 10 }}>{phase.tip}</Text>
                <View style={{ backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 99, paddingHorizontal: 14, paddingVertical: 6 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>
                    Day {phase.day} of {phase.cycle_length} · {phase.days_until_next}d until next
                  </Text>
                </View>
                {avgCycleLength !== null && (
                  <View style={{ marginTop: 10, alignItems: 'center', gap: 4 }}>
                    <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: '600' }}>
                      Your average cycle: {avgCycleLength} days
                    </Text>
                    {predictedNextPeriod && (
                      <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: '600' }}>
                        Predicted next period: ~{predictedNextPeriod}
                      </Text>
                    )}
                  </View>
                )}
              </>
            ) : (
              <>
                <Text style={{ fontSize: 48, marginBottom: 10 }}>🌱</Text>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#fff', textAlign: 'center' }}>Start tracking to see your phase</Text>
                <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 6, textAlign: 'center' }}>Log a few days to get insights</Text>
              </>
            )}
          </LinearGradient>

          {/* Log today */}
          <View style={s.card}>
            <Text style={s.sectionTitle}>Log Today</Text>

            {/* Energy */}
            <Text style={s.label}>Energy level</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              {ENERGY_LEVELS.map(e => (
                <Pressable
                  key={e.value}
                  onPress={() => { haptics.light(); setEnergy(prev => prev === e.value ? null : e.value); }}
                  style={[s.energyBtn, energy === e.value && { backgroundColor: colors.green + '33', borderColor: colors.green }]}
                >
                  <Text style={{ fontSize: 26 }}>{e.emoji}</Text>
                  <Text style={{ fontSize: 10, color: energy === e.value ? colors.green : colors.muted, fontWeight: '700', marginTop: 2 }}>{e.label}</Text>
                </Pressable>
              ))}
            </View>

            {/* Symptoms */}
            <Text style={s.label}>How are you feeling?</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16, marginHorizontal: -4 }}>
              <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 4 }}>
                {SYMPTOM_CHIPS.map(chip => {
                  const active = symptoms.includes(chip.key);
                  return (
                    <Pressable
                      key={chip.key}
                      onPress={() => toggleSymptom(chip.key)}
                      style={[s.symptomChip, active && { backgroundColor: colors.green + '22', borderColor: colors.green }]}
                    >
                      <Text style={{ fontSize: 16 }}>{chip.emoji}</Text>
                      <Text style={{ fontSize: 12, color: active ? colors.green : colors.textSec, fontWeight: active ? '700' : '500' }}>{chip.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            {/* Period buttons */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              <Press haptic="medium" onPress={() => logPeriodEvent('period_start')} style={[s.periodBtn, { backgroundColor: colors.rose }]}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>🔴 Period started today</Text>
              </Press>
              <Press haptic="medium" onPress={() => logPeriodEvent('period_end')} style={[s.periodBtnOutline, { borderColor: colors.rose }]}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.rose }}>Period ended</Text>
              </Press>
            </View>

            {/* Note */}
            <View style={{ marginBottom: 14 }}>
              <Input
                label="Note (optional)"
                value={note}
                onChangeText={setNote}
                multiline
                numberOfLines={4}
              />
            </View>

            {/* Save */}
            <Button
              variant="primary"
              size="lg"
              fullWidth
              label={saving ? 'Saving…' : 'Log today 💚'}
              loading={saving}
              onPress={saveLog}
              disabled={saving}
              style={{ borderRadius: radius.lg }}
            />
          </View>

          {/* Mood history chart */}
          <View style={s.card}>
            <Text style={s.sectionTitle}>Mood Trends (Last 30 Days) 📈</Text>
            {(() => {
              const dates: string[] = [];
              for (let i = 29; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                dates.push(d.toISOString().slice(0, 10));
              }

              const mineMap: Record<string, number> = {};
              const partnerMap: Record<string, number> = {};
              
              (moodHistory.mine || []).forEach(item => {
                if (item.date && item.value != null) {
                  mineMap[item.date.slice(0, 10)] = item.value;
                }
              });
              (moodHistory.partner || []).forEach(item => {
                if (item.date && item.value != null) {
                  partnerMap[item.date.slice(0, 10)] = item.value;
                }
              });

              const paddingLeft = 25;
              const paddingRight = 15;
              const paddingTop = 15;
              const paddingBottom = 20;
              const chartHeight = 160;
              const chartWidth = Dimensions.get('window').width - 64;

              const getCoords = (map: Record<string, number>) => {
                const points: { x: number; y: number; val: number }[] = [];
                dates.forEach((date, index) => {
                  if (map[date] !== undefined) {
                    const val = map[date];
                    const x = paddingLeft + (index / (dates.length - 1)) * (chartWidth - paddingLeft - paddingRight);
                    const y = paddingTop + ((10 - val) / (10 - 1)) * (chartHeight - paddingTop - paddingBottom);
                    points.push({ x, y, val });
                  }
                });
                return points;
              };

              const minePoints = getCoords(mineMap);
              const partnerPoints = getCoords(partnerMap);

              const hasData = minePoints.length > 0 || partnerPoints.length > 0;

              if (!hasData) {
                return (
                  <View style={{ height: 120, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 48, marginBottom: 8 }}>📊</Text>
                    <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center' }}>
                      Log your mood daily to see your shared trends here!
                    </Text>
                  </View>
                );
              }

              const minePolyPoints = minePoints.map(p => `${p.x},${p.y}`).join(' ');
              const partnerPolyPoints = partnerPoints.map(p => `${p.x},${p.y}`).join(' ');

              return (
                <View>
                  <Svg width={chartWidth} height={chartHeight}>
                    {/* Grid Lines */}
                    {[1, 5, 10].map(val => {
                      const y = paddingTop + ((10 - val) / (10 - 1)) * (chartHeight - paddingTop - paddingBottom);
                      return (
                        <View key={val}>
                          <Line x1={paddingLeft} y1={y} x2={chartWidth - paddingRight} y2={y} stroke={colors.line} strokeWidth={1} strokeDasharray="3,3" />
                          <SvgText x={paddingLeft - 8} y={y + 4} fill={colors.muted} fontSize={10} textAnchor="end">{val}</SvgText>
                        </View>
                      );
                    })}

                    {/* Mine Polyline */}
                    {minePoints.length > 1 && (
                      <Polyline points={minePolyPoints} fill="none" stroke={colors.rose} strokeWidth={2.5} />
                    )}
                    {/* Mine Dots */}
                    {minePoints.map((p, i) => (
                      <Circle key={`mine-${i}`} cx={p.x} cy={p.y} r={3.5} fill={colors.rose} />
                    ))}

                    {/* Partner Polyline */}
                    {partnerPoints.length > 1 && (
                      <Polyline points={partnerPolyPoints} fill="none" stroke={colors.green} strokeWidth={2.5} />
                    )}
                    {/* Partner Dots */}
                    {partnerPoints.map((p, i) => (
                      <Circle key={`part-${i}`} cx={p.x} cy={p.y} r={3.5} fill={colors.green} />
                    ))}
                  </Svg>

                  {/* Legend */}
                  <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.rose }} />
                      <Text style={{ fontSize: 12, color: colors.textSec, fontWeight: '600' }}>Me</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.green }} />
                      <Text style={{ fontSize: 12, color: colors.textSec, fontWeight: '600' }}>Partner</Text>
                    </View>
                  </View>
                </View>
              );
            })()}
          </View>

          {/* Cycle settings */}
          <Press haptic="light" onPress={() => setShowCyclePicker(true)} style={[s.card, s.row]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>Cycle length</Text>
              <Text style={{ fontSize: 13, color: colors.textSec }}>Adjusts phase predictions</Text>
            </View>
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.green }}>{cycleLength} days</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </Press>

          {/* Recent logs */}
          {recentLogs.length > 0 && (
            <View style={s.card}>
              <Text style={s.sectionTitle}>Recent logs</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {recentLogs.map(log => (
                  <View key={log.id} style={[s.logChip, { backgroundColor: colors.surface2, borderColor: colors.line }]}>
                    <Text style={{ fontSize: 16 }}>{logEmoji(log)}</Text>
                    <View>
                      <Text style={{ fontSize: 11, color: colors.muted, fontWeight: '700' }}>{fmtDate(log.date)}</Text>
                      <Text style={{ fontSize: 12, color: colors.textSec }}>{logLabel(log)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={{ height: 20 }} />
        </ScrollView>
      )}

      {/* Cycle length picker modal */}
      <Modal visible={showCyclePicker} transparent animationType="slide" onRequestClose={() => setShowCyclePicker(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setShowCyclePicker(false)} />
        <View style={[s.sheet, { backgroundColor: colors.surface }]}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, alignSelf: 'center', marginBottom: 16 }} />
          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 12 }}>Cycle length</Text>
          <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
            {Array.from({ length: 15 }, (_, i) => i + 21).map(len => (
              <Pressable
                key={len}
                onPress={() => saveCycleLength(len)}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 12 }}
              >
                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: cycleLength === len ? colors.green : colors.muted, backgroundColor: cycleLength === len ? colors.green : 'transparent' }} />
                <Text style={{ fontSize: 16, color: colors.text, fontWeight: cycleLength === len ? '800' : '500' }}>{len} days</Text>
                {len === 28 && <Text style={{ fontSize: 12, color: colors.muted }}>(average)</Text>}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: Colors) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: c.line, backgroundColor: c.surface,
    },
    backBtn:  { width: 38, height: 38, justifyContent: 'center' },
    headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: c.text },
    phaseCard: {
      borderRadius: 20, padding: 24, alignItems: 'center',
      shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6,
    },
    card: {
      backgroundColor: c.surface, borderRadius: 16, padding: 16,
      borderWidth: 1, borderColor: c.line,
    },
    sectionTitle: { fontSize: 16, fontWeight: '800', color: c.text, marginBottom: 14 },
    label: { fontSize: 13, fontWeight: '700', color: c.textSec, marginBottom: 8 },
    energyBtn: {
      flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12,
      borderWidth: 1.5, borderColor: c.line, backgroundColor: c.surface2,
    },
    symptomChip: {
      flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8,
      borderRadius: 99, backgroundColor: c.surface2, borderWidth: 1.5, borderColor: c.line,
    },
    periodBtn: {
      flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    },
    periodBtnOutline: {
      paddingVertical: 13, paddingHorizontal: 16, borderRadius: 14, alignItems: 'center',
      justifyContent: 'center', borderWidth: 1.5, backgroundColor: 'transparent',
    },
    noteInput: {
      borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14,
      minHeight: 70, borderWidth: 1, marginBottom: 14, textAlignVertical: 'top',
    },
    saveBtn: {
      paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    },
    logChip: {
      flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8,
      borderRadius: 12, borderWidth: 1,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    sheet: {
      borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40,
      shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: -4 }, elevation: 20,
    },
  });
}
