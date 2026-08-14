import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/src/api';
import { useTheme } from '@/src/context/ThemeContext';
import { haptics } from '@/src/haptics';
import { Colors, radius, space } from '@/src/theme';

// ─── Question Bank ────────────────────────────────────────────────────────────

type Category = 'deep' | 'fun' | 'spicy' | 'relationship' | 'dreams' | 'memories' | 'wyr' | 'truth_dare';

const QUESTIONS: Record<Category, string[]> = {
  deep: [
    "What's your biggest fear you've never told anyone?",
    "What moment in your life changed you the most?",
    "What do you want to be remembered for?",
    "If you could relive one day of your life, which would it be?",
    "What's something you believe that most people disagree with?",
    "What would you do differently if you knew no one would judge you?",
    "What's the most important lesson you've learned from a past relationship?",
    "What are you most grateful for that you rarely talk about?",
    "What does home mean to you?",
    "What's the part of yourself you're still working to accept?",
    "If you could change one thing about how you were raised, what would it be?",
    "What do you think is your greatest strength that I might not know about?",
    "What's a belief you held for years that you eventually changed your mind about?",
    "What does unconditional love look like to you?",
    "What's your relationship with failure?",
    "What do you think happens after we die?",
    "What's the kindest thing a stranger has ever done for you?",
    "What does success mean to you — honestly, not what you think it should mean?",
    "What would you tell your 16-year-old self?",
    "When do you feel most like yourself?",
    "What's something you've never forgiven yourself for?",
    "What's the best decision you've ever made?",
    "What's the difference between being lonely and being alone?",
    "What scares you more: being forgotten or being remembered wrongly?",
    "What's a dream you've given up on that you still think about?",
  ],
  fun: [
    "If you could only eat one cuisine for the rest of your life, what would it be?",
    "What's your most embarrassing moment?",
    "If your life were a movie genre, what would it be?",
    "What's the weirdest thing you find attractive in a person?",
    "What's a skill you wish you had but absolutely don't?",
    "What's the worst haircut you've ever had?",
    "If you had to survive a zombie apocalypse with one celebrity, who?",
    "What's the most useless talent you have?",
    "If animals could talk, which would be the rudest?",
    "What's your go-to karaoke song?",
    "What childhood cartoon would be terrifying if it were realistic?",
    "If you could live in any TV show world, which would it be?",
    "What's the strangest food combination you secretly enjoy?",
    "If you could swap lives with anyone for a day, who?",
    "What's something you're irrationally afraid of?",
    "What's your most controversial food opinion?",
    "If you could only use one app for a year, which?",
    "What's the funniest thing you've ever said by accident?",
    "What would your villain origin story be?",
    "If your pet could talk, what's the first thing they'd say about you?",
    "What's a skill that sounds useful but is actually useless?",
    "If you could be fluent in any language overnight, which?",
    "What's the most dramatic thing you've done over something small?",
    "What would your warning label say?",
    "What's your most irrational rule you hold yourself to?",
  ],
  spicy: [
    "What's something you've always wanted to say to me but haven't?",
    "What's one thing about me that drives you crazy — in both ways?",
    "What's your most controversial opinion about relationships?",
    "What's a deal-breaker you've never actually tested?",
    "What's something you judged someone for that you now understand?",
    "What's the biggest lie you told in a past relationship?",
    "What's something you'd never do for love, no matter what?",
    "When did you first realize you were falling for me?",
    "What's something I do that you pretend not to notice?",
    "What's the most jealous you've ever felt?",
    "What's something you find yourself comparing in our relationship?",
    "What's the most passive-aggressive thing you've ever done?",
    "Have you ever regretted telling me something?",
    "What's something you think I believe about you that isn't true?",
    "What's the hardest thing about being with someone long distance?",
    "What's something you've wanted to change about our relationship but never brought up?",
    "What would you do if you found out I kept a big secret from you?",
    "What's the smallest thing I do that means the most to you?",
    "What's something you need from me that I don't give you enough of?",
    "What's your honest opinion of how we handle conflict?",
  ],
  relationship: [
    "What's your love language and how has it changed?",
    "What's the first thing you noticed about me?",
    "What's a tradition you want us to have?",
    "How do you know when you feel loved?",
    "What's one thing you wish we talked about more?",
    "What's your favorite memory of us so far?",
    "What's something you admire about how I handle hard times?",
    "How do you picture our life in 5 years?",
    "What's something you wish you could do for me but can't right now?",
    "What song makes you think of us?",
    "What's something I do that makes you proud of me?",
    "What's the hardest part of trusting someone fully?",
    "What does a perfect day together look like to you?",
    "What's something you want to learn together?",
    "How do you show love when words feel insufficient?",
    "What's something you want us to experience for the first time together?",
    "How has loving me changed you?",
    "What's the question you're most afraid to ask me?",
    "What's one thing you'd want to be different about how we started?",
    "What's a goal you have for us as a couple?",
    "What do you think is our biggest strength together?",
    "What do you want our relationship to feel like in 10 years?",
  ],
  dreams: [
    "Where do you most want to travel together?",
    "What's your dream home like?",
    "What would your ideal morning routine together look like?",
    "If you could change careers tomorrow with guaranteed success, what would you do?",
    "What's a bucket list item you haven't told many people about?",
    "What does your dream life look like in specific detail?",
    "What's something you want to build or create before you die?",
    "If money weren't a factor, where would you live?",
    "What experience do you most want to give your future children (if any)?",
    "What's one thing you hope we're still doing together at 80?",
    "What's a skill you want to master in the next 5 years?",
    "What does retirement look like to you?",
    "What's a cause you wish you could dedicate your life to?",
    "If you wrote a book, what would it be about?",
    "What's something you want to learn that seems impossible right now?",
    "What's the most meaningful way you'd use $1 million?",
    "What kind of old person do you want to be?",
    "What's a small daily ritual you want us to have?",
    "What's something you want to be brave enough to try?",
    "If you could live in any era of history, which and why?",
  ],
  memories: [
    "What's your earliest memory?",
    "What's the happiest you remember feeling as a child?",
    "What's a family tradition you want to carry forward?",
    "Who was your first best friend and what happened to them?",
    "What's a place from your childhood you wish I could see?",
    "What's the most scared you've ever been?",
    "What's something from your past you're genuinely proud of?",
    "What's a meal that instantly takes you back to childhood?",
    "What's a song that was the soundtrack to a specific period of your life?",
    "What's a childhood dream that you completely forgot about?",
    "What's the best gift you've ever received?",
    "What's a teacher who impacted your life and how?",
    "What's the most adventurous thing you did before we met?",
    "What's something you miss about a previous version of yourself?",
    "What's the moment you realized you were officially an adult?",
    "What's the most important thing your parents taught you?",
    "What's a piece of advice you got that turned out to be wrong?",
    "What's your favorite photo from your life and what's happening in it?",
    "What's something you did as a teenager that you'd never do now?",
    "Who in your life do you miss the most?",
  ],
  wyr: [
    "Would you rather always be 10 minutes late or always be 20 minutes early?",
    "Would you rather have no phone for a month or no laptop for a month?",
    "Would you rather live in a big city or a small town?",
    "Would you rather travel back in time or forward in time?",
    "Would you rather have unlimited money or unlimited time?",
    "Would you rather be able to fly or be invisible?",
    "Would you rather only eat sweet food or only eat savory food forever?",
    "Would you rather lose all your memories or never be able to make new ones?",
    "Would you rather be famous but hated or unknown but loved?",
    "Would you rather always speak your mind or never speak at all?",
    "Would you rather live without music or without movies?",
    "Would you rather have a rewind button or a pause button for your life?",
    "Would you rather always be too hot or always be too cold?",
    "Would you rather be able to read minds or predict the future?",
    "Would you rather move to a new city every year or never leave your hometown?",
    "Would you rather have a photographic memory or be brilliant at math?",
    "Would you rather explore the ocean or explore space?",
    "Would you rather give up social media or give up watching TV shows?",
    "Would you rather have a talking pet or speak every language?",
    "Would you rather always win arguments or always find money on the ground?",
    "Would you rather go on a 2-week trip with no phones or spend a weekend completely offline?",
    "Would you rather know exactly when you'll die or not know at all?",
    "Would you rather have the ability to heal others or heal yourself?",
    "Would you rather be the funniest person in the room or the smartest?",
    "Would you rather live in a treehouse or a houseboat?",
  ],
  truth_dare: [
    // Truths
    "What's the most embarrassing thing you've done for love?",
    "What's a lie you told that you still feel guilty about?",
    "What's your biggest insecurity right now?",
    "What's something you've never told me but want to?",
    "When did you first realize you had feelings for me?",
    "What's the most childish thing you still do?",
    "What's something you've done that you'd never admit in public?",
    "What's your biggest fear about our relationship?",
    "Who was your first crush and what happened?",
    "What's a habit of mine that drives you quietly crazy?",
    "What's something you genuinely envy about me?",
    "What's the most irrational argument you've ever started?",
    // Dares
    "Send a voice note telling me something you're grateful for today.",
    "Write me a 3-sentence love poem right now and send it.",
    "Describe our relationship using only food references.",
    "Send the most unflattering selfie you can make.",
    "Tell me three things you find physically attractive about me.",
    "Sing the first line of our 'song' (or pick one if we don't have one).",
    "Write what our wedding vows would sound like in 10 words or less.",
    "Describe a dream date using only emoji and send it.",
    "Recreate the face you made when you first saw me.",
    "Say something in the most dramatic movie-trailer voice possible.",
    "List 5 nicknames you'd give me that I'd actually like.",
    "Describe our relationship to an alien who has never heard of love.",
  ],
};

// ─── Category Meta ─────────────────────────────────────────────────────────────

type CategoryMeta = {
  emoji: string;
  label: string;
  gradientStart: string;
  gradientEnd: string;
};

const CATEGORY_META: Record<Category, CategoryMeta> = {
  deep:         { emoji: '🌊', label: 'Deep',            gradientStart: '#4F46E5', gradientEnd: '#7C3AED' },
  fun:          { emoji: '😄', label: 'Fun',              gradientStart: '#D97706', gradientEnd: '#F59E0B' },
  spicy:        { emoji: '🌶️', label: 'Spicy',            gradientStart: '#E11D48', gradientEnd: '#F43F5E' },
  relationship: { emoji: '💕', label: 'Relationship',     gradientStart: '#DB2777', gradientEnd: '#EC4899' },
  dreams:       { emoji: '🌟', label: 'Dreams',           gradientStart: '#7C3AED', gradientEnd: '#A855F7' },
  memories:     { emoji: '📸', label: 'Memories',         gradientStart: '#0D9488', gradientEnd: '#14B8A6' },
  wyr:          { emoji: '🤔', label: 'Would You Rather', gradientStart: '#0369A1', gradientEnd: '#0EA5E9' },
  truth_dare:   { emoji: '🎲', label: 'Truth or Dare',    gradientStart: '#7C3AED', gradientEnd: '#C026D3' },
};

const CATEGORIES = Object.keys(CATEGORY_META) as Category[];

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'lobby' | 'cards' | 'done';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = SCREEN_W - space.lg * 2;
const SWIPE_THRESHOLD = 80;

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: Colors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },

    // Lobby
    lobbyHeader: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm,
    },
    lobbyBack: { width: 40, height: 40, justifyContent: 'center' },
    lobbyTitle: { flex: 1, fontSize: 22, fontWeight: '800', color: c.text, textAlign: 'center' },
    lobbyScore: { fontSize: 13, color: c.textSec, fontWeight: '600' },
    gridWrap: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: space.md, gap: space.sm, paddingTop: space.sm },
    catCard: {
      width: (SCREEN_W - space.md * 2 - space.sm) / 2,
      borderRadius: radius.xl,
      padding: space.md,
      paddingBottom: space.lg,
      overflow: 'hidden',
    },
    catEmoji: { fontSize: 36, marginBottom: space.sm },
    catName: { fontSize: 16, fontWeight: '700', color: '#fff' },
    catCount: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },

    // Cards screen
    cardHeader: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: space.lg, paddingVertical: space.md,
    },
    cardBack: { width: 40, height: 40, justifyContent: 'center' },
    cardProgress: { flex: 1, alignItems: 'center' },
    cardProgressText: { fontSize: 13, color: c.textSec, fontWeight: '600' },
    cardScore: { fontSize: 14, color: c.text, fontWeight: '700' },

    cardArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    // Card
    card: {
      width: CARD_W,
      minHeight: 380,
      borderRadius: radius.xl,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      padding: space.xl,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'absolute',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.15,
      shadowRadius: 20,
      elevation: 8,
    },
    cardEmoji: { fontSize: 56, marginBottom: space.lg },
    cardCategory: {
      fontSize: 11, fontWeight: '700', letterSpacing: 1.4,
      textTransform: 'uppercase', marginBottom: space.md,
    },
    cardQuestion: {
      fontSize: 22, fontWeight: '700', color: c.text,
      lineHeight: 32, textAlign: 'center',
    },

    // Hint labels
    hintRow: {
      flexDirection: 'row', justifyContent: 'space-between',
      paddingHorizontal: space.xl, marginTop: space.md,
    },
    hintSkip: { fontSize: 13, color: c.muted, fontWeight: '600' },
    hintAnswer: { fontSize: 13, color: c.muted, fontWeight: '600' },

    // Bottom buttons
    btnRow: {
      flexDirection: 'row', gap: space.md,
      paddingHorizontal: space.lg, paddingBottom: space.lg, paddingTop: space.md,
    },
    skipBtn: {
      flex: 1, height: 52, borderRadius: radius.lg,
      backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center',
      flexDirection: 'row', gap: 6,
    },
    skipBtnText: { fontSize: 15, fontWeight: '600', color: c.textSec },
    answerBtn: {
      flex: 1, height: 52, borderRadius: radius.lg,
      backgroundColor: c.rose, alignItems: 'center', justifyContent: 'center',
      flexDirection: 'row', gap: 6,
    },
    answerBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

    // Modal
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: 28, borderTopRightRadius: 28,
      padding: space.lg, paddingBottom: 40,
    },
    sheetHandle: {
      width: 40, height: 4, borderRadius: 2,
      backgroundColor: c.line, alignSelf: 'center', marginBottom: space.lg,
    },
    sheetQ: {
      fontSize: 13, color: c.textSec, fontStyle: 'italic',
      lineHeight: 20, marginBottom: space.md, textAlign: 'center',
    },
    sheetInput: {
      backgroundColor: c.surface2, borderRadius: radius.lg,
      borderWidth: 1, borderColor: c.line,
      padding: space.md, color: c.text, fontSize: 16,
      minHeight: 120, textAlignVertical: 'top',
      marginBottom: space.md,
    },
    sheetShare: {
      height: 52, backgroundColor: c.rose, borderRadius: radius.lg,
      alignItems: 'center', justifyContent: 'center', marginBottom: space.sm,
    },
    sheetShareText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    sheetPrivate: {
      height: 48, backgroundColor: c.surface2, borderRadius: radius.lg,
      alignItems: 'center', justifyContent: 'center',
    },
    sheetPrivateText: { color: c.textSec, fontSize: 15, fontWeight: '600' },

    // Done screen
    doneWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
    doneBig: { fontSize: 80, marginBottom: space.lg },
    doneTitle: { fontSize: 28, fontWeight: '800', color: c.text, textAlign: 'center', marginBottom: space.sm },
    doneSub: { fontSize: 16, color: c.textSec, textAlign: 'center', lineHeight: 24, marginBottom: space.xl },
    doneBtn: {
      height: 52, borderRadius: radius.lg, backgroundColor: c.rose,
      paddingHorizontal: space.xl, alignItems: 'center', justifyContent: 'center',
      marginBottom: space.md,
    },
    doneBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    doneSecBtn: {
      height: 52, borderRadius: radius.lg, backgroundColor: c.surface2,
      paddingHorizontal: space.xl, alignItems: 'center', justifyContent: 'center',
    },
    doneSecBtnText: { color: c.textSec, fontSize: 16, fontWeight: '600' },
  });
}

// ─── Swipe Card Component ─────────────────────────────────────────────────────

type SwipeCardProps = {
  question: string;
  category: Category;
  isTop: boolean;
  stackOffset: number; // 0=top, 1=second, 2=third
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  colors: Colors;
  styles: ReturnType<typeof makeStyles>;
};

function SwipeCard({ question, category, isTop, stackOffset, onSwipeLeft, onSwipeRight, colors, styles }: SwipeCardProps) {
  const pan = useRef(new Animated.ValueXY()).current;
  const entryScale = useRef(new Animated.Value(stackOffset === 0 ? 1 : 1 - stackOffset * 0.04)).current;
  const entryTranslateY = useRef(new Animated.Value(stackOffset * 14)).current;

  const meta = CATEGORY_META[category];

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => isTop,
      onMoveShouldSetPanResponder: (_, g) => isTop && Math.abs(g.dx) > 5,
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_, g) => {
        if (g.dx > SWIPE_THRESHOLD) {
          Animated.spring(pan, { toValue: { x: SCREEN_W * 1.5, y: g.dy }, useNativeDriver: true }).start(() => onSwipeRight());
        } else if (g.dx < -SWIPE_THRESHOLD) {
          Animated.spring(pan, { toValue: { x: -SCREEN_W * 1.5, y: g.dy }, useNativeDriver: true }).start(() => onSwipeLeft());
        } else {
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  const rotate = pan.x.interpolate({ inputRange: [-200, 200], outputRange: ['-15deg', '15deg'] });
  const likeOpacity = pan.x.interpolate({ inputRange: [0, 60], outputRange: [0, 1] });
  const nopeOpacity = pan.x.interpolate({ inputRange: [-60, 0], outputRange: [1, 0] });

  const cardStyle = isTop
    ? {
        transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }],
      }
    : {
        transform: [{ scale: entryScale }, { translateY: entryTranslateY }],
      };

  return (
    <Animated.View
      style={[styles.card, cardStyle, { zIndex: 10 - stackOffset }]}
      {...(isTop ? panResponder.panHandlers : {})}
    >
      {/* Swipe overlays */}
      {isTop && (
        <>
          <Animated.View style={{
            position: 'absolute', top: 24, right: 24,
            opacity: likeOpacity,
            backgroundColor: '#16A34A', borderRadius: radius.md,
            paddingHorizontal: 12, paddingVertical: 6,
          }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>ANSWERED ✓</Text>
          </Animated.View>
          <Animated.View style={{
            position: 'absolute', top: 24, left: 24,
            opacity: nopeOpacity,
            backgroundColor: '#6B7280', borderRadius: radius.md,
            paddingHorizontal: 12, paddingVertical: 6,
          }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>SKIP →</Text>
          </Animated.View>
        </>
      )}

      <Text style={styles.cardEmoji}>{meta.emoji}</Text>
      <Text style={[styles.cardCategory, { color: meta.gradientStart }]}>{meta.label}</Text>
      <Text style={styles.cardQuestion}>{question}</Text>
    </Animated.View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CoupleQuizScreen() {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [phase, setPhase] = useState<Phase>('lobby');
  const [activeCategory, setActiveCategory] = useState<Category>('deep');
  const [deck, setDeck] = useState<string[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [skipped, setSkipped] = useState(0);

  // Answer modal
  const [modalVisible, setModalVisible] = useState(false);
  const [answerText, setAnswerText] = useState('');
  const [sharing, setSharing] = useState(false);

  // Comparisons view
  const [showComparisons, setShowComparisons] = useState(false);
  const [comparisons, setComparisons] = useState<{ question: string; category: Category; my_answer: string; partner_answer: string; created_at?: string }[]>([]);
  const [compLoading, setCompLoading] = useState(false);
  const [lobbyTab, setLobbyTab] = useState<'categories' | 'compare'>('categories');

  const loadComparisons = async () => {
    setCompLoading(true);
    try {
      const data = await api.get<any[]>('/api/quiz/compare');
      setComparisons(data);
    } catch {
      setComparisons([]);
    } finally {
      setCompLoading(false);
    }
  };

  // Key trick: change key to remount SwipeCard and reset its animations
  const [cardKey, setCardKey] = useState(0);

  const startCategory = useCallback((cat: Category) => {
    haptics.medium();
    const qs = [...QUESTIONS[cat]].sort(() => Math.random() - 0.5);
    setActiveCategory(cat);
    setDeck(qs);
    setCurrentIdx(0);
    setAnswered(0);
    setSkipped(0);
    setCardKey(k => k + 1);
    setPhase('cards');
  }, []);

  const advance = useCallback(() => {
    setCurrentIdx(i => {
      const next = i + 1;
      if (next >= deck.length) {
        setPhase('done');
      }
      return next;
    });
    setCardKey(k => k + 1);
  }, [deck.length]);

  const handleSkip = useCallback(() => {
    haptics.light();
    setSkipped(s => s + 1);
    advance();
  }, [advance]);

  const handleAnswerSubmit = useCallback(async (shareWithPartner: boolean) => {
    haptics.medium();
    setAnswered(a => a + 1);
    if (shareWithPartner && answerText.trim()) {
      setSharing(true);
      try {
        await api.post('/api/quiz/save', {
          question: deck[currentIdx],
          category: activeCategory,
          answer: answerText.trim(),
        });
      } catch {
        // silent fail — offline or no couple yet
      } finally {
        setSharing(false);
      }
    }
    setModalVisible(false);
    setAnswerText('');
    advance();
  }, [answerText, deck, currentIdx, activeCategory, advance]);

  const openAnswerModal = useCallback(() => {
    haptics.light();
    setAnswerText('');
    setModalVisible(true);
  }, []);

  // ── Lobby ──────────────────────────────────────────────────────────────────

  if (phase === 'lobby') {
    return (
      <SafeAreaView style={s.root} edges={['top', 'bottom']}>
        <View style={s.lobbyHeader}>
          <Pressable style={s.lobbyBack} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </Pressable>
          <Text style={s.lobbyTitle}>Question Game</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Lobby Tab selector */}
        <View style={{ flexDirection: 'row', marginHorizontal: space.lg, marginBottom: space.md, backgroundColor: colors.surface2, borderRadius: radius.lg, padding: 3, borderWidth: 1, borderColor: colors.line }}>
          <Pressable
            style={{ flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.md, backgroundColor: lobbyTab === 'categories' ? colors.surface : 'transparent' }}
            onPress={() => { haptics.light(); setLobbyTab('categories'); }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: lobbyTab === 'categories' ? colors.rose : colors.muted }}>Categories 🎮</Text>
          </Pressable>
          <Pressable
            style={{ flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.md, backgroundColor: lobbyTab === 'compare' ? colors.surface : 'transparent' }}
            onPress={() => { haptics.light(); setLobbyTab('compare'); loadComparisons(); }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: lobbyTab === 'compare' ? colors.rose : colors.muted }}>Compare Answers 💌</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
          {lobbyTab === 'categories' && (
            <>
              <Text style={{ fontSize: 14, color: colors.textSec, textAlign: 'center', marginBottom: space.lg, paddingHorizontal: space.lg }}>
                Pick a category, swipe through questions, and open up to each other 💬
              </Text>

              <View style={s.gridWrap}>
                {CATEGORIES.map(cat => {
                  const meta = CATEGORY_META[cat];
                  const count = QUESTIONS[cat].length;
                  return (
                    <Pressable
                      key={cat}
                      style={[s.catCard, { backgroundColor: meta.gradientStart }]}
                      onPress={() => startCategory(cat)}
                    >
                      <Text style={s.catEmoji}>{meta.emoji}</Text>
                      <Text style={s.catName}>{meta.label}</Text>
                      <Text style={s.catCount}>{count} questions</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {lobbyTab === 'compare' && (
            <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
              {compLoading ? (
                <View style={{ paddingVertical: 60, alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator color={colors.rose} size="large" />
                  <Text style={{ color: colors.muted, marginTop: 10 }}>Loading comparisons…</Text>
                </View>
              ) : comparisons.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 60, gap: 12 }}>
                  <Text style={{ fontSize: 64 }}>🎲</Text>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>No compared answers yet</Text>
                  <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 20 }}>
                    When both you and your partner answer the exact same question in a game category, it will show up here.
                  </Text>
                </View>
              ) : (
                comparisons.map((item, idx) => {
                  return (
                    <View key={idx} style={{ backgroundColor: colors.surface, borderRadius: radius.xl, padding: space.md, borderWidth: 1, borderColor: colors.line }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: CATEGORY_META[item.category]?.gradientStart || colors.rose, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                        {CATEGORY_META[item.category]?.label || 'Category'}
                      </Text>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: space.md }}>
                        "{item.question}"
                      </Text>

                      <View style={{ flexDirection: 'row', gap: space.sm }}>
                        {/* My Answer */}
                        <View style={{ flex: 1, backgroundColor: colors.roseDim, borderRadius: radius.lg, padding: 10, borderWidth: 1, borderColor: colors.rose + '22' }}>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: colors.rose, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>You</Text>
                          <Text style={{ fontSize: 13, color: colors.text, fontWeight: '500' }}>{item.my_answer}</Text>
                        </View>

                        {/* Partner Answer */}
                        <View style={{ flex: 1, backgroundColor: colors.goldDim || 'rgba(217,119,6,0.12)', borderRadius: radius.lg, padding: 10, borderWidth: 1, borderColor: (colors.gold ?? '#D97706') + '22' }}>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: colors.gold ?? '#D97706', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Partner</Text>
                          <Text style={{ fontSize: 13, color: colors.text, fontWeight: '500' }}>{item.partner_answer}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Done ───────────────────────────────────────────────────────────────────

  if (phase === 'done') {
    const meta = CATEGORY_META[activeCategory];
    const total = answered + skipped;
    return (
      <SafeAreaView style={s.root} edges={['top', 'bottom']}>
        <View style={s.doneWrap}>
          <Text style={s.doneBig}>🎉</Text>
          <Text style={s.doneTitle}>You answered {answered} question{answered !== 1 ? 's' : ''}!</Text>
          <Text style={s.doneSub}>
            {meta.emoji} {meta.label} · {total} card{total !== 1 ? 's' : ''} played
            {skipped > 0 ? ` · ${skipped} skipped` : ''}
          </Text>
          <Pressable 
            style={[s.doneBtn, { backgroundColor: colors.rose, marginTop: space.sm }]} 
            onPress={() => { haptics.medium(); loadComparisons(); setShowComparisons(true); }}
          >
            <Text style={s.doneBtnText}>See how your answers compare 💌</Text>
          </Pressable>
          <Pressable style={s.doneSecBtn} onPress={() => setPhase('lobby')}>
            <Text style={s.doneSecBtnText}>Pick Another Category</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── Cards ──────────────────────────────────────────────────────────────────

  const remaining = deck.slice(currentIdx);
  const visibleCards = remaining.slice(0, 3);
  const currentQuestion = deck[currentIdx] ?? '';
  const progressFraction = deck.length > 0 ? currentIdx / deck.length : 0;

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.cardHeader}>
        <Pressable style={s.cardBack} onPress={() => setPhase('lobby')}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <View style={s.cardProgress}>
          <Text style={s.cardProgressText}>
            {currentIdx + 1} / {deck.length}
          </Text>
        </View>
        <Text style={s.cardScore}>✅ {answered}</Text>
      </View>

      {/* Progress bar */}
      <View style={{ height: 3, backgroundColor: colors.surface2, marginHorizontal: space.lg, borderRadius: radius.full, marginBottom: space.sm, overflow: 'hidden' }}>
        <View style={{ height: 3, backgroundColor: CATEGORY_META[activeCategory].gradientStart, borderRadius: radius.full, width: `${progressFraction * 100}%` }} />
      </View>

      {/* Card stack */}
      <View style={s.cardArea}>
        {visibleCards.length > 0 ? (
          [...visibleCards].reverse().map((q, revIdx) => {
            const stackOffset = visibleCards.length - 1 - revIdx;
            const isTop = stackOffset === 0;
            return (
              <SwipeCard
                key={`${cardKey}-${currentIdx + stackOffset}`}
                question={q}
                category={activeCategory}
                isTop={isTop}
                stackOffset={stackOffset}
                onSwipeLeft={handleSkip}
                onSwipeRight={openAnswerModal}
                colors={colors}
                styles={s}
              />
            );
          })
        ) : null}
      </View>

      {/* Swipe hints */}
      <View style={s.hintRow}>
        <Text style={s.hintSkip}>← Skip</Text>
        <Text style={s.hintAnswer}>Answer →</Text>
      </View>

      {/* Buttons */}
      <View style={s.btnRow}>
        <Pressable style={s.skipBtn} onPress={handleSkip}>
          <Ionicons name="play-skip-forward" size={18} color={colors.textSec} />
          <Text style={s.skipBtnText}>Skip</Text>
        </Pressable>
        <Pressable style={s.answerBtn} onPress={openAnswerModal}>
          <Ionicons name="chatbubble-ellipses" size={18} color="#fff" />
          <Text style={s.answerBtnText}>Answer</Text>
        </Pressable>
      </View>

      {/* Answer Modal */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.overlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setModalVisible(false)} />
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetQ}>"{currentQuestion}"</Text>
            <TextInput
              style={s.sheetInput}
              value={answerText}
              onChangeText={setAnswerText}
              placeholder="Your answer..."
              placeholderTextColor={colors.muted}
              multiline
              autoFocus
            />
            <Pressable
              style={[s.sheetShare, (sharing || !answerText.trim()) && { opacity: 0.5 }]}
              onPress={() => handleAnswerSubmit(true)}
              disabled={sharing || !answerText.trim()}
            >
              <Text style={s.sheetShareText}>
                {sharing ? 'Sharing...' : '💌 Share with partner'}
              </Text>
            </Pressable>
            <Pressable style={s.sheetPrivate} onPress={() => handleAnswerSubmit(false)}>
              <Text style={s.sheetPrivateText}>Just for me</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Comparisons Modal */}
      <Modal visible={showComparisons} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowComparisons(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, flex: 1 }}>Reveal Comparisons 💌</Text>
            <Pressable onPress={() => setShowComparisons(false)} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.muted} />
            </Pressable>
          </View>

          {compLoading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={colors.rose} size="large" />
              <Text style={{ color: colors.muted, marginTop: 10 }}>Loading comparisons…</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }} showsVerticalScrollIndicator={false}>
              <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center', marginBottom: space.sm }}>
                Here are the questions you both answered. See how well you match!
              </Text>

              {comparisons.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 80, gap: 12 }}>
                  <Text style={{ fontSize: 64 }}>🎲</Text>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>No compared answers yet</Text>
                  <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 20 }}>
                    When both you and your partner answer the exact same question in a game category, it will show up here.
                  </Text>
                </View>
              ) : (
                comparisons.map((item, idx) => {
                  const isMatch = item.my_answer.trim().toLowerCase() === item.partner_answer.trim().toLowerCase();
                  return (
                    <View key={idx} style={{ backgroundColor: colors.surface, borderRadius: radius.xl, padding: space.md, borderWidth: 1, borderColor: colors.line }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: CATEGORY_META[item.category]?.gradientStart || colors.rose, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                        {CATEGORY_META[item.category]?.label || 'Category'}
                      </Text>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: space.md }}>
                        "{item.question}"
                      </Text>

                      <View style={{ flexDirection: 'row', gap: space.sm }}>
                        {/* My Answer */}
                        <View style={{ flex: 1, backgroundColor: colors.roseDim, borderRadius: radius.lg, padding: 10, borderWidth: 1, borderColor: colors.rose + '22' }}>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: colors.rose, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>You</Text>
                          <Text style={{ fontSize: 13, color: colors.text, fontWeight: '500' }}>{item.my_answer}</Text>
                        </View>

                        {/* Partner Answer */}
                        <View style={{ flex: 1, backgroundColor: colors.goldDim ?? 'rgba(217,119,6,0.12)', borderRadius: radius.lg, padding: 10, borderWidth: 1, borderColor: (colors.gold ?? '#D97706') + '22' }}>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: colors.gold ?? '#D97706', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Partner</Text>
                          <Text style={{ fontSize: 13, color: colors.text, fontWeight: '500' }}>{item.partner_answer}</Text>
                        </View>
                      </View>

                      {isMatch && (
                        <View style={{ alignSelf: 'center', backgroundColor: colors.green + '22', borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4, marginTop: space.sm, borderWidth: 1, borderColor: colors.green + '44' }}>
                          <Text style={{ fontSize: 11, fontWeight: '800', color: colors.green }}>✨ PERFECT MATCH ✨</Text>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
