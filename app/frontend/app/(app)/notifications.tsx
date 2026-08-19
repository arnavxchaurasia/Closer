import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/src/api';
import { Press } from '@/src/components/Press';
import { useTheme } from '@/src/context/ThemeContext';
import { haptics } from '@/src/haptics';
import { radius, space } from '@/src/theme';

interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  created_at: string;
  read: boolean;
}

function getNotificationEmoji(title: string): string {
  const t = title.toLowerCase();
  if (t.includes('savings') || t.includes('money') || t.includes('contribut')) return '💰';
  if (t.includes('capsule') || t.includes('time')) return '⏳';
  if (t.includes('quiz') || t.includes('answer')) return '🏆';
  if (t.includes('check-in') || t.includes('weekly')) return '📝';
  if (t.includes('mood')) return '😊';
  if (t.includes('memory') || t.includes('photo')) return '📸';
  if (t.includes('milestone') || t.includes('anniversary')) return '🎉';
  return '🔔';
}

function getNotificationColor(title: string): string {
  const t = title.toLowerCase();
  if (t.includes('savings')) return '#10B981'; // Green
  if (t.includes('capsule')) return '#F59E0B'; // Amber
  if (t.includes('quiz')) return '#3B82F6'; // Blue
  if (t.includes('check-in')) return '#EC4899'; // Pink
  return '#8B5CF6'; // Purple
}

function fmtDate(iso: string): string {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const data = await api.get<Notification[]>('/api/notifications');
      setNotifications(Array.isArray(data) ? data : []);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const markAllRead = async () => {
    if (notifications.every(n => n.read)) return;
    haptics.medium();
    try {
      // Optimistically mark all read
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      await api.post('/api/notifications/read-all');
      haptics.success();
    } catch {
      load();
    }
  };

  return (
    <SafeAreaView style={[s.root, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={s.header}>
        <Press haptic="light" onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Press>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: colors.text }]}>Activity Feed 🔔</Text>
          <Text style={{ fontSize: 12, color: colors.muted }}>What's happening in your space</Text>
        </View>
        <Press haptic="light" onPress={markAllRead} style={s.readBtn}>
          <Text style={[s.readBtnText, { color: colors.rose }]}>Read all</Text>
        </Press>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.rose} size="large" />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={n => n.id}
          contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 120, gap: 12 }}>
              <Text style={{ fontSize: 64 }}>🔔</Text>
              <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>Feed is quiet</Text>
              <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 20 }}>
                When your partner logs updates or dispatches alerts,{'\n'}they will show up in this history feed.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const emoji = getNotificationEmoji(item.title);
            const badgeColor = getNotificationColor(item.title);
            return (
              <View style={[s.notiRow, { borderColor: colors.line, backgroundColor: item.read ? colors.surface : colors.surface }]}>
                {/* Badge Icon */}
                <View style={[s.badge, { backgroundColor: `${badgeColor}12` }]}>
                  <Text style={{ fontSize: 20 }}>{emoji}</Text>
                </View>

                {/* Text Content */}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={[s.notiTitle, { color: colors.text, fontWeight: item.read ? '600' : '800' }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={[s.notiTime, { color: colors.muted }]}>{fmtDate(item.created_at)}</Text>
                  </View>
                  <Text style={[s.notiBody, { color: colors.textSec }]}>{item.body}</Text>
                </View>

                {/* Unread indicator */}
                {!item.read && (
                  <View style={[s.unreadDot, { backgroundColor: colors.rose }]} />
                )}
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.1)' },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  readBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.md },
  readBtnText: { fontSize: 13, fontWeight: '700' },
  title: { fontSize: 18, fontWeight: '800' },
  notiRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: space.md, borderRadius: radius.xl, borderWidth: 1, gap: space.md },
  badge: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  notiTitle: { fontSize: 14, marginBottom: 2 },
  notiBody: { fontSize: 13, lineHeight: 18 },
  notiTime: { fontSize: 11 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 8 },
});
