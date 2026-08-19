import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardTypeOptions,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useTheme } from '@/src/context/ThemeContext';
import { radius, space } from '@/src/theme';

interface InputProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  secureTextEntry?: boolean;
  multiline?: boolean;
  error?: string;
  icon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  onRightIconPress?: () => void;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  editable?: boolean;
  numberOfLines?: number;
}

export function Input({
  label,
  placeholder,
  value,
  onChangeText,
  secureTextEntry = false,
  multiline = false,
  error,
  icon,
  rightIcon,
  onRightIconPress,
  keyboardType,
  autoCapitalize = 'sentences',
  editable = true,
  numberOfLines,
}: InputProps) {
  const { colors, isDark } = useTheme();
  const [focused, setFocused] = useState(false);
  const [secure, setSecure] = useState(secureTextEntry);

  // Floating label & glow animations
  const labelAnim = useRef(new Animated.Value(value ? 1 : 0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const focusScale = useRef(new Animated.Value(1)).current;

  const hasValue = value.length > 0;
  const floated = focused || hasValue;

  useEffect(() => {
    Animated.spring(labelAnim, {
      toValue: floated ? 1 : 0,
      useNativeDriver: true,
      damping: 20,
      stiffness: 220,
    }).start();
  }, [floated]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(glowAnim, {
        toValue: focused ? 1 : 0,
        duration: 200,
        useNativeDriver: false,
      }),
      Animated.spring(focusScale, {
        toValue: focused ? 1.015 : 1,
        useNativeDriver: true,
        damping: 16,
        stiffness: 240,
      }),
    ]).start();
  }, [focused]);

  const handleFocus = () => {
    setFocused(true);
    Haptics.selectionAsync().catch(() => {});
  };
  const handleBlur = () => setFocused(false);

  const borderColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [
      error ? colors.rose : isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
      error ? colors.rose : colors.rose,
    ],
  });

  const labelTranslateY = labelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, label ? -22 : 0],
  });
  const labelScale = labelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.78],
  });
  const labelColor = focused
    ? colors.rose
    : error
    ? colors.rose
    : colors.muted;

  const showFloatingLabel = !!label && !multiline;

  return (
    <View style={[styles.container, multiline && { alignItems: 'stretch' }]}>
      {!showFloatingLabel && label && (
        <Text style={[styles.staticLabel, { color: colors.textSec }]}>{label}</Text>
      )}

      <Animated.View
        style={[
          styles.inputWrap,
          {
            backgroundColor: isDark
              ? focused
                ? colors.surface2
                : colors.surface
              : focused
              ? 'rgba(255,255,255,0.95)'
              : colors.surface,
            borderColor,
            borderWidth: focused ? 1.5 : 1,
            minHeight: multiline ? 116 : 56,
            paddingTop: showFloatingLabel && floated ? 18 : 0,
            shadowColor: error ? colors.rose : colors.rose,
            shadowOpacity: focused ? 0.16 : 0,
            shadowRadius: focused ? 14 : 0,
            shadowOffset: { width: 0, height: 4 },
            elevation: focused ? 3 : 0,
            transform: [{ scale: focusScale }],
          },
          !editable && styles.disabled,
        ]}
      >
        {icon && <View style={styles.leftIcon}>{icon}</View>}

        {showFloatingLabel && (
          <Animated.Text
            style={[
              styles.floatingLabel,
              {
                color: labelColor,
                transform: [
                  { translateY: labelTranslateY },
                  { scale: labelScale },
                ],
              },
            ]}
            pointerEvents="none"
          >
            {label}
          </Animated.Text>
        )}

        <TextInput
          style={[
            styles.input,
            { color: colors.text },
            icon ? styles.inputWithLeftIcon : null,
            rightIcon || secureTextEntry ? styles.inputWithRightIcon : null,
            multiline && styles.multiline,
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={showFloatingLabel && !floated ? undefined : placeholder}
          placeholderTextColor={colors.muted}
          secureTextEntry={secure}
          multiline={multiline}
          numberOfLines={multiline ? numberOfLines ?? 4 : 1}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          editable={editable}
          onFocus={handleFocus}
          onBlur={handleBlur}
          selectionColor={colors.rose}
          cursorColor={colors.rose}
        />

        {secureTextEntry && (
          <Pressable
            onPress={() => {
              setSecure(s => !s);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            }}
            accessibilityRole="button"
            accessibilityLabel={secure ? 'Show password' : 'Hide password'}
            style={styles.rightIcon}
            hitSlop={12}
          >
            <Ionicons
              name={secure ? 'eye-outline' : 'eye-off-outline'}
              size={21}
              color={focused ? colors.rose : colors.muted}
            />
          </Pressable>
        )}

        {!secureTextEntry && rightIcon && (
          <Pressable onPress={onRightIconPress} style={styles.rightIcon} hitSlop={8}>
            {rightIcon}
          </Pressable>
        )}
      </Animated.View>

      {error ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle-outline" size={15} color={colors.rose} />
          <Text style={[styles.errorText, { color: colors.rose }]}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space.xs,
  },
  staticLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 4,
    marginLeft: 2,
  },
  floatingLabel: {
    position: 'absolute',
    left: space.md + 2,
    top: 16,
    fontSize: 15,
    fontWeight: '600',
    zIndex: 1,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.xl,
    position: 'relative',
  },
  disabled: {
    opacity: 0.5,
  },
  input: {
    flex: 1,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    fontSize: 15,
    fontWeight: '400',
  },
  inputWithLeftIcon: {
    paddingLeft: space.xs,
  },
  inputWithRightIcon: {
    paddingRight: space.xs,
  },
  multiline: {
    textAlignVertical: 'top',
    paddingTop: space.md,
  },
  leftIcon: {
    paddingLeft: space.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rightIcon: {
    paddingRight: space.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 12,
    fontWeight: '500',
  },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2, marginLeft: 2 },
});
