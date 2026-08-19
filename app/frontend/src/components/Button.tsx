import * as Haptics from 'expo-haptics';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { useTheme } from '@/src/context/ThemeContext';
import { Colors, space } from '@/src/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  variant?: Variant;
  size?: Size;
  label?: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  style?: ViewStyle;
  children?: React.ReactNode;
  haptic?: 'light' | 'medium' | 'heavy' | 'none';
}

function makeVariantStyles(colors: Colors): Record<Variant, { bg: string; textColor: string }> {
  return {
    primary: { bg: colors.rose, textColor: '#FFFFFF' },
    secondary: { bg: colors.surface2, textColor: colors.text },
    ghost: { bg: 'transparent', textColor: colors.rose },
    danger: { bg: colors.surface2, textColor: colors.rose },
  };
}

const sizeStyles: Record<Size, { paddingVertical: number; paddingHorizontal: number; fontSize: number; minHeight: number }> = {
  sm: { paddingVertical: space.xs, paddingHorizontal: space.md, fontSize: 13, minHeight: 40 },
  md: { paddingVertical: space.sm + 2, paddingHorizontal: space.lg, fontSize: 15, minHeight: 48 },
  lg: { paddingVertical: space.md - 1, paddingHorizontal: space.xl, fontSize: 16, minHeight: 56 },
};

function fireHaptic(haptic: 'light' | 'medium' | 'heavy' | 'none') {
  if (haptic === 'light')  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  if (haptic === 'medium') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  if (haptic === 'heavy')  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
}

export function Button({
  variant = 'primary',
  size = 'md',
  label,
  onPress,
  disabled = false,
  loading = false,
  icon,
  fullWidth = false,
  style,
  children,
  haptic = 'light',
}: ButtonProps) {
  const { colors, typography } = useTheme();
  const sv = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sv.value }],
  }));

  const isDisabled = disabled || loading;

  const handlePressIn = () => {
    if (isDisabled) return;
    sv.value = withSpring(0.96, { mass: 0.3, stiffness: 400, damping: 30 });
    if (haptic !== 'none') runOnJS(fireHaptic)(haptic);
  };

  const handlePressOut = () => {
    sv.value = withSpring(1, { mass: 0.3, stiffness: 300, damping: 22, energyThreshold: 0.001 });
  };

  const vs = makeVariantStyles(colors)[variant];
  const ss = sizeStyles[size];

  return (
    <Animated.View style={[fullWidth && styles.fullWidth, animStyle, style]}>
      <Pressable
        onPress={isDisabled ? undefined : onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[
          styles.base,
          {
            backgroundColor: vs.bg,
            paddingVertical: ss.paddingVertical,
            paddingHorizontal: ss.paddingHorizontal,
            minHeight: ss.minHeight,
            borderRadius: 18,
            opacity: isDisabled ? 0.5 : 1,
            shadowColor: variant === 'primary' ? colors.rose : 'transparent',
            shadowOpacity: variant === 'primary' ? 0.2 : 0,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
            elevation: variant === 'primary' ? 3 : 0,
          },
          variant === 'ghost' && { borderWidth: 1, borderColor: colors.rose },
          fullWidth && styles.fullWidth,
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={vs.textColor} />
        ) : (
          <View style={styles.inner}>
            {icon && <View style={styles.iconWrap}>{icon}</View>}
            {(label || children) && (
              <Text
                style={[
                  typography.body,
                  { color: vs.textColor, fontSize: ss.fontSize, fontWeight: '700', letterSpacing: 0.1 },
                ]}
                numberOfLines={1}
              >
                {label ?? children}
              </Text>
            )}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  fullWidth: { width: '100%' },
  inner: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  iconWrap: { marginRight: 2 },
});
