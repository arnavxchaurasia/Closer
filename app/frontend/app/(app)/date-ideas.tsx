import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, Modal, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/src/api';
import { Press } from '@/src/components/Press';
import { useTheme } from '@/src/context/ThemeContext';
import { haptics } from '@/src/haptics';
import { Colors, TAB_BAR_HEIGHT, radius, space } from '@/src/theme';

// ─── Types ───────────────────────────────────────────────────────────────────
type DateCategory = 'virtual' | 'local' | 'adventure' | 'cozy' | 'romantic' | 'creative';

type DateIdea = {
  title: string;
  emoji: string;
  description: string;
  duration: string;
  category: DateCategory;
};

// ─── Data ────────────────────────────────────────────────────────────────────
const DATE_IDEAS: Record<DateCategory, { title: string; emoji: string; description: string; duration: string }[]> = {
  virtual: [
    { title: 'Netflix Party', emoji: '🎬', description: "Pick a movie you've both been meaning to watch. Use Teleparty or just press play at the same time.", duration: '2-3 hrs' },
    { title: 'Cook the Same Recipe', emoji: '🍳', description: 'Pick a recipe, shop separately, and cook together on video call. Eat together after.', duration: '2 hrs' },
    { title: 'Online Escape Room', emoji: '🔐', description: 'Play a virtual escape room together — lots of free/cheap options online. Great for problem-solving vibes.', duration: '1 hr' },
    { title: 'Tour a Museum Together', emoji: '🏛️', description: 'Many world museums have free virtual tours. Pick one, walk through it on video call.', duration: '1-2 hrs' },
    { title: 'Play an Online Game', emoji: '🎮', description: 'Skribbl.io, Jackbox, Codenames, or Among Us. Pick something you can play together from anywhere.', duration: '1-2 hrs' },
    { title: 'Spotify Playlist Swap', emoji: '🎵', description: 'Make a playlist of 10 songs that describe you right now. Share and listen together while talking about each one.', duration: '1 hr' },
    { title: 'Virtual Stargazing', emoji: '🌟', description: 'Use Google Sky Map or Stellarium. Point at the same stars on a clear night and talk.', duration: '1 hr' },
    { title: 'Read the Same Book', emoji: '📚', description: 'Pick a short book or a few chapters. Read separately, video call to discuss like a book club of two.', duration: 'ongoing' },
    { title: 'Online Art Class', emoji: '🎨', description: 'Find a free YouTube art tutorial. Draw or paint the same thing together, reveal at the end.', duration: '1-2 hrs' },
    { title: 'Write Letters to Each Other', emoji: '✉️', description: 'Real pen-and-paper letters. Mail them. The waiting is part of the romance.', duration: 'ongoing' },
  ],
  local: [
    { title: 'Explore a New Neighborhood', emoji: '🗺️', description: "Pick a part of your city you've never been to. Walk around, find something interesting.", duration: '2-3 hrs' },
    { title: 'Farmers Market Morning', emoji: '🥦', description: 'Go to your local market, each buy ingredients for something, cook together later.', duration: '2 hrs' },
    { title: 'Sunrise Hike', emoji: '🌅', description: 'Set an alarm early. Watch the sun rise from somewhere with a view. Coffee after.', duration: '3 hrs' },
    { title: 'Thrift Store Challenge', emoji: '👗', description: 'Budget: $20 each. Buy the most ridiculous / perfect / funny outfit for the other person.', duration: '2 hrs' },
    { title: 'Picnic in the Park', emoji: '🧺', description: 'Make or buy good food, find a quiet spot, no phones except for music.', duration: '2-3 hrs' },
    { title: 'Bookshop Wander', emoji: '📖', description: 'Spend an afternoon in a used bookshop. Each buy one book for the other.', duration: '2 hrs' },
    { title: 'Cooking Class', emoji: '👨‍🍳', description: 'Many local restaurants offer couples cooking classes. Learn something together.', duration: '2-3 hrs' },
    { title: 'Rooftop Dinner', emoji: '🌆', description: 'Find a restaurant with a rooftop or good view. Dress up a little.', duration: '2 hrs' },
  ],
  adventure: [
    { title: 'Road Trip', emoji: '🚗', description: 'Pick a destination 2-4 hours away. No plan beyond showing up.', duration: 'weekend' },
    { title: 'Try Something Scary', emoji: '🧗', description: 'Rock climbing, skydiving, bungee, zip line. Fear is better together.', duration: '3-4 hrs' },
    { title: 'Camping Trip', emoji: '⛺', description: 'Find a campsite, disconnect from phones, sleep under stars.', duration: 'weekend' },
    { title: 'Concert or Festival', emoji: '🎸', description: 'See a band you love or discover something new together.', duration: '4-6 hrs' },
    { title: 'Spontaneous Flight', emoji: '✈️', description: "Search cheap last-minute flights. Go somewhere neither of you planned.", duration: 'weekend' },
    { title: 'Learn to Surf/Ski', emoji: '🏄', description: "Take a lesson together. Laughing at each other falling is bonding.", duration: '4 hrs' },
  ],
  cozy: [
    { title: 'Blanket Fort Movie Night', emoji: '🛋️', description: 'Build a fort, pick 2 movies, make snacks. Stay in.', duration: '4 hrs' },
    { title: 'Baking Day', emoji: '🍪', description: 'Pick something ambitious to bake from scratch. Focus on the process, not perfection.', duration: '3 hrs' },
    { title: 'Board Game Night', emoji: '🎲', description: 'Actually commit to a long board game. Catan, Pandemic, Ticket to Ride.', duration: '3-4 hrs' },
    { title: 'Spa Night at Home', emoji: '🛁', description: 'Face masks, good music, foot soaks, no phones. Take turns giving each other head massages.', duration: '2 hrs' },
    { title: 'Make a Photo Album', emoji: '📷', description: 'Go through old photos together. Order prints, make a physical album.', duration: '2-3 hrs' },
    { title: 'Cook a Fancy Dinner', emoji: '🍷', description: "Pick a recipe that takes 2+ hours. Dress up like you're going out.", duration: '3-4 hrs' },
  ],
  romantic: [
    { title: 'Recreate Your First Date', emoji: '💕', description: 'Go back to where it started. Recreate as much as you can.', duration: '3-4 hrs' },
    { title: 'Stargazing Night', emoji: '🌌', description: 'Drive away from city lights. Lay on a blanket. Find your constellations.', duration: '2-3 hrs' },
    { title: 'Love Letter Exchange', emoji: '💌', description: "Write each other actual handwritten letters about why you love them. Exchange and read together.", duration: '2 hrs' },
    { title: 'Anniversary Dinner', emoji: '🕯️', description: 'Book a table at somewhere nice. Dress up. Talk about the past year.', duration: '3 hrs' },
    { title: 'Surprise Day', emoji: '🎁', description: 'Plan an entire day of surprises — breakfast in bed, hidden notes, favorite things.', duration: 'full day' },
    { title: 'Dance Lesson', emoji: '💃', description: 'Take a salsa or ballroom class together. Or just dance in the kitchen.', duration: '1-2 hrs' },
  ],
  creative: [
    { title: 'Make a Mini Documentary', emoji: '🎥', description: 'Film a "day in the life" video together. Edit it together. Your own little film.', duration: '3-4 hrs' },
    { title: "Paint Each Other's Portraits", emoji: '🖌️', description: 'Get some cheap paint and canvas. No skill required — make it abstract, make it bad, make it yours.', duration: '2 hrs' },
    { title: 'Write a Song Together', emoji: '🎵', description: "Doesn't have to be good. Just make something — write lyrics, hum a melody, record it on a phone.", duration: '2 hrs' },
    { title: 'Scrapbook Your Year', emoji: '📔', description: 'Print photos, collect mementos, make a physical scrapbook of your year together.', duration: '3 hrs' },
    { title: 'Build Something', emoji: '🔧', description: 'IKEA furniture, a shelf, a small garden bed. Build something that stays in your home.', duration: '2-4 hrs' },
    { title: 'Start a Joint Project', emoji: '🌱', description: 'A shared blog, a podcast, a plant you both water, a business idea you sketch out. Something that grows.', duration: 'ongoing' },
  ],
};

const CATEGORIES: { key: DateCategory; label: string; emoji: string }[] = [
  { key: 'virtual', label: 'Virtual', emoji: '💻' },
  { key: 'local', label: 'Local', emoji: '📍' },
  { key: 'adventure', label: 'Adventure', emoji: '🧗' },
  { key: 'cozy', label: 'Cozy', emoji: '🛋️' },
  { key: 'romantic', label: 'Romantic', emoji: '🌹' },
  { key: 'creative', label: 'Creative', emoji: '🎨' },
];

const CATEGORY_COLORS: Record<DateCategory, { bg: string; accent: string }> = {
  virtual:   { bg: 'rgba(75,123,245,0.18)',   accent: '#4B7BF5' },
  local:     { bg: 'rgba(92,184,122,0.18)',    accent: '#5CB87A' },
  adventure: { bg: 'rgba(240,168,53,0.18)',    accent: '#F0A835' },
  cozy:      { bg: 'rgba(147,112,219,0.18)',   accent: '#9370DB' },
  romantic:  { bg: 'rgba(232,96,122,0.18)',    accent: '#E8607A' },
  creative:  { bg: 'rgba(255,140,0,0.18)',     accent: '#FF8C00' },
};

const FAV_KEY = '@ourspace_fav_dates';

function makeStyles(c: Colors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.md },
    headerTitle: { flex: 1, fontSize: 20, fontWeight: '700', color: c.text },
    backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
    shuffleBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', backgroundColor: c.surface2, borderRadius: radius.full },
    filterRow: { paddingLeft: space.lg, paddingBottom: space.sm, paddingTop: 2 },
    grid: { paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: TAB_BAR_HEIGHT + 80 },
    col: { flex: 1, padding: space.xs },
    card: { borderRadius: radius.xl, padding: space.md, marginBottom: space.sm, borderWidth: 1, borderColor: c.line, minHeight: 150 },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: space.xs },
    cardEmoji: { fontSize: 32 },
    cardHeart: { padding: 4 },
    cardTitle: { fontSize: 14, fontWeight: '700', color: c.text, marginBottom: 4 },
    cardDesc: { fontSize: 11, color: c.textSec, lineHeight: 16 },
    durationBadge: { marginTop: space.sm, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full, backgroundColor: 'rgba(0,0,0,0.15)' },
    durationText: { fontSize: 10, fontWeight: '700', color: '#fff' },
    fab: {
      position: 'absolute', bottom: TAB_BAR_HEIGHT + 16, right: 24,
      backgroundColor: c.rose, borderRadius: radius.full,
      paddingHorizontal: space.lg, paddingVertical: 14,
      flexDirection: 'row', alignItems: 'center', gap: space.sm,
      shadowColor: c.rose, shadowOpacity: 0.4, shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 }, elevation: 8,
    },
    fabText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: c.surface || '#141520', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: space.xl, maxHeight: '82%', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
    modalEmoji: { fontSize: 52, textAlign: 'center', marginBottom: space.md },
    modalTitle: { fontSize: 22, fontWeight: '700', color: c.text, textAlign: 'center', marginBottom: space.sm },
    modalDesc: { fontSize: 15, color: c.textSec, lineHeight: 23, textAlign: 'center', marginBottom: space.lg },
    durationRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: space.lg },
    durationPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.full },
    durationPillText: { fontSize: 13, fontWeight: '700', color: '#fff' },
    doItBtn: { borderRadius: radius.lg, height: 54, alignItems: 'center', justifyContent: 'center' },
    doItText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    closeBtn: { alignItems: 'center', paddingVertical: space.md },
    closeText: { color: c.muted, fontSize: 15 },
    aiSheet: { backgroundColor: c.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.xl },
    aiTitle: { fontSize: 20, fontWeight: '700', color: c.text, textAlign: 'center', marginBottom: space.md },
    aiBody: { fontSize: 15, color: c.textSec, lineHeight: 24, textAlign: 'center' },
    aiLoading: { alignItems: 'center', paddingVertical: space.xl, gap: space.md },
  });
}

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

export default function DateIdeasScreen() {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [activeCategory, setActiveCategory] = useState<DateCategory | null>(null);
  const [favKeys, setFavKeys] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<DateIdea | null>(null);
  const [showAI, setShowAI] = useState(false);
  const [aiIdea, setAiIdea] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [shuffleSeed, setShuffleSeed] = useState(0);

  const [planLoading, setPlanLoading] = useState(false);
  const [planText, setPlanText] = useState('');
  const [showPlan, setShowPlan] = useState(false);

  const buildDatePlan = async (idea: DateIdea) => {
    setPlanLoading(true);
    setShowPlan(true);
    setPlanText('');
    try {
      const res = await api.post<{ plan: string }>('/api/ai/date-plan', { title: idea.title, description: idea.description });
      setPlanText(res.plan);
    } catch {
      setPlanText('Failed to build a date plan. Please try again.');
    } finally {
      setPlanLoading(false);
    }
  };

  // Load favorites
  useEffect(() => {
    AsyncStorage.getItem(FAV_KEY).then(raw => {
      if (raw) {
        try { setFavKeys(new Set(JSON.parse(raw))); } catch {}
      }
    });
  }, []);

  const saveFavs = async (next: Set<string>) => {
    setFavKeys(next);
    await AsyncStorage.setItem(FAV_KEY, JSON.stringify([...next]));
  };

  const toggleFav = useCallback(async (idea: DateIdea) => {
    haptics.light();
    const key = `${idea.category}:${idea.title}`;
    const next = new Set(favKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    saveFavs(next);
  }, [favKeys]);

  // Build displayed ideas
  const displayedIdeas: DateIdea[] = useMemo(() => {
    const cats = activeCategory ? [activeCategory] : (Object.keys(DATE_IDEAS) as DateCategory[]);
    const all: DateIdea[] = [];
    for (const cat of cats) {
      for (const idea of DATE_IDEAS[cat]) {
        all.push({ ...idea, category: cat });
      }
    }
    // Shuffle deterministically with seed
    const seeded = [...all];
    for (let i = seeded.length - 1; i > 0; i--) {
      const j = Math.abs((shuffleSeed * 1664525 + i * 1013904223) % (i + 1));
      [seeded[i], seeded[j]] = [seeded[j], seeded[i]];
    }
    return seeded;
  }, [activeCategory, shuffleSeed]);

  const leftCol = displayedIdeas.filter((_, i) => i % 2 === 0);
  const rightCol = displayedIdeas.filter((_, i) => i % 2 !== 0);

  const generateAI = async () => {
    setShowAI(true);
    setAiIdea('');
    setAiLoading(true);
    try {
      const res = await api.get<{ ideas?: { title: string; description: string; emoji: string }[] }>('/api/ai/date-ideas');
      if (res.ideas && res.ideas.length > 0) {
        const randomIdea = res.ideas[Math.floor(Math.random() * res.ideas.length)];
        setAiIdea(`${randomIdea.emoji} ${randomIdea.title}\n\n${randomIdea.description}`);
      } else {
        const singleRes = await api.post<{ idea: string }>('/api/ai/date-idea');
        setAiIdea(singleRes.idea);
      }
    } catch {
      setAiIdea('✨ Surprise Sunset Picnic & Candlelight Dinner: Set up cozy fairy lights, bring warm chai or favorite wine, and listen to your couple playlist.');
    } finally {
      setAiLoading(false);
    }
  };

  const doThis = async (idea: DateIdea) => {
    setAdding(true);
    try {
      await api.post('/api/goals', { title: idea.title, category: 'lifestyle', goal_type: 'bucket' });
      setSelected(null);
      Alert.alert('Added! 💕', `"${idea.title}" was added to your bucket list.`);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not add.');
    } finally {
      setAdding(false);
    }
  };

  const renderCard = (idea: DateIdea, i: number, colIdx: number) => {
    const { bg, accent } = CATEGORY_COLORS[idea.category];
    const key = `${idea.category}:${idea.title}`;
    const isFav = favKeys.has(key);
    return (
      <FadeSlide key={key} delay={(colIdx + i * 2) * 40}>
        <Press
          style={[s.card, { backgroundColor: bg }]}
          haptic="light"
          onPress={() => setSelected(idea)}
        >
          <View style={s.cardTop}>
            <Text style={s.cardEmoji}>{idea.emoji}</Text>
            <TouchableOpacity style={s.cardHeart} onPress={() => toggleFav(idea)}>
              <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={18} color={isFav ? colors.rose : colors.muted} />
            </TouchableOpacity>
          </View>
          <Text style={s.cardTitle} numberOfLines={2}>{idea.title}</Text>
          <Text style={s.cardDesc} numberOfLines={2}>{idea.description}</Text>
          <View style={[s.durationBadge, { backgroundColor: accent + 'CC' }]}>
            <Text style={s.durationText}>{idea.duration}</Text>
          </View>
        </Press>
      </FadeSlide>
    );
  };

  const selColors = selected ? CATEGORY_COLORS[selected.category] : CATEGORY_COLORS.romantic;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <Press style={s.backBtn} haptic="light" onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Press>
        <Text style={s.headerTitle}>Date Ideas 💑</Text>
        <Press
          style={s.shuffleBtn}
          haptic="medium"
          onPress={() => { haptics.medium(); setShuffleSeed(s => s + 1); }}
        >
          <Ionicons name="shuffle-outline" size={20} color={colors.text} />
        </Press>
      </View>

      {/* Category filter */}
      <View style={s.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: space.sm, paddingRight: space.lg }}>
          <Press
            style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, backgroundColor: activeCategory === null ? colors.rose : colors.surface, borderWidth: 1, borderColor: activeCategory === null ? colors.rose : colors.line }}
            haptic="light"
            onPress={() => setActiveCategory(null)}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: activeCategory === null ? '#fff' : colors.textSec }}>All</Text>
          </Press>
          {CATEGORIES.map(cat => {
            const active = activeCategory === cat.key;
            return (
              <Press
                key={cat.key}
                style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, backgroundColor: active ? colors.rose : colors.surface, borderWidth: 1, borderColor: active ? colors.rose : colors.line }}
                haptic="light"
                onPress={() => setActiveCategory(active ? null : cat.key)}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#fff' : colors.textSec }}>{cat.emoji} {cat.label}</Text>
              </Press>
            );
          })}
        </ScrollView>
      </View>

      {/* Grid */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.grid}>
        <View style={{ flexDirection: 'row' }}>
          <View style={s.col}>
            {leftCol.map((idea, i) => renderCard(idea, i, 0))}
          </View>
          <View style={s.col}>
            {rightCol.map((idea, i) => renderCard(idea, i, 1))}
          </View>
        </View>
      </ScrollView>

      {/* AI Generate FAB */}
      <Press style={s.fab} haptic="medium" onPress={generateAI}>
        <Text style={{ fontSize: 16 }}>✨</Text>
        <Text style={s.fabText}>Generate Idea</Text>
      </Press>

      {/* Detail modal */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <Press style={s.overlay} haptic="none" onPress={() => setSelected(null)}>
          <Press style={s.sheet} haptic="none" onPress={() => {}}>
            {selected && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={s.modalEmoji}>{selected.emoji}</Text>
                <Text style={s.modalTitle}>{selected.title}</Text>
                <Text style={s.modalDesc}>{selected.description}</Text>
                <View style={s.durationRow}>
                  <View style={[s.durationPill, { backgroundColor: selColors.accent }]}>
                    <Text style={s.durationPillText}>{selected.duration}</Text>
                  </View>
                </View>
                <Press
                  style={[s.doItBtn, { backgroundColor: selColors.accent }, adding && { opacity: 0.6 }]}
                  haptic="medium"
                  onPress={() => doThis(selected)}
                  disabled={adding}
                >
                  <Text style={s.doItText}>{adding ? 'Adding…' : "Add to bucket list 💕"}</Text>
                </Press>
                <Press
                  style={[s.doItBtn, { backgroundColor: colors.surface2, marginTop: 10, borderWidth: 1, borderColor: colors.line }]}
                  haptic="medium"
                  onPress={() => buildDatePlan(selected)}
                >
                  <Text style={[s.doItText, { color: colors.text }]}>Build plan with Aria ✨</Text>
                </Press>
                <Press style={s.closeBtn} haptic="light" onPress={() => setSelected(null)}>
                  <Text style={s.closeText}>Maybe later</Text>
                </Press>
              </ScrollView>
            )}
          </Press>
        </Press>
      </Modal>

      {/* AI idea modal */}
      <Modal visible={showAI} transparent animationType="slide" onRequestClose={() => setShowAI(false)}>
        <Press style={s.overlay} haptic="none" onPress={() => setShowAI(false)}>
          <Press style={s.aiSheet} haptic="none" onPress={() => {}}>
            <Text style={s.aiTitle}>✨ AI Date Idea</Text>
            {aiLoading ? (
              <View style={s.aiLoading}>
                <ActivityIndicator color={colors.rose} size="large" />
                <Text style={{ color: colors.muted, fontSize: 14 }}>Thinking of something special…</Text>
              </View>
            ) : (
              <>
                <Text style={s.aiBody}>{aiIdea}</Text>
                
                <Press
                  style={[s.doItBtn, { backgroundColor: colors.rose, marginTop: space.lg }]}
                  haptic="medium"
                  onPress={() => {
                    const ideaObj = {
                      title: aiIdea.split('\n')[0].replace(/[^a-zA-Z0-9\s]/g, '').trim() || 'AI Date Idea',
                      description: aiIdea,
                      emoji: '✨',
                      duration: '2-3 hours',
                      category: 'special' as any
                    };
                    doThis(ideaObj);
                    setShowAI(false);
                  }}
                >
                  <Text style={s.doItText}>Add to bucket list 💕</Text>
                </Press>

                <Press
                  style={[s.doItBtn, { backgroundColor: colors.surface2, marginTop: 10, borderWidth: 1, borderColor: colors.line }]}
                  haptic="medium"
                  onPress={() => {
                    const ideaObj = {
                      title: aiIdea.split('\n')[0].replace(/[^a-zA-Z0-9\s]/g, '').trim() || 'AI Date Idea',
                      description: aiIdea,
                      emoji: '✨',
                      duration: '2-3 hours',
                      category: 'special' as any
                    };
                    setSelected(ideaObj);
                    buildDatePlan(ideaObj);
                    setShowAI(false);
                  }}
                >
                  <Text style={[s.doItText, { color: colors.text }]}>Build plan with Aria ✨</Text>
                </Press>

                <Press
                  style={[s.doItBtn, { backgroundColor: colors.surface3 || colors.line, marginTop: 10 }]}
                  haptic="medium"
                  onPress={generateAI}
                >
                  <Text style={[s.doItText, { color: colors.textSec }]}>Generate another</Text>
                </Press>

                <Press style={s.closeBtn} haptic="light" onPress={() => setShowAI(false)}>
                  <Text style={s.closeText}>Close</Text>
                </Press>
              </>
            )}
          </Press>
        </Press>
      </Modal>
      {/* Plan Viewer Modal */}
      <Modal visible={showPlan} transparent animationType="slide" onRequestClose={() => setShowPlan(false)}>
        <Press style={s.overlay} haptic="none" onPress={() => setShowPlan(false)}>
          <Press style={[s.sheet, { minHeight: 300, width: '100%' }]} haptic="none" onPress={() => {}}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, flex: 1 }}>🗓️ Aria's Date Plan</Text>
              <TouchableOpacity onPress={() => setShowPlan(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={colors.muted} />
              </TouchableOpacity>
            </View>
            {planLoading ? (
              <View style={{ paddingVertical: 40, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <ActivityIndicator color={colors.rose} size="large" />
                <Text style={{ color: colors.muted, fontSize: 14 }}>Aria is crafting your plan…</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                <Text style={{ fontSize: 14, color: colors.textSec, lineHeight: 22 }}>
                  {planText}
                </Text>
                <Press
                  style={[s.doItBtn, { backgroundColor: colors.rose, marginTop: space.lg }]}
                  haptic="medium"
                  onPress={() => {
                    if (selected) {
                      doThis(selected);
                    }
                    setShowPlan(false);
                  }}
                >
                  <Text style={s.doItText}>Accept & Add to bucket list 💕</Text>
                </Press>
              </ScrollView>
            )}
          </Press>
        </Press>
      </Modal>
    </SafeAreaView>
  );
}
