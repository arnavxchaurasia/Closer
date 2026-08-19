import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { Alert, Image, Pressable, Share, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/src/api';
import { sonner } from '@/src/components/Sonner';
import { useCouple } from '@/src/context/CoupleContext';
import { useTheme } from '@/src/context/ThemeContext';
import { haptics } from '@/src/haptics';
import { radius, space } from '@/src/theme';

export default function PairScreen() {
  const { colors } = useTheme();
  const { refresh } = useCouple();
  const params = useLocalSearchParams<{ code?: string }>();

  const [tab, setTab] = useState<'invite' | 'join'>('invite');
  const [code, setCode] = useState('');
  const [myCode, setMyCode] = useState('');
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [loadingJoin, setLoadingJoin] = useState(false);

  // Auto-detect deep-linked pair code
  useEffect(() => {
    if (params.code) {
      const cleanCode = params.code.trim().toUpperCase();
      setCode(cleanCode);
      setTab('join');
      haptics.success();
      sonner.show('Invite code detected! ✨', 'Tap Connect below to link accounts.');
    }
  }, [params.code]);

  const createCode = async () => {
    setLoadingCreate(true);
    haptics.medium();
    try {
      const res = await api.post<{ code: string }>('/api/pair/create');
      setMyCode(res.code);
      haptics.success();
    } catch (err: any) {
      haptics.error();
      Alert.alert('Error', err?.message ?? 'Could not create code.');
    } finally {
      setLoadingCreate(false);
    }
  };

  const getShareableLink = (inviteCode: string) => {
    return `https://ourspace.app/pair?code=${inviteCode}`;
  };

  const shareInviteLink = async () => {
    if (!myCode) return;
    haptics.select();
    const link = getShareableLink(myCode);
    const message = `Connect with me on OurSpace 💕 Tap to pair automatically: ${link} (or enter code: ${myCode})`;
    try {
      await Share.share({
        message,
        url: link,
        title: 'Pair with me on OurSpace 💕',
      });
    } catch (err) {
      copyLink();
    }
  };

  const copyLink = async () => {
    if (!myCode) return;
    haptics.light();
    const link = getShareableLink(myCode);
    Clipboard.setStringAsync(link);
    sonner.show('Pairing link copied! 📋', 'Share it with your partner.');
  };

  const joinWithCode = async () => {
    if (code.trim().length < 4) {
      haptics.warning();
      Alert.alert('Invalid code', 'Please enter the full invite code.');
      return;
    }
    setLoadingJoin(true);
    haptics.medium();
    try {
      await api.post('/api/pair/join', { code: code.trim().toUpperCase() });
      await refresh();
      haptics.success();
      sonner.show('Connected! 💕', 'Welcome to your shared space.');
      router.replace('/(app)');
    } catch (err: any) {
      haptics.error();
      Alert.alert('Could not connect', err?.message ?? 'Check the code and try again.');
    } finally {
      setLoadingJoin(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: space.lg, paddingBottom: 0 }}>
        <Text style={{ fontSize: 11, fontWeight: '800', color: colors.rose, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 }}>
          Almost there
        </Text>
        <Text style={{ fontSize: 30, fontWeight: '700', color: colors.text, letterSpacing: -0.5, marginBottom: 6 }}>
          Connect your person
        </Text>
        <Text style={{ fontSize: 15, color: colors.muted }}>
          Create a shareable link/code or enter one from your partner.
        </Text>
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: 'row', margin: space.lg, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 4, gap: 4 }}>
        {(['invite', 'join'] as const).map(t => (
          <Pressable
            key={t}
            style={{
              flex: 1,
              paddingVertical: space.sm,
              alignItems: 'center',
              borderRadius: radius.md,
              backgroundColor: tab === t ? colors.rose : 'transparent',
            }}
            onPress={() => {
              haptics.select();
              setTab(t);
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: tab === t ? '#fff' : colors.muted }}>
              {t === 'invite' ? 'Invite partner' : 'Enter code'}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={{ flex: 1, paddingHorizontal: space.lg }}>
        {tab === 'invite' ? (
          <View style={{ alignItems: 'center', paddingTop: space.md, gap: space.md }}>
            {myCode ? (
              <View style={{ backgroundColor: colors.surface2, borderRadius: radius.xl, padding: space.lg, alignItems: 'center', width: '100%', borderWidth: 1, borderColor: colors.line }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: colors.muted, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 4 }}>
                  Your pairing link & code
                </Text>

                <Text style={{ fontSize: 36, fontWeight: '900', color: colors.text, letterSpacing: 6, marginVertical: 8 }}>
                  {myCode}
                </Text>

                <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center', marginBottom: space.md }}>
                  Expires in 30 minutes. Share the link below so your partner can pair in 1 tap!
                </Text>

                {/* Shareable Link Button Actions */}
                <View style={{ width: '100%', gap: space.xs }}>
                  <Pressable
                    style={{
                      backgroundColor: colors.rose,
                      borderRadius: radius.lg,
                      height: 52,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'row',
                      gap: 8,
                    }}
                    onPress={shareInviteLink}
                  >
                    <Ionicons name="share-social-outline" size={20} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>Share Invite Link 🔗</Text>
                  </Pressable>

                  <Pressable
                    style={{
                      backgroundColor: colors.surface,
                      borderRadius: radius.lg,
                      height: 44,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1,
                      borderColor: colors.line,
                      flexDirection: 'row',
                      gap: 6,
                    }}
                    onPress={copyLink}
                  >
                    <Ionicons name="copy-outline" size={16} color={colors.text} />
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>Copy Link to Clipboard</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <>
                <View style={{ width: 90, height: 90, borderRadius: 45, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="heart-circle-outline" size={56} color={colors.rose} />
                </View>
                <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, textAlign: 'center' }}>
                  Create a shareable invite link
                </Text>
                <Text style={{ fontSize: 14, color: colors.textSec, textAlign: 'center', paddingHorizontal: space.md, lineHeight: 20 }}>
                  Generate a private pairing link to send to your partner. When they tap it, their app automatically connects!
                </Text>
              </>
            )}

            <Pressable
              style={{
                backgroundColor: myCode ? colors.surface2 : colors.rose,
                borderRadius: radius.lg,
                height: 52,
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                opacity: loadingCreate ? 0.6 : 1,
                borderWidth: myCode ? 1 : 0,
                borderColor: colors.line,
              }}
              onPress={createCode}
              disabled={loadingCreate}
            >
              <Text style={{ color: myCode ? colors.text : '#fff', fontSize: 15, fontWeight: '700' }}>
                {myCode ? 'Regenerate Code 🔄' : loadingCreate ? 'Generating…' : 'Create Invite Link & Code'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ alignItems: 'center', paddingTop: space.md, gap: space.lg }}>
            <View style={{ width: 90, height: 90, borderRadius: 45, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="link-outline" size={56} color={colors.rose} />
            </View>
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, textAlign: 'center' }}>
              Enter your partner&apos;s code
            </Text>
            <TextInput
              style={{
                backgroundColor: colors.surface2,
                borderRadius: radius.xl,
                borderWidth: 1.5,
                borderColor: code.length >= 4 ? colors.rose : colors.line,
                width: '100%',
                height: 64,
                textAlign: 'center',
                fontSize: 28,
                fontWeight: '800',
                color: colors.text,
                letterSpacing: 6,
              }}
              value={code}
              onChangeText={t => setCode(t.toUpperCase())}
              placeholder="A1B2C3"
              placeholderTextColor={colors.muted}
              autoCapitalize="characters"
              maxLength={8}
            />
            <Pressable
              style={{
                backgroundColor: colors.rose,
                borderRadius: radius.lg,
                height: 54,
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                opacity: loadingJoin ? 0.6 : 1,
              }}
              onPress={joinWithCode}
              disabled={loadingJoin}
            >
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>
                {loadingJoin ? 'Connecting…' : 'Connect 💕'}
              </Text>
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
