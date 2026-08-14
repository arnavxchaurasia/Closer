import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Animated, FlatList, Modal, Pressable, ScrollView,
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

type PaidBy = 'me' | 'partner';
type Split = '50/50' | 'all_me' | 'all_partner';
type Category = 'food' | 'travel' | 'home' | 'fun' | 'health' | 'shopping' | 'utilities' | 'general';

type Expense = {
  id: string;
  title: string;
  amount: number;
  paid_by: PaidBy;
  split: Split;
  date?: string;
  category?: Category;
  created_at: string;
};

type ExpensesResponse = { items: Expense[]; balance: number };

type Summary = {
  month_total: number;
  balance: number;
  by_category: Record<string, number>;
  last_settled_at: string | null;
};

const CATEGORY_EMOJI: Record<string, string> = {
  food: '🍔', travel: '✈️', home: '🏠', fun: '🎬',
  health: '💊', shopping: '🛍️', utilities: '⚡', general: '💰',
};

const CATEGORY_COLOR: Record<string, string> = {
  food: '#F59E0B', travel: '#3B82F6', home: '#8B5CF6', fun: '#EC4899',
  health: '#10B981', shopping: '#F97316', utilities: '#6366F1', general: '#6B7280',
};

const CATEGORIES: Category[] = ['food', 'travel', 'home', 'fun', 'health', 'shopping', 'utilities', 'general'];

const SPLIT_LABELS: Record<Split, string> = {
  '50/50': '50/50',
  all_me: 'I pay all',
  all_partner: 'They pay all',
};

function makeStyles(c: Colors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm, gap: space.sm },
    title: { fontSize: 20, fontWeight: '800', color: c.text, flex: 1 },

    // Hero card
    heroCard: { marginHorizontal: space.lg, marginBottom: space.md, borderRadius: 24, padding: space.lg, gap: 4 },
    heroMonthLbl: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)' },
    heroMonthAmt: { fontSize: 40, fontWeight: '900', letterSpacing: -1.5, color: '#fff' },
    heroDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 10 },
    heroBalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    heroBalLbl: { fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
    heroBalAmt: { fontSize: 17, fontWeight: '900', color: '#fff' },
    settleBtn: { marginTop: 14, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: radius.lg, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
    settleTxt: { fontSize: 14, fontWeight: '800', color: '#fff' },

    // Category breakdown
    catSection: { marginHorizontal: space.lg, marginBottom: space.lg },
    catSecLbl: { fontSize: 11, fontWeight: '800', color: c.muted, letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 12 },
    catRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
    catLabel: { fontSize: 13, fontWeight: '600', color: c.text, width: 90 },
    catBarBg: { flex: 1, height: 8, backgroundColor: c.surface2, borderRadius: 4, overflow: 'hidden' },
    catBarFill: { height: 8, borderRadius: 4 },
    catAmt: { fontSize: 12, fontWeight: '700', color: c.muted, width: 60, textAlign: 'right' },

    // Balance hero (old — kept for fallback)
    balCard: { marginHorizontal: space.lg, marginBottom: space.md, borderRadius: 24, padding: space.lg, alignItems: 'center', gap: 6 },
    balLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
    balAmount: { fontSize: 40, fontWeight: '900', letterSpacing: -1.5 },
    balSub: { fontSize: 13, fontWeight: '500' },

    // Expense row
    expRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: c.line, gap: space.md },
    catEmoji: { fontSize: 26, width: 38, textAlign: 'center' },
    expInfo: { flex: 1 },
    expTitle: { fontSize: 15, fontWeight: '700', color: c.text },
    expMeta: { fontSize: 12, color: c.muted, marginTop: 2 },
    expAmount: { fontSize: 16, fontWeight: '800', color: c.text },

    // Empty
    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.xxl },
    emptyTxt: { fontSize: 15, color: c.muted, textAlign: 'center', fontWeight: '500' },

    // FAB
    fab: { position: 'absolute', bottom: 100, right: 24, backgroundColor: c.rose, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: c.rose, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },

    // Modal
    modalBg: { flex: 1, backgroundColor: c.bg },
    fLabel: { fontSize: 11, fontWeight: '700', color: c.textSec, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6 },
    fInput: { backgroundColor: c.surface2, borderRadius: radius.md, height: 48, paddingHorizontal: space.md, color: c.text, fontSize: 15, borderWidth: 1, borderColor: c.line },
    seg: { flexDirection: 'row', backgroundColor: c.surface, borderRadius: radius.lg, padding: 3, borderWidth: 1, borderColor: c.line },
    segBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.md },
    segActive: { backgroundColor: c.rose },
    segTxt: { fontSize: 13, fontWeight: '700', color: c.muted },
    segTxtActive: { color: '#fff' },
    saveBtn: { backgroundColor: c.rose, borderRadius: radius.lg, height: 54, alignItems: 'center', justifyContent: 'center', marginTop: space.md },
    saveTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
    catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    catBtn: { width: 56, height: 56, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface, borderWidth: 1, borderColor: c.line },
    catBtnActive: { backgroundColor: c.roseDim, borderColor: c.rose },
  });
}

function fmtAmount(n: number) {
  return `₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function ExpensesScreen() {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { isPaired, isLoading: coupleLoading } = useCouple();

  const [items, setItems] = useState<Expense[]>([]);
  const [balance, setBalance] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settling, setSettling] = useState(false);

  // Form state
  const [fTitle, setFTitle] = useState('');
  const [fAmount, setFAmount] = useState('');
  const [fPaidBy, setFPaidBy] = useState<PaidBy>('me');
  const [fSplit, setFSplit] = useState<Split>('50/50');
  const [fCategory, setFCategory] = useState<Category>('general');

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const [data, sum] = await Promise.all([
        api.get<ExpensesResponse>('/api/expenses'),
        api.get<Summary>('/api/expenses/summary').catch(() => null),
      ]);
      setItems(data.items ?? []);
      setBalance(data.balance ?? 0);
      if (sum) setSummary(sum);
    } catch { setItems([]); setBalance(0); }
  };

  const openModal = () => {
    setFTitle(''); setFAmount(''); setFPaidBy('me'); setFSplit('50/50'); setFCategory('general');
    setShowModal(true);
  };

  const save = async () => {
    const amt = parseFloat(fAmount);
    if (!fTitle.trim() || isNaN(amt) || amt <= 0) {
      Alert.alert('Please fill in a title and valid amount'); return;
    }
    setSaving(true);
    haptics.light();
    try {
      await api.post('/api/expenses', { title: fTitle.trim(), amount: amt, paid_by: fPaidBy, split: fSplit, category: fCategory });
      setShowModal(false);
      await load();
      haptics.success();
    } catch (e: any) { Alert.alert('Error', e?.message); haptics.error(); }
    finally { setSaving(false); }
  };

  const settleUp = async () => {
    if (Math.abs(balance) < 0.01) return;
    haptics.warning();
    Alert.alert('Settle up?', 'This will mark all debts as cleared.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Settle', style: 'default',
        onPress: async () => {
          setSettling(true);
          try {
            await api.post('/api/expenses/settle', {});
            haptics.success();
            await load();
          } catch { haptics.error(); Alert.alert('Could not settle'); }
          finally { setSettling(false); }
        },
      },
    ]);
  };

  const confirmDelete = (item: Expense) => {
    haptics.warning();
    Alert.alert('Delete expense?', `"${item.title}" — ${fmtAmount(item.amount)}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try { await api.del(`/api/expenses/${item.id}`); await load(); }
          catch { haptics.error(); }
        },
      },
    ]);
  };

  // Hero card
  const monthTotal = summary?.month_total ?? 0;
  const summaryBalance = summary?.balance ?? balance;
  const settled = Math.abs(summaryBalance) < 0.01;
  const partnerOwes = summaryBalance > 0;
  const heroGradient: [string, string] = settled
    ? [colors.surface, colors.surface2]
    : partnerOwes
    ? ['#10B981', '#059669']
    : [colors.rose, '#C2185B'];

  // Category breakdown
  const byCategory = summary?.by_category ?? {};
  const catTotal = Object.values(byCategory).reduce((a, b) => a + b, 0) || 1;
  const catEntries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);

  const renderItem = ({ item }: { item: Expense }) => (
    <Pressable style={s.expRow} onLongPress={() => confirmDelete(item)} delayLongPress={500}>
      <Text style={s.catEmoji}>{CATEGORY_EMOJI[item.category ?? 'general']}</Text>
      <View style={s.expInfo}>
        <Text style={s.expTitle}>{item.title}</Text>
        <Text style={s.expMeta}>
          Paid by {item.paid_by === 'me' ? 'you' : 'partner'} · {SPLIT_LABELS[item.split]}
          {item.date ? ` · ${fmtDate(item.date)}` : item.created_at ? ` · ${fmtDate(item.created_at)}` : ''}
        </Text>
      </View>
      <Text style={s.expAmount}>{fmtAmount(item.amount)}</Text>
    </Pressable>
  );

  const ListHeader = () => (
    <>
      {/* Hero card */}
      <FadeSlide delay={0}>
      <View style={[s.heroCard, { backgroundColor: heroGradient[0] }]}>
        <Text style={s.heroMonthLbl}>This month</Text>
        <Text style={s.heroMonthAmt}>{fmtAmount(monthTotal)}</Text>
        <View style={s.heroDivider} />
        <View style={s.heroBalRow}>
          <Text style={s.heroBalLbl}>
            {settled ? 'All settled ✓' : partnerOwes ? 'Partner owes you' : 'You owe partner'}
          </Text>
          {!settled && <Text style={s.heroBalAmt}>{fmtAmount(summaryBalance)}</Text>}
        </View>
        {!settled && (
          <Pressable style={[s.settleBtn, settling && { opacity: 0.6 }]} onPress={settleUp} disabled={settling}>
            <Text style={s.settleTxt}>{settling ? 'Settling…' : '✅ Settle Up'}</Text>
          </Pressable>
        )}
      </View>
      </FadeSlide>

      {/* Category breakdown */}
      {catEntries.length > 0 && (
        <View style={s.catSection}>
          <Text style={s.catSecLbl}>By category</Text>
          {catEntries.map(([cat, amt]) => (
            <View key={cat} style={s.catRow}>
              <Text style={s.catLabel}>{CATEGORY_EMOJI[cat] ?? '💰'} {cat}</Text>
              <View style={s.catBarBg}>
                <View style={[s.catBarFill, { width: `${(amt / catTotal) * 100}%`, backgroundColor: CATEGORY_COLOR[cat] ?? colors.rose }]} />
              </View>
              <Text style={s.catAmt}>{fmtAmount(amt)}</Text>
            </View>
          ))}
        </View>
      )}

      {items.length > 0 && (
        <Text style={[s.catSecLbl, { marginHorizontal: space.lg, marginBottom: 8 }]}>All expenses</Text>
      )}
    </>
  );

  if (coupleLoading) return <SafeAreaView style={s.root} edges={['top']} />;
  if (!isPaired) return <SafeAreaView style={s.root} edges={['top']}><NotConnected /></SafeAreaView>;

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={s.title}>Expenses 💸</Text>
        <Press haptic="light" onPress={openModal}>
          <Ionicons name="add-circle" size={28} color={colors.rose} />
        </Press>
      </View>

      {/* List */}
      <FlatList
        data={items}
        keyExtractor={i => i.id}
        renderItem={renderItem}
        ListHeaderComponent={<ListHeader />}
        contentContainerStyle={items.length === 0 ? { flexGrow: 1 } : { paddingBottom: 140 }}
        ListEmptyComponent={
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 16, paddingTop: 40 }}>
            <Text style={{ fontSize: 64 }}>💸</Text>
            <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' }}>Split expenses, stay fair</Text>
            <Text style={{ fontSize: 15, color: colors.textSec, textAlign: 'center', lineHeight: 22 }}>Track what you spend together so settling up is always easy.</Text>
            <Pressable
              onPress={openModal}
              style={{ backgroundColor: colors.rose, borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14, marginTop: 8 }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Add an Expense</Text>
            </Pressable>
          </View>
        }
      />

      {/* FAB */}
      <Pressable style={s.fab} onPress={openModal}>
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>

      {/* Add Expense Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={s.modalBg}>
          <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.sm }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, flex: 1 }}>Add Expense</Text>
              <Pressable onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color={colors.muted} />
              </Pressable>
            </View>

            {/* Title */}
            <Input label="Title" value={fTitle} onChangeText={setFTitle} />

            {/* Amount */}
            <Input label="Amount (₹)" value={fAmount} onChangeText={setFAmount} keyboardType="numeric" />

            {/* Who paid */}
            <View style={{ gap: 4 }}>
              <Text style={s.fLabel}>Who paid?</Text>
              <View style={s.seg}>
                {(['me', 'partner'] as PaidBy[]).map(v => (
                  <Pressable key={v} style={[s.segBtn, fPaidBy === v && s.segActive]} onPress={() => setFPaidBy(v)}>
                    <Text style={[s.segTxt, fPaidBy === v && s.segTxtActive]}>{v === 'me' ? 'Me' : 'Partner'}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Split */}
            <View style={{ gap: 4 }}>
              <Text style={s.fLabel}>Split</Text>
              <View style={s.seg}>
                {(['50/50', 'all_me', 'all_partner'] as Split[]).map(v => (
                  <Pressable key={v} style={[s.segBtn, fSplit === v && s.segActive]} onPress={() => setFSplit(v)}>
                    <Text style={[s.segTxt, fSplit === v && s.segTxtActive]}>{SPLIT_LABELS[v]}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Category */}
            <View style={{ gap: 8 }}>
              <Text style={s.fLabel}>Category</Text>
              <View style={s.catGrid}>
                {CATEGORIES.map(cat => (
                  <Pressable key={cat} style={[s.catBtn, fCategory === cat && s.catBtnActive]} onPress={() => setFCategory(cat)}>
                    <Text style={{ fontSize: 24 }}>{CATEGORY_EMOJI[cat]}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <Button variant="primary" label={saving ? 'Adding…' : 'Add Expense'} onPress={save} disabled={saving} loading={saving} fullWidth />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
