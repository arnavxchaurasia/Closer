import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Animated, FlatList, Linking, Modal, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/src/api';
import { Button } from '@/src/components/Button';
import { Input } from '@/src/components/Input';
import { NotConnected } from '@/src/components/NotConnected';
import { Press } from '@/src/components/Press';
import { useCouple } from '@/src/context/CoupleContext';
import { useTheme } from '@/src/context/ThemeContext';
import { Colors, radius, space } from '@/src/theme';

type WishlistItem = {
  id: string;
  title: string;
  notes?: string;
  price?: number;
  currency?: string;
  url?: string;
  claimed_by?: string | null;
  owner_id: string;
};

type Me = { id: string; name: string };
type Partner = { id: string; name: string };

function FadeSlide({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 320, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 320, delay, useNativeDriver: true }),
    ]).start();
  }, []);
  return <Animated.View style={{ opacity, transform: [{ translateY }] }}>{children}</Animated.View>;
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.md },
    headerTitle: { flex: 1, fontSize: 20, fontWeight: '700', color: c.text },
    headerCount: { fontSize: 14, color: c.muted, fontWeight: '600' },
    backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
    list: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: 120 },
    card: {
      backgroundColor: c.surface, borderRadius: radius.xl, padding: space.md,
      marginBottom: space.md, borderWidth: 1, borderColor: c.line,
    },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
    cardBody: { flex: 1 },
    cardTitle: { fontSize: 16, fontWeight: '700', color: c.text, marginBottom: 2 },
    cardNotes: { fontSize: 13, color: c.textSec, marginTop: 4 },
    cardMeta: { flexDirection: 'row', alignItems: 'center', marginTop: space.sm, gap: space.sm, flexWrap: 'wrap' },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full, backgroundColor: c.surface2 },
    badgeText: { fontSize: 12, color: c.textSec, fontWeight: '600' },
    priceBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full, backgroundColor: c.roseDim },
    priceText: { fontSize: 12, color: c.rose, fontWeight: '700' },
    claimBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1.5, borderColor: c.rose },
    claimText: { fontSize: 12, fontWeight: '700', color: c.rose },
    claimedRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    claimedText: { fontSize: 12, color: c.green, fontWeight: '600' },
    urlBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    urlText: { fontSize: 12, color: c.blue, fontWeight: '600' },
    fab: {
      position: 'absolute', bottom: 32, right: 24,
      width: 56, height: 56, borderRadius: 28,
      backgroundColor: c.rose, alignItems: 'center', justifyContent: 'center',
      shadowColor: c.rose, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8,
    },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: space.md },
    emptyEmoji: { fontSize: 64 },
    emptyText: { fontSize: 16, color: c.textSec, textAlign: 'center', maxWidth: 240, lineHeight: 22 },
    overlay: { flex: 1, backgroundColor: c.overlay, justifyContent: 'flex-end' },
    sheet: { backgroundColor: c.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.lg, gap: space.md },
    sheetTitle: { fontSize: 18, fontWeight: '700', color: c.text, marginBottom: space.sm },
    inputLabel: { fontSize: 11, fontWeight: '700', color: c.textSec, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 },
    input: {
      backgroundColor: c.surface2, borderRadius: radius.md, height: 48,
      paddingHorizontal: space.md, color: c.text, fontSize: 15, borderWidth: 1, borderColor: c.line,
    },
    saveBtn: { backgroundColor: c.rose, borderRadius: radius.lg, height: 50, alignItems: 'center', justifyContent: 'center', marginTop: space.sm },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    cancelBtn: { alignItems: 'center', paddingVertical: space.sm },
    cancelText: { color: c.muted, fontSize: 15 },
  });
}

export default function WishlistScreen() {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { isPaired, isLoading: coupleLoading } = useCouple();

  const [items, setItems] = useState<WishlistItem[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [price, setPrice] = useState('');
  const [url, setUrl] = useState('');

  const load = useCallback(async () => {
    try {
      const [itemsRes, meRes] = await Promise.all([
        api.get<WishlistItem[]>('/api/wishlist'),
        api.get<Me>('/api/me'),
      ]);
      setItems(itemsRes);
      setMe(meRes);
      try {
        const p = await api.get<Partner>('/api/partner');
        setPartner(p);
      } catch {}
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openModal = () => {
    setTitle(''); setNotes(''); setPrice(''); setUrl('');
    setModalVisible(true);
  };

  const saveItem = async () => {
    if (!title.trim()) { Alert.alert('Title required', 'Please enter a title.'); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = { title: title.trim() };
      if (notes.trim()) body.notes = notes.trim();
      if (price.trim()) body.price = parseFloat(price);
      if (url.trim()) body.url = url.trim();
      await api.post('/api/wishlist', body);
      setModalVisible(false);
      await load();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not add item.');
    } finally {
      setSaving(false);
    }
  };

  const claimItem = async (item: WishlistItem) => {
    if (!me) return;
    try {
      await api.put(`/api/wishlist/${item.id}`, { claimed_by: me.id });
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, claimed_by: me.id } : i));
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not claim.');
    }
  };

  const deleteItem = (item: WishlistItem) => {
    Alert.alert('Delete item?', `"${item.title}" will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await api.del(`/api/wishlist/${item.id}`);
            setItems(prev => prev.filter(i => i.id !== item.id));
          } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'Could not delete.');
          }
        },
      },
    ]);
  };

  const formatPrice = (item: WishlistItem) => {
    if (!item.price) return null;
    const sym = item.currency === 'USD' ? '$' : '₹';
    return `${sym}${item.price.toLocaleString()}`;
  };

  const claimedLabel = (item: WishlistItem) => {
    if (!item.claimed_by) return null;
    if (item.claimed_by === me?.id) return 'Claimed by you';
    return `Claimed by ${partner?.name ?? 'partner'}`;
  };

  const renderItem = ({ item, index }: { item: WishlistItem; index: number }) => (
    <FadeSlide delay={index * 60}>
      <Press
        style={s.card}
        haptic="light"
        onLongPress={() => deleteItem(item)}
        delayLongPress={600}
      >
        <View style={s.cardTop}>
          <View style={s.cardBody}>
            <Text style={s.cardTitle}>{item.title}</Text>
            {item.notes ? <Text style={s.cardNotes}>{item.notes}</Text> : null}
            <View style={s.cardMeta}>
              {item.price ? (
                <View style={s.priceBadge}>
                  <Text style={s.priceText}>{formatPrice(item)}</Text>
                </View>
              ) : null}
              {item.url ? (
                <Press haptic="light" onPress={() => Linking.openURL(item.url!)} style={s.urlBtn}>
                  <Ionicons name="link-outline" size={13} color={colors.blue} />
                  <Text style={s.urlText}>Link</Text>
                </Press>
              ) : null}
              {item.claimed_by ? (
                <View style={s.claimedRow}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.green} />
                  <Text style={s.claimedText}>{claimedLabel(item)}</Text>
                </View>
              ) : (
                <Press style={s.claimBtn} haptic="medium" onPress={() => claimItem(item)}>
                  <Text style={s.claimText}>Claim</Text>
                </Press>
              )}
            </View>
          </View>
        </View>
      </Press>
    </FadeSlide>
  );

  if (coupleLoading) return <SafeAreaView style={s.safe} edges={['top']} />;
  if (!isPaired) return <SafeAreaView style={s.safe} edges={['top']}><NotConnected /></SafeAreaView>;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <View style={s.header}>
        <Press style={s.backBtn} haptic="light" onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Press>
        <Text style={s.headerTitle}>Wishlist 🎁</Text>
        {items.length > 0 && <Text style={s.headerCount}>{items.length}</Text>}
      </View>

      {!loading && items.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyEmoji}>🎁</Text>
          <Text style={s.emptyText}>Add things you want to do or buy together</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Press style={s.fab} haptic="medium" onPress={openModal}>
        <Ionicons name="add" size={28} color="#fff" />
      </Press>

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <Press style={s.overlay} haptic="none" onPress={() => setModalVisible(false)}>
          <Press style={s.sheet} haptic="none" onPress={() => {}}>
            <Text style={s.sheetTitle}>Add to wishlist</Text>

            <Input label="Title *" value={title} onChangeText={setTitle} />

            <Input label="Notes" value={notes} onChangeText={setNotes} multiline numberOfLines={3} />

            <View style={{ flexDirection: 'row', gap: space.md }}>
              <View style={{ flex: 1 }}>
                <Input label="Price" value={price} onChangeText={setPrice} keyboardType="numeric" />
              </View>
              <View style={{ flex: 2 }}>
                <Input label="URL" value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" />
              </View>
            </View>

            <Button variant="primary" label={saving ? 'Adding…' : 'Add item'} onPress={saveItem} disabled={saving} loading={saving} fullWidth />
            <Button variant="ghost" label="Cancel" onPress={() => setModalVisible(false)} fullWidth />
          </Press>
        </Press>
      </Modal>
    </SafeAreaView>
  );
}
