import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import {
  Image, Modal, PanResponder, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

import { useTheme } from '@/src/context/ThemeContext';

/**
 * Instagram-story-style editor: draw on a photo, add text (fonts/colors) and
 * stickers, then flatten to a single image. Works on iOS/Android via
 * react-native-view-shot; on web it best-effort captures and falls back to the
 * original image if the browser can't rasterize.
 */

type Mode = 'none' | 'draw';
type Stroke = { d: string; color: string; width: number };
type TextItem = { id: string; text: string; x: number; y: number; color: string; font: FontKey; size: number };
type StickerItem = { id: string; emoji: string; x: number; y: number };

const COLORS = ['#FFFFFF', '#111111', '#E8607A', '#F0A835', '#4B7BF5', '#5CB87A', '#A855F7', '#FF3B30'];
const STICKERS = ['❤️', '😍', '🥰', '😂', '🔥', '✨', '🌹', '💯', '👑', '🎉', '💋', '🦋', '⭐', '🍑', '💫', '😎'];

type FontKey = 'system' | 'serif' | 'mono' | 'script';
const FONTS: { key: FontKey; label: string; style: any }[] = [
  { key: 'system', label: 'Aa', style: { fontWeight: '800' } },
  { key: 'serif',  label: 'Aa', style: { fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontWeight: '700' } },
  { key: 'mono',   label: 'Aa', style: { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontWeight: '700' } },
  { key: 'script', label: 'Aa', style: { fontStyle: 'italic', fontWeight: '900' } },
];
const fontStyle = (k: FontKey) => FONTS.find(f => f.key === k)?.style ?? {};

let idc = 0;
const nextId = () => `${++idc}`;

export function PhotoEditor({ visible, uri, onCancel, onDone }: {
  visible: boolean;
  uri: string | null;
  onCancel: () => void;
  onDone: (editedUri: string) => void;
}) {
  const { colors } = useTheme();
  const shotRef = useRef<View>(null);

  const [mode, setMode] = useState<Mode>('none');
  const [color, setColor] = useState('#FFFFFF');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [texts, setTexts] = useState<TextItem[]>([]);
  const [stickers, setStickers] = useState<StickerItem[]>([]);
  const [saving, setSaving] = useState(false);

  const [showTextInput, setShowTextInput] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [draftFont, setDraftFont] = useState<FontKey>('system');

  // Refs keep the (once-created) PanResponder reading fresh mode/color.
  const modeRef = useRef(mode); modeRef.current = mode;
  const colorRef = useRef(color); colorRef.current = color;
  const cur = useRef<string>('');

  // Freehand drawing — active only in 'draw' mode.
  const drawResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => modeRef.current === 'draw',
      onMoveShouldSetPanResponder: () => modeRef.current === 'draw',
      onPanResponderGrant: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        cur.current = `M ${locationX.toFixed(1)} ${locationY.toFixed(1)}`;
        setStrokes(prev => [...prev, { d: cur.current, color: colorRef.current, width: 5 }]);
      },
      onPanResponderMove: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        cur.current += ` L ${locationX.toFixed(1)} ${locationY.toFixed(1)}`;
        setStrokes(prev => {
          if (!prev.length) return prev;
          const copy = prev.slice();
          copy[copy.length - 1] = { ...copy[copy.length - 1], d: cur.current };
          return copy;
        });
      },
    }),
  ).current;

  const addText = () => {
    const t = draftText.trim();
    if (t) setTexts(prev => [...prev, { id: nextId(), text: t, x: 60, y: 160, color, font: draftFont, size: 28 }]);
    setDraftText(''); setShowTextInput(false);
  };

  const addSticker = (emoji: string) => {
    setStickers(prev => [...prev, { id: nextId(), emoji, x: 140, y: 240 }]);
  };

  const undo = () => {
    if (strokes.length) setStrokes(prev => prev.slice(0, -1));
    else if (stickers.length) setStickers(prev => prev.slice(0, -1));
    else if (texts.length) setTexts(prev => prev.slice(0, -1));
  };

  const finish = async () => {
    if (!uri) return;
    setSaving(true);
    try {
      const out = await captureRef(shotRef, { format: 'jpg', quality: 0.9 });
      onDone(out);
    } catch {
      // Web/browser can't always rasterize cross-origin — fall back to original.
      onDone(uri);
    } finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }} edges={['top', 'bottom']}>
        {/* Top toolbar */}
        <View style={styles.topBar}>
          <Pressable onPress={onCancel} hitSlop={10} style={styles.iconBtn}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 14 }}>
            <Pressable onPress={undo} hitSlop={10} style={styles.iconBtn}>
              <Ionicons name="arrow-undo" size={22} color="#fff" />
            </Pressable>
            <Pressable onPress={() => setMode(mode === 'draw' ? 'none' : 'draw')} hitSlop={10} style={[styles.iconBtn, mode === 'draw' && styles.iconActive]}>
              <Ionicons name="brush" size={22} color="#fff" />
            </Pressable>
            <Pressable onPress={() => { setDraftFont('system'); setShowTextInput(true); }} hitSlop={10} style={styles.iconBtn}>
              <Ionicons name="text" size={24} color="#fff" />
            </Pressable>
          </View>
        </View>

        {/* Canvas */}
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <View ref={shotRef} collapsable={false} style={styles.canvas} {...(mode === 'draw' ? drawResponder.panHandlers : {})}>
            {uri && <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />}

            {/* Drawing layer */}
            <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
              {strokes.map((s, i) => (
                <Path key={i} d={s.d} stroke={s.color} strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              ))}
            </Svg>

            {/* Text overlays */}
            {texts.map(t => (
              <Draggable key={t.id} x={t.x} y={t.y} onMove={(x, y) => setTexts(prev => prev.map(p => p.id === t.id ? { ...p, x, y } : p))} disabled={mode === 'draw'}>
                <Text style={[{ fontSize: t.size, color: t.color, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } }, fontStyle(t.font)]}>
                  {t.text}
                </Text>
              </Draggable>
            ))}

            {/* Sticker overlays */}
            {stickers.map(st => (
              <Draggable key={st.id} x={st.x} y={st.y} onMove={(x, y) => setStickers(prev => prev.map(p => p.id === st.id ? { ...p, x, y } : p))} disabled={mode === 'draw'}>
                <Text style={{ fontSize: 56 }}>{st.emoji}</Text>
              </Draggable>
            ))}
          </View>
        </View>

        {/* Color palette (visible when drawing or after adding text) */}
        <View style={styles.paletteRow}>
          {COLORS.map(c => (
            <Pressable key={c} onPress={() => setColor(c)} style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchActive]} />
          ))}
        </View>

        {/* Sticker strip */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stickerStrip} contentContainerStyle={{ paddingHorizontal: 12, gap: 6, alignItems: 'center' }}>
          {STICKERS.map(e => (
            <Pressable key={e} onPress={() => addSticker(e)} style={styles.stickerBtn}>
              <Text style={{ fontSize: 28 }}>{e}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Bottom action */}
        <View style={styles.bottomBar}>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
            {mode === 'draw' ? 'Draw with your finger' : 'Drag text & stickers to place'}
          </Text>
          <Pressable onPress={finish} style={styles.doneBtn} disabled={saving}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{saving ? 'Saving…' : 'Done'}</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </Pressable>
        </View>

        {/* Text composer */}
        <Modal visible={showTextInput} transparent animationType="fade" onRequestClose={() => setShowTextInput(false)}>
          <View style={styles.textComposer}>
            <TextInput
              value={draftText} onChangeText={setDraftText} autoFocus multiline
              placeholder="Type something…" placeholderTextColor="rgba(255,255,255,0.5)"
              style={[{ color, fontSize: 30, textAlign: 'center', minWidth: 200, paddingHorizontal: 20 }, fontStyle(draftFont)]}
              onSubmitEditing={addText}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 24 }}>
              {FONTS.map(f => (
                <Pressable key={f.key} onPress={() => setDraftFont(f.key)} style={[styles.fontChip, draftFont === f.key && styles.fontChipActive]}>
                  <Text style={[{ color: '#fff', fontSize: 18 }, f.style]}>{f.label}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.paletteRow}>
              {COLORS.map(c => (
                <Pressable key={c} onPress={() => setColor(c)} style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchActive]} />
              ))}
            </View>
            <Pressable onPress={addText} style={[styles.doneBtn, { marginTop: 24 }]}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Add text</Text>
            </Pressable>
          </View>
        </Modal>
      </SafeAreaView>
    </Modal>
  );
}

// Draggable overlay wrapper.
function Draggable({ x, y, onMove, disabled, children }: {
  x: number; y: number; onMove: (x: number, y: number) => void; disabled?: boolean; children: React.ReactNode;
}) {
  const pos = useRef({ x, y }); pos.current = { x, y };
  const start = useRef({ x, y });
  const disabledRef = useRef(disabled); disabledRef.current = disabled;
  const onMoveRef = useRef(onMove); onMoveRef.current = onMove;
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabledRef.current,
      onMoveShouldSetPanResponder: (_e, g) => !disabledRef.current && (Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2),
      onPanResponderGrant: () => { start.current = { ...pos.current }; },
      onPanResponderMove: (_e, g) => { onMoveRef.current(start.current.x + g.dx, start.current.y + g.dy); },
    }),
  ).current;
  return (
    <View style={{ position: 'absolute', left: x, top: y }} {...responder.panHandlers}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  iconActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  canvas: { width: '100%', aspectRatio: 3 / 4, alignSelf: 'center', backgroundColor: '#111', overflow: 'hidden' },
  paletteRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 10, flexWrap: 'wrap', paddingHorizontal: 12 },
  swatch: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)' },
  swatchActive: { borderColor: '#fff', transform: [{ scale: 1.2 }] },
  stickerStrip: { maxHeight: 52, flexGrow: 0 },
  stickerBtn: { paddingHorizontal: 4 },
  bottomBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 10 },
  doneBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E8607A', borderRadius: 24, paddingHorizontal: 22, paddingVertical: 11 },
  textComposer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  fontChip: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'transparent' },
  fontChipActive: { borderColor: '#fff', backgroundColor: 'rgba(255,255,255,0.25)' },
});
