import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Animated, Modal, Pressable, ScrollView, StyleSheet,
  Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/src/api';
import { Input } from '@/src/components/Input';
import { Press } from '@/src/components/Press';
import { useAuth } from '@/src/context/AuthContext';
import { useCouple } from '@/src/context/CoupleContext';
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

type SharedEntry = { journal_id: string; title?: string; content: string; mood?: string; author_id: string; created_at: string; reactions?: Record<string, string[]> };
type MonthlyJournal = { summary: string | null; month: string; cached: boolean; reason?: string };

const MOODS = ['😊','😢','😤','😌','🥰','😴','😰','🎉','🤔','😔'];
const REACT_EMOJIS = ['❤️','😂','😮','😢','👏','🔥'];

function makeStyles(c: Colors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: { flexDirection: 'row', alignItems: 'center', padding: space.lg, gap: space.md },
    card: { backgroundColor: c.surface, borderRadius: radius.xl, padding: space.md, marginBottom: space.sm, marginHorizontal: space.lg, borderWidth: 1, borderColor: c.line },
    avatarBubble: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontSize: 14, fontWeight: '800', color: '#fff' },
    cardDate: { fontSize: 11, color: c.muted },
    cardAuthor: { fontSize: 12, fontWeight: '700', color: c.textSec },
    cardTitle: { fontSize: 16, fontWeight: '700', color: c.text, marginTop: 6 },
    cardBody: { fontSize: 14, color: c.textSec, lineHeight: 21, marginTop: 4 },
    reactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
    reactChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, backgroundColor: c.surface2, borderWidth: 1, borderColor: c.line },
    reactText: { fontSize: 13 },
    reactCount: { fontSize: 12, fontWeight: '700', color: c.textSec },
    addReact: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, backgroundColor: c.surface2, borderWidth: 1, borderColor: c.line },
    fab: { position: 'absolute', bottom: 32, right: 24, backgroundColor: c.rose, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: c.rose, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
    modalBg: { flex: 1, backgroundColor: c.bg },
    fLabel: { fontSize: 11, fontWeight: '700', color: c.textSec, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 },
    fInput: { backgroundColor: c.surface2, borderRadius: radius.md, height: 48, paddingHorizontal: space.md, color: c.text, fontSize: 15, borderWidth: 1, borderColor: c.line },
    saveBtn: { backgroundColor: c.rose, borderRadius: radius.lg, height: 54, alignItems: 'center', justifyContent: 'center', marginTop: space.md },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    reactPickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  });
}

export default function OurJournalScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { partner } = useCouple();
  const [entries, setEntries] = useState<SharedEntry[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showReactPicker, setShowReactPicker] = useState<string | null>(null);
  const [fTitle, setFTitle] = useState('');
  const [fBody, setFBody] = useState('');
  const [fMood, setFMood] = useState('');
  const [saving, setSaving] = useState(false);
  const [monthly, setMonthly] = useState<MonthlyJournal | null>(null);
  const [monthlyLoading, setMonthlyLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<'timeline' | 'compare'>('timeline');

  const groupedCompare = useMemo(() => {
    const groups: Record<string, { myEntry?: SharedEntry, partnerEntry?: SharedEntry }> = {};
    entries.forEach(e => {
      const dateKey = e.created_at.slice(0, 10);
      if (!groups[dateKey]) groups[dateKey] = {};
      if (e.author_id === user?.user_id) {
        groups[dateKey].myEntry = e;
      } else {
        groups[dateKey].partnerEntry = e;
      }
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries, user?.user_id]);
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const s = useMemo(() => makeStyles(colors), [colors]);

  // Shimmer animation
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmerAnim, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    if (monthlyLoading) loop.start();
    else loop.stop();
    return () => loop.stop();
  }, [monthlyLoading]);

  useEffect(() => { load(); loadMonthly(); }, []);
  const loadMonthly = async (force = false) => {
    setMonthlyLoading(true);
    try {
      const res = await api.get<MonthlyJournal>(`/api/ai/monthly-journal${force ? '?force=1' : ''}`);
      setMonthly(res);
    } catch {
      setMonthly(null);
    } finally {
      setMonthlyLoading(false);
    }
  };
  const load = async () => {
    try { setEntries(await api.get<SharedEntry[]>('/api/our-journal')); }
    catch { setEntries([]); }
  };

  const save = async () => {
    if (!fBody.trim()) { Alert.alert('Write something'); return; }
    setSaving(true);
    try {
      await api.post('/api/our-journal', { title: fTitle.trim() || undefined, content: fBody.trim(), mood: fMood || undefined });
      setShowModal(false); setFTitle(''); setFBody(''); setFMood(''); load();
    } catch (e: any) { Alert.alert('Error', e?.message); }
    finally { setSaving(false); }
  };

  const react = async (entryId: string, emoji: string) => {
    try { await api.post(`/api/our-journal/${entryId}/react`, { emoji }); setShowReactPicker(null); load(); }
    catch { setShowReactPicker(null); }
  };

  const authorColor = (authorId: string) => authorId === user?.user_id ? colors.rose : colors.gold;
  const authorInitial = (authorId: string) => (authorId === user?.user_id ? user?.name?.[0] : partner?.name?.[0]) ?? '?';
  const authorName = (authorId: string) => authorId === user?.user_id ? 'You' : (partner?.name ?? 'Partner');

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <FadeSlide delay={0}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, justifyContent: 'center' }}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, flex: 1 }}>Our journal</Text>
        <Text style={{ fontSize: 13, color: colors.muted }}>{entries.length} entries</Text>
      </View>

      </FadeSlide>
      {/* Segmented Control Tab */}
      <FadeSlide delay={60}>
      <View style={{ flexDirection: 'row', marginHorizontal: space.lg, marginBottom: space.md, backgroundColor: colors.surface2, borderRadius: radius.lg, padding: 3, borderWidth: 1, borderColor: colors.line }}>
        <Press
          style={{ flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.md, backgroundColor: activeTab === 'timeline' ? colors.surface : 'transparent' }}
          onPress={() => { haptics.light(); setActiveTab('timeline'); }}
          haptic="none"
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: activeTab === 'timeline' ? colors.rose : colors.muted }}>Timeline 📖</Text>
        </Press>
        <Press
          style={{ flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.md, backgroundColor: activeTab === 'compare' ? colors.surface : 'transparent' }}
          onPress={() => { haptics.light(); setActiveTab('compare'); }}
          haptic="none"
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: activeTab === 'compare' ? colors.rose : colors.muted }}>Compare 👥</Text>
        </Press>
      </View>
      </FadeSlide>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Monthly Letter Card */}
        {activeTab === 'timeline' && (() => {
          const today = new Date();
          const dayOfMonth = today.getDate();
          const monthName = today.toLocaleString('en-US', { month: 'long' });
          const monthYear = today.toLocaleString('en-US', { month: 'long', year: 'numeric' });

          if (dayOfMonth < 7 && !monthly) {
            return (
              <LinearGradient
                colors={['#F43F5E22', '#FB7185AA']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={{ marginHorizontal: space.lg, borderRadius: radius.xl, padding: space.lg, marginBottom: space.md, borderWidth: 1, borderColor: colors.rose + '44' }}
              >
                <Text style={{ fontSize: 16, fontWeight: '800', color: colors.rose, marginBottom: 6 }}>📖 {monthName} in Review</Text>
                <Text style={{ fontSize: 13, color: colors.textSec, lineHeight: 20 }}>
                  Check back in {7 - dayOfMonth} more {7 - dayOfMonth === 1 ? 'day' : 'days'} for your {monthName} summary.
                </Text>
              </LinearGradient>
            );
          }

          return (
            <LinearGradient
              colors={['#F43F5E22', '#FB7185AA']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ marginHorizontal: space.lg, borderRadius: radius.xl, padding: space.lg, marginBottom: space.md, borderWidth: 1, borderColor: colors.rose + '44' }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.sm }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: colors.rose, flex: 1 }}>📖 {monthYear} in Review</Text>
                <Pressable
                  onPress={() => loadMonthly(true)}
                  disabled={monthlyLoading}
                  style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.full, backgroundColor: colors.roseDim, borderWidth: 1, borderColor: colors.rose + '55' }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.rose }}>Regenerate</Text>
                </Pressable>
              </View>

              {monthlyLoading ? (
                <View style={{ gap: 8 }}>
                  {[1, 0.8, 0.6].map((opacity, i) => (
                    <Animated.View
                      key={i}
                      style={{
                        height: 14,
                        borderRadius: 7,
                        backgroundColor: colors.rose + '33',
                        width: `${[100, 85, 60][i]}%`,
                        opacity: Animated.multiply(shimmerAnim, opacity),
                      }}
                    />
                  ))}
                </View>
              ) : monthly?.summary ? (
                <Text style={{ fontSize: 14, color: colors.text, lineHeight: 22 }}>{monthly.summary}</Text>
              ) : monthly?.reason === 'too_early' ? (
                <Text style={{ fontSize: 13, color: colors.textSec, lineHeight: 20 }}>
                  Check back in {7 - dayOfMonth} more {7 - dayOfMonth === 1 ? 'day' : 'days'} for your {monthName} summary.
                </Text>
              ) : (
                <Text style={{ fontSize: 13, color: colors.muted, fontStyle: 'italic' }}>Tap Regenerate to create your {monthName} letter.</Text>
              )}
            </LinearGradient>
          );
        })()}

        {activeTab === 'timeline' && entries.length === 0 && (
          <View style={{ margin: space.lg, alignItems: 'center', gap: space.sm, backgroundColor: colors.surface, borderRadius: radius.xl, padding: space.xxl, borderWidth: 1, borderColor: colors.line }}>
            <Ionicons name="journal-outline" size={48} color={colors.muted} />
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>Your shared space</Text>
            <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center' }}>Write entries together. React to each other's thoughts.</Text>
          </View>
        )}
        
        {activeTab === 'timeline' && entries.map(entry => {
          const isMe = entry.author_id === user?.user_id;
          const color = authorColor(entry.author_id);
          const reactions = entry.reactions ?? {};
          return (
            <View key={entry.journal_id} style={[s.card, isMe && { borderLeftWidth: 3, borderLeftColor: colors.rose }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm }}>
                <View style={[s.avatarBubble, { backgroundColor: color }]}>
                  <Text style={s.avatarText}>{authorInitial(entry.author_id)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardAuthor}>{authorName(entry.author_id)}</Text>
                  <Text style={s.cardDate}>{new Date(entry.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</Text>
                </View>
                {entry.mood ? <Text style={{ fontSize: 24 }}>{entry.mood}</Text> : null}
              </View>
              {entry.title ? <Text style={s.cardTitle}>{entry.title}</Text> : null}
              <Text style={s.cardBody}>{entry.content}</Text>
              <View style={s.reactRow}>
                {Object.entries(reactions).map(([emoji, userIds]) => userIds.length > 0 && (
                  <Pressable key={emoji} style={[s.reactChip, userIds.includes(user?.user_id ?? '') && { borderColor: colors.rose, backgroundColor: colors.roseDim }]} onPress={() => react(entry.journal_id, emoji)}>
                    <Text style={s.reactText}>{emoji}</Text>
                    <Text style={s.reactCount}>{userIds.length}</Text>
                  </Pressable>
                ))}
                <Pressable style={s.addReact} onPress={() => setShowReactPicker(entry.journal_id)}>
                  <Ionicons name="happy-outline" size={16} color={colors.muted} />
                </Pressable>
              </View>
            </View>
          );
        })}

        {activeTab === 'compare' && (
          <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
            {groupedCompare.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 100, gap: 12 }}>
                <Text style={{ fontSize: 64 }}>👥</Text>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>No compared entries yet</Text>
                <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center' }}>
                  Write journal entries on the same day to compare thoughts side-by-side!
                </Text>
              </View>
            ) : (
              groupedCompare.map(([dateKey, group]) => {
                const dateLabel = new Date(dateKey).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                return (
                  <View key={dateKey} style={{ borderBottomWidth: 1, borderBottomColor: colors.line, paddingBottom: space.md }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: colors.rose, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {dateLabel}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: space.sm }}>
                      {/* Me Column */}
                      <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.sm, borderWidth: 1, borderColor: colors.line }}>
                        <Text style={{ fontSize: 11, fontWeight: '800', color: colors.rose, marginBottom: 4 }}>YOU</Text>
                        {group.myEntry ? (
                          <>
                            {group.myEntry.title ? <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 2 }}>{group.myEntry.title}</Text> : null}
                            <Text style={{ fontSize: 12, color: colors.textSec, lineHeight: 18 }} numberOfLines={6}>{group.myEntry.content}</Text>
                          </>
                        ) : (
                          <Pressable onPress={() => { haptics.light(); setShowModal(true); }} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 80, borderStyle: 'dashed', borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 6 }}>
                            <Text style={{ fontSize: 11, color: colors.muted, textAlign: 'center' }}>🔒 Write entry</Text>
                          </Pressable>
                        )}
                      </View>

                      {/* Partner Column */}
                      <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.sm, borderWidth: 1, borderColor: colors.line }}>
                        <Text style={{ fontSize: 11, fontWeight: '800', color: colors.gold, marginBottom: 4 }}>{partner?.name?.toUpperCase() ?? 'PARTNER'}</Text>
                        {group.partnerEntry ? (
                          <>
                            {group.partnerEntry.title ? <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 2 }}>{group.partnerEntry.title}</Text> : null}
                            <Text style={{ fontSize: 12, color: colors.textSec, lineHeight: 18 }} numberOfLines={6}>{group.partnerEntry.content}</Text>
                          </>
                        ) : (
                          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 80, borderStyle: 'dashed', borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 6 }}>
                            <Text style={{ fontSize: 11, color: colors.muted, textAlign: 'center' }}>🔒 Still writing...</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>

      <Pressable style={s.fab} onPress={() => setShowModal(true)}>
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>

      {/* React picker */}
      <Modal visible={!!showReactPicker} transparent animationType="fade">
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }} onPress={() => setShowReactPicker(null)}>
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.xl, padding: space.lg, margin: space.lg }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text, textAlign: 'center', marginBottom: space.md }}>React with…</Text>
            <View style={s.reactPickerRow}>
              {REACT_EMOJIS.map(e => (
                <Pressable key={e} style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 26, backgroundColor: colors.surface2 }} onPress={() => showReactPicker && react(showReactPicker, e)}>
                  <Text style={{ fontSize: 28 }}>{e}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Compose modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={s.modalBg}>
          <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, flex: 1 }}>Share something</Text>
              <Pressable onPress={() => setShowModal(false)}><Ionicons name="close" size={24} color={colors.muted} /></Pressable>
            </View>
            <View style={{ gap: 4 }}>
              <Text style={s.fLabel}>Title (optional)</Text>
              <TextInput style={s.fInput} value={fTitle} onChangeText={setFTitle} placeholder="Give it a title…" placeholderTextColor={colors.muted} />
            </View>
            <View style={{ gap: 4 }}>
              <Text style={s.fLabel}>Mood</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {MOODS.map(m => (
                  <Pressable key={m} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: fMood === m ? colors.roseDim : colors.surface2, borderWidth: 1, borderColor: fMood === m ? colors.rose : colors.line }} onPress={() => setFMood(p => p === m ? '' : m)}>
                    <Text style={{ fontSize: 24 }}>{m}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={{ gap: 4 }}>
              <Text style={s.fLabel}>What's on your mind?</Text>
              <TextInput style={[s.fInput, { height: 180, textAlignVertical: 'top', paddingTop: 12 }]} value={fBody} onChangeText={setFBody} placeholder="Share your thoughts with your partner…" placeholderTextColor={colors.muted} multiline />
            </View>
            <Pressable style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
              <Text style={s.saveBtnText}>{saving ? 'Sharing…' : 'Share entry'}</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
