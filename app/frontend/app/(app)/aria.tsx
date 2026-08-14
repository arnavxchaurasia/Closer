import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Easing, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/src/api';
import { Press } from '@/src/components/Press';
import { useTheme } from '@/src/context/ThemeContext';
import { haptics } from '@/src/haptics';
import { Colors, radius, space } from '@/src/theme';

type Message = { role: 'user' | 'assistant'; content: string };

const ARIA_WELCOME: Message = {
  role: 'assistant',
  content: "Hi! I'm Aria, your personal relationship guide 💜 I know your relationship context and I'm here to help. What's on your mind?",
};

const SUGGESTED_PROMPTS = [
  "Why might my partner be upset?",
  "What should I do for our anniversary?",
  "How can I be more supportive today?",
  "Suggest a date idea for this weekend",
  "My partner seems distant — what do I do?",
  "How do I handle conflict better?",
];

const PURPLE_GRAD: [string, string, string] = ['#7C3AED', '#A855F7', '#C084FC'];

function makeStyles(c: Colors) {
  return StyleSheet.create({
    root:       { flex: 1, backgroundColor: c.bg },
    header:     { paddingHorizontal: space.lg, paddingBottom: space.md },
    backBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    backTxt:    { color: '#fff', fontSize: 18, fontWeight: '700' },
    titleTxt:   { fontSize: 26, fontWeight: '900', color: '#fff', letterSpacing: -0.6 },
    subTxt:     { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 3, fontWeight: '500' },

    msgList:    { flex: 1 },
    msgContent: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: 12 },

    // User bubble
    userRow:    { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12 },
    userBubble: { maxWidth: '78%', backgroundColor: c.rose, borderRadius: 20, borderBottomRightRadius: 4, paddingHorizontal: 16, paddingVertical: 11 },
    userTxt:    { color: '#fff', fontSize: 15, lineHeight: 22, fontWeight: '500' },

    // Aria bubble
    ariaRow:    { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 12, gap: 8 },
    ariaAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center' },
    ariaAvatarTxt: { fontSize: 14 },
    ariaBubble: { maxWidth: '78%', backgroundColor: c.surface, borderRadius: 20, borderBottomLeftRadius: 4, paddingHorizontal: 16, paddingVertical: 11, borderWidth: 1, borderColor: c.line },
    ariaTxt:    { color: c.text, fontSize: 15, lineHeight: 22 },

    // Typing indicator
    typingDot:  { width: 7, height: 7, borderRadius: 3.5, backgroundColor: c.muted, marginHorizontal: 2 },

    // Suggested prompts
    promptsWrap: { paddingHorizontal: space.lg, paddingBottom: 8, gap: 8 },
    promptsLbl:  { fontSize: 11, fontWeight: '800', color: c.muted, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 4 },
    promptsRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    promptChip:  { backgroundColor: c.surface, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#A855F7' + '55' },
    promptTxt:   { fontSize: 13, color: '#A855F7', fontWeight: '600' },

    // Input bar
    inputBar:   { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: space.md, paddingVertical: space.md, gap: 10, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.line },
    input:      { flex: 1, backgroundColor: c.surface2, borderRadius: radius.lg, paddingHorizontal: 16, paddingVertical: 10, color: c.text, fontSize: 15, maxHeight: 120, borderWidth: 1, borderColor: c.line },
    sendBtn:    { width: 42, height: 42, borderRadius: 21, backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center' },
    sendBtnDim: { backgroundColor: c.surface3 },
    sendTxt:    { color: '#fff', fontSize: 18, fontWeight: '700' },
  });
}

function TypingIndicator() {
  const dots = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];

  useEffect(() => {
    const anims = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.delay(450 - i * 150),
        ])
      )
    );
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
  }, []);

  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={[s.ariaRow, { alignItems: 'center' }]}>
      <View style={s.ariaAvatar}>
        <Text style={s.ariaAvatarTxt}>💜</Text>
      </View>
      <View style={[s.ariaBubble, { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 }]}>
        {dots.map((dot, i) => (
          <Animated.View key={i} style={[s.typingDot, { opacity: dot, transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }] }]} />
        ))}
      </View>
    </View>
  );
}

export default function AriaScreen() {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [messages, setMessages] = useState<Message[]>([ARIA_WELCOME]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, loading]);

  const send = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    haptics.light();
    setInput('');

    const userMsg: Message = { role: 'user', content: msg };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setLoading(true);

    // Last 10 messages for context (excluding the welcome message from history)
    const history = newMessages.slice(-10).map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await api.post<{ reply: string }>('/api/ai/aria', { message: msg, history });
      const reply = res.reply ?? '';

      // Check for API key error hint
      const friendlyReply = reply.toLowerCase().includes('groq') || reply.toLowerCase().includes('api key') || reply === ''
        ? "Aria needs a Groq API key to work — ask your developer! 🔧"
        : reply;

      setMessages(prev => [...prev, { role: 'assistant', content: friendlyReply }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: "Aria needs a Groq API key to work — ask your developer! 🔧" }]);
    } finally {
      setLoading(false);
    }
  }, [input, messages, loading]);

  const isEmpty = messages.length <= 1; // only welcome message

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      {/* Header gradient */}
      <LinearGradient colors={PURPLE_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.header}>
        <Press haptic="light" onPress={() => router.back()}>
          <View style={s.backBtn}>
            <Text style={s.backTxt}>←</Text>
          </View>
        </Press>
        <Text style={s.titleTxt}>Aria 💜</Text>
        <Text style={s.subTxt}>Your relationship guide</Text>
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        {/* Message list */}
        <ScrollView
          ref={scrollRef}
          style={s.msgList}
          contentContainerStyle={s.msgContent}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
        >
          {messages.map((m, i) => (
            m.role === 'user' ? (
              <View key={i} style={s.userRow}>
                <View style={s.userBubble}>
                  <Text style={s.userTxt}>{m.content}</Text>
                </View>
              </View>
            ) : (
              <View key={i} style={s.ariaRow}>
                <View style={s.ariaAvatar}>
                  <Text style={s.ariaAvatarTxt}>💜</Text>
                </View>
                <View style={s.ariaBubble}>
                  <Text style={s.ariaTxt}>{m.content}</Text>
                </View>
              </View>
            )
          ))}
          {loading && <TypingIndicator />}
        </ScrollView>

        {/* Suggested prompts (only when chat is near-empty) */}
        {isEmpty && !loading && (
          <View style={s.promptsWrap}>
            <Text style={s.promptsLbl}>Try asking</Text>
            <View style={s.promptsRow}>
              {SUGGESTED_PROMPTS.map((p) => (
                <Pressable key={p} style={s.promptChip} onPress={() => send(p)}>
                  <Text style={s.promptTxt}>{p}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Input bar */}
        <View style={s.inputBar}>
          <TextInput
            style={s.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask Aria anything…"
            placeholderTextColor={colors.muted}
            multiline
            returnKeyType="send"
            onSubmitEditing={() => send()}
            blurOnSubmit={false}
          />
          <Pressable style={[s.sendBtn, (!input.trim() || loading) && s.sendBtnDim]} onPress={() => send()} disabled={!input.trim() || loading}>
            <Text style={s.sendTxt}>↑</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
