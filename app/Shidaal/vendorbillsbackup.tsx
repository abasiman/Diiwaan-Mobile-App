// app/(tabs)/TrackVendorBills/vendorbills.tsx
import { AntDesign, Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import dayjs from 'dayjs';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
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

import OilActionsModal from '../Shidaal/OilActionsModal';

import api from '@/services/api';
import { useAuth } from '@/src/context/AuthContext';
import OilExtraCostModal from '../Shidaal/oilExtraCostModal';
import VendorPaymentCreateSheet from '../Shidaal/vendorpayment';

const { width } = Dimensions.get('window');

/** -------- Oil Summary types (from oildashboard) -------- */
type OilType = 'diesel' | 'petrol';
type OilStatus = 'in_transit' | 'in_depot' | 'available' | 'reserved' | 'sold' | 'returned' | 'discarded';

type OilTypeTotals = {
  count: number;
  total_instock_l: number;
  total_sold_l: number;
};

type DiiwaanOilRead = {
  id: number;
  oil_type: OilType;
  liters: number;
  in_stock_l: number;
  sold_l: number;
  available_l: number;
  depot: boolean;
  depot_name?: string | null;
  truck_plate?: string | null;
  truck_type?: string | null;
  currency: string;
  oil_total_cost?: number | null;
  status: OilStatus;
  created_at: string;
  updated_at: string;
};

type SummaryResponse = {
  totals: Record<string, OilTypeTotals>;
  depot_lots: number;
  items: DiiwaanOilRead[];
};

/** -------- Vendor (supplier dues) types -------- */
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
  oil_id?: number | null;
  oil_type?: string | null;
  liters?: number | null;

  truck_plate?: string | null;
  truck_type?: string | null;

  oil_total_landed_cost: number;
  total_extra_cost: number;
  total_paid: number;
  amount_due: number;

  extra_costs: ExtraCostSummary[];
  date?: string | null;
};

type SupplierDueResponse = { items: SupplierDueItem[] };

const COLOR_BG = '#FFFFFF';
const COLOR_TEXT = '#0B1221';
const COLOR_MUTED = '#64748B';
const COLOR_DIV = '#E5E7EB';
const COLOR_CARD = '#F8FAFC';
const COLOR_ACCENT = '#0B2447';
const COLOR_SHADOW = 'rgba(2, 6, 23, 0.06)';

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
function billKey(it: SupplierDueItem, idx: number) {
  const parts = [
    it.oil_id ?? 'none',
    (it.truck_plate ?? '').trim(),
    (it.truck_type ?? '').trim(),
    (it.supplier_name ?? '').trim(),
    (it.oil_type ?? '').trim(),
    (it.date ?? '').trim(),
  ];
  const base = parts.join('|').replace(/\s+/g, ' ');
  return `${base}__${idx}`;
}

export default function VendorBillsScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<SupplierDueItem[]>([]);

  // Oil summary for KPI & in-stock lookup
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const overall = summary?.totals?.__overall__;

  // Details popup
  const [selected, setSelected] = useState<SupplierDueItem | null>(null);
  const detailsOpen = !!selected;

  // Collapsible "Extras" inside details popup
  const [showExtras, setShowExtras] = useState(false);

  // Actions (OilActionsModal)
  const [actionsOpen, setActionsOpen] = useState(false);

  // Extra cost modal
  const [extraModalOpen, setExtraModalOpen] = useState(false);
  const [extraOilId, setExtraOilId] = useState<number | null>(null);

  // Vendor payment sheet (extra or whole-oil)
  const [payOpen, setPayOpen] = useState(false);
  const [payOilId, setPayOilId] = useState<number | null>(null);
  const [payExtraId, setPayExtraId] = useState<number | null>(null);
  const [payVendorName, setPayVendorName] = useState<string | null>(null);
  const [payCurrentDue, setPayCurrentDue] = useState<number>(0);

  // Search + Filters (client-side)
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState<'start' | 'end' | null>(null);
  const [dateRange, setDateRange] = useState({
    startDate: dayjs().startOf('month').toDate(),
    endDate: dayjs().endOf('day').toDate(),
  });

  const headers = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : undefined),
    [token]
  );

  function formatCurrency(n: number | undefined | null, currency = 'USD') {
    const v = Number(n ?? 0);
    const formatted = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v);
    if ((currency || '').toUpperCase() === 'USD') {
      return `$${formatted}`;
    }
    return `${currency} ${formatted}`;
  }

  /** Fetch supplier dues list */
  const fetchVendorDues = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get<SupplierDueResponse>('/diiwaanvendorpayments/supplier-dues', {
        headers: {
          ...(headers || {}),
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
        params: { _ts: Date.now() },
      });
      setItems(res?.data?.items ?? []);
    } catch {
      // optionally toast/log
    } finally {
      setLoading(false);
    }
  }, [headers]);

  /** Fetch oil summary for KPI & in-stock lookup */
  const fetchOilSummary = useCallback(async () => {
    try {
      const res = await api.get<SummaryResponse>('/diiwaanoil/summary', {
        headers: { ...(headers || {}) },
      });
      setSummary(res.data);
    } catch (e) {
      // ignore UI crash
    }
  }, [headers]);

  const fetchAll = useCallback(async () => {
    await Promise.all([fetchVendorDues(), fetchOilSummary()]);
  }, [fetchVendorDues, fetchOilSummary]);

  // Refetch whenever screen gains focus
  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll])
  );

  // Refetch when app returns to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') fetchAll();
    });
    return () => sub.remove();
  }, [fetchAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  const openExtraModal = (oilId?: number | null) => {
    if (!oilId) return;
    setExtraOilId(oilId);
    setExtraModalOpen(true);
  };
  const onExtraCreated = () => {
    setExtraModalOpen(false);
    setExtraOilId(null);
    fetchAll();
  };

  const openPayForExtra = (parent: SupplierDueItem, extra: ExtraCostSummary) => {
    if (!parent.oil_id) return;
    setPayOilId(parent.oil_id);
    setPayExtraId(extra.id);
    setPayVendorName(parent.supplier_name || null);
    setPayCurrentDue(Number(extra.due || 0));
    setPayOpen(true);
  };
  const openPayForOil = (parent: SupplierDueItem) => {
    if (!parent.oil_id) return;
    setPayOilId(parent.oil_id);
    setPayExtraId(null);
    setPayVendorName(parent.supplier_name || null);
    setPayCurrentDue(Number(parent.amount_due || 0));
    setPayOpen(true);
  };
  const onPaymentCreated = async () => {
    await fetchAll();
    setPayOpen(false);
    setPayOilId(null);
    setPayExtraId(null);
    setPayVendorName(null);
    setPayCurrentDue(0);
  };

  const totalDue = useMemo(
    () => items.reduce((acc, x) => acc + (x?.amount_due ?? 0), 0),
    [items]
  );

  /** Build a quick lookup: oil_id -> in_stock_l */
  const oilStockMap = useMemo(() => {
    const map: Record<number, number> = {};
    (summary?.items || []).forEach((it) => {
      if (typeof it.id === 'number') map[it.id] = Number(it.in_stock_l || 0);
    });
    return map;
  }, [summary]);

  /* ======= Derived filtered list (search + date range) ======= */
  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const from = dayjs(dateRange.startDate).startOf('day').valueOf();
    const to = dayjs(dateRange.endDate).endOf('day').valueOf();

    return items.filter((it) => {
      const t = it.date ? new Date(it.date).getTime() : 0;
      const dateOK = t >= from && t <= to;
      if (!q) return dateOK;

      const hay = `${it.supplier_name ?? ''} ${it.truck_plate ?? ''} ${it.truck_type ?? ''} ${it.oil_type ?? ''}`.toLowerCase();
      return dateOK && hay.includes(q);
    });
  }, [items, search, dateRange]);

  /* ======= Date filter helpers ======= */
  const todayStart = dayjs().startOf('day');
  const todayEnd = dayjs().endOf('day');
  const monthStart = dayjs().startOf('month');
  const monthEnd = dayjs().endOf('month');
  const yearStart = dayjs().startOf('year');
  const yearEnd = dayjs().endOf('day');

  const sameRange = (s: Date, e: Date, s2: dayjs.Dayjs, e2: dayjs.Dayjs) =>
    dayjs(s).startOf('day').valueOf() === s2.startOf('day').valueOf() &&
    dayjs(e).endOf('day').valueOf() === e2.endOf('day').valueOf();

  const isTodayActive = sameRange(dateRange.startDate, dateRange.endDate, todayStart, todayEnd);
  const isMonthActive = sameRange(dateRange.startDate, dateRange.endDate, monthStart, monthEnd);
  const isYearActive = sameRange(dateRange.startDate, dateRange.endDate, yearStart, yearEnd);

  const applyQuickRange = (key: 'today' | 'month' | 'year') => {
    if (key === 'today') setDateRange({ startDate: todayStart.toDate(), endDate: todayEnd.toDate() });
    else if (key === 'month') setDateRange({ startDate: monthStart.toDate(), endDate: monthEnd.toDate() });
    else setDateRange({ startDate: yearStart.toDate(), endDate: yearEnd.toDate() });
    setShowFilters(false);
  };

  const handleDateChange = (_: any, sel?: Date) => {
    const which = showDatePicker;
    setShowDatePicker(null);
    if (!sel || !which) return;
    setDateRange((prev) =>
      which === 'start'
        ? { ...prev, startDate: dayjs(sel).startOf('day').toDate() }
        : { ...prev, endDate: dayjs(sel).endOf('day').toDate() }
    );
  };

  const closeDetails = () => {
    setSelected(null);
    setShowExtras(false);
  };

  return (
    <View style={styles.page}>
      {/* Header (match OilDashboard sizing & style) */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#0B2447' }}>
        <StatusBar style="light" translucent />
        <LinearGradient
          colors={['#0B2447', '#0B2447']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.header, { paddingTop: insets.top }]}
        >
          <View style={styles.headerRowTop}>
            {/* NEW: Back arrow button */}
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => router.push('/customerslist')}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.9}
            >
              <Feather name="arrow-left" size={18} color="#0B2447" />
            </TouchableOpacity>

            <Text style={styles.headerTitle}>Vendor Bills</Text>

            {/* Dalab Cusub (same as oildashboard) */}
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => router.push('/Shidaal/oilcreate')}
              activeOpacity={0.9}
            >
              <Feather name="plus" size={14} color="#0B2447" />
              <Text style={styles.addBtnText}>Dalab Cusub</Text>
            </TouchableOpacity>
          </View>

          {/* Dates row under the title to preserve height & feel */}
          <Text style={styles.headerSub}>
            {dayjs(dateRange.startDate).format('MMM D, YYYY')} – {dayjs(dateRange.endDate).format('MMM D, YYYY')}
          </Text>
        </LinearGradient>
      </SafeAreaView>

      {/* KPI cards (moved from oildashboard) */}
      <View style={styles.cardsRow}>
        <KpiCard
          title="In-Stock (L)"
          value={formatNumber(overall?.total_instock_l ?? 0)}
          icon="database"
          iconBg="#DBEAFE"
          iconColor="#1D4ED8"
        />
        <KpiCard
          title="Sold (L)"
          value={formatNumber(overall?.total_sold_l ?? 0)}
          icon="trending-up"
          iconBg="#DCFCE7"
          iconColor="#047857"
        />
        <KpiCard
          title="Depot Lots"
          value={formatNumber(summary?.depot_lots ?? 0)}
          icon="home"
          iconBg="#EDE9FE"
          iconColor="#6D28D9"
        />
      </View>

      {/* Totals Bar */}
      <View style={styles.totalsBar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={styles.badge}>
            <Feather name="credit-card" size={14} color={COLOR_TEXT} />
          </View>
          <Text style={styles.totalLabel}>Total Supplier Due</Text>
        </View>
        <Text style={styles.totalValue}>{formatCurrency(totalDue)}</Text>
      </View>

      {/* Search + (Filter moved here to keep header same as oil dashboard) */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Feather name="search" size={14} color={COLOR_MUTED} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search supplier, truck, oil type…"
            placeholderTextColor={COLOR_MUTED}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Feather name="x-circle" size={14} color={COLOR_MUTED} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => setShowFilters(true)} style={styles.headerFilterBtnSmall}>
            <Feather name="filter" size={14} color="#0B2447" />
            <Text style={styles.headerFilterTxtSmall}>Filter</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* List */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator />
          </View>
        ) : filteredItems.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="inbox" size={22} color={COLOR_MUTED} />
            <Text style={styles.emptyText}>No vendor bills found.</Text>
          </View>
        ) : (
          filteredItems.map((it, idx) => {
            const plateOrSupplier = it.truck_plate?.trim() || it.supplier_name || '—';
            const titlePieces = [it.truck_type?.trim(), plateOrSupplier].filter(Boolean) as string[];
            const title = titlePieces.join(' · ');
            const inStockForOil = it.oil_id ? oilStockMap[it.oil_id] ?? 0 : 0;

            return (
              <TouchableOpacity
                key={billKey(it, idx)}
                style={styles.card}
                activeOpacity={0.9}
                onPress={() => {
                  setSelected(it);
                  setShowExtras(false);
                }}
              >
                {/* LEFT */}
                <View style={{ flex: 1 }}>
                  <Text style={styles.supplier}>{title}</Text>

                  <View style={styles.childRow}>
                    <View style={styles.childPill}>
                      <Feather name="calendar" size={12} color={COLOR_TEXT} />
                      <Text style={styles.childText}>{formatDateLocal(it.date)}</Text>
                    </View>
                    <View style={styles.childPill}>
                      <Feather name="droplet" size={12} color={COLOR_TEXT} />
                      <Text style={styles.childText}>{it.oil_type ?? '—'}</Text>
                    </View>
                  </View>
                </View>

                {/* RIGHT: Supplier Due + In-Stock(L) */}
                <View style={styles.rightCol}>
                  <Text style={styles.dueValue}>{formatCurrency(it.oil_total_landed_cost)}</Text>

                  <View style={{ marginTop: 6, alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 10, color: COLOR_MUTED, fontWeight: '700' }}>In-Stock (L)</Text>
                    <Text style={{ fontSize: 13, color: COLOR_TEXT, fontWeight: '800' }}>
                      {formatNumber(inStockForOil)}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Details Popup */}
      <Modal visible={detailsOpen} onRequestClose={closeDetails} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={closeDetails}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.modalCard}>
                <View style={[styles.modalHeader, { marginBottom: 8 }]}>
                  <Text style={styles.modalTitle}>
                    {(selected?.truck_plate && selected.truck_plate.trim()) || selected?.supplier_name || 'Details'}
                  </Text>

                  <TouchableOpacity
                    style={styles.actionsChip}
                    onPress={() => setActionsOpen(true)}
                    disabled={!selected?.oil_id}
                  >
                    <Feather name="settings" size={12} color="#0B2447" />
                    <Text style={styles.actionsChipTxt}>Actions</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.inlineGrid}>
                  <Field label="Truck Type" value={selected?.truck_type || '—'} />
                  <Field label="Truck Plate" value={selected?.truck_plate || '—'} />
                  <Field label="Supplier" value={selected?.supplier_name || '—'} />
                  <Field label="Oil Type" value={selected?.oil_type || '—'} />
                  <Field label="Date" value={formatDateLocal(selected?.date)} />
                  {!!selected?.liters && <Field label="Liters" value={`${Number(selected.liters)}`} />}
                </View>

                <Divider />

                <View style={styles.inlineGrid}>
                  <Field label="Oil Cost" value={formatCurrency(selected?.oil_total_landed_cost)} />
                  <Field label="Extras" value={formatCurrency(selected?.total_extra_cost)} />
                  <Field label="Paid" value={formatCurrency(selected?.total_paid)} />
                  <Field
                    label="Amount Due"
                    value={formatCurrency(selected?.amount_due)}
                    valueStyle={{ fontWeight: '900' }}
                  />
                </View>

                <TouchableOpacity
                  style={styles.extrasToggle}
                  onPress={() => setShowExtras((s) => !s)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.extrasToggleTxt}>Extra Costs ({selected?.extra_costs?.length ?? 0})</Text>
                  <Feather name={showExtras ? 'chevron-up' : 'chevron-down'} size={16} color="#0B2447" />
                </TouchableOpacity>

                {showExtras ? (
                  selected?.extra_costs?.length ? (
                    selected.extra_costs.map((ex) => (
                      <View key={`ex_${selected?.oil_id ?? 'none'}_${ex.id}`} style={styles.extraRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.extraTitle}>{ex.category || 'Extra'}</Text>
                          {ex.description ? (
                            <Text style={styles.extraDesc} numberOfLines={2}>
                              {ex.description}
                            </Text>
                          ) : null}
                          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                            <TouchableOpacity
                              style={[styles.payBtn, (!selected?.oil_id || ex.due <= 0) && { opacity: 0.5 }]}
                              disabled={!selected?.oil_id || ex.due <= 0}
                              onPress={() => {
                                if (!selected?.oil_id) return;
                                openPayForExtra(selected, ex);
                                closeDetails();
                              }}
                            >
                              <Feather name="dollar-sign" size={14} color="#fff" />
                              <Text style={styles.payBtnTxt}>Pay</Text>
                            </TouchableOpacity>
                          </View>
                        </View>

                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={styles.extraLine}>Amount: {formatCurrency(ex.amount)}</Text>
                          <Text style={styles.extraLine}>Paid: {formatCurrency(ex.total_paid)}</Text>
                          <Text style={[styles.extraLine, { fontWeight: '800' }]}>
                            Due: {formatCurrency(ex.due)}
                          </Text>
                        </View>
                      </View>
                    ))
                  ) : (
                    <View style={styles.noExtras}>
                      <Feather name="file" size={14} color={COLOR_MUTED} />
                      <Text style={styles.noExtrasText}>No extra costs.</Text>
                    </View>
                  )
                ) : null}

                <View style={[styles.modalFooter, { justifyContent: 'flex-end' }]}>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity
                      style={[
                        styles.primaryBtn,
                        (!selected?.oil_id || (selected?.amount_due ?? 0) <= 0) && { opacity: 0.5 },
                      ]}
                      disabled={!selected?.oil_id || (selected?.amount_due ?? 0) <= 0}
                      onPress={() => {
                        if (!selected) return;
                        openPayForOil(selected);
                        closeDetails();
                      }}
                    >
                      <Feather name="dollar-sign" size={14} color="#fff" />
                      <Text style={styles.primaryBtnTxt}>Pay Total</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.primaryBtn, !selected?.oil_id && { opacity: 0.5 }]}
                      disabled={!selected?.oil_id}
                      onPress={() => {
                        if (!selected?.oil_id) return;
                        openExtraModal(selected.oil_id);
                        closeDetails();
                      }}
                    >
                      <Feather name="plus-circle" size={14} color="#fff" />
                      <Text style={styles.primaryBtnTxt}>Add Extra</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* OilActionsModal */}
      <OilActionsModal
        visible={actionsOpen}
        onClose={() => setActionsOpen(false)}
        oilId={selected?.oil_id ?? 0}
        supplierName={selected?.supplier_name ?? undefined}
        truckPlate={selected?.truck_plate ?? undefined}
        authToken={token ?? undefined}
        onChanged={fetchAll}
      />

      {/* Oil Extra Cost Modal */}
      <OilExtraCostModal
        visible={extraModalOpen}
        onClose={() => setExtraModalOpen(false)}
        token={token ?? null}
        oilId={extraOilId ?? 0}
        onCreated={onExtraCreated}
      />

      {/* Vendor Payment Sheet */}
      <VendorPaymentCreateSheet
        visible={payOpen}
        onClose={() => setPayOpen(false)}
        token={token ?? null}
        oilId={payOilId ?? 0}
        vendorNameOverride={payVendorName ?? undefined}
        currentPayable={payCurrentDue}
        extraCostId={payExtraId ?? undefined}
        onCreated={onPaymentCreated}
        companyName={undefined}
        companyContact={undefined}
      />

      {/* Filters Modal */}
      <Modal visible={showFilters} transparent animationType="slide" onRequestClose={() => setShowFilters(false)}>
        <View style={[styles.modalOverlay, { paddingBottom: 70 }]}>
          <View style={[styles.modalContent, { marginBottom: 8 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filters</Text>
              <TouchableOpacity onPress={() => setShowFilters(false)}>
                <AntDesign name="close" size={18} color="#1F2937" />
              </TouchableOpacity>
            </View>

            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Quick Ranges</Text>
              <View style={styles.quickChips}>
                <TouchableOpacity
                  onPress={() => applyQuickRange('today')}
                  style={[styles.chip, isTodayActive && styles.chipActive]}
                >
                  <Text style={[styles.chipText, isTodayActive && styles.chipTextActive]}>
                    Today ({dayjs().format('ddd')})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => applyQuickRange('month')}
                  style={[styles.chip, isMonthActive && styles.chipActive]}
                >
                  <Text style={[styles.chipText, isMonthActive && styles.chipTextActive]}>
                    This Month ({dayjs().format('MMM')})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => applyQuickRange('year')}
                  style={[styles.chip, isYearActive && styles.chipActive]}
                >
                  <Text style={[styles.chipText, isYearActive && styles.chipTextActive]}>
                    This Year ({dayjs().format('YYYY')})
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Date Range</Text>
              <View style={styles.dateRangeContainer}>
                <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker('start')}>
                  <Text style={styles.dateBtnText}>{dayjs(dateRange.startDate).format('MMM D, YYYY')}</Text>
                  <Feather name="calendar" size={14} color="#0B2447" />
                </TouchableOpacity>
                <Text style={styles.rangeSep}>to</Text>
                <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker('end')}>
                  <Text style={styles.dateBtnText}>{dayjs(dateRange.endDate).format('MMM D, YYYY')}</Text>
                  <Feather name="calendar" size={14} color="#0B2447" />
                </TouchableOpacity>
              </View>
              {showDatePicker && (
                <DateTimePicker
                  value={showDatePicker === 'start' ? dateRange.startDate : dateRange.endDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={handleDateChange}
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
              <TouchableOpacity style={styles.applyBtn} onPress={() => setShowFilters(false)}>
                <Text style={styles.applyTxt}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** Small presentational helpers */
function Field({
  label,
  value,
  valueStyle,
}: {
  label: string;
  value: string;
  valueStyle?: any;
}) {
  return (
    <View style={{ flexBasis: '48%', marginBottom: 8 }}>
      <Text style={{ color: COLOR_MUTED, fontSize: 11, marginBottom: 4 }}>{label}</Text>
      <Text style={[{ color: COLOR_TEXT, fontSize: 13, fontWeight: '800' }, valueStyle]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: COLOR_DIV, marginVertical: 12 }} />;
}

/** KPI Card (same style as OilDashboard) */
function KpiCard({
  title,
  value,
  icon,
  iconBg = '#F3F4F6',
  iconColor = '#111827',
}: {
  title: string;
  value: string;
  icon: any;
  iconBg?: string;
  iconColor?: string;
}) {
  return (
    <View style={styles.cardKPI}>
      <View style={[styles.cardIconWrap, { backgroundColor: iconBg }]}>
        <Feather name={icon} size={16} color={iconColor} />
      </View>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardValue}>{value}</Text>
    </View>
  );
}

const CARD_WIDTH = (width - 16 * 2 - 10 * 2) / 3;

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLOR_BG },

  /* Header (match oildashboard) */
  header: {
    paddingBottom: 4,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  headerRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#E0E7FF' },
  headerSub: { color: '#CBD5E1', fontSize: 11, marginTop: 6 },

  /* NEW: back button */
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D8E0F5',
  },

  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D8E0F5',
  },
  addBtnText: { color: '#0B2447', fontWeight: '800', fontSize: 12, letterSpacing: 0.2 },

  /* KPI cards row */
  cardsRow: { flexDirection: 'row', gap: 10, marginTop: 12, paddingHorizontal: 16 },
  cardKPI: {
    width: CARD_WIDTH,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E8EDF4',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  cardTitle: { color: '#6B7280', fontSize: 11, marginBottom: 1 },
  cardValue: { fontSize: 16, fontWeight: '700', color: '#111827' },

  /* Totals bar */
  totalsBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomColor: '#EEF2F7',
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
  },
  badge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#EEF2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalLabel: { color: COLOR_TEXT, fontWeight: '800' },
  totalValue: { color: COLOR_TEXT, fontWeight: '900' },

  /* Search row (with filter pill) */
  searchRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  searchBox: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLOR_DIV,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
  },
  searchInput: { flex: 1, fontSize: 12, paddingVertical: 4, color: COLOR_TEXT },
  headerFilterBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2FF',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DDE3F0',
  },
  headerFilterTxtSmall: { color: '#0B2447', fontSize: 11, fontWeight: '900' },

  /* List */
  scrollContent: { padding: 14, paddingBottom: 28 },
  loading: { padding: 24, alignItems: 'center', justifyContent: 'center' },
  empty: { paddingVertical: 40, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { color: COLOR_MUTED, fontSize: 13 },

  /** Card */
  card: {
    backgroundColor: COLOR_CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EDF1F7',
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    gap: 14,
    shadowColor: COLOR_SHADOW,
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  supplier: { fontSize: 15, fontWeight: '900', color: COLOR_TEXT },

  childRow: { flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  childPill: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E7ECF3',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  childText: { color: COLOR_TEXT, fontSize: 12, fontWeight: '700' },

  rightCol: { alignItems: 'flex-end', justifyContent: 'center', minWidth: 140 },
  dueLabel: { fontSize: 11, color: COLOR_MUTED, textAlign: 'right' },
  dueValue: { fontSize: 16, fontWeight: '900', color: COLOR_TEXT, marginTop: 2 },

  /** Modal (details) */
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
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EBEFF5',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: { fontSize: 16, fontWeight: '900', color: COLOR_TEXT },
  actionsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2F7',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  actionsChipTxt: { color: '#0B2447', fontSize: 11, fontWeight: '900' },

  inlineGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 8,
  },

  extrasToggle: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  extrasToggleTxt: { color: '#0B2447', fontSize: 12, fontWeight: '900' },

  modalFooter: { marginTop: 12, flexDirection: 'row', alignItems: 'center' },

  // Pay button inside extra block
  payBtn: {
    marginTop: 8,
    backgroundColor: '#0F172A',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  payBtnTxt: { color: '#fff', fontWeight: '900', fontSize: 12 },

  // Extras list styles
  extraRow: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E7ECF3',
    borderRadius: 12,
    padding: 10,
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#FAFCFF',
  },
  extraTitle: { fontSize: 13, fontWeight: '800', color: COLOR_TEXT },
  extraDesc: { fontSize: 12, color: COLOR_MUTED, marginTop: 2 },
  extraLine: { fontSize: 12, color: COLOR_TEXT, marginTop: 2 },
  noExtras: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  noExtrasText: { color: COLOR_MUTED, fontSize: 12 },

  // Filters modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { backgroundColor: 'white', borderTopLeftRadius: 14, borderTopRightRadius: 14, padding: 16, maxHeight: '60%' },
  filterSection: { marginBottom: 10 },
  modalTitleFiltersOnly: { fontSize: 15, fontWeight: '800', color: '#1F2937' },
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
  filterActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
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
  applyBtn: { flex: 1, padding: 10, borderRadius: 8, backgroundColor: '#0B2447', alignItems: 'center' },
  applyTxt: { fontSize: 12, fontWeight: '800', color: 'white' },
});
