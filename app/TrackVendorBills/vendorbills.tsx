// app/(tabs)/TrackVendorBills/vendorbills.tsx
import { AntDesign, Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import dayjs from 'dayjs';
import { LinearGradient } from 'expo-linear-gradient';
import { BackHandler } from 'react-native';

import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { events, EVT_EXTRA_COST_CREATED, EVT_VENDOR_PAYMENT_CREATED } from '../Shidaal/eventBus';

import {
  ActivityIndicator,
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
  View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import api from '@/services/api';
import { useAuth } from '@/src/context/AuthContext';
import ExtraCostsSheet from '../Shidaal/extracostspage';
import OilActionsModal from '../Shidaal/OilActionsModal';
import OilExtraCostModal from '../Shidaal/oilExtraCostModal';
import VendorPaymentCreateSheet from '../Shidaal/vendorpayment';

const { width } = Dimensions.get('window');

/** -------- Oil Summary types (from oildashboard) -------- */
type OilType = 'diesel' | 'petrol' | 'kerosene' | 'jet' | 'hfo' | 'crude' | 'lube';
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

/** ---------- Supplier dues / children ---------- */
export type ExtraCostSummary = {
  id: number;
  category?: string | null;
  description?: string | null;
  amount: number;
  total_paid: number;
  due: number;
  oil_id?: number | null;
};

type OilDueLine = {
  oil_id: number;
  oil_type?: string | null;
  liters?: number | null;
  sold_l: number;
  in_stock_l: number;

  oil_total_landed_cost: number;
  total_extra_cost: number;
  over_all_cost: number;
  total_paid: number;
  amount_due: number;

  extra_costs: ExtraCostSummary[];
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
  over_all_cost?: number;
  total_paid: number;
  amount_due: number;

  child_oils?: OilDueLine[];

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
const COLOR_SHADOW = 'rgba(2, 6, 23, 0.04)';

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
    it.lot_id ?? 'nl',
    it.oil_id ?? 'noil',
    (it.truck_plate ?? '').trim(),
    (it.truck_type ?? '').trim(),
    (it.supplier_name ?? '').trim(),
    (it.date ?? '').trim(),
  ];
  const base = parts.join('|').replace(/\s+/g, ' ');
  return `${base}__${idx}`;
}

/** Compact child badge (card right side) */
function ChildOilBadge({
  label,
  sold,
  instock,
}: {
  label: string;
  sold: number;
  instock: number;
}) {
  return (
    <View style={styles.childBadge}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Feather name="droplet" size={11} color={COLOR_TEXT} />
        <Text style={styles.badgeType}>{label}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Text style={styles.badgeStat}>
          Sold: <Text style={styles.badgeStatStrong}>{formatNumber(sold)}</Text>
        </Text>
        <Text style={styles.badgeStat}>
          Stock: <Text style={styles.badgeStatStrong}>{formatNumber(instock)}</Text>
        </Text>
      </View>
    </View>
  );
}

export default function VendorBillsScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<SupplierDueItem[]>([]);

  // Oil summary for KPI
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const overall = summary?.totals?.__overall__;

  // Details popup
  const [selected, setSelected] = useState<SupplierDueItem | null>(null);
  const detailsOpen = !!selected;

  // Actions
  const [actionsOpen, setActionsOpen] = useState(false);

  // Extra cost creation modal (existing)
  const [extraModalOpen, setExtraModalOpen] = useState(false);
  const [extraOilId, setExtraOilId] = useState<number | null>(null);

  // Single Extra Costs sheet (bottom-up)
  const [extrasPopupOpen, setExtrasPopupOpen] = useState(false);

  // Vendor payment sheet
  const [payOpen, setPayOpen] = useState(false);
  const [payOilId, setPayOilId] = useState<number | null>(null);
  const [payLotId, setPayLotId] = useState<number | null>(null);
  const [payExtraId, setPayExtraId] = useState<number | null>(null);
  const [payVendorName, setPayVendorName] = useState<string | null>(null);
  const [payCurrentDue, setPayCurrentDue] = useState<number>(0);
  const fetchingRef = useRef(false);

  // Search + Filters
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState<'start' | 'end' | null>(null);
  const isFocused = useIsFocused();
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

  /** Fetch supplier dues */
  const fetchVendorDues = useCallback(async () => {
    try {
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
      // ignore toast for now
    }
  }, [headers]);

  /** Fetch oil summary */
  const fetchOilSummary = useCallback(async () => {
    try {
      const res = await api.get<SummaryResponse>('/diiwaanoil/summary', {
        headers: { ...(headers || {}) },
      });
      setSummary(res.data);
    } catch {}
  }, [headers]);

  const fetchAll = useCallback(async () => {
    if (fetchingRef.current) return; // single-flight guard
    fetchingRef.current = true;
    try {
      setLoading(true);
      await Promise.all([fetchVendorDues(), fetchOilSummary()]);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [fetchVendorDues, fetchOilSummary]);

  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll])
  );

  useEffect(() => {
    const offPay   = events.on(EVT_VENDOR_PAYMENT_CREATED, () => fetchAll());
    const offExtra = events.on(EVT_EXTRA_COST_CREATED,   () => fetchAll());
    return () => {
      offPay();
      offExtra();
    };
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
    const oilId = extra.oil_id ?? parent.oil_id ?? parent.child_oils?.[0]?.oil_id;
    if (!oilId) return;
    setPayLotId(null);
    setPayOilId(oilId);
    setPayExtraId(extra.id);
    setPayVendorName(parent.supplier_name || null);
    setPayCurrentDue(Number(extra.due || 0));
    setPayOpen(true);
  };

  const openPayTotal = (parent: SupplierDueItem) => {
    const isLot = (parent.child_oils?.length || 0) > 0 && parent.lot_id != null;
    setPayExtraId(null);
    setPayVendorName(parent.supplier_name || null);
    setPayCurrentDue(Number(parent.amount_due || 0));
    if (isLot && parent.lot_id) {
      setPayLotId(parent.lot_id);
      setPayOilId(null);
    } else if (parent.oil_id) {
      setPayLotId(null);
      setPayOilId(parent.oil_id);
    } else {
      const firstChild = parent.child_oils?.[0];
      if (firstChild) {
        setPayLotId(null);
        setPayOilId(firstChild.oil_id);
      }
    }
    setPayOpen(true);
  };

  const onPaymentCreated = async () => {
    await fetchAll();
    setPayOpen(false);
    setPayOilId(null);
    setPayLotId(null);
    setPayExtraId(null);
    setPayVendorName(null);
    setPayCurrentDue(0);
  };

  // also refresh when the payment sheet closes without creating (to be safe)
  const onPaymentClosed = async () => {
    setPayOpen(false);
    await fetchAll();
  };

  // search + date + SORT NEWEST FIRST
  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const from = dayjs(dateRange.startDate).startOf('day').valueOf();
    const to = dayjs(dateRange.endDate).endOf('day').valueOf();

    const base = items.filter((it) => {
      const t = it.date ? new Date(it.date).getTime() : 0;
      const dateOK = t >= from && t <= to;
      if (!q) return dateOK;

      const childTypes = (it.child_oils || []).map((c) => c.oil_type ?? '').join(' ');
      const hay = `${it.supplier_name ?? ''} ${it.truck_plate ?? ''} ${it.truck_type ?? ''} ${it.oil_type ?? ''} ${childTypes}`.toLowerCase();
      return dateOK && hay.includes(q);
    });

    return base.sort((a, b) => {
      const ta = a.date ? new Date(a.date).getTime() : 0;
      const tb = b.date ? new Date(b.date).getTime() : 0;
      return tb - ta;
    });
  }, [items, search, dateRange]);

  // hardware back → /menu
  useFocusEffect(
    useCallback(() => {
      const onHardwareBackPress = () => {
        router.replace('/menu');
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBackPress);
      return () => sub.remove();
    }, [router])
  );

  const closeDetails = () => {
    setSelected(null);
  };

  /** CHILD SECTION (popup): only Oil Type + lines: Oil cost / Stock / Sold */
  const renderChildSection = (c: OilDueLine, ix: number) => (
    <View key={`child_${c.oil_id}_${ix}`} style={styles.childSection}>
      <View style={styles.childHeader}>
        <Text style={styles.childHeaderTitle}>
          {(c.oil_type || 'OIL').toString().toUpperCase()}
        </Text>
      </View>

      <View style={styles.inlineGrid}>
        <Field label="Oil cost" value={formatCurrency(c.oil_total_landed_cost)} />
        <Field label="Stock" value={formatNumber(c.in_stock_l)} />
        <Field label="Sold" value={formatNumber(c.sold_l)} />
      </View>
    </View>
  );

  /** computed helpers for selected */
  const selectedOverallCost = useMemo(() => {
    if (!selected) return 0;
    const base = Number(selected.over_all_cost ?? 0);
    if (base) return base;
    return Number((selected.oil_total_landed_cost || 0) + (selected.total_extra_cost || 0));
  }, [selected]);

  const totalExtraCosts = useMemo(() => {
    if (!selected) return 0;
    // prefer provided aggregate
    if (typeof selected.total_extra_cost === 'number') return Number(selected.total_extra_cost || 0);
    // fallback: sum child extra costs if present
    const children = selected.child_oils || [];
    if (children.length > 0) {
      return children.reduce((acc, c) => acc + Number(c.total_extra_cost || 0), 0);
    }
    return 0;
  }, [selected]);

  return (
    <View style={styles.page}>
      {/* Header */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#0B2447' }}>
        <StatusBar style="light" translucent />
        <LinearGradient
          colors={['#0B2447', '#0B2447']}
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
              <Feather name="arrow-left" size={16} color="#0B2447" />
            </TouchableOpacity>

            {/* Centered title + date range */}
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={styles.headerTitle}>Purchase Oil</Text>
              <Text style={styles.headerDate}>
                {dayjs(dateRange.startDate).format('MMM D, YYYY')} – {dayjs(dateRange.endDate).format('MMM D, YYYY')}
              </Text>
            </View>

            {/* Create button */}
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => router.push('/Shidaal/oilmodal')}
              activeOpacity={0.9}
            >
              <Feather name="plus" size={12} color="#0B2447" />
              <Text style={styles.addBtnText}>Dalab Cusub</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </SafeAreaView>

      {/* KPI cards */}
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

      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Feather name="search" size={12} color={COLOR_MUTED} />
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
              <Feather name="x-circle" size={12} color={COLOR_MUTED} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => setShowFilters(true)} style={styles.headerFilterBtnSmall}>
            <Feather name="filter" size={12} color="#0B2447" />
            <Text style={styles.headerFilterTxtSmall}>Filter</Text>
          </TouchableOpacity>
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
          <View style={styles.loading}><ActivityIndicator /></View>
        ) : filteredItems.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="inbox" size={18} color={COLOR_MUTED} />
            <Text style={styles.emptyText}>No vendor bills found.</Text>
          </View>
        ) : (
          filteredItems.map((it, idx) => {
            const plateOrSupplier = it.truck_plate?.trim() || it.supplier_name || '—';
            const titlePieces = [it.truck_type?.trim(), plateOrSupplier].filter(Boolean) as string[];
            const title = titlePieces.join(' · ');

            const children = it.child_oils || [];
            let right: OilDueLine[] = [];

            if (children.length > 0) {
              right = children.slice(0, 2);
            } else if (it.oil_id) {
              right = [{
                oil_id: it.oil_id,
                oil_type: it.oil_type,
                liters: it.liters,
                sold_l: 0,
                in_stock_l: 0,
                oil_total_landed_cost: it.oil_total_landed_cost,
                total_extra_cost: it.total_extra_cost,
                over_all_cost: (it.over_all_cost ?? it.oil_total_landed_cost + it.total_extra_cost),
                total_paid: it.total_paid,
                amount_due: it.amount_due,
                extra_costs: [],
              }];
            }

            return (
              <TouchableOpacity
                key={billKey(it, idx)}
                style={styles.card}
                activeOpacity={0.9}
                onPress={() => setSelected(it)}
              >
                {/* LEFT */}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.supplier} numberOfLines={1}>{title}</Text>
                  <View style={styles.childRow}>
                    {/* Date directly under title */}
                    <View style={styles.childPill}>
                      <Feather name="calendar" size={10} color={COLOR_TEXT} />
                      <Text style={styles.childText}>{formatDateLocal(it.date)}</Text>
                    </View>
                  </View>
                </View>

                {/* RIGHT: Child oil(s) compact */}
                <View style={styles.rightCol}>
                  {right.map((c, ix) => (
                    <ChildOilBadge
                      key={`${c.oil_id}_${ix}`}
                      label={(c.oil_type || '—').toUpperCase()}
                      sold={Number(c.sold_l || 0)}
                      instock={Number(c.in_stock_l || 0)}
                    />
                  ))}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* DETAILS POPUP */}
      <Modal visible={detailsOpen} onRequestClose={closeDetails} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={closeDetails}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={[styles.modalCard, { maxHeight: '85%' }]}>
                {/* Header: Title (plate/supplier) and DATE below it, plus action buttons on the right */}
                <View style={[styles.modalHeader, { marginBottom: 8 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalTitle}>
                      {(selected?.truck_plate && selected.truck_plate.trim()) || selected?.supplier_name || 'Details'}
                    </Text>
                    <View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Feather name="calendar" size={12} color={COLOR_MUTED} />
                      <Text style={{ color: COLOR_MUTED, fontSize: 11, fontWeight: '700' }}>
                        {formatDateLocal(selected?.date)}
                      </Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {/* Actions */}
                    {(() => {
                      const hasOil = !!(selected?.oil_id || selected?.child_oils?.[0]?.oil_id);
                      return (
                        <TouchableOpacity
                          style={[styles.headerTabBtn, !hasOil && { opacity: 0.5 }]}
                          disabled={!hasOil}
                          onPress={() => hasOil && setActionsOpen(true)}
                        >
                          <Feather name="settings" size={12} color="#0B2447" />
                          <Text style={styles.headerTabTxt}>Actions</Text>
                        </TouchableOpacity>
                      );
                    })()}

                    {/* Extras popup (single list in its own tab) */}
                    <TouchableOpacity style={styles.headerTabBtn} onPress={() => setExtrasPopupOpen(true)}>
                      <Feather name="layers" size={12} color="#0B2447" />
                      <Text style={styles.headerTabTxt}>Extra Costs</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <ScrollView
                  contentContainerStyle={{ paddingBottom: 10 }}
                  showsVerticalScrollIndicator
                  keyboardShouldPersistTaps="handled"
                >
                  {/* MAIN first: Child oil sections (only Oil cost / Stock / Sold) */}
                  {(selected?.child_oils && selected.child_oils.length > 0)
                    ? selected.child_oils.map((c, ix) => renderChildSection(c, ix))
                    : selected?.oil_id
                      ? renderChildSection({
                          oil_id: selected.oil_id!,
                          oil_type: selected.oil_type,
                          liters: selected.liters,
                          sold_l: 0,
                          in_stock_l: 0,
                          oil_total_landed_cost: selected.oil_total_landed_cost,
                          total_extra_cost: selected.total_extra_cost,
                          over_all_cost: (selected.over_all_cost ?? selected.oil_total_landed_cost + selected.total_extra_cost),
                          total_paid: selected.total_paid,
                          amount_due: selected.amount_due,
                          extra_costs: [],
                        }, 0)
                      : null
                  }

                  {/* Total Extra Costs (single line, not itemized) */}
                  <Divider />
                  <View style={styles.inlineGrid}>
                    <Field label="Total Extra Costs" value={formatCurrency(totalExtraCosts)} />
                  </View>

                  {/* Bottom summary: Overall / Paid / Due */}
                  <Divider />
                  <View style={[styles.inlineGrid, { marginBottom: 4 }]}>
                    <Field
                      label="Overall cost"
                      value={formatCurrency(selectedOverallCost)}
                      valueStyle={{ fontWeight: '900' }}
                    />
                    <Field
                      label="Amount paid"
                      value={formatCurrency(selected?.total_paid)}
                      valueStyle={{ color: '#059669', fontWeight: '900' }}
                    />
                    <Field
                      label="Amount due"
                      value={formatCurrency(selected?.amount_due)}
                      valueStyle={{ color: '#DC2626', fontWeight: '900' }}
                    />
                  </View>
                </ScrollView>

                {/* Footer with Pay Total / Fully Paid */}
                <View style={[styles.modalFooter, { justifyContent: 'flex-end' }]}>
                  {(selected?.amount_due ?? 0) <= 0 ? (
                    <View style={styles.paidPill}>
                      <Feather name="check-circle" size={14} color="#059669" />
                      <Text style={styles.paidPillText}>Fully Paid</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.primaryBtn}
                      onPress={() => selected && openPayTotal(selected)}
                    >
                      <Feather name="dollar-sign" size={12} color="#fff" />
                      <Text style={styles.primaryBtnTxt}>
                        Pay Total ({formatCurrency(selected?.amount_due)})
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Single Extra Costs Sheet (own tab/sheet) */}
      <ExtraCostsSheet
        visible={extrasPopupOpen}
        onClose={() => setExtrasPopupOpen(false)}
        extraCosts={selected?.extra_costs ?? []}
        onPayExtra={(ex) => {
          if (!selected) return;
          openPayForExtra(selected, ex);
          setExtrasPopupOpen(false);
        }}
        onAddExtra={() => {
          const oilIdForAdd = selected?.oil_id ?? selected?.child_oils?.[0]?.oil_id ?? null;
          if (!oilIdForAdd) return;
          setExtrasPopupOpen(false);
          openExtraModal(oilIdForAdd);
        }}
        formatCurrency={formatCurrency}
      />

      {/* OilActionsModal */}
      <OilActionsModal
        visible={actionsOpen}
        onClose={() => setActionsOpen(false)}
        oilId={selected?.oil_id ?? selected?.child_oils?.[0]?.oil_id ?? 0}
        supplierName={selected?.supplier_name ?? undefined}
        truckPlate={selected?.truck_plate ?? undefined}
        authToken={token ?? undefined}
        onChanged={fetchAll}
      />

      {/* Oil Extra Cost creation modal */}
      <OilExtraCostModal
        visible={extraModalOpen}
        onClose={() => setExtraModalOpen(false)}
        token={token ?? null}
        oilId={extraOilId ?? 0}
        onCreated={onExtraCreated}
      />

      {/* Vendor Payment Sheet (refresh on close and on created) */}
      <VendorPaymentCreateSheet
        visible={payOpen}
        onClose={onPaymentClosed}
        token={token ?? null}
        oilId={payOilId ?? undefined}
        lotId={payLotId ?? undefined}
        vendorNameOverride={payVendorName ?? undefined}
        currentPayable={payCurrentDue}
        extraCostId={payExtraId ?? undefined}
        onCreated={onPaymentCreated}
        companyName={undefined}
        companyContact={undefined}
      />

      {/* Filters Modal */}
      <Modal visible={showFilters} transparent animationType="fade" onRequestClose={() => setShowFilters(false)}>
        <TouchableWithoutFeedback onPress={() => setShowFilters(false)}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={[styles.modalCard, { width: '94%', maxHeight: '80%' }]}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Filters</Text>
                  <TouchableOpacity onPress={() => setShowFilters(false)}>
                    <AntDesign name="close" size={16} color="#1F2937" />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  contentContainerStyle={{ paddingBottom: 8 }}
                  showsVerticalScrollIndicator
                  keyboardShouldPersistTaps="handled"
                >
                  <View style={styles.filterSection}>
                    <Text style={styles.filterLabel}>Quick Ranges</Text>
                    <View style={styles.quickChips}>
                      <QuickRangeChip
                        label={`Today (${dayjs().format('ddd')})`}
                        onPress={() => {
                          setDateRange({ startDate: dayjs().startOf('day').toDate(), endDate: dayjs().endOf('day').toDate() });
                          setShowFilters(false);
                        }}
                      />
                      <QuickRangeChip
                        label={`This Month (${dayjs().format('MMM')})`}
                        onPress={() => {
                          setDateRange({ startDate: dayjs().startOf('month').toDate(), endDate: dayjs().endOf('month').toDate() });
                          setShowFilters(false);
                        }}
                      />
                      <QuickRangeChip
                        label={`This Year (${dayjs().format('YYYY')})`}
                        onPress={() => {
                          setDateRange({ startDate: dayjs().startOf('year').toDate(), endDate: dayjs().endOf('day').toDate() });
                          setShowFilters(false);
                        }}
                      />
                    </View>
                  </View>

                  <View style={styles.filterSection}>
                    <Text style={styles.filterLabel}>Date Range</Text>
                    <View style={styles.dateRangeContainer}>
                      <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker('start')}>
                        <Text style={styles.dateBtnText}>{dayjs(dateRange.startDate).format('MMM D, YYYY')}</Text>
                        <Feather name="calendar" size={12} color="#0B2447" />
                      </TouchableOpacity>
                      <Text style={styles.rangeSep}>to</Text>
                      <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker('end')}>
                        <Text style={styles.dateBtnText}>{dayjs(dateRange.endDate).format('MMM D, YYYY')}</Text>
                        <Feather name="calendar" size={12} color="#0B2447" />
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
    </View>
  );
}

/** Presentational helpers */
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
    <View style={{ flexBasis: '48%', marginBottom: 6 }}>
      <Text style={{ color: COLOR_MUTED, fontSize: 10, marginBottom: 2 }}>{label}</Text>
      <Text style={[{ color: COLOR_TEXT, fontSize: 12, fontWeight: '800' }, valueStyle]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}
function Divider() {
  return <View style={{ height: 1, backgroundColor: COLOR_DIV, marginVertical: 10 }} />;
}
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
        <Feather name={icon} size={14} color={iconColor} />
      </View>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardValue}>{value}</Text>
    </View>
  );
}
function QuickRangeChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
    </TouchableOpacity>
  );
}

const CARD_WIDTH = (width - 16 * 2 - 10 * 2) / 3;

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLOR_BG },

  /* Header */
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
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D8E0F5',
  },
  addBtnText: { color: '#0B2447', fontWeight: '800', fontSize: 11, letterSpacing: 0.2 },
  headerTitle: { fontSize: 15, fontWeight: '800', color: '#E0E7FF', textAlign: 'center' },
  headerDate: { color: '#CBD5E1', fontSize: 10, marginTop: 2, textAlign: 'center' },

  /* KPI cards row */
  cardsRow: { flexDirection: 'row', gap: 10, marginTop: 10, paddingHorizontal: 16 },
  cardKPI: {
    width: CARD_WIDTH,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E8EDF4',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  cardTitle: { color: '#6B7280', fontSize: 10, marginBottom: 0 },
  cardValue: { fontSize: 14, fontWeight: '700', color: '#111827' },

  /* Search row */
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
  },
  headerFilterTxtSmall: { color: '#0B2447', fontSize: 10, fontWeight: '800' },

  /* List */
  scrollContent: { padding: 12, paddingBottom: 24 },
  loading: { padding: 20, alignItems: 'center', justifyContent: 'center' },
  empty: { paddingVertical: 36, alignItems: 'center', justifyContent: 'center', gap: 6 },
  emptyText: { color: COLOR_MUTED, fontSize: 12 },

  /** Card */
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
    shadowColor: COLOR_SHADOW,
    shadowOpacity: 1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  supplier: { fontSize: 12, fontWeight: '800', color: COLOR_TEXT },

  childRow: { flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  childPill: {
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
  childText: { color: COLOR_TEXT, fontSize: 10, fontWeight: '700' },

  rightCol: { alignItems: 'flex-end', justifyContent: 'center', minWidth: 150, gap: 6 },
  childBadge: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7ECF3',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 6,
    minWidth: 145,
  },
  badgeType: { fontSize: 11, fontWeight: '900', color: COLOR_TEXT },
  badgeStat: { fontSize: 10, color: COLOR_MUTED, fontWeight: '700' },
  badgeStatStrong: { color: COLOR_TEXT },

  /** Modal (centered) */
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
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: { fontSize: 14, fontWeight: '900', color: COLOR_TEXT },

  headerTabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2F7',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerTabTxt: { color: '#0B2447', fontSize: 10, fontWeight: '900' },

  inlineGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 6,
  },

  childSection: {
    borderWidth: 1,
    borderColor: '#E7ECF3',
    borderRadius: 12,
    padding: 10,
    backgroundColor: '#FAFCFF',
    marginBottom: 10,
  },
  childHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  childHeaderTitle: { fontSize: 12, fontWeight: '900', color: COLOR_TEXT },

  modalFooter: { marginTop: 10, flexDirection: 'row', alignItems: 'center' },

  // Pay/Secondary buttons
  primaryBtn: {
    backgroundColor: '#0F172A',
    borderRadius: 9,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  primaryBtnTxt: { color: '#fff', fontWeight: '900', fontSize: 11 },

  secondaryBtn: {
    backgroundColor: '#EEF2FF',
    borderRadius: 9,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#DDE3F0',
  },
  secondaryBtnTxt: { color: '#0B2447', fontWeight: '900', fontSize: 11 },

  // fully paid badge
  paidPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#C7F4DE',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  paidPillText: { color: '#065F46', fontWeight: '900', fontSize: 11 },

  /* Filters popup (centered) */
  filterSection: { marginTop: 8, marginBottom: 8 },
  filterLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.3,
    color: '#6B7280',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  quickChips: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F1F5F9',
    marginRight: 6,
    marginBottom: 6,
  },
  chipText: { fontSize: 10, color: '#334155', fontWeight: '800' },
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
  applyBtn: { flex: 1, padding: 9, borderRadius: 8, backgroundColor: '#0B2447', alignItems: 'center' },
  applyTxt: { fontSize: 11, fontWeight: '800', color: 'white' },
});
