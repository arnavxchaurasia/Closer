import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, Text, View } from 'react-native';

const { width: W, height: H } = Dimensions.get('window');
const EMOJIS = ['❤️', '🎉', '✨', '💛', '💖', '🌟', '💫', '🥳'];

/**
 * A one-shot celebratory burst of falling hearts/confetti. Purely decorative,
 * no external deps. Mount it with a `key` when you want it to replay, then call
 * onDone to unmount.
 */
export function Celebrate({ count = 24, onDone }: { count?: number; onDone?: () => void }) {
  const pieces = useMemo(
    () => Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * W,
      emoji: EMOJIS[i % EMOJIS.length],
      delay: Math.random() * 250,
      size: 20 + Math.random() * 20,
      drift: (Math.random() - 0.5) * 120,
      duration: 1600 + Math.random() * 900,
    })),
    [count],
  );

  useEffect(() => {
    const t = setTimeout(() => onDone?.(), 2600);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map(p => <Piece key={p.id} {...p} />)}
    </View>
  );
}

function Piece({ x, emoji, delay, size, drift, duration }: {
  x: number; emoji: string; delay: number; size: number; drift: number; duration: number;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1, duration, delay, easing: Easing.out(Easing.quad), useNativeDriver: true,
    }).start();
  }, [progress, duration, delay]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [-60, H + 60] });
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, drift] });
  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const opacity = progress.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 1, 1, 0] });

  return (
    <Animated.Text
      style={{
        position: 'absolute', left: x, top: 0, fontSize: size,
        opacity, transform: [{ translateY }, { translateX }, { rotate }],
      }}
    >
      {emoji}
    </Animated.Text>
  );
}
