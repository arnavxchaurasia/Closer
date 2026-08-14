import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/context/ThemeContext';

export default function VideoCallScreen() {
  const { roomId, mode } = useLocalSearchParams<{ roomId: string; mode?: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);

  const isVoiceOnly = mode === 'voice';

  // Jitsi room URL — deterministic based on couple's roomId
  const jitsiUrl = `https://meet.jit.si/${roomId}#config.startWithVideoMuted=${isVoiceOnly}&config.startWithAudioMuted=false&config.prejoinPageEnabled=false&config.toolbarButtons=["microphone","hangup"${isVoiceOnly ? '' : ',"camera"'}]&interfaceConfig.SHOW_JITSI_WATERMARK=false&interfaceConfig.SHOW_BRAND_WATERMARK=false`;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.8)' }}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={{ marginRight: 16 }}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>
            {isVoiceOnly ? '🎙️ Voice Call' : '📹 Video Call'}
          </Text>
        </View>

        {/* WebView */}
        <WebView
          source={{ uri: jitsiUrl }}
          style={{ flex: 1 }}
          onLoad={() => setLoading(false)}
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
          javaScriptEnabled
          domStorageEnabled
          mediaCapturePermissionGrantType="grant"
          onShouldStartLoadWithRequest={() => true}
        />

        {loading && (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' }]}>
            <ActivityIndicator color={colors.rose} size="large" />
            <Text style={{ color: '#fff', marginTop: 16, fontSize: 15 }}>
              {isVoiceOnly ? 'Starting voice call...' : 'Starting video call...'}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.5)', marginTop: 8, fontSize: 13 }}>
              Allow mic{isVoiceOnly ? '' : ' & camera'} when prompted
            </Text>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}
