import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Animated, Modal, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/src/api';
import { Press } from '@/src/components/Press';
import { NotConnected } from '@/src/components/NotConnected';
import { useCouple } from '@/src/context/CoupleContext';
import { useAuth } from '@/src/context/AuthContext';
import { useTheme } from '@/src/context/ThemeContext';
import { Colors, radius, space } from '@/src/theme';

type Letter = {
  open_when_id: string;
  label: string;
  content: string;
  owner_id: string;
  opened: boolean;
  created_at: string;
};

const OPEN_WHEN_PROMPTS = [
  'you miss me',
  "you're having a bad day",
  "you can't sleep",
  "you're feeling insecure",
  'you need a laugh',
  "you're angry at me",
  'you feel like giving up on us',
  'you need to feel loved',
  "you're proud of yourself",
  "you're feeling lonely",
  "you're anxious",
  "you've had the best day",
  "you're about to see me",
  'we just said goodbye',
  "you're doubting if this is worth it",
  "you're at your lowest",
  'you need a reminder of why we work',
  'you want to hear my voice',
  "you're bored",
  "you're overthinking",
  'you feel taken for granted',
  "you're celebrating something",
  "you're homesick",
  'you want to give up',
  "you're missing our inside jokes",
  'you need motivation',
  "you're feeling beautiful",
  "you're scared about the future",
  "you're missing physical touch",
  "you're happy",
];

function makeStyles(c: Colors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: { flexDirection: 'row', alignItems: 'center', padding: space.lg, gap: space.md },
    headerTitle: { flex: 1, fontSize: 20, fontWeight: '700', color: c.text },
    sectionLabel: {
      fontSize: 11, fontWeight: '800', color: c.muted,
      letterSpacing: 1.4, textTransform: 'uppercase',
      paddingHorizontal: space.lg, marginTop: space.lg, marginBottom: space.sm,
    },
    card: {
      backgroundColor: c.surface, borderRadius: radius.xl,
      padding: space.md, marginBottom: space.sm,
      marginHorizontal: space.lg, borderWidth: 1, borderColor: c.line,
    },
    cardRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
    envCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    envEmoji: { fontSize: 22 },
    cardInfo: { flex: 1 },
    cardEyebrow: { fontSize: 10, fontWeight: '800', color: c.muted, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 2 },
    cardLabel: { fontSize: 16, fontWeight: '700', color: c.text },
    cardDate: { fontSize: 12, color: c.muted, marginTop: 2 },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
    statusText: { fontSize: 10, fontWeight: '700' },
    openBtn: { marginTop: space.sm, borderRadius: radius.md, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: c.roseDim },
    openBtnText: { color: c.rose, fontSize: 13, fontWeight: '700' },
    previewText: { fontSize: 13, color: c.textSec, marginTop: space.sm, lineHeight: 19 },
    empty: { alignItems: 'center', padding: space.xxl, gap: space.sm },
    emptyText: { fontSize: 14, color: c.muted, textAlign: 'center', lineHeight: 21 },
    fab: {
      position: 'absolute', bottom: 32, right: 24,
      backgroundColor: c.rose, borderRadius: radius.full,
      paddingHorizontal: space.lg, paddingVertical: 14,
      flexDirection: 'row', alignItems: 'center', gap: space.sm,
      shadowColor: c.rose, shadowOpacity: 0.4, shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 }, elevation: 8,
    },
    fabText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    // Read modal
    readOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: space.lg },
    readCard: { backgroundColor: c.surface, borderRadius: radius.xl, padding: space.xl, width: '100%', maxWidth: 380, borderWidth: 1, borderColor: c.line },
    readClose: { position: 'absolute', top: space.md, right: space.md, padding: space.sm },
    readEyebrow: { fontSize: 10, fontWeight: '800', color: c.rose, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4, marginTop: space.sm },
    readLabel: { fontSize: 20, fontWeight: '700', color: c.text, marginBottom: space.lg },
    readContent: { fontSize: 16, color: c.text, lineHeight: 26 },
    readDate: { fontSize: 11, color: c.muted, marginTop: space.xl, textAlign: 'right' },
    // Compose modal
    composeRoot: { flex: 1, backgroundColor: c.bg },
    composePad: { padding: space.lg, gap: space.md },
    composeHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: space.sm },
    composeTitle: { fontSize: 20, fontWeight: '700', color: c.text, flex: 1 },
    composePromptLabel: { fontSize: 16, fontWeight: '700', color: c.text, marginBottom: space.sm },
    composePrompt: { fontSize: 22, fontWeight: '700', color: c.rose, marginBottom: space.sm },
    chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
    chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.full, borderWidth: 1 },
    chipText: { fontSize: 12, fontWeight: '600' },
    customInput: {
      backgroundColor: c.surface2, borderRadius: radius.md,
      height: 48, paddingHorizontal: space.md,
      color: c.text, fontSize: 15, borderWidth: 1, borderColor: c.line,
    },
    contentInput: {
      backgroundColor: c.surface2, borderRadius: radius.md,
      height: 180, paddingHorizontal: space.md, paddingTop: 12,
      color: c.text, fontSize: 15, borderWidth: 1, borderColor: c.line,
      textAlignVertical: 'top',
    },
    fLabel: { fontSize: 11, fontWeight: '700', color: c.textSec, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 },
    sealBtn: { backgroundColor: c.rose, borderRadius: radius.lg, height: 54, alignItems: 'center', justifyContent: 'center' },
    sealBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  });
}

export default function OpenWhenScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { isPaired, isLoading: coupleLoading } = useCouple();
  const s = useMemo(() => makeStyles(colors), [colors]);
  if (coupleLoading) return null;
  if (!isPaired) return <NotConnected message="Open When letters are written for your partner. Connect to get started." />;

  const [received, setReceived] = useState<Letter[]>([]);
  const [written, setWritten] = useState<Letter[]>([]);
  const [showLetter, setShowLetter] = useState<Letter | null>(null);
  const [showCompose, setShowCompose] = useState(false);

  // Compose state
  const [fPrompt, setFPrompt] = useState('');
  const [fCustom, setFCustom] = useState('');
  const [fContent, setFContent] = useState('');
  const [saving, setSaving] = useState(false);

  // Animation for open letter
  const flipAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => { loadLetters(); }, []);

  const loadLetters = async () => {
    try { setWritten(await api.get<Letter[]>('/api/open-when')); } catch { setWritten([]); }
    try { setReceived(await api.get<Letter[]>('/api/open-when/received')); } catch { setReceived([]); }
  };

  const openLetter = (letter: Letter) => {
    setShowLetter(letter);
    flipAnim.setValue(0);
    Animated.spring(flipAnim, { toValue: 1, useNativeDriver: true, damping: 15, stiffness: 120 }).start();
    if (!letter.opened) {
      api.post(`/api/open-when/${letter.open_when_id}/open`).catch(() => {}).then(loadLetters);
    }
  };

  const saveLetter = async () => {
    const label = fPrompt || fCustom.trim();
    if (!label) { Alert.alert('Choose or write a prompt'); return; }
    if (!fContent.trim()) { Alert.alert('Write your message'); return; }
    setSaving(true);
    try {
      await api.post('/api/open-when', { label, content: fContent.trim() });
      setShowCompose(false);
      setFPrompt('');
      setFCustom('');
      setFContent('');
      loadLetters();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not send letter.');
    } finally {
      setSaving(false);
    }
  };

  const scale = flipAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.8, 1.05, 1] });
  const opacity = flipAnim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0, 1] });

  const formatDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return ''; }
  };

  const renderLetter = (letter: Letter, forMe: boolean) => (
    <Pressable
      key={letter.open_when_id}
      style={[
        s.card,
        letter.opened
          ? { opacity: 0.75, borderStyle: 'dashed' as any }
          : { borderColor: colors.rose, borderWidth: 1.2 }
      ]}
      onPress={() => forMe ? openLetter(letter) : null}
    >
      <View style={s.cardRow}>
        <View style={[s.envCircle, { backgroundColor: letter.opened ? colors.goldDim ?? colors.surface2 : colors.roseDim }]}>
          <Text style={s.envEmoji}>{letter.opened ? '📖' : '✉️'}</Text>
        </View>
        <View style={s.cardInfo}>
          <Text style={s.cardEyebrow}>Open when…</Text>
          <Text style={s.cardLabel} numberOfLines={1}>{letter.label}</Text>
          <Text style={s.cardDate}>{formatDate(letter.created_at)}</Text>
        </View>
        <View style={[s.statusBadge, { backgroundColor: letter.opened ? colors.surface2 : colors.roseDim }]}>
          <Text style={[s.statusText, { color: letter.opened ? colors.muted : colors.rose }]}>
            {letter.opened ? 'Read ✓' : 'Sealed 🔒'}
          </Text>
        </View>
      </View>
      {forMe && !letter.opened && (
        <Pressable style={s.openBtn} onPress={() => openLetter(letter)}>
          <Text style={s.openBtnText}>Open letter 💌</Text>
        </Pressable>
      )}
      {letter.opened && forMe && (
        <Text style={s.previewText} numberOfLines={2}>{letter.content}</Text>
      )}
    </Pressable>
  );

  const activeLabel = fPrompt || fCustom.trim();

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, justifyContent: 'center' }}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={s.headerTitle}>Open When… 💌</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {/* Letters for you */}
        <Text style={s.sectionLabel}>Letters for you</Text>
        {received.length === 0 ? (
          <View style={s.empty}>
            <Text style={{ fontSize: 36 }}>✉️</Text>
            <Text style={s.emptyText}>No letters yet. Your partner hasn't written any for you.</Text>
          </View>
        ) : (
          received.map(l => renderLetter(l, true))
        )}

        {/* Letters you wrote */}
        <Text style={s.sectionLabel}>Letters you wrote</Text>
        {written.length === 0 ? (
          <View style={s.empty}>
            <Text style={{ fontSize: 36 }}>📝</Text>
            <Text style={s.emptyText}>Tap below to write your first Open When letter for your partner.</Text>
          </View>
        ) : (
          written.map(l => renderLetter(l, false))
        )}
      </ScrollView>

      <Pressable style={s.fab} onPress={() => setShowCompose(true)}>
        <Ionicons name="pencil-outline" size={18} color="#fff" />
        <Text style={s.fabText}>Write a letter</Text>
      </Pressable>

      {/* Read letter modal */}
      <Modal visible={!!showLetter} animationType="fade" transparent onRequestClose={() => setShowLetter(null)}>
        <View style={s.readOverlay}>
          <Animated.View style={[s.readCard, { transform: [{ scale }], opacity }]}>
            <Pressable style={s.readClose} onPress={() => setShowLetter(null)}>
              <Ionicons name="close" size={22} color={colors.muted} />
            </Pressable>
            <Text style={s.readEyebrow}>Open when…</Text>
            <Text style={s.readLabel}>{showLetter?.label}</Text>
            <Text style={s.readContent}>{showLetter?.content}</Text>
            <Text style={s.readDate}>
              {showLetter?.created_at ? formatDate(showLetter.created_at) : ''}
            </Text>
          </Animated.View>
        </View>
      </Modal>

      {/* Compose modal */}
      <Modal visible={showCompose} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCompose(false)}>
        <SafeAreaView style={s.composeRoot}>
          <ScrollView contentContainerStyle={s.composePad} keyboardShouldPersistTaps="handled">
            <View style={s.composeHeader}>
              <Text style={s.composeTitle}>New letter</Text>
              <Pressable onPress={() => setShowCompose(false)}>
                <Ionicons name="close" size={24} color={colors.muted} />
              </Pressable>
            </View>

            {activeLabel ? (
              <View style={{ marginBottom: space.sm }}>
                <Text style={s.composePromptLabel}>Open when…</Text>
                <Text style={s.composePrompt}>{activeLabel}</Text>
              </View>
            ) : null}

            <Text style={s.fLabel}>Choose a moment</Text>
            <View style={s.chipGrid}>
              {OPEN_WHEN_PROMPTS.map(p => {
                const active = fPrompt === p;
                return (
                  <Pressable
                    key={p}
                    style={[s.chip, { backgroundColor: active ? colors.roseDim : colors.surface2, borderColor: active ? colors.rose : colors.line }]}
                    onPress={() => { setFPrompt(active ? '' : p); setFCustom(''); }}
                  >
                    <Text style={[s.chipText, { color: active ? colors.rose : colors.textSec }]}>{p}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[s.fLabel, { marginTop: space.md }]}>Or write your own moment</Text>
            <TextInput
              style={s.customInput}
              value={fCustom}
              onChangeText={t => { setFCustom(t); if (t) setFPrompt(''); }}
              placeholder="e.g. you're about to give a big presentation"
              placeholderTextColor={colors.muted}
            />

            <Text style={[s.fLabel, { marginTop: space.md }]}>Your message</Text>
            <TextInput
              style={s.contentInput}
              value={fContent}
              onChangeText={setFContent}
              placeholder="Write from the heart…"
              placeholderTextColor={colors.muted}
              multiline
            />

            <Pressable style={[s.sealBtn, saving && { opacity: 0.6 }]} onPress={saveLetter} disabled={saving}>
              <Text style={s.sealBtnText}>{saving ? 'Sealing…' : '💌 Seal & send'}</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
