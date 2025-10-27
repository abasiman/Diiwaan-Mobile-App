// app/(tabs)/analytics.tsx
import api from '@/services/api';
import { Feather, Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, G, Path } from 'react-native-svg';

type Stats = {
  total: number;
  customers_with_due: number;
  total_amount_due: number;
  total_amount_paid: number;
  by_status?: Record<string, number>;
};

type Preset = 'today' | 'this_week' | 'this_month' | 'this_year' | 'custom';

const BRAND = '#0B2447';
const TEXT = '#0F172A';
const MUTED = '#64748B';
const CARD_BG = '#FFFFFF';
const SCREEN_BG = '#F8FAFC';
const PAID = '#16A34A';
const UNPAID = '#EF4444';
const LIGHT_BLUE_SHADOW = 'rgba(59,130,246,0.16)';

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d: Date) { const x = new Date(d); x.setHours(23,59,59,999); return x; }

function getWeekBounds(date = new Date()) {
  // ISO week: Monday start
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // 0..6 (Mon..Sun)
  const start = new Date(d); start.setDate(d.getDate() - day);
  const end = new Date(start); end.setDate(start.getDate() + 6);
  return { start: startOfDay(start), end: endOfDay(end) };
}

function getMonthBounds(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start: startOfDay(start), end: endOfDay(end) };
}

function getYearBounds(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 1);
  const end = new Date(date.getFullYear(), 11, 31);
  return { start: startOfDay(start), end: endOfDay(end) };
}

function toISO(d: Date) { return d.toISOString(); }

// --- Pie helpers (2-slice donut) ---
function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}
function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg - 90) * Math.PI / 180.0;
  return { x: cx + (r * Math.cos(rad)), y: cy + (r * Math.sin(rad)) };
}

export default function Analytics() {
  const [preset, setPreset] = useState<Preset>('this_month');
  const [customYear, setCustomYear] = useState<number>(new Date().getFullYear());
  const [customMonth, setCustomMonth] = useState<number | null>(null); // 0..11 or null
  const [customWeek, setCustomWeek] = useState<number | null>(null);   // 1..53 or null
  const [pickerOpen, setPickerOpen] = useState(false);

  const { startDate, endDate, label } = useMemo(() => {
    const now = new Date();
    if (preset === 'today') {
      const s = startOfDay(now); const e = endOfDay(now);
      return { startDate: s, endDate: e, label: 'Today' };
    }
    if (preset === 'this_week') {
      const { start, end } = getWeekBounds(now);
      return { startDate: start, endDate: end, label: 'This Week' };
    }
    if (preset === 'this_month') {
      const { start, end } = getMonthBounds(now);
      return { startDate: start, endDate: end, label: 'This Month' };
    }
    if (preset === 'this_year') {
      const { start, end } = getYearBounds(now);
      return { startDate: start, endDate: end, label: 'This Year' };
    }
    // custom
    if (customWeek) {
      // Week N of customYear (ISO-ish simple calc)
      const jan4 = new Date(customYear, 0, 4);
      const day = (jan4.getDay() + 6) % 7;
      const week1Start = new Date(jan4); week1Start.setDate(jan4.getDate() - day);
      const start = new Date(week1Start); start.setDate(week1Start.getDate() + (customWeek - 1) * 7);
      const end = new Date(start); end.setDate(start.getDate() + 6);
      return { startDate: startOfDay(start), endDate: endOfDay(end), label: `Week ${customWeek}, ${customYear}` };
    }
    if (customMonth !== null) {
      const start = new Date(customYear, customMonth, 1);
      const end = new Date(customYear, customMonth + 1, 0);
      const monthName = start.toLocaleString(undefined, { month: 'long' });
      return { startDate: startOfDay(start), endDate: endOfDay(end), label: `${monthName} ${customYear}` };
    }
    const { start, end } = getYearBounds(new Date(customYear, 0, 1));
    return { startDate: start, endDate: end, label: `${customYear}` };
  }, [preset, customYear, customMonth, customWeek]);

  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
  setLoading(true); 
  setErr(null);
  try {
    const res = await api.get('/diiwaancustomers/stats', {
      params: { start_date: toISO(startDate), end_date: toISO(endDate) },
    });
    setStats(res.data as Stats);
  } catch (e: any) {
    // ⬇⬇ PUT THESE LINES HERE ⬇⬇
    const detail = e?.response?.data?.detail ?? e?.message ?? e;
    const message =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
        ? detail.map((d: any) => d?.msg || d?.type || JSON.stringify(d)).join('\n')
        : (detail?.msg || detail?.message || JSON.stringify(detail));
    setErr(message);
    // ⬆⬆ END INSERT ⬆⬆
  } finally {
    setLoading(false);
  }
}, [startDate, endDate]);


  useEffect(() => { load(); }, [load]);

  const paid = stats?.total_amount_paid ?? 0;
  const unpaid = stats?.total_amount_due ?? 0;
  const totalAmount = paid + unpaid;
  const paidPct = totalAmount > 0 ? (paid / totalAmount) : 0;
  const unpaidPct = 1 - paidPct;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Analytics</Text>
      </View>

      {/* Filters Row */}
      <View style={styles.filtersRow}>
        <FilterPill text="Today" active={preset==='today'} onPress={() => setPreset('today')} />
        <FilterPill text="This Week" active={preset==='this_week'} onPress={() => setPreset('this_week')} />
        <FilterPill text="This Month" active={preset==='this_month'} onPress={() => setPreset('this_month')} />
        <FilterPill text="This Year" active={preset==='this_year'} onPress={() => setPreset('this_year')} />
        <Pressable style={styles.dropdownBtn} onPress={() => { setPreset('custom'); setPickerOpen(true); }}>
          <Feather name="calendar" size={16} color={BRAND} />
          <Text style={styles.dropdownText}>Pick</Text>
        </Pressable>
      </View>

      {/* Current Range Label */}
      <View style={styles.rangeBadgeWrap}>
        <View style={styles.rangeBadge}>
          <Ionicons name="time-outline" size={14} color={BRAND} />
          <Text style={styles.rangeText}>{label}</Text>
        </View>
      </View>

      {/* Top KPI cards */}
      <View style={styles.kpiRow}>
        <KpiCard title="Total Customers" value={formatInt(stats?.total)} icon="people-outline" />
        <KpiCard title="Customers With Due" value={formatInt(stats?.customers_with_due)} icon="alert-circle-outline" tint="#0EA5E9" />
      </View>

      {/* Pie Card */}
      <View style={styles.pieCard}>
        <Text style={styles.pieTitle}>
  Deynta la bixiyay <Text style={styles.blue}>iyo</Text> Deynta aan la bixin
</Text>


        <View style={styles.pieWrap}>
          {loading ? (
            <ActivityIndicator />
          ) : err ? (
            <Text style={styles.errorText}>{String(err)}</Text>

          ) : (
            <DonutTwoSlice
              size={190}
              strokeWidth={24}
              paidPct={paidPct}
              colors={{ paid: PAID, unpaid: UNPAID }}
            />
          )}
        </View>

        {/* Legend + amounts */}
        <View style={styles.legendRow}>
          <LegendDot color={PAID} label="Paid" value={formatMoney(paid)} />
          <LegendDot color={UNPAID} label="Unpaid" value={formatMoney(unpaid)} />
        </View>
      </View>

      {/* Custom Picker Modal */}
      <PeriodPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        customYear={customYear}
        setCustomYear={setCustomYear}
        customMonth={customMonth}
        setCustomMonth={setCustomMonth}
        customWeek={customWeek}
        setCustomWeek={setCustomWeek}
        onApply={() => { setPickerOpen(false); setPreset('custom'); }}
      />
    </SafeAreaView>
  );
}

/* ---------- UI Subcomponents ---------- */

function FilterPill({ text, active, onPress }: { text: string; active?: boolean; onPress(): void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.9}
      style={[styles.pill, active && styles.pillActive]}>
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{text}</Text>
    </TouchableOpacity>
  );
}

function KpiCard({ title, value, icon, tint = '#22C55E' }:{
  title: string; value: string; icon: any; tint?: string;
}) {
  return (
    <View style={styles.kpiCard}>
      <View style={[styles.kpiIconWrap, { backgroundColor: LIGHT_BLUE_SHADOW }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <Text style={styles.kpiTitle}>{title}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
    </View>
  );
}

function LegendDot({ color, label, value }:{ color: string; label: string; value: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
      <Text style={styles.legendValue}>{value}</Text>
    </View>
  );
}

// Lightweight 2-slice donut
function DonutTwoSlice({
  size, strokeWidth, paidPct, colors,
}:{
  size: number; strokeWidth: number; paidPct: number; colors: { paid: string; unpaid: string };
}) {
  const r = (size - strokeWidth) / 2;
  const c = size / 2;
  // convert pct to angles
  const paidAngle = Math.max(0, Math.min(360, paidPct * 360));
  const unpaidAngle = 360 - paidAngle;

  const paidPath = describeArc(c, c, r, 0, paidAngle || 0.0001);
  const unpaidPath = describeArc(c, c, r, paidAngle, 360);

  return (
    <Svg width={size} height={size}>
      <G rotation="0" originX={c} originY={c}>
        {/* Background ring */}
        <Circle cx={c} cy={c} r={r} stroke="#E2E8F0" strokeWidth={strokeWidth} fill="none" />
        {/* Paid arc */}
        {paidAngle > 0 && (
          <Path d={paidPath} stroke={colors.paid} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" />
        )}
        {/* Unpaid arc */}
        {unpaidAngle > 0 && (
          <Path d={unpaidPath} stroke={colors.unpaid} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" />
        )}
      </G>
      {/* center label */}
      <TextSVG x={c} y={c} paidPct={paidPct} />
    </Svg>
  );
}

function TextSVG({ x, y, paidPct }:{ x: number; y: number; paidPct: number }) {
  // Small inline SVG text using react-native-svg's foreignObject is not ideal; instead, overlay RN text.
  // We’ll render center label with RN absolutely positioned:
  return null;
}

/* ---------- Helpers ---------- */
function formatInt(n?: number) {
  if (n == null) return '—';
  return new Intl.NumberFormat().format(n);
}
function formatMoney(n?: number) {
  if (n == null) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

/* ---------- Period Picker Modal ---------- */
function PeriodPickerModal(props: {
  open: boolean;
  onClose(): void;
  customYear: number; setCustomYear(n: number): void;
  customMonth: number | null; setCustomMonth(n: number | null): void;
  customWeek: number | null; setCustomWeek(n: number | null): void;
  onApply(): void;
}) {
  const years = useMemo(() => {
    const now = new Date().getFullYear();
    return Array.from({ length: 11 }, (_, i) => now - i); // current .. -10
  }, []);
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => ({
    idx: i, label: new Date(2000, i, 1).toLocaleString(undefined, { month: 'long' })
  })), []);
  const weeks = useMemo(() => Array.from({ length: 53 }, (_, i) => i + 1), []);

  return (
    <Modal visible={props.open} transparent animationType="fade" onRequestClose={props.onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Pick Period</Text>

          <Text style={styles.modalLabel}>Year</Text>
          <FlatList
            data={years}
            keyExtractor={(i) => String(i)}
            horizontal
            contentContainerStyle={{ paddingVertical: 6 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => props.setCustomYear(item)}
                style={[styles.chip, props.customYear === item && styles.chipActive]}>
                <Text style={[styles.chipText, props.customYear === item && styles.chipTextActive]}>{item}</Text>
              </TouchableOpacity>
            )}
          />

          <Text style={styles.modalLabel}>Month (optional)</Text>
          <FlatList
            data={months}
            keyExtractor={(i) => String(i.idx)}
            horizontal
            contentContainerStyle={{ paddingVertical: 6 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() =>
                  props.customMonth === item.idx ? props.setCustomMonth(null) : props.setCustomMonth(item.idx)
                }
                style={[styles.chip, props.customMonth === item.idx && styles.chipActive]}>
                <Text style={[styles.chipText, props.customMonth === item.idx && styles.chipTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            )}
          />

          <Text style={styles.modalLabel}>Week (optional)</Text>
          <FlatList
            data={weeks}
            keyExtractor={(i) => String(i)}
            horizontal
            contentContainerStyle={{ paddingVertical: 6 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() =>
                  props.customWeek === item ? props.setCustomWeek(null) : props.setCustomWeek(item)
                }
                style={[styles.chip, props.customWeek === item && styles.chipActive]}>
                <Text style={[styles.chipText, props.customWeek === item && styles.chipTextActive]}>
                  W{item}
                </Text>
              </TouchableOpacity>
            )}
          />

          <View style={styles.modalActions}>
            <TouchableOpacity onPress={props.onClose} style={[styles.modalBtn, styles.btnGhost]}>
              <Text style={[styles.modalBtnText, { color: MUTED }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                // if user picked a month, clear week; if picked week, clear month (mutually exclusive)
                if (props.customMonth !== null && props.customWeek !== null) {
                  props.setCustomWeek(null);
                }
                props.onApply();
              }}
              style={[styles.modalBtn, styles.btnPrimary]}>
              <Text style={[styles.modalBtnText, { color: 'white' }]}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ---------- Styles ---------- */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: SCREEN_BG },

  header: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
    backgroundColor: CARD_BG,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: TEXT,
  },

  filtersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 12,
    flexWrap: 'wrap',
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  pillActive: {
    backgroundColor: '#E6F0FF',
    borderColor: '#BFDBFE',
    shadowColor: '#60A5FA',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    ...Platform.select({ android: { elevation: 4 } }),
  },
  pillText: { color: MUTED, fontWeight: '600', fontSize: 12 },
  pillTextActive: { color: BRAND },

  dropdownBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0',
  },
  dropdownText: { color: BRAND, fontWeight: '700', fontSize: 12 },

  rangeBadgeWrap: { paddingHorizontal: 12, marginTop: 10 },
  rangeBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    borderWidth: 1, borderColor: '#C7D2FE',
  },
  rangeText: { color: BRAND, fontWeight: '700', fontSize: 12 },

  kpiRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 12,
    marginTop: 12,
  },
  kpiCard: {
    flex: 1, backgroundColor: CARD_BG, borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: '#E2E8F0',
    shadowColor: 'black', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    ...Platform.select({ android: { elevation: 2 } }),
  },
  kpiIconWrap: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  kpiTitle: { color: MUTED, fontSize: 12, fontWeight: '600' },
  kpiValue: { color: TEXT, fontSize: 20, fontWeight: '800', marginTop: 2 },

  pieCard: {
    marginTop: 16, marginHorizontal: 12,
    backgroundColor: CARD_BG, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: '#E2E8F0',
    shadowColor: 'black', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    ...Platform.select({ android: { elevation: 2 } }),
  },
  pieTitle: { fontSize: 16, fontWeight: '800', color: TEXT, marginBottom: 8 },
   blue: {
    color: '#2563EB', // blue-600
    fontWeight: '800', // optional emphasis
  },
  pieWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },

  legendRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { color: TEXT, fontWeight: '700' },
  legendValue: { color: MUTED, fontWeight: '700', marginLeft: 6 },

  errorText: { color: '#DC2626', fontWeight: '600', marginTop: 8 },

  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center',
  },
  modalCard: {
    width: '92%', backgroundColor: 'white', borderRadius: 16, padding: 14,
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: TEXT, marginBottom: 4 },
  modalLabel: { color: MUTED, fontWeight: '700', marginTop: 8 },

  chip: {
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: CARD_BG, marginRight: 8,
  },
  chipActive: {
    backgroundColor: '#E6F0FF', borderColor: '#BFDBFE',
  },
  chipText: { color: MUTED, fontWeight: '700', fontSize: 12 },
  chipTextActive: { color: BRAND },

  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 },
  modalBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  btnPrimary: { backgroundColor: BRAND },
  btnGhost: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' },
  modalBtnText: { fontWeight: '800' },
});
