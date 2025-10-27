// app/app/Wakaalad/wakaaladmovement.tsx
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import dayjs from 'dayjs';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
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

import api from '@/services/api';
import { useAuth } from '@/src/context/AuthContext';

type OilType = 'diesel' | 'petrol' | 'kerosene' | 'jet' | 'hfo' | 'crude' | 'lube';
type MovementType = 'restock' | 'adjustment_in' | 'adjustment_out' | 'sale';

type WakaaladMovementRead = {
  id: number;
  owner_id: number;
  wakaalad_id: number;
  oil_id?: number | null;

  wakaalad_name: string;
  oil_type: OilType | string;
  movement_type: MovementType | string;
  liters: number;
  note?: string | null;

  movement_date: string; // ISO
  created_at: string;    // ISO
};

const COLOR_BG = '#FFFFFF';
const COLOR_TEXT = '#0B1221';
const COLOR_MUTED = '#64748B';
const COLOR_DIV = '#E5E7EB';
const COLOR_CARD = '#F8FAFC';
const COLOR_ACCENT = '#0B2447';

function formatNumber(n?: number | null, fractionDigits = 2) {
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

const WakaaladMovement: React.FC = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  const headers = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : undefined),
    [token]
  );

  // filters
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState<'start' | 'end' | null>(null);
  const [dateRange, setDateRange] = useState({
    startDate: dayjs().startOf('month').toDate(),
    endDate: dayjs().endOf('day').toDate(),
  });

  // data
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<WakaaladMovementRead[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const fetchingRef = useRef(false);

  // back -> menu
  useEffect(() => {
    const onHardwareBackPress = () => {
      router.replace('/menu');
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBackPress);
    return () => sub.remove();
  }, [router]);

  const fetchMovements = useCallback(async (reset = false, atOffset?: number) => {

    if (!headers || fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      if (reset) {
        setLoading(true);
        setOffset(0);
      }
      const currentOffset = reset ? 0 : (atOffset ?? 0);
      const params: any = {
        start: dayjs(dateRange.startDate).toISOString(),
        end: dayjs(dateRange.endDate).toISOString(),
        offset: currentOffset,
        limit: 100,
        order: 'date_desc',
        _ts: Date.now(),
      };

      if (search.trim()) params.q_name = search.trim();

      const res = await api.get('/wakaalad_diiwaan/movements', { headers, params });
      const data = res?.data;
      const newItems: WakaaladMovementRead[] = data?.items ?? [];
      setHasMore(!!data?.has_more);
      setOffset(reset ? newItems.length : currentOffset + newItems.length);
      setItems((prev) => (reset ? newItems : [...prev, ...newItems]));

    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [headers, dateRange, search]);


  useEffect(() => {
  fetchMovements(true, 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [headers, dateRange, search]);


  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchMovements(true);
    setRefreshing(false);
  }, [fetchMovements]);

  const loadMore = useCallback(async () => {
  if (hasMore && !loading && !fetchingRef.current) {
    await fetchMovements(false, offset);
  }
}, [hasMore, loading, offset, fetchMovements]);


  const filtered = useMemo(() => {
    // Client-side date guard (server already filters)
    const from = dayjs(dateRange.startDate).startOf('day').valueOf();
    const to = dayjs(dateRange.endDate).endOf('day').valueOf();
    return items.filter((it) => {
      const t = it.movement_date ? new Date(it.movement_date).getTime() : 0;
      return t >= from && t <= to;
    });
  }, [items, dateRange]);

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
              <Text style={styles.headerTitle}>Wakaalad Movements</Text>
              <Text style={styles.headerDate}>
                {dayjs(dateRange.startDate).format('MMM D, YYYY')} – {dayjs(dateRange.endDate).format('MMM D, YYYY')}
              </Text>
            </View>

            {/* Filters */}
            <TouchableOpacity
              onPress={() => setShowFilters(true)}
              activeOpacity={0.9}
              style={styles.filterBtn}
              accessibilityRole="button"
              accessibilityLabel="Filter"
            >
              <Feather name="filter" size={12} color={COLOR_ACCENT} />
              <Text style={styles.filterBtnTxt}>Filter</Text>
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
            placeholder="Search wakaalad name…"
            placeholderTextColor={COLOR_MUTED}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => fetchMovements(true)}
          />
          {!!search && (
            <TouchableOpacity
              onPress={() => { setSearch(''); fetchMovements(true); }}
            >
              <Feather name="x-circle" size={12} color={COLOR_MUTED} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => fetchMovements(true)} style={styles.refreshChip}>
            <Feather name="rotate-cw" size={12} color={COLOR_ACCENT} />
            <Text style={styles.refreshChipTxt}>Reload</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Table */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
        onMomentumScrollEnd={loadMore}
      >
        {/* Header row */}
        <View style={styles.tableHeader}>
          <Text style={[styles.th, { flex: 1.2 }]}>Wakaalad</Text>
          <Text style={[styles.th, { flex: 0.9 }]}>Oil</Text>
          <Text style={[styles.th, { width: 84, textAlign: 'right' }]}>Liters</Text>
        </View>

        {/* Rows */}
        {loading && items.length === 0 ? (
          <View style={styles.loading}>
            <ActivityIndicator />
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="inbox" size={18} color={COLOR_MUTED} />
            <Text style={styles.emptyText}>No movements found.</Text>
          </View>
        ) : (
          filtered.map((mv) => (
            <View key={mv.id} style={styles.row}>
              {/* col 1: name + subline date */}
              <View style={{ flex: 1.2, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>{mv.wakaalad_name}</Text>
                <Text style={styles.subLine} numberOfLines={1}>
                  {formatDateLocal(mv.movement_date)} • {String(mv.movement_type || '').toUpperCase()}
                </Text>
              </View>

              {/* col 2: oil type */}
              <View style={{ flex: 0.9, minWidth: 0, alignItems: 'flex-start' }}>
                <View style={styles.pill}>
                  <Feather name="droplet" size={10} color={COLOR_TEXT} />
                  <Text style={styles.pillTxt}>{String(mv.oil_type || '—').toUpperCase()}</Text>
                </View>
              </View>

              {/* col 3: liters */}
              <View style={{ width: 84 }}>
                <Text style={styles.liters} numberOfLines={1} adjustsFontSizeToFit>{formatNumber(mv.liters, 2)}</Text>
              </View>
            </View>
          ))
        )}

        {/* Lazy-load indicator */}
        {hasMore && items.length > 0 && (
          <View style={{ paddingVertical: 10, alignItems: 'center' }}>
            <ActivityIndicator />
          </View>
        )}
      </ScrollView>

      {/* Filters Modal */}
      <Modal visible={showFilters} transparent animationType="fade" onRequestClose={() => setShowFilters(false)}>
        <TouchableWithoutFeedback onPress={() => setShowFilters(false)}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={[styles.modalCard, { width: '94%', maxWidth: 520 }]}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Filters</Text>
                  <TouchableOpacity onPress={() => setShowFilters(false)}>
                    <Feather name="x" size={16} color="#1F2937" />
                  </TouchableOpacity>
                </View>

                <View style={{ marginTop: 8 }}>
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
                  <TouchableOpacity
                    style={styles.applyBtn}
                    onPress={() => {
                      setShowFilters(false);
                      fetchMovements(true);
                    }}
                  >
                    <Text style={styles.applyTxt}>Apply</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
};

export default WakaaladMovement;

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
  filterBtn: {
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
  filterBtnTxt: { color: COLOR_ACCENT, fontWeight: '800', fontSize: 11 },

  searchRow: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
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
  refreshChip: {
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
  refreshChipTxt: { color: COLOR_ACCENT, fontSize: 10, fontWeight: '800' },

  scrollContent: { paddingHorizontal: 12, paddingBottom: 24 },

  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLOR_DIV,
    paddingVertical: 6,
    paddingHorizontal: 4,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    marginBottom: 6,
  },
  th: { color: '#111827', fontSize: 11, fontWeight: '900' },

  row: {
    backgroundColor: COLOR_CARD,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E9EEF6',
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: { color: COLOR_TEXT, fontSize: 12, fontWeight: '900' },
  subLine: { color: COLOR_MUTED, fontSize: 10, marginTop: 2 },

  pill: {
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
  pillTxt: { color: COLOR_TEXT, fontSize: 10, fontWeight: '700' },

  liters: { color: COLOR_TEXT, fontSize: 12, fontWeight: '900', textAlign: 'right' },

  loading: { padding: 20, alignItems: 'center', justifyContent: 'center' },
  empty: { paddingVertical: 36, alignItems: 'center', justifyContent: 'center', gap: 6 },
  emptyText: { color: COLOR_MUTED, fontSize: 12 },

  // modal
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
