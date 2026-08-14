import { useState, useCallback, useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/src/context/ThemeContext';

type ToastType = 'success' | 'error' | 'info';

interface ToastProps {
  message: string;
  type?: ToastType;
  visible: boolean;
  onHide: () => void;
  duration?: number;
}

const EMOJIS: Record<ToastType, string> = {
  success: '✅',
  error: '❌',
  info: '💡',
};

export function Toast({ message, type = 'success', visible, onHide, duration = 3000 }: ToastProps) {
  const { colors } = useTheme();
  const anim = useRef(new Animated.Value(0)).current;

  const TYPE_COLORS: Record<ToastType, string> = {
    success: colors.green,
    error: '#EF4444',
    info: '#9333EA',
  };

  const TYPE_BG: Record<ToastType, string> = {
    success: 'rgba(92,184,122,0.15)',
    error: 'rgba(239,68,68,0.15)',
    info: 'rgba(147,51,234,0.15)',
  };

  useEffect(() => {
    if (visible) {
      Animated.spring(anim, {
        toValue: 1,
        useNativeDriver: true,
        damping: 20,
        stiffness: 300,
        mass: 0.8,
      }).start();
      const t = setTimeout(() => {
        Animated.timing(anim, { toValue: 0, duration: 250, useNativeDriver: true }).start(onHide);
      }, duration);
      return () => clearTimeout(t);
    }
  }, [visible]);

  if (!visible) return null;

  const accent = TYPE_COLORS[type];
  const bg = TYPE_BG[type];

  return (
    <Animated.View
      style={[
        s.container,
        {
          backgroundColor: colors.surface,
          borderColor: accent + '55',
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-90, 0] }) },
            { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
          ],
          opacity: anim,
        },
      ]}
    >
      <View style={[s.emojiWrap, { backgroundColor: bg }]}>
        <Text style={s.emoji}>{EMOJIS[type]}</Text>
      </View>
      <Text style={[s.text, { color: colors.text }]} numberOfLines={2}>{message}</Text>
    </Animated.View>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────
export function useToast() {
  const [state, setState] = useState<{ message: string; type: ToastType; visible: boolean }>({
    message: '',
    type: 'success',
    visible: false,
  });

  const show = useCallback((message: string, type: ToastType = 'success') => {
    setState({ message, type, visible: true });
  }, []);

  const hide = useCallback(() => setState(s => ({ ...s, visible: false })), []);

  return { toast: state, show, hide };
}

const s = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 56,
    left: 16,
    right: 16,
    zIndex: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  emojiWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  emoji: {
    fontSize: 18,
  },
  text: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
});
