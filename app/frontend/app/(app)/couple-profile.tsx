import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, Easing, Image, KeyboardAvoidingView,
  Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/src/api';
import { Button } from '@/src/components/Button';
import { DateField } from '@/src/components/DateTimeField';
import { Input } from '@/src/components/Input';
import { Press } from '@/src/components/Press';
import { useAuth } from '@/src/context/AuthContext';
import { useCouple } from '@/src/context/CoupleContext';
import { useTheme } from '@/src/context/ThemeContext';
import { haptics } from '@/src/haptics';
import { useNicknames } from '@/src/hooks/useNicknames';
import { Colors, radius, space } from '@/src/theme';

// ─── Love Language ────────────────────────────────────────────────────────────
const LOVE_LANGUAGES = [
  { key: 'words', label: 'Words of Affirmation', emoji: '💬' },
  { key: 'acts',  label: 'Acts of Service',       emoji: '🛠️' },
  { key: 'gifts', label: 'Receiving Gifts',        emoji: '🎁' },
  { key: 'time',  label: 'Quality Time',           emoji: '⏰' },
  { key: 'touch', label: 'Physical Touch',         emoji: '🤝' },
] as const;
type LLKey = typeof LOVE_LANGUAGES[number]['key'];

// ─── Care preferences ─────────────────────────────────────────────────────────
type CareProfile = { when_stressed?: string[]; feels_loved?: string[]; difficult_day?: string[]; custom_notes?: string };

const WHEN_STRESSED = ['Give me space', 'Check in on me', 'Send a funny meme', 'Call me', 'Just listen', 'Distract me', 'Send food 🍕'];
const FEELS_LOVED   = ['Words of affirmation', 'Quality time', 'Acts of service', 'Physical touch', 'Gift surprises', 'Long voice notes', 'Spontaneous calls'];
const DIFFICULT_DAY = ["Send a virtual hug", 'Play a playlist for me', 'Write me a letter', 'Plan something fun', 'Just be there', "Tell me it'll be okay"];

interface Profile {
  first_met?: string;
  anniversary?: string;
  my_birthday?: string;
  partner_birthday?: string;
  my_pet_name?: string;
  partner_pet_name?: string;
}

function calcTimeDiff(from: string): { years: number; months: number; days: number; hours: number; minutes: number; seconds: number } | null {
  const start = new Date(from).getTime();
  if (isNaN(start)) return null;
  const diff = Date.now() - start;
  if (diff < 0) return null;
  const totalSec = Math.floor(diff / 1000);
  const seconds  = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const minutes  = totalMin % 60;
  const totalHr  = Math.floor(totalMin / 60);
  const hours    = totalHr % 24;
  const totalDays = Math.floor(totalHr / 24);
  const years   = Math.floor(totalDays / 365);
  const months  = Math.floor((totalDays % 365) / 30);
  const days    = Math.floor((totalDays % 365) % 30);
  return { years, months, days, hours, minutes, seconds };
}

function daysUntilNext(dateStr?: string): number | null {
  if (!dateStr) return null;
  const [, mm, dd] = dateStr.split('-');
  const now = new Date();
  let next = new Date(now.getFullYear(), parseInt(mm) - 1, parseInt(dd));
  if (next.getTime() < now.getTime()) {
    next = new Date(now.getFullYear() + 1, parseInt(mm) - 1, parseInt(dd));
  }
  return Math.ceil((next.getTime() - now.getTime()) / 86_400_000);
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    root:      { flex: 1, backgroundColor: c.bg },
    backBtn:   { width: 44, height: 44, justifyContent: 'center' },
    header:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm },

    heroGrad:  { marginHorizontal: space.lg, borderRadius: 24, overflow: 'hidden', marginBottom: space.lg },
    heroInner: { padding: space.xl, alignItems: 'center' },
    heroLbl:   { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.65)', letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: space.sm },
    counterRow:{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: space.md },
    countBox:  { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center', minWidth: 60 },
    countNum:  { fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: -1, lineHeight: 32 },
    countUnit: { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 2 },
    sinceText: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '500', textAlign: 'center', marginTop: 4 },

    sectionLbl:{ fontSize: 10, fontWeight: '800', color: c.muted, letterSpacing: 1.6, textTransform: 'uppercase', marginHorizontal: space.lg, marginTop: space.lg, marginBottom: space.sm },
    card:      { marginHorizontal: space.lg, backgroundColor: c.surface, borderRadius: 20, borderWidth: 1, borderColor: c.line, marginBottom: space.sm, overflow: 'hidden' },
    row:       { flexDirection: 'row', alignItems: 'center', padding: space.md + 2, borderBottomWidth: 1, borderBottomColor: c.line },
    rowLast:   { borderBottomWidth: 0 },
    rowIcon:   { fontSize: 20, marginRight: space.md, width: 28, textAlign: 'center' },
    rowLabel:  { fontSize: 14, color: c.textSec, fontWeight: '500', flex: 1 },
    rowValue:  { fontSize: 14, fontWeight: '700', color: c.text },
    rowSub:    { fontSize: 11, color: c.rose, fontWeight: '700', marginTop: 1 },
    editBtn:   { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: c.roseDim, borderRadius: radius.full },
    editBtnTxt:{ fontSize: 12, color: c.rose, fontWeight: '700' },

    emptyRow:  { flexDirection: 'row', alignItems: 'center', padding: space.md + 2 },
    emptyTxt:  { fontSize: 14, color: c.muted, flex: 1, fontStyle: 'italic' },

    // Modal
    modal:     { flex: 1, backgroundColor: c.bg },
    modalH:    { flexDirection: 'row', alignItems: 'center', padding: space.lg, paddingBottom: space.md },
    modalT:    { fontSize: 22, fontWeight: '800', color: c.text, flex: 1, letterSpacing: -0.3 },
    fLbl:      { fontSize: 11, fontWeight: '700', color: c.textSec, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6, marginTop: space.sm },
    fInput:    { backgroundColor: c.surface2, borderRadius: 14, height: 52, paddingHorizontal: space.md, color: c.text, fontSize: 15, borderWidth: 1, borderColor: c.line, marginBottom: space.md },
    saveBtn:   { backgroundColor: c.rose, borderRadius: 16, height: 56, alignItems: 'center', justifyContent: 'center', marginTop: space.sm, marginHorizontal: space.lg },
    saveBtnT:  { color: '#fff', fontSize: 16, fontWeight: '800' },
    helper:    { fontSize: 12, color: c.muted, marginBottom: space.md, lineHeight: 18 },

    // Love Language + Care sections
    sectionCard: { marginHorizontal: space.lg, backgroundColor: c.surface, borderRadius: 20, borderWidth: 1, borderColor: c.line, marginBottom: space.sm, padding: space.md + 2, overflow: 'hidden' },
    sectionTitle: { fontSize: 17, fontWeight: '800', color: c.text, marginBottom: 4 },
    sectionSub:   { fontSize: 13, color: c.textSec, marginBottom: space.md },
    llRow:        { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 12, paddingHorizontal: space.md, borderRadius: 14, marginBottom: 6, backgroundColor: c.surface2, borderWidth: 1, borderColor: c.line },
    llRowActive:  { backgroundColor: c.roseDim, borderColor: c.rose },
    llLabel:      { fontSize: 15, fontWeight: '500', color: c.text, flex: 1 },
    careChip:     { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: c.surface2, borderWidth: 1, borderColor: c.line },
    careChipActive:{ backgroundColor: c.roseDim, borderColor: c.rose },
    careLabel:    { fontSize: 11, fontWeight: '800', color: c.muted, letterSpacing: 1.4, textTransform: 'uppercase' },

    // Personal Profile Settings Style
    avatarWrap:   { alignItems: 'center', marginBottom: space.lg, marginTop: space.sm },
    avatar:       { width: 100, height: 100, borderRadius: 50, backgroundColor: c.roseDim, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: c.rose, overflow: 'hidden', position: 'relative' },
    avatarImg:    { width: 100, height: 100, borderRadius: 50 },
    avatarTxt:    { fontSize: 40, fontWeight: '900', color: c.rose },
    changeBtn:    { marginTop: space.sm, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: c.roseDim, borderRadius: radius.full },
    changeBtnTxt: { fontSize: 13, fontWeight: '700', color: c.rose },
    textArea:     { backgroundColor: c.surface2, borderRadius: 14, minHeight: 80, padding: space.md, color: c.text, fontSize: 15, borderWidth: 1, borderColor: c.line, textAlignVertical: 'top' },
    charCount:    { fontSize: 11, color: c.muted, textAlign: 'right', marginTop: 4, marginBottom: space.md },
    primarySaveBtn:{ backgroundColor: c.rose, borderRadius: 16, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: space.md },
    saveBtnDis:   { opacity: 0.5 },
    uploading:    { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 50, alignItems: 'center', justifyContent: 'center' },
  });
}

// Ticking number — blinks on update
function TickNum({ value, unit }: { value: number; unit: string }) {
  const { colors } = useTheme();
  const pulse = useRef(new Animated.Value(1)).current;
  const prev = useRef(value);
  useEffect(() => {
    if (value !== prev.current) {
      prev.current = value;
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.18, duration: 120, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
        Animated.timing(pulse, { toValue: 1,    duration: 180, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
      ]).start();
    }
  }, [value]);

  const s = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={s.countBox}>
      <Animated.Text style={[s.countNum, { transform: [{ scale: pulse }] }]}>{value}</Animated.Text>
      <Text style={s.countUnit}>{unit}</Text>
    </View>
  );
}

export default function CoupleProfileScreen() {
  const { colors, isDark } = useTheme();
  const { user, updateUser } = useAuth();
  const { partner, couple } = useCouple();
  const { myNickname, partnerNickname } = useNicknames(user?.name, partner?.name);

  // Tab State
  const { tab: urlTab } = useLocalSearchParams<{ tab?: 'profile' | 'story' }>();
  const [activeTab, setActiveTab] = useState<'profile' | 'story'>(urlTab === 'story' ? 'story' : 'profile');

  // Personal Profile Fields
  const [name, setName]       = useState(user?.name ?? '');
  const [city, setCity]       = useState(user?.location_city ?? '');
  const [bio, setBio]         = useState(user?.bio ?? '');
  const [birthday, setBirthday] = useState(user?.birthday ?? '');
  const [avatarUri, setAvatarUri] = useState<string | null>(user?.avatar_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  // Couple Profile / Milestones Fields
  const [profile, setProfile]   = useState<Profile>({});
  const [tick, setTick]         = useState(calcTimeDiff(profile.first_met ?? ''));
  const [showModal, setShowModal] = useState(false);
  const [savingCouple, setSavingCouple] = useState(false);

  // Love language
  const [myLoveLanguage, setMyLoveLanguage] = useState<LLKey | null>(null);
  const [llSaving, setLlSaving] = useState(false);

  // Care preferences
  const [care, setCare] = useState<CareProfile>({});
  const [careNotes, setCareNotes] = useState('');
  const [careSaving, setCareSaving] = useState(false);

  // Editable draft fields
  const [dFirstMet,     setDFirstMet]     = useState('');
  const [dAnniversary,  setDAnniversary]  = useState('');
  const [dMyBday,       setDMyBday]       = useState('');
  const [dPartnerBday,  setDPartnerBday]  = useState('');
  const [dMyPetName,    setDMyPetName]    = useState('');
  const [dPartnerPet,   setDPartnerPet]   = useState('');

  const s = useMemo(() => makeStyles(colors), [colors]);

  const loadCouple = useCallback(async () => {
    const p = await api.get<Profile>('/api/couple-profile').catch(() => ({}));
    setProfile(p);
  }, []);

  useEffect(() => { loadCouple(); }, [loadCouple]);

  useEffect(() => {
    if (user) {
      setName(user.name ?? '');
      setCity(user.location_city ?? '');
      setBio(user.bio ?? '');
      setBirthday(user.birthday ?? '');
      setAvatarUri(user.avatar_url ?? null);
    }
  }, [user]);

  useEffect(() => {
    api.get<{ language: string }>('/api/love-language')
      .then(r => { if (r?.language) setMyLoveLanguage(r.language as LLKey); })
      .catch(() => {});
    api.get<CareProfile>('/api/care')
      .then(p => { setCare(p); setCareNotes(p.custom_notes ?? ''); })
      .catch(() => {});
  }, []);

  // Live counter — tick every second
  useEffect(() => {
    const src = profile.first_met ?? couple?.created_at;
    const id = setInterval(() => setTick(calcTimeDiff(src ?? '')), 1000);
    setTick(calcTimeDiff(src ?? ''));
    return () => clearInterval(id);
  }, [profile.first_met, couple?.created_at]);

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo library access in Settings.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85, allowsEditing: true, aspect: [1, 1] });
    if (result.canceled) return;
    const uri = result.assets[0].uri;
    setUploading(true);
    try {
      const res = await api.upload(uri, { name: `avatar-${Date.now()}.jpg`, mimeType: 'image/jpeg' });
      await api.post('/api/profile/photo', { url: res.url }).catch(() => {});
      setAvatarUri(res.url);
      haptics.success();
    } catch { Alert.alert('Upload failed', 'Could not upload photo.'); }
    finally { setUploading(false); }
  };

  const saveProfile = async () => {
    if (!name.trim()) { Alert.alert('Name required'); return; }
    setSavingProfile(true); haptics.light();
    try {
      await api.put('/api/profile', {
        name: name.trim(),
        location_city: city.trim() || null,
        bio: bio.trim() || null,
        birthday: birthday.trim() || null,
        avatar_url: avatarUri ?? undefined,
      });
      updateUser({ name: name.trim(), location_city: city.trim() || undefined, bio: bio.trim() || undefined, birthday: birthday.trim() || undefined, avatar_url: avatarUri ?? undefined });
      haptics.success();
      Alert.alert('Success', 'Profile updated successfully.');
    } catch (e: any) {
      Alert.alert('Save failed', e?.message ?? 'Please try again.');
    }
    finally { setSavingProfile(false); }
  };

  const saveLoveLanguage = async (key: LLKey) => {
    setMyLoveLanguage(key);
    setLlSaving(true);
    try { await api.post('/api/love-language', { result: key }); }
    catch { /* silent */ }
    finally { setLlSaving(false); }
  };

  const toggleCare = (field: keyof Omit<CareProfile, 'custom_notes'>, val: string) => {
    setCare(prev => {
      const cur = (prev[field] as string[] | undefined) ?? [];
      return { ...prev, [field]: cur.includes(val) ? cur.filter(v => v !== val) : [...cur, val] };
    });
  };

  const isCareSelected = (field: keyof Omit<CareProfile, 'custom_notes'>, val: string) =>
    ((care[field] as string[] | undefined) ?? []).includes(val);

  const saveCare = async () => {
    setCareSaving(true);
    try { await api.put('/api/care', { ...care, custom_notes: careNotes }); haptics.success(); }
    catch (e: any) { haptics.error(); Alert.alert('Error', e?.message ?? 'Could not save.'); }
    finally { setCareSaving(false); }
  };

  const openEdit = () => {
    setDFirstMet(profile.first_met ?? '');
    setDAnniversary(profile.anniversary ?? '');
    setDMyBday(profile.my_birthday ?? '');
    setDPartnerBday(profile.partner_birthday ?? '');
    setDMyPetName(profile.my_pet_name ?? '');
    setDPartnerPet(profile.partner_pet_name ?? '');
    setShowModal(true);
  };

  const saveCoupleStory = async () => {
    setSavingCouple(true);
    try {
      await api.put('/api/couple-profile', {
        first_met: dFirstMet || undefined,
        anniversary: dAnniversary || undefined,
        my_birthday: dMyBday || undefined,
        partner_birthday: dPartnerBday || undefined,
        my_pet_name: dMyPetName || undefined,
        partner_pet_name: dPartnerPet || undefined,
      });
      api.post('/api/calendar/sync-profile-events', {}).catch(() => {});
      haptics.success();
      setShowModal(false);
      loadCouple();
    } catch (e: any) {
      haptics.error();
      Alert.alert('Error', e?.message);
    } finally {
      setSavingCouple(false);
    }
  };

  const heroGrad: [string, string, string] = isDark
    ? ['#B83A5A', '#8A2A7A', '#3A2AAA']
    : ['#E8607A', '#C94B9B', '#6B4BEF'];

  const srcDate = profile.first_met ?? couple?.created_at;
  const since = srcDate
    ? new Date(srcDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  const name1 = myNickname || user?.name?.split(' ')[0] || 'You';
  const name2 = partnerNickname || partner?.name?.split(' ')[0] || 'Partner';

  const bdayDays1 = daysUntilNext(profile.my_birthday);
  const bdayDays2 = daysUntilNext(profile.partner_birthday);
  const annivDays = daysUntilNext(profile.anniversary);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <Press haptic="light" style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Press>
        <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, flex: 1, letterSpacing: -0.3 }}>
          {activeTab === 'profile' ? 'Profile Settings' : 'Our Story'}
        </Text>
        {activeTab === 'story' && (
          <Press haptic="light" onPress={openEdit}>
            <View style={s.editBtn}><Text style={s.editBtnTxt}>Edit Story ✏️</Text></View>
          </Press>
        )}
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: 'row', marginHorizontal: space.lg, marginBottom: space.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 4, gap: 4, borderWidth: 1, borderColor: colors.line }}>
        <Press
          haptic="light"
          style={{ flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: radius.md, backgroundColor: activeTab === 'profile' ? colors.rose : 'transparent' }}
          onPress={() => setActiveTab('profile')}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: activeTab === 'profile' ? '#fff' : colors.textSec }}>
            👤 My Profile
          </Text>
        </Press>
        <Press
          haptic="light"
          style={{ flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: radius.md, backgroundColor: activeTab === 'story' ? colors.rose : 'transparent' }}
          onPress={() => setActiveTab('story')}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: activeTab === 'story' ? '#fff' : colors.textSec }}>
            💖 Our Story
          </Text>
        </Press>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
          
          {activeTab === 'profile' ? (
            /* 👤 PROFILE TAB */
            <View>
              {/* Profile Photo */}
              <View style={s.avatarWrap}>
                <View style={s.avatar}>
                  {avatarUri
                    ? <Image source={{ uri: avatarUri }} style={s.avatarImg} />
                    : <Text style={s.avatarTxt}>{(name || user?.name || '?')[0]?.toUpperCase()}</Text>
                  }
                  {uploading && (
                    <View style={s.uploading}>
                      <ActivityIndicator color="#fff" />
                    </View>
                  )}
                </View>
                <Press haptic="light" style={s.changeBtn} onPress={pickPhoto} disabled={uploading}>
                  <Ionicons name="camera-outline" size={16} color={colors.rose} />
                  <Text style={s.changeBtnTxt}>Change photo</Text>
                </Press>
              </View>

              {/* Personal Details Card */}
              <Text style={s.sectionLbl}>Personal Details</Text>
              <View style={[s.sectionCard, { gap: space.sm }]}>
                <Input label="Display name" value={name} onChangeText={setName} placeholder="Your name" />
                <Input label="City" value={city} onChangeText={setCity} placeholder="Where do you live?" />
                <Input
                  label="Birthday"
                  value={birthday}
                  onChangeText={setBirthday}
                  placeholder="YYYY-MM-DD"
                  keyboardType="numbers-and-punctuation"
                />
                <Input
                  label="Bio"
                  value={bio}
                  onChangeText={t => setBio(t.slice(0, 120))}
                  placeholder="A little about you…"
                  multiline
                  numberOfLines={3}
                />
                <Text style={s.charCount}>{bio.length}/120</Text>

                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  label="Save Personal Details"
                  loading={savingProfile}
                  disabled={savingProfile || uploading}
                  onPress={saveProfile}
                />
              </View>

              {/* Love Language section */}
              <Text style={s.sectionLbl}>Love Language</Text>
              <View style={s.sectionCard}>
                <Text style={s.sectionTitle}>Love Language 💝</Text>
                <Text style={s.sectionSub}>How do you feel most loved?</Text>
                {LOVE_LANGUAGES.map(ll => (
                  <Pressable
                    key={ll.key}
                    onPress={() => !llSaving && saveLoveLanguage(ll.key)}
                    style={[s.llRow, myLoveLanguage === ll.key && s.llRowActive]}
                  >
                    <Text style={{ fontSize: 20 }}>{ll.emoji}</Text>
                    <Text style={[s.llLabel, myLoveLanguage === ll.key && { color: colors.rose, fontWeight: '700' }]}>{ll.label}</Text>
                    {myLoveLanguage === ll.key && <Ionicons name="checkmark-circle" size={20} color={colors.rose} />}
                  </Pressable>
                ))}
              </View>

              {/* Care preferences section */}
              <Text style={s.sectionLbl}>Care Preferences</Text>
              <View style={s.sectionCard}>
                <Text style={s.sectionTitle}>Care Preferences 🫶</Text>
                <Text style={s.sectionSub}>Help your partner know how to support you.</Text>

                {([
                  { label: "WHEN I'M STRESSED", key: 'when_stressed' as const, items: WHEN_STRESSED },
                  { label: 'I FEEL LOVED WHEN',  key: 'feels_loved'   as const, items: FEELS_LOVED },
                  { label: 'ON A DIFFICULT DAY', key: 'difficult_day' as const, items: DIFFICULT_DAY },
                ] as const).map(section => (
                  <View key={section.key} style={{ marginBottom: space.md + 4 }}>
                    <Text style={[s.careLabel, { marginBottom: space.sm }]}>{section.label}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {section.items.map(item => {
                        const active = isCareSelected(section.key, item);
                        return (
                          <Pressable
                            key={item}
                            style={[s.careChip, active && s.careChipActive]}
                            onPress={() => toggleCare(section.key, item)}
                          >
                            <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500', color: active ? colors.rose : colors.textSec }}>{item}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ))}

                <Text style={[s.careLabel, { marginBottom: space.sm }]}>Personal note</Text>
                <Input
                  label="Personal note"
                  value={careNotes}
                  onChangeText={setCareNotes}
                  multiline
                  numberOfLines={4}
                  placeholder="Anything else your partner should know…"
                />

                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  label={careSaving ? 'Saving…' : 'Save preferences'}
                  loading={careSaving}
                  disabled={careSaving}
                  onPress={saveCare}
                  style={{ marginTop: space.md }}
                />
              </View>
            </View>
          ) : (
            /* 💖 OUR STORY TAB */
            <View>
              {/* Live counter hero */}
              <View style={s.heroGrad}>
                <LinearGradient colors={heroGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.heroInner}>
                  <Text style={s.heroLbl}>{name1} + {name2} — together for</Text>
                  {tick ? (
                    <View style={s.counterRow}>
                      {tick.years > 0 && <TickNum value={tick.years}   unit={tick.years === 1 ? 'year' : 'years'} />}
                      {tick.months > 0 && <TickNum value={tick.months} unit={tick.months === 1 ? 'month' : 'months'} />}
                      <TickNum value={tick.days}    unit={tick.days === 1 ? 'day' : 'days'} />
                      <TickNum value={tick.hours}   unit={tick.hours === 1 ? 'hr' : 'hrs'} />
                      <TickNum value={tick.minutes} unit="min" />
                      <TickNum value={tick.seconds} unit="sec" />
                    </View>
                  ) : (
                    <View style={{ paddingVertical: space.xl }}>
                      <Press haptic="light" onPress={openEdit}>
                        <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 14, padding: space.md, alignItems: 'center' }}>
                          <Text style={{ fontSize: 26, marginBottom: 6 }}>💑</Text>
                          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Add when you first met</Text>
                          <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 4 }}>We'll start counting right away.</Text>
                        </View>
                      </Press>
                    </View>
                  )}
                  {since && <Text style={s.sinceText}>Since {since}</Text>}
                </LinearGradient>
              </View>

              {/* Milestones */}
              <Text style={s.sectionLbl}>Milestones</Text>
              <View style={s.card}>
                {/* First met */}
                <View style={s.row}>
                  <Text style={s.rowIcon}>💑</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowLabel}>First met</Text>
                    {profile.first_met
                      ? <Text style={s.rowValue}>{new Date(profile.first_met).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</Text>
                      : <Text style={s.emptyTxt}>Not set yet</Text>}
                  </View>
                </View>
                {/* Anniversary */}
                <View style={[s.row, s.rowLast]}>
                  <Text style={s.rowIcon}>💍</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowLabel}>Anniversary</Text>
                    {profile.anniversary ? (
                      <>
                        <Text style={s.rowValue}>{new Date(profile.anniversary).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</Text>
                        {annivDays !== null && <Text style={s.rowSub}>{annivDays === 0 ? '🎉 Today!' : `${annivDays} days away`}</Text>}
                      </>
                    ) : <Text style={s.emptyTxt}>Not set yet</Text>}
                  </View>
                </View>
              </View>

              {/* Birthdays */}
              <Text style={s.sectionLbl}>Birthdays</Text>
              <View style={s.card}>
                <View style={s.row}>
                  <Text style={s.rowIcon}>🎂</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowLabel}>{name1}'s birthday</Text>
                    {profile.my_birthday ? (
                      <>
                        <Text style={s.rowValue}>{new Date(profile.my_birthday).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</Text>
                        {bdayDays1 !== null && <Text style={s.rowSub}>{bdayDays1 === 0 ? '🎉 Today!' : `${bdayDays1} days away`}</Text>}
                      </>
                    ) : <Text style={s.emptyTxt}>Not set yet</Text>}
                  </View>
                </View>
                <View style={[s.row, s.rowLast]}>
                  <Text style={s.rowIcon}>🎂</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowLabel}>{name2}'s birthday</Text>
                    {profile.partner_birthday ? (
                      <>
                        <Text style={s.rowValue}>{new Date(profile.partner_birthday).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</Text>
                        {bdayDays2 !== null && <Text style={s.rowSub}>{bdayDays2 === 0 ? '🎉 Today!' : `${bdayDays2} days away`}</Text>}
                      </>
                    ) : <Text style={s.emptyTxt}>Not set yet</Text>}
                  </View>
                </View>
              </View>

              {/* Pet names */}
              {(profile.my_pet_name || profile.partner_pet_name) && (
                <>
                  <Text style={s.sectionLbl}>Pet names</Text>
                  <View style={s.card}>
                    {profile.my_pet_name && (
                      <View style={s.row}>
                        <Text style={s.rowIcon}>🐾</Text>
                        <Text style={s.rowLabel}>{name2} calls {name1}</Text>
                        <Text style={[s.rowValue, { color: colors.rose }]}>{profile.my_pet_name}</Text>
                      </View>
                    )}
                    {profile.partner_pet_name && (
                      <View style={[s.row, s.rowLast]}>
                        <Text style={s.rowIcon}>🐾</Text>
                        <Text style={s.rowLabel}>{name1} calls {name2}</Text>
                        <Text style={[s.rowValue, { color: colors.rose }]}>{profile.partner_pet_name}</Text>
                      </View>
                    )}
                  </View>
                </>
              )}

              {/* Couple stats */}
              {couple?.created_at && (
                <>
                  <Text style={s.sectionLbl}>Since joining OurSpace</Text>
                  <View style={[s.card, { flexDirection: 'row' }]}>
                    {[
                      { icon: '📅', value: Math.floor((Date.now() - new Date(couple.created_at).getTime()) / 86_400_000), label: 'Days' },
                      { icon: '💌', value: '∞',   label: 'Memories' },
                      { icon: '❤️', value: '∞',   label: 'Love' },
                    ].map((st, i) => (
                      <View key={i} style={{ flex: 1, alignItems: 'center', padding: space.md, borderRightWidth: i < 2 ? 1 : 0, borderRightColor: colors.line }}>
                        <Text style={{ fontSize: 22, marginBottom: 4 }}>{st.icon}</Text>
                        <Text style={{ fontSize: 22, fontWeight: '900', color: colors.text, letterSpacing: -1 }}>{st.value}</Text>
                        <Text style={{ fontSize: 10, color: colors.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 }}>{st.label}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Edit Couple Story Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowModal(false)}>
        <SafeAreaView style={s.modal}>
          <View style={s.modalH}>
            <Text style={s.modalT}>Edit Our Story</Text>
            <Pressable onPress={() => setShowModal(false)} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.muted} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
            <Text style={s.helper}>For birthdays, any year works — we use month &amp; day only.</Text>

            <View style={{ marginBottom: space.md }}><DateField label="When you first met" value={dFirstMet} onChange={setDFirstMet} /></View>
            <View style={{ marginBottom: space.md }}><DateField label="Anniversary date" value={dAnniversary} onChange={setDAnniversary} /></View>
            <View style={{ marginBottom: space.md }}><DateField label={`${name1}'s birthday`} value={dMyBday} onChange={setDMyBday} /></View>
            <View style={{ marginBottom: space.md }}><DateField label={`${name2}'s birthday`} value={dPartnerBday} onChange={setDPartnerBday} /></View>

            <Input
              label={`What ${name2} calls ${name1}`}
              value={dMyPetName}
              onChangeText={setDMyPetName}
              placeholder="Babe, honey, jaan…"
            />

            <View style={{ height: space.md }} />

            <Input
              label={`What ${name1} calls ${name2}`}
              value={dPartnerPet}
              onChangeText={setDPartnerPet}
              placeholder="Jaan, baby, love…"
            />
          </ScrollView>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            label={savingCouple ? 'Saving…' : 'Save our story'}
            loading={savingCouple}
            disabled={savingCouple}
            onPress={saveCoupleStory}
            style={{ marginHorizontal: space.lg, marginBottom: space.md }}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
