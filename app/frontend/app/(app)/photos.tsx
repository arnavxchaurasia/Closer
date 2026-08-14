import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Dimensions, FlatList, Image, Modal,
  Pressable, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/src/api';
import { useAuth } from '@/src/context/AuthContext';
import { NotConnected } from '@/src/components/NotConnected';
import { useCouple } from '@/src/context/CoupleContext';
import { useTheme } from '@/src/context/ThemeContext';
import { haptics } from '@/src/haptics';
import { space, radius } from '@/src/theme';

const SCREEN_W = Dimensions.get('window').width;
const THUMB = (SCREEN_W - space.lg * 2 - 8) / 3;

interface Photo {
  id: string;
  url: string;
  title?: string;
  uploaded_by: string;
  created_at: string;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function PhotosScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { isPaired, isLoading: coupleLoading } = useCouple();
  if (coupleLoading) return null;
  if (!isPaired) return <NotConnected message="Photos are shared with your partner. Connect to get started." />;
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState<Photo | null>(null);
  const [viewIndex, setViewIndex] = useState(0);

  const load = useCallback(async () => {
    try {
      const data = await api.get<Photo[]>('/api/photos');
      setPhotos(data);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const upload = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: false,
    });
    if (res.canceled || !res.assets[0]) return;

    setUploading(true);
    haptics.light();
    try {
      const { url } = await api.upload(res.assets[0].uri, { mimeType: 'image/jpeg' });
      await api.post('/api/photos', { url, title: '' });
      haptics.success();
      load();
    } catch (e: any) {
      haptics.error();
      Alert.alert('Upload failed', e?.message);
    } finally {
      setUploading(false);
    }
  };

  const deletePhoto = async (photo: Photo) => {
    Alert.alert('Delete photo?', 'This will remove it from your shared gallery.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await api.del(`/api/photos/${photo.id}`);
            setViewing(null);
            setPhotos(prev => prev.filter(p => p.id !== photo.id));
            haptics.light();
          } catch { haptics.error(); }
        },
      },
    ]);
  };

  const openPhoto = (photo: Photo, index: number) => {
    haptics.light();
    setViewIndex(index);
    setViewing(photo);
  };

  const isMyPhoto = (photo: Photo) => photo.uploaded_by === user?.user_id;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: 14 }}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={{ width: 40, height: 40, justifyContent: 'center' }}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: '900', color: colors.text, letterSpacing: -0.4 }}>Photos 📷</Text>
          <Text style={{ fontSize: 12, color: colors.muted, marginTop: 1 }}>Shared gallery · stays forever</Text>
        </View>
        <Text style={{ fontSize: 13, color: colors.muted, fontWeight: '700' }}>{photos.length} photo{photos.length !== 1 ? 's' : ''}</Text>
      </View>

      {/* Grid */}
      {photos.length === 0 && !loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <Text style={{ fontSize: 64, marginBottom: 16 }}>📷</Text>
          <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 8 }}>No shared photos yet</Text>
          <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20 }}>
            Tap + to add your first photo to the shared gallery.
          </Text>
        </View>
      ) : (
        <FlatList
          data={photos}
          keyExtractor={p => p.id}
          numColumns={3}
          contentContainerStyle={{ padding: space.lg, paddingTop: 0, paddingBottom: 100, gap: 4 }}
          columnWrapperStyle={{ gap: 4 }}
          renderItem={({ item, index }) => (
            <Pressable onPress={() => openPhoto(item, index)} style={{ position: 'relative' }}>
              <Image
                source={{ uri: item.url }}
                style={{ width: THUMB, height: THUMB, borderRadius: radius.sm, backgroundColor: colors.surface2 }}
                resizeMode="cover"
              />
              {/* Uploader initial badge */}
              <View style={{
                position: 'absolute', top: 4, right: 4,
                width: 20, height: 20, borderRadius: 10,
                backgroundColor: isMyPhoto(item) ? colors.rose : colors.surface2,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1.5, borderColor: '#fff',
              }}>
                <Text style={{ fontSize: 9, fontWeight: '900', color: isMyPhoto(item) ? '#fff' : colors.textSec }}>
                  {isMyPhoto(item) ? 'me' : '💕'}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}

      {/* FAB */}
      <Pressable
        onPress={upload}
        disabled={uploading}
        style={{
          position: 'absolute', right: 20, bottom: 100,
          width: 58, height: 58, borderRadius: 29,
          backgroundColor: colors.rose,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: colors.rose, shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
          elevation: 8, opacity: uploading ? 0.6 : 1,
        }}
      >
        <Ionicons name={uploading ? 'hourglass-outline' : 'add'} size={28} color="#fff" />
      </Pressable>

      {/* Full-screen viewer */}
      {viewing && (
        <Modal visible animationType="fade" onRequestClose={() => setViewing(null)}>
          <View style={{ flex: 1, backgroundColor: '#000' }}>
            <Image source={{ uri: viewing.url }} style={StyleSheet.absoluteFill} resizeMode="contain" />

            {/* Top bar */}
            <SafeAreaView edges={['top']} style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}>
              <Pressable onPress={() => setViewing(null)} hitSlop={12}>
                <Ionicons name="close-circle" size={32} color="rgba(255,255,255,0.8)" />
              </Pressable>
              <View style={{ flex: 1 }} />
              {isMyPhoto(viewing) && (
                <Pressable onPress={() => deletePhoto(viewing)} hitSlop={12}>
                  <Ionicons name="trash-outline" size={24} color="rgba(255,255,255,0.8)" />
                </Pressable>
              )}
            </SafeAreaView>

            {/* Bottom info */}
            <SafeAreaView edges={['bottom']} style={{ padding: 20 }}>
              <View style={{ backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 16, padding: 14 }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                  {isMyPhoto(viewing) ? 'You' : 'Your partner'} added this
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2 }}>
                  {fmtDate(viewing.created_at)}
                </Text>
                {viewing.title ? (
                  <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, marginTop: 6 }}>{viewing.title}</Text>
                ) : null}
              </View>
            </SafeAreaView>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}
