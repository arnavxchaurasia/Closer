import * as Haptics from 'expo-haptics';
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
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [secure, setSecure] = useState(secureTextEntry);

  // Floating label animation
  const labelAnim = useRef(new Animated.Value(value ? 1 : 0)).current;
  // Border glow (JS driver — cannot use native driver on borderColor)
  const glowAnim = useRef(new Animated.Value(0)).current;

  const hasValue = value.length > 0;
  const floated = focused || hasValue;

  useEffect(() => {
    Animated.spring(labelAnim, {
      toValue: floated ? 1 : 0,
      useNativeDriver: true,
      damping: 18,
      stiffness: 200,
    }).start();
  }, [floated]);

  useEffect(() => {
    Animated.timing(glowAnim, {
      toValue: focused ? 1 : 0,
      duration: 200,
      useNativeDriver: false, // borderColor is not supported by native driver
    }).start();
  }, [focused]);

  const handleFocus = () => {
    setFocused(true);
    Haptics.selectionAsync().catch(() => {});
  };
  const handleBlur = () => setFocused(false);

  const borderColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [error ? colors.rose : colors.line, error ? colors.rose : colors.rose],
  });

  const labelTranslateY = labelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, label ? -22 : 0],
  });
  const labelScale = labelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.78],
  });
  const labelColor = focused ? colors.rose : error ? colors.rose : colors.muted;

  const showFloatingLabel = !!label && !multiline;

  return (
    <View style={[styles.container, multiline && { alignItems: 'stretch' }]}>
      <Animated.View
        style={[
          styles.inputWrap,
          {
            backgroundColor: 'rgba(255,255,255,0.06)',
            borderColor,
            borderWidth: focused ? 1.5 : 1,
            minHeight: multiline ? 80 : 52,
            paddingTop: showFloatingLabel && floated ? 18 : 0,
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

        {!showFloatingLabel && label && (
          <Text style={[styles.staticLabel, { color: colors.textSec }]}>{label}</Text>
        )}

        <TextInput
          style={[
            styles.input,
            { color: colors.text },
            icon ? styles.inputWithLeftIcon : null,
            (rightIcon || secureTextEntry) ? styles.inputWithRightIcon : null,
            multiline && styles.multiline,
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={showFloatingLabel && !floated ? undefined : placeholder}
          placeholderTextColor={colors.muted}
          secureTextEntry={secure}
          multiline={multiline}
          numberOfLines={multiline ? (numberOfLines ?? 4) : 1}
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
            onPress={() => setSecure(s => !s)}
            style={styles.rightIcon}
            hitSlop={8}
          >
            <Text style={{ fontSize: 13, color: colors.muted, fontWeight: '600' }}>{secure ? 'SHOW' : 'HIDE'}</Text>
          </Pressable>
        )}

        {!secureTextEntry && rightIcon && (
          <Pressable
            onPress={onRightIconPress}
            style={styles.rightIcon}
            hitSlop={8}
          >
            {rightIcon}
          </Pressable>
        )}
      </Animated.View>

      {error ? (
        <Text style={[styles.errorText, { color: colors.rose }]}>❌ {error}</Text>
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
    marginBottom: 2,
  },
  floatingLabel: {
    position: 'absolute',
    left: space.md,
    top: 16,
    fontSize: 15,
    fontWeight: '500',
    zIndex: 1,
    transformOrigin: 'left center',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
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
    marginTop: 2,
    fontWeight: '500',
  },
});
