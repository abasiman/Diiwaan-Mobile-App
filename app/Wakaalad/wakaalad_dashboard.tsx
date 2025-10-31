// app/Wakaalad/wakaalad_dashboard.tsx
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import dayjs from 'dayjs';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Dimensions,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import CreateWakaaladModal from '../Wakaladmodels/createwakaladmodal';
import WakaaladActionsModal, { WakaaladActionMode } from '../Wakaladmodels/wakaaladactions';

import api from '@/services/api';
import { useAuth } from '@/src/context/AuthContext';

const { width } = Dimensions.get('window');

type OilType = 'diesel' | 'petrol' | 'kerosene' | 'jet' | 'hfo' | 'crude' | 'lube';

export type WakaaladRead = {
  id: number;
  oil_id: number;
  wakaalad_name: string;
  oil_type: OilType | string;
  original_qty: number;
  wakaal_stock: number; // TOTAL liters in stock
  wakaal_sold: number;  // TOTAL liters sold
  date: string;
  is_deleted: boolean;

  // server breakdowns (remainders after splitting)
  stock_fuusto: number;
  stock_caag: number;
  stock_liters: number;
  stock_breakdown: string;

  sold_fuusto: number;
  sold_caag: number;
  sold_liters: number;
  sold_breakdown: string;
};

type WakaaladListResponse = {
  items: WakaaladRead[];
  totals: { count: number; total_stock: number; total_sold: number };
  offset: number;
  limit: number;
  returned: number;
  has_more: boolean;
};

type UnitMode = 'fuusto' | 'caag' | 'liters';

const COLOR_BG = '#FFFFFF';
const COLOR_TEXT = '#0B1221';
const COLOR_MUTED = '#64748B';
const COLOR_DIV = '#E5E7EB';
const COLOR_CARD = '#F8FAFC';
const COLOR_ACCENT = '#0B2447'; // dark blue for progress
const COLOR_SUCCESS = '#16A34A';

const CAPACITY = { fuusto: 240, caag: 20 } as const;
const fuustoCap = (oilType?: string) =>
  (String(oilType || '').toLowerCase() === 'petrol' ? 230 : CAPACITY.fuusto);

function formatNumber(n?: number | null, fractionDigits = 0) {
  if (n === undefined || n === null || isNaN(Number(n))) return '—';
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: 0,
  }).format(Number(n));
}
function formatDateLocal(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(d);
}
function percentSold(it: WakaaladRead) {
  const total = Number(it.wakaal_stock || 0) + Number(it.wakaal_sold || 0);
  if (total <= 0) return 0;
  const pct = (Number(it.wakaal_sold || 0) / total) * 100;
  return Math.max(0, Math.min(100, pct));
}
function percentStock(it: WakaaladRead) {
  const total = Number(it.wakaal_stock || 0) + Number(it.wakaal_sold || 0);
  if (total <= 0) return 0;
  const pct = (Number(it.wakaal_stock || 0) / total) * 100;
  return Math.max(0, Math.min(100, pct));
}

/** Green round confirmation tick */
const ConfirmBadge = ({ size = 16 }: { size?: number }) => (
  <View
    style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: COLOR_SUCCESS,
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <Feather name="check" size={Math.max(10, Math.floor(size * 0.62))} color="#fff" />
  </View>
);

export default function WakaaladDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<WakaaladRead[]>([]);
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState<'start' | 'end' | null>(null);
  const [dateRange, setDateRange] = useState({
    startDate: dayjs().startOf('month').toDate(),
    endDate: dayjs().endOf('day').toDate(),
  });

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);

  // Unit selector (prominent, below the search)
  const [unitMode, setUnitMode] = useState<UnitMode>('fuusto'); // default fuusto

  // Actions modal
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [actionMode, setActionMode] = useState<WakaaladActionMode>('edit');
  const [selectedWk, setSelectedWk] = useState<WakaaladRead | null>(null);

  const headers = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : undefined),
    [token]
  );

  const fetchingRef = useRef(false);

  const fetchWakaalads = useCallback(async () => {
    if (!headers) return;
    const params = {
      start: dayjs(dateRange.startDate).toISOString(),
      end: dayjs(dateRange.endDate).toISOString(),
      _ts: Date.now(),
    };
    const res = await api.get<WakaaladListResponse>('/wakaalad_diiwaan', {
      headers: {
        ...headers,
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      params,
    });
    setItems(res?.data?.items ?? []);
  }, [headers, dateRange]);

  const fetchAll = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      setLoading(true);
      await fetchWakaalads();
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [fetchWakaalads]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const onHardwareBackPress = () => {
      router.replace('/menu');
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBackPress);
    return () => sub.remove();
  }, [router]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const from = dayjs(dateRange.startDate).startOf('day').valueOf();
    const to = dayjs(dateRange.endDate).endOf('day').valueOf();

    const base = items.filter((it) => {
      const t = it.date ? new Date(it.date).getTime() : 0;
      const dateOK = t >= from && t <= to;
      if (!q) return dateOK;
      const hay = `${it.wakaalad_name} ${it.oil_type}`.toLowerCase();
      return dateOK && hay.includes(q);
    });

    return base.sort((a, b) => {
      const ta = a.date ? new Date(a.date).getTime() : 0;
      const tb = b.date ? new Date(b.date).getTime() : 0;
      return tb - ta;
    });
  }, [items, search, dateRange]);

  // Selected unit label
  const unitLabel = useMemo(
    () => (unitMode === 'fuusto' ? 'Fuusto' : unitMode === 'caag' ? 'Caag' : 'Liters'),
    [unitMode]
  );

  // Always derive from TOTAL liters (wakaal_stock / wakaal_sold)
  const totalLitersStock = (it: WakaaladRead) => Number(it.wakaal_stock || 0);
  const totalLitersSold  = (it: WakaaladRead) => Number(it.wakaal_sold || 0);

  function stockValue(it: WakaaladRead): number {
    const liters = totalLitersStock(it);
    if (unitMode === 'liters') return liters;
    if (unitMode === 'fuusto') return Math.floor(liters / fuustoCap(it.oil_type));
    return Math.floor(liters / CAPACITY.caag); // caag
  }

  function soldValue(it: WakaaladRead): number {
    const liters = totalLitersSold(it);
    if (unitMode === 'liters') return liters;
    if (unitMode === 'fuusto') return Math.floor(liters / fuustoCap(it.oil_type));
    return Math.floor(liters / CAPACITY.caag); // caag
  }

  function unitSuffix(): string {
    if (unitMode === 'fuusto') return 'fuusto';
    if (unitMode === 'caag') return 'caag';
    return 'L';
  }

  // Actions modal open
  const openActions = (wk: WakaaladRead, initialMode: WakaaladActionMode = 'edit') => {
    setSelectedWk(wk);
    setActionMode(initialMode);
    setActionModalOpen(true);
  };

  return (
    <View style={styles.page}>
      {/* Header */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: COLOR_ACCENT }}>
        <StatusBar style="light" translucent />
        <LinearGradient
          colors={[COLOR_ACCENT, COLOR_ACCENT]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.header, { paddingTop: insets.top }]}
        >
          <View style={styles.headerRowTop}>
            {/* Back */}
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => router.replace('/menu')}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.9}
            >
              <Feather name="arrow-left" size={16} color={COLOR_ACCENT} />
            </TouchableOpacity>

            {/* Title */}
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={styles.headerTitle}>Wakaalad</Text>
              <Text style={styles.headerDate}>
                {dayjs(dateRange.startDate).format('MMM D, YYYY')} – {dayjs(dateRange.endDate).format('MMM D, YYYY')}
              </Text>
            </View>

            {/* + Abuur Wakaalad */}
            <TouchableOpacity
              onPress={() => setCreateOpen(true)}
              activeOpacity={0.9}
              style={styles.createBtn}
              accessibilityRole="button"
              accessibilityLabel="Abuur Wakaalad"
            >
              <Feather name="plus" size={12} color={COLOR_ACCENT} />
              <Text style={styles.createBtnTxt}>Abuur Wakaalad</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </SafeAreaView>

      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Feather name="search" size={12} color={COLOR_MUTED} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search wakaalad name or oil type…"
            placeholderTextColor={COLOR_MUTED}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Feather name="x-circle" size={12} color={COLOR_MUTED} />
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={() => setShowFilters(true)} style={styles.headerFilterBtnSmall}>
            <Feather name="filter" size={12} color={COLOR_ACCENT} />
            <Text style={styles.headerFilterTxtSmall}>Filter</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* BIG Unit Selector (below search) */}
      <View style={styles.unitBar}>
        <Text style={styles.unitBarLabel}>Display in</Text>
        <View style={styles.unitChipsRow}>
          {(['fuusto', 'caag', 'liters'] as UnitMode[]).map((u) => {
            const active = unitMode === u;
            const label = u === 'fuusto' ? 'Fuusto' : u === 'caag' ? 'Caag' : 'Liters';
            return (
              <TouchableOpacity
                key={u}
                onPress={() => setUnitMode(u)}
                activeOpacity={0.9}
                style={[styles.unitChip, active && styles.unitChipActive]}
              >
                <Feather name="layers" size={12} color={active ? '#fff' : COLOR_ACCENT} />
                <Text style={[styles.unitChipTxt, active && styles.unitChipTxtActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* List */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator />
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="inbox" size={18} color={COLOR_MUTED} />
            <Text style={styles.emptyText}>No wakaalad found.</Text>
          </View>
        ) : (
          filtered.map((wk) => {
            const pctSold  = percentSold(wk);
            const pctStock = percentStock(wk);
            const totalLiters = (wk.wakaal_stock || 0) + (wk.wakaal_sold || 0);

            const stock = stockValue(wk);
            const sold = soldValue(wk);
            const suffix = unitSuffix();

            const pctForLabel = Math.max(4, Math.min(96, Math.round(pctStock)));

            // explicit fuusto sold (for green tick)
            const soldFuustoCount = Math.floor((wk.wakaal_sold || 0) / fuustoCap(wk.oil_type));

            return (
              <View key={wk.id} style={styles.card}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  {/* Title row with single Actions button */}
                  <View style={styles.titleRow}>
                    <Text style={styles.title} numberOfLines={1}>
                      {wk.wakaalad_name || '—'}
                    </Text>

                    <TouchableOpacity
                      onPress={() => openActions(wk, 'edit')}
                      style={styles.actionsBtn}
                      activeOpacity={0.9}
                    >
                      <Feather name="settings" size={12} color={COLOR_ACCENT} />
                      <Text style={styles.actionsBtnTxt}>Actions</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.metaRow}>
                    <View style={styles.metaPill}>
                      <Feather name="droplet" size={10} color={COLOR_TEXT} />
                      <Text style={styles.metaText}>{String(wk.oil_type || '—').toUpperCase()}</Text>
                    </View>
                    <View style={styles.metaPill}>
                      <Feather name="calendar" size={10} color={COLOR_TEXT} />
                      <Text style={styles.metaText}>{formatDateLocal(wk.date)}</Text>
                    </View>
                    <View style={styles.metaPill}>
                      <Feather name="database" size={10} color={COLOR_TEXT} />
                      <Text style={styles.metaText}>Total {formatNumber(totalLiters)} L</Text>
                    </View>
                  </View>

                  {/* Progress bar */}
                  <View
                    style={styles.progressWrap}
                    accessible
                    accessibilityRole="progressbar"
                    accessibilityLabel="Wakaalad remaining stock"
                    accessibilityValue={{ now: Math.round(pctStock), min: 0, max: 100 }}
                  >
                    <View style={styles.progressBg} />
                    <View style={[styles.progressFill, { width: `${pctStock}%` }]} />

                    {/* Sliding percentage tag */}
                    <View
                      pointerEvents="none"
                      style={[
                        styles.progressTag,
                        { left: `${pctForLabel}%`, transform: [{ translateX: -18 }] },
                      ]}
                    >
                      <Text style={styles.progressTagTxt}>{Math.round(pctStock)}%</Text>
                    </View>
                  </View>

                  {/* Stat boxes show values in selected unit */}
                  <View style={styles.statsRow}>
                    <View style={styles.statBox}>
                      <Text style={styles.statLabel}>Stock ({unitLabel})</Text>
                      <Text style={styles.statValue}>
                        {formatNumber(stock)} {suffix}
                      </Text>
                    </View>

                    {/* SOLD with round green confirmation tick */}
                    <View style={styles.statBox}>
                      <Text style={styles.statLabel}>Sold ({unitLabel})</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        {unitMode === 'fuusto' && <ConfirmBadge size={16} />}
                        <Text style={styles.statValue}>
                          {formatNumber(sold)} {suffix}
                        </Text>
                      </View>

                    
                    </View>

                  {/*   <View style={styles.statBoxSmall}>
                      <Text style={styles.statMini}>Sold {Math.round(pctSold)}%</Text>
                    </View> */}
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Filters Modal */}
      <Modal visible={showFilters} transparent animationType="fade" onRequestClose={() => setShowFilters(false)}>
        <TouchableWithoutFeedback onPress={() => setShowFilters(false)}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={[styles.modalCard, { width: '94%', maxHeight: '80%' }]}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Filters</Text>
                  <TouchableOpacity onPress={() => setShowFilters(false)}>
                    <Feather name="x" size={16} color="#1F2937" />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  contentContainerStyle={{ paddingBottom: 8 }}
                  showsVerticalScrollIndicator
                  keyboardShouldPersistTaps="handled"
                >
                  <View style={styles.filterSection}>
                    <Text style={styles.filterLabel}>Date Range</Text>
                    <View style={styles.dateRangeContainer}>
                      <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker('start')}>
                        <Text style={styles.dateBtnText}>{dayjs(dateRange.startDate).format('MMM D, YYYY')}</Text>
                        <Feather name="calendar" size={12} color={COLOR_ACCENT} />
                      </TouchableOpacity>
                      <Text style={styles.rangeSep}>to</Text>
                      <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker('end')}>
                        <Text style={styles.dateBtnText}>{dayjs(dateRange.endDate).format('MMM D, YYYY')}</Text>
                        <Feather name="calendar" size={12} color={COLOR_ACCENT} />
                      </TouchableOpacity>
                    </View>

                    {showDatePicker && (
                      <DateTimePicker
                        value={showDatePicker === 'start' ? dateRange.startDate : dateRange.endDate}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(_, sel) => {
                          setShowDatePicker(null);
                          if (!sel) return;
                          setDateRange((prev) =>
                            showDatePicker === 'start'
                              ? { ...prev, startDate: dayjs(sel).startOf('day').toDate() }
                              : { ...prev, endDate: dayjs(sel).endOf('day').toDate() }
                          );
                        }}
                      />
                    )}
                  </View>
                </ScrollView>

                <View style={styles.filterActions}>
                  <TouchableOpacity
                    style={styles.resetBtn}
                    onPress={() =>
                      setDateRange({
                        startDate: dayjs().startOf('month').toDate(),
                        endDate: dayjs().endOf('day').toDate(),
                      })
                    }
                  >
                    <Text style={styles.resetTxt}>Reset</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.applyBtn} onPress={() => setShowFilters(false)}>
                    <Text style={styles.applyTxt}>Apply</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Create Wakaalad Modal */}
      <CreateWakaaladModal
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          fetchAll();
        }}
      />

      {/* Actions Modal (Edit / Restock / Delete) */}
      <WakaaladActionsModal
        visible={actionModalOpen}
        mode={actionMode}
        wakaalad={selectedWk}
        onClose={() => setActionModalOpen(false)}
        onSuccess={() => {
          setActionModalOpen(false);
          fetchAll();
        }}
      />
    </View>
  );
}

const CARD_WIDTH = (width - 16 * 2 - 10 * 2) / 3;

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLOR_BG },

  header: {
    paddingBottom: 4,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  headerRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D8E0F5',
  },
  headerTitle: { fontSize: 15, fontWeight: '800', color: '#E0E7FF', textAlign: 'center' },
  headerDate: { color: '#CBD5E1', fontSize: 10, marginTop: 2, textAlign: 'center' },

  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D8E0F5',
  },
  createBtnTxt: { color: COLOR_ACCENT, fontWeight: '800', fontSize: 11 },

  searchRow: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 },
  searchBox: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLOR_DIV,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
  },
  searchInput: { flex: 1, fontSize: 11, paddingVertical: 2, color: COLOR_TEXT },
  headerFilterBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DDE3F0',
    marginLeft: 6,
  },
  headerFilterTxtSmall: { color: COLOR_ACCENT, fontSize: 10, fontWeight: '800' },

  // BIG Unit Selector (prominent)
  unitBar: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    paddingTop: 0,
  },
  unitBarLabel: {
    fontSize: 10,
    color: '#334155',
    fontWeight: '900',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  unitChipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  unitChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D9E3FF',
    backgroundColor: '#ECF2FF',
  },
  unitChipActive: {
    backgroundColor: COLOR_ACCENT,
    borderColor: COLOR_ACCENT,
  },
  unitChipTxt: {
    color: COLOR_ACCENT,
    fontSize: 11,
    fontWeight: '900',
  },
  unitChipTxtActive: {
    color: '#FFFFFF',
  },

  scrollContent: { padding: 12, paddingBottom: 24 },
  loading: { padding: 20, alignItems: 'center', justifyContent: 'center' },
  empty: { paddingVertical: 36, alignItems: 'center', justifyContent: 'center', gap: 6 },
  emptyText: { color: COLOR_MUTED, fontSize: 12 },

  card: {
    backgroundColor: COLOR_CARD,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E9EEF6',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
    flexDirection: 'row',
    gap: 10,
    shadowColor: 'rgba(2,6,23,0.04)',
    shadowOpacity: 1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 13, fontWeight: '900', color: COLOR_TEXT, flexShrink: 1, paddingRight: 8 },

  actionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E0E7F0',
  },
  actionsBtnTxt: { color: COLOR_ACCENT, fontWeight: '900', fontSize: 11 },

  metaRow: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  metaPill: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E7ECF3',
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: { color: COLOR_TEXT, fontSize: 10, fontWeight: '700' },

  // Progress
  progressWrap: { marginTop: 10, height: 20, justifyContent: 'center' },
  progressBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 10,
    backgroundColor: '#E5E7EB',
    borderRadius: 999,
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    height: 10,
    backgroundColor: COLOR_ACCENT, // dark blue fill
    borderRadius: 999,
  },
  progressTag: {
    position: 'absolute',
    bottom: 12, // sits just above the bar
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: COLOR_ACCENT,
    borderRadius: 8,
  },
  progressTagTxt: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },

  // Stats
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  statBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7ECF3',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  statBoxSmall: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#ECFEFF',
    borderWidth: 1,
    borderColor: '#CFFAFE',
    borderRadius: 10,
  },
  statLabel: { color: COLOR_MUTED, fontSize: 10, fontWeight: '700', marginBottom: 2 },
  statValue: { color: COLOR_TEXT, fontSize: 13, fontWeight: '900' },
  statMini: { color: '#0369A1', fontSize: 10, fontWeight: '900' },

  breakdownText: { color: '#6B7280', fontSize: 10, marginTop: 0 },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#EBEFF5',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 14, fontWeight: '900', color: COLOR_TEXT },

  filterSection: { marginTop: 8, marginBottom: 8 },
  filterLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.3,
    color: '#6B7280',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  dateRangeContainer: { flexDirection: 'row', alignItems: 'center' },
  dateBtn: {
    flex: 1,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
  },
  dateBtnText: { color: '#1F2937', fontSize: 11, fontWeight: '700' },
  rangeSep: { fontSize: 10, color: '#6B7280', marginHorizontal: 8 },

  filterActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  resetBtn: {
    flex: 1,
    padding: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginRight: 8,
    alignItems: 'center',
    backgroundColor: 'white',
  },
  resetTxt: { fontSize: 11, fontWeight: '800', color: '#1F2937' },
  applyBtn: { flex: 1, padding: 9, borderRadius: 8, backgroundColor: COLOR_ACCENT, alignItems: 'center' },
  applyTxt: { fontSize: 11, fontWeight: '800', color: 'white' },
});
