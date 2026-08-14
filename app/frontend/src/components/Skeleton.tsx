import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useTheme } from '@/src/context/ThemeContext';
import { radius, space } from '@/src/theme';

interface SkeletonBoxProps {
  width: number | string;
  height: number;
  radius?: number;
  style?: object;
}

export function SkeletonBox({ width, height, radius: r, style }: SkeletonBoxProps) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: r ?? radius.md,
          backgroundColor: colors.surface3,
          opacity,
        },
        style,
      ]}
    />
  );
}

interface SkeletonCardProps {
  lines?: number;
}

export function SkeletonCard({ lines = 3 }: SkeletonCardProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <View style={styles.header}>
        <SkeletonBox width={40} height={40} radius={radius.full} />
        <View style={styles.headerText}>
          <SkeletonBox width="60%" height={14} />
          <SkeletonBox width="40%" height={11} style={{ marginTop: space.xs }} />
        </View>
      </View>
      <View style={styles.lines}>
        {Array.from({ length: lines }).map((_, i) => (
          <SkeletonBox
            key={i}
            width={i === lines - 1 ? '70%' : '100%'}
            height={12}
            style={{ marginTop: i === 0 ? 0 : space.sm }}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: space.md,
    borderWidth: 1,
    gap: space.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  headerText: {
    flex: 1,
    gap: space.xs,
  },
  lines: {
    gap: 0,
  },
});
