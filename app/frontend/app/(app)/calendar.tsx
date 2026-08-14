/**
 * SoulSync – Calendar Screen
 * Google Calendar meets a couples app. Month / Week / Agenda views.
 */
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, Dimensions, Modal,
  PanResponder, Pressable, ScrollView, StyleSheet, Switch,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/src/api';
import { Button } from '@/src/components/Button';
import { HamburgerButton } from '@/src/components/Drawer';
import { Input } from '@/src/components/Input';
import { NotConnected } from '@/src/components/NotConnected';
import { useAuth } from '@/src/context/AuthContext';
import { useCouple } from '@/src/context/CoupleContext';
import { useTheme } from '@/src/context/ThemeContext';
import { haptics } from '@/src/haptics';
import { Colors, TAB_BAR_HEIGHT, radius, space } from '@/src/theme';

// ─── Types ───────────────────────────────────────────────────────────────────

type Category = 'date' | 'anniversary' | 'birthday' | 'trip' | 'reminder' | 'personal' | 'festival';

interface AssignedTask {
  id: string;
  title: string;
  due_date: string;
  assigned_by?: string;
}

interface PartnerMoodEntry {
  date: string;
  value: number;
}

interface CalEvent {
  id: string;
  title: string;
  start_dt: string;
  end_dt: string;
  all_day?: boolean;
  color?: string;
  category?: Category;
  visibility: string;
  owner_id: string;
  description?: string;
  notes?: string;
}

type ViewMode = 'month' | 'week' | 'agenda';

// ─── Constants ────────────────────────────────────────────────────────────────

const SCREEN_W = Dimensions.get('window').width;

const CATEGORIES: Record<string, { label: string; emoji: string; color: string }> = {
  date:        { label: 'Date Night',   emoji: '💕', color: '#E8607A' },
  anniversary: { label: 'Anniversary',  emoji: '💍', color: '#F59E0B' },
  birthday:    { label: 'Birthday',     emoji: '🎂', color: '#8B5CF6' },
  trip:        { label: 'Trip / Visit', emoji: '✈️', color: '#3B82F6' },
  reminder:    { label: 'Reminder',     emoji: '🔔', color: '#10B981' },
  personal:    { label: 'Personal',     emoji: '📝', color: '#6B7280' },
  festival:    { label: 'Festival',     emoji: '🎉', color: '#F97316' },
};

const FESTIVALS: Record<string, { name: string; emoji: string }[]> = {
  '2025-01-01': [{ name: "New Year's Day", emoji: '🎆' }],
  '2025-01-14': [{ name: 'Makar Sankranti', emoji: '🪁' }],
  '2025-01-26': [{ name: 'Republic Day', emoji: '🇮🇳' }],
  '2025-02-14': [{ name: "Valentine's Day", emoji: '💝' }],
  '2025-02-26': [{ name: 'Maha Shivratri', emoji: '🕉️' }],
  '2025-03-14': [{ name: 'Holi', emoji: '🌈' }],
  '2025-03-30': [{ name: 'Ram Navami', emoji: '🙏' }],
  '2025-04-14': [{ name: 'Baisakhi', emoji: '🌾' }],
  '2025-04-18': [{ name: 'Good Friday', emoji: '✝️' }],
  '2025-04-20': [{ name: 'Easter', emoji: '🐣' }],
  '2025-05-12': [{ name: "Mother's Day", emoji: '🌹' }],
  '2025-06-15': [{ name: "Father's Day", emoji: '👨' }],
  '2025-06-16': [{ name: 'Eid ul-Adha', emoji: '🌙' }],
  '2025-08-15': [{ name: 'Independence Day', emoji: '🇮🇳' }],
  '2025-08-16': [{ name: 'Janmashtami', emoji: '🦚' }],
  '2025-09-02': [{ name: 'Ganesh Chaturthi', emoji: '🐘' }],
  '2025-10-02': [{ name: 'Gandhi Jayanti', emoji: '🕊️' }, { name: 'Navratri begins', emoji: '🪔' }],
  '2025-10-20': [{ name: 'Dussehra', emoji: '🏹' }],
  '2025-11-05': [{ name: 'Diwali', emoji: '🪔' }],
  '2025-11-15': [{ name: 'Guru Nanak Jayanti', emoji: '🙏' }],
  '2025-12-25': [{ name: 'Christmas', emoji: '🎄' }],
  '2025-12-31': [{ name: "New Year's Eve", emoji: '🥂' }],
  '2026-01-01': [{ name: "New Year's Day", emoji: '🎆' }],
  '2026-02-14': [{ name: "Valentine's Day", emoji: '💝' }],
  '2026-03-03': [{ name: 'Holi', emoji: '🌈' }],
  '2026-08-15': [{ name: 'Independence Day', emoji: '🇮🇳' }],
  '2026-10-25': [{ name: 'Diwali', emoji: '🪔' }],
  '2026-12-25': [{ name: 'Christmas', emoji: '🎄' }],
};

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const HOUR_HEIGHT = 48;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseLocalDate(iso: string): Date {
  // Parse YYYY-MM-DD as local date (avoid UTC shift)
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // Mon=0 … Sun=6
}

function fmtTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function fmtDateLong(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function fmtDateMed(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function eventDateKey(e: CalEvent): string {
  return e.start_dt.slice(0, 10);
}

function categoryColor(e: CalEvent): string {
  if (e.category && CATEGORIES[e.category]) return CATEGORIES[e.category].color;
  return e.color ?? '#E8607A';
}

function categoryEmoji(e: CalEvent): string {
  if (e.category && CATEGORIES[e.category]) return CATEGORIES[e.category].emoji;
  return '📅';
}

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: Colors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    // Header
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: space.sm, gap: space.sm },
    monthTitle: { fontSize: 20, fontWeight: '700', color: c.text, flex: 1 },
    navBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.rose, alignItems: 'center', justifyContent: 'center' },
    todayBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.full, borderWidth: 1.5, borderColor: c.rose },
    todayBtnText: { fontSize: 12, fontWeight: '700', color: c.rose },
    // Segmented control
    segRow: { flexDirection: 'row', marginHorizontal: space.md, marginBottom: space.sm, backgroundColor: c.surface2, borderRadius: radius.full, padding: 3 },
    segBtn: { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: radius.full },
    segBtnActive: { backgroundColor: c.rose },
    segBtnText: { fontSize: 13, fontWeight: '600', color: c.muted },
    segBtnTextActive: { color: '#fff' },
    // Month grid
    dayLabels: { flexDirection: 'row', paddingHorizontal: space.md, marginBottom: 4 },
    dayLabel: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: c.muted },
    dayLabelWknd: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: c.muted, opacity: 0.6 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: space.md },
    cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 5, minHeight: 56 },
    dayCircle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    dayCircleToday: { backgroundColor: c.rose },
    dayCircleSel: { borderWidth: 2, borderColor: c.rose },
    dayText: { fontSize: 13, fontWeight: '500', color: c.text },
    dayTextToday: { color: '#fff', fontWeight: '700' },
    dayTextPast: { opacity: 0.4 },
    festivalDot: { fontSize: 9, marginTop: 1, lineHeight: 11 },
    dots: { flexDirection: 'row', gap: 2, marginTop: 2, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 40 },
    dot: { width: 5, height: 5, borderRadius: 2.5 },
    moreText: { fontSize: 9, color: c.muted, marginTop: 1 },
    // Day bottom sheet
    sheetBg: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 20 },
    sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.muted, alignSelf: 'center', marginTop: 10, marginBottom: 4, opacity: 0.4 },
    sheetDateHeader: { fontSize: 16, fontWeight: '700', color: c.text, paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm },
    festivalBadge: { marginHorizontal: space.lg, marginBottom: space.sm, backgroundColor: 'rgba(249,115,22,0.12)', borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    festivalBadgeText: { fontSize: 12, color: '#F97316', fontWeight: '600' },
    sheetEvt: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: 10, gap: 12 },
    sheetEvtDot: { width: 10, height: 10, borderRadius: 5 },
    sheetEvtTitle: { fontSize: 15, fontWeight: '600', color: c.text, flex: 1 },
    sheetEvtTime: { fontSize: 12, color: c.muted },
    sheetEmpty: { alignItems: 'center', paddingVertical: space.xl },
    sheetEmptyText: { fontSize: 14, color: c.muted, marginTop: 8 },
    sheetAddBtn: { marginHorizontal: space.lg, marginTop: space.sm, marginBottom: space.lg, backgroundColor: c.roseDim, borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
    sheetAddBtnText: { fontSize: 15, fontWeight: '700', color: c.rose },
    // Week view
    weekHeader: { flexDirection: 'row', paddingHorizontal: space.md, marginBottom: 4 },
    weekDayCol: { flex: 1, alignItems: 'center' },
    weekDayLabel: { fontSize: 11, fontWeight: '600', color: c.muted },
    weekDayNum: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
    weekDayNumToday: { backgroundColor: c.rose },
    weekDayNumText: { fontSize: 14, fontWeight: '600', color: c.text },
    weekDayNumTextToday: { color: '#fff' },
    weekScroll: { flex: 1 },
    weekRow: { flexDirection: 'row', height: HOUR_HEIGHT },
    weekTimeLabel: { width: 48, alignItems: 'flex-end', paddingRight: 8, paddingTop: 0 },
    weekTimeLabelText: { fontSize: 10, color: c.muted },
    weekCol: { flex: 1, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: c.line },
    weekHourLine: { position: 'absolute', left: 48, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: c.line },
    weekNowLine: { position: 'absolute', left: 42, right: 0, height: 2, backgroundColor: c.rose, zIndex: 10 },
    weekNowDot: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: c.rose, left: 38, marginTop: -3, zIndex: 11 },
    weekEvt: { position: 'absolute', left: 2, right: 2, borderRadius: 6, padding: 4, zIndex: 5 },
    weekEvtTitle: { fontSize: 10, fontWeight: '600', color: '#fff' },
    weekEvtTime: { fontSize: 9, color: 'rgba(255,255,255,0.8)' },
    // Agenda view
    agendaScroll: { flex: 1 },
    agendaDateHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: 6 },
    agendaDateDay: { fontSize: 13, fontWeight: '700', color: c.textSec },
    agendaDateFestival: { fontSize: 12, color: '#F97316', marginLeft: 6, fontWeight: '500' },
    agendaEvt: { flexDirection: 'row', marginHorizontal: space.md, marginBottom: 8, backgroundColor: c.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: c.line, overflow: 'hidden' },
    agendaEvtBar: { width: 4 },
    agendaEvtContent: { flex: 1, padding: 12 },
    agendaEvtHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    agendaEvtEmoji: { fontSize: 14 },
    agendaEvtTitle: { fontSize: 15, fontWeight: '600', color: c.text, flex: 1 },
    agendaEvtTime: { fontSize: 12, color: c.muted, marginTop: 2 },
    agendaEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
    agendaEmptyText: { fontSize: 15, color: c.muted, marginTop: 12 },
    // Add event modal
    modalBg: { flex: 1, backgroundColor: c.bg },
    modalHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line },
    modalTitle: { fontSize: 18, fontWeight: '700', color: c.text, flex: 1 },
    titleInput: { fontSize: 22, fontWeight: '700', color: c.text, paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line },
    fLabel: { fontSize: 11, fontWeight: '700', color: c.textSec, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6 },
    fInput: { backgroundColor: c.surface2, borderRadius: radius.md, height: 44, paddingHorizontal: space.md, color: c.text, fontSize: 15, borderWidth: 1, borderColor: c.line },
    fSection: { paddingHorizontal: space.lg, paddingVertical: space.sm },
    catChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1.5, marginRight: 8 },
    catChipText: { fontSize: 12, fontWeight: '600' },
    notesInput: { backgroundColor: c.surface2, borderRadius: radius.md, padding: space.md, color: c.text, fontSize: 14, borderWidth: 1, borderColor: c.line, minHeight: 80, textAlignVertical: 'top' },
    saveBtn: { backgroundColor: c.rose, borderRadius: radius.lg, height: 54, alignItems: 'center', justifyContent: 'center', marginHorizontal: space.lg, marginTop: space.md },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  });
}

// ─── Day Bottom Sheet ─────────────────────────────────────────────────────────

interface BottomSheetProps {
  visible: boolean;
  date: Date;
  events: CalEvent[];
  festivals: { name: string; emoji: string }[];
  assignedTasks: AssignedTask[];
  partnerMood: number | null;
  onClose: () => void;
  onAdd: () => void;
  onEventPress: (e: CalEvent) => void;
  s: ReturnType<typeof makeStyles>;
  colors: Colors;
}

function DayBottomSheet({ visible, date, events, festivals, assignedTasks, partnerMood, onClose, onAdd, onEventPress, s, colors }: BottomSheetProps) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      damping: 20,
      stiffness: 200,
    }).start();
  }, [visible]);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [400, 0] });
  const opacity = anim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.4, 1] });

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents={visible ? 'auto' : 'none'}>
      {/* Backdrop */}
      <Animated.View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: '#000', opacity }} >
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[s.sheetBg, { transform: [{ translateY }], maxHeight: '65%' }]}>
        <View style={s.sheetHandle} />
        <Text style={s.sheetDateHeader}>{fmtDateLong(date)}</Text>

        {festivals.length > 0 && (
          <View style={s.festivalBadge}>
            {festivals.map((f, i) => (
              <Text key={i} style={s.festivalBadgeText}>{f.emoji} {f.name}</Text>
            ))}
          </View>
        )}

        <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
          {events.length === 0 && assignedTasks.length === 0 ? (
            <View style={s.sheetEmpty}>
              <Text style={{ fontSize: 32 }}>🗓️</Text>
              <Text style={s.sheetEmptyText}>Nothing planned</Text>
            </View>
          ) : (
            <>
              {events.map(e => (
                <TouchableOpacity key={e.id} style={s.sheetEvt} onPress={() => onEventPress(e)} activeOpacity={0.7}>
                  <View style={[s.sheetEvtDot, { backgroundColor: categoryColor(e) }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.sheetEvtTitle}>{categoryEmoji(e)} {e.title}</Text>
                  </View>
                  {!e.all_day && <Text style={s.sheetEvtTime}>{fmtTime(e.start_dt)}</Text>}
                </TouchableOpacity>
              ))}
              {assignedTasks.length > 0 && (
                <View style={{ marginHorizontal: 20, marginTop: 12 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#10B981', marginBottom: 6 }}>ASSIGNED TO YOU</Text>
                  {assignedTasks.map(t => (
                    <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
                      <Ionicons name="checkbox-outline" size={14} color="#10B981" />
                      <Text style={{ fontSize: 14, color: colors.text }}>{t.title}</Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
          {partnerMood !== null && (
            <View style={{ marginHorizontal: 20, marginTop: 8, marginBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted }}>PARTNER'S MOOD</Text>
              <Text style={{ fontSize: 14, color: colors.text }}>
                {partnerMood >= 8 ? '😄' : partnerMood >= 6 ? '🙂' : partnerMood >= 4 ? '😐' : '😕'} {partnerMood}/10
              </Text>
            </View>
          )}
        </ScrollView>

        <TouchableOpacity style={s.sheetAddBtn} onPress={onAdd} activeOpacity={0.8}>
          <Ionicons name="add-circle-outline" size={18} color={colors.rose} />
          <Text style={s.sheetAddBtnText}>Add event</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ─── Month View ───────────────────────────────────────────────────────────────

interface MonthViewProps {
  viewDate: Date;
  selected: Date | null;
  eventsByDate: Record<string, CalEvent[]>;
  tasksByDate: Record<string, AssignedTask[]>;
  partnerMoodByDate: Record<string, number>;
  onDayPress: (d: Date) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  slideAnim: Animated.Value;
  s: ReturnType<typeof makeStyles>;
  colors: Colors;
  getFestivalsForDate: (dateKey: string) => { name: string; emoji: string }[];
}

function MonthView({ viewDate, selected, eventsByDate, tasksByDate, partnerMoodByDate, onDayPress, onPrevMonth, onNextMonth, slideAnim, s, colors, getFestivalsForDate }: MonthViewProps) {
  const today = new Date();
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const cells = useMemo(() => {
    const firstDay = getFirstDayOfMonth(year, month);
    const total = getDaysInMonth(year, month);
    const arr: (number | null)[] = Array(firstDay).fill(null);
    for (let i = 1; i <= total; i++) arr.push(i);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [year, month]);

  return (
    <Animated.View style={{ transform: [{ translateX: slideAnim }] }}>
      {/* Day-of-week labels */}
      <View style={s.dayLabels}>
        {DAYS_SHORT.map((d, i) => (
          <Text key={d} style={i >= 5 ? s.dayLabelWknd : s.dayLabel}>{d}</Text>
        ))}
      </View>

      {/* Grid */}
      <View style={s.grid}>
        {cells.map((day, idx) => {
          if (!day) return <View key={`e-${idx}`} style={s.cell} />;

          const cellDate = new Date(year, month, day);
          const isToday = isSameDay(cellDate, today);
          const isSel = selected ? isSameDay(cellDate, selected) : false;
          const isPast = cellDate < today && !isToday;
          const key = toDateKey(cellDate);
          const dayEvents = eventsByDate[key] ?? [];
          const dayTasks = tasksByDate[key] ?? [];
          const partnerMood = partnerMoodByDate[key];
          const festivals = getFestivalsForDate(key);
          const displayDots = dayEvents.slice(0, 3);
          const extra = dayEvents.length - 3;

          return (
            <TouchableOpacity key={day} style={s.cell} onPress={() => onDayPress(cellDate)} activeOpacity={0.7}>
              <View style={[
                s.dayCircle,
                isToday && s.dayCircleToday,
                !isToday && isSel && s.dayCircleSel,
              ]}>
                <Text style={[
                  s.dayText,
                  isToday && s.dayTextToday,
                  isPast && !isSel && s.dayTextPast,
                  !isToday && isSel && { color: colors.rose, fontWeight: '700' },
                ]}>{day}</Text>
              </View>

              {/* Festival emoji */}
              {festivals.length > 0 && (
                <Text style={s.festivalDot}>{festivals[0].emoji}</Text>
              )}

              {/* Event dots + task squares + mood dot */}
              {(displayDots.length > 0 || dayTasks.length > 0 || partnerMood !== undefined) && (
                <View style={s.dots}>
                  {displayDots.map((e, di) => (
                    <View key={di} style={[s.dot, { backgroundColor: categoryColor(e) }]} />
                  ))}
                  {dayTasks.length > 0 && (
                    <View style={{ width: 5, height: 5, borderRadius: 1, backgroundColor: '#10B981' }} />
                  )}
                  {partnerMood !== undefined && (
                    <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: partnerMood >= 7 ? '#FB7185' : partnerMood >= 4 ? '#F59E0B' : '#60A5FA' }} />
                  )}
                </View>
              )}
              {extra > 0 && <Text style={s.moreText}>+{extra}</Text>}
            </TouchableOpacity>
          );
        })}
      </View>
    </Animated.View>
  );
}

// ─── Week View ────────────────────────────────────────────────────────────────

interface WeekViewProps {
  weekStart: Date;
  eventsByDate: Record<string, CalEvent[]>;
  s: ReturnType<typeof makeStyles>;
  colors: Colors;
  onEventPress: (e: CalEvent) => void;
}

function WeekView({ weekStart, eventsByDate, s, colors, onEventPress }: WeekViewProps) {
  const scrollRef = useRef<ScrollView>(null);
  const today = new Date();

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const hours = Array.from({ length: 18 }, (_, i) => i + 6); // 6am – 11pm

  const nowMinutes = today.getHours() * 60 + today.getMinutes();
  const nowTop = ((nowMinutes - 6 * 60) / 60) * HOUR_HEIGHT;
  const showNow = nowMinutes >= 6 * 60 && nowMinutes <= 23 * 60;

  useEffect(() => {
    // Scroll to current time
    const offset = Math.max(0, nowTop - 100);
    setTimeout(() => scrollRef.current?.scrollTo({ y: offset, animated: false }), 100);
  }, []);

  return (
    <View style={{ flex: 1 }}>
      {/* Week day header */}
      <View style={[s.weekHeader, { paddingLeft: 48 }]}>
        {weekDays.map((d, i) => {
          const isToday = isSameDay(d, today);
          return (
            <View key={i} style={s.weekDayCol}>
              <Text style={s.weekDayLabel}>{DAYS_SHORT[i]}</Text>
              <View style={[s.weekDayNum, isToday && s.weekDayNumToday]}>
                <Text style={[s.weekDayNumText, isToday && s.weekDayNumTextToday]}>{d.getDate()}</Text>
              </View>
            </View>
          );
        })}
      </View>

      <ScrollView ref={scrollRef} style={s.weekScroll} showsVerticalScrollIndicator={false}>
        <View style={{ position: 'relative' }}>
          {/* Hour rows */}
          {hours.map(h => (
            <View key={h} style={s.weekRow}>
              <View style={s.weekTimeLabel}>
                <Text style={s.weekTimeLabelText}>{h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`}</Text>
              </View>
              {weekDays.map((_, i) => (
                <View key={i} style={s.weekCol} />
              ))}
              <View style={[s.weekHourLine, { top: 0 }]} />
            </View>
          ))}

          {/* Events overlaid */}
          {weekDays.map((d, colIdx) => {
            const key = toDateKey(d);
            const dayEvts = eventsByDate[key] ?? [];
            return dayEvts.map(e => {
              const startDate = new Date(e.start_dt);
              const endDate = new Date(e.end_dt);
              const startMins = startDate.getHours() * 60 + startDate.getMinutes();
              const endMins = endDate.getHours() * 60 + endDate.getMinutes();
              const top = ((startMins - 6 * 60) / 60) * HOUR_HEIGHT;
              const height = Math.max(((endMins - startMins) / 60) * HOUR_HEIGHT, 24);
              const colW = (SCREEN_W - 48) / 7;
              const left = 48 + colIdx * colW + 1;

              return (
                <TouchableOpacity
                  key={e.id}
                  style={[s.weekEvt, { top, height, left, width: colW - 3, backgroundColor: categoryColor(e) }]}
                  onPress={() => onEventPress(e)}
                  activeOpacity={0.8}
                >
                  <Text style={s.weekEvtTitle} numberOfLines={1}>{e.title}</Text>
                  {height > 28 && <Text style={s.weekEvtTime}>{fmtTime(e.start_dt)}</Text>}
                </TouchableOpacity>
              );
            });
          })}

          {/* Current time line */}
          {showNow && (
            <>
              <View style={[s.weekNowLine, { top: nowTop }]} />
              <View style={[s.weekNowDot, { top: nowTop }]} />
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Agenda View ──────────────────────────────────────────────────────────────

interface AgendaViewProps {
  eventsByDate: Record<string, CalEvent[]>;
  onAdd: () => void;
  onEventPress: (e: CalEvent) => void;
  s: ReturnType<typeof makeStyles>;
  colors: Colors;
  getFestivalsForDate: (dateKey: string) => { name: string; emoji: string }[];
}

function AgendaView({ eventsByDate, onAdd, onEventPress, s, colors, getFestivalsForDate }: AgendaViewProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build next 60 days that have events or festivals
  const days = useMemo(() => {
    const result: { date: Date; key: string; events: CalEvent[]; festivals: { name: string; emoji: string }[] }[] = [];
    for (let i = 0; i < 60; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const key = toDateKey(d);
      const dayEvents = eventsByDate[key] ?? [];
      const festivals = getFestivalsForDate(key);
      if (dayEvents.length > 0 || festivals.length > 0) {
        result.push({ date: d, key, events: dayEvents, festivals });
      }
    }
    return result;
  }, [eventsByDate]);

  if (days.length === 0) {
    return (
      <View style={s.agendaEmpty}>
        <Text style={{ fontSize: 48 }}>🗓️</Text>
        <Text style={[s.agendaEmptyText, { fontWeight: '700', color: colors.text, marginTop: 16 }]}>Nothing coming up</Text>
        <Text style={s.agendaEmptyText}>Plan your next date, trip, or moment.</Text>
        <TouchableOpacity
          style={[s.saveBtn, { marginTop: space.lg, paddingHorizontal: space.xl }]}
          onPress={onAdd} activeOpacity={0.8}
        >
          <Text style={s.saveBtnText}>Add event</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={s.agendaScroll} contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + space.xl }}>
      {days.map(({ date, events, festivals }) => (
        <View key={toDateKey(date)}>
          {/* Date header */}
          <View style={s.agendaDateHeader}>
            <Text style={s.agendaDateDay}>{fmtDateMed(date)}</Text>
            {festivals.map((f, i) => (
              <Text key={i} style={s.agendaDateFestival}>{f.emoji} {f.name}</Text>
            ))}
          </View>

          {/* Festival row (if any but no events) */}
          {events.length === 0 && festivals.length > 0 && (
            <View style={[s.agendaEvt, { marginBottom: 8 }]}>
              <View style={[s.agendaEvtBar, { backgroundColor: '#F97316' }]} />
              <View style={s.agendaEvtContent}>
                <Text style={s.agendaEvtTitle}>{festivals.map(f => `${f.emoji} ${f.name}`).join(' · ')}</Text>
              </View>
            </View>
          )}

          {/* Events */}
          {events.map(e => (
            <TouchableOpacity key={e.id} style={s.agendaEvt} onPress={() => onEventPress(e)} activeOpacity={0.7}>
              <View style={[s.agendaEvtBar, { backgroundColor: categoryColor(e) }]} />
              <View style={s.agendaEvtContent}>
                <View style={s.agendaEvtHeader}>
                  <Text style={s.agendaEvtEmoji}>{categoryEmoji(e)}</Text>
                  <Text style={s.agendaEvtTitle}>{e.title}</Text>
                </View>
                {!e.all_day && (
                  <Text style={s.agendaEvtTime}>{fmtTime(e.start_dt)} — {fmtTime(e.end_dt)}</Text>
                )}
                {e.all_day && <Text style={s.agendaEvtTime}>All day</Text>}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

// ─── Add Event Modal ──────────────────────────────────────────────────────────

interface AddEventModalProps {
  visible: boolean;
  initialDate: Date;
  onClose: () => void;
  onSaved: () => void;
  colors: Colors;
  s: ReturnType<typeof makeStyles>;
}

function AddEventModal({ visible, initialDate, onClose, onSaved, colors, s }: AddEventModalProps) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string>('date');
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('09:00');
  const [endTimeStr, setEndTimeStr] = useState('10:00');
  const [allDay, setAllDay] = useState(false);
  const [notes, setNotes] = useState('');
  const [recurrence, setRecurrence] = useState<string>('none');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setTitle('');
      setCategory('date');
      setDateStr(toDateKey(initialDate));
      setTimeStr('09:00');
      setEndTimeStr('10:00');
      setAllDay(false);
      setNotes('');
      setRecurrence('none');
    }
  }, [visible, initialDate]);

  const save = async () => {
    if (!title.trim()) { Alert.alert('Title required'); return; }
    setSaving(true);
    try {
      const body = {
        title: title.trim(),
        category,
        start_dt: allDay ? `${dateStr}T00:00:00Z` : `${dateStr}T${timeStr}:00Z`,
        end_dt: allDay ? `${dateStr}T23:59:00Z` : `${dateStr}T${endTimeStr}:00Z`,
        all_day: allDay,
        description: notes || undefined,
        color: CATEGORIES[category]?.color,
        visibility: 'partner',
        recurrence,
      };
      await api.post('/api/events', body);
      haptics.success();
      onSaved();
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not save event');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.modalBg} edges={['top']}>
        {/* Header */}
        <View style={s.modalHeader}>
          <Text style={s.modalTitle}>New event</Text>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={24} color={colors.muted} />
          </TouchableOpacity>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Title */}
          <TextInput
            style={s.titleInput}
            placeholder="Event title"
            placeholderTextColor={colors.muted}
            value={title}
            onChangeText={setTitle}
            autoFocus
          />

          {/* Category */}
          <View style={s.fSection}>
            <Text style={s.fLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', paddingBottom: 4 }}>
                {Object.entries(CATEGORIES).map(([key, cat]) => {
                  const active = category === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[s.catChip, { borderColor: active ? cat.color : colors.line, backgroundColor: active ? cat.color + '22' : 'transparent' }]}
                      onPress={() => setCategory(key)}
                      activeOpacity={0.7}
                    >
                      <Text>{cat.emoji}</Text>
                      <Text style={[s.catChipText, { color: active ? cat.color : colors.textSec }]}>{cat.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </View>

          {/* Date */}
          <View style={s.fSection}>
            <Input
              label="Date (YYYY-MM-DD)"
              value={dateStr}
              onChangeText={setDateStr}
              keyboardType="numbers-and-punctuation"
            />
          </View>

          {/* All day toggle */}
          <View style={[s.fSection, s.rowBetween]}>
            <Text style={[s.fLabel, { marginBottom: 0 }]}>All day</Text>
            <Switch
              value={allDay}
              onValueChange={setAllDay}
              trackColor={{ false: colors.line, true: colors.rose }}
              thumbColor="#fff"
            />
          </View>

          {/* Time */}
          {!allDay && (
            <View style={[s.fSection, { flexDirection: 'row', gap: space.md }]}>
              <View style={{ flex: 1 }}>
                <Input
                  label="Start (HH:MM)"
                  value={timeStr}
                  onChangeText={setTimeStr}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Input
                  label="End (HH:MM)"
                  value={endTimeStr}
                  onChangeText={setEndTimeStr}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </View>
          )}

          {/* Recurrence */}
          <View style={s.fSection}>
            <Text style={s.fLabel}>Repeat</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {[
                { label: 'Do not repeat', value: 'none' },
                { label: 'Daily', value: 'daily' },
                { label: 'Weekly', value: 'weekly' },
                { label: 'Monthly', value: 'monthly' },
                { label: 'Yearly', value: 'yearly' },
              ].map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: radius.full,
                    borderWidth: 1.5,
                    borderColor: recurrence === opt.value ? colors.rose : colors.line,
                    backgroundColor: recurrence === opt.value ? colors.roseDim : 'transparent'
                  }}
                  onPress={() => setRecurrence(opt.value)}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 12, color: recurrence === opt.value ? colors.rose : colors.textSec, fontWeight: '600' }}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Notes */}
          <View style={s.fSection}>
            <Input
              label="Notes"
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Save */}
          <View style={{ marginHorizontal: space.lg, marginTop: space.md }}>
            <Button variant="primary" label={saving ? 'Saving…' : 'Save event'} onPress={save} disabled={saving} loading={saving} fullWidth />
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CalendarScreen() {
  const { colors } = useTheme();
  const { isPaired, isLoading: coupleLoading } = useCouple();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [viewDate, setViewDate] = useState(new Date());
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addModalDate, setAddModalDate] = useState(new Date());
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [assignedTasks, setAssignedTasks] = useState<AssignedTask[]>([]);
  const [partnerMoods, setPartnerMoods] = useState<PartnerMoodEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dynamicFestivals, setDynamicFestivals] = useState<Record<string, { name: string; emoji: string }[]>>({});

  const slideAnim = useRef(new Animated.Value(0)).current;

  const getFestivalsForDate = useCallback((dateKey: string): { name: string; emoji: string }[] => {
    const static_f = FESTIVALS[dateKey] ?? [];
    const dynamic_f = dynamicFestivals[dateKey] ?? [];
    const all = [...static_f, ...dynamic_f];
    const seen = new Set<string>();
    return all.filter(f => { if (seen.has(f.name)) return false; seen.add(f.name); return true; });
  }, [dynamicFestivals]);

  // Index events by date key
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalEvent[]> = {};
    events.forEach(e => {
      const key = eventDateKey(e);
      if (!map[key]) map[key] = [];
      map[key].push(e);
    });
    return map;
  }, [events]);

  // Index assigned tasks by due_date
  const tasksByDate = useMemo(() => {
    const map: Record<string, AssignedTask[]> = {};
    assignedTasks.forEach(t => {
      if (!t.due_date) return;
      const key = t.due_date.slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return map;
  }, [assignedTasks]);

  // Index partner moods by date
  const partnerMoodByDate = useMemo(() => {
    const map: Record<string, number> = {};
    partnerMoods.forEach(m => { map[m.date.slice(0, 10)] = m.value; });
    return map;
  }, [partnerMoods]);

  const loadEvents = useCallback(async () => {
    try {
      const [eventsRes, tasksRes, moodsRes] = await Promise.all([
        api.get<CalEvent[]>('/api/events').catch(() => [] as CalEvent[]),
        api.get<AssignedTask[]>('/api/todos/assigned-to-me').catch(() => [] as AssignedTask[]),
        api.get<{ mine: PartnerMoodEntry[]; partner: PartnerMoodEntry[] }>('/api/mood/history?days=30').catch(() => ({ mine: [], partner: [] })),
      ]);
      setEvents(Array.isArray(eventsRes) ? eventsRes : []);
      setAssignedTasks(Array.isArray(tasksRes) ? tasksRes : []);
      const partnerMoodData = (moodsRes as any)?.partner ?? [];
      setPartnerMoods(Array.isArray(partnerMoodData) ? partnerMoodData : []);
      // Auto-sync profile events (fire and forget)
      api.post('/api/calendar/sync-profile-events', {}).catch(() => {});
      // Fetch dynamic festivals (silent fallback to static)
      api.get<{ festivals: { date: string; name: string; emoji: string }[] }>('/api/festivals')
        .then(res => {
          const dynamic: Record<string, { name: string; emoji: string }[]> = {};
          res.festivals.forEach(f => {
            if (!dynamic[f.date]) dynamic[f.date] = [];
            dynamic[f.date].push({ name: f.name, emoji: f.emoji });
          });
          setDynamicFestivals(dynamic);
        })
        .catch(() => {});
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  // Swipe gesture for month navigation
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dy) < 40,
      onPanResponderRelease: (_, g) => {
        if (g.dx < -40) goNextMonth();
        else if (g.dx > 40) goPrevMonth();
      },
    })
  ).current;

  const animateSlide = (direction: 'left' | 'right', callback: () => void) => {
    const toValue = direction === 'left' ? -SCREEN_W : SCREEN_W;
    Animated.timing(slideAnim, { toValue, duration: 200, useNativeDriver: true }).start(() => {
      slideAnim.setValue(-toValue);
      callback();
      Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    });
  };

  const goPrevMonth = () => animateSlide('right', () => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1)));
  const goNextMonth = () => animateSlide('left', () => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1)));
  const goPrevWeek = () => setWeekStart(d => { const n = new Date(d); n.setDate(d.getDate() - 7); return n; });
  const goNextWeek = () => setWeekStart(d => { const n = new Date(d); n.setDate(d.getDate() + 7); return n; });

  const goToToday = () => {
    const now = new Date();
    setViewDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setWeekStart(getMonday(now));
    setSelectedDay(null);
  };

  const handleDayPress = (d: Date) => {
    haptics.select();
    setSelectedDay(d);
    setSheetVisible(true);
  };

  const openAdd = (date?: Date) => {
    setAddModalDate(date ?? selectedDay ?? new Date());
    setSheetVisible(false);
    setTimeout(() => setShowAddModal(true), 200);
  };

  const handleEventPress = (e: CalEvent) => {
    Alert.alert(
      `${categoryEmoji(e)} ${e.title}`,
      [
        e.all_day ? 'All day' : `${fmtTime(e.start_dt)} – ${fmtTime(e.end_dt)}`,
        e.description ?? '',
      ].filter(Boolean).join('\n'),
      [{ text: 'OK' }]
    );
  };

  const selectedFestivals = selectedDay ? getFestivalsForDate(toDateKey(selectedDay)) : [];
  const selectedEvents = selectedDay ? (eventsByDate[toDateKey(selectedDay)] ?? []) : [];
  const selectedTasks = selectedDay ? (tasksByDate[toDateKey(selectedDay)] ?? []) : [];
  const selectedPartnerMood = selectedDay ? (partnerMoodByDate[toDateKey(selectedDay)] ?? null) : null;

  // Month/week nav title
  const navTitle = viewMode === 'month'
    ? `${MONTHS[viewDate.getMonth()]} ${viewDate.getFullYear()}`
    : viewMode === 'week'
    ? `${MONTHS_SHORT[weekStart.getMonth()]} ${weekStart.getDate()} – ${MONTHS_SHORT[new Date(weekStart.getTime() + 6 * 86400000).getMonth()]} ${new Date(weekStart.getTime() + 6 * 86400000).getDate()}`
    : 'Upcoming';

  if (coupleLoading) {
    return (
      <SafeAreaView style={[s.root, { alignItems: 'center', justifyContent: 'center' }]} edges={['top']}>
        <ActivityIndicator color={colors.rose} size="large" />
      </SafeAreaView>
    );
  }


  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={viewMode === 'month' ? goPrevMonth : goPrevWeek} style={s.navBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </TouchableOpacity>

        <Text style={s.monthTitle}>{navTitle}</Text>

        <TouchableOpacity onPress={viewMode === 'month' ? goNextMonth : goNextWeek} style={s.navBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </TouchableOpacity>

        <TouchableOpacity style={s.todayBtn} onPress={goToToday} activeOpacity={0.7}>
          <Text style={s.todayBtnText}>Today</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.addBtn} onPress={() => openAdd()} activeOpacity={0.8}>
          <Ionicons name="add" size={20} color="#fff" />
        </TouchableOpacity>

        <HamburgerButton />
      </View>

      {/* Segmented control */}
      <View style={s.segRow}>
        {(['month', 'week', 'agenda'] as ViewMode[]).map(mode => (
          <TouchableOpacity
            key={mode}
            style={[s.segBtn, viewMode === mode && s.segBtnActive]}
            onPress={() => { haptics.select(); setViewMode(mode); }}
            activeOpacity={0.7}
          >
            <Text style={[s.segBtnText, viewMode === mode && s.segBtnTextActive]}>
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Views */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.rose} size="large" />
        </View>
      ) : viewMode === 'month' ? (
        <View style={{ flex: 1 }} {...panResponder.panHandlers}>
          <MonthView
            viewDate={viewDate}
            selected={selectedDay}
            eventsByDate={eventsByDate}
            tasksByDate={tasksByDate}
            partnerMoodByDate={partnerMoodByDate}
            onDayPress={handleDayPress}
            onPrevMonth={goPrevMonth}
            onNextMonth={goNextMonth}
            slideAnim={slideAnim}
            s={s}
            colors={colors}
            getFestivalsForDate={getFestivalsForDate}
          />
        </View>
      ) : viewMode === 'week' ? (
        <WeekView
          weekStart={weekStart}
          eventsByDate={eventsByDate}
          s={s}
          colors={colors}
          onEventPress={handleEventPress}
        />
      ) : (
        <AgendaView
          eventsByDate={eventsByDate}
          onAdd={() => openAdd()}
          onEventPress={handleEventPress}
          s={s}
          colors={colors}
          getFestivalsForDate={getFestivalsForDate}
        />
      )}

      {/* Day bottom sheet (month view) */}
      {viewMode === 'month' && (
        <DayBottomSheet
          visible={sheetVisible}
          date={selectedDay ?? new Date()}
          events={selectedEvents}
          festivals={selectedFestivals}
          assignedTasks={selectedTasks}
          partnerMood={selectedPartnerMood}
          onClose={() => setSheetVisible(false)}
          onAdd={() => openAdd(selectedDay ?? undefined)}
          onEventPress={handleEventPress}
          s={s}
          colors={colors}
        />
      )}

      {/* Add event modal */}
      <AddEventModal
        visible={showAddModal}
        initialDate={addModalDate}
        onClose={() => setShowAddModal(false)}
        onSaved={loadEvents}
        colors={colors}
        s={s}
      />
    </SafeAreaView>
  );
}
