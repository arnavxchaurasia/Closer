import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Animated, Easing, Image, Modal, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/src/api';
import { PhotoEditor } from '@/src/components/PhotoEditor';
import { useAuth } from '@/src/context/AuthContext';
import { useCouple } from '@/src/context/CoupleContext';
import { useTheme } from '@/src/context/ThemeContext';
import { haptics } from '@/src/haptics';
import { useNicknames } from '@/src/hooks/useNicknames';
import { space, radius } from '@/src/theme';

interface Snap {
  id: string;
  sender_id: string;
  sender_name: string;
  photo_url: string;
  caption: string;
  created_at: string;
  seen: boolean;
}

function timeSince(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// Full-screen snap viewer — shows the image then marks seen
function SnapViewer({ snap, onClose }: { snap: Snap; onClose: () => void }) {
  const { colors } = useTheme();
  const fadeOut = useRef(new Animated.Value(1)).current;
  const [viewed, setViewed] = useState(false);

  // After 5 seconds auto-mark as seen and close
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!viewed) {
        setViewed(true);
        await api.post(`/api/snaps/${snap.id}/seen`).catch(() => {});
        Animated.timing(fadeOut, { toValue: 0, duration: 500, useNativeDriver: true, easing: Easing.in(Easing.ease) }).start(onClose);
      }
    }, 5000);
    return () => clearTimeout(t);
  }, []);

  const handleTap = async () => {
    if (viewed) return;
    setViewed(true);
    await api.post(`/api/snaps/${snap.id}/seen`).catch(() => {});
    Animated.timing(fadeOut, { toValue: 0, duration: 400, useNativeDriver: true, easing: Easing.in(Easing.ease) }).start(onClose);
  };

  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: '#000' }} onPress={handleTap}>
        <Animated.View style={{ flex: 1, opacity: fadeOut }}>
          <Image source={{ uri: snap.photo_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          {/* Gradient overlay */}
          <LinearGradient colors={['rgba(0,0,0,0.5)', 'transparent', 'rgba(0,0,0,0.7)']} style={StyleSheet.absoluteFill} />
          {/* Top bar */}
          <SafeAreaView edges={['top']} style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{snap.sender_name}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>{timeSince(snap.created_at)}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={26} color="#fff" />
            </Pressable>
          </SafeAreaView>
          {/* Caption */}
          {snap.caption ? (
            <View style={{ position: 'absolute', bottom: 80, left: 0, right: 0, padding: 24, alignItems: 'center' }}>
              <View style={{ backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12 }}>
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center' }}>{snap.caption}</Text>
              </View>
            </View>
          ) : null}
          {/* Tap to close hint */}
          <View style={{ position: 'absolute', bottom: 36, left: 0, right: 0, alignItems: 'center' }}>
            <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, fontWeight: '600' }}>Tap anywhere to close • {viewed ? 'Seen' : 'Viewing once'}</Text>
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

export default function SnapsScreen() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const { partner } = useCouple();
  const { partnerNickname } = useNicknames(user?.name, partner?.name);

  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [viewing, setViewing] = useState<Snap | null>(null);
  const [sending, setSending] = useState(false);
  const [caption, setCaption] = useState('');
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [editorUri, setEditorUri] = useState<string | null>(null);
  const [showImportSheet, setShowImportSheet] = useState(false);
  const sheetAnim = useRef(new Animated.Value(300)).current;
  const badgeScale = useRef(new Animated.Value(1)).current;

  const openImportSheet = () => {
    setShowImportSheet(true);
    Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 200 }).start();
  };
  const closeImportSheet = (cb?: () => void) => {
    Animated.spring(sheetAnim, { toValue: 300, useNativeDriver: true, damping: 20, stiffness: 200 }).start(() => { setShowImportSheet(false); cb?.(); });
  };

  const load = useCallback(async () => {
    const data = await api.get<Snap[]>('/api/snaps').catch(() => [] as Snap[]);
    setSnaps(data);
    if (data.length > 0) {
      Animated.sequence([
        Animated.spring(badgeScale, { toValue: 1.3, useNativeDriver: true, speed: 50, bounciness: 10 }),
        Animated.spring(badgeScale, { toValue: 1,   useNativeDriver: true, speed: 12, bounciness: 6 }),
      ]).start();
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  const pickImage = async () => {
    closeImportSheet(async () => {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Go to Settings and allow photo library access for OurSpace.', [{ text: 'OK' }]);
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        base64: false,
        allowsEditing: true,
        aspect: [9, 16],
      });
      if (!res.canceled && res.assets[0]) {
        setEditorUri(res.assets[0].uri);
      }
    });
  };

  const pickFromCloud = async () => {
    closeImportSheet(async () => {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Go to Settings and allow photo library access for OurSpace.', [{ text: 'OK' }]);
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        base64: false,
        allowsEditing: true,
        aspect: [9, 16],
      });
      if (!res.canceled && res.assets[0]) {
        setEditorUri(res.assets[0].uri);
      }
    });
  };

  const takePhoto = async () => {
    closeImportSheet(async () => {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Camera access needed', 'Go to Settings and allow camera access for OurSpace.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        quality: 0.7,
        base64: false,
        allowsEditing: true,
        aspect: [9, 16],
      });
      if (!res.canceled && res.assets[0]) {
        setEditorUri(res.assets[0].uri);
      }
    });
  };

  const sendSnap = async () => {
    if (!pickedUri) return;
    setSending(true);
    haptics.medium();
    try {
      const { url } = await api.upload(pickedUri, { mimeType: 'image/jpeg' });
      await api.post('/api/snaps', { photo_url: url, caption: caption.trim() });
      haptics.success();
      setShowCompose(false);
      setPickedUri(null);
      setCaption('');
      Alert.alert('💌 Snap sent!', `${partnerNickname || partner?.name?.split(' ')[0] || 'Partner'} can open it once.`);
    } catch (e: any) {
      haptics.error();
      Alert.alert('Could not send', e?.message);
    } finally {
      setSending(false);
    }
  };

  const openSnap = (snap: Snap) => {
    haptics.light();
    setViewing(snap);
  };

  const partnerName = partnerNickname || partner?.name?.split(' ')[0] || 'Partner';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: 14 }}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={{ width: 40, height: 40, justifyContent: 'center' }}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: '900', color: colors.text, letterSpacing: -0.4 }}>Snaps 📸</Text>
          <Text style={{ fontSize: 12, color: colors.muted, marginTop: 1 }}>View once · disappears after</Text>
        </View>
        {snaps.length > 0 && (
          <Animated.View style={{ transform: [{ scale: badgeScale }], backgroundColor: colors.rose, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>{snaps.length} new</Text>
          </Animated.View>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: 0, paddingBottom: 100 }}>
        {/* Send button */}
        <Pressable onPress={openImportSheet} style={{ height: 100, backgroundColor: colors.roseDim, borderRadius: 20, alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: space.xl, borderWidth: 1.5, borderColor: colors.rose + '44' }}>
          <Text style={{ fontSize: 28 }}>📸</Text>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.rose }}>Send a snap</Text>
        </Pressable>

        {/* Inbox */}
        <Text style={{ fontSize: 10, fontWeight: '800', color: colors.muted, letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 14 }}>
          From {partnerName}
        </Text>

        {snaps.length === 0 ? (
          <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 40, alignItems: 'center', borderWidth: 1, borderColor: colors.line }}>
            <Text style={{ fontSize: 44, marginBottom: 12 }}>👻</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 6 }}>No snaps yet</Text>
            <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center' }}>
              Send {partnerName} a snap first — they&apos;ll get a notification.
            </Text>
          </View>
        ) : (
          snaps.map(snap => (
            <Pressable key={snap.id} onPress={() => openSnap(snap)} style={{ marginBottom: 12 }}>
              <View style={{ backgroundColor: colors.surface, borderRadius: 18, overflow: 'hidden', borderWidth: 1.5, borderColor: colors.rose + '66' }}>
                {/* Thumbnail blurred preview */}
                <View style={{ height: 80, overflow: 'hidden' }}>
                  <Image source={{ uri: snap.photo_url }} style={{ width: '100%', height: '100%' }} blurRadius={12} resizeMode="cover" onError={() => {}} />
                  <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 28 }}>👆</Text>
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13, marginTop: 4 }}>Tap to open</Text>
                  </View>
                </View>
                <View style={{ padding: 12, flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', color: colors.text, fontSize: 14 }}>{snap.sender_name}</Text>
                    {snap.caption ? <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>{snap.caption}</Text> : null}
                  </View>
                  <Text style={{ fontSize: 11, color: colors.muted }}>{timeSince(snap.created_at)}</Text>
                </View>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>

      {/* Import sheet */}
      <Modal visible={showImportSheet} transparent animationType="none" onRequestClose={() => closeImportSheet()}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} onPress={() => closeImportSheet()}>
          <Animated.View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 32, paddingTop: 20, paddingHorizontal: space.lg, transform: [{ translateY: sheetAnim }] }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, textAlign: 'center', marginBottom: 20 }}>Add a memory 📸</Text>

            <Pressable onPress={takePhoto} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface2, borderRadius: 16, padding: space.md, marginBottom: 10, gap: space.md, borderWidth: 1, borderColor: colors.line }}>
              <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: colors.roseDim, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 24 }}>📷</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 2 }}>Take photo</Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>Use your camera right now</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>

            <Pressable onPress={pickImage} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface2, borderRadius: 16, padding: space.md, marginBottom: 10, gap: space.md, borderWidth: 1, borderColor: colors.line }}>
              <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 24 }}>🖼️</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 2 }}>Device gallery</Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>Choose from your phone&apos;s photos</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>

            <Pressable onPress={pickFromCloud} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface2, borderRadius: 16, padding: space.md, marginBottom: 10, gap: space.md, borderWidth: 1, borderColor: colors.line }}>
              <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 24 }}>☁️</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 2 }}>Cloud storage</Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>Import from Google Drive, Google Photos, or Dropbox</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>

            <Pressable onPress={() => closeImportSheet()} style={{ marginTop: 6, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: colors.muted }}>Cancel</Text>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>

      {/* Compose modal */}
      {showCompose && pickedUri && (
        <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCompose(false)}>
          <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
            <Image source={{ uri: pickedUri }} style={{ flex: 1 }} resizeMode="cover" />
            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: space.lg }}>
              <TextInput
                value={caption}
                onChangeText={setCaption}
                placeholder="Add a caption…"
                placeholderTextColor="rgba(255,255,255,0.45)"
                style={{ color: '#fff', fontSize: 18, fontWeight: '600', textAlign: 'center', marginBottom: space.lg, minHeight: 44 }}
                maxLength={120}
                multiline
              />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Pressable onPress={() => { setShowCompose(false); setPickedUri(null); setCaption(''); }} style={{ flex: 1, height: 52, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Retake</Text>
                </Pressable>
                <Pressable onPress={sendSnap} disabled={sending} style={{ flex: 2, height: 52, backgroundColor: colors.rose, borderRadius: 16, alignItems: 'center', justifyContent: 'center', opacity: sending ? 0.6 : 1 }}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{sending ? 'Sending…' : `Send to ${partnerName} 💌`}</Text>
                </Pressable>
              </View>
            </LinearGradient>
            <Pressable onPress={() => { setShowCompose(false); setPickedUri(null); setCaption(''); }} hitSlop={12} style={{ position: 'absolute', top: 54, right: 16 }}>
              <Ionicons name="close-circle" size={30} color="rgba(255,255,255,0.7)" />
            </Pressable>
          </SafeAreaView>
        </Modal>
      )}

      {/* Photo editor — decorate before sending a snap */}
      <PhotoEditor
        visible={!!editorUri}
        uri={editorUri}
        onCancel={() => setEditorUri(null)}
        onDone={(edited) => { setEditorUri(null); setPickedUri(edited); setShowCompose(true); }}
      />

      {/* Full-screen snap viewer */}
      {viewing && (
        <SnapViewer
          snap={viewing}
          onClose={() => {
            setViewing(null);
            // Remove from inbox (already marked seen server-side)
            setSnaps(prev => prev.filter(s => s.id !== viewing.id));
          }}
        />
      )}
    </SafeAreaView>
  );
}
