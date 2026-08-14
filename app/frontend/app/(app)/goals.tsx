import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, Modal, Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, TextInputProps, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/src/api';
import { Press } from '@/src/components/Press';
import { Celebrate } from '@/src/components/Celebrate';
import { DateField } from '@/src/components/DateTimeField';
import { HamburgerButton } from '@/src/components/Drawer';
import { NotConnected } from '@/src/components/NotConnected';
import { useAuth } from '@/src/context/AuthContext';
import { useCouple } from '@/src/context/CoupleContext';
import { useTheme } from '@/src/context/ThemeContext';
import { Colors, TAB_BAR_HEIGHT, radius, space } from '@/src/theme';

type Task       = { id: string; title: string; done: boolean; due_date?: string; priority: string; assignee_id?: string; owner_id?: string };
type Routine    = { id: string; name: string; schedule: string; kind: string };
type Goal       = { id: string; title: string; category: string; current_value: number; target_value?: number; unit?: string };
type BucketItem = { id: string; title: string; notes?: string; priority: string; completed?: boolean; location?: string };

const GOAL_ICONS: Record<string, string> = {
  relationship: '❤️', health: '💪', learning: '📚', finance: '💰',
  travel: '✈️', career: '💼', lifestyle: '🌿', hobbies: '🎨',
};
const TABS = ['Tasks', 'Routines', 'Goals', 'Bucket list'] as const;
type Tab = typeof TABS[number];

// ─── Moved outside to avoid remount-on-render ────────────────────────────────
interface FInputProps extends TextInputProps { label: string; colors: Colors }
function FInput({ label, colors, style, ...props }: FInputProps) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSec, letterSpacing: 1.2, textTransform: 'uppercase' }}>{label}</Text>
      <TextInput
        style={[{
          backgroundColor: colors.surface2, borderRadius: radius.md,
          height: 48, paddingHorizontal: space.md,
          color: colors.text, fontSize: 15,
          borderWidth: 1, borderColor: colors.line,
        }, (props as any).multiline && { height: 80, textAlignVertical: 'top', paddingTop: 12 }, style]}
        placeholderTextColor={colors.muted}
        {...props}
      />
    </View>
  );
}

interface FormModalProps {
  visible: boolean; title: string;
  onClose: () => void; onSave: () => void;
  saving: boolean; colors: Colors; children: React.ReactNode;
}
function FormModal({ visible, title, onClose, onSave, saving, colors, children }: FormModalProps) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView
          contentContainerStyle={{ padding: space.lg, gap: space.md }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.sm }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, flex: 1 }}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.muted} />
            </Pressable>
          </View>
          {children}
          <Pressable
            style={{ backgroundColor: colors.rose, borderRadius: radius.lg, height: 54, alignItems: 'center', justifyContent: 'center', opacity: saving ? 0.6 : 1, marginTop: space.sm }}
            onPress={onSave} disabled={saving}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{saving ? 'Saving…' : 'Save'}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function makeStyles(c: Colors) {
  const priorityColors: Record<string, string> = { high: c.rose, medium: c.gold, low: c.green };
  return {
    s: StyleSheet.create({
      root:         { flex: 1, backgroundColor: c.bg },
      headerRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.sm },
      pageTitle:    { fontSize: 24, fontWeight: '700', color: c.text, letterSpacing: -0.3, flex: 1 },
      tabsContent:  { paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.sm },
      tabPill:      { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.full, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line },
      tabPillActive:{ backgroundColor: c.rose, borderColor: c.rose },
      tabText:      { fontSize: 13, fontWeight: '600', color: c.muted },
      tabTextActive:{ color: '#fff' },
      row:          { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: c.surface, borderRadius: radius.lg, padding: space.md, marginBottom: space.sm, borderWidth: 1, borderColor: c.line },
      rowTitle:     { fontSize: 15, fontWeight: '500', color: c.text },
      rowMeta:      { fontSize: 11, color: c.muted, marginTop: 2 },
      strikethrough:{ textDecorationLine: 'line-through', color: c.muted },
      priorityDot:  { width: 8, height: 8, borderRadius: 4 },
      badge:        { paddingHorizontal: 8, paddingVertical: 3, backgroundColor: c.blueDim, borderRadius: radius.full },
      badgeText:    { fontSize: 10, fontWeight: '700', color: c.blue, textTransform: 'uppercase' },
      completedLbl: { fontSize: 11, fontWeight: '700', color: c.muted, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: space.sm, marginTop: space.md },
      goalCard:     { backgroundColor: c.surface, borderRadius: radius.xl, padding: space.lg, borderWidth: 1, borderColor: c.line, marginBottom: space.sm },
      goalBar:      { height: 6, backgroundColor: c.surface3, borderRadius: 3, overflow: 'hidden', marginTop: space.sm },
      goalFill:     { height: 6, backgroundColor: c.rose, borderRadius: 3 },
      updateBtn:    { marginTop: space.sm, paddingVertical: space.sm, alignItems: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: c.rose },
      updateBtnText:{ color: c.rose, fontSize: 13, fontWeight: '600' },
      fab:          { position: 'absolute', bottom: 100, right: space.lg, width: 56, height: 56, borderRadius: 28, backgroundColor: c.rose, alignItems: 'center', justifyContent: 'center', shadowColor: c.rose, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8 },
      pill:         { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line },
      pillActive:   { borderColor: c.rose, backgroundColor: c.roseDim },
      pillText:     { fontSize: 12, fontWeight: '600', color: c.textSec, textTransform: 'capitalize' },
      pillTextActive:{ color: c.rose },
      emptyWrap:    { alignItems: 'center', padding: space.xxl, gap: space.md },
      emptyText:    { fontSize: 13, color: c.muted, textAlign: 'center' },
    }),
    priorityColors,
  };
}

export default function GoalsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { isPaired, isLoading: coupleLoading, partner } = useCouple();
  const [tab, setTab] = useState<Tab>('Tasks');
  const [tasks, setTasks]         = useState<Task[]>([]);
  const [assignedToMe, setAssignedToMe] = useState<Task[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [goals, setGoals]       = useState<Goal[]>([]);
  const [bucket, setBucket]     = useState<BucketItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Task modal state
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [tEditing, setTEditing] = useState<Task | null>(null);
  const [tTitle, setTTitle]     = useState('');
  const [tDue, setTDue]         = useState('');
  const [tPriority, setTPriority] = useState('medium');
  const [tAssignPartner, setTAssignPartner] = useState(false);
  const [tSaving, setTSaving]   = useState(false);

  // Routine modal state
  const [showRoutineModal, setShowRoutineModal] = useState(false);
  const [rEditing, setREditing] = useState<Routine | null>(null);
  const [rName, setRName]       = useState('');
  const [rSched, setRSched]     = useState('daily');
  const [rKind, setRKind]       = useState('personal');
  const [rSaving, setRSaving]   = useState(false);

  // Goal modal state
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [gEditing, setGEditing] = useState<Goal | null>(null);
  const [gTitle, setGTitle]     = useState('');
  const [gCat, setGCat]         = useState('relationship');
  const [gTarget, setGTarget]   = useState('');
  const [gUnit, setGUnit]       = useState('');
  const [gSaving, setGSaving]   = useState(false);
  const [progressGoal, setProgressGoal] = useState<Goal | null>(null);
  const [progressVal, setProgressVal]   = useState('');
  const [celebrateKey, setCelebrateKey] = useState<number | null>(null);
  const celebrate = () => setCelebrateKey(k => (k ?? 0) + 1);

  // Bucket modal state
  const [showBucketModal, setShowBucketModal] = useState(false);
  const [bEditing, setBEditing] = useState<BucketItem | null>(null);
  const [bTitle, setBTitle]     = useState('');
  const [bPriority, setBPriority] = useState('medium');
  const [bLocation, setBLocation] = useState('');
  const [bSaving, setBSaving]   = useState(false);

  const { s, priorityColors } = useMemo(() => makeStyles(colors), [colors]);

  const mountAnim = useRef(new Animated.Value(0)).current;
  const mountTransY = useRef(new Animated.Value(20)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(mountAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.timing(mountTransY, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start();
  }, []);

  const load = useCallback(async () => {
    try {
      const [t, r, g, b, assigned] = await Promise.all([
        api.get<Task[]>('/api/tasks'),
        api.get<Routine[]>('/api/routines'),
        api.get<Goal[]>('/api/goals'),
        api.get<BucketItem[]>('/api/bucket-list'),
        api.get<Task[]>('/api/tasks/assigned-to-me').catch(() => []),
      ]);
      setTasks(t); setRoutines(r); setGoals(g); setBucket(b);
      setAssignedToMe(Array.isArray(assigned) ? assigned : []);
    } catch {}
    finally { setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Tasks ──────────────────────────────────────────────────────────────────
  const openTaskNew  = () => { setTEditing(null); setTTitle(''); setTDue(''); setTPriority('medium'); setTAssignPartner(false); setShowTaskModal(true); };
  const openTaskEdit = (t: Task) => { setTEditing(t); setTTitle(t.title); setTDue(t.due_date ?? ''); setTPriority(t.priority); setTAssignPartner(false); setShowTaskModal(true); };
  const saveTask = async () => {
    if (!tTitle.trim()) return;
    setTSaving(true);
    try {
      const body: Record<string, any> = { title: tTitle.trim(), due_date: tDue || undefined, priority: tPriority };
      if (!tEditing && tAssignPartner && partner) body.assignee_id = partner.user_id;
      if (tEditing) await api.put(`/api/tasks/${tEditing.id}`, body);
      else          await api.post('/api/tasks', body);
      setShowTaskModal(false);
      load();
    } catch (e: any) { Alert.alert('Error', e?.message); }
    finally { setTSaving(false); }
  };
  const toggleTask = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    await api.post(`/api/tasks/${id}/toggle`).catch(() => {});
    if (task && !task.done) celebrate();   // completing (not un-completing) a task
    load();
  };
  const deleteTask = (id: string) => Alert.alert('Delete task?', 'This cannot be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => {
      try { await api.del(`/api/tasks/${id}`); load(); }
      catch (e: any) { Alert.alert('Error', e?.message ?? 'Could not delete'); }
    }},
  ]);

  // ── Routines ───────────────────────────────────────────────────────────────
  const openRoutineNew  = () => { setREditing(null); setRName(''); setRSched('daily'); setRKind('personal'); setShowRoutineModal(true); };
  const openRoutineEdit = (r: Routine) => { setREditing(r); setRName(r.name); setRSched(r.schedule); setRKind(r.kind); setShowRoutineModal(true); };
  const saveRoutine = async () => {
    if (!rName.trim()) return;
    setRSaving(true);
    try {
      const body = { name: rName.trim(), schedule: rSched, kind: rKind, steps: [] };
      if (rEditing) await api.put(`/api/routines/${rEditing.id}`, body);
      else          await api.post('/api/routines', body);
      setShowRoutineModal(false);
      load();
    } catch (e: any) { Alert.alert('Error', e?.message); }
    finally { setRSaving(false); }
  };
  const deleteRoutine = (id: string) => Alert.alert('Delete routine?', '', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => {
      try { await api.del(`/api/routines/${id}`); load(); }
      catch (e: any) { Alert.alert('Error', e?.message ?? 'Could not delete'); }
    }},
  ]);

  // ── Goals ──────────────────────────────────────────────────────────────────
  const openGoalNew  = () => { setGEditing(null); setGTitle(''); setGCat('relationship'); setGTarget(''); setGUnit(''); setShowGoalModal(true); };
  const openGoalEdit = (g: Goal) => { setGEditing(g); setGTitle(g.title); setGCat(g.category); setGTarget(String(g.target_value ?? '')); setGUnit(g.unit ?? ''); setShowGoalModal(true); };
  const saveGoal = async () => {
    if (!gTitle.trim()) return;
    setGSaving(true);
    try {
      const body = { title: gTitle.trim(), category: gCat, target_value: gTarget ? parseFloat(gTarget) : undefined, unit: gUnit || undefined };
      if (gEditing) await api.put(`/api/goals/${gEditing.id}`, body);
      else          await api.post('/api/goals', body);
      setShowGoalModal(false);
      load();
    } catch (e: any) { Alert.alert('Error', e?.message); }
    finally { setGSaving(false); }
  };
  const updateProgress = async () => {
    if (!progressGoal || !progressVal) return;
    const val = parseFloat(progressVal);
    const reached100 = progressGoal.target_value != null && val >= progressGoal.target_value;
    await api.post(`/api/goals/${progressGoal.id}/progress`, { value: val }).catch(() => {});
    setProgressGoal(null);
    setProgressVal('');
    if (reached100) celebrate();
    load();
  };
  const deleteGoal = (id: string) => Alert.alert('Delete goal?', '', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => {
      try { await api.del(`/api/goals/${id}`); load(); }
      catch (e: any) { Alert.alert('Error', e?.message ?? 'Could not delete'); }
    }},
  ]);

  // ── Bucket list ────────────────────────────────────────────────────────────
  const openBucketNew  = () => { setBEditing(null); setBTitle(''); setBPriority('medium'); setBLocation(''); setShowBucketModal(true); };
  const openBucketEdit = (b: BucketItem) => { setBEditing(b); setBTitle(b.title); setBPriority(b.priority); setBLocation(b.location ?? ''); setShowBucketModal(true); };
  const saveBucket = async () => {
    if (!bTitle.trim()) return;
    setBSaving(true);
    try {
      const body = { title: bTitle.trim(), priority: bPriority, location: bLocation || undefined };
      if (bEditing) await api.put(`/api/bucket-list/${bEditing.id}`, body);
      else          await api.post('/api/bucket-list', body);
      setShowBucketModal(false);
      load();
    } catch (e: any) { Alert.alert('Error', e?.message); }
    finally { setBSaving(false); }
  };
  const toggleBucket = async (b: BucketItem) => {
    await api.put(`/api/bucket-list/${b.id}`, { completed: !b.completed }).catch(() => {});
    load();
  };
  const deleteBucket = (id: string) => Alert.alert('Remove from bucket list?', '', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => {
      try { await api.del(`/api/bucket-list/${id}`); load(); }
      catch (e: any) { Alert.alert('Error', e?.message ?? 'Could not delete'); }
    }},
  ]);

  const addActions: Record<Tab, () => void> = {
    Tasks: openTaskNew, Routines: openRoutineNew, Goals: openGoalNew, 'Bucket list': openBucketNew,
  };

  if (coupleLoading) {
    return (
      <SafeAreaView style={[s.root, { alignItems: 'center', justifyContent: 'center' }]} edges={['top']}>
        <ActivityIndicator color={colors.rose} size="large" />
      </SafeAreaView>
    );
  }

  if (!isPaired) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <NotConnected message="Goals are shared with your partner. Connect to get started." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.headerRow}>
        <Text style={s.pageTitle}>Goals</Text>
        <HamburgerButton />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabsContent} style={{ maxHeight: 52 }}>
        {TABS.map(t => (
          <Pressable key={t} style={[s.tabPill, tab === t && s.tabPillActive]} onPress={() => setTab(t)}>
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>{t}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Animated.View style={{ flex: 1, opacity: mountAnim, transform: [{ translateY: mountTransY }] }}>
      <ScrollView
        contentContainerStyle={{ padding: space.lg, paddingBottom: TAB_BAR_HEIGHT + space.md }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.rose} />}
      >
        {/* ── Tasks ── */}
        {tab === 'Tasks' && (
          <View>
            {tasks.filter(t => !t.done && !(t.assignee_id === user?.user_id && t.owner_id !== user?.user_id)).map(t => (
              <Pressable key={t.id} style={s.row} onPress={() => openTaskEdit(t)}>
                <Pressable onPress={() => toggleTask(t.id)} hitSlop={8}>
                  <Ionicons name="ellipse-outline" size={22} color={colors.muted} />
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>{t.title}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    {t.due_date && <Text style={s.rowMeta}>Due {t.due_date}</Text>}
                    {t.assignee_id === partner?.user_id && (
                      <View style={[s.badge, { backgroundColor: colors.roseDim, paddingHorizontal: 6, paddingVertical: 2 }]}>
                        <Text style={[s.badgeText, { color: colors.rose, fontSize: 9 }]}>Assigned to partner</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={[s.priorityDot, { backgroundColor: priorityColors[t.priority] ?? colors.muted }]} />
                <Pressable onPress={() => deleteTask(t.id)} hitSlop={12} style={{ padding: 4 }}>
                  <Ionicons name="trash-outline" size={16} color={colors.muted} />
                </Pressable>
              </Pressable>
            ))}
            {tasks.filter(t => t.done).length > 0 && (
              <>
                <Text style={s.completedLbl}>Completed ({tasks.filter(t => t.done).length})</Text>
                {tasks.filter(t => t.done).map(t => (
                  <Pressable key={t.id} style={s.row} onPress={() => toggleTask(t.id)}>
                    <Ionicons name="checkmark-circle" size={22} color={colors.green} />
                    <Text style={[s.rowTitle, s.strikethrough, { flex: 1 }]}>{t.title}</Text>
                    <Pressable onPress={() => deleteTask(t.id)} hitSlop={12} style={{ padding: 4 }}>
                      <Ionicons name="trash-outline" size={16} color={colors.muted} />
                    </Pressable>
                  </Pressable>
                ))}
              </>
            )}
            {assignedToMe.length > 0 && (
              <>
                <Text style={[s.completedLbl, { color: colors.rose }]}>
                  From {partner?.name?.split(' ')[0] ?? 'partner'} 💌
                </Text>
                {assignedToMe.map(t => (
                  <View key={t.id} style={[s.row, { borderColor: colors.roseDim, borderWidth: 1.5 }]}>
                    <Pressable onPress={() => toggleTask(t.id)} hitSlop={8}>
                      <Ionicons name="ellipse-outline" size={22} color={colors.rose} />
                    </Pressable>
                    <View style={{ flex: 1 }}>
                      <Text style={s.rowTitle}>{t.title}</Text>
                      {t.due_date && <Text style={s.rowMeta}>Due {t.due_date}</Text>}
                    </View>
                  </View>
                ))}
              </>
            )}
            {tasks.filter(t => !t.done && !(t.assignee_id === user?.user_id && t.owner_id !== user?.user_id)).length === 0 && assignedToMe.length === 0 && (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 16, paddingTop: 60 }}>
                <Text style={{ fontSize: 64 }}>✅</Text>
                <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' }}>Nothing on the list</Text>
                <Text style={{ fontSize: 15, color: colors.textSec, textAlign: 'center', lineHeight: 22 }}>Add things you want to do together.</Text>
                <Pressable
                  onPress={openTaskNew}
                  style={{ backgroundColor: colors.rose, borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14, marginTop: 8 }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Add a Task</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* ── Routines ── */}
        {tab === 'Routines' && (
          <View>
            {routines.map(r => (
              <View key={r.id} style={[s.row, { flexDirection: 'column', alignItems: 'flex-start', gap: space.sm }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
                  <Ionicons name="refresh-outline" size={20} color={colors.blue} />
                  <Text style={[s.rowTitle, { flex: 1, marginLeft: space.sm }]}>{r.name}</Text>
                  <View style={s.badge}><Text style={s.badgeText}>{r.schedule}</Text></View>
                  <View style={[s.badge, { backgroundColor: colors.goldDim, marginLeft: 4 }]}><Text style={[s.badgeText, { color: colors.gold }]}>{r.kind}</Text></View>
                  <Pressable onPress={() => openRoutineEdit(r)} hitSlop={8} style={{ padding: 4 }}><Ionicons name="pencil-outline" size={16} color={colors.muted} /></Pressable>
                  <Pressable onPress={() => deleteRoutine(r.id)} hitSlop={8} style={{ padding: 4 }}><Ionicons name="trash-outline" size={16} color={colors.muted} /></Pressable>
                </View>
              </View>
            ))}
            {routines.length === 0 && (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 16, paddingTop: 60 }}>
                <Text style={{ fontSize: 64 }}>🔄</Text>
                <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' }}>Build a ritual</Text>
                <Text style={{ fontSize: 15, color: colors.textSec, textAlign: 'center', lineHeight: 22 }}>Small daily habits that keep you close.</Text>
                <Pressable
                  onPress={openRoutineNew}
                  style={{ backgroundColor: colors.rose, borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14, marginTop: 8 }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Add a Routine</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* ── Goals ── */}
        {tab === 'Goals' && (
          <View>
            {goals.map(g => {
              const pct = g.target_value ? Math.min(1, g.current_value / g.target_value) : 0;
              return (
                <View key={g.id} style={s.goalCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.sm }}>
                    <Text style={{ fontSize: 22, marginRight: space.sm }}>{GOAL_ICONS[g.category] ?? '🎯'}</Text>
                    <Text style={[s.rowTitle, { flex: 1 }]}>{g.title}</Text>
                    <Pressable onPress={() => openGoalEdit(g)} hitSlop={8} style={{ padding: 4 }}><Ionicons name="pencil-outline" size={16} color={colors.muted} /></Pressable>
                    <Pressable onPress={() => deleteGoal(g.id)} hitSlop={8} style={{ padding: 4 }}><Ionicons name="trash-outline" size={16} color={colors.muted} /></Pressable>
                  </View>
                  {g.target_value != null && (
                    <>
                      <View style={s.goalBar}><View style={[s.goalFill, { width: `${Math.round(pct * 100)}%` as any }]} /></View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                        <Text style={s.rowMeta}>{g.current_value} / {g.target_value} {g.unit ?? ''}</Text>
                        <Text style={s.rowMeta}>{Math.round(pct * 100)}%</Text>
                      </View>
                    </>
                  )}
                  <Pressable style={s.updateBtn} onPress={() => { setProgressGoal(g); setProgressVal(String(g.current_value)); }}>
                    <Text style={s.updateBtnText}>Update progress</Text>
                  </Pressable>
                </View>
              );
            })}
            {goals.length === 0 && (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 16, paddingTop: 60 }}>
                <Text style={{ fontSize: 64 }}>🎯</Text>
                <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' }}>Dream together</Text>
                <Text style={{ fontSize: 15, color: colors.textSec, textAlign: 'center', lineHeight: 22 }}>Set a goal and work toward it side by side.</Text>
                <Pressable
                  onPress={openGoalNew}
                  style={{ backgroundColor: colors.rose, borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14, marginTop: 8 }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Set a Goal</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* ── Bucket list ── */}
        {tab === 'Bucket list' && (
          <View>
            {bucket.filter(b => !b.completed).map(b => (
              <View key={b.id} style={s.row}>
                <Pressable onPress={() => toggleBucket(b)} hitSlop={8}>
                  <Ionicons name="ellipse-outline" size={22} color={colors.muted} />
                </Pressable>
                <Pressable style={{ flex: 1 }} onPress={() => openBucketEdit(b)}>
                  <Text style={s.rowTitle}>{b.title}</Text>
                  {b.location && <Text style={s.rowMeta}>📍 {b.location}</Text>}
                </Pressable>
                <View style={[s.priorityDot, { backgroundColor: priorityColors[b.priority] ?? colors.muted }]} />
                <Pressable onPress={() => deleteBucket(b.id)} hitSlop={12} style={{ padding: 4 }}>
                  <Ionicons name="trash-outline" size={16} color={colors.muted} />
                </Pressable>
              </View>
            ))}
            {bucket.filter(b => b.completed).length > 0 && (
              <>
                <Text style={s.completedLbl}>Done ✓</Text>
                {bucket.filter(b => b.completed).map(b => (
                  <View key={b.id} style={s.row}>
                    <Pressable onPress={() => toggleBucket(b)} hitSlop={8}>
                      <Ionicons name="checkmark-circle" size={22} color={colors.green} />
                    </Pressable>
                    <Text style={[s.rowTitle, s.strikethrough, { flex: 1 }]}>{b.title}</Text>
                    <Pressable onPress={() => deleteBucket(b.id)} hitSlop={12} style={{ padding: 4 }}>
                      <Ionicons name="trash-outline" size={16} color={colors.muted} />
                    </Pressable>
                  </View>
                ))}
              </>
            )}
            {bucket.length === 0 && (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 16, paddingTop: 60 }}>
                <Text style={{ fontSize: 64 }}>🌍</Text>
                <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' }}>Build your bucket list</Text>
                <Text style={{ fontSize: 15, color: colors.textSec, textAlign: 'center', lineHeight: 22 }}>Places to go, things to do, adventures to have.</Text>
                <Pressable
                  onPress={openBucketNew}
                  style={{ backgroundColor: colors.rose, borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14, marginTop: 8 }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Add a Dream</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      <Press haptic="medium" onPress={addActions[tab]} style={s.fab}>
        <Ionicons name="add" size={26} color="#fff" />
      </Press>
      </Animated.View>

      {celebrateKey !== null && <Celebrate key={celebrateKey} onDone={() => setCelebrateKey(null)} />}

      {/* Task modal */}
      <FormModal visible={showTaskModal} title={tEditing ? 'Edit task' : 'New task'} onClose={() => setShowTaskModal(false)} onSave={saveTask} saving={tSaving} colors={colors}>
        <FInput label="Title" value={tTitle} onChangeText={setTTitle} placeholder="What needs doing?" colors={colors} autoFocus />
        <DateField label="Due date (optional)" value={tDue} onChange={setTDue} />
        {!tEditing && isPaired && partner && (
          <Pressable
            onPress={() => setTAssignPartner(v => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: tAssignPartner ? colors.roseDim : colors.surface2, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: tAssignPartner ? colors.rose : colors.line }}
          >
            <Text style={{ fontSize: 20 }}>{tAssignPartner ? '💌' : '👤'}</Text>
            <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: tAssignPartner ? colors.rose : colors.text }}>
              {tAssignPartner ? `Assigned to ${partner.name.split(' ')[0]}` : 'Assign to partner?'}
            </Text>
            {tAssignPartner && <Ionicons name="checkmark-circle" size={20} color={colors.rose} />}
          </Pressable>
        )}
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSec, letterSpacing: 1.2, textTransform: 'uppercase' }}>Priority</Text>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {['low', 'medium', 'high'].map(p => (
              <Pressable key={p} style={[s.pill, tPriority === p && { borderColor: priorityColors[p], backgroundColor: priorityColors[p] + '22' }]} onPress={() => setTPriority(p)}>
                <Text style={[s.pillText, tPriority === p && { color: priorityColors[p] }]}>{p}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </FormModal>

      {/* Routine modal */}
      <FormModal visible={showRoutineModal} title={rEditing ? 'Edit routine' : 'New routine'} onClose={() => setShowRoutineModal(false)} onSave={saveRoutine} saving={rSaving} colors={colors}>
        <FInput label="Name" value={rName} onChangeText={setRName} placeholder="Morning routine" colors={colors} autoFocus />
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSec, letterSpacing: 1.2, textTransform: 'uppercase' }}>Schedule</Text>
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            {['daily', 'weekdays', 'weekends'].map(sc => (
              <Pressable key={sc} style={[s.pill, rSched === sc && s.pillActive]} onPress={() => setRSched(sc)}>
                <Text style={[s.pillText, rSched === sc && s.pillTextActive]}>{sc}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSec, letterSpacing: 1.2, textTransform: 'uppercase' }}>Kind</Text>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {['personal', 'shared'].map(k => (
              <Pressable key={k} style={[s.pill, rKind === k && s.pillActive]} onPress={() => setRKind(k)}>
                <Text style={[s.pillText, rKind === k && s.pillTextActive]}>{k}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </FormModal>

      {/* Goal modal */}
      <FormModal visible={showGoalModal} title={gEditing ? 'Edit goal' : 'New goal'} onClose={() => setShowGoalModal(false)} onSave={saveGoal} saving={gSaving} colors={colors}>
        <FInput label="Title" value={gTitle} onChangeText={setGTitle} placeholder="Goal name" colors={colors} autoFocus />
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSec, letterSpacing: 1.2, textTransform: 'uppercase' }}>Category</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {Object.keys(GOAL_ICONS).map(c => (
              <Pressable key={c} style={[s.pill, gCat === c && s.pillActive]} onPress={() => setGCat(c)}>
                <Text style={[s.pillText, gCat === c && s.pillTextActive]}>{GOAL_ICONS[c]} {c}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <FInput label="Target" value={gTarget} onChangeText={setGTarget} placeholder="100" keyboardType="numeric" colors={colors} />
          </View>
          <View style={{ flex: 1 }}>
            <FInput label="Unit" value={gUnit} onChangeText={setGUnit} placeholder="km, books…" colors={colors} />
          </View>
        </View>
      </FormModal>

      {/* Bucket list modal */}
      <FormModal visible={showBucketModal} title={bEditing ? 'Edit item' : 'Add to bucket list'} onClose={() => setShowBucketModal(false)} onSave={saveBucket} saving={bSaving} colors={colors}>
        <FInput label="Title" value={bTitle} onChangeText={setBTitle} placeholder="What do you want to do together?" colors={colors} autoFocus />
        <FInput label="Location (optional)" value={bLocation} onChangeText={setBLocation} placeholder="City, country…" colors={colors} />
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSec, letterSpacing: 1.2, textTransform: 'uppercase' }}>Priority</Text>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {['low', 'medium', 'high'].map(p => (
              <Pressable key={p} style={[s.pill, bPriority === p && { borderColor: priorityColors[p], backgroundColor: priorityColors[p] + '22' }]} onPress={() => setBPriority(p)}>
                <Text style={[s.pillText, bPriority === p && { color: priorityColors[p] }]}>{p}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </FormModal>

      {/* Progress update overlay */}
      <Modal visible={!!progressGoal} animationType="fade" transparent onRequestClose={() => setProgressGoal(null)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: space.xl }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.xl, padding: space.xl, width: '100%', gap: space.md }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>Update progress</Text>
            <Text style={{ fontSize: 14, color: colors.textSec }}>{progressGoal?.title}</Text>
            <TextInput
              style={{ backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, textAlign: 'center', fontSize: 28, fontWeight: '700', color: colors.text, height: 64 }}
              value={progressVal} onChangeText={setProgressVal}
              keyboardType="numeric" placeholder="0" placeholderTextColor={colors.muted}
            />
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <Pressable style={[s.pill, { flex: 1, alignItems: 'center', justifyContent: 'center', height: 48 }]} onPress={() => { setProgressGoal(null); setProgressVal(''); }}>
                <Text style={s.pillText}>Cancel</Text>
              </Pressable>
              <Pressable style={{ flex: 1, backgroundColor: colors.rose, borderRadius: radius.lg, height: 48, alignItems: 'center', justifyContent: 'center' }} onPress={updateProgress}>
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
