import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/src/context/ThemeContext';

type ToastKind = 'success' | 'error' | 'info';
type ToastMessage = { id: number; title: string; description?: string; kind: ToastKind };

let listener: ((message: ToastMessage) => void) | undefined;
let nextId = 0;

/** A tiny, native-friendly Sonner-style API that can be called from any screen. */
export const sonner = {
  show(title: string, description?: string, kind: ToastKind = 'info') {
    listener?.({ id: ++nextId, title, description, kind });
  },
  success(title: string, description?: string) { this.show(title, description, 'success'); },
  error(title: string, description?: string) { this.show(title, description, 'error'); },
  info(title: string, description?: string) { this.show(title, description, 'info'); },
};

export function Sonner() {
  const { colors } = useTheme();
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    listener = message => setToast(message);
    return () => { listener = undefined; };
  }, []);

  useEffect(() => {
    if (!toast) return;
    progress.setValue(0);
    Animated.spring(progress, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 240 }).start();
    timer.current = setTimeout(() => dismiss(), 3600);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [toast?.id]);

  const dismiss = () => {
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(progress, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setToast(null));
  };

  if (!toast) return null;
  const accent = toast.kind === 'success' ? colors.green : toast.kind === 'error' ? '#EF4444' : colors.rose;
  const icon = toast.kind === 'success' ? '✓' : toast.kind === 'error' ? '!' : 'i';

  return (
    <Animated.View pointerEvents="box-none" style={[styles.layer, { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-28, 0] }) }] }]}>
      <Pressable accessibilityRole="alert" onPress={dismiss} style={[styles.toast, { backgroundColor: colors.surface, borderColor: accent + '66' }]}>
        <View style={[styles.icon, { backgroundColor: accent }]}><Text style={styles.iconText}>{icon}</Text></View>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{toast.title}</Text>
          {!!toast.description && <Text style={[styles.description, { color: colors.textSec }]} numberOfLines={2}>{toast.description}</Text>}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 56, left: 16, right: 16, zIndex: 10000, elevation: 10000 },
  toast: { minHeight: 58, borderRadius: 18, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 12 },
  icon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  iconText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  copy: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, fontWeight: '800' },
  description: { fontSize: 13, lineHeight: 18, marginTop: 1 },
});
