import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/src/components/Button';
import { useTheme } from '@/src/context/ThemeContext';
import { radius, space } from '@/src/theme';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface EmptyStateProps {
  icon: IoniconsName;
  title: string;
  body: string;
  action?: {
    label: string;
    onPress: () => void;
  };
}

export function EmptyState({ icon, title, body, action }: EmptyStateProps) {
  const { colors, typography } = useTheme();
  return (
    <View style={styles.container}>
      <View style={[styles.iconCircle, { backgroundColor: colors.roseDim }]}>
        <Ionicons name={icon} size={32} color={colors.rose} />
      </View>
      <Text style={[typography.h3, styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[typography.bodyMd, styles.body, { color: colors.muted }]}>{body}</Text>
      {action && (
        <Button
          variant="ghost"
          size="md"
          label={action.label}
          onPress={action.onPress}
          style={styles.action}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    paddingVertical: space.xxl,
    gap: space.md,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  title: {
    textAlign: 'center',
  },
  body: {
    textAlign: 'center',
    lineHeight: 20,
  },
  action: {
    marginTop: space.sm,
  },
});
