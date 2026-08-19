import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Easing, KeyboardAvoidingView, Platform, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/src/api';
import { NotConnected } from '@/src/components/NotConnected';
import { Press } from '@/src/components/Press';
import { useAuth } from '@/src/context/AuthContext';
import { useCouple } from '@/src/context/CoupleContext';
import { useTheme } from '@/src/context/ThemeContext';
import { haptics } from '@/src/haptics';
import { scheduleAvailabilityNotification } from '@/src/notificationRules';
import { Colors, radius, space } from '@/src/theme';

// ─── Availability Status Card ─────────────────────────────────────────────────
const AVAIL_STATUSES = [
  { key: 'available', label: 'Available',          icon: 'checkmark-circle-outline' as const, color: '#22C55E' },
  { key: 'busy',      label: 'Busy',               icon: 'time-outline' as const,             color: '#EF4444' },
  { key: 'focusing',  label: 'Focusing',           icon: 'eye-off-outline' as const,          color: '#4B7BF5' },
  { key: 'call',      label: 'Free for a call',    icon: 'call-outline' as const,             color: '#22C55E' },
  { key: 'date',      label: 'Free for a date ❤️', icon: 'heart-outline' as const,            color: '#E8607A' },
  { key: 'dnd',       label: 'Do not disturb',     icon: 'notifications-off-outline' as const, color: '#EF4444' },
] as const;
type AvailKey = typeof AVAIL_STATUSES[number]['key'];
const NOTIFY_WORTHY_AVAIL = new Set<AvailKey>(['available', 'call', 'date']);

function AvailabilityCard({ partnerName }: { partnerName: string }) {
  const { colors } = useTheme();
  const s = useStyles(colors);
  const [myStatus, setMyStatus] = useState<AvailKey>('available');
  const [partnerStatus, setPartnerStatus] = useState<AvailKey | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<{ my_status?: AvailKey; partner_status?: AvailKey }>('/api/availability')
      .then(r => {
        if (r.my_status) setMyStatus(r.my_status);
        if (r.partner_status) setPartnerStatus(r.partner_status);
      })
      .catch(() => {});
  }, []);

  const setStatus = async (key: AvailKey) => {
    if (key === myStatus) return;
    haptics.light();
    setSaving(true);
    try {
      await api.put('/api/availability', { status: key });
      setMyStatus(key);
      if (NOTIFY_WORTHY_AVAIL.has(key)) {
        scheduleAvailabilityNotification(() => {
          api.post('/api/notify/availability', { status: key }).catch(() => {});
        });
      }
    } catch {}
    finally { setSaving(false); }
  };

  const myMeta   = AVAIL_STATUSES.find(s => s.key === myStatus);
  const partMeta = partnerStatus ? AVAIL_STATUSES.find(s => s.key === partnerStatus) : null;

  return (
    <View style={s.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md, gap: space.sm }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.roseDim, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 18 }}>📡</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle}>Availability</Text>
          <Text style={s.cardSub}>Let your partner know you're around</Text>
        </View>
        {partMeta && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: partMeta.color + '20', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Ionicons name={partMeta.icon} size={12} color={partMeta.color} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: partMeta.color }}>{partnerName}</Text>
          </View>
        )}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {AVAIL_STATUSES.map(st => {
          const active = myStatus === st.key;
          return (
            <Press key={st.key} onPress={() => setStatus(st.key)} disabled={saving}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99,
                backgroundColor: active ? st.color + '22' : colors.surface2,
                borderWidth: active ? 1.5 : 1, borderColor: active ? st.color : colors.line }}>
              <Ionicons name={st.icon} size={14} color={active ? st.color : colors.muted} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: active ? st.color : colors.textSec }}>{st.label}</Text>
            </Press>
          );
        })}
      </View>
    </View>
  );
}

// ─── Types ───────────────────────────────────────────────────────────────────
type TrackInfo = { track: string; artist?: string; updated_at?: string } | null;
type WishInfo  = { text: string; updated_at?: string } | null;
type ActivityInfo = { type: string; title: string; updated_at?: string } | null;

type WeatherData = {
  temp_C?: string;
  weatherDesc?: { value: string }[];
  humidity?: string;
  FeelsLikeC?: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function timeAgo(iso?: string) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function weatherEmoji(desc?: string) {
  if (!desc) return '🌡️';
  const d = desc.toLowerCase();
  if (d.includes('sun') || d.includes('clear')) return '☀️';
  if (d.includes('cloud')) return '☁️';
  if (d.includes('rain') || d.includes('drizzle')) return '🌧️';
  if (d.includes('storm') || d.includes('thunder')) return '⛈️';
  if (d.includes('snow')) return '❄️';
  if (d.includes('fog') || d.includes('mist')) return '🌫️';
  if (d.includes('wind')) return '💨';
  return '🌡️';
}

async function fetchWeather(city: string): Promise<WeatherData | null> {
  try {
    const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
    const json = await res.json();
    const cur = json?.current_condition?.[0];
    if (!cur) return null;
    return {
      temp_C: cur.temp_C,
      weatherDesc: cur.weatherDesc,
      humidity: cur.humidity,
      FeelsLikeC: cur.FeelsLikeC,
    };
  } catch {
    return null;
  }
}

// ─── Pulsing Equalizer ────────────────────────────────────────────────────────
function Equalizer({ color }: { color: string }) {
  const bars = [useRef(new Animated.Value(0.3)).current, useRef(new Animated.Value(0.7)).current, useRef(new Animated.Value(0.5)).current];

  useEffect(() => {
    const anims = bars.map((bar, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(bar, { toValue: 1, duration: 400 + i * 120, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(bar, { toValue: 0.2, duration: 400 + i * 120, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ),
    );
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
  }, []);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 18, gap: 2 }}>
      {bars.map((bar, i) => (
        <Animated.View key={i} style={{ width: 3, height: 18, borderRadius: 2, backgroundColor: color, transform: [{ scaleY: bar }] }} />
      ))}
    </View>
  );
}

// ─── Section Label ────────────────────────────────────────────────────────────
function SectionLabel({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <Text style={{ fontSize: 10, fontWeight: '800', color: colors.muted, letterSpacing: 1.4, marginBottom: space.sm, marginTop: space.lg }}>
      {label}
    </Text>
  );
}

// ─── Card 1: Now Playing ─────────────────────────────────────────────────────
function NowPlayingCard({ myName, partnerName }: { myName: string; partnerName: string }) {
  const { colors } = useTheme();
  const s = useStyles(colors);

  const [myTrack, setMyTrack] = useState<TrackInfo>(null);
  const [partnerTrack, setPartnerTrack] = useState<TrackInfo>(null);
  const [trackInput, setTrackInput] = useState('');
  const [artistInput, setArtistInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ mine: TrackInfo; partner: TrackInfo }>('/api/connect/now-playing');
      setMyTrack(r.mine);
      setPartnerTrack(r.partner);
      if (r.mine) {
        setTrackInput(r.mine.track);
        setArtistInput(r.mine.artist ?? '');
      }
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!trackInput.trim()) return;
    haptics.light();
    setSubmitting(true);
    try {
      await api.post('/api/connect/now-playing', { track: trackInput.trim(), artist: artistInput.trim() || undefined });
      await load();
    } finally { setSubmitting(false); }
  };

  const clear = async () => {
    haptics.light();
    try {
      await api.del('/api/connect/now-playing');
      setMyTrack(null);
      setTrackInput('');
      setArtistInput('');
    } catch {}
  };

  return (
    <View style={s.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md, gap: space.sm }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.roseDim, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 18 }}>🎵</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle}>Now Playing</Text>
          <Text style={s.cardSub}>Share what you're listening to</Text>
        </View>
        {myTrack && <Equalizer color={colors.green} />}
      </View>

      {/* Partner row */}
      <View style={s.trackRow}>
        <Text style={s.trackLabel}>{partnerName}:</Text>
        {partnerTrack ? (
          <View style={{ flex: 1 }}>
            <Text style={s.trackTitle} numberOfLines={1}>{partnerTrack.track}</Text>
            {partnerTrack.artist && <Text style={s.trackArtist} numberOfLines={1}>{partnerTrack.artist}</Text>}
            <Text style={s.trackTime}>{timeAgo(partnerTrack.updated_at)}</Text>
          </View>
        ) : (
          <Text style={[s.trackArtist, { fontStyle: 'italic' }]}>Nothing playing</Text>
        )}
      </View>

      {/* My row */}
      <View style={[s.trackRow, { marginBottom: space.md }]}>
        <Text style={s.trackLabel}>You:</Text>
        {myTrack ? (
          <View style={{ flex: 1 }}>
            <Text style={s.trackTitle} numberOfLines={1}>{myTrack.track}</Text>
            {myTrack.artist && <Text style={s.trackArtist} numberOfLines={1}>{myTrack.artist}</Text>}
          </View>
        ) : (
          <Text style={[s.trackArtist, { fontStyle: 'italic', flex: 1 }]}>Not set</Text>
        )}
        {myTrack && (
          <Press onPress={clear}>
            <Text style={{ fontSize: 12, color: colors.muted, fontWeight: '600' }}>Clear</Text>
          </Press>
        )}
      </View>

      {/* Input */}
      <TextInput
        style={s.input}
        placeholder="Track name..."
        placeholderTextColor={colors.muted}
        value={trackInput}
        onChangeText={setTrackInput}
        returnKeyType="next"
      />
      <TextInput
        style={[s.input, { marginTop: 8 }]}
        placeholder="Artist (optional)..."
        placeholderTextColor={colors.muted}
        value={artistInput}
        onChangeText={setArtistInput}
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <Press onPress={submit} style={[s.btn, submitting && { opacity: 0.6 }]}>
        <Text style={s.btnTxt}>Share 🎵</Text>
      </Press>
    </View>
  );
}

// ─── Card 2: Weather ─────────────────────────────────────────────────────────
function WeatherCard({ myName, partnerName }: { myName: string; partnerName: string }) {
  const { colors } = useTheme();
  const s = useStyles(colors);

  const [myCity, setMyCity] = useState<string | null>(null);
  const [partnerCity, setPartnerCity] = useState<string | null>(null);
  const [myWeather, setMyWeather] = useState<WeatherData | null>(null);
  const [partnerWeather, setPartnerWeather] = useState<WeatherData | null>(null);
  const [cityInput, setCityInput] = useState('');
  const [settingCity, setSettingCity] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadWeather = useCallback(async (city: string, setW: (w: WeatherData | null) => void) => {
    const w = await fetchWeather(city);
    setW(w);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const me = await api.get<{ city?: string }>('/api/location/me');
      const partner = await api.get<{ city?: string }>('/api/location/partner');
      if (me.city) { setMyCity(me.city); loadWeather(me.city, setMyWeather); }
      if (partner.city) { setPartnerCity(partner.city); loadWeather(partner.city, setPartnerWeather); }
    } catch {}
  }, [loadWeather]);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh every 30 min
  useEffect(() => {
    const id = setInterval(() => { if (myCity) loadWeather(myCity, setMyWeather); if (partnerCity) loadWeather(partnerCity, setPartnerWeather); }, 30 * 60 * 1000);
    return () => clearInterval(id);
  }, [myCity, partnerCity, loadWeather]);

  const saveCity = async () => {
    if (!cityInput.trim()) return;
    setLoading(true);
    haptics.light();
    try {
      await api.post('/api/connect/city', { city: cityInput.trim() });
      setMyCity(cityInput.trim());
      await loadWeather(cityInput.trim(), setMyWeather);
      setSettingCity(false);
      setCityInput('');
    } finally { setLoading(false); }
  };

  const WeatherPanel = ({ city, weather, name }: { city: string | null; weather: WeatherData | null; name: string }) => (
    <View style={{ flex: 1, alignItems: 'center', paddingVertical: space.sm }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: colors.muted, marginBottom: 4 }}>{name.toUpperCase()}</Text>
      {city ? (
        <>
          <Text style={{ fontSize: 11, color: colors.textSec, fontWeight: '600', marginBottom: 6 }}>{city}</Text>
          {weather ? (
            <>
              <Text style={{ fontSize: 32 }}>{weatherEmoji(weather.weatherDesc?.[0]?.value)}</Text>
              <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 4 }}>{weather.temp_C}°C</Text>
              <Text style={{ fontSize: 11, color: colors.textSec, marginTop: 2 }}>{weather.weatherDesc?.[0]?.value}</Text>
              <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>Feels {weather.FeelsLikeC}°</Text>
            </>
          ) : (
            <Text style={{ fontSize: 13, color: colors.muted, marginTop: 8 }}>Loading...</Text>
          )}
        </>
      ) : (
        <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 8, lineHeight: 18 }}>No city set</Text>
      )}
    </View>
  );

  return (
    <View style={s.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md, gap: space.sm }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#E0F2FE', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 18 }}>🌤️</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle}>Weather</Text>
          <Text style={s.cardSub}>Your cities right now</Text>
        </View>
        <Press onPress={() => setSettingCity(v => !v)}>
          <Ionicons name="location-outline" size={18} color={colors.muted} />
        </Press>
      </View>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <WeatherPanel city={myCity} weather={myWeather} name="You" />
        <View style={{ width: 1, backgroundColor: colors.line }} />
        <WeatherPanel city={partnerCity} weather={partnerWeather} name={partnerName} />
      </View>

      {settingCity && (
        <View style={{ marginTop: space.md }}>
          <TextInput
            style={s.input}
            placeholder="Your city (e.g. London)"
            placeholderTextColor={colors.muted}
            value={cityInput}
            onChangeText={setCityInput}
            returnKeyType="done"
            onSubmitEditing={saveCity}
          />
          <Press onPress={saveCity} style={[s.btn, loading && { opacity: 0.6 }]}>
            <Text style={s.btnTxt}>Save City</Text>
          </Press>
        </View>
      )}
    </View>
  );
}

// ─── Card 3: Timezone Clock ───────────────────────────────────────────────────
function TimezoneCard({ partnerName }: { partnerName: string }) {
  const { colors } = useTheme();
  const s = useStyles(colors);
  const [myTime, setMyTime] = useState('');
  const [partnerTime, setPartnerTime] = useState('');
  const [partnerTz, setPartnerTz] = useState<string | null>(null);
  const [partnerCity, setPartnerCity] = useState<string | null>(null);
  const [dayDiff, setDayDiff] = useState<'same' | 'tomorrow' | 'yesterday'>('same');

  const myTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const showTimezone = !partnerTz || partnerTz !== myTz;

  const fmt = (tz: string) =>
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date());

  const update = useCallback(() => {
    setMyTime(fmt(myTz));
    if (partnerTz) {
      setPartnerTime(fmt(partnerTz));
      const myDate = new Date().toLocaleDateString('en-CA', { timeZone: myTz });
      const theirDate = new Date().toLocaleDateString('en-CA', { timeZone: partnerTz });
      if (theirDate > myDate) setDayDiff('tomorrow');
      else if (theirDate < myDate) setDayDiff('yesterday');
      else setDayDiff('same');
    }
  }, [myTz, partnerTz]);

  useEffect(() => {
    api.get<{ timezone?: string; city?: string }>('/api/location/partner')
      .then(r => { if (r.timezone) { setPartnerTz(r.timezone); setPartnerCity(r.city ?? null); } })
      .catch(() => {});
  }, []);

  useEffect(() => { update(); const id = setInterval(update, 60_000); return () => clearInterval(id); }, [update]);

  const partnerHour = partnerTz ? new Date().toLocaleString('en-US', { timeZone: partnerTz, hour: 'numeric', hour12: false }) : null;
  const goodTime = partnerHour ? (parseInt(partnerHour) >= 9 && parseInt(partnerHour) <= 22) : null;

  const ClockPanel = ({ time, label, sub }: { time: string; label: string; sub?: string }) => (
    <View style={{ flex: 1, alignItems: 'center', paddingVertical: space.sm }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: colors.muted, marginBottom: 4 }}>{label.toUpperCase()}</Text>
      {sub && <Text style={{ fontSize: 11, color: colors.textSec, fontWeight: '600', marginBottom: 4 }}>{sub}</Text>}
      <Text style={{ fontSize: 28, fontWeight: '900', color: colors.text, letterSpacing: -0.5 }}>{time || '--:--'}</Text>
      {dayDiff !== 'same' && label !== 'YOU' && (
        <View style={{ marginTop: 4, backgroundColor: colors.roseDim, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 }}>
          <Text style={{ fontSize: 10, color: colors.rose, fontWeight: '700' }}>{dayDiff === 'tomorrow' ? 'Tomorrow' : 'Yesterday'}</Text>
        </View>
      )}
    </View>
  );

  if (!showTimezone) return null;

  return (
    <View style={s.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md, gap: space.sm }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.goldDim, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 18 }}>🕐</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle}>Time Zones</Text>
          <Text style={s.cardSub}>Your clocks side by side</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <ClockPanel time={myTime} label="You" />
        <View style={{ width: 1, backgroundColor: colors.line }} />
        <ClockPanel time={partnerTime} label={partnerName} sub={partnerCity ?? undefined} />
      </View>

      {goodTime !== null && (
        <View style={{ marginTop: space.md, flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.line }}>
          <Text style={{ fontSize: 16 }}>{goodTime ? '✅' : '🌙'}</Text>
          <Text style={{ fontSize: 13, color: colors.textSec, fontWeight: '500', flex: 1 }}>
            {goodTime ? `Good time to call ${partnerName}` : `${partnerName} might be sleeping`}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Card 4: Wish ────────────────────────────────────────────────────────────
function WishCard({ myName, partnerName }: { myName: string; partnerName: string }) {
  const { colors } = useTheme();
  const s = useStyles(colors);
  const [myWish, setMyWish] = useState<WishInfo>(null);
  const [partnerWish, setPartnerWish] = useState<WishInfo>(null);
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ mine: WishInfo; partner: WishInfo }>('/api/connect/wish');
      setMyWish(r.mine);
      setPartnerWish(r.partner);
      if (r.mine) setInput(r.mine.text);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!input.trim()) return;
    haptics.light();
    setSubmitting(true);
    try {
      await api.post('/api/connect/wish', { text: input.trim() });
      await load();
    } finally { setSubmitting(false); }
  };

  return (
    <View style={s.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md, gap: space.sm }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 18 }}>💭</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle}>Right Now I Wish...</Text>
          <Text style={s.cardSub}>A spontaneous thought</Text>
        </View>
      </View>

      {partnerWish && (
        <View style={{ backgroundColor: colors.surface2, borderRadius: radius.md, padding: space.md, marginBottom: space.md, borderLeftWidth: 3, borderLeftColor: colors.rose }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.muted, marginBottom: 4 }}>{partnerName.toUpperCase()} IS WISHING...</Text>
          <Text style={{ fontSize: 15, color: colors.text, fontStyle: 'italic', lineHeight: 22 }}>"{partnerWish.text}"</Text>
          <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>{timeAgo(partnerWish.updated_at)}</Text>
        </View>
      )}

      <TextInput
        style={[s.input, { height: 72, textAlignVertical: 'top' }]}
        placeholder="Right now I wish..."
        placeholderTextColor={colors.muted}
        value={input}
        onChangeText={setInput}
        multiline
        numberOfLines={3}
      />
      <Press onPress={submit} style={[s.btn, submitting && { opacity: 0.6 }]}>
        <Text style={s.btnTxt}>Send to {partnerName} 💭</Text>
      </Press>
    </View>
  );
}

// ─── Card 5: Activity ────────────────────────────────────────────────────────
function ActivityCard({ myName, partnerName }: { myName: string; partnerName: string }) {
  const { colors } = useTheme();
  const s = useStyles(colors);
  const [myActivity, setMyActivity] = useState<ActivityInfo>(null);
  const [partnerActivity, setPartnerActivity] = useState<ActivityInfo>(null);
  const [type, setType] = useState<'game' | 'show'>('game');
  const [titleInput, setTitleInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ mine: ActivityInfo; partner: ActivityInfo }>('/api/connect/activity');
      setMyActivity(r.mine);
      setPartnerActivity(r.partner);
      if (r.mine) { setType(r.mine.type as 'game' | 'show'); setTitleInput(r.mine.title); }
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!titleInput.trim()) return;
    haptics.light();
    setSubmitting(true);
    try {
      await api.post('/api/connect/activity', { type, title: titleInput.trim() });
      await load();
    } finally { setSubmitting(false); }
  };

  const typeEmoji = (t?: string) => t === 'game' ? '🎮' : t === 'show' ? '📺' : '🎯';

  return (
    <View style={s.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md, gap: space.sm }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 18 }}>🎮</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle}>Currently Into</Text>
          <Text style={s.cardSub}>Game or show you're both into</Text>
        </View>
      </View>

      {/* Both activities side by side */}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: space.md }}>
        {[{ name: 'You', activity: myActivity }, { name: partnerName, activity: partnerActivity }].map(({ name, activity }) => (
          <View key={name} style={{ flex: 1, backgroundColor: colors.surface2, borderRadius: radius.md, padding: space.sm, alignItems: 'center' }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: colors.muted, marginBottom: 4 }}>{name.toUpperCase()}</Text>
            {activity ? (
              <>
                <Text style={{ fontSize: 20 }}>{typeEmoji(activity.type)}</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, textAlign: 'center', marginTop: 4 }} numberOfLines={2}>{activity.title}</Text>
                <Text style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>{activity.type}</Text>
              </>
            ) : (
              <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 4 }}>Nothing set</Text>
            )}
          </View>
        ))}
      </View>

      {/* Type toggle */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        {(['game', 'show'] as const).map(t => (
          <Press key={t} onPress={() => setType(t)} style={{ flex: 1, paddingVertical: 8, borderRadius: radius.md, alignItems: 'center', backgroundColor: type === t ? colors.roseDim : colors.surface2 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: type === t ? colors.rose : colors.muted }}>
              {t === 'game' ? '🎮 Game' : '📺 Show'}
            </Text>
          </Press>
        ))}
      </View>

      <TextInput
        style={s.input}
        placeholder={type === 'game' ? 'Game title...' : 'Show title...'}
        placeholderTextColor={colors.muted}
        value={titleInput}
        onChangeText={setTitleInput}
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <Press onPress={submit} style={[s.btn, submitting && { opacity: 0.6 }]}>
        <Text style={s.btnTxt}>Update</Text>
      </Press>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
function useStyles(c: Colors) {
  return useMemo(() => StyleSheet.create({
    card: {
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      padding: space.lg,
      marginBottom: space.md,
      borderWidth: 1,
      borderColor: c.line,
    },
    cardTitle: { fontSize: 16, fontWeight: '800', color: c.text },
    cardSub:   { fontSize: 12, color: c.muted, marginTop: 1 },
    input: {
      backgroundColor: c.surface2,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      paddingVertical: space.sm + 2,
      fontSize: 14,
      color: c.text,
      borderWidth: 1,
      borderColor: c.line,
    },
    btn: {
      marginTop: space.sm,
      backgroundColor: c.rose,
      borderRadius: radius.md,
      paddingVertical: space.sm + 2,
      alignItems: 'center',
    },
    btnTxt: { fontSize: 14, fontWeight: '700', color: '#fff' },
    trackRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      marginBottom: space.sm,
    },
    trackLabel: { fontSize: 12, fontWeight: '700', color: c.muted, width: 60 },
    trackTitle: { fontSize: 14, fontWeight: '700', color: c.text, flex: 1 },
    trackArtist: { fontSize: 12, color: c.textSec },
    trackTime: { fontSize: 11, color: c.muted, marginTop: 1 },
  }), [c]);
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ConnectScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { partner, isPaired, isLoading: coupleLoading } = useCouple();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const myName = user?.name?.split(' ')[0] ?? 'You';
  const partnerName = partner?.name?.split(' ')[0] ?? 'Partner';

  const onRefresh = async () => {
    setRefreshing(true);
    haptics.light();
    setRefreshKey(k => k + 1);
    setTimeout(() => setRefreshing(false), 800);
  };

  if (coupleLoading) return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={colors.rose} size="large" />
    </View>
  );
  if (!isPaired) return <NotConnected message="Connect with your partner to use the Connect board." />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.rose} />}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <LinearGradient
            colors={[colors.roseDim, 'transparent']}
            style={{ marginHorizontal: -space.lg, paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.md, marginBottom: space.md }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Press onPress={() => router.back()}>
                <Ionicons name="chevron-back" size={22} color={colors.rose} />
              </Press>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 28, fontWeight: '900', color: colors.text, letterSpacing: -0.8 }}>Connect 🔗</Text>
                <Text style={{ fontSize: 13, color: colors.textSec, fontWeight: '500', marginTop: 2 }}>Your world, together</Text>
              </View>
            </View>
          </LinearGradient>

          {/* Cards */}
          <AvailabilityCard key={`av-${refreshKey}`} partnerName={partnerName} />
          <NowPlayingCard key={`np-${refreshKey}`} myName={myName} partnerName={partnerName} />
          <WeatherCard key={`wx-${refreshKey}`} myName={myName} partnerName={partnerName} />
          <TimezoneCard key={`tz-${refreshKey}`} partnerName={partnerName} />
          <WishCard key={`w-${refreshKey}`} myName={myName} partnerName={partnerName} />
          <ActivityCard key={`ac-${refreshKey}`} myName={myName} partnerName={partnerName} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
