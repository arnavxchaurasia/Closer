import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';

import { useTheme } from '@/src/context/ThemeContext';
import { radius, space } from '@/src/theme';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WEEKDAYS = ['S','M','T','W','T','F','S'];

function pad(n: number) { return String(n).padStart(2, '0'); }
function toISODate(y: number, m: number, d: number) { return `${y}-${pad(m + 1)}-${pad(d)}`; }

function parseISO(value?: string): { y: number; m: number; d: number } | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return { y: +match[1], m: +match[2] - 1, d: +match[3] };
}

function prettyDate(value?: string) {
  const p = parseISO(value);
  if (!p) return '';
  return `${MONTHS[p.m].slice(0, 3)} ${p.d}, ${p.y}`;
}

interface DateFieldProps {
  label?: string;
  value: string;              // YYYY-MM-DD
  onChange: (v: string) => void;
  placeholder?: string;
}

/**
 * Cross-platform date picker. Uses a native <input type="date"> on web and a
 * themed calendar modal on iOS/Android — no external native modules required.
 */
export function DateField({ label, value, onChange, placeholder = 'Select a date' }: DateFieldProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const today = useMemo(() => { const t = new Date(); return { y: t.getFullYear(), m: t.getMonth(), d: t.getDate() }; }, []);
  const parsed = parseISO(value) ?? today;
  const [viewY, setViewY] = useState(parsed.y);
  const [viewM, setViewM] = useState(parsed.m);

  const s = makeStyles(colors);

  if (Platform.OS === 'web') {
    // Real, accessible native date input on web.
    return (
      <View style={{ gap: 4 }}>
        {label ? <Text style={s.label}>{label}</Text> : null}
        {React.createElement('input', {
          type: 'date',
          value: value || '',
          onChange: (e: any) => onChange(e.target.value),
          style: {
            backgroundColor: colors.surface2, color: colors.text,
            border: `1px solid ${colors.line}`, borderRadius: radius.md,
            height: 48, padding: '0 14px', fontSize: 15, outline: 'none',
            fontFamily: 'inherit', colorScheme: 'dark',
          },
        })}
      </View>
    );
  }

  const openPicker = () => {
    const p = parseISO(value) ?? today;
    setViewY(p.y); setViewM(p.m);
    setOpen(true);
  };

  const firstWeekday = new Date(viewY, viewM, 1).getDay();
  const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const shiftMonth = (delta: number) => {
    let m = viewM + delta, y = viewY;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setViewM(m); setViewY(y);
  };

  const isSelected = (d: number) => parsed.y === viewY && parsed.m === viewM && parsed.d === d && !!value;

  return (
    <View style={{ gap: 4 }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <Pressable style={s.field} onPress={openPicker}>
        <Ionicons name="calendar-outline" size={18} color={colors.muted} />
        <Text style={[s.fieldText, { color: value ? colors.text : colors.muted }]}>
          {value ? prettyDate(value) : placeholder}
        </Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <View style={s.navRow}>
              <Pressable onPress={() => shiftMonth(-1)} hitSlop={10}><Ionicons name="chevron-back" size={22} color={colors.text} /></Pressable>
              <Text style={s.monthLabel}>{MONTHS[viewM]} {viewY}</Text>
              <Pressable onPress={() => shiftMonth(1)} hitSlop={10}><Ionicons name="chevron-forward" size={22} color={colors.text} /></Pressable>
            </View>
            <View style={s.weekRow}>
              {WEEKDAYS.map((w, i) => <Text key={i} style={s.weekday}>{w}</Text>)}
            </View>
            <View style={s.grid}>
              {cells.map((d, i) => (
                <View key={i} style={s.cell}>
                  {d ? (
                    <Pressable
                      style={[s.day, isSelected(d) && { backgroundColor: colors.rose }]}
                      onPress={() => { onChange(toISODate(viewY, viewM, d)); setOpen(false); }}
                    >
                      <Text style={[s.dayText, isSelected(d) && { color: '#fff', fontWeight: '800' }]}>{d}</Text>
                    </Pressable>
                  ) : <View style={s.day} />}
                </View>
              ))}
            </View>
            <Pressable style={s.todayBtn} onPress={() => { onChange(toISODate(today.y, today.m, today.d)); setOpen(false); }}>
              <Text style={s.todayText}>Today</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

interface TimeFieldProps {
  label?: string;
  value: string;            // HH:MM (24h)
  onChange: (v: string) => void;
}

/** Cross-platform time picker: native <input type="time"> on web, wheel modal on native. */
export function TimeField({ label, value, onChange }: TimeFieldProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const s = makeStyles(colors);
  const [h, m] = (value || '09:00').split(':').map(Number);

  if (Platform.OS === 'web') {
    return (
      <View style={{ gap: 4, flex: 1 }}>
        {label ? <Text style={s.label}>{label}</Text> : null}
        {React.createElement('input', {
          type: 'time',
          value: value || '',
          onChange: (e: any) => onChange(e.target.value),
          style: {
            backgroundColor: colors.surface2, color: colors.text,
            border: `1px solid ${colors.line}`, borderRadius: radius.md,
            height: 48, padding: '0 14px', fontSize: 15, outline: 'none',
            fontFamily: 'inherit', colorScheme: 'dark',
          },
        })}
      </View>
    );
  }

  return (
    <View style={{ gap: 4, flex: 1 }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <Pressable style={s.field} onPress={() => setOpen(true)}>
        <Ionicons name="time-outline" size={18} color={colors.muted} />
        <Text style={[s.fieldText, { color: value ? colors.text : colors.muted }]}>{value || 'Select time'}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[s.sheet, { flexDirection: 'row', gap: space.sm }]} onPress={() => {}}>
            <ScrollView style={s.wheel} showsVerticalScrollIndicator={false}>
              {Array.from({ length: 24 }, (_, i) => i).map(hour => (
                <Pressable key={hour} style={[s.wheelItem, h === hour && { backgroundColor: colors.roseDim }]} onPress={() => onChange(`${pad(hour)}:${pad(m || 0)}`)}>
                  <Text style={[s.wheelText, h === hour && { color: colors.rose, fontWeight: '800' }]}>{pad(hour)}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={s.colon}>:</Text>
            <ScrollView style={s.wheel} showsVerticalScrollIndicator={false}>
              {Array.from({ length: 12 }, (_, i) => i * 5).map(min => (
                <Pressable key={min} style={[s.wheelItem, m === min && { backgroundColor: colors.roseDim }]} onPress={() => onChange(`${pad(h || 9)}:${pad(min)}`)}>
                  <Text style={[s.wheelText, m === min && { color: colors.rose, fontWeight: '800' }]}>{pad(min)}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={s.doneBtn} onPress={() => setOpen(false)}>
              <Text style={s.todayText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    label: { fontSize: 11, fontWeight: '700', color: c.textSec, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 },
    field: {
      flexDirection: 'row', alignItems: 'center', gap: space.sm,
      backgroundColor: c.surface2, borderRadius: radius.md, height: 48,
      paddingHorizontal: space.md, borderWidth: 1, borderColor: c.line,
    },
    fieldText: { fontSize: 15 },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: space.lg },
    sheet: { backgroundColor: c.surface, borderRadius: radius.xl, padding: space.lg, width: '100%', maxWidth: 360, borderWidth: 1, borderColor: c.line },
    navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md },
    monthLabel: { fontSize: 16, fontWeight: '800', color: c.text },
    weekRow: { flexDirection: 'row', marginBottom: 4 },
    weekday: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: c.muted },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 2 },
    day: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
    dayText: { fontSize: 14, color: c.text },
    todayBtn: { marginTop: space.md, alignSelf: 'center', paddingVertical: space.sm, paddingHorizontal: space.lg, borderRadius: radius.full, backgroundColor: c.surface2 },
    todayText: { fontSize: 14, fontWeight: '700', color: c.rose },
    wheel: { flex: 1, height: 220 },
    wheelItem: { paddingVertical: 12, alignItems: 'center', borderRadius: radius.md },
    wheelText: { fontSize: 18, color: c.text },
    colon: { fontSize: 22, fontWeight: '800', color: c.text, alignSelf: 'center' },
    doneBtn: { position: 'absolute', bottom: -8, right: 0 },
  });
}
