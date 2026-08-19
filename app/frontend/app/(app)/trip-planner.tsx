import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
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
import { radius, space } from '@/src/theme';

interface Trip {
  trip_id: string;
  title: string;
  date: string;
  notes?: string;
  packing_list: string[];
  places: string[];
}

function getCountdown(dateStr: string) {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return 'Happening now! 🎉';
  const days = Math.floor(diff / 86_400_000);
  const hrs = Math.floor((diff % 86_400_000) / 3_600_000);
  return `${days} days, ${hrs} hours left ✈️`;
}

export default function TripPlannerScreen() {
  const { colors } = useTheme();
  const { isPaired, isLoading: coupleLoading } = useCouple();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fTitle, setFTitle] = useState('');
  const [fDate, setFDate] = useState('');
  const [fNotes, setFNotes] = useState('');
  const [fPacking, setFPacking] = useState('');
  const [fPlaces, setFPlaces] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const data = await api.get<Trip[]>('/api/trips');
      setTrips(Array.isArray(data) ? data : []);
    } catch {
      setTrips([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isPaired) load();
  }, [isPaired]);

  const openAddModal = () => {
    setEditingId(null);
    setFTitle('');
    setFDate(new Date().toISOString().split('T')[0]);
    setFNotes('');
    setFPacking('');
    setFPlaces('');
    setShowModal(true);
  };

  const openEditModal = (t: Trip) => {
    setEditingId(t.trip_id);
    setFTitle(t.title);
    setFDate(t.date);
    setFNotes(t.notes || '');
    setFPacking(t.packing_list.map(x => x.replace(/^\[[ x]\] /, '')).join(', '));
    setFPlaces(t.places.map(x => x.replace(/^\[[ x]\] /, '')).join(', '));
    setShowModal(true);
  };

  const save = async () => {
    if (!fTitle.trim() || !fDate.trim()) {
      Alert.alert('Error', 'Please fill in Destination and Date.');
      return;
    }
    setSaving(true);
    haptics.medium();

    const packingArr = fPacking.split(',').map(x => x.trim()).filter(Boolean).map(x => `[ ] ${x}`);
    const placesArr = fPlaces.split(',').map(x => x.trim()).filter(Boolean).map(x => `[ ] ${x}`);

    const payload = {
      title: fTitle.trim(),
      date: fDate.trim(),
      notes: fNotes.trim() || undefined,
      packing_list: packingArr,
      places: placesArr,
    };

    try {
      if (editingId) {
        // We need to keep checked states if we are editing. Let's merge old checked states
        const oldTrip = trips.find(t => t.trip_id === editingId);
        if (oldTrip) {
          const oldPackingMap = new Map(oldTrip.packing_list.map(x => [x.replace(/^\[[ x]\] /, ''), x.startsWith('[x] ')]));
          const oldPlacesMap = new Map(oldTrip.places.map(x => [x.replace(/^\[[ x]\] /, ''), x.startsWith('[x] ')]));
          
          payload.packing_list = fPacking.split(',').map(x => x.trim()).filter(Boolean).map(x => {
            const checked = oldPackingMap.get(x);
            return `${checked ? '[x]' : '[ ]'} ${x}`;
          });
          payload.places = fPlaces.split(',').map(x => x.trim()).filter(Boolean).map(x => {
            const checked = oldPlacesMap.get(x);
            return `${checked ? '[x]' : '[ ]'} ${x}`;
          });
        }

        await api.put(`/api/trips/${editingId}`, payload);
      } else {
        await api.post('/api/trips', payload);
      }
      haptics.success();
      setShowModal(false);
      load();
    } catch {
      haptics.error();
      Alert.alert('Error', 'Could not save trip.');
    } finally {
      setSaving(false);
    }
  };

  const toggleCheck = async (trip: Trip, listKey: 'packing_list' | 'places', index: number) => {
    const list = [...trip[listKey]];
    const item = list[index];
    if (item.startsWith('[ ] ')) {
      list[index] = item.replace('[ ] ', '[x] ');
    } else if (item.startsWith('[x] ')) {
      list[index] = item.replace('[x] ', '[ ] ');
    }
    haptics.light();
    try {
      // Optimistically update
      setTrips(prev => prev.map(t => t.trip_id === trip.trip_id ? { ...t, [listKey]: list } : t));
      await api.put(`/api/trips/${trip.trip_id}`, { [listKey]: list });
    } catch {
      load();
    }
  };

  const remove = async (id: string) => {
    Alert.alert('Delete Trip', 'Are you sure you want to delete this trip?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          haptics.medium();
          try {
            await api.del(`/api/trips/${id}`);
            load();
          } catch {
            Alert.alert('Error', 'Could not delete trip.');
          }
        },
      },
    ]);
  };

  if (coupleLoading) return null;
  if (!isPaired) {
    return <NotConnected message="Connect with your partner to plan trips." />;
  }

  return (
    <SafeAreaView style={[s.root, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={s.header}>
        <Press haptic="light" onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Press>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: colors.text }]}>Trip Planner ✈️</Text>
          <Text style={{ fontSize: 12, color: colors.muted }}>Long distance visits & countdowns</Text>
        </View>
        <Press haptic="light" onPress={openAddModal} style={s.addBtn}>
          <Ionicons name="add" size={24} color={colors.rose} />
        </Press>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.rose} size="large" />
        </View>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={t => t.trip_id}
          contentContainerStyle={{ padding: space.lg, paddingBottom: 100, gap: space.lg }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 100, gap: 12 }}>
              <Text style={{ fontSize: 64 }}>✈️</Text>
              <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>No upcoming visits planned</Text>
              <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 20 }}>
                Count down to your next trip together.{'\n'}Share packing lists and notes!
              </Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const isNext = index === 0;
            return (
              <View style={[s.card, { backgroundColor: colors.surface, borderColor: isNext ? colors.rose : colors.line, borderWidth: isNext ? 1.5 : 1 }]}>
                {isNext && (
                  <View style={[s.nextTag, { backgroundColor: colors.rose }]}>
                    <Text style={s.nextTagText}>NEXT VISIT 💖</Text>
                  </View>
                )}
                
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.cardTitle, { color: colors.text }]}>{item.title}</Text>
                    <Text style={[s.cardDate, { color: colors.textSec }]}>
                      🗓️ {new Date(item.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </Text>
                    <Text style={[s.countdownText, { color: colors.rose }]}>
                      {getCountdown(item.date)}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Press haptic="light" onPress={() => openEditModal(item)}>
                      <Ionicons name="create-outline" size={20} color={colors.muted} />
                    </Press>
                    <Press haptic="light" onPress={() => remove(item.trip_id)}>
                      <Ionicons name="trash-outline" size={20} color={colors.muted} />
                    </Press>
                  </View>
                </View>

                {item.notes ? (
                  <Text style={[s.cardNotes, { color: colors.textSec, backgroundColor: colors.surface2 }]}>{item.notes}</Text>
                ) : null}

                {/* Checklist Sections */}
                <View style={{ gap: space.md, marginTop: space.md }}>
                  {/* Places to Visit */}
                  {item.places.length > 0 && (
                    <View>
                      <Text style={[s.secTitle, { color: colors.text }]}>📍 THINGS TO DO</Text>
                      {item.places.map((place, idx) => {
                        const checked = place.startsWith('[x] ');
                        const label = place.replace(/^\[[ x]\] /, '');
                        return (
                          <Pressable key={idx} onPress={() => toggleCheck(item, 'places', idx)} style={s.checkRow}>
                            <Ionicons name={checked ? "checkbox" : "square-outline"} size={18} color={checked ? colors.rose : colors.muted} />
                            <Text style={[s.checkText, { color: checked ? colors.muted : colors.text, textDecorationLine: checked ? 'line-through' : 'none' }]}>{label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}

                  {/* Packing List */}
                  {item.packing_list.length > 0 && (
                    <View>
                      <Text style={[s.secTitle, { color: colors.text }]}>🧳 PACKING LIST</Text>
                      {item.packing_list.map((pack, idx) => {
                        const checked = pack.startsWith('[x] ');
                        const label = pack.replace(/^\[[ x]\] /, '');
                        return (
                          <Pressable key={idx} onPress={() => toggleCheck(item, 'packing_list', idx)} style={s.checkRow}>
                            <Ionicons name={checked ? "checkbox" : "square-outline"} size={18} color={checked ? colors.rose : colors.muted} />
                            <Text style={[s.checkText, { color: checked ? colors.muted : colors.text, textDecorationLine: checked ? 'line-through' : 'none' }]}>{label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Add / Edit Modal */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <View style={[s.modalBg, { backgroundColor: colors.bg }]}>
          <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
            <View style={[s.modalHeader, { borderBottomColor: colors.line }]}>
              <Text style={[s.modalHeaderTitle, { color: colors.text }]}>
                {editingId ? 'Edit Trip ✈️' : 'Plan Next Trip ✈️'}
              </Text>
              <Press haptic="light" onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color={colors.muted} />
              </Press>
            </View>

            <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
              <Input
                label="Destination / Visit Name"
                value={fTitle}
                onChangeText={setFTitle}
                placeholder="e.g. London Visit, Summer Vacation"
              />

              <Input
                label="Start Date (YYYY-MM-DD)"
                value={fDate}
                onChangeText={setFDate}
                placeholder="YYYY-MM-DD"
                keyboardType="numbers-and-punctuation"
              />

              <Input
                label="Travel / Flight Details or Notes (Optional)"
                value={fNotes}
                onChangeText={setFNotes}
                multiline
                numberOfLines={3}
                placeholder="e.g. Flight BA 203 departs at 2:00 PM"
              />

              <Input
                label="Things to Do (Comma separated)"
                value={fPlaces}
                onChangeText={setFPlaces}
                placeholder="e.g. Museum, Dinner date, Picnic"
              />

              <Input
                label="Packing Checklist (Comma separated)"
                value={fPacking}
                onChangeText={setFPacking}
                placeholder="e.g. Tickets, Passport, Chargers"
              />

              <Button
                variant="primary"
                size="lg"
                fullWidth
                label={saving ? 'Saving…' : 'Save Trip'}
                loading={saving}
                onPress={save}
                disabled={saving}
                style={{ marginTop: space.lg, borderRadius: radius.lg }}
              />
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.1)' },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  addBtn: { width: 40, height: 40, alignItems: 'flex-end', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '800' },
  card: { padding: space.md, borderRadius: radius.xl, marginHorizontal: 2, marginBottom: space.md, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cardTitle: { fontSize: 18, fontWeight: '800', marginBottom: 2 },
  cardDate: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
  countdownText: { fontSize: 14, fontWeight: '700', marginBottom: space.sm },
  cardNotes: { fontSize: 13, lineHeight: 18, padding: space.sm, borderRadius: radius.md, overflow: 'hidden' },
  secTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1, marginVertical: 6, textTransform: 'uppercase', opacity: 0.6 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  checkText: { fontSize: 14 },
  nextTag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.md, marginBottom: 8 },
  nextTagText: { fontSize: 9, fontWeight: '900', color: '#fff' },
  modalBg: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.lg, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  modalHeaderTitle: { fontSize: 18, fontWeight: '800' },
  fLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  fInput: { height: 48, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: space.md, fontSize: 15 },
  saveBtn: { height: 50, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', marginTop: space.lg },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
