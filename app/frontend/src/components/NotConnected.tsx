import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/context/ThemeContext';
import { space, radius } from '@/src/theme';
import { useRouter } from 'expo-router';
import { Press } from '@/src/components/Press';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

export function NotConnected({ message = "You're not connected to a partner yet." }: { message?: string }) {
  const { colors } = useTheme();
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      {/* Top Header with Back Button */}
      <View style={[styles.header, { borderBottomColor: colors.line }]}>
        <Press haptic="light" onPress={() => (router.canGoBack() ? router.back() : router.replace('/' as any))} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Press>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Connect Partner</Text>
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl }}>
        <View style={{ position: 'relative', width: 120, height: 120, alignItems: 'center', justifyContent: 'center', marginBottom: space.lg }}>
          <View style={{ position: 'absolute', width: 110, height: 110, borderRadius: 55, backgroundColor: colors.roseDim, opacity: 0.6 }} />
          <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.rose + '44' }}>
            <Ionicons name="heart-dislike-outline" size={46} color={colors.rose} />
          </View>
        </View>

        <Text style={{ fontSize: 22, fontWeight: '900', color: colors.text, textAlign: 'center', letterSpacing: -0.5 }}>
          Partner Connection Required
        </Text>
        <Text style={{ fontSize: 14, color: colors.textSec, marginTop: space.xs, textAlign: 'center', lineHeight: 22, maxWidth: 300 }}>
          {message}
        </Text>

        <LinearGradient
          colors={['#F47B6A', '#C084FC']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ borderRadius: radius.xl, marginTop: space.xl, width: '100%', maxWidth: 320, overflow: 'hidden' }}
        >
          <Press
            haptic="medium"
            onPress={() => router.push('/(auth)/pair')}
            style={{ paddingVertical: 16, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 0.2 }}>Connect with Partner ✨</Text>
          </Press>
        </LinearGradient>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    gap: space.md,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800' },
});
