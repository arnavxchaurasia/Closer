/**
 * Shared Lists — Movies, TV, Songs, Books, Podcasts, Restaurants, Places, Games.
 * Images fetched from TMDB, iTunes, Open Library, or Groq-generated emoji covers.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, Easing, FlatList, Image,
  Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/src/api';
import { useAuth } from '@/src/context/AuthContext';
import { useCouple } from '@/src/context/CoupleContext';
import { useTheme } from '@/src/context/ThemeContext';
import { haptics } from '@/src/haptics';
import { Colors, TAB_BAR_HEIGHT, radius, space } from '@/src/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type ListStatus = 'want' | 'watching' | 'done' | 'loved';

interface ListItem {
  id: string;
  category: string;
  title: string;
  image_url?: string;
  emoji_cover?: string;
  added_by: string;
  status: ListStatus;
  notes?: string;
  created_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: 'all',         label: 'All',         emoji: '✨' },
  { key: 'movies',      label: 'Movies',       emoji: '🎬' },
  { key: 'tv',          label: 'TV Shows',     emoji: '📺' },
  { key: 'songs',       label: 'Songs',        emoji: '🎵' },
  { key: 'books',       label: 'Books',        emoji: '📚' },
  { key: 'podcasts',    label: 'Podcasts',     emoji: '🎙️' },
  { key: 'restaurants', label: 'Restaurants',  emoji: '🍜' },
  { key: 'places',      label: 'Places',       emoji: '🌍' },
  { key: 'games',       label: 'Games',        emoji: '🎮' },
];

const STATUS_CONFIG: Record<ListStatus, { label: string; color: string }> = {
  want:     { label: 'Want',     color: '#4B7BF5' },
  watching: { label: 'Watching', color: '#F0A835' },
  done:     { label: 'Done',     color: '#5CB87A' },
  loved:    { label: 'Loved ❤️', color: '#E8607A' },
};

const TMDB_API_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY ?? '';

// ─── Image fetching ───────────────────────────────────────────────────────────

async function fetchImageUrl(category: string, title: string): Promise<{ image_url?: string; emoji_cover?: string }> {
  try {
    if (category === 'movies' || category === 'tv') {
      const type = category === 'movies' ? 'movie' : 'tv';
      const url = `https://api.themoviedb.org/3/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&limit=1`;
      const res = await fetch(url);
      const json = await res.json();
      const poster = json.results?.[0]?.poster_path;
      if (poster) return { image_url: `https://image.tmdb.org/t/p/w500${poster}` };
    }
    if (category === 'songs' || category === 'podcasts') {
      const media = category === 'songs' ? 'music' : 'podcast';
      const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(title)}&media=${media}&limit=1`);
      const json = await res.json();
      const artwork = json.results?.[0]?.artworkUrl100;
      if (artwork) return { image_url: artwork.replace('100x100', '500x500') };
    }
    if (category === 'books') {
      return { image_url: `https://covers.openlibrary.org/b/title/${encodeURIComponent(title)}-M.jpg` };
    }
  } catch {}
  return {};
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: Colors) {
  return StyleSheet.create({
    root:       { flex: 1, backgroundColor: c.bg },
    header:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm },
    title:      { fontSize: 28, fontWeight: '900', color: c.text, letterSpacing: -0.8, flex: 1 },
    searchBox:  { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderRadius: radius.lg, marginHorizontal: space.lg, marginBottom: space.sm, paddingHorizontal: space.md, height: 44, borderWidth: 1, borderColor: c.line },
    searchInput:{ flex: 1, color: c.text, fontSize: 15, marginLeft: space.sm },
    tabsRow:    { paddingHorizontal: space.lg, paddingBottom: space.sm },
    tab:        { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.full, backgroundColor: c.surface2, borderWidth: 1, borderColor: c.line, marginRight: space.sm },
    tabActive:  { backgroundColor: c.roseDim, borderColor: c.rose },
    tabTxt:     { fontSize: 12, fontWeight: '700', color: c.textSec },
    tabTxtA:    { color: c.rose },
    grid:       { paddingHorizontal: space.lg, paddingBottom: TAB_BAR_HEIGHT + 80 },
    card:       { flex: 1, backgroundColor: c.surface, borderRadius: radius.lg, overflow: 'hidden', margin: 5, borderWidth: 1, borderColor: c.line },
    cardImg:    { width: '100%', aspectRatio: 2 / 3 },
    cardGrad:   { width: '100%', aspectRatio: 2 / 3, alignItems: 'center', justifyContent: 'center' },
    cardEmojiTxt:{ fontSize: 48 },
    cardBody:   { padding: space.sm },
    cardTitle:  { fontSize: 13, fontWeight: '700', color: c.text },
    addedBadge: { fontSize: 10, color: c.muted, marginTop: 3 },
    statusChip: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full, marginTop: 5 },
    statusTxt:  { fontSize: 10, fontWeight: '800', color: '#fff' },
    fab:        { position: 'absolute', bottom: TAB_BAR_HEIGHT + 20, right: 20, width: 58, height: 58, borderRadius: 29, backgroundColor: c.rose, alignItems: 'center', justifyContent: 'center', shadowColor: c.rose, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
    empty:      { alignItems: 'center', paddingTop: 60, gap: space.md },
    emptyEmoji: { fontSize: 52 },
    emptyTxt:   { fontSize: 16, fontWeight: '700', color: c.textSec, textAlign: 'center' },
    emptySub:   { fontSize: 13, color: c.muted, textAlign: 'center' },

    // Modal
    modalBg:    { flex: 1, backgroundColor: c.bg },
    modalScroll:{ padding: space.lg },
    modalTitle: { fontSize: 22, fontWeight: '800', color: c.text, marginBottom: space.lg },
    label:      { fontSize: 11, fontWeight: '700', color: c.textSec, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6 },
    input:      { backgroundColor: c.surface2, borderRadius: 14, height: 52, paddingHorizontal: space.md, color: c.text, fontSize: 15, borderWidth: 1, borderColor: c.line, marginBottom: space.md },
    textArea:   { backgroundColor: c.surface2, borderRadius: 14, minHeight: 80, padding: space.md, color: c.text, fontSize: 15, borderWidth: 1, borderColor: c.line, marginBottom: space.md, textAlignVertical: 'top' },
    catRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
    catPill:    { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.full, backgroundColor: c.surface2, borderWidth: 1, borderColor: c.line },
    catPillA:   { backgroundColor: c.roseDim, borderColor: c.rose },
    catPillTxt: { fontSize: 12, fontWeight: '700', color: c.textSec },
    catPillTxtA:{ color: c.rose },
    previewImg: { width: '100%', height: 200, borderRadius: radius.md, marginBottom: space.md, resizeMode: 'cover' },
    previewEmoji:{ width: '100%', height: 200, borderRadius: radius.md, marginBottom: space.md, alignItems: 'center', justifyContent: 'center' },
    previewEmojiTxt: { fontSize: 80 },
    saveBtn:    { backgroundColor: c.rose, borderRadius: 16, height: 56, alignItems: 'center', justifyContent: 'center', marginTop: space.sm },
    saveBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
    saveBtnDis: { opacity: 0.5 },
  });
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function ItemCard({ item, onLongPress, colors, s }: { item: ListItem; onLongPress: () => void; colors: any; s: any }) {
  const statusCfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.want;
  const cat = CATEGORIES.find(c => c.key === item.category);

  return (
    <Pressable style={s.card} onLongPress={onLongPress} delayLongPress={400}>
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} style={s.cardImg} />
      ) : (
        <LinearGradient
          colors={['#1D1F2E', '#252739']}
          style={s.cardGrad}
        >
          <Text style={s.cardEmojiTxt}>{item.emoji_cover ?? cat?.emoji ?? '✨'}</Text>
        </LinearGradient>
      )}
      <View style={s.cardBody}>
        <Text style={s.cardTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={s.addedBadge}>by {item.added_by}</Text>
        <View style={[s.statusChip, { backgroundColor: statusCfg.color }]}>
          <Text style={s.statusTxt}>{statusCfg.label}</Text>
        </View>
      </View>
    </Pressable>
  );
}

// ─── Add modal ────────────────────────────────────────────────────────────────

function AddModal({ visible, onClose, onSave, colors, s }: {
  visible: boolean; onClose: () => void;
  onSave: (data: { title: string; category: string; status: ListStatus; notes: string; image_url?: string; emoji_cover?: string }) => void;
  colors: any; s: any;
}) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('movies');
  const [status, setStatus] = useState<ListStatus>('want');
  const [notes, setNotes] = useState('');
  const [fetchedImage, setFetchedImage] = useState<string | undefined>();
  const [fetchedEmoji, setFetchedEmoji] = useState<string | undefined>();
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) { setTitle(''); setCategory('movies'); setStatus('want'); setNotes(''); setFetchedImage(undefined); setFetchedEmoji(undefined); }
  }, [visible]);

  useEffect(() => {
    if (!title.trim() || title.trim().length < 2) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setFetching(true);
      const result = await fetchImageUrl(category, title.trim());
      setFetchedImage(result.image_url);
      setFetchedEmoji(result.emoji_cover);
      setFetching(false);
    }, 800);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [title, category]);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    onSave({ title: title.trim(), category, status, notes, image_url: fetchedImage, emoji_cover: fetchedEmoji });
    setSaving(false);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.modalBg}>
        <ScrollView contentContainerStyle={s.modalScroll} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.lg }}>
            <Text style={[s.modalTitle, { marginBottom: 0, flex: 1 }]}>Add to list</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.muted} />
            </Pressable>
          </View>

          <Text style={s.label}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: space.md }}>
            <View style={s.catRow}>
              {CATEGORIES.filter(c => c.key !== 'all').map(c => (
                <Pressable key={c.key} style={[s.catPill, category === c.key && s.catPillA]} onPress={() => setCategory(c.key)}>
                  <Text style={[s.catPillTxt, category === c.key && s.catPillTxtA]}>{c.emoji} {c.label}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <Text style={s.label}>Title</Text>
          <TextInput
            style={s.input}
            value={title}
            onChangeText={setTitle}
            placeholder={`Search for a ${CATEGORIES.find(c => c.key === category)?.label.toLowerCase() ?? 'item'}…`}
            placeholderTextColor={colors.muted}
            autoFocus
          />

          {fetching && <ActivityIndicator color={colors.rose} style={{ marginBottom: space.md }} />}
          {fetchedImage && !fetching && (
            <Image source={{ uri: fetchedImage }} style={s.previewImg} />
          )}
          {!fetchedImage && fetchedEmoji && !fetching && (
            <LinearGradient colors={['#1D1F2E', '#252739']} style={s.previewEmoji}>
              <Text style={s.previewEmojiTxt}>{fetchedEmoji}</Text>
            </LinearGradient>
          )}

          <Text style={s.label}>Status</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md }}>
            {(Object.entries(STATUS_CONFIG) as [ListStatus, { label: string; color: string }][]).map(([key, cfg]) => (
              <Pressable
                key={key}
                onPress={() => setStatus(key)}
                style={[s.catPill, status === key && { backgroundColor: cfg.color + '30', borderColor: cfg.color }]}
              >
                <Text style={[s.catPillTxt, status === key && { color: cfg.color }]}>{cfg.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={s.label}>Notes (optional)</Text>
          <TextInput
            style={s.textArea}
            value={notes}
            onChangeText={setNotes}
            placeholder="Add a note…"
            placeholderTextColor={colors.muted}
            multiline
          />

          <Pressable style={[s.saveBtn, (saving || !title.trim()) && s.saveBtnDis]} onPress={handleSave} disabled={saving || !title.trim()}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnTxt}>Add to our list ✨</Text>}
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function SharedListsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { isPaired } = useCouple();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const fabAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fabAnim, { toValue: 1, duration: 600, delay: 200, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }).start();
  }, []);

  const load = useCallback(async () => {
    try {
      const params = activeCategory !== 'all' ? `?category=${activeCategory}` : '';
      const data = await api.get<ListItem[]>(`/api/lists${params}`);
      setItems(data);
    } catch {}
    setLoading(false);
  }, [activeCategory]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const handleAdd = async (data: { title: string; category: string; status: ListStatus; notes: string; image_url?: string; emoji_cover?: string }) => {
    haptics.light();
    try {
      const item = await api.post<ListItem>('/api/lists/item', {
        ...data,
        added_by: user?.name ?? 'You',
      });
      setItems(prev => [item, ...prev]);
      setShowAdd(false);
      haptics.success();
    } catch {
      Alert.alert('Could not add item');
    }
  };

  const handleLongPress = (item: ListItem) => {
    haptics.medium();
    Alert.alert(
      item.title,
      'Update status or remove?',
      [
        { text: 'Cancel', style: 'cancel' },
        ...(['want', 'watching', 'done', 'loved'] as ListStatus[]).map(st => ({
          text: STATUS_CONFIG[st].label,
          onPress: async () => {
            try {
              await api.put(`/api/lists/${item.id}/status`, { status: st });
              setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: st } : i));
              haptics.success();
            } catch {}
          },
        })),
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            try {
              await api.del(`/api/lists/${item.id}`);
              setItems(prev => prev.filter(i => i.id !== item.id));
              haptics.light();
            } catch {}
          },
        },
      ],
    );
  };

  const filtered = useMemo(() => {
    let list = items;
    if (activeCategory !== 'all') list = list.filter(i => i.category === activeCategory);
    if (search.trim()) list = list.filter(i => i.title.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [items, activeCategory, search]);

  const activeCat = CATEGORIES.find(c => c.key === activeCategory);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[s.title, { marginLeft: space.sm }]}>Our Lists</Text>
      </View>

      {/* Search bar */}
      <View style={s.searchBox}>
        <Ionicons name="search-outline" size={18} color={colors.muted} />
        <TextInput
          style={s.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search list…"
          placeholderTextColor={colors.muted}
        />
        {search ? <Pressable onPress={() => setSearch('')}><Ionicons name="close-circle" size={18} color={colors.muted} /></Pressable> : null}
      </View>

      {/* Category tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabsRow}>
        {CATEGORIES.map(cat => (
          <Pressable
            key={cat.key}
            style={[s.tab, activeCategory === cat.key && s.tabActive]}
            onPress={() => { haptics.light(); setActiveCategory(cat.key); }}
          >
            <Text style={[s.tabTxt, activeCategory === cat.key && s.tabTxtA]}>{cat.emoji} {cat.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Grid */}
      {loading ? (
        <ActivityIndicator color={colors.rose} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={filtered}
          numColumns={2}
          keyExtractor={i => i.id}
          contentContainerStyle={[s.grid, filtered.length === 0 && { flex: 1, justifyContent: 'center' }]}
          renderItem={({ item }) => (
            <View style={{ flex: 1 }}>
              <ItemCard item={item} onLongPress={() => handleLongPress(item)} colors={colors} s={s} />
            </View>
          )}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyEmoji}>{activeCat?.emoji ?? '✨'}</Text>
              <Text style={s.emptyTxt}>Nothing here yet</Text>
              <Text style={s.emptySub}>Tap + to add your first {activeCat?.key !== 'all' ? activeCat?.label.toLowerCase() : 'item'}!</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* FAB */}
      <Animated.View style={[s.fab, { transform: [{ scale: fabAnim }] }]}>
        <Pressable onPress={() => { haptics.light(); setShowAdd(true); }} style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="add" size={32} color="#fff" />
        </Pressable>
      </Animated.View>

      <AddModal visible={showAdd} onClose={() => setShowAdd(false)} onSave={handleAdd} colors={colors} s={s} />
    </SafeAreaView>
  );
}
