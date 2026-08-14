import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/src/api';
import { useCouple } from '@/src/context/CoupleContext';
import { useTheme } from '@/src/context/ThemeContext';
import { radius, space } from '@/src/theme';

export default function PairScreen() {
  const { colors } = useTheme();
  const { refresh } = useCouple();
  const [tab, setTab] = useState<'invite' | 'join'>('invite');
  const [code, setCode] = useState('');
  const [myCode, setMyCode] = useState('');
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [loadingJoin, setLoadingJoin] = useState(false);

  const createCode = async () => {
    setLoadingCreate(true);
    try {
      const res = await api.post<{ code: string }>('/api/pair/create');
      setMyCode(res.code);
    } catch (err: any) { Alert.alert('Error', err?.message ?? 'Could not create code.'); }
    finally { setLoadingCreate(false); }
  };

  const joinWithCode = async () => {
    if (code.trim().length < 4) { Alert.alert('Invalid code', 'Please enter the full invite code.'); return; }
    setLoadingJoin(true);
    try {
      await api.post('/api/pair/join', { code: code.trim().toUpperCase() });
      await refresh();
      router.replace('/(app)');
    } catch (err: any) { Alert.alert('Could not connect', err?.message ?? 'Check the code and try again.'); }
    finally { setLoadingJoin(false); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: space.lg, paddingBottom: 0 }}>
        <Text style={{ fontSize: 11, fontWeight: '800', color: colors.rose, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 }}>Almost there</Text>
        <Text style={{ fontSize: 30, fontWeight: '700', color: colors.text, letterSpacing: -0.5, marginBottom: 6 }}>Connect your person</Text>
        <Text style={{ fontSize: 15, color: colors.muted }}>Create a code or enter one from your partner.</Text>
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: 'row', margin: space.lg, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 4, gap: 4 }}>
        {(['invite', 'join'] as const).map(t => (
          <Pressable key={t} style={{ flex: 1, paddingVertical: space.sm, alignItems: 'center', borderRadius: radius.md, backgroundColor: tab === t ? colors.rose : 'transparent' }} onPress={() => setTab(t)}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: tab === t ? '#fff' : colors.muted }}>
              {t === 'invite' ? 'Invite partner' : 'Enter code'}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={{ flex: 1, paddingHorizontal: space.lg }}>
        {tab === 'invite' ? (
          <View style={{ alignItems: 'center', paddingTop: space.lg, gap: space.lg }}>
            {myCode ? (
              <View style={{ backgroundColor: colors.surface2, borderRadius: radius.xl, padding: space.xl, alignItems: 'center', width: '100%', borderWidth: 1, borderColor: colors.lineStr }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: colors.muted, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: space.sm }}>Your invite code</Text>
                <Text style={{ fontSize: 38, fontWeight: '900', color: colors.text, letterSpacing: 8, marginBottom: space.md }}>{myCode}</Text>
                <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center' }}>Share this with your partner. Expires in 30 minutes.</Text>
              </View>
            ) : (
              <>
                <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="heart-circle-outline" size={64} color={colors.rose} />
                </View>
                <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, textAlign: 'center' }}>Create a private invite code</Text>
                <Text style={{ fontSize: 14, color: colors.textSec, textAlign: 'center', paddingHorizontal: space.md }}>Your partner enters this code to connect with you.</Text>
              </>
            )}
            <Pressable style={{ backgroundColor: colors.rose, borderRadius: radius.lg, height: 56, alignItems: 'center', justifyContent: 'center', width: '100%', opacity: loadingCreate ? 0.6 : 1 }} onPress={createCode} disabled={loadingCreate}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{myCode ? 'Regenerate code' : (loadingCreate ? 'Generating…' : 'Create invite code')}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ alignItems: 'center', paddingTop: space.lg, gap: space.lg }}>
            <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="link-outline" size={64} color={colors.blue} />
            </View>
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, textAlign: 'center' }}>Enter your partner's code</Text>
            <TextInput
              style={{ backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStr, width: '100%', height: 64, textAlign: 'center', fontSize: 28, fontWeight: '700', color: colors.text, letterSpacing: 6 }}
              value={code} onChangeText={t => setCode(t.toUpperCase())}
              placeholder="A1B2C3" placeholderTextColor={colors.muted}
              autoCapitalize="characters" maxLength={8}
            />
            <Pressable style={{ backgroundColor: colors.rose, borderRadius: radius.lg, height: 56, alignItems: 'center', justifyContent: 'center', width: '100%', opacity: loadingJoin ? 0.6 : 1 }} onPress={joinWithCode} disabled={loadingJoin}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{loadingJoin ? 'Connecting…' : 'Connect'}</Text>
            </Pressable>
          </View>
        )}
      </View>

      <Pressable style={{ padding: space.xl, alignItems: 'center' }} onPress={() => router.replace('/(app)')}>
        <Text style={{ fontSize: 14, color: colors.muted }}>Set up later →</Text>
      </Pressable>
    </SafeAreaView>
  );
}
