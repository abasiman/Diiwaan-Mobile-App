// Vendor Payments Screen (scrollable + smooth + robust infinite scroll)
import api from '@/services/api';
import { useAuth } from '@/src/context/AuthContext';
import { AntDesign, Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import NetInfo from '@react-native-community/netinfo';
import { useFocusEffect } from '@react-navigation/native';
import dayjs from 'dayjs';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getVendorPaymentsForOwner,
  saveVendorPaymentsForOwner,
} from '../vendorPaymentTransactionsOffline/vendorPaymentsScreenRepo';

/** Server types (from /diiwaanvendorpayments list endpoint) */
type ExtraCostSummary = {
  id: number;
  category?: string | null;
  description?: string | null;
  amount: number;
  total_paid: number;
  due: number;
};
type SupplierDueItem = {
  supplier_name: string;
  lot_id?: number | null;
  oil_id?: number | null;
  oil_type?: string | null;
  liters?: number | null;
  truck_plate?: string | null;
  truck_type?: string | null;
  oil_total_landed_cost: number;
  total_extra_cost: number;
  over_all_cost: number;
  total_paid: number;
  amount_due: number;
  date?: string | null;
  last_payment_amount_due_snapshot?: number | null;
  last_payment_amount?: number | null;
  last_payment_date?: string | null;
  last_payment_transaction_type?: string | null;
  extra_costs: ExtraCostSummary[];
};
type VendorPaymentRead = {
  id: number;
  amount: number;
  amount_due: number;
  note?: string | null;
  payment_method?: string | null;
  payment_date: string;
  supplier_name?: string | null;
  lot_id?: number | null;
  oil_id?: number | null;
  extra_cost_id?: number | null;
  created_at: string;
  updated_at: string;
  truck_plate?: string | null;
  truck_type?: string | null;
  transaction_type?: string | null;
  currency?: string | null;
  fx_rate_to_usd?: number | null;
};
type VendorPaymentWithContext = VendorPaymentRead & {
  supplier_due_context?: SupplierDueItem | null;
  extra_cost_context?: ExtraCostSummary | null;
};
type VendorPaymentTotals = {
  count: number;
  sum_amount: number;
  totals_by_supplier: Array<{ supplier_name: string; sum_amount: number }>;
  totals_by_extra_cost: Array<{
    extra_cost_id: number;
    category?: string | null;
    description?: string | null;
    sum_paid: number;
    cap_amount: number;
    due_remaining: number;
  }>;
  total_amount_due_now: number;
  totals_due_by_supplier: Array<{ supplier_name: string; sum_amount: number }>;
};
type VendorPaymentListResponse = {
  items: VendorPaymentWithContext[];
  totals: VendorPaymentTotals;
};

/* ===== UI consts ===== */
const COLOR_BG = '#FFFFFF';
const COLOR_TEXT = '#0B1221';
const COLOR_MUTED = '#64748B';
const COLOR_DIV = '#E5E7EB';
const COLOR_GREEN = '#16a34a';
const COLOR_RED = '#b91c1c';
const COLOR_CARD = '#FFFFFF';

const formatCurrency = (n: number | undefined | null) =>
  `$${Number(n ?? 0).toFixed(2)}`;
const fmtDateLocal = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
};
const breakTxAtPlusForUI = (s: string) => s.replace(/\s*\+\s*/g, '\n+ ');

const API_DATE_FMT = 'YYYY-MM-DD';
type ViewMode = 'all' | 'base' | 'extras';

export default function VendorPaymentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();

  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sub = NetInfo.addEventListener((state) => {
      const ok = Boolean(state.isConnected && state.isInternetReachable);
      setOnline(ok);
    });
    return () => sub();
  }, []);

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<VendorPaymentWithContext[]>([]);
  const [totals, setTotals] = useState<VendorPaymentTotals | null>(null); // kept if you ever want server totals

  // Filters
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState<'start' | 'end' | null>(
    null
  );
  const [dateRange, setDateRange] = useState({
    startDate: dayjs().startOf('month').toDate(),
    endDate: dayjs().endOf('day').toDate(),
  });

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>('all');

  // Plate filter
  const [platePickerOpen, setPlatePickerOpen] = useState(false);
  const [plateQuery, setPlateQuery] = useState('');
  const [selectedPlate, setSelectedPlate] = useState<string | null>(null);

  // Pagination
  const PAGE_SIZE = 100;
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const fetchingRef = useRef(false);

  // Momentum guard
  const onEndMomentum = useRef(false);

  const headers = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : undefined),
    [token]
  );

  // Build common params
  const dateParams = useMemo(() => {
    const start = dayjs(dateRange.startDate)
      .startOf('day')
      .format(API_DATE_FMT);
    const end = dayjs(dateRange.endDate).endOf('day').format(API_DATE_FMT);
    return {
      order: 'created_desc' as const,
      from_date: `${start}T00:00:00Z`,
      to_date: `${end}T23:59:59Z`,
    };
  }, [dateRange]);

  // ===== Fetch page helper =====
  const fetchPage = useCallback(
    async (pageOffset: number, opts?: { replace?: boolean; silent?: boolean }) => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;
      const { replace = false, silent = false } = opts || {};

      const ownerId = user?.id ?? 0;

      try {
        if (!silent && replace) setLoading(true);
        if (!replace) setLoadingMore(true);

        // OFFLINE or unauthenticated → use cached snapshot
        if (!online || !token || !ownerId) {
          console.log(
            '[VendorPayments] offline or no token → using local cache only'
          );

          if (pageOffset !== 0) {
            setHasMore(false);
            return;
          }

          if (!ownerId) {
            setItems([]);
            setHasMore(false);
            setOffset(0);
            return;
          }

          const local = await getVendorPaymentsForOwner(ownerId);
          setItems(local);
          setHasMore(false);
          setOffset(local.length);
          return;
        }

        // ONLINE → use API pagination as before
        const res = await api.get<VendorPaymentListResponse>(
          '/diiwaanvendorpayments',
          {
            headers,
            params: {
              ...dateParams,
              limit: PAGE_SIZE,
              offset: pageOffset,
            },
          }
        );

        const pageItems = res?.data?.items ?? [];

        // 🔹 On first page online, refresh offline cache snapshot for this owner
        if (ownerId && pageOffset === 0) {
          try {
            await saveVendorPaymentsForOwner(ownerId, pageItems);
          } catch (err) {
            console.warn('[VendorPayments] failed to save offline cache', err);
          }
        }

        if (replace) {
          setItems(pageItems);
        } else {
          setItems((prev) => [...prev, ...pageItems]);
        }
        setTotals(res?.data?.totals ?? null);

        // More?
        setHasMore(pageItems.length === PAGE_SIZE);
        setOffset(pageOffset + pageItems.length);
      } catch (e: any) {
        console.warn(
          '[VendorPayments] fetchPage failed, falling back to cache',
          e
        );

        // 🔹 Fallback to local cache on ANY error (handles cold-start-offline case)
        if (ownerId) {
          const local = await getVendorPaymentsForOwner(ownerId);
          setItems(local);
          setHasMore(false);
          setOffset(local.length);
        } else {
          setItems([]);
          setHasMore(false);
          setOffset(0);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
        fetchingRef.current = false;
        onEndMomentum.current = false;
      }
    },
    [headers, dateParams, online, token, user?.id]
  );

  // Initial load + when dateRange changes
  useEffect(() => {
    setOffset(0);
    setHasMore(true);
    fetchPage(0, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchPage, dateParams.from_date, dateParams.to_date]);

  // Refresh on focus (silent)
  useFocusEffect(
    useCallback(() => {
      setOffset(0);
      setHasMore(true);
      fetchPage(0, { replace: true, silent: true });
    }, [fetchPage])
  );

  // Pull-to-refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setOffset(0);
    setHasMore(true);
    await fetchPage(0, { replace: true, silent: true });
    setRefreshing(false);
  }, [fetchPage]);

  // Infinite scroll trigger
  const onEndReached = useCallback(() => {
    if (onEndMomentum.current) return;
    if (loadingMore || loading || !hasMore) return;
    fetchPage(offset);
    onEndMomentum.current = true;
  }, [loadingMore, loading, hasMore, fetchPage, offset]);

  const onMomentumScrollBegin = useCallback(() => {
    onEndMomentum.current = false;
  }, []);

  /* ===== Plates list ===== */
  const allPlates = useMemo(() => {
    const s = new Set<string>();
    for (const p of items) {
      const plate = (p.truck_plate || '').trim();
      if (plate) s.add(plate);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filteredPlates = useMemo(() => {
    const q = plateQuery.trim().toLowerCase();
    if (!q) return allPlates;
    return allPlates.filter((x) => x.toLowerCase().includes(q));
  }, [allPlates, plateQuery]);

  /* ===== Row shaping ===== */
  type RowKind = 'base' | 'extra' | 'lot';
  const rowsShaped = useMemo(() => {
    return items.map((p) => {
      const kind: RowKind = p.extra_cost_id ? 'extra' : p.oil_id ? 'base' : 'lot';
      let tx = p.transaction_type || '';
      if (!tx && kind === 'base') {
        const oilType = p.supplier_due_context?.oil_type
          ?.toLowerCase()
          .trim();
        if (oilType === 'diesel' || oilType === 'petrol')
          tx = `${oilType} cost`;
      }
      if (!tx) tx = kind === 'base' ? 'oil cost' : '—';

      return {
        id: p.id,
        kind,
        truckType: p.truck_type || '—',
        truckPlate: p.truck_plate || '—',
        datePretty: fmtDateLocal(p.payment_date),
        transactionForUI: breakTxAtPlusForUI(tx),
        amount: Number(p.amount || 0),
        balanceSnapshot: Number(p.amount_due || 0),
        rawDate: p.payment_date,
      };
    });
  }, [items]);

  // Filter (date range + plate + search + view mode)
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();

    const start = dayjs(dateRange.startDate).startOf('day');
    const end = dayjs(dateRange.endDate).endOf('day');

    return rowsShaped
      .filter((r) => {
        const d = dayjs(r.rawDate);
        if (!d.isValid()) return false;
        if (d.isBefore(start) || d.isAfter(end)) return false;

        if (viewMode === 'base' && r.kind !== 'base') return false;
        if (viewMode === 'extras' && r.kind !== 'extra') return false;
        if (selectedPlate && r.truckPlate.trim() !== selectedPlate)
          return false;

        if (!q) return true;
        const hay = `${r.truckType} ${r.truckPlate} ${r.transactionForUI}`.toLowerCase();
        return hay.includes(q);
      })
      .map((r) => ({
        key: `vp_${r.id}`,
        ...r,
      }));
  }, [rowsShaped, search, selectedPlate, viewMode, dateRange]);

  const filteredTotals = useMemo(() => {
    let sumAmt = 0;
    let sumBal = 0;
    for (const r of filteredRows) {
      sumAmt += r.amount;
      sumBal += r.balanceSnapshot;
    }
    return { sumAmt, sumBal };
  }, [filteredRows]);

  /* ========= Date helpers ========= */
  const todayStart = dayjs().startOf('day');
  const todayEnd = dayjs().endOf('day');
  const monthStart = dayjs().startOf('month');
  const monthEnd = dayjs().endOf('month');
  const yearStart = dayjs().startOf('year');
  const yearEnd = dayjs().endOf('day');

  const sameRange = (
    s: Date,
    e: Date,
    s2: dayjs.Dayjs,
    e2: dayjs.Dayjs
  ) =>
    dayjs(s).startOf('day').valueOf() === s2.startOf('day').valueOf() &&
    dayjs(e).endOf('day').valueOf() === e2.endOf('day').valueOf();

  const isTodayActive = sameRange(
    dateRange.startDate,
    dateRange.endDate,
    todayStart,
    todayEnd
  );
  const isMonthActive = sameRange(
    dateRange.startDate,
    dateRange.endDate,
    monthStart,
    monthEnd
  );
  const isYearActive = sameRange(
    dateRange.startDate,
    dateRange.endDate,
    yearStart,
    yearEnd
  );

  const applyQuickRange = (key: 'today' | 'month' | 'year') => {
    if (key === 'today')
      setDateRange({
        startDate: todayStart.toDate(),
        endDate: todayEnd.toDate(),
      });
    else if (key === 'month')
      setDateRange({
        startDate: monthStart.toDate(),
        endDate: monthEnd.toDate(),
      });
    else
      setDateRange({
        startDate: yearStart.toDate(),
        endDate: yearEnd.toDate(),
      });
    setShowFilters(false);
    setOffset(0);
    setHasMore(true);
    fetchPage(0, { replace: true, silent: true });
  };

  const handleDateChange = (_: any, sel?: Date) => {
    const mode = showDatePicker;
    setShowDatePicker(null);
    if (!sel || !mode) return;
    const nextRange =
      mode === 'start'
        ? { ...dateRange, startDate: dayjs(sel).startOf('day').toDate() }
        : { ...dateRange, endDate: dayjs(sel).endOf('day').toDate() };
    setDateRange(nextRange);
  };

  // Loading footer
  const ListFooter = useMemo(() => {
    if (!loadingMore) return <View style={{ height: 18 }} />;
    return (
      <View
        style={{
          paddingVertical: 14,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator />
        <Text style={{ color: COLOR_MUTED, fontSize: 11, marginTop: 6 }}>
          Loading more…
        </Text>
      </View>
    );
  }, [loadingMore]);

  return (
    <View style={styles.page}>
      {/* Header */}
      <LinearGradient
        colors={['#0B2447', '#0B2447']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/menu')}
          style={styles.backBtn}
        >
          <Feather name="arrow-left" size={16} color="#fff" />
        </TouchableOpacity>

        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.headerTitle}>Vendor Payments</Text>
          <Text style={styles.headerSub}>
            {dayjs(dateRange.startDate).format('MMM D, YYYY')} –{' '}
            {dayjs(dateRange.endDate).format('MMM D, YYYY')}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity onPress={onRefresh} style={styles.headerFilterBtn}>
            <Feather name="rotate-cw" size={14} color="#0B2447" />
            <Text style={styles.headerFilterTxt}>
              {refreshing ? 'Refreshing…' : 'Reload'}
            </Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* Search + Filters Row */}
      <View style={styles.filterRow}>
        <View style={styles.searchBox}>
          <Feather name="search" size={14} color={COLOR_MUTED} />
          <TextInput
            placeholder="Search (truck, plate, transaction, note)"
            placeholderTextColor={COLOR_MUTED}
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Feather name="x-circle" size={14} color={COLOR_MUTED} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={styles.filterBtn}
          onPress={() => setShowFilters(true)}
        >
          <Feather name="filter" size={14} color="#0B2447" />
          <Text style={styles.filterBtnTxt}>Filter</Text>
        </TouchableOpacity>
      </View>

      {/* View Mode Chips */}
      <View
        style={{
          flexDirection: 'row',
          gap: 6,
          paddingHorizontal: 12,
          marginBottom: 6,
        }}
      >
        {(['all', 'base', 'extras'] as ViewMode[]).map((mode) => (
          <TouchableOpacity
            key={mode}
            onPress={() => setViewMode(mode)}
            style={[styles.chip, viewMode === mode && styles.chipActive]}
          >
            <Text
              style={[
                styles.chipText,
                viewMode === mode && styles.chipTextActive,
              ]}
            >
              {mode === 'all'
                ? 'All'
                : mode === 'base'
                ? 'Oil only'
                : 'Extras only'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Totals + Plate Picker */}
      <View style={styles.kpiRow}>
        <View style={styles.kpiCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kpiTitle}>
              {viewMode === 'base'
                ? 'Total Paid (Oil)'
                : viewMode === 'extras'
                ? 'Total Paid (Extras)'
                : 'Total Paid'}
            </Text>
            <Text style={[styles.kpiValue, { color: COLOR_GREEN }]}>
              {formatCurrency(filteredTotals.sumAmt)}
            </Text>

            <View style={{ marginTop: 8 }}>
              <Text style={styles.kpiSubLabel}>
                {viewMode === 'base'
                  ? 'Base Due'
                  : viewMode === 'extras'
                  ? 'Extras Due'
                  : 'Balance Due'}
              </Text>
              <Text style={[styles.kpiDueValue]}>
                {formatCurrency(filteredTotals.sumBal)}
              </Text>
            </View>
          </View>

          <View style={styles.plateCol}>
            <Text style={styles.plateLabel}>Truck Plate</Text>
            <TouchableOpacity
              style={styles.plateBtn}
              onPress={() => {
                setPlateQuery('');
                setPlatePickerOpen(true);
              }}
              activeOpacity={0.9}
            >
              <Feather name="truck" size={14} color="#0B2447" />
              <Text style={styles.plateBtnTxt}>
                {selectedPlate ? selectedPlate : 'All plates'}
              </Text>
              <Feather name="chevron-down" size={16} color="#0B2447" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ===== Table Card (FlatList is the ONLY scroller) ===== */}
      <View
        style={[styles.tableCard, { marginHorizontal: 10, marginBottom: 10, flex: 1 }]}
      >
        <FlatList
          data={filteredRows}
          keyExtractor={(r) => r.key}
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingBottom: Math.max(insets.bottom, 16),
          }}
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
          overScrollMode="always"
          nestedScrollEnabled={false}
          removeClippedSubviews
          initialNumToRender={20}
          maxToRenderPerBatch={30}
          windowSize={10}
          updateCellsBatchingPeriod={40}
          onEndReachedThreshold={0.25}
          onEndReached={onEndReached}
          onMomentumScrollBegin={onMomentumScrollBegin}
          refreshing={refreshing}
          onRefresh={onRefresh}
          stickyHeaderIndices={[0]}
          ListHeaderComponent={
            <View>
              <View style={[styles.tr, styles.thRow]}>
                <View style={[styles.thCell, styles.colTruck]}>
                  <Text style={styles.th}>Truck</Text>
                </View>
                <View style={[styles.thCell, styles.colTx]}>
                  <Text style={styles.th}>Transaction</Text>
                </View>
                <View style={[styles.thCell, styles.colAmt]}>
                  <Text style={[styles.th, styles.num]}>Amount</Text>
                </View>
              </View>
            </View>
          }
          renderItem={({ item, index }) => {
            const odd = index % 2 === 1;
            return (
              <View style={[styles.tr, odd && styles.striped]}>
                <View style={[styles.cell, styles.colTruck]}>
                  <Text style={styles.td} numberOfLines={1}>
                    {item.truckType}
                  </Text>
                  <Text style={styles.tdSub} numberOfLines={1}>
                    {item.truckPlate}
                  </Text>
                  <Text style={styles.tdSub} numberOfLines={1}>
                    {item.datePretty}
                  </Text>
                </View>
                <View style={[styles.cell, styles.colTx]}>
                  <Text
                    style={[styles.td, styles.txWrap]}
                    numberOfLines={3}
                    ellipsizeMode="tail"
                  >
                    {item.transactionForUI}
                  </Text>
                </View>
                <View style={[styles.cell, styles.colAmt]}>
                  <Text
                    style={[styles.td, styles.num, styles.paid]}
                    numberOfLines={1}
                  >
                    {formatCurrency(item.amount)}
                  </Text>
                  <Text
                    style={[
                      styles.tdSub,
                      styles.num,
                      { color: COLOR_RED },
                    ]}
                    numberOfLines={1}
                  >
                    {formatCurrency(item.balanceSnapshot)}
                  </Text>
                </View>
              </View>
            );
          }}
          ListFooterComponent={ListFooter}
          ListEmptyComponent={
            !loading ? (
              <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                <Text style={[styles.tdSub]}>No payments</Text>
              </View>
            ) : null
          }
        />
      </View>

      {/* Filters Modal */}
      <Modal
        visible={showFilters}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFilters(false)}
      >
        <View style={styles.filterOverlay}>
          <View
            style={[
              styles.filterContent,
              { paddingBottom: (insets.bottom || 0) + 8 },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filters</Text>
              <TouchableOpacity onPress={() => setShowFilters(false)}>
                <AntDesign name="close" size={18} color="#1F2937" />
              </TouchableOpacity>
            </View>

            {/* Quick ranges */}
            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Quick Ranges</Text>
              <View style={styles.quickChips}>
                <TouchableOpacity
                  onPress={() => applyQuickRange('today')}
                  style={[styles.chip, isTodayActive && styles.chipActive]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      isTodayActive && styles.chipTextActive,
                    ]}
                  >
                    Today ({dayjs().format('ddd')})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => applyQuickRange('month')}
                  style={[styles.chip, isMonthActive && styles.chipActive]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      isMonthActive && styles.chipTextActive,
                    ]}
                  >
                    This Month ({dayjs().format('MMM')})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => applyQuickRange('year')}
                  style={[styles.chip, isYearActive && styles.chipActive]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      isYearActive && styles.chipTextActive,
                    ]}
                  >
                    This Year ({dayjs().format('YYYY')})
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Date range pickers */}
            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Date Range</Text>
              <View style={styles.dateRangeContainer}>
                <TouchableOpacity
                  style={styles.dateBtn}
                  onPress={() => setShowDatePicker('start')}
                >
                  <Text style={styles.dateBtnText}>
                    {dayjs(dateRange.startDate).format('MMM D, YYYY')}
                  </Text>
                  <Feather name="calendar" size={14} color="#0B2447" />
                </TouchableOpacity>
                <Text style={styles.rangeSep}>to</Text>
                <TouchableOpacity
                  style={styles.dateBtn}
                  onPress={() => setShowDatePicker('end')}
                >
                  <Text style={styles.dateBtnText}>
                    {dayjs(dateRange.endDate).format('MMM D, YYYY')}
                  </Text>
                  <Feather name="calendar" size={14} color="#0B2447" />
                </TouchableOpacity>
              </View>

              {showDatePicker && (
                <DateTimePicker
                  value={
                    showDatePicker === 'start'
                      ? dateRange.startDate
                      : dateRange.endDate
                  }
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={handleDateChange}
                />
              )}
            </View>

            {/* Actions */}
            <View style={styles.filterActions}>
              <TouchableOpacity
                style={styles.resetBtn}
                onPress={() => {
                  const next = {
                    startDate: dayjs().startOf('month').toDate(),
                    endDate: dayjs().endOf('day').toDate(),
                  };
                  setDateRange(next);
                  setOffset(0);
                  setHasMore(true);
                }}
                activeOpacity={0.9}
              >
                <Text style={styles.resetTxt}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.applyBtn}
                onPress={() => {
                  setShowFilters(false);
                  setOffset(0);
                  setHasMore(true);
                  fetchPage(0, { replace: true, silent: true });
                }}
                activeOpacity={0.9}
              >
                <Text style={styles.applyTxt}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Truck Plate Picker Modal */}
      <Modal
        visible={platePickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPlatePickerOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setPlatePickerOpen(false)}>
          <View style={styles.plateOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View
                style={[
                  styles.plateContent,
                  { paddingBottom: (insets.bottom || 0) + 8 },
                ]}
              >
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Select Truck Plate</Text>
                  <TouchableOpacity
                    onPress={() => setPlatePickerOpen(false)}
                  >
                    <AntDesign name="close" size={18} color="#1F2937" />
                  </TouchableOpacity>
                </View>

                <View style={styles.plateSearchBox}>
                  <Feather name="search" size={12} color={COLOR_MUTED} />
                  <TextInput
                    value={plateQuery}
                    onChangeText={setPlateQuery}
                    placeholder="Search plate…"
                    placeholderTextColor={COLOR_MUTED}
                    style={styles.plateSearchInput}
                    autoCapitalize="characters"
                    returnKeyType="search"
                  />
                  {!!plateQuery && (
                    <TouchableOpacity onPress={() => setPlateQuery('')}>
                      <Feather name="x-circle" size={12} color={COLOR_MUTED} />
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.plateList}>
                  <TouchableOpacity
                    style={[
                      styles.plateItem,
                      !selectedPlate && styles.plateItemActive,
                    ]}
                    onPress={() => {
                      setSelectedPlate(null);
                      setPlatePickerOpen(false);
                    }}
                  >
                    <Feather name="globe" size={12} color="#0B2447" />
                    <Text style={styles.plateItemTxt}>All plates</Text>
                  </TouchableOpacity>

                  {filteredPlates.length ? (
                    filteredPlates.map((pl) => (
                      <TouchableOpacity
                        key={pl}
                        style={[
                          styles.plateItem,
                          selectedPlate === pl && styles.plateItemActive,
                        ]}
                        onPress={() => {
                          setSelectedPlate(pl);
                          setPlatePickerOpen(false);
                        }}
                      >
                        <Feather name="truck" size={12} color="#0B2447" />
                        <Text style={styles.plateItemTxt}>{pl}</Text>
                      </TouchableOpacity>
                    ))
                  ) : (
                    <View style={styles.plateEmpty}>
                      <Text style={styles.plateEmptyTxt}>No matches</Text>
                    </View>
                  )}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

/* Styles – unchanged from your original */
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLOR_BG },

  header: {
    paddingBottom: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  backBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 14, fontWeight: '900' },
  headerSub: { color: '#cbd5e1', fontSize: 10, marginTop: 2 },
  headerFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerFilterTxt: { color: '#0B2447', fontSize: 11, fontWeight: '900' },

  filterRow: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: COLOR_DIV,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 36,
    backgroundColor: '#fff',
  },
  searchInput: { flex: 1, color: COLOR_TEXT, fontSize: 12, padding: 0 },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterBtnTxt: { color: '#0B2447', fontSize: 11, fontWeight: '900' },

  /* KPI row + card */
  kpiRow: { paddingHorizontal: 12, marginBottom: 8 },
  kpiCard: {
    backgroundColor: COLOR_CARD,
    borderWidth: 1,
    borderColor: COLOR_DIV,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
  },
  kpiTitle: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '900',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  kpiValue: {
    marginTop: 2,
    fontSize: 18,
    fontWeight: '900',
    color: COLOR_TEXT,
  },
  kpiSubLabel: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '800',
  },
  kpiDueValue: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: '900',
    color: COLOR_RED,
  },

  plateCol: {
    width: 180,
    justifyContent: 'flex-start',
  },
  plateLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '900',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  plateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2FF',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DDE3F0',
  },
  plateBtnTxt: { color: '#0B2447', fontWeight: '900', fontSize: 12, flex: 1 },

  /* Table card */
  tableCard: {
    borderWidth: 1,
    borderColor: COLOR_DIV,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#fff',
    flex: 1,
  },

  /* Row layout */
  tr: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLOR_DIV,
    alignItems: 'stretch',
    minHeight: 44,
    paddingHorizontal: 6,
  },
  thRow: { backgroundColor: '#F8FAFC' },

  colTruck: { flex: 0.5, minWidth: 0 },
  colTx: { flex: 0.2, minWidth: 0 },
  colAmt: { flex: 0.3, minWidth: 0, alignItems: 'flex-end', paddingLeft: 14 },

  thCell: {
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  cell: { justifyContent: 'center', paddingVertical: 7, paddingHorizontal: 4 },

  th: { color: COLOR_TEXT, fontSize: 11, fontWeight: '800' },
  td: { color: COLOR_TEXT, fontSize: 11 },
  tdSub: { color: COLOR_MUTED, fontSize: 10, paddingTop: 1.5 },

  txWrap: { flexShrink: 1, lineHeight: 14, includeFontPadding: false },
  num: { textAlign: 'right' as const },

  striped: { backgroundColor: '#FBFDFF' },

  paid: { color: COLOR_GREEN, fontWeight: '900' },

  /* Modal (shared) */
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: { fontSize: 15, fontWeight: '800', color: '#1F2937' },

  /* Filters modal */
  filterOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  filterContent: {
    width: '94%',
    maxWidth: 520,
    maxHeight: '86%',
    backgroundColor: 'white',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EEF1F6',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 10 },
      },
      android: { elevation: 12 },
    }),
  },
  filterSection: { marginBottom: 10 },
  filterLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.3,
    color: '#6B7280',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  quickChips: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F1F5F9',
    marginRight: 6,
    marginBottom: 6,
  },
  chipActive: { backgroundColor: '#0B2447', borderColor: '#0B2447' },
  chipText: { fontSize: 11, color: '#334155', fontWeight: '800' },
  chipTextActive: { color: '#fff' },
  dateRangeContainer: { flexDirection: 'row', alignItems: 'center' },
  dateBtn: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
  },
  dateBtnText: { color: '#1F2937', fontSize: 12, fontWeight: '700' },
  rangeSep: { fontSize: 11, color: '#6B7280', marginHorizontal: 8 },
  filterActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  resetBtn: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginRight: 8,
    alignItems: 'center',
    backgroundColor: 'white',
  },
  resetTxt: { fontSize: 12, fontWeight: '800', color: '#1F2937' },
  applyBtn: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#0B2447',
    alignItems: 'center',
  },
  applyTxt: { fontSize: 12, fontWeight: '800', color: 'white' },

  /* Plate picker modal */
  plateOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  plateContent: {
    width: '94%',
    maxWidth: 480,
    maxHeight: '80%',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EEF1F6',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 10 },
      },
      android: { elevation: 12 },
    }),
  },
  plateSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: COLOR_DIV,
    borderRadius: 8,
    paddingHorizontal: 8,
    height: 34,
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  plateSearchInput: {
    flex: 1,
    color: COLOR_TEXT,
    fontSize: 12,
    padding: 0,
  },
  plateList: { maxHeight: '80%' },
  plateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  plateItemActive: {
    backgroundColor: '#EEF2FF',
  },
  plateItemTxt: { color: COLOR_TEXT, fontSize: 12, fontWeight: '800' },
  plateEmpty: { paddingVertical: 16, alignItems: 'center' },
  plateEmptyTxt: { color: COLOR_MUTED, fontSize: 12 },
});
