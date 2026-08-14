import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/context/ThemeContext';
import { space } from '@/src/theme';
import { useRouter } from 'expo-router';
import { Press } from '@/src/components/Press';

export function NotConnected({ message = "You're not connected to a partner yet." }: { message?: string }) {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, backgroundColor: colors.bg }}>
      <Ionicons name="heart-dislike-outline" size={56} color={colors.muted} />
      <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginTop: space.lg, textAlign: 'center' }}>
        No partner connected
      </Text>
      <Text style={{ fontSize: 14, color: colors.textSec, marginTop: space.sm, textAlign: 'center' }}>
        {message}
      </Text>
      <Press
        onPress={() => router.push('/(app)/more')}
        style={{ marginTop: space.xl, backgroundColor: colors.rose, paddingHorizontal: space.xl, paddingVertical: space.md, borderRadius: 24 }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>Connect to a partner</Text>
      </Press>
    </View>
  );
}
