import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Animated, FlatList, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/src/api';
import { Press } from '@/src/components/Press';
import { NotConnected } from '@/src/components/NotConnected';
import { useCouple } from '@/src/context/CoupleContext';
import { useAuth } from '@/src/context/AuthContext';
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

type ListType = 'todo' | 'grocery';
type TodoItem = {
  id: string;
  text: string;
  done: boolean;
  list_type: ListType;
  done_by?: string;
  created_at: string;
};

function makeStyles(c: Colors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm, gap: space.sm },
    title: { fontSize: 20, fontWeight: '800', color: c.text, flex: 1 },
    tabs: { flexDirection: 'row', marginHorizontal: space.lg, marginBottom: space.md, backgroundColor: c.surface, borderRadius: radius.lg, padding: 4, borderWidth: 1, borderColor: c.line },
    tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.md },
    tabActive: { backgroundColor: c.rose },
    tabTxt: { fontSize: 13, fontWeight: '700', color: c.muted },
    tabTxtActive: { color: '#fff' },
    itemRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: 12, gap: space.md, borderBottomWidth: 1, borderBottomColor: c.line },
    checkBox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: c.muted, alignItems: 'center', justifyContent: 'center' },
    checkBoxDone: { backgroundColor: c.rose, borderColor: c.rose },
    itemText: { flex: 1, fontSize: 15, color: c.text },
    itemTextDone: { textDecorationLine: 'line-through', opacity: 0.6, color: c.textSec },
    doneBadge: { fontSize: 10, fontWeight: '700', color: c.rose, backgroundColor: c.roseDim, borderRadius: radius.full, paddingHorizontal: 7, paddingVertical: 2 },
    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.xxl },
    emptyEmoji: { fontSize: 52 },
    emptyTxt: { fontSize: 15, color: c.muted, textAlign: 'center', fontWeight: '500' },
    inputBar: { flexDirection: 'row', alignItems: 'center', padding: space.md, gap: space.sm, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.surface },
    input: { flex: 1, backgroundColor: c.surface2, borderRadius: radius.lg, paddingHorizontal: space.md, paddingVertical: 10, fontSize: 15, color: c.text, borderWidth: 1, borderColor: c.line },
    sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: c.rose, alignItems: 'center', justifyContent: 'center' },
    sendBtnDim: { backgroundColor: c.surface2 },
  });
}

export default function TodoScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { isPaired, isLoading: coupleLoading } = useCouple();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [listType, setListType] = useState<ListType>('todo');
  const [items, setItems] = useState<TodoItem[]>([]);
  const [newText, setNewText] = useState('');
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => { load(); }, [listType]);

  const load = async () => {
    try {
      const data = await api.get<TodoItem[]>(`/api/todos?list_type=${listType}`);
      setItems(data);
    } catch { setItems([]); }
  };

  const toggle = async (item: TodoItem) => {
    haptics.light();
    try {
      await api.put(`/api/todos/${item.id}/toggle`, {});
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, done: !i.done, done_by: !i.done ? user?.user_id : undefined } : i));
    } catch { haptics.error(); }
  };

  const add = async () => {
    const text = newText.trim();
    if (!text) return;
    setAdding(true);
    haptics.light();
    try {
      const created = await api.post<TodoItem>('/api/todos', { text, list_type: listType });
      setItems(prev => [created, ...prev]);
      setNewText('');
    } catch { haptics.error(); }
    finally { setAdding(false); }
  };

  const confirmDelete = (item: TodoItem) => {
    haptics.warning();
    Alert.alert('Delete item?', `"${item.text}"`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await api.del(`/api/todos/${item.id}`);
            setItems(prev => prev.filter(i => i.id !== item.id));
          } catch { haptics.error(); }
        },
      },
    ]);
  };

  const undone = items.filter(i => !i.done);
  const done = items.filter(i => i.done);
  const sorted = [...undone, ...done];

  const renderItem = ({ item }: { item: TodoItem }) => (
    <Pressable
      style={s.itemRow}
      onLongPress={() => confirmDelete(item)}
      delayLongPress={500}
    >
      <Press haptic="light" onPress={() => toggle(item)}>
        <View style={[s.checkBox, item.done && s.checkBoxDone]}>
          {item.done && <Ionicons name="checkmark" size={14} color="#fff" />}
        </View>
      </Press>
      <Text style={[s.itemText, item.done && s.itemTextDone]}>{item.text}</Text>
      {item.done && item.done_by && (
        <Text style={s.doneBadge}>
          {item.done_by === user?.user_id ? 'You' : 'Partner'}
        </Text>
      )}
    </Pressable>
  );

  const emptyEmoji = listType === 'todo' ? '✅' : '🛒';

  if (coupleLoading) return null;
  if (!isPaired) return <NotConnected message="Shared lists need a partner. Connect to get started." />;

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={s.title}>Together ✅</Text>
      </View>

      <FadeSlide delay={80} style={{ flex: 1 }}>
      {/* Tabs */}
      <View style={s.tabs}>
        {(['todo', 'grocery'] as ListType[]).map(type => (
          <Pressable
            key={type}
            style={[s.tab, listType === type && s.tabActive]}
            onPress={() => { haptics.light(); setListType(type); }}
          >
            <Text style={[s.tabTxt, listType === type && s.tabTxtActive]}>
              {type === 'todo' ? 'To-Do' : 'Grocery'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* List */}
      <FlatList
        data={sorted}
        keyExtractor={i => i.id}
        renderItem={renderItem}
        contentContainerStyle={sorted.length === 0 ? { flex: 1 } : { paddingBottom: 16 }}
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Text style={s.emptyEmoji}>{emptyEmoji}</Text>
            <Text style={s.emptyTxt}>Nothing here yet — add something!</Text>
          </View>
        }
      />

      {/* Input bar */}
      <View style={s.inputBar}>
        <TextInput
          ref={inputRef}
          style={s.input}
          value={newText}
          onChangeText={setNewText}
          placeholder={listType === 'todo' ? 'Add a task…' : 'Add an item…'}
          placeholderTextColor={colors.muted}
          returnKeyType="send"
          onSubmitEditing={add}
          editable={!adding}
          selectionColor={colors.rose}
          cursorColor={colors.rose}
        />
        <Press haptic="light" onPress={add} disabled={!newText.trim() || adding}>
          <View style={[s.sendBtn, (!newText.trim() || adding) && s.sendBtnDim]}>
            <Ionicons name="send" size={18} color={newText.trim() && !adding ? '#fff' : colors.muted} />
          </View>
        </Press>
      </View>
      </FadeSlide>
    </SafeAreaView>
  );
}
