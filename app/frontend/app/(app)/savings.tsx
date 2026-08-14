import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Animated, FlatList, Modal,
  Pressable, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/src/api';
import { Button } from '@/src/components/Button';
import { Input } from '@/src/components/Input';
import { Press } from '@/src/components/Press';
import { NotConnected } from '@/src/components/NotConnected';
import { useAuth } from '@/src/context/AuthContext';
import { useCouple } from '@/src/context/CoupleContext';
import { useTheme } from '@/src/context/ThemeContext';
import { haptics } from '@/src/haptics';
import { Colors, radius, space } from '@/src/theme';

type Contribution = {
  user_id: string;
  name: string;
  amount: number;
  timestamp: string;
};

type SavingsGoal = {
  id: string;
  title: string;
  target_amount: number;
  current_amount: number;
  emoji?: string;
  deadline?: string;
  contributions?: Contribution[];
};

const EMOJI_OPTIONS = ['💰', '🏠', '✈️', '💍', '🎁', '🎓', '🚗', '🌴'];

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

function fmtAmount(n: number) {
  return '₹' + n.toLocaleString('en-IN');
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.md },
    headerTitle: { flex: 1, fontSize: 20, fontWeight: '800', color: c.text },
    backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
    // Hero
    hero: { marginHorizontal: space.lg, marginBottom: space.lg, backgroundColor: c.surface, borderRadius: 20, padding: space.lg, borderWidth: 1, borderColor: c.goldDim ?? c.line },
    heroLabel: { fontSize: 11, fontWeight: '800', color: c.gold, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 4 },
    heroAmount: { fontSize: 36, fontWeight: '900', color: c.text, letterSpacing: -1 },
    heroSub: { fontSize: 13, color: c.muted, marginTop: 2, fontWeight: '500' },
    // List
    list: { paddingHorizontal: space.lg, paddingBottom: 120 },
    card: { backgroundColor: c.surface, borderRadius: radius.lg, padding: space.md, marginBottom: space.md, borderWidth: 1, borderColor: c.line, gap: space.sm },
    cardRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    cardEmoji: { fontSize: 28 },
    cardTitle: { fontSize: 16, fontWeight: '700', color: c.text, flex: 1 },
    track: { height: 8, backgroundColor: c.surface2, borderRadius: 4, overflow: 'hidden' },
    fill: { height: 8, backgroundColor: c.gold, borderRadius: 4 },
    amtRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    amtTxt: { fontSize: 13, color: c.textSec, fontWeight: '600' },
    pctTxt: { fontSize: 13, color: c.gold, fontWeight: '800' },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
    deadline: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.full, backgroundColor: c.goldDim ?? c.surface2, borderWidth: 1, borderColor: c.gold + '44' },
    deadlineTxt: { fontSize: 11, fontWeight: '700', color: c.gold },
    addBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.full, backgroundColor: c.roseDim, borderWidth: 1, borderColor: c.rose + '55' },
    addBtnTxt: { fontSize: 12, fontWeight: '800', color: c.rose },
    // FAB
    fab: {
      position: 'absolute', bottom: 32, right: 24,
      width: 56, height: 56, borderRadius: 28,
      backgroundColor: c.rose, alignItems: 'center', justifyContent: 'center',
      shadowColor: c.rose, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8,
    },
    // Empty
    empty: { alignItems: 'center', paddingTop: 80, gap: space.md },
    emptyEmoji: { fontSize: 64 },
    emptyText: { fontSize: 15, color: c.textSec, textAlign: 'center', maxWidth: 240, lineHeight: 22, fontWeight: '500' },
    // Modal
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: c.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.lg, gap: space.md, paddingBottom: 40 },
    sheetTitle: { fontSize: 18, fontWeight: '800', color: c.text },
    inputLabel: { fontSize: 11, fontWeight: '700', color: c.textSec, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 },
    input: { backgroundColor: c.surface2, borderRadius: radius.md, padding: space.md, color: c.text, fontSize: 15, borderWidth: 1, borderColor: c.line },
    emojiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    emojiOpt: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: c.line },
    emojiOptActive: { borderColor: c.rose, backgroundColor: c.roseDim },
    emojiTxt: { fontSize: 24 },
    saveBtn: { backgroundColor: c.rose, borderRadius: radius.lg, height: 50, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
    saveBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
    cancelBtn: { alignItems: 'center', paddingVertical: 10 },
    cancelTxt: { fontSize: 15, color: c.muted, fontWeight: '600' },
  });
}

export default function SavingsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { isPaired, isLoading: coupleLoading, partner } = useCouple();
  const s = useMemo(() => makeStyles(colors), [colors]);
  if (coupleLoading) return null;
  if (!isPaired) return <NotConnected message="Savings goals are shared with your partner. Connect to get started." />;

  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showContribModal, setShowContribModal] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<SavingsGoal | null>(null);
  const [saving, setSaving] = useState(false);

  // New goal form
  const [newTitle, setNewTitle] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [newEmoji, setNewEmoji] = useState('💰');
  const [newDeadline, setNewDeadline] = useState('');

  // Contribution
  const [contribAmount, setContribAmount] = useState('');
  const [contributing, setContributing] = useState(false);

  const totalSaved = goals.reduce((acc, g) => acc + g.current_amount, 0);

  const load = useCallback(async () => {
    try {
      const data = await api.get<SavingsGoal[]>('/api/savings');
      setGoals(data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const addGoal = async () => {
    if (!newTitle.trim() || !newTarget) return;
    setSaving(true); haptics.light();
    try {
      const created = await api.post<SavingsGoal>('/api/savings', {
        title: newTitle.trim(),
        target_amount: parseFloat(newTarget),
        emoji: newEmoji,
        deadline: newDeadline.trim() || undefined,
      });
      // Fetch entire list to get contributions arrays initialized
      load();
      setNewTitle(''); setNewTarget(''); setNewEmoji('💰'); setNewDeadline('');
      setShowAddModal(false);
      haptics.success();
    } catch { haptics.error(); }
    finally { setSaving(false); }
  };

  const openContrib = (goal: SavingsGoal) => {
    setSelectedGoal(goal);
    setContribAmount('');
    setShowContribModal(true);
  };

  const addContrib = async () => {
    if (!selectedGoal || !contribAmount) return;
    setContributing(true); haptics.light();
    try {
      await api.patch(`/api/savings/${selectedGoal.id}/add?amount=${parseFloat(contribAmount)}`, {});
      // Refresh to load latest contributions list from DB
      load();
      setShowContribModal(false);
      haptics.success();
    } catch { haptics.error(); }
    finally { setContributing(false); }
  };

  const deleteGoal = (goal: SavingsGoal) => {
    haptics.medium();
    Alert.alert('Delete goal?', `Delete "${goal.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await api.del(`/api/savings/${goal.id}`);
            setGoals(prev => prev.filter(g => g.id !== goal.id));
            haptics.success();
          } catch { haptics.error(); }
        },
      },
    ]);
  };

  const renderGoal = ({ item }: { item: SavingsGoal }) => {
    const pct = item.target_amount > 0 ? Math.min(1, item.current_amount / item.target_amount) : 0;
    const contribs = item.contributions ?? [];
    const userMap: Record<string, number> = {};
    contribs.forEach(c => {
      userMap[c.name] = (userMap[c.name] || 0) + c.amount;
    });

    return (
      <Press haptic="none" onLongPress={() => deleteGoal(item)}>
        <View style={s.card}>
          <View style={s.cardRow}>
            <Text style={s.cardEmoji}>{item.emoji ?? '💰'}</Text>
            <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>
          </View>
          <View style={s.track}>
            <View style={[s.fill, { width: `${Math.round(pct * 100)}%` as any }]} />
          </View>
          <View style={s.amtRow}>
            <Text style={s.amtTxt}>{fmtAmount(item.current_amount)} saved of {fmtAmount(item.target_amount)}</Text>
            <Text style={s.pctTxt}>{Math.round(pct * 100)}%</Text>
          </View>

          {Object.keys(userMap).length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.line + '33', borderBottomWidth: 1, borderBottomColor: colors.line + '33' }}>
              {Object.entries(userMap).map(([name, amount]) => (
                <Text key={name} style={{ fontSize: 12, color: colors.textSec }}>
                  👤 {name}: <Text style={{ fontWeight: '700', color: colors.text }}>{fmtAmount(amount)}</Text>
                </Text>
              ))}
            </View>
          )}

          <View style={s.metaRow}>
            {item.deadline ? (
              <View style={s.deadline}>
                <Text style={s.deadlineTxt}>by {item.deadline}</Text>
              </View>
            ) : null}
            <Press haptic="light" onPress={() => openContrib(item)}>
              <View style={s.addBtn}>
                <Text style={s.addBtnTxt}>Add ₹</Text>
              </View>
            </Press>
          </View>
        </View>
      </Press>
    );
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <FadeSlide delay={0}>
        <View style={s.header}>
          <Press haptic="light" onPress={() => router.back()}>
            <View style={s.backBtn}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </View>
          </Press>
          <Text style={s.headerTitle}>Savings 💰</Text>
        </View>
      </FadeSlide>

      {/* Total hero */}
      <FadeSlide delay={60}>
        <View style={s.hero}>
          <Text style={s.heroLabel}>Total saved together</Text>
          <Text style={s.heroAmount}>{fmtAmount(totalSaved)}</Text>
          <Text style={s.heroSub}>across {goals.length} goal{goals.length !== 1 ? 's' : ''}</Text>
        </View>
      </FadeSlide>

      {/* Goals list */}
      <FlatList
        data={goals}
        keyExtractor={g => g.id}
        contentContainerStyle={s.list}
        renderItem={renderGoal}
        ListEmptyComponent={
          !loading ? (
            <View style={s.empty}>
              <Text style={s.emptyEmoji}>💰</Text>
              <Text style={s.emptyText}>Set a savings goal together</Text>
            </View>
          ) : null
        }
      />

      {/* FAB */}
      <Press haptic="medium" onPress={() => setShowAddModal(true)}>
        <View style={s.fab}>
          <Ionicons name="add" size={28} color="#fff" />
        </View>
      </Press>

      {/* Add goal modal */}
      <Modal visible={showAddModal} transparent animationType="slide" onRequestClose={() => setShowAddModal(false)}>
        <Pressable style={s.overlay} onPress={() => setShowAddModal(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <Text style={s.sheetTitle}>New savings goal 💰</Text>

            <Input label="Goal title" value={newTitle} onChangeText={setNewTitle} placeholder="e.g. Dream vacation…" />

            <Input label="Target amount (₹)" value={newTarget} onChangeText={setNewTarget} placeholder="50000" keyboardType="numeric" />

            <View>
              <Text style={s.inputLabel}>Emoji</Text>
              <View style={s.emojiRow}>
                {EMOJI_OPTIONS.map(e => (
                  <Press key={e} haptic="light" onPress={() => setNewEmoji(e)}>
                    <View style={[s.emojiOpt, newEmoji === e && s.emojiOptActive]}>
                      <Text style={s.emojiTxt}>{e}</Text>
                    </View>
                  </Press>
                ))}
              </View>
            </View>

            <Input label="Deadline (optional)" value={newDeadline} onChangeText={setNewDeadline} placeholder="Dec 2025" />

            <Button variant="primary" size="lg" fullWidth label={saving ? 'Creating…' : 'Create goal'} onPress={addGoal} loading={saving} disabled={!newTitle.trim() || !newTarget} />
            <Button variant="ghost" size="md" fullWidth label="Cancel" onPress={() => setShowAddModal(false)} />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Contribute modal */}
      <Modal visible={showContribModal} transparent animationType="slide" onRequestClose={() => setShowContribModal(false)}>
        <Pressable style={s.overlay} onPress={() => setShowContribModal(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <Text style={s.sheetTitle}>Add to {selectedGoal?.title} {selectedGoal?.emoji}</Text>
            <Input label="Amount (₹)" value={contribAmount} onChangeText={setContribAmount} placeholder="500" keyboardType="numeric" />
            <Button variant="primary" size="lg" fullWidth label={contributing ? 'Adding…' : 'Add contribution'} onPress={addContrib} loading={contributing} disabled={!contribAmount} />
            <Button variant="ghost" size="md" fullWidth label="Cancel" onPress={() => setShowContribModal(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
