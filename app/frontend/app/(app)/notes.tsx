/**
 * Love Notes screen — write and read short love notes to each other.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert, Animated, FlatList, Modal, Pressable, StyleSheet,
  Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/src/api';
import { Button } from '@/src/components/Button';
import { Input } from '@/src/components/Input';
import { Press } from '@/src/components/Press';
import { useTheme } from '@/src/context/ThemeContext';
import { haptics } from '@/src/haptics';
import { radius, space } from '@/src/theme';

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

const MAX_NOTES = 10;

interface LoveNote {
  id: string;
  content: string;
  created_at: string;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function NotesScreen() {
  const { colors } = useTheme();
  const [notes, setNotes] = useState<LoveNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const data = await api.get<LoveNote[]>('/api/notes');
      setNotes(data);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const addNote = async () => {
    const content = draft.trim();
    if (!content) return;
    setSaving(true);
    haptics.medium();
    try {
      const note = await api.post<LoveNote>('/api/notes', { content });
      setNotes(prev => [note, ...prev]);
      setDraft('');
      setShowModal(false);
      haptics.success();
    } catch {
      haptics.error();
      Alert.alert('Error', 'Could not save note.');
    } finally { setSaving(false); }
  };

  const deleteNote = (note: LoveNote) => {
    Alert.alert('Delete note?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          haptics.medium();
          try {
            await api.del(`/api/notes/${note.id}`);
            setNotes(prev => prev.filter(n => n.id !== note.id));
          } catch {
            Alert.alert('Error', 'Could not delete note.');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      <LinearGradient
        colors={[colors.roseDim, colors.bg]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.5 }}
        pointerEvents="none"
      />

      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.md }}>
        <Press haptic="light" onPress={() => router.back()} hitSlop={8} style={{ width: 40, height: 40, justifyContent: 'center' }}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Press>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, fontWeight: '900', color: colors.text, letterSpacing: -0.4 }}>Love Notes 💌</Text>
          <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
            {notes.length}/{MAX_NOTES} notes
          </Text>
        </View>
      </View>

      {/* Notes list */}
      <FlatList
        data={notes}
        keyExtractor={n => n.id}
        contentContainerStyle={{ padding: space.lg, paddingBottom: 120, gap: space.md }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          !loading ? (
            <View style={{ alignItems: 'center', paddingTop: 100, gap: space.md }}>
              <Text style={{ fontSize: 64 }}>💌</Text>
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, textAlign: 'center' }}>No love notes yet</Text>
              <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20 }}>
                Write something sweet — your partner{'\n'}will love it.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item, index }) => (
          <FadeSlide delay={index * 60}>
            <Press
              haptic="light"
              onLongPress={() => deleteNote(item)}
              delayLongPress={500}
              style={{ backgroundColor: colors.surface, borderRadius: radius.xl, padding: space.lg, borderWidth: 1, borderColor: colors.line }}
            >
              <Text style={{ fontSize: 15, color: colors.text, lineHeight: 22, fontStyle: 'italic', marginBottom: space.sm }}>
                "{item.content}"
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 11, color: colors.muted, fontWeight: '600' }}>{fmtDate(item.created_at)}</Text>
                <Press haptic="light" onPress={() => deleteNote(item)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={16} color={colors.muted} />
                </Press>
              </View>
            </Press>
          </FadeSlide>
        )}
      />

      {/* FAB */}
      {notes.length < MAX_NOTES && (
        <Press
          haptic="medium"
          onPress={() => setShowModal(true)}
          style={{ position: 'absolute', bottom: 32, right: 24, width: 58, height: 58, borderRadius: 29, backgroundColor: colors.rose, alignItems: 'center', justifyContent: 'center', shadowColor: colors.rose, shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 }}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </Press>
      )}

      {/* Add note modal */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setShowModal(false)} />
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: space.lg, paddingBottom: 40, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: -4 }, elevation: 20 }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, alignSelf: 'center', marginBottom: space.lg }} />
          <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: space.md }}>Write a love note 💌</Text>
          <Input
            label="Write something sweet…"
            value={draft}
            onChangeText={setDraft}
            multiline
            numberOfLines={5}
          />
          <Text style={{ fontSize: 11, color: colors.muted, textAlign: 'right', marginTop: 4, marginBottom: space.md }}>{draft.length}/500</Text>
          <Button
            variant="primary"
            label={saving ? 'Saving…' : 'Send with love 💕'}
            onPress={addNote}
            disabled={saving || !draft.trim()}
            loading={saving}
            fullWidth
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}
