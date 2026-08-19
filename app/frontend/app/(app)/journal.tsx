import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Animated, Modal, Pressable, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/src/api';
import { Input } from '@/src/components/Input';
import { Press } from '@/src/components/Press';
import { useTheme } from '@/src/context/ThemeContext';
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

type Entry = { journal_id: string; title: string; content: string; mood?: string; tags?: string[]; created_at: string; type?: string; shared?: boolean };
type DreamEntry = { journal_id: string; content: string; created_at: string };

const MOODS = ['😊','😢','😤','😌','🥰','😴','😰','🎉','🤔','😔'];
const TAGS  = ['Grateful','Missing you','Excited','Venting','Reflection','Goals','Memory','Us'];

function makeStyles(c: Colors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: { flexDirection: 'row', alignItems: 'center', padding: space.lg, gap: space.md },
    card: { backgroundColor: c.surface, borderRadius: radius.xl, padding: space.md, marginBottom: space.sm, marginHorizontal: space.lg, borderWidth: 1, borderColor: c.line },
    cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, marginBottom: 8 },
    mood: { fontSize: 28, lineHeight: 36 },
    meta: { flex: 1 },
    cardDate: { fontSize: 11, color: c.muted },
    cardTitle: { fontSize: 16, fontWeight: '700', color: c.text },
    cardBody: { fontSize: 14, color: c.textSec, lineHeight: 21 },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    tag: { fontSize: 11, fontWeight: '700', backgroundColor: c.surface2, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4, color: c.textSec },
    fab: { position: 'absolute', bottom: 32, right: 24, backgroundColor: c.rose, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: c.rose, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
    modalBg: { flex: 1, backgroundColor: c.bg },
    fLabel: { fontSize: 11, fontWeight: '700', color: c.textSec, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 },
    fInput: { backgroundColor: c.surface2, borderRadius: radius.md, height: 48, paddingHorizontal: space.md, color: c.text, fontSize: 15, borderWidth: 1, borderColor: c.line },
    saveBtn: { backgroundColor: c.rose, borderRadius: radius.lg, height: 54, alignItems: 'center', justifyContent: 'center', marginTop: space.md },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    // Tabs
    tabRow: { flexDirection: 'row', marginHorizontal: space.lg, marginBottom: space.sm, backgroundColor: c.surface2, borderRadius: radius.full, padding: 3 },
    tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.full },
    tabBtnActive: { backgroundColor: c.rose },
    tabBtnText: { fontSize: 13, fontWeight: '600', color: c.muted },
    tabBtnTextActive: { color: '#fff' },
    // Dream card
    dreamCard: { backgroundColor: c.surface, borderRadius: radius.xl, padding: space.md, marginBottom: space.sm, marginHorizontal: space.lg, borderWidth: 1, borderColor: c.line },
    dreamDate: { fontSize: 11, color: c.textSec },
    dreamBody: { fontSize: 14, color: c.text, fontStyle: 'italic', lineHeight: 21, marginTop: 4 },
  });
}

export default function JournalScreen() {
  const { colors } = useTheme();
  const [tab, setTab] = useState<'journal' | 'dreams'>('journal');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [dreams, setDreams] = useState<DreamEntry[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showDreamModal, setShowDreamModal] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [fTitle, setFTitle] = useState('');
  const [fBody, setFBody] = useState('');
  const [fMood, setFMood] = useState('');
  const [fTags, setFTags] = useState<string[]>([]);
  const [shared, setShared] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetchingPrompt, setFetchingPrompt] = useState(false);
  const [dreamText, setDreamText] = useState('');
  const [savingDream, setSavingDream] = useState(false);
  const [dreamAnalysis, setDreamAnalysis] = useState<string | null>(null);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [fetchingAnalysis, setFetchingAnalysis] = useState(false);
  const s = useMemo(() => makeStyles(colors), [colors]);

  useEffect(() => { load(); loadDreams(); }, []);

  const load = async () => {
    try {
      const all = await api.get<Entry[]>('/api/journal');
      setEntries(all.filter((e: Entry) => e.type !== 'dream'));
    } catch { setEntries([]); }
  };

  const loadDreams = async () => {
    try {
      const all = await api.get<Entry[]>('/api/journal');
      setDreams(all.filter((e: Entry) => e.type === 'dream') as DreamEntry[]);
    } catch { setDreams([]); }
  };

  const openNew = () => { setEditing(null); setFTitle(''); setFBody(''); setFMood(''); setFTags([]); setShared(false); setShowModal(true); };

  const getAiPrompt = async () => {
    setFetchingPrompt(true);
    try {
      const data = await api.get<{ prompt: string }>('/api/ai/journal-prompt');
      if (data?.prompt) setFBody(data.prompt);
    } catch { Alert.alert('Could not fetch a prompt right now'); }
    finally { setFetchingPrompt(false); }
  };
  const openEdit = (e: Entry) => { setEditing(e); setFTitle(e.title); setFBody(e.content); setFMood(e.mood ?? ''); setFTags(e.tags ?? []); setShared(e.shared ?? false); setShowModal(true); };

  const save = async () => {
    if (!fBody.trim()) { Alert.alert('Write something first'); return; }
    setSaving(true);
    try {
      const body = { title: fTitle.trim() || undefined, content: fBody.trim(), mood: fMood || undefined, tags: fTags, shared: shared };
      if (editing) await api.put(`/api/journal/${editing.journal_id}`, body); else await api.post('/api/journal', body);
      setShowModal(false); load();
    } catch (e: any) { Alert.alert('Error', e?.message); }
    finally { setSaving(false); }
  };

  const saveDream = async () => {
    if (!dreamText.trim()) { Alert.alert('Write your dream first'); return; }
    setSavingDream(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await api.post('/api/journal', { content: dreamText.trim(), type: 'dream', date: today });
      setDreamText('');
      setShowDreamModal(false);
      loadDreams();
    } catch (e: any) { Alert.alert('Error', e?.message); }
    finally { setSavingDream(false); }
  };

  const analyzeDreams = async () => {
    setFetchingAnalysis(true);
    setShowAnalysisModal(true);
    try {
      const data = await api.get<{ analysis: string }>('/api/ai/dream-analysis');
      setDreamAnalysis(data?.analysis ?? 'No analysis available.');
    } catch { setDreamAnalysis('Could not analyze dreams right now.'); }
    finally { setFetchingAnalysis(false); }
  };

  const del = (id: string) => Alert.alert('Delete entry?', '', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { await api.del(`/api/journal/${id}`).catch(() => {}); load(); loadDreams(); } },
  ]);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <FadeSlide delay={0}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, justifyContent: 'center' }}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, flex: 1 }}>My journal</Text>
        <Text style={{ fontSize: 13, color: colors.muted }}>{tab === 'journal' ? entries.length : dreams.length} entries</Text>
      </View>

      </FadeSlide>
      {/* Tabs */}
      <View style={s.tabRow}>
        <Press style={[s.tabBtn, tab === 'journal' && s.tabBtnActive]} onPress={() => setTab('journal')} haptic="select">
          <Text style={[s.tabBtnText, tab === 'journal' && s.tabBtnTextActive]}>Journal 📝</Text>
        </Press>
        <Press style={[s.tabBtn, tab === 'dreams' && s.tabBtnActive]} onPress={() => setTab('dreams')} haptic="select">
          <Text style={[s.tabBtnText, tab === 'dreams' && s.tabBtnTextActive]}>Dreams 🌙</Text>
        </Press>
      </View>

      {tab === 'journal' ? (
        <>
          <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
            {entries.length === 0 && (
              <View style={{ margin: space.lg, alignItems: 'center', gap: space.sm, backgroundColor: colors.surface, borderRadius: radius.xl, padding: space.xxl, borderWidth: 1, borderColor: colors.line }}>
                <Ionicons name="book-outline" size={48} color={colors.muted} />
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>Your private space</Text>
                <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center' }}>Write your thoughts, feelings, and reflections. Only you can see this.</Text>
              </View>
            )}
            {entries.map(entry => (
              <Pressable key={entry.journal_id} style={s.card} onPress={() => openEdit(entry)}>
                <View style={s.cardHeader}>
                  {entry.mood ? <Text style={s.mood}>{entry.mood}</Text> : <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.roseDim, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="create-outline" size={18} color={colors.rose} /></View>}
                  <View style={s.meta}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={s.cardDate}>{new Date(entry.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</Text>
                      {entry.shared ? (
                        <Ionicons name="people-outline" size={12} color={colors.rose} />
                      ) : (
                        <Ionicons name="lock-closed-outline" size={12} color={colors.muted} />
                      )}
                    </View>
                    {entry.title ? <Text style={s.cardTitle}>{entry.title}</Text> : null}
                  </View>
                  <Pressable onPress={() => del(entry.journal_id)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={18} color={colors.muted} />
                  </Pressable>
                </View>
                <Text style={s.cardBody} numberOfLines={3}>{entry.content}</Text>
                {entry.tags && entry.tags.length > 0 && (
                  <View style={s.tagRow}>
                    {entry.tags.map(t => <Text key={t} style={s.tag}>{t}</Text>)}
                  </View>
                )}
              </Pressable>
            ))}
          </ScrollView>

          <Pressable style={s.fab} onPress={openNew}>
            <Ionicons name="add" size={28} color="#fff" />
          </Pressable>
        </>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
            {/* Ask Aria button */}
            <TouchableOpacity
              onPress={analyzeDreams}
              style={{ marginHorizontal: space.lg, marginBottom: space.md, backgroundColor: colors.surface, borderRadius: radius.lg, paddingVertical: 12, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', gap: 10 }}
              activeOpacity={0.8}
            >
              <Text style={{ fontSize: 18 }}>✨</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text, flex: 1 }}>Ask Aria to analyze my dreams</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textSec} />
            </TouchableOpacity>

            {dreams.length === 0 && (
              <View style={{ margin: space.lg, alignItems: 'center', gap: space.sm, backgroundColor: colors.surface, borderRadius: radius.xl, padding: space.xxl, borderWidth: 1, borderColor: colors.line }}>
                <Text style={{ fontSize: 36 }}>🌙</Text>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>Dream log</Text>
                <Text style={{ fontSize: 13, color: colors.textSec, textAlign: 'center' }}>Record your dreams and let Aria find patterns in your subconscious.</Text>
              </View>
            )}
            {dreams.map(dream => (
              <View key={dream.journal_id} style={s.dreamCard}>
                <Text style={s.dreamDate}>🌙 {new Date(dream.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</Text>
                <Text style={s.dreamBody} numberOfLines={4}>{dream.content}</Text>
                <Pressable onPress={() => del(dream.journal_id)} hitSlop={8} style={{ alignSelf: 'flex-end', marginTop: 8 }}>
                  <Ionicons name="trash-outline" size={16} color={colors.muted} />
                </Pressable>
              </View>
            ))}
          </ScrollView>

          <Pressable style={[s.fab, { backgroundColor: colors.rose }]} onPress={() => { setDreamText(''); setShowDreamModal(true); }}>
            <Ionicons name="add" size={28} color="#fff" />
          </Pressable>
        </>
      )}

      {/* Journal Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={s.modalBg}>
          <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, flex: 1 }}>{editing ? 'Edit entry' : 'New entry'}</Text>
              <Pressable onPress={() => setShowModal(false)}><Ionicons name="close" size={24} color={colors.muted} /></Pressable>
            </View>
            <View style={{ gap: 4 }}>
              <Input label="Title (optional)" value={fTitle} onChangeText={setFTitle} placeholder="Give it a name…" />
            </View>
            <View style={{ gap: 4 }}>
              <Text style={s.fLabel}>How are you feeling?</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {MOODS.map(m => (
                  <Pressable key={m} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: fMood === m ? colors.roseDim : colors.surface2, borderWidth: 1, borderColor: fMood === m ? colors.rose : colors.line }} onPress={() => setFMood(p => p === m ? '' : m)}>
                    <Text style={{ fontSize: 24 }}>{m}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={s.fLabel}>Entry</Text>
                <Pressable onPress={getAiPrompt} disabled={fetchingPrompt} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: 12, color: fetchingPrompt ? colors.muted : colors.rose, fontWeight: '700' }}>
                    {fetchingPrompt ? 'Loading…' : '✨ Get a prompt'}
                  </Text>
                </Pressable>
              </View>
              <Input value={fBody} onChangeText={setFBody} placeholder="What's on your mind?" multiline numberOfLines={8} />
            </View>
            <View style={{ gap: 4 }}>
              <Text style={s.fLabel}>Tags</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {TAGS.map(t => {
                  const sel = fTags.includes(t);
                  return (
                    <Pressable key={t} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.full, backgroundColor: sel ? colors.roseDim : colors.surface, borderWidth: 1, borderColor: sel ? colors.rose : colors.line }} onPress={() => setFTags(p => sel ? p.filter(x => x !== t) : [...p, t])}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: sel ? colors.rose : colors.textSec }}>{t}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <Pressable
              onPress={() => setShared(v => !v)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: shared ? colors.roseDim : colors.surface2, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: shared ? colors.rose : colors.line, marginTop: 10 }}
            >
              <Text style={{ fontSize: 20 }}>{shared ? '👥' : '🔒'}</Text>
              <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: shared ? colors.rose : colors.text }}>
                {shared ? 'Shared with partner' : 'Keep private'}
              </Text>
              {shared && <Ionicons name="checkmark-circle" size={20} color={colors.rose} />}
            </Pressable>
            <Pressable style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
              <Text style={s.saveBtnText}>{saving ? 'Saving…' : 'Save entry'}</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Dream Modal */}
      <Modal visible={showDreamModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={s.modalBg}>
          <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, flex: 1 }}>🌙 Log a dream</Text>
              <Pressable onPress={() => setShowDreamModal(false)}><Ionicons name="close" size={24} color={colors.muted} /></Pressable>
            </View>
            <Text style={s.fLabel}>What did you dream?</Text>
            <TextInput
              style={{ backgroundColor: colors.surface2, borderRadius: radius.md, minHeight: 200, padding: space.md, color: colors.text, fontSize: 15, borderWidth: 1, borderColor: colors.line, textAlignVertical: 'top', fontStyle: 'italic' }}
              value={dreamText}
              onChangeText={setDreamText}
              placeholder="Describe your dream…"
              placeholderTextColor={colors.muted}
              multiline
              autoFocus
            />
            <Pressable
              style={{ backgroundColor: colors.rose, borderRadius: radius.lg, height: 54, alignItems: 'center', justifyContent: 'center', marginTop: space.md, opacity: savingDream || !dreamText.trim() ? 0.6 : 1 }}
              onPress={saveDream}
              disabled={savingDream || !dreamText.trim()}
            >
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{savingDream ? 'Saving…' : 'Save dream'}</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Dream Analysis Modal */}
      <Modal visible={showAnalysisModal} animationType="fade" transparent>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: space.lg }} onPress={() => setShowAnalysisModal(false)}>
          <Pressable style={{ backgroundColor: colors.surface, borderRadius: radius.xl, padding: space.lg, borderWidth: 1, borderColor: colors.line }} onPress={() => {}}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: space.md }}>✨ Dream Analysis</Text>
            {fetchingAnalysis ? (
              <Text style={{ color: colors.textSec, fontSize: 14 }}>Analyzing your dreams…</Text>
            ) : (
              <Text style={{ color: colors.text, fontSize: 14, lineHeight: 22 }}>{dreamAnalysis}</Text>
            )}
            <Pressable
              style={{ backgroundColor: colors.rose, borderRadius: radius.lg, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: space.lg }}
              onPress={() => setShowAnalysisModal(false)}
            >
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
