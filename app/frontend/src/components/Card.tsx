import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

import { useTheme } from '@/src/context/ThemeContext';
import { radius, space } from '@/src/theme';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  gradient?: [string, string];
  padding?: number;
}

export function Card({ children, style, onPress, gradient, padding = space.md }: CardProps) {
  const { colors } = useTheme();
  const inner = gradient ? (
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.gradient, { padding, borderRadius: radius.lg }]}
    >
      {children}
    </LinearGradient>
  ) : (
    <View style={[styles.surface, { padding, backgroundColor: colors.surface, borderColor: colors.line }]}>
      {children}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.container,
          style,
          pressed && styles.pressed,
        ]}
      >
        {inner}
      </Pressable>
    );
  }

  return (
    <View style={[styles.container, style]}>
      {inner}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  surface: {
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  gradient: {
    // borderRadius applied inline
  },
  pressed: {
    opacity: 0.82,
  },
});
