import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, Dimensions, Image, Modal, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/src/api';
import { DateField } from '@/src/components/DateTimeField';
import { Input } from '@/src/components/Input';
import { NotConnected } from '@/src/components/NotConnected';
import { Press } from '@/src/components/Press';
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

type Memory = { memory_id: string; title: string; memory_date: string; content?: string; media_url?: string; tags?: string[] };

const MEMORY_TAGS = ['First time','Anniversary','Travel','Surprise','Milestone','Everyday magic','Food','Date night'];

function makeStyles(c: Colors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: { flexDirection: 'row', alignItems: 'center', padding: space.lg, gap: space.md },
    emptyBox: { margin: space.lg, alignItems: 'center', gap: space.sm, backgroundColor: c.surface, borderRadius: radius.xl, padding: space.xxl, borderWidth: 1, borderColor: c.line },
    yearLabel: { fontSize: 12, fontWeight: '800', color: c.muted, letterSpacing: 1.6, textTransform: 'uppercase', marginLeft: space.lg + 28, marginTop: space.md, marginBottom: space.xs ?? 4 },
    row: { flexDirection: 'row', paddingHorizontal: space.lg, marginBottom: space.md },
    timeline: { width: 28, alignItems: 'center', paddingTop: 6 },
    dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.rose, marginBottom: 4 },
    line: { flex: 1, width: 2, backgroundColor: c.roseDim, borderRadius: 1 },
    card: { flex: 1, backgroundColor: c.surface, borderRadius: radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: c.line },
    cardImg: { width: '100%', height: 180 },
    cardBody: { padding: space.md },
    cardDate: { fontSize: 11, color: c.muted, marginBottom: 2 },
    cardTitle: { fontSize: 17, fontWeight: '700', color: c.text, marginBottom: 4 },
    cardNote: { fontSize: 13, color: c.textSec, lineHeight: 20 },
    tag: { fontSize: 11, fontWeight: '700', color: c.rose, backgroundColor: c.roseDim, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4 },
    fab: { position: 'absolute', bottom: 32, right: 24, backgroundColor: c.rose, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: c.rose, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
    modalBg: { flex: 1, backgroundColor: c.bg },
    fLabel: { fontSize: 11, fontWeight: '700', color: c.textSec, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 },
    fInput: { backgroundColor: c.surface2, borderRadius: radius.md, height: 48, paddingHorizontal: space.md, color: c.text, fontSize: 15, borderWidth: 1, borderColor: c.line },
    saveBtn: { backgroundColor: c.rose, borderRadius: radius.lg, height: 54, alignItems: 'center', justifyContent: 'center', marginTop: space.md },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    photoPlaceholder: { height: 180, backgroundColor: c.surface2, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.line, borderStyle: 'dashed' },
    sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheetCard: { backgroundColor: c.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingBottom: 32, paddingTop: 20, paddingHorizontal: space.lg },
    sheetTitle: { fontSize: 18, fontWeight: '800', color: c.text, textAlign: 'center', marginBottom: 20 },
    sheetRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface2, borderRadius: radius.lg, padding: space.md, marginBottom: 10, gap: space.md, borderWidth: 1, borderColor: c.line },
    sheetRowIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    sheetRowLabel: { fontSize: 15, fontWeight: '700', color: c.text, marginBottom: 2 },
    sheetRowDesc: { fontSize: 12, color: c.muted },
    sheetCancel: { marginTop: 6, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg, backgroundColor: c.surface2, borderWidth: 1, borderColor: c.line },
  });
}

function groupByYear(memories: Memory[]) {
  const map: Record<string, Memory[]> = {};
  memories.forEach(m => { const y = (m.memory_date || '').slice(0, 4) || '—'; (map[y] ??= []).push(m); });
  return Object.entries(map).sort(([a], [b]) => Number(b) - Number(a));
}

export default function MemoriesScreen() {
  const { colors } = useTheme();
  const { isPaired, isLoading: coupleLoading } = useCouple();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [fTitle, setFTitle] = useState('');
  const [fDate, setFDate] = useState(new Date().toISOString().slice(0, 10));
  const [fNote, setFNote] = useState('');
  const [fTags, setFTags] = useState<string[]>([]);
  const [fPhoto, setFPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showImportSheet, setShowImportSheet] = useState(false);
  const sheetAnim = useRef(new Animated.Value(300)).current;
  const s = useMemo(() => makeStyles(colors), [colors]);

  // Gallery view integrations
  const [tab, setTab] = useState<'timeline' | 'gallery'>('timeline');
  const [photos, setPhotos] = useState<{ id: string; url: string; title?: string }[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [viewingPhoto, setViewingPhoto] = useState<any | null>(null);

  const loadPhotos = async () => {
    setLoadingPhotos(true);
    try {
      const data = await api.get<any[]>('/api/photos');
      setPhotos(data);
    } catch {
      setPhotos([]);
    } finally {
      setLoadingPhotos(false);
    }
  };

  useEffect(() => {
    if (tab === 'gallery') {
      loadPhotos();
    }
  }, [tab]);

  const uploadPhotoToGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (res.canceled || !res.assets[0]) return;
    setSaving(true);
    haptics.light();
    try {
      const { url } = await api.upload(res.assets[0].uri, { mimeType: 'image/jpeg' });
      await api.post('/api/photos', { url, title: '' });
      haptics.success();
      loadPhotos();
    } catch (e: any) {
      haptics.error();
      Alert.alert('Upload failed', e?.message);
    } finally {
      setSaving(false);
    }
  };

  const openImportSheet = () => {
    setShowImportSheet(true);
    Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 200 }).start();
  };
  const closeImportSheet = () => {
    Animated.spring(sheetAnim, { toValue: 300, useNativeDriver: true, damping: 20, stiffness: 200 }).start(() => setShowImportSheet(false));
  };

  useEffect(() => { loadMemories(); }, []);
  const loadMemories = async () => {
    try { setMemories(await api.get<Memory[]>('/api/memories')); }
    catch { setMemories([]); }
  };

  const takePhoto = async () => {
    closeImportSheet();
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera permission denied', 'Go to Settings and allow camera access for OurSpace.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (!result.canceled) setFPhoto(result.assets[0].uri);
  };

  const pickFromGallery = async () => {
    closeImportSheet();
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission denied', 'Go to Settings and allow photo library access for OurSpace.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (!result.canceled) setFPhoto(result.assets[0].uri);
  };

  const pickFromCloud = async () => {
    closeImportSheet();
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission denied', 'Go to Settings and allow photo library access for OurSpace.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (!result.canceled) setFPhoto(result.assets[0].uri);
  };

  const pickPhoto = openImportSheet;

  const save = async () => {
    if (!fTitle.trim()) { Alert.alert('Add a title'); return; }
    setSaving(true);
    try {
      let mediaUrl: string | undefined;
      if (fPhoto) { mediaUrl = (await api.upload(fPhoto, { mimeType: 'image/jpeg' })).url; }
      await api.post('/api/memories', { title: fTitle.trim(), memory_date: fDate, content: fNote || undefined, media_url: mediaUrl, tags: fTags });
      setShowModal(false); setFTitle(''); setFNote(''); setFTags([]); setFPhoto(null);
      loadMemories();
    } catch (e: any) { Alert.alert('Error', e?.message); }
    finally { setSaving(false); }
  };

  const grouped = useMemo(() => groupByYear(memories), [memories]);

  if (coupleLoading) return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={colors.rose} size="large" />
    </View>
  );
  if (!isPaired) return <NotConnected message="Memories are shared with your partner. Connect to get started." />;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <FadeSlide delay={0}>
      <View style={[s.header, { alignItems: 'flex-end' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 32, fontStyle: 'italic', fontWeight: '700', color: colors.text, letterSpacing: -0.5 }}>
            Memory Vault
          </Text>
          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.muted, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 2 }}>
            {tab === 'timeline' ? `${memories.length} SAVED MOMENTS` : `${photos.length} PHOTOS`}
          </Text>
        </View>
        <Pressable
          style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}
          onPress={() => {}}
        >
          <Ionicons name="search-outline" size={18} color={colors.text} />
        </Pressable>
      </View>

      </FadeSlide>

      {/* Segmented Control */}
      <FadeSlide delay={60}>
      <View style={{ flexDirection: 'row', marginHorizontal: space.lg, marginBottom: space.md, backgroundColor: colors.surface2, borderRadius: radius.lg, padding: 4 }}>
        <Press
          onPress={() => { haptics.light(); setTab('timeline'); }}
          style={{ flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: tab === 'timeline' ? colors.surface : 'transparent', borderRadius: radius.md }}
          haptic="none"
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: tab === 'timeline' ? colors.rose : colors.muted }}>Timeline 📝</Text>
        </Press>
        <Press
          onPress={() => { haptics.light(); setTab('gallery'); }}
          style={{ flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: tab === 'gallery' ? colors.surface : 'transparent', borderRadius: radius.md }}
          haptic="none"
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: tab === 'gallery' ? colors.rose : colors.muted }}>Photo Gallery 🖼️</Text>
        </Press>
      </View>
      </FadeSlide>

      {tab === 'timeline' ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
          {memories.length === 0 && (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 16, paddingTop: 80 }}>
              <Text style={{ fontSize: 64 }}>📸</Text>
              <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' }}>Your story starts here</Text>
              <Text style={{ fontSize: 15, color: colors.textSec, textAlign: 'center', lineHeight: 22 }}>Add your first memory together — a photo, a date, a moment worth keeping.</Text>
              <Press
                onPress={() => setShowModal(true)}
                style={{ backgroundColor: colors.rose, borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14, marginTop: 8 }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Add a Memory</Text>
              </Press>
            </View>
          )}
          {grouped.map(([year, items], groupIdx) => (
            <View key={year}>
              <Text style={s.yearLabel}>{year}</Text>
              {items.map((mem, idx) => (
                <FadeSlide key={mem.memory_id} delay={(groupIdx * items.length + idx) * 40}>
                <View style={s.row}>
                  <View style={s.timeline}>
                    <View style={s.dot} />
                    {idx < items.length - 1 && <View style={s.line} />}
                  </View>
                  <View style={{ width: space.sm }} />
                  <View style={[s.card, { marginBottom: 0 }]}>
                    {mem.media_url && <Image source={{ uri: mem.media_url }} style={s.cardImg} resizeMode="cover" />}
                    <View style={s.cardBody}>
                      <Text style={s.cardDate}>{mem.memory_date ? new Date(mem.memory_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : ''}</Text>
                      <Text style={s.cardTitle}>{mem.title}</Text>
                      {mem.content && <Text style={s.cardNote}>{mem.content}</Text>}
                      {mem.tags && mem.tags.length > 0 && (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                          {mem.tags.map(t => <View key={t} style={s.tag}><Text style={{ fontSize: 11, fontWeight: '700', color: colors.rose }}>{t}</Text></View>)}
                        </View>
                      )}
                    </View>
                  </View>
                </View>
                </FadeSlide>
              ))}
            </View>
          ))}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: space.lg }}>
          {loadingPhotos ? (
            <ActivityIndicator color={colors.rose} size="large" style={{ marginTop: 40 }} />
          ) : photos.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 80, gap: 12 }}>
              <Text style={{ fontSize: 64 }}>🖼️</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>No shared photos yet</Text>
              <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 20 }}>
                Upload photos to your shared album or share them in chat to see them here!
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {photos.map((photo) => {
                const size = (Dimensions.get('window').width - 32 - 16) / 3;
                return (
                  <Pressable key={photo.id} onPress={() => setViewingPhoto(photo)}>
                    <Image source={{ uri: photo.url }} style={{ width: size, height: size, borderRadius: radius.md, backgroundColor: colors.surface2 }} />
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}

      <Pressable style={s.fab} onPress={() => { if (tab === 'timeline') { setShowModal(true); } else { uploadPhotoToGallery(); } }}>
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>

      {/* Photo Viewer Modal */}
      <Modal visible={viewingPhoto !== null} transparent animationType="fade" onRequestClose={() => setViewingPhoto(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }} edges={['top', 'bottom']}>
          <View style={{ height: 50, flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: space.lg, alignItems: 'center' }}>
            <Pressable onPress={() => setViewingPhoto(null)} hitSlop={12}>
              <Ionicons name="close" size={28} color="#fff" />
            </Pressable>
          </View>
          {viewingPhoto && (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Image source={{ uri: viewingPhoto.url }} style={{ width: '100%', height: '80%' }} resizeMode="contain" />
              {viewingPhoto.title ? (
                <Text style={{ color: '#fff', fontSize: 16, marginTop: 12, fontWeight: '700', textAlign: 'center' }}>{viewingPhoto.title}</Text>
              ) : null}
            </View>
          )}
        </SafeAreaView>
      </Modal>

      {/* Import sheet */}
      <Modal visible={showImportSheet} transparent animationType="none" onRequestClose={closeImportSheet}>
        <Pressable style={s.sheetOverlay} onPress={closeImportSheet}>
          <Animated.View style={[s.sheetCard, { transform: [{ translateY: sheetAnim }] }]}>
            <Text style={s.sheetTitle}>Add a memory 📸</Text>

            <Pressable style={s.sheetRow} onPress={takePhoto}>
              <View style={[s.sheetRowIcon, { backgroundColor: colors.roseDim }]}>
                <Text style={{ fontSize: 24 }}>📷</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.sheetRowLabel}>Take photo</Text>
                <Text style={s.sheetRowDesc}>Use your camera right now</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>

            <Pressable style={s.sheetRow} onPress={pickFromGallery}>
              <View style={[s.sheetRowIcon, { backgroundColor: colors.surface }]}>
                <Text style={{ fontSize: 24 }}>🖼️</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.sheetRowLabel}>Device gallery</Text>
                <Text style={s.sheetRowDesc}>Choose from your phone's photos</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>

            <Pressable style={s.sheetRow} onPress={pickFromCloud}>
              <View style={[s.sheetRowIcon, { backgroundColor: colors.surface }]}>
                <Text style={{ fontSize: 24 }}>☁️</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.sheetRowLabel}>Cloud storage</Text>
                <Text style={s.sheetRowDesc}>Import from Google Drive, Google Photos, or Dropbox</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>

            <Pressable style={s.sheetCancel} onPress={closeImportSheet}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: colors.muted }}>Cancel</Text>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>

      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={s.modalBg}>
          <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, flex: 1 }}>New memory</Text>
              <Pressable onPress={() => setShowModal(false)}><Ionicons name="close" size={24} color={colors.muted} /></Pressable>
            </View>

            <Pressable style={s.photoPlaceholder} onPress={pickPhoto}>
              {fPhoto ? <Image source={{ uri: fPhoto }} style={{ width: '100%', height: '100%', borderRadius: radius.lg }} resizeMode="cover" /> : (
                <View style={{ alignItems: 'center', gap: space.sm }}>
                  <Ionicons name="camera-outline" size={32} color={colors.muted} />
                  <Text style={{ fontSize: 13, color: colors.muted }}>Add a photo</Text>
                </View>
              )}
            </Pressable>

            <View style={{ gap: 4 }}>
              <Input label="Title" value={fTitle} onChangeText={setFTitle} placeholder="What happened?" />
            </View>
            <DateField label="Date" value={fDate} onChange={setFDate} />
            <View style={{ gap: 4 }}>
              <Text style={s.fLabel}>Note</Text>
              <Input value={fNote} onChangeText={setFNote} placeholder="Tell the story…" multiline numberOfLines={4} />
            </View>
            <View style={{ gap: 4 }}>
              <Text style={s.fLabel}>Tags</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {MEMORY_TAGS.map(t => {
                  const sel = fTags.includes(t);
                  return (
                    <Pressable key={t} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.full, backgroundColor: sel ? colors.roseDim : colors.surface, borderWidth: 1, borderColor: sel ? colors.rose : colors.line }} onPress={() => setFTags(p => sel ? p.filter(x => x !== t) : [...p, t])}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: sel ? colors.rose : colors.textSec }}>{t}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Pressable style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
              <Text style={s.saveBtnText}>{saving ? 'Saving…' : 'Save memory'}</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
