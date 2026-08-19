/**
 * Time Capsule — write messages to your future selves ⏳
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  Alert, Animated, FlatList, Image, Modal, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/src/api';
import { useTheme } from '@/src/context/ThemeContext';
import { haptics } from '@/src/haptics';
import { radius, space } from '@/src/theme';

interface Capsule {
  id: string;
  opens_at: string;
  message: string | null;
  media_url?: string | null;
  unlocked: boolean;
  author_id: string;
  created_at: string;
}

function daysUntil(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86400000));
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

const QUICK_OPTIONS = [
  { label: 'In 30 days', days: 30 },
  { label: 'In 90 days', days: 90 },
  { label: 'In 6 months', days: 183 },
  { label: 'In 1 year', days: 365 },
];

function addDays(d: number): string {
  const dt = new Date();
  dt.setDate(dt.getDate() + d);
  return dt.toISOString();
}

function RevealAnim({ children }: { children: React.ReactNode }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);
  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      {children}
    </Animated.View>
  );
}

export default function TimeCapsuleScreen() {
  const { colors } = useTheme();
  const [capsules, setCapsules] = useState<Capsule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [draft, setDraft] = useState('');
  const [selectedDays, setSelectedDays] = useState<number | null>(30);
  const [saving, setSaving] = useState(false);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [capsulePhoto, setCapsulePhoto] = useState<string | null>(null);

  const load = async () => {
    try {
      const data = await api.get<Capsule[]>('/api/time-capsules');
      setCapsules(data);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!draft.trim() || !selectedDays) return;
    setSaving(true);
    haptics.medium();
    try {
      let mediaUrl: string | undefined;
      if (capsulePhoto) {
        const uploadRes = await api.upload(capsulePhoto, { mimeType: 'image/jpeg' });
        mediaUrl = uploadRes.url;
      }
      await api.post('/api/time-capsules', {
        message: draft.trim(),
        opens_at: addDays(selectedDays),
        media_url: mediaUrl,
      });
      haptics.success();
      setShowModal(false);
      setDraft('');
      setSelectedDays(30);
      setCapsulePhoto(null);
      load();
    } catch {
      haptics.error();
      Alert.alert('Error', 'Could not create capsule.');
    } finally { setSaving(false); }
  };

  const openCapsule = (capsule: Capsule) => {
    if (!capsule.unlocked) return;
    haptics.success();
    if (openedId !== capsule.id) {
      api.post(`/api/time-capsules/${capsule.id}/open`).catch(() => {});
    }
    setOpenedId(openedId === capsule.id ? null : capsule.id);
  };

  // Parchment-ish palette (works in dark too via semi-transparent overlays)
  const parchment = '#FDF6E3';
  const sepia = '#8B6914';
  const sepiaLight = '#C8A85A';

  return (
    <SafeAreaView style={[s.container, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      {/* Warm parchment tint overlay */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#FDF6E315' }]} pointerEvents="none" />

      {/* Header */}
      <View style={[s.headerRow]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: colors.text }]}>Time Capsule ⏳</Text>
          <Text style={[s.subtitle, { color: colors.muted }]}>Messages to your future selves</Text>
        </View>
      </View>

      <FlatList
        data={capsules}
        keyExtractor={c => c.id}
        contentContainerStyle={{ padding: space.lg, paddingBottom: 120, gap: space.md }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          !loading ? (
            <View style={{ alignItems: 'center', paddingTop: 80, gap: space.md }}>
              <Text style={{ fontSize: 64 }}>⏳</Text>
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, textAlign: 'center' }}>
                No capsules yet
              </Text>
              <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20 }}>
                Write something to your future selves.{'\n'}It&apos;ll be waiting.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const isOpen = openedId === item.id;
          return (
            <Pressable
              onPress={() => openCapsule(item)}
              style={[
                s.capsuleCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: item.unlocked ? sepiaLight : colors.line,
                  borderWidth: item.unlocked ? 1.5 : 1,
                },
              ]}
            >
              {/* Parchment tint on unlocked cards */}
              {item.unlocked && (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: '#FDF6E308', borderRadius: radius.lg }]} pointerEvents="none" />
              )}

              <View style={s.capsuleHeader}>
                <Text style={{ fontSize: 28 }}>{item.unlocked ? '📭' : '🔒'}</Text>
                <View style={{ flex: 1, marginLeft: space.md }}>
                  <Text style={[s.capsuleDate, { color: item.unlocked ? sepia : colors.textSec }]}>
                    {item.unlocked ? `Opened ${fmtDate(item.opens_at)}` : `Opens ${fmtDate(item.opens_at)}`}
                  </Text>
                  {item.unlocked && (
                    <Text style={{ fontSize: 12, color: sepiaLight, marginTop: 2, fontWeight: '600' }}>
                      Tap to {isOpen ? 'close' : 'read'}
                    </Text>
                  )}
                </View>
                {item.unlocked && (
                  <Ionicons
                    name={isOpen ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={sepiaLight}
                  />
                )}
              </View>

              {!item.unlocked && (() => {
                const start = new Date(item.created_at).getTime();
                const end = new Date(item.opens_at).getTime();
                const total = end - start;
                const pct = total <= 0 ? 1 : Math.min(1, Math.max(0, (Date.now() - start) / total));
                return (
                  <View style={{ marginTop: space.md, gap: 4 }}>
                    <View style={{ height: 6, backgroundColor: colors.surface3 ?? colors.line, borderRadius: 3, overflow: 'hidden', width: '100%' }}>
                      <View style={{ height: 6, backgroundColor: colors.gold, borderRadius: 3, width: `${Math.round(pct * 100)}%` as any }} />
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, color: colors.muted }}>Sealed {fmtDate(item.created_at)}</Text>
                      <Text style={{ fontSize: 11, color: colors.gold, fontWeight: '700' }}>{daysUntil(item.opens_at)} days left</Text>
                    </View>
                  </View>
                );
              })()}

              {/* Message reveal */}
              {item.unlocked && isOpen && (item.message || item.media_url) && (
                <RevealAnim>
                  <View style={[s.messageBox, { borderTopColor: `${sepiaLight}40` }]}>
                    <Text style={{ fontSize: 13, color: colors.muted, marginBottom: space.sm, fontWeight: '700', letterSpacing: 0.5 }}>
                      FROM YOUR PAST SELVES
                    </Text>
                    {item.media_url && (
                      <Image source={{ uri: item.media_url }} style={{ width: '100%', height: 180, borderRadius: radius.md, marginBottom: space.sm }} resizeMode="cover" onError={() => {}} />
                    )}
                    {item.message ? (
                      <Text style={[s.messageText, { color: colors.text }]}>
                        &quot;{item.message}&quot;
                      </Text>
                    ) : null}
                    <Text style={{ fontSize: 11, color: colors.muted, marginTop: space.sm, textAlign: 'right' }}>
                      Written {fmtDate(item.created_at)}
                    </Text>
                  </View>
                </RevealAnim>
              )}
            </Pressable>
          );
        }}
      />

      {/* FAB */}
      <Pressable
        onPress={() => { haptics.light(); setShowModal(true); }}
        style={[s.fab, { backgroundColor: colors.gold }]}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>

      {/* Create modal */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setShowModal(false)} />
        <View style={[s.modal, { backgroundColor: colors.surface }]}>
          <View style={[s.dragHandle, { backgroundColor: colors.line }]} />
          <Text style={[s.modalTitle, { color: colors.text }]}>New Time Capsule ⏳</Text>
          <Text style={[s.modalSubtitle, { color: colors.muted }]}>
            Write to your future selves
          </Text>

          <TextInput
            autoFocus
            multiline
            value={draft}
            onChangeText={setDraft}
            placeholder="Dear future us…"
            placeholderTextColor={colors.muted}
            maxLength={2000}
            style={[s.textInput, { backgroundColor: colors.surface2, color: colors.text, borderColor: colors.line }]}
          />
          <Text style={[s.charCount, { color: colors.muted, marginBottom: space.md }]}>{draft.length}/2000</Text>

          <Pressable 
            onPress={async () => {
              const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (status !== 'granted') {
                Alert.alert('Permission needed', 'Allow access to your photo library.');
                return;
              }
              const res = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                quality: 0.8,
              });
              if (!res.canceled && res.assets[0]) {
                setCapsulePhoto(res.assets[0].uri);
              }
            }}
            style={{ 
              height: 70, 
              backgroundColor: colors.surface2, 
              borderRadius: radius.md, 
              borderWidth: 1, 
              borderColor: colors.line, 
              borderStyle: 'dashed', 
              alignItems: 'center', 
              justifyContent: 'center',
              marginBottom: space.md,
              overflow: 'hidden'
            }}
          >
            {capsulePhoto ? (
              <Image source={{ uri: capsulePhoto }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            ) : (
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <Ionicons name="camera-outline" size={20} color={colors.rose} />
                <Text style={{ fontSize: 13, color: colors.muted }}>Attach a photo (optional)</Text>
              </View>
            )}
          </Pressable>

          <Text style={[s.pickLabel, { color: colors.textSec }]}>Opens in</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: space.md }}>
            <View style={{ flexDirection: 'row', gap: space.sm, paddingHorizontal: 2 }}>
              {QUICK_OPTIONS.map(opt => (
                <Pressable
                  key={opt.days}
                  onPress={() => setSelectedDays(opt.days)}
                  style={[
                    s.chip,
                    {
                      backgroundColor: selectedDays === opt.days ? colors.gold : colors.surface2,
                      borderColor: selectedDays === opt.days ? colors.gold : colors.line,
                    },
                  ]}
                >
                  <Text style={{ color: selectedDays === opt.days ? '#fff' : colors.textSec, fontSize: 13, fontWeight: '700' }}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <Pressable
            onPress={create}
            disabled={saving || !draft.trim() || !selectedDays}
            style={[s.createBtn, { backgroundColor: draft.trim() && selectedDays ? colors.gold : colors.muted }]}
          >
            <Text style={s.createBtnText}>{saving ? 'Sealing…' : 'Seal the capsule ✨'}</Text>
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.md,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '900', letterSpacing: -0.4 },
  subtitle: { fontSize: 12, marginTop: 2 },
  capsuleCard: {
    borderRadius: radius.lg, padding: space.lg, overflow: 'hidden',
  },
  capsuleHeader: { flexDirection: 'row', alignItems: 'center' },
  capsuleDate: { fontSize: 14, fontWeight: '700' },
  messageBox: {
    marginTop: space.md, paddingTop: space.md, borderTopWidth: 1,
  },
  messageText: { fontSize: 15, lineHeight: 24, fontStyle: 'italic' },
  fab: {
    position: 'absolute', bottom: 32, right: 24,
    width: 58, height: 58, borderRadius: 29,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  modal: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: space.lg, paddingBottom: 44,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 }, elevation: 20,
  },
  dragHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: space.lg },
  modalTitle: { fontSize: 20, fontWeight: '900', marginBottom: 4 },
  modalSubtitle: { fontSize: 13, marginBottom: space.md },
  textInput: {
    borderRadius: radius.md, padding: space.md,
    fontSize: 15, lineHeight: 22, fontStyle: 'italic',
    minHeight: 120, borderWidth: 1, marginBottom: space.xs,
    textAlignVertical: 'top',
  },
  charCount: { fontSize: 11, textAlign: 'right', marginBottom: space.md },
  pickLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginBottom: space.sm },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: radius.full ?? 99, borderWidth: 1,
  },
  createBtn: {
    borderRadius: radius.md, height: 52,
    alignItems: 'center', justifyContent: 'center',
    marginTop: space.sm,
  },
  createBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
