import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/src/api';
import { NotConnected } from '@/src/components/NotConnected';
import { useAuth } from '@/src/context/AuthContext';
import { useCouple } from '@/src/context/CoupleContext';
import { useTheme } from '@/src/context/ThemeContext';
import { haptics } from '@/src/haptics';
import { radius, space } from '@/src/theme';

export default function SharedNoteScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { isPaired, isLoading: coupleLoading } = useCouple();

  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Conflict states
  const [showConflict, setShowConflict] = useState(false);
  const [conflictContent, setConflictContent] = useState('');
  const [editInfo, setEditInfo] = useState<{ time: string | null; name: string | null }>({ time: null, name: null });

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastServerTime = useRef<string | null>(null);

  const loadNote = async () => {
    try {
      const data = await api.get<{ content: string; updated_at?: string; updated_by?: string }>('/api/shared-note');
      setContent(data?.content || '');
      lastServerTime.current = data?.updated_at || null;
      if (data?.updated_at) {
        const timeFmt = new Date(data.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setEditInfo({ time: timeFmt, name: data.updated_by === user?.user_id ? 'You' : 'Partner' });
      }
    } catch {
      setContent('');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isPaired) {
      loadNote();
    }
  }, [isPaired]);

  // Polling for remote updates
  useEffect(() => {
    if (!isPaired) return;
    const interval = setInterval(async () => {
      if (saveStatus === 'saving') return;
      try {
        const data = await api.get<{ content: string; updated_at?: string; updated_by?: string }>('/api/shared-note');
        if (data.updated_at && lastServerTime.current && data.updated_at !== lastServerTime.current) {
          if (data.content !== content) {
            setConflictContent(data.content);
            setShowConflict(true);
            haptics.warning();
          }
          lastServerTime.current = data.updated_at;
          if (data.updated_at) {
            const timeFmt = new Date(data.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            setEditInfo({ time: timeFmt, name: data.updated_by === user?.user_id ? 'You' : 'Partner' });
          }
        }
      } catch {}
    }, 5000);

    return () => clearInterval(interval);
  }, [content, saveStatus, isPaired, user?.user_id]);

  const triggerAutoSave = (newVal: string) => {
    setContent(newVal);
    setSaveStatus('saving');
    
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }

    saveTimer.current = setTimeout(async () => {
      try {
        await api.post('/api/shared-note', { content: newVal });
        setSaveStatus('saved');
        const now = new Date();
        const timeFmt = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setEditInfo({ time: timeFmt, name: 'You' });
        lastServerTime.current = now.toISOString();
        setTimeout(() => setSaveStatus('idle'), 1500);
      } catch {
        setSaveStatus('idle');
      }
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  if (coupleLoading) {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.rose} size="large" />
      </SafeAreaView>
    );
  }

  if (!isPaired) {
    return <NotConnected message="Connect with your partner to edit shared notes." />;
  }

  return (
    <SafeAreaView style={[s.root, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text 
            style={[s.title, { color: colors.text }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
          >
            Shared Note 📝
          </Text>
          <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }} numberOfLines={1}>
            {saveStatus === 'saving' ? 'Saving changes…' : saveStatus === 'saved' ? 'Saved! ✨' : editInfo.time ? `Last edited by ${editInfo.name} at ${editInfo.time}` : 'Collaborative notepad'}
          </Text>
        </View>
        <Pressable onPress={loadNote} style={s.syncBtn} hitSlop={8}>
          <Ionicons name="sync-outline" size={20} color={colors.rose} />
        </Pressable>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.rose} size="large" />
        </View>
      ) : (
        <KeyboardAvoidingView 
          style={{ flex: 1 }} 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={80}
        >
          <TextInput
            multiline
            style={[s.editor, { color: colors.text, backgroundColor: colors.surface2, borderColor: colors.line }]}
            value={content}
            onChangeText={triggerAutoSave}
            placeholder="Start typing your shared notes, lists, or drafts here…"
            placeholderTextColor={colors.muted}
            textAlignVertical="top"
          />
        </KeyboardAvoidingView>
      )}

      {/* Conflict Modal */}
      <Modal visible={showConflict} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: space.lg }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.xl, padding: space.lg, borderWidth: 1, borderColor: colors.line }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 8 }}>⚠️ Conflict Detected</Text>
            <Text style={{ fontSize: 13, color: colors.textSec, lineHeight: 20, marginBottom: space.md }}>
              Your partner updated this note while you were editing it. Would you like to overwrite your local copy with their changes, or force-save your own?
            </Text>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Pressable
                style={{ flex: 1, backgroundColor: colors.surface2, borderRadius: radius.md, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line }}
                onPress={() => {
                  setContent(conflictContent);
                  setShowConflict(false);
                  haptics.light();
                }}
              >
                <Text style={{ fontWeight: '700', color: colors.text }}>Sync Partner's</Text>
              </Pressable>
              <Pressable
                style={{ flex: 1, backgroundColor: colors.rose, borderRadius: radius.md, height: 44, alignItems: 'center', justifyContent: 'center' }}
                onPress={async () => {
                  setShowConflict(false);
                  haptics.medium();
                  try {
                    setSaveStatus('saving');
                    await api.post('/api/shared-note', { content });
                    setSaveStatus('saved');
                    setTimeout(() => setSaveStatus('idle'), 1500);
                  } catch {
                    setSaveStatus('idle');
                  }
                }}
              >
                <Text style={{ fontWeight: '700', color: '#fff' }}>Keep Mine</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.07)' },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  syncBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '800' },
  editor: { flex: 1, margin: space.lg, borderRadius: radius.xl, padding: space.md, borderWidth: 1, fontSize: 16, lineHeight: 24 },
});
