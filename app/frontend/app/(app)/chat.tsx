/**
 * Unified communication screen — text, photos, voice notes, video call.
 * Polls /api/messages every 3 s. Voice recorded via expo-av.
 */
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, AppState, Easing, FlatList, Image, KeyboardAvoidingView,
  Modal, PanResponder, Platform, Pressable, ScrollView, Share, StyleSheet, Text,
  TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

import { api } from '@/src/api';
import { NotConnected } from '@/src/components/NotConnected';
import { PhotoEditor } from '@/src/components/PhotoEditor';
import { useAuth } from '@/src/context/AuthContext';
import { useCouple } from '@/src/context/CoupleContext';
import { useTheme } from '@/src/context/ThemeContext';
import { haptics } from '@/src/haptics';
import { useNicknames } from '@/src/hooks/useNicknames';
import { radius, space } from '@/src/theme';
import { DateField, TimeField } from '@/src/components/DateTimeField';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  user_id: string;
  sender_name: string;
  content: string;
  msg_type: 'text' | 'image' | 'audio' | 'sticker' | 'gif';
  media_url?: string;
  duration_s?: number;
  created_at: string;
  pinned?: boolean;
  reactions?: Array<{ emoji: string; user_id: string }>;
  read_at?: string;
  reply_to?: { id: string; content: string; sender_name: string };
}

interface ScheduledMessage {
  id: string;
  content: string;
  send_at: string;
  msg_type: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STICKERS = [
  '❤️','😍','🥰','😘','😅','😂','🥲','😢','😭','🙄',
  '😴','🤗','🤭','😎','🤩','🥳','😇','🫶','👍','👏',
  '🙏','💪','🎉','🔥','✨','🌟','💯','💕','💞','💓',
  '🌹','🌸','🍀','☕','🍕','🎁','💌','🐻','🐶','🐱',
];

const GIPHY_KEY = process.env.EXPO_PUBLIC_GIPHY_KEY ?? '';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
function relTime(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
function fmtDay(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtDur(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function fmtTimestamp(iso: string) {
  const date = new Date(iso);
  const diff = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (diff === 0) return `Today ${timeStr}`;
  if (diff === 1) return `Yesterday ${timeStr}`;
  return `${date.toLocaleDateString('en-US', { weekday: 'short' })} ${timeStr}`;
}

// ─── Intent detection ─────────────────────────────────────────────────────────

function detectIntent(text: string): 'schedule' | 'task' | null {
  const lower = text.toLowerCase();
  const scheduleWords = ["call me at", "let's meet", "on saturday", "on sunday", "tomorrow at", "next week", "can we", "free on", "available on", "video call at", "voice call at"];
  const taskWords = ["can you", "please do", "don't forget to", "remember to", "make sure to", "pick up", "buy some"];
  if (scheduleWords.some(w => lower.includes(w))) return 'schedule';
  if (taskWords.some(w => lower.includes(w))) return 'task';
  return null;
}

// ─── Audio player bubble ──────────────────────────────────────────────────────

function AudioBubble({ uri, dur, isMe }: { uri: string; dur: number; isMe: boolean }) {
  const { colors } = useTheme();
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const total = dur || 1;

  const toggle = async () => {
    if (!sound) {
      const { sound: s } = await Audio.Sound.createAsync({ uri }, {}, (status) => {
        if (!status.isLoaded) return;
        setPos(Math.floor((status.positionMillis ?? 0) / 1000));
        if (status.didJustFinish) { setPlaying(false); setPos(0); }
      });
      await s.playAsync();
      setSound(s); setPlaying(true);
    } else if (playing) {
      await sound.pauseAsync(); setPlaying(false);
    } else {
      await sound.playAsync(); setPlaying(true);
    }
  };

  useEffect(() => () => { sound?.unloadAsync(); }, [sound]);

  const bg = isMe ? 'rgba(255,255,255,0.25)' : colors.surface2;
  const fg = isMe ? '#fff' : colors.text;

  return (
    <Pressable onPress={toggle} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={playing ? 'pause' : 'play'} size={16} color={fg} />
      </View>
      {/* Waveform bars (decorative) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, flex: 1 }}>
        {Array.from({ length: 20 }).map((_, i) => {
          const h = 6 + Math.sin(i * 1.3) * 6 + Math.cos(i * 0.7) * 4;
          const filled = (pos / total) > (i / 20);
          return <View key={i} style={{ width: 2.5, height: Math.abs(h), borderRadius: 2, backgroundColor: filled ? (isMe ? '#fff' : colors.rose) : (isMe ? 'rgba(255,255,255,0.4)' : colors.muted) }} />;
        })}
      </View>
      <Text style={{ fontSize: 11, color: isMe ? 'rgba(255,255,255,0.8)' : colors.muted, fontWeight: '600', minWidth: 30 }}>
        {fmtDur(playing ? pos : dur)}
      </Text>
    </Pressable>
  );
}

// ─── Image preview in bubble ──────────────────────────────────────────────────

function ImageBubble({ uri, onPress }: { uri: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ borderRadius: 14, overflow: 'hidden', marginBottom: 4 }}>
      <Image source={{ uri }} style={{ width: 200, height: 240 }} resizeMode="cover" />
    </Pressable>
  );
}

// ─── Highlight matched text ───────────────────────────────────────────────────

function HighlightText({ text, query, style }: { text: string; query: string; style: any }) {
  if (!query) return <Text style={style}>{text}</Text>;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return (
    <Text style={style}>
      {parts.map((p, i) =>
        p.toLowerCase() === query.toLowerCase()
          ? <Text key={i} style={[style, { backgroundColor: '#F0A83580', fontWeight: '800' }]}>{p}</Text>
          : <Text key={i}>{p}</Text>
      )}
    </Text>
  );
}

// ─── Bubble tails ─────────────────────────────────────────────────────────────

function RightTail({ color }: { color: string }) {
  return (
    <View style={{
      position: 'absolute', bottom: 0, right: -8,
      width: 0, height: 0,
      borderTopWidth: 10, borderTopColor: 'transparent',
      borderLeftWidth: 10, borderLeftColor: color,
      borderBottomWidth: 0,
    }} />
  );
}

function LeftTail({ color }: { color: string }) {
  return (
    <View style={{
      position: 'absolute', bottom: 0, left: -8,
      width: 0, height: 0,
      borderTopWidth: 10, borderTopColor: 'transparent',
      borderRightWidth: 10, borderRightColor: color,
      borderBottomWidth: 0,
    }} />
  );
}

// ─── Single message bubble ────────────────────────────────────────────────────

function Bubble({
  msg, isMe, showTimestamp, isLastInGroup, isFirstInGroup, isNew,
  onImagePress, onLongPress, myUserId, searchQuery, onSwipeReply,
}: {
  msg: Message; isMe: boolean; showTimestamp: boolean;
  isLastInGroup: boolean; isFirstInGroup: boolean; isNew: boolean;
  onImagePress: (uri: string) => void; onLongPress: (m: Message) => void;
  myUserId?: string; searchQuery?: string; onSwipeReply?: (m: Message) => void;
}) {
  const { colors } = useTheme();
  const isNewRef = useRef(isNew);
  const scale = useRef(new Animated.Value(isNew ? 0.4 : 1)).current;
  const a = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isNewRef.current) {
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, tension: 200, friction: 12, useNativeDriver: true }),
        Animated.timing(a, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.timing(a, {
        toValue: 1, duration: 260, delay: 20,
        easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }).start();
    }
  }, []);

  const tx = a.interpolate({ inputRange: [0, 1], outputRange: isNewRef.current ? [0, 0] : [isMe ? 24 : -24, 0] });

  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderRelease: (_, g) => {
      if (g.dx > 50) { haptics.light(); onSwipeReply?.(msg); }
    },
  })).current;

  const bubbleBg = isMe ? colors.rose : colors.surface;

  // Border radii: reduce the corner on the sender's side for grouped messages
  const brTopRight    = isMe && isFirstInGroup ? 4 : 18;
  const brBottomRight = isMe && isLastInGroup  ? 18 : (isMe ? 4 : 18);
  const brTopLeft     = !isMe && isFirstInGroup ? 4 : 18;
  const brBottomLeft  = !isMe && isLastInGroup  ? 18 : (!isMe ? 4 : 18);

  return (
    <>
      {showTimestamp && (
        <View style={{ alignItems: 'center', marginVertical: 14 }}>
          <Text style={{ fontSize: 11, color: colors.muted, fontWeight: '700', backgroundColor: colors.surface2, paddingHorizontal: 14, paddingVertical: 5, borderRadius: 99 }}>
            {fmtTimestamp(msg.created_at)}
          </Text>
        </View>
      )}
      <Animated.View
        {...panResponder.panHandlers}
        style={{
          alignSelf: isMe ? 'flex-end' : 'flex-start',
          maxWidth: '78%',
          marginBottom: isLastInGroup ? 6 : 2,
          opacity: a,
          transform: [{ scale }, { translateX: tx }],
        }}
      >
       <Pressable onLongPress={() => onLongPress(msg)} delayLongPress={300}>
        {/* Sticker / GIF message — no bubble chrome */}
        {msg.msg_type === 'sticker' && (
          msg.media_url
            ? <Image source={{ uri: msg.media_url }} style={{ width: 120, height: 120 }} resizeMode="contain" />
            : <Text style={{ fontSize: 64, lineHeight: 74, textAlign: isMe ? 'right' : 'left' }}>{msg.content}</Text>
        )}
        {msg.msg_type === 'gif' && msg.media_url && (
          <Pressable onPress={() => onImagePress(msg.media_url!)} style={{ borderRadius: 16, overflow: 'hidden' }}>
            <Image source={{ uri: msg.media_url }} style={{ width: 200, height: 200 }} resizeMode="cover" />
          </Pressable>
        )}
        {/* Image message */}
        {msg.msg_type === 'image' && msg.media_url && (
          <View style={{ borderRadius: 18, borderTopRightRadius: brTopRight, borderBottomRightRadius: brBottomRight, borderTopLeftRadius: brTopLeft, borderBottomLeftRadius: brBottomLeft, overflow: 'hidden', borderWidth: isMe ? 0 : 1, borderColor: colors.line }}>
            <ImageBubble uri={msg.media_url} onPress={() => onImagePress(msg.media_url!)} />
            {msg.content ? (
              <View style={{ backgroundColor: bubbleBg, padding: 10, paddingHorizontal: 14 }}>
                <Text style={{ color: isMe ? '#fff' : colors.text, fontSize: 14 }}>{msg.content}</Text>
              </View>
            ) : null}
            {isLastInGroup && (isMe ? <RightTail color={bubbleBg} /> : <LeftTail color={bubbleBg} />)}
          </View>
        )}
        {/* Audio message */}
        {msg.msg_type === 'audio' && msg.media_url && (
          <View style={{ backgroundColor: bubbleBg, borderRadius: 20, borderTopRightRadius: brTopRight, borderBottomRightRadius: brBottomRight, borderTopLeftRadius: brTopLeft, borderBottomLeftRadius: brBottomLeft, padding: 12, paddingHorizontal: 14, borderWidth: isMe ? 0 : 1, borderColor: colors.line, minWidth: 180 }}>
            <AudioBubble uri={msg.media_url} dur={msg.duration_s ?? 0} isMe={isMe} />
            {isLastInGroup && (isMe ? <RightTail color={bubbleBg} /> : <LeftTail color={bubbleBg} />)}
          </View>
        )}
        {/* Text message */}
        {msg.msg_type === 'text' && (
          <View style={{ backgroundColor: bubbleBg, borderRadius: 18, borderTopRightRadius: brTopRight, borderBottomRightRadius: brBottomRight, borderTopLeftRadius: brTopLeft, borderBottomLeftRadius: brBottomLeft, padding: 12, paddingHorizontal: 14, borderWidth: isMe ? 0 : 1, borderColor: colors.line }}>
            {msg.reply_to && (
              <View style={{ borderLeftWidth: 3, borderLeftColor: isMe ? 'rgba(255,255,255,0.6)' : colors.rose, paddingLeft: 8, marginBottom: 6, opacity: 0.85 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: isMe ? 'rgba(255,255,255,0.8)' : colors.rose }}>
                  {msg.reply_to.sender_name}
                </Text>
                <Text style={{ fontSize: 12, color: isMe ? 'rgba(255,255,255,0.7)' : colors.textSec }} numberOfLines={2}>
                  {msg.reply_to.content}
                </Text>
              </View>
            )}
            <HighlightText text={msg.content} query={searchQuery ?? ''} style={{ fontSize: 15, color: isMe ? '#fff' : colors.text, lineHeight: 22 }} />
            {isLastInGroup && (isMe ? <RightTail color={bubbleBg} /> : <LeftTail color={bubbleBg} />)}
          </View>
        )}
       </Pressable>
        {/* Reaction pills */}
        {msg.reactions && msg.reactions.length > 0 && (() => {
          const counts: Record<string, { count: number; mine: boolean }> = {};
          for (const r of msg.reactions) {
            if (!counts[r.emoji]) counts[r.emoji] = { count: 0, mine: false };
            counts[r.emoji].count++;
            if (r.user_id === myUserId) counts[r.emoji].mine = true;
          }
          return (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4, justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
              {Object.entries(counts).map(([emoji, { count, mine }]) => (
                <View key={emoji} style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: mine ? colors.roseDim : colors.surface2, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: mine ? colors.rose + '66' : colors.line }}>
                  <Text style={{ fontSize: 13 }}>{emoji}</Text>
                  {count > 1 && <Text style={{ fontSize: 11, fontWeight: '700', color: mine ? colors.rose : colors.muted }}>{count}</Text>}
                </View>
              ))}
            </View>
          );
        })()}
        <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: isMe ? 'flex-end' : 'flex-start', marginTop: 3 }}>
          {msg.pinned && <Ionicons name="pin" size={10} color={colors.rose} />}
          <Text style={{ fontSize: 10, color: colors.muted, fontWeight: '600' }}>
            {fmtTime(msg.created_at)}
          </Text>
          {isMe && (
            <Text style={{ fontSize: 10, color: msg.read_at ? colors.rose : colors.muted, fontWeight: '700', marginLeft: 2 }}>
              {msg.read_at ? '✓✓' : '✓'}
            </Text>
          )}
        </View>
      </Animated.View>
    </>
  );
}

// ─── Recording waveform animation ─────────────────────────────────────────────

function RecordingIndicator({ seconds }: { seconds: number }) {
  const { colors } = useTheme();
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.2, duration: 500, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      Animated.timing(pulse, { toValue: 1,   duration: 500, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
    ])).start();
  }, []);
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Animated.View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444', transform: [{ scale: pulse }] }} />
      <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: 15 }}>Recording {fmtDur(seconds)}</Text>
      <Text style={{ color: colors.muted, fontSize: 12 }}>Release to send · Swipe to cancel</Text>
    </View>
  );
}

// ─── GIF / Sticker picker (Giphy) ────────────────────────────────────────────

function GifPicker({ visible, onClose, onPick, onPickSticker, colors }: {
  visible: boolean; onClose: () => void; onPick: (url: string) => void;
  onPickSticker: (url: string) => void; colors: any;
}) {
  const [tab, setTab] = useState<'gif' | 'sticker'>('gif');
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<{ id: string; url: string; preview: string }[]>([]);
  const [stickers, setStickers] = useState<{ id: string; url: string; preview: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (q: string, mode: 'gif' | 'sticker') => {
    if (!GIPHY_KEY) return;
    setLoading(true);
    try {
      const type = mode === 'gif' ? 'gifs' : 'stickers';
      const endpoint = q.trim()
        ? `https://api.giphy.com/v1/${type}/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q)}&limit=20&rating=g`
        : `https://api.giphy.com/v1/${type}/trending?api_key=${GIPHY_KEY}&limit=20&rating=g`;
      const res = await fetch(endpoint);
      const json = await res.json();
      const items = (json.data ?? []).map((g: any) => ({
        id: g.id,
        url: g.images?.downsized_medium?.url ?? g.images?.original?.url,
        preview: g.images?.fixed_width_small?.url ?? g.images?.downsized_still?.url,
      })).filter((g: any) => g.url);
      if (mode === 'gif') setGifs(items);
      else setStickers(items);
    } catch { if (mode === 'gif') setGifs([]); else setStickers([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (visible) { search('', 'gif'); search('', 'sticker'); } }, [visible, search]);
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => search(query, tab), 350);
    return () => clearTimeout(t);
  }, [query, tab, visible, search]);

  const data = tab === 'gif' ? gifs : stickers;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1 }} onPress={onClose} />
      <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, height: '68%' }}>
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, alignSelf: 'center', marginBottom: 14 }} />
        {!GIPHY_KEY ? (
          <View style={{ alignItems: 'center', padding: 24, gap: 8 }}>
            <Text style={{ fontSize: 40 }}>🎞️</Text>
            <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>GIF/Sticker search needs a Giphy key</Text>
            <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 19 }}>
              Add EXPO_PUBLIC_GIPHY_KEY to app/frontend/.env and restart. Get a free key at developers.giphy.com.
            </Text>
          </View>
        ) : (
          <>
            {/* Tab row */}
            <View style={{ flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: 12, padding: 3, marginBottom: 12, borderWidth: 1, borderColor: colors.line }}>
              {(['gif', 'sticker'] as const).map(t => (
                <Pressable
                  key={t}
                  onPress={() => setTab(t)}
                  style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, backgroundColor: tab === t ? colors.rose : 'transparent' }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '700', color: tab === t ? '#fff' : colors.muted }}>
                    {t === 'gif' ? 'GIFs 🎬' : 'Stickers ✨'}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              value={query} onChangeText={setQuery}
              placeholder={tab === 'gif' ? 'Search GIFs…' : 'Search stickers…'} placeholderTextColor={colors.muted}
              style={{ backgroundColor: colors.surface2, borderRadius: 12, height: 44, paddingHorizontal: 14, color: colors.text, fontSize: 15, marginBottom: 12, borderWidth: 1, borderColor: colors.line }}
            />
            {loading && data.length === 0 ? (
              <ActivityIndicator color={colors.rose} style={{ marginTop: 30 }} />
            ) : (
              <FlatList
                data={data}
                keyExtractor={g => g.id}
                numColumns={3}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => tab === 'gif' ? onPick(item.url) : onPickSticker(item.url)}
                    style={{ flex: 1 / 3, aspectRatio: 1, padding: 3 }}
                  >
                    <Image
                      source={{ uri: item.preview }}
                      style={{ flex: 1, borderRadius: 10, backgroundColor: tab === 'sticker' ? 'transparent' : colors.surface2 }}
                      resizeMode={tab === 'sticker' ? 'contain' : 'cover'}
                    />
                  </Pressable>
                )}
                ListEmptyComponent={<Text style={{ color: colors.muted, textAlign: 'center', marginTop: 30 }}>Nothing found</Text>}
              />
            )}
            <Text style={{ fontSize: 10, color: colors.muted, textAlign: 'center', marginTop: 6 }}>Powered by GIPHY</Text>
          </>
        )}
      </View>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { partner, couple, isPaired, isLoading: coupleLoading } = useCouple();
  const { partnerNickname } = useNicknames(user?.name, partner?.name);

  const [messages, setMessages]     = useState<Message[]>([]);
  const [searchActive, setSearchActive] = useState(false);
  const [searchQuery, setSearchQuery]   = useState('');
  const [text, setText]             = useState('');
  const [sending, setSending]       = useState(false);
  const [fullImg, setFullImg]       = useState<string | null>(null);
  const [showMedia, setShowMedia]   = useState(false);
  const [presence, setPresence]     = useState<{ online: boolean; last_active_at: string | null }>({ online: false, last_active_at: null });
  const [pinned, setPinned]         = useState<Message | null>(null);
  const [showStickers, setShowStickers] = useState(false);
  const [showGif, setShowGif]           = useState(false);
  const [editorUri, setEditorUri]       = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<Message | null>(null);
  const [replyingTo, setReplyingTo]    = useState<Message | null>(null);
  const [newMessageId, setNewMessageId] = useState<string | null>(null);

  const [toneChecking, setToneChecking] = useState(false);

  const checkTone = async () => {
    if (!text.trim()) return;
    setToneChecking(true);
    haptics.light();
    try {
      const lastMsgs = messages.slice(-9).map(m => ({
        role: m.user_id === user?.user_id ? 'user' : 'assistant',
        content: m.content || '',
      }));
      lastMsgs.push({ role: 'user', content: text.trim() });

      const result = await api.post<any>('/api/ai/conflict-check', { messages: lastMsgs });
      haptics.medium();
      
      if (result.tension) {
        Alert.alert(
          '⚠️ Aria Tone Warning',
          `Detected tension (Level: ${result.level ?? 'low'}).\n\nSuggestion:\n"${result.suggestion}"`,
          [
            { text: 'Edit message', style: 'cancel' },
            { text: 'Send anyway', onPress: () => send() }
          ]
        );
      } else {
        Alert.alert('✨ Aria Tone Check', 'Looks great! No tension detected in your message.');
      }
    } catch {
      Alert.alert('Tone Check', 'Could not analyze tone right now.');
    } finally {
      setToneChecking(false);
    }
  };

  // Calendar mini modal (from action sheet / intent chip)
  const [showCalModal, setShowCalModal] = useState(false);
  const [calModalMsg, setCalModalMsg]   = useState<Message | null>(null);
  const [calDate, setCalDate]           = useState('');
  const [calTime, setCalTime]           = useState('');

  // Audio recording
  const [recording, setRecording]   = useState<Audio.Recording | null>(null);
  const [recSecs, setRecSecs]       = useState(0);
  const recTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Typing indicator
  const [partnerTyping, setPartnerTyping] = useState(false);
  const typingDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scheduled messages
  const [scheduledMsgs, setScheduledMsgs]     = useState<ScheduledMessage[]>([]);
  const [showScheduled, setShowScheduled]     = useState(false);
  const [showSchedModal, setShowSchedModal]   = useState(false);
  const [schedOption, setSchedOption]         = useState<string | null>(null);
  const [isCustomSched, setIsCustomSched]     = useState(false);
  const [customDate, setCustomDate]           = useState(new Date().toISOString().slice(0, 10));
  const [customTime, setCustomTime]           = useState('09:00');

  const listRef    = useRef<FlatList>(null);
  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCreated = useRef<string | null>(null);

  // ── Offline cache & outbox ────────────────────────────────────────────────
  const coupleId = couple?.couple_id ?? '';
  const cacheKey  = coupleId ? `@chat_cache_${coupleId}` : null;
  const outboxKey = coupleId ? `@chat_outbox_${coupleId}` : null;
  const [isOnline, setIsOnline]   = useState(true);
  const [hasOfflineBanner, setHasOfflineBanner] = useState(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef  = useRef(AppState.currentState);

  // ── Polling / Cache ───────────────────────────────────────────────────────
  const saveToCache = useCallback(async (msgs: Message[]) => {
    if (!cacheKey) return;
    try {
      const last50 = msgs.slice(-50);
      await AsyncStorage.setItem(cacheKey, JSON.stringify(last50));
    } catch {}
  }, [cacheKey]);

  const loadFromCache = useCallback(async () => {
    if (!cacheKey) return;
    try {
      const raw = await AsyncStorage.getItem(cacheKey);
      if (raw) {
        const cached: Message[] = JSON.parse(raw);
        if (cached.length) {
          setMessages(cached);
          lastCreated.current = cached[cached.length - 1].created_at;
        }
      }
    } catch {}
  }, [cacheKey]);

  const flushOutbox = useCallback(async () => {
    if (!outboxKey) return;
    try {
      const raw = await AsyncStorage.getItem(outboxKey);
      if (!raw) return;
      const queued: Array<{ content: string; reply_to?: any }> = JSON.parse(raw);
      if (!queued.length) return;
      const sent: string[] = [];
      for (const item of queued) {
        try {
          const body: Record<string, any> = { content: item.content, msg_type: 'text' };
          if (item.reply_to) body.reply_to = item.reply_to;
          const msg = await api.post<Message>('/api/messages', body);
          setMessages(prev => [...prev, msg]);
          lastCreated.current = msg.created_at;
          sent.push(item.content);
        } catch {}
      }
      if (sent.length) {
        const remaining = queued.filter(q => !sent.includes(q.content));
        await AsyncStorage.setItem(outboxKey, JSON.stringify(remaining));
      }
    } catch {}
  }, [outboxKey]);

  const load = useCallback(async (since?: string) => {
    try {
      const url = since ? `/api/messages?since=${encodeURIComponent(since)}&limit=60` : '/api/messages?limit=60';
      const msgs = await api.get<Message[]>(url);
      setHasOfflineBanner(false);
      if (!msgs.length) return;

      const sortedMsgs = [...msgs].sort((a, b) => a.created_at < b.created_at ? -1 : 1);
      const newestMsg = sortedMsgs[sortedMsgs.length - 1];
      if (newestMsg) {
        lastCreated.current = newestMsg.created_at;
      }

      setMessages(prev => {
        const updated = [...prev];
        const newMsgsMap = new Map(msgs.map(m => [m.id, m]));

        for (let i = 0; i < updated.length; i++) {
          const m = updated[i];
          if (newMsgsMap.has(m.id)) {
            updated[i] = {
              ...m,
              ...newMsgsMap.get(m.id)!,
            };
            newMsgsMap.delete(m.id);
          }
        }

        const fresh = Array.from(newMsgsMap.values());
        const result = [...updated, ...fresh].sort((a, b) => a.created_at < b.created_at ? -1 : 1);

        if (fresh.length > 0) {
          setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 80);
        }
        return result;
      });
      // Save to cache after successful fetch
      await saveToCache(msgs);
      // Mark last partner message as read
      const lastPartnerMsg = msgs.filter(m => m.user_id !== user?.user_id).at(-1);
      if (lastPartnerMsg) api.post(`/api/messages/${lastPartnerMsg.id}/read`).catch(() => {});
    } catch {
      // On failure show banner and use cache
      setHasOfflineBanner(true);
    }
  }, [user?.user_id, saveToCache]);

  const loadPresence = useCallback(async () => {
    try { setPresence(await api.get('/api/presence/partner')); } catch {}
  }, []);
  const loadPinned = useCallback(async () => {
    try { setPinned(await api.get<Message | null>('/api/messages/pinned')); } catch {}
  }, []);
  const loadTyping = useCallback(async () => {
    try {
      const res = await api.get<{ typing: boolean; user_id: string | null }>('/api/typing');
      setPartnerTyping(res.typing && res.user_id !== user?.user_id);
    } catch {}
  }, [user?.user_id]);
  const loadScheduled = useCallback(async () => {
    try { setScheduledMsgs(await api.get<ScheduledMessage[]>('/api/messages/scheduled')); } catch {}
  }, []);

  useEffect(() => {
    // Load cache immediately for instant display
    loadFromCache().then(() => {
      load();
    });
    loadPresence();
    loadPinned();
    loadScheduled();
    api.post('/api/messages/read').catch(() => {});
    pollRef.current = setInterval(() => {
      load();
      loadPresence();
      loadPinned();
      loadTyping();
    }, 3000);

    // NetInfo: watch connectivity
    const unsubNetInfo = NetInfo.addEventListener((state: any) => {
      const online = state.isConnected ?? true;
      setIsOnline(online);
      if (online) {
        setHasOfflineBanner(false);
        flushOutbox();
      } else {
        setHasOfflineBanner(true);
      }
    });

    // AppState: heartbeat every 60s while in foreground
    const handleAppState = (nextState: typeof AppState.currentState) => {
      if (nextState === 'active') {
        api.post('/api/activity/ping').catch(() => {});
      }
      appStateRef.current = nextState;
    };
    const appStateSub = AppState.addEventListener('change', handleAppState);
    // Initial ping
    api.post('/api/activity/ping').catch(() => {});
    // Regular heartbeat ping
    heartbeatRef.current = setInterval(() => {
      if (appStateRef.current === 'active') {
        api.post('/api/activity/ping').catch(() => {});
      }
    }, 60000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      unsubNetInfo();
      appStateSub.remove();
    };
  }, [load, loadPresence, loadPinned, loadTyping, loadScheduled, loadFromCache, flushOutbox]);

  const onMessageLongPress = (m: Message) => {
    haptics.medium();
    setActionTarget(m);
  };

  const reactToMessage = async (msg: Message, emoji: string) => {
    setActionTarget(null);
    haptics.light();
    try {
      await api.post(`/api/messages/${msg.id}/react`, { emoji });
      // Optimistic update
      setMessages(prev => prev.map(m => {
        if (m.id !== msg.id) return m;
        const existing = m.reactions ?? [];
        const alreadyReacted = existing.some(r => r.emoji === emoji && r.user_id === user?.user_id);
        return {
          ...m,
          reactions: alreadyReacted
            ? existing.filter(r => !(r.emoji === emoji && r.user_id === user?.user_id))
            : [...existing, { emoji, user_id: user?.user_id ?? '' }],
        };
      }));
    } catch {}
  };

  useEffect(() => {
    if (messages.length) setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: false }), 80);
  }, [messages.length === 0 ? 0 : 1]); // eslint-disable-line

  // ── Send text ─────────────────────────────────────────────────────────────
  const send = async () => {
    const content = text.trim();
    if (!content) return;
    const replyPayload = replyingTo
      ? { id: replyingTo.id, content: replyingTo.content, sender_name: replyingTo.sender_name }
      : undefined;
    setText(''); setReplyingTo(null); setSending(true); haptics.light();
    if (!isOnline) {
      // Queue to outbox
      try {
        const raw = outboxKey ? (await AsyncStorage.getItem(outboxKey)) : null;
        const queue = raw ? JSON.parse(raw) : [];
        queue.push({ content, ...(replyPayload ? { reply_to: replyPayload } : {}) });
        if (outboxKey) await AsyncStorage.setItem(outboxKey, JSON.stringify(queue));
        Alert.alert('Offline', 'Your message is queued and will be sent when you reconnect.');
      } catch {}
      setSending(false);
      return;
    }
    try {
      const body: Record<string, any> = { content, msg_type: 'text' };
      if (replyPayload) body.reply_to = replyPayload;
      const msg = await api.post<Message>('/api/messages', body);
      setMessages(prev => [...prev, msg]);
      lastCreated.current = msg.created_at;
      setNewMessageId(msg.id);
      setTimeout(() => setNewMessageId(null), 500);
      setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 60);
    } catch { haptics.error(); setText(content); }
    finally { setSending(false); }
  };

  // ── Calendar / todo intents ───────────────────────────────────────────────
  const offerAddToCalendar = (msg: Message) => {
    setCalModalMsg(msg);
    setCalDate('');
    setCalTime('');
    setShowCalModal(true);
  };

  const offerAddToTodo = async (msg: Message) => {
    haptics.light();
    try {
      await api.post('/api/todos', { title: msg.content, completed: false });
      Alert.alert('Added to to-do list ✅');
    } catch { Alert.alert('Could not add to to-do list'); }
  };

  // ── Send image ────────────────────────────────────────────────────────────
  const sendImage = async (uri: string, caption = '') => {
    setSending(true); haptics.light();
    try {
      const { url } = await api.upload(uri, { mimeType: 'image/jpeg' });
      const msg = await api.post<Message>('/api/messages', { content: caption, msg_type: 'image', media_url: url });
      setMessages(prev => [...prev, msg]);
      lastCreated.current = msg.created_at;
      setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 60);
    } catch { haptics.error(); Alert.alert('Could not send photo'); }
    finally { setSending(false); }
  };

  const sendSticker = async (emoji: string) => {
    setShowStickers(false); haptics.light();
    try {
      const msg = await api.post<Message>('/api/messages', { content: emoji, msg_type: 'sticker' });
      setMessages(prev => [...prev, msg]);
      lastCreated.current = msg.created_at;
      setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 60);
    } catch { haptics.error(); }
  };

  const sendGif = async (url: string) => {
    setShowGif(false); haptics.light();
    try {
      const msg = await api.post<Message>('/api/messages', { content: '', msg_type: 'gif', media_url: url });
      setMessages(prev => [...prev, msg]);
      lastCreated.current = msg.created_at;
      setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 60);
    } catch { haptics.error(); Alert.alert('Could not send GIF'); }
  };

  const sendGiphySticker = async (url: string) => {
    setShowGif(false); haptics.light();
    try {
      const msg = await api.post<Message>('/api/messages', { content: '', msg_type: 'sticker', media_url: url });
      setMessages(prev => [...prev, msg]);
      lastCreated.current = msg.created_at;
      setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 60);
    } catch { haptics.error(); Alert.alert('Could not send sticker'); }
  };

  const pickFromGallery = async () => {
    setShowMedia(false);
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
    if (!res.canceled) setEditorUri(res.assets[0].uri);   // open editor before sending
  };

  const takePhoto = async () => {
    setShowMedia(false);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Camera permission needed'); return; }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (!res.canceled) setEditorUri(res.assets[0].uri);
  };

  // ── Audio recording ───────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) { Alert.alert('Microphone permission needed'); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: r } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(r); setRecSecs(0); haptics.light();
      recTimer.current = setInterval(() => setRecSecs(s => s + 1), 1000);
    } catch (e: any) { Alert.alert('Could not start recording', e?.message); }
  };

  const stopAndSend = async () => {
    if (!recording) return;
    if (recTimer.current) { clearInterval(recTimer.current); recTimer.current = null; }
    const secs = recSecs;
    haptics.medium();
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null); setRecSecs(0);
      if (!uri || secs < 1) return;
      const { url } = await api.upload(uri, { name: `voice-${Date.now()}.m4a`, mimeType: 'audio/m4a' });
      const msg = await api.post<Message>('/api/messages', { content: '', msg_type: 'audio', media_url: url, duration_s: secs });
      setMessages(prev => [...prev, msg]);
      lastCreated.current = msg.created_at;
      setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 60);
    } catch { setRecording(null); setRecSecs(0); }
  };

  const cancelRecording = async () => {
    if (!recording) return;
    if (recTimer.current) { clearInterval(recTimer.current); recTimer.current = null; }
    haptics.light();
    try { await recording.stopAndUnloadAsync(); } catch {}
    setRecording(null); setRecSecs(0);
  };

  // ── Share location ────────────────────────────────────────────────────────
  const shareLocation = async () => {
    setShowMedia(false);
    haptics.light();
    // Send a text message with a Google Maps link; deep location requires expo-location
    const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent('Sharing my location')}`;
    Alert.alert(
      'Share location',
      'This will send a Google Maps link. For precise location, enable location services.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Share link',
          onPress: async () => {
            const msg = await api.post<Message>('/api/messages', {
              content: `📍 I'm sharing my location: ${mapsUrl}`,
              msg_type: 'text',
            }).catch(() => null);
            if (msg) {
              setMessages(prev => [...prev, msg]);
              lastCreated.current = msg.created_at;
              setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 60);
            }
          },
        },
      ],
    );
  };

  // ── Calls ─────────────────────────────────────────────────────────────────
  const coupleRoomId = 'closer-' + (couple?.couple_id?.slice(0, 8) ?? 'soulsync');

  const startVideoCall = () => {
    haptics.light();
    router.push({ pathname: '/(app)/video-call', params: { roomId: coupleRoomId, mode: 'video' } });
  };

  const startVoiceCall = () => {
    haptics.light();
    router.push({ pathname: '/(app)/video-call', params: { roomId: coupleRoomId, mode: 'voice' } });
  };

  const partnerName = partnerNickname || partner?.name?.split(' ')[0] || 'Partner';

  const filteredMessages = searchActive && searchQuery.trim()
    ? messages.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

  // Inverted FlatList: newest first so the list anchors to the bottom automatically
  const displayMessages = useMemo(() => [...filteredMessages].reverse(), [filteredMessages]);

  // ─── Render ───────────────────────────────────────────────────────────────
  if (coupleLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }} edges={['top', 'bottom']}>
        <ActivityIndicator color={colors.rose} size="large" />
      </SafeAreaView>
    );
  }

  if (!isPaired) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
        <NotConnected message="Connect with your partner to start chatting" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>

      {/* ── Header ── */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.line }]}>
        <Pressable style={s.back} onPress={() => (router.canGoBack() ? router.back() : router.replace('/' as any))} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        {searchActive ? (
          <>
            <TextInput
              autoFocus
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search messages…"
              placeholderTextColor={colors.muted}
              style={{ flex: 1, backgroundColor: colors.surface2, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 15, color: colors.text, marginHorizontal: 6, borderWidth: 1, borderColor: colors.line }}
            />
            <Pressable hitSlop={10} onPress={() => { setSearchActive(false); setSearchQuery(''); }} style={s.headerBtn}>
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </>
        ) : (
          <>
            <View style={[s.avatar, { backgroundColor: colors.roseDim, borderColor: colors.rose }]}>
              {partner?.avatar_url
                ? <Image source={{ uri: partner.avatar_url }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                : <Text style={{ fontSize: 18, fontWeight: '900', color: colors.rose }}>{(partnerName[0] ?? '?').toUpperCase()}</Text>
              }
            </View>
            {/* Green dot if active in last 5 min */}
            {partner?.last_active && (Date.now() - new Date(partner.last_active).getTime()) < 5 * 60 * 1000 && (
              <View style={{ position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.green, borderWidth: 2, borderColor: colors.surface }} />
            )}
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{partnerName}</Text>
              <Text style={{ fontSize: 11, color: presence.online ? colors.green : colors.muted, fontWeight: '700' }}>
                {presence.online ? '● Active now' : presence.last_active_at ? `Active ${relTime(presence.last_active_at)}` : 'Offline'}
              </Text>
            </View>
            {/* Action buttons */}
            <Pressable hitSlop={10} onPress={startVoiceCall} style={s.headerBtn}>
              <Ionicons name="call-outline" size={22} color={colors.text} />
            </Pressable>
            <Pressable hitSlop={10} onPress={startVideoCall} style={s.headerBtn}>
              <Ionicons name="videocam-outline" size={22} color={colors.text} />
            </Pressable>
            <Pressable hitSlop={10} onPress={() => router.push('/(app)/snaps')} style={s.headerBtn}>
              <Ionicons name="camera-outline" size={22} color={colors.text} />
            </Pressable>
            <Pressable hitSlop={10} onPress={() => { haptics.light(); setSearchActive(true); }} style={s.headerBtn}>
              <Ionicons name="search-outline" size={22} color={colors.text} />
            </Pressable>
          </>
        )}
      </View>

      {/* ── Offline banner ── */}
      {hasOfflineBanner && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#92400E', paddingVertical: 6 }}>
          <Ionicons name="cloud-offline-outline" size={14} color="#FCD34D" />
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#FCD34D' }}>Offline — showing cached messages</Text>
        </View>
      )}

      {/* ── Pinned message bar ── */}
      {pinned && (
        <Pressable
          onLongPress={() => onMessageLongPress(pinned)} delayLongPress={300}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.roseDim, borderBottomWidth: 1, borderBottomColor: colors.line }}
        >
          <Ionicons name="pin" size={15} color={colors.rose} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: colors.rose, letterSpacing: 0.5 }}>PINNED</Text>
            <Text numberOfLines={1} style={{ fontSize: 13, color: colors.text }}>
              {pinned.msg_type === 'text' ? pinned.content
                : pinned.msg_type === 'sticker' ? pinned.content
                : pinned.msg_type === 'audio' ? '🎤 Voice note'
                : pinned.msg_type === 'gif' ? 'GIF' : '📷 Photo'}
            </Text>
          </View>
          <Pressable hitSlop={8} onPress={async () => { await api.post(`/api/messages/${pinned.id}/pin`).catch(() => {}); loadPinned(); }}>
            <Ionicons name="close" size={16} color={colors.muted} />
          </Pressable>
        </Pressable>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>

        {/* ── Scheduled messages section ── */}
        {scheduledMsgs.length > 0 && (
          <View style={{ backgroundColor: colors.surface2, borderBottomWidth: 1, borderBottomColor: colors.line }}>
            <Pressable
              onPress={() => setShowScheduled(v => !v)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8 }}
            >
              <Ionicons name="time-outline" size={14} color={colors.rose} />
              <Text style={{ fontSize: 12, fontWeight: '800', color: colors.rose, flex: 1 }}>
                {scheduledMsgs.length} SCHEDULED MESSAGE{scheduledMsgs.length > 1 ? 'S' : ''}
              </Text>
              <Ionicons name={showScheduled ? 'chevron-up' : 'chevron-down'} size={14} color={colors.muted} />
            </Pressable>
            {showScheduled && scheduledMsgs.map(sm => (
              <View key={sm.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingBottom: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontSize: 13, color: colors.text }}>{sm.content}</Text>
                  <Text style={{ fontSize: 11, color: colors.muted }}>
                    {new Date(sm.send_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                  </Text>
                </View>
                <Pressable hitSlop={10} onPress={async () => {
                  await api.del(`/api/messages/scheduled/${sm.id}`).catch(() => {});
                  loadScheduled();
                }}>
                  <Ionicons name="trash-outline" size={16} color={colors.muted} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {/* ── Messages ── */}
        <FlatList
          ref={listRef}
          data={displayMessages}
          keyExtractor={m => m.id}
          inverted
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={{ padding: space.md, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            searchActive && searchQuery.trim() ? (
              <View style={{ alignItems: 'center', paddingTop: 100 }}>
                <Text style={{ fontSize: 44, marginBottom: 14 }}>🔍</Text>
                <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: 8 }}>No messages match</Text>
                <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20 }}>
                  Try a different search term.
                </Text>
              </View>
            ) : (
              <View style={{ alignItems: 'center', paddingTop: 100 }}>
                <Text style={{ fontSize: 44, marginBottom: 14 }}>💬</Text>
                <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: 8 }}>Say hello!</Text>
                <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20 }}>
                  Text, photos and voice notes —{'\n'}just between you two.
                </Text>
              </View>
            )
          }
          renderItem={({ item, index }) => {
            // displayMessages is newest-first; index 0 = bottom of list (newest)
            const olderMsg = displayMessages[index + 1]; // older neighbor in time
            const newerMsg = displayMessages[index - 1]; // newer neighbor in time

            const GROUP_GAP_MS = 2 * 60 * 1000;
            const isLastInGroup = !newerMsg
              || newerMsg.user_id !== item.user_id
              || (new Date(newerMsg.created_at).getTime() - new Date(item.created_at).getTime()) > GROUP_GAP_MS;
            const isFirstInGroup = !olderMsg
              || olderMsg.user_id !== item.user_id
              || (new Date(item.created_at).getTime() - new Date(olderMsg.created_at).getTime()) > GROUP_GAP_MS;

            const TIMESTAMP_GAP_MS = 30 * 60 * 1000;
            const showTimestamp = isFirstInGroup && (
              !olderMsg
              || item.created_at.slice(0, 10) !== olderMsg.created_at.slice(0, 10)
              || (new Date(item.created_at).getTime() - new Date(olderMsg.created_at).getTime()) > TIMESTAMP_GAP_MS
            );

            const isMe = item.user_id === user?.user_id;
            const intent = !isMe && item.msg_type === 'text' ? detectIntent(item.content) : null;
            return (
              <View>
                <Bubble
                  msg={item}
                  isMe={isMe}
                  showTimestamp={showTimestamp}
                  isLastInGroup={isLastInGroup}
                  isFirstInGroup={isFirstInGroup}
                  isNew={item.id === newMessageId}
                  onImagePress={setFullImg}
                  onLongPress={onMessageLongPress}
                  myUserId={user?.user_id}
                  searchQuery={searchActive ? searchQuery : ''}
                  onSwipeReply={setReplyingTo}
                />
                {intent === 'schedule' && (
                  <Pressable
                    onPress={() => offerAddToCalendar(item)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginLeft: 8, marginTop: -2, marginBottom: 6, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.blue ?? '#3B82F6', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 }}
                  >
                    <Ionicons name="calendar-outline" size={12} color={colors.blue ?? '#3B82F6'} />
                    <Text style={{ fontSize: 11, color: colors.blue ?? '#3B82F6', fontWeight: '600' }}>Add to calendar?</Text>
                  </Pressable>
                )}
                {intent === 'task' && (
                  <Pressable
                    onPress={() => offerAddToTodo(item)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginLeft: 8, marginTop: -2, marginBottom: 6, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.green ?? '#22C55E', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 }}
                  >
                    <Ionicons name="checkbox-outline" size={12} color={colors.green ?? '#22C55E'} />
                    <Text style={{ fontSize: 11, color: colors.green ?? '#22C55E', fontWeight: '600' }}>Add to to-do?</Text>
                  </Pressable>
                )}
              </View>
            );
          }}
        />

        {/* ── Typing indicator ── */}
        {partnerTyping && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 12, color: colors.muted, fontStyle: 'italic' }}>
              {partnerName} is typing…
            </Text>
          </View>
        )}

        {/* ── Reply preview bar ── */}
        {replyingTo && (
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface2, paddingHorizontal: 14, paddingVertical: 8, borderLeftWidth: 3, borderLeftColor: colors.rose, marginHorizontal: 8, borderRadius: 8, gap: 8, marginBottom: 4 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, color: colors.rose, fontWeight: '700' }}>{replyingTo.sender_name}</Text>
              <Text style={{ fontSize: 12, color: colors.textSec }} numberOfLines={1}>{replyingTo.content}</Text>
            </View>
            <Pressable onPress={() => setReplyingTo(null)} hitSlop={8}>
              <Ionicons name="close" size={16} color={colors.muted} />
            </Pressable>
          </View>
        )}

        {/* ✨ Check Tone dynamic link */}
        {text.trim().split(/\s+/).filter(Boolean).length >= 3 && !toneChecking && (
          <Pressable
            onPress={checkTone}
            style={{
              alignSelf: 'flex-end',
              marginRight: 16,
              marginBottom: 6,
              backgroundColor: colors.roseDim,
              borderRadius: radius.full || 12,
              paddingHorizontal: 12,
              paddingVertical: 5,
              borderWidth: 1,
              borderColor: colors.rose + '20',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4
            }}
          >
            <Ionicons name="sparkles-outline" size={13} color={colors.rose} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.rose }}>✨ Aria: Check tone</Text>
          </Pressable>
        )}

        {/* ── Input bar ── */}
        <View style={[s.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.line }]}>
          {recording ? (
            /* Recording state */
            <>
              <Pressable onPress={cancelRecording} style={s.cancelBtn} hitSlop={8}>
                <Ionicons name="trash-outline" size={20} color="#EF4444" />
              </Pressable>
              <RecordingIndicator seconds={recSecs} />
              <Pressable onPress={stopAndSend} style={[s.sendBtn, { backgroundColor: colors.rose }]}>
                <Ionicons name="send" size={18} color="#fff" />
              </Pressable>
            </>
          ) : (
            /* Normal state */
            <>
              {/* Media picker */}
              <Pressable onPress={() => setShowMedia(true)} style={s.mediaBtn} hitSlop={8}>
                <Ionicons name="add-circle-outline" size={26} color={colors.rose} />
              </Pressable>

              {/* Text input */}
              <TextInput
                style={[s.input, { backgroundColor: colors.surface2, color: colors.text, borderColor: colors.line }]}
                value={text}
                onChangeText={(val) => {
                  setText(val);
                  // Debounced typing POST
                  if (typingDebounce.current) clearTimeout(typingDebounce.current);
                  typingDebounce.current = setTimeout(() => {
                    api.post('/api/typing').catch(() => {});
                  }, 1500);
                }}
                placeholder={`Message ${partnerName}…`}
                placeholderTextColor={colors.muted}
                multiline
                maxLength={2000}
                returnKeyType="default"
              />

              {/* Clock (schedule) button — only when text is present */}
              {text.trim() ? (
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  <Pressable style={[s.sendBtn, { backgroundColor: colors.surface2 }]} onPress={checkTone} disabled={toneChecking}>
                    {toneChecking ? (
                      <ActivityIndicator size="small" color={colors.rose} />
                    ) : (
                      <Ionicons name="sparkles-outline" size={20} color={colors.rose} />
                    )}
                  </Pressable>
                  <Pressable style={[s.sendBtn, { backgroundColor: colors.surface2 }]} onPress={() => { haptics.light(); setShowSchedModal(true); }}>
                    <Ionicons name="time-outline" size={20} color={colors.rose} />
                  </Pressable>
                </View>
              ) : null}

              {/* Mic / Send */}
              {text.trim() ? (
                <Pressable style={[s.sendBtn, { backgroundColor: colors.rose }]} onPress={send} disabled={sending}>
                  <Ionicons name="send" size={18} color="#fff" />
                </Pressable>
              ) : (
                <Pressable
                  style={[s.sendBtn, { backgroundColor: colors.surface2 }]}
                  onLongPress={startRecording}
                  onPressOut={stopAndSend}
                  onPress={() => Alert.alert('Voice note', 'Hold to record, release to send.')}
                  delayLongPress={200}
                >
                  <Ionicons name="mic-outline" size={20} color={colors.rose} />
                </Pressable>
              )}
            </>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* ── Media picker sheet ── */}
      <Modal visible={showMedia} transparent animationType="slide" onRequestClose={() => setShowMedia(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setShowMedia(false)} />
        <View style={[s.sheet, { backgroundColor: colors.surface }]}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, alignSelf: 'center', marginBottom: 20 }} />
          <View style={{ flexDirection: 'row', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            {[
              { icon: '📷', label: 'Camera',   action: takePhoto },
              { icon: '🖼️', label: 'Gallery',  action: pickFromGallery },
              { icon: '😀', label: 'Stickers', action: () => { setShowMedia(false); setShowStickers(true); } },
              { icon: '🎞️', label: 'GIF',      action: () => { setShowMedia(false); setShowGif(true); } },
              { icon: '🔥', label: 'Snap',     action: () => { setShowMedia(false); router.push('/(app)/snaps'); } },
              { icon: '🖼️', label: 'Photos',   action: () => { setShowMedia(false); router.push('/(app)/photos'); } },
              { icon: '📞', label: 'Voice',    action: () => { setShowMedia(false); startVoiceCall(); } },
              { icon: '📹', label: 'Video',    action: () => { setShowMedia(false); startVideoCall(); } },
            ].map(b => (
              <Pressable key={b.label} onPress={b.action} style={{ alignItems: 'center', gap: 8 }}>
                <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line }}>
                  <Text style={{ fontSize: 26 }}>{b.icon}</Text>
                </View>
                <Text style={{ fontSize: 12, color: colors.textSec, fontWeight: '700' }}>{b.label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ height: 28 }} />
        </View>
      </Modal>

      {/* ── Sticker picker ── */}
      <Modal visible={showStickers} transparent animationType="slide" onRequestClose={() => setShowStickers(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setShowStickers(false)} />
        <View style={[s.sheet, { backgroundColor: colors.surface, maxHeight: 360 }]}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, alignSelf: 'center', marginBottom: 16 }} />
          <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 12 }}>Stickers</Text>
          <FlatList
            data={STICKERS}
            keyExtractor={(e, i) => `${e}-${i}`}
            numColumns={5}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <Pressable onPress={() => sendSticker(item)} style={{ flex: 1, alignItems: 'center', paddingVertical: 10 }}>
                <Text style={{ fontSize: 40 }}>{item}</Text>
              </Pressable>
            )}
          />
        </View>
      </Modal>

      {/* ── GIF picker (Giphy) ── */}
      <GifPicker visible={showGif} onClose={() => setShowGif(false)} onPick={sendGif} onPickSticker={sendGiphySticker} colors={colors} />

      {/* ── Instagram-style photo editor ── */}
      <PhotoEditor
        visible={!!editorUri}
        uri={editorUri}
        onCancel={() => setEditorUri(null)}
        onDone={(edited) => { setEditorUri(null); sendImage(edited); }}
      />

      {/* ── Action sheet (long-press) ── */}
      <Modal visible={!!actionTarget} transparent animationType="slide" onRequestClose={() => setActionTarget(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={() => setActionTarget(null)} />
        <View style={[s.sheet, { backgroundColor: colors.surface, paddingBottom: 28 }]}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, alignSelf: 'center', marginBottom: 16 }} />

          {/* Reaction row */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 18, paddingHorizontal: 8 }}>
            {['😍','😂','😢','❤️','🔥','👏'].map(emoji => (
              <Pressable
                key={emoji}
                onPress={() => actionTarget && reactToMessage(actionTarget, emoji)}
                style={{ width: 50, height: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2, borderRadius: 25 }}
              >
                <Text style={{ fontSize: 26 }}>{emoji}</Text>
              </Pressable>
            ))}
          </View>

          <View style={{ height: 1, backgroundColor: colors.line, marginBottom: 8 }} />

          {/* Reply */}
          {[
            {
              icon: 'arrow-undo-outline' as const,
              label: 'Reply',
              onPress: () => { if (actionTarget) { setReplyingTo(actionTarget); setActionTarget(null); } },
            },
            {
              icon: 'bookmark-outline' as const,
              label: 'Save as Memory',
              onPress: async () => {
                if (!actionTarget) return;
                setActionTarget(null);
                try {
                  await api.post('/api/memories', { title: actionTarget.content, note: actionTarget.content, date: new Date().toISOString().slice(0, 10) });
                  haptics.light();
                  Alert.alert('Saved to Memories 📌');
                } catch { Alert.alert('Could not save memory'); }
              },
            },
            {
              icon: 'book-outline' as const,
              label: 'Save to Journal',
              onPress: async () => {
                if (!actionTarget) return;
                setActionTarget(null);
                try {
                  await api.post('/api/our-journal', { title: 'Saved from Chat', content: actionTarget.content });
                  haptics.light();
                  Alert.alert('Saved to Journal 📖');
                } catch { Alert.alert('Could not save to journal'); }
              },
            },
            {
              icon: 'copy-outline' as const,
              label: 'Copy text',
              onPress: async () => {
                if (!actionTarget) return;
                setActionTarget(null);
                try { await Share.share({ message: actionTarget.content }); }
                catch {}
              },
            },
            ...(actionTarget && detectIntent(actionTarget.content) === 'schedule' ? [{
              icon: 'calendar-outline' as const,
              label: 'Add to Calendar',
              onPress: () => { if (actionTarget) { offerAddToCalendar(actionTarget); setActionTarget(null); } },
            }] : []),
            ...(actionTarget?.user_id === user?.user_id ? [{
              icon: 'trash-outline' as const,
              label: 'Delete',
              onPress: async () => {
                if (!actionTarget) return;
                setActionTarget(null);
                await api.del(`/api/messages/${actionTarget.id}`).catch(() => {});
                setMessages(prev => prev.filter(m => m.id !== actionTarget.id));
              },
              destructive: true,
            }] : []),
            {
              icon: (pinned?.id === actionTarget?.id ? 'pin' : 'pin-outline') as any,
              label: pinned?.id === actionTarget?.id ? 'Unpin' : 'Pin message',
              onPress: async () => {
                if (!actionTarget) return;
                const t = actionTarget;
                setActionTarget(null);
                await api.post(`/api/messages/${t.id}/pin`).catch(() => {});
                loadPinned();
              },
            },
          ].map(action => (
            <Pressable
              key={action.label}
              onPress={action.onPress}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: colors.line }}
            >
              <Ionicons name={action.icon} size={20} color={(action as any).destructive ? '#EF4444' : colors.text} />
              <Text style={{ fontSize: 15, color: (action as any).destructive ? '#EF4444' : colors.text, fontWeight: '500' }}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      </Modal>

      {/* ── Schedule message modal ── */}
      <Modal visible={showSchedModal} transparent animationType="slide" onRequestClose={() => setShowSchedModal(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setShowSchedModal(false)} />
        <View style={[s.sheet, { backgroundColor: colors.surface }]}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, alignSelf: 'center', marginBottom: 16 }} />
          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 8 }}>Schedule message</Text>
          <View style={{ backgroundColor: colors.surface2, borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: colors.line }}>
            <Text style={{ fontSize: 14, color: colors.textSec, lineHeight: 20 }} numberOfLines={3}>{text}</Text>
          </View>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted, marginBottom: 10, letterSpacing: 0.5 }}>SEND WHEN</Text>
          {[
            { label: 'In 1 hour',            getValue: () => new Date(Date.now() + 3600_000).toISOString() },
            { label: 'Tonight at 9 PM',      getValue: () => { const d = new Date(); d.setHours(21, 0, 0, 0); if (d <= new Date()) d.setDate(d.getDate() + 1); return d.toISOString(); } },
            { label: 'Tomorrow morning 8 AM', getValue: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); return d.toISOString(); } },
          ].map(opt => (
            <Pressable
              key={opt.label}
              onPress={() => { setIsCustomSched(false); setSchedOption(opt.getValue()); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line }}
            >
              <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: (!isCustomSched && schedOption === opt.getValue()) ? colors.rose : colors.muted, backgroundColor: (!isCustomSched && schedOption === opt.getValue()) ? colors.rose : 'transparent' }} />
              <Text style={{ fontSize: 15, color: colors.text }}>{opt.label}</Text>
            </Pressable>
          ))}

          <Pressable
            onPress={() => { setIsCustomSched(true); setSchedOption(new Date(`${customDate}T${customTime}`).toISOString()); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line }}
          >
            <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: isCustomSched ? colors.rose : colors.muted, backgroundColor: isCustomSched ? colors.rose : 'transparent' }} />
            <Text style={{ fontSize: 15, color: colors.text, fontWeight: '600' }}>Custom Date & Time</Text>
          </Pressable>

          {isCustomSched && (
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, paddingHorizontal: 4 }}>
              <View style={{ flex: 1.5 }}>
                <DateField
                  value={customDate}
                  onChange={(d) => {
                    setCustomDate(d);
                    setSchedOption(new Date(`${d}T${customTime}`).toISOString());
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <TimeField
                  value={customTime}
                  onChange={(t) => {
                    setCustomTime(t);
                    setSchedOption(new Date(`${customDate}T${t}`).toISOString());
                  }}
                />
              </View>
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 18, marginBottom: 8 }}>
            <Pressable onPress={() => setShowSchedModal(false)} style={{ flex: 1, paddingVertical: 13, borderRadius: 14, backgroundColor: colors.surface2, alignItems: 'center' }}>
              <Text style={{ fontWeight: '700', color: colors.text }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={async () => {
                if (!schedOption) return;
                haptics.light();
                try {
                  await api.post('/api/messages/scheduled', { content: text.trim(), send_at: schedOption, msg_type: 'text' });
                  setText('');
                  setSchedOption(null);
                  setIsCustomSched(false);
                  setShowSchedModal(false);
                  loadScheduled();
                  Alert.alert('Scheduled 📅', 'Your message has been scheduled.');
                } catch { haptics.error(); Alert.alert('Error', 'Could not schedule message.'); }
              }}
              style={{ flex: 1, paddingVertical: 13, borderRadius: 14, backgroundColor: schedOption ? colors.rose : colors.muted, alignItems: 'center' }}
            >
              <Text style={{ fontWeight: '800', color: '#fff' }}>Schedule</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── Add to Calendar modal ── */}
      <Modal visible={showCalModal} transparent animationType="slide" onRequestClose={() => setShowCalModal(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setShowCalModal(false)} />
        <View style={[s.sheet, { backgroundColor: colors.surface, paddingBottom: 24 }]}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, alignSelf: 'center', marginBottom: 16 }} />
          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 6 }}>Add to Calendar</Text>
          {calModalMsg && (
            <View style={{ backgroundColor: colors.surface2, borderRadius: 10, padding: 10, marginBottom: 14, borderLeftWidth: 3, borderLeftColor: colors.rose }}>
              <Text numberOfLines={2} style={{ fontSize: 13, color: colors.textSec }}>{calModalMsg.content}</Text>
            </View>
          )}
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted, marginBottom: 6 }}>DATE (YYYY-MM-DD)</Text>
          <TextInput
            value={calDate}
            onChangeText={setCalDate}
            placeholder={new Date().toISOString().slice(0, 10)}
            placeholderTextColor={colors.muted}
            style={{ backgroundColor: colors.surface2, borderRadius: 12, height: 44, paddingHorizontal: 14, color: colors.text, fontSize: 15, marginBottom: 12, borderWidth: 1, borderColor: colors.line }}
          />
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted, marginBottom: 6 }}>TIME (HH:MM)</Text>
          <TextInput
            value={calTime}
            onChangeText={setCalTime}
            placeholder="19:00"
            placeholderTextColor={colors.muted}
            style={{ backgroundColor: colors.surface2, borderRadius: 12, height: 44, paddingHorizontal: 14, color: colors.text, fontSize: 15, marginBottom: 18, borderWidth: 1, borderColor: colors.line }}
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={() => setShowCalModal(false)} style={{ flex: 1, paddingVertical: 13, borderRadius: 14, backgroundColor: colors.surface2, alignItems: 'center' }}>
              <Text style={{ fontWeight: '700', color: colors.text }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={async () => {
                if (!calModalMsg) return;
                haptics.light();
                const dateStr = calDate || new Date().toISOString().slice(0, 10);
                const timeStr = calTime || '19:00';
                const start = new Date(`${dateStr}T${timeStr}:00`).toISOString();
                try {
                  await api.post('/api/events', { title: calModalMsg.content, start_time: start, end_time: new Date(new Date(start).getTime() + 3600_000).toISOString() });
                  setShowCalModal(false);
                  Alert.alert('Added to Calendar 📅');
                } catch { Alert.alert('Could not add to calendar'); }
              }}
              style={{ flex: 1, paddingVertical: 13, borderRadius: 14, backgroundColor: colors.rose, alignItems: 'center' }}
            >
              <Text style={{ fontWeight: '800', color: '#fff' }}>Add</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── Full-screen image viewer ── */}
      {fullImg && (
        <Modal visible animationType="fade" onRequestClose={() => setFullImg(null)}>
          <Pressable style={{ flex: 1, backgroundColor: '#000' }} onPress={() => setFullImg(null)}>
            <Image source={{ uri: fullImg }} style={StyleSheet.absoluteFill} resizeMode="contain" />
            <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, right: 0, padding: 16 }}>
              <Pressable onPress={() => setFullImg(null)} hitSlop={12}>
                <Ionicons name="close-circle" size={32} color="rgba(255,255,255,0.8)" />
              </Pressable>
            </SafeAreaView>
          </Pressable>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, gap: 4 },
  back:      { width: 38, height: 38, justifyContent: 'center' },
  avatar:    { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  headerBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  inputBar:  { flexDirection: 'row', alignItems: 'flex-end', padding: 10, gap: 8, borderTopWidth: 1 },
  mediaBtn:  { paddingBottom: 10, paddingTop: 10 },
  cancelBtn: { paddingBottom: 10, paddingTop: 10, paddingHorizontal: 4 },
  input:     { flex: 1, borderRadius: 22, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, fontSize: 15, maxHeight: 120, borderWidth: 1 },
  sendBtn:   { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  sheet:     { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 10, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: -4 }, elevation: 20 },
});
