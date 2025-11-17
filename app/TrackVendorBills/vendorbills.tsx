// oilpurchasevendorbills

import { AntDesign, Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import dayjs from 'dayjs';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, StyleSheet } from 'react-native';

import { syncPendingOilModalForms } from '../OilModalOffline/oilModalSync';

import { getVendorBillsForOwner } from '../OilPurchaseOffline/oilpurchasevendorbillsrepo';

import NetInfo from '@react-native-community/netinfo';

import { getVendorBillsWithSync } from '../OilPurchaseOffline/oilpurchasevendorbillsync';

import { events, EVT_EXTRA_COST_CREATED, EVT_VENDOR_PAYMENT_CREATED } from '../Shidaal/eventBus';

import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import api from '@/services/api';
import { useAuth } from '@/src/context/AuthContext';

import OilActionsModal from '../Shidaal/OilActionsModal';
import OilExtraCostModal from '../Shidaal/oilExtraCostModal';
import VendorPaymentCreateSheet from '../Shidaal/vendorpayment';

import {
  getOilSummaryCache,
  getWakaaladStatsCache,
  saveOilSummaryCache,
  saveWakaaladStatsCache,
} from '../OilPurchaseOffline/oilSummaryStatsCache';

const { width } = Dimensions.get('window');

const ALL_TRUCKS = '__ALL__';

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

/** ---------- Wakaalad stats types (from /wakaalad_diiwaan/stats/summary) ---------- */
type WakaaladSoldByTruck = {
  truck_plate: string | null;
  total_sold_l: number;
  total_sold_fuusto: number;
  total_sold_caag: number;
};

type WakaaladMovedByTruck = {
  truck_plate: string | null;
  moved_l: number;
  moved_fuusto: number;
  moved_caag: number;
};

type WakaaladStatsResponse = {
  total_sold_l: number;
  total_sold_fuusto: number;
  total_sold_caag: number;
  sold_by_truck_plate: WakaaladSoldByTruck[];
  sold_by_wakaalad: any[];
  moved_total_l: number;
  moved_total_fuusto: number;
  moved_total_caag: number;
  moved_by_truck_plate: WakaaladMovedByTruck[];
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

/** Unit conversion helper */
function convertLitersForDisplay(liters: number, unit: 'liters' | 'fuusto' | 'caag') {
  const L = Number(liters || 0);
  if (!L) return 0;
  if (unit === 'liters') return L;
  if (unit === 'fuusto') return L / 240;
  return L / 20;
}

/** Compact child badge (card right side) */
function ChildOilBadge({
  label,
  instock,
  displayUnit,
}: {
  label: string;
  instock: number;
  displayUnit: 'liters' | 'fuusto' | 'caag';
}) {
  const unitLabel = displayUnit === 'liters' ? 'L' : displayUnit === 'fuusto' ? 'Fuusto' : 'Caag';
  const displayed = convertLitersForDisplay(instock, displayUnit);
  const decimals = displayUnit === 'liters' ? 0 : 2;

  return (
    <View style={styles.childBadge}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Feather name="droplet" size={11} color={COLOR_TEXT} />
          <Text style={styles.badgeType}>{label}</Text>
        </View>

        {/* Green stock button */}
        <TouchableOpacity style={styles.stockPill}>
          <Text style={styles.stockPillTxt}>
            {formatNumber(displayed, decimals)} {unitLabel}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function VendorBillsScreen() {
  const router = useRouter();
  const { token, user } = useAuth();

  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<SupplierDueItem[]>([]);

  // Oil summary for KPI
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const overall = summary?.totals?.__overall__;

  // Wakaalad stats
  const [wakaaladStats, setWakaaladStats] = useState<WakaaladStatsResponse | null>(null);

  // View filters for stats
  const [selectedTruck, setSelectedTruck] = useState<string>(ALL_TRUCKS);
  const [displayUnit, setDisplayUnit] = useState<'liters' | 'fuusto' | 'caag'>('liters');

  // real popups for truck + display in
  const [truckPickerOpen, setTruckPickerOpen] = useState(false);
  const [unitPickerOpen, setUnitPickerOpen] = useState(false);

  // Details popup
  const [selected, setSelected] = useState<SupplierDueItem | null>(null);
  const detailsOpen = !!selected;

  // Actions
  const [actionsOpen, setActionsOpen] = useState(false);

  // Extra cost creation modal (existing)
  const [extraModalOpen, setExtraModalOpen] = useState(false);
  const [extraOilId, setExtraOilId] = useState<number | null>(null);

  // Single Extra Costs sheet (bottom-up)
  const [extrasPopupOpen, setExtrasPopupOpen] = useState(false); // kept if used elsewhere

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

  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sub = NetInfo.addEventListener((state) => {
      const ok = Boolean(state.isConnected && state.isInternetReachable);
      console.log('[VendorBills] NetInfo changed', {
        isConnected: state.isConnected,
        isInternetReachable: state.isInternetReachable,
        online: ok,
      });
      setOnline(ok);
    });
    return () => sub();
  }, []);

  const closeFilters = () => {
    setShowFilters(false);
    setTruckPickerOpen(false);
    setUnitPickerOpen(false);
  };

  const loadVendorBillsLocal = useCallback(async () => {
    if (!user?.id) {
      console.log('[VendorBills] loadVendorBillsLocal: no user id');
      setItems([]);
      return;
    }

    try {
      const local = await getVendorBillsForOwner(user.id);
      console.log('[VendorBills] loadVendorBillsLocal →', local.length, 'rows');
      setItems(local);
    } catch (err) {
      console.warn('[VendorBills] loadVendorBillsLocal error', err);
    }
  }, [user?.id]);

  // Derived effective range with fallback to previous month when "this month" has no data
  const effectiveRange = useMemo(() => {
    const isCurrentMonth =
      dayjs(dateRange.startDate).isSame(dayjs().startOf('month'), 'day') &&
      dayjs(dateRange.endDate).isSame(dayjs().endOf('day'), 'day');

    const filterWithRange = (range: { startDate: Date; endDate: Date }) => {
      const from = dayjs(range.startDate).startOf('day').valueOf();
      const to = dayjs(range.endDate).endOf('day').valueOf();
      const q = search.trim().toLowerCase();

      const base = items.filter((it) => {
        const t = it.date ? new Date(it.date).getTime() : 0;
        const dateOK = t >= from && t <= to;
        const plate = (it.truck_plate || '').trim();
        const truckOK = selectedTruck === ALL_TRUCKS || plate === selectedTruck;

        if (!dateOK || !truckOK) return false;
        if (!q) return true;

        const childTypes = (it.child_oils || []).map((c) => c.oil_type ?? '').join(' ');
        const hay = `${it.supplier_name ?? ''} ${it.truck_plate ?? ''} ${it.truck_type ?? ''} ${
          it.oil_type ?? ''
        } ${childTypes}`.toLowerCase();
        return hay.includes(q);
      });

      return base.sort((a, b) => {
        const ta = a.date ? new Date(a.date).getTime() : 0;
        const tb = b.date ? new Date(b.date).getTime() : 0;
        return tb - ta;
      });
    };

    const firstPass = filterWithRange(dateRange);

    if (isCurrentMonth && firstPass.length === 0) {
      const prevStart = dayjs(dateRange.startDate).subtract(1, 'month').startOf('month').toDate();
      const prevEnd = dayjs(prevStart).endOf('month').toDate();
      return {
        range: { startDate: prevStart, endDate: prevEnd },
        data: filterWithRange({ startDate: prevStart, endDate: prevEnd }),
      };
    }

    return { range: dateRange, data: firstPass };
  }, [dateRange, items, search, selectedTruck]);

  const filteredItems = effectiveRange.data;

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

  const hasRealOilId =
    !!(selected?.oil_id && selected.oil_id > 0) ||
    !!(selected?.child_oils?.[0]?.oil_id && selected.child_oils[0].oil_id! > 0);

  // allow Actions whenever we have a real oil id, regardless of online state
  const canOpenActions = !!hasRealOilId;

  const fetchVendorDues = useCallback(async () => {
    if (!user?.id) {
      console.log('[VendorBills] fetchVendorDues: no user id');
      setItems([]);
      return;
    }

    // 1) ALWAYS show what’s already in local SQLite (offline-first)
    await loadVendorBillsLocal();

    // 2) If we’re offline or no token, stop here – rely on local cache only
    if (!online || !token) {
      console.log('[VendorBills] offline or no token → using local cache only');
      return;
    }

    try {
      // 🔹 2b) FIRST: flush queued oil-modal forms so vendor bills get real oil_id / lot_id
      console.log('[VendorBills] syncing pending oil-modal forms…');
      await syncPendingOilModalForms(user.id, token);

      // 3) Online + token → sync vendor bills from server, then update list
      console.log('[VendorBills] syncing vendor bills from server…');
      const fresh = await getVendorBillsWithSync({
        token,
        ownerId: user.id,
        force: true,
      });
      console.log('[VendorBills] server sync returned', fresh.length, 'items');
      setItems(fresh);
    } catch (err) {
      console.warn('[VendorBills] sync failed, keeping local bills', err);
      // items from local are already in state
    }
  }, [user?.id, token, online, loadVendorBillsLocal]);

  /** Fetch oil summary */
  const fetchOilSummary = useCallback(async () => {
    if (!user?.id) return;

    // 1) show cached snapshot first (works offline / after restart)
    try {
      const cached = await getOilSummaryCache(user.id);
      if (cached) {
        setSummary(cached as SummaryResponse);
      }
    } catch (e) {
      console.warn('[VendorBills] failed to load cached oil summary', e);
    }

    // 2) if offline or no token → keep whatever we have
    if (!online || !token) return;

    // 3) online: fetch fresh + update cache
    try {
      const res = await api.get<SummaryResponse>('/diiwaanoil/summary', {
        headers: { ...(headers || {}) },
      });
      setSummary(res.data);
      await saveOilSummaryCache(user.id, res.data);
    } catch (e) {
      console.warn('[VendorBills] fetchOilSummary failed, keeping cached', e);
    }
  }, [user?.id, online, token, headers]);

  const fetchWakaaladStats = useCallback(async () => {
    if (!user?.id) return;

    // 1) cached snapshot
    try {
      const cached = await getWakaaladStatsCache(user.id);
      if (cached) {
        setWakaaladStats(cached as WakaaladStatsResponse);
      }
    } catch (e) {
      console.warn('[VendorBills] failed to load cached wakaalad stats', e);
    }

    // 2) offline / no token → keep cached
    if (!online || !token) return;

    // 3) online: refresh + cache
    try {
      const res = await api.get<WakaaladStatsResponse>('/wakaalad_diiwaan/stats/summary', {
        headers: { ...(headers || {}) },
      });
      setWakaaladStats(res.data);
      await saveWakaaladStatsCache(user.id, res.data);
    } catch (e) {
      console.warn('[VendorBills] fetchWakaaladStats failed, keeping cached', e);
    }
  }, [user?.id, online, token, headers]);

  const fetchAll = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      setLoading(true);
      await Promise.all([fetchVendorDues(), fetchOilSummary(), fetchWakaaladStats()]);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [fetchVendorDues, fetchOilSummary, fetchWakaaladStats]);

  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll])
  );

  useEffect(() => {
    const offPay = events.on(EVT_VENDOR_PAYMENT_CREATED, () => fetchAll());
    const offExtra = events.on(EVT_EXTRA_COST_CREATED, () => fetchAll());
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

  const onPaymentClosed = async () => {
    setPayOpen(false);
    await fetchAll();
  };

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

  /** Truck options from stats + summary */
  const truckOptions = useMemo(() => {
    const set = new Set<string>();
    wakaaladStats?.sold_by_truck_plate.forEach((r) => {
      if (r.truck_plate && r.truck_plate.trim()) set.add(r.truck_plate.trim());
    });
    wakaaladStats?.moved_by_truck_plate.forEach((r) => {
      if (r.truck_plate && r.truck_plate.trim()) set.add(r.truck_plate.trim());
    });
    summary?.items.forEach((it) => {
      if (it.truck_plate && it.truck_plate.trim()) set.add(it.truck_plate.trim());
    });
    const arr = Array.from(set).sort((a, b) => a.localeCompare(b));
    return [ALL_TRUCKS, ...arr];
  }, [summary, wakaaladStats]);

  useEffect(() => {
    if (!truckOptions.includes(selectedTruck)) {
      setSelectedTruck(ALL_TRUCKS);
    }
  }, [truckOptions, selectedTruck]);

  const unitLabel = displayUnit === 'liters' ? 'L' : displayUnit === 'fuusto' ? 'Fuusto' : 'Caag';

  /** Metrics: remaining, sold, moved (in liters) depending on selected truck */
  const remainingLiters = useMemo(() => {
    if (!summary) return 0;
    if (selectedTruck === ALL_TRUCKS) {
      return Number(overall?.total_instock_l ?? 0);
    }
    const plate = selectedTruck;
    return summary.items
      .filter((it) => (it.truck_plate || '').trim() === plate)
      .reduce((acc, it) => acc + Number(it.in_stock_l || 0), 0);
  }, [summary, overall, selectedTruck]);

  const soldLiters = useMemo(() => {
    if (!wakaaladStats) return 0;
    if (selectedTruck === ALL_TRUCKS) return Number(wakaaladStats.total_sold_l || 0);
    const row = wakaaladStats.sold_by_truck_plate.find(
      (r) => (r.truck_plate || '').trim() === selectedTruck
    );
    return Number(row?.total_sold_l || 0);
  }, [wakaaladStats, selectedTruck]);

  const movedLiters = useMemo(() => {
    if (!wakaaladStats) return 0;
    if (selectedTruck === ALL_TRUCKS) return Number(wakaaladStats.moved_total_l || 0);
    const row = wakaaladStats.moved_by_truck_plate.find(
      (r) => (r.truck_plate || '').trim() === selectedTruck
    );
    return Number(row?.moved_l || 0);
  }, [wakaaladStats, selectedTruck]);

  const remainingDisplay = convertLitersForDisplay(remainingLiters, displayUnit);
  const soldDisplay = convertLitersForDisplay(soldLiters, displayUnit);
  const movedDisplay = convertLitersForDisplay(movedLiters, displayUnit);
  const kpiDecimals = displayUnit === 'liters' ? 0 : 2;

  /** CHILD SECTION (popup): Oil type header + plate/date inline; lines: Oil cost / Stock */
  const renderChildSection = (
    c: OilDueLine,
    ix: number,
    plate?: string | null,
    dateIso?: string | null
  ) => {
    const stockL = Number(c.in_stock_l || 0);
    const stockDisplay = convertLitersForDisplay(stockL, displayUnit);
    const stockLabel = `Stock (${unitLabel})`;
    const stockValue = `${formatNumber(stockDisplay, kpiDecimals)} ${unitLabel}  ·  ${formatNumber(
      stockL,
      0
    )} L`;

    return (
      <View key={`child_${c.oil_id}_${ix}`} style={styles.childSection}>
        <View style={styles.childHeader}>
          <Text style={styles.childHeaderTitle}>
            {(c.oil_type || 'OIL').toString().toUpperCase()}
          </Text>

          {/* plate + date inline with oiltype header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {!!plate && (
              <View style={styles.inlinePill}>
                <Feather name="truck" size={10} color={COLOR_TEXT} />
                <Text style={styles.inlinePillTxt}>{plate}</Text>
              </View>
            )}
            {!!dateIso && (
              <View style={styles.inlinePill}>
                <Feather name="calendar" size={10} color={COLOR_TEXT} />
                <Text style={styles.inlinePillTxt}>{formatDateLocal(dateIso)}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.inlineGrid}>
          <Field label="Oil cost" value={formatCurrency(c.oil_total_landed_cost)} />
          <Field label={stockLabel} value={stockValue} />
        </View>
      </View>
    );
  };

  return (
    <View style={styles.page}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: COLOR_BG }}>
        <StatusBar style="light" translucent />
        <LinearGradient
          colors={['#0B2447', '#0B2447']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.header, { paddingTop: 6, overflow: 'hidden' }]}
        >
          <View style={styles.headerBar}>
            {/* Back */}
            <TouchableOpacity
              onPress={() => router.replace('/menu')}
              style={styles.backBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="arrow-left" size={16} color="#E0E7FF" />
            </TouchableOpacity>

            <View style={{ flex: 1 }} />

            {/* Title + Date (right aligned) */}
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.headerTitle}>Purchase Oil</Text>
              <Text style={styles.headerDate}>
                {dayjs(effectiveRange.range.startDate).format('MMM D, YYYY')} –{' '}
                {dayjs(effectiveRange.range.endDate).format('MMM D, YYYY')}
              </Text>
            </View>
          </View>
        </LinearGradient>
      </SafeAreaView>

      {/* KPI row: Big overview card with small stat cards (Remaining / Sold / Moved) */}
      <View style={styles.cardsRowSingle}>
        <View style={styles.cardKPIFlex}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitleMain}>Oil Overview</Text>

            <TouchableOpacity onPress={() => setShowFilters(true)} style={styles.dateChipBtnSmall}>
              <Feather name="calendar" size={11} color="#0B2447" />
              <Text style={styles.dateChipTxtSmall}>Display</Text>
            </TouchableOpacity>
          </View>

          {/* Inner stat cards (smaller + dark blue) */}
          <View style={styles.kpiInnerRow}>
            {/* Remaining */}
            <View style={styles.kpiStatCard}>
              <View style={styles.kpiStatHeader}>
                <Text style={styles.kpiStatLabel}>Remaining</Text>
                <Feather name="droplet" size={12} color="#E5E7EB" />
              </View>
              <Text style={styles.kpiStatValue}>
                {formatNumber(remainingDisplay, kpiDecimals)} {unitLabel}
              </Text>
              <Text style={styles.kpiStatSub}>{formatNumber(remainingLiters, 0)} L</Text>
            </View>

            {/* Total Sold */}
            <View style={styles.kpiStatCard}>
              <View style={styles.kpiStatHeader}>
                <Text style={styles.kpiStatLabel}>Total Sold</Text>
                <Feather name="trending-up" size={12} color="#E5E7EB" />
              </View>
              <Text style={styles.kpiStatValue}>
                {formatNumber(soldDisplay, kpiDecimals)} {unitLabel}
              </Text>
              <Text style={styles.kpiStatSub}>{formatNumber(soldLiters, 0)} L</Text>
            </View>

            {/* Total Moved */}
            <View style={styles.kpiStatCard}>
              <View style={styles.kpiStatHeader}>
                <Text style={styles.kpiStatLabel}>Total Moved</Text>
                <Feather name="truck" size={12} color="#E5E7EB" />
              </View>
              <Text style={styles.kpiStatValue}>
                {formatNumber(movedDisplay, kpiDecimals)} {unitLabel}
              </Text>
              <Text style={styles.kpiStatSub}>{formatNumber(movedLiters, 0)} L</Text>
            </View>
          </View>
        </View>
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
              // normal / lot or offline-both bills (we already have child_oils)
              right = children.slice(0, 2);
            } else {
              // 🔁 Fallback for offline *single* bills (no child_oils, no oil_id yet)
              const liters = Number(it.liters || 0);
              const oilType = it.oil_type || null;

              if (liters > 0 || oilType || it.oil_id) {
                right = [
                  {
                    oil_id: it.oil_id ?? 0, // 0 = local/unknown id
                    oil_type: oilType,
                    liters,
                    sold_l: 0,
                    in_stock_l: liters, // treat all liters as current stock
                    oil_total_landed_cost: Number(it.oil_total_landed_cost || 0),
                    total_extra_cost: Number(it.total_extra_cost || 0),
                    over_all_cost:
                      typeof it.over_all_cost === 'number'
                        ? Number(it.over_all_cost)
                        : Number(it.oil_total_landed_cost || 0) +
                          Number(it.total_extra_cost || 0),
                    total_paid: Number(it.total_paid || 0),
                    amount_due: Number(it.amount_due || 0),
                    extra_costs: it.extra_costs || [],
                  },
                ];
              }
            }

            // 🔹 Real ids for this row (for Extra charges button)
            const rowRealLotId = it.lot_id && it.lot_id > 0 ? it.lot_id : null;
            const rowRealOilId =
              it.oil_id && it.oil_id > 0
                ? it.oil_id
                : it.child_oils?.[0]?.oil_id && it.child_oils[0].oil_id! > 0
                ? it.child_oils[0].oil_id!
                : null;
            const canOpenRowExtras = !!(rowRealLotId || rowRealOilId);

            return (
              <TouchableOpacity
                key={billKey(it, idx)}
                style={styles.card}
                activeOpacity={0.9}
                onPress={() => setSelected(it)}
              >
                {/* LEFT */}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.supplier} numberOfLines={1}>
                    {title}
                  </Text>

                  <View style={styles.childRow}>
                    {/* Date pill */}
                    <View style={styles.childPill}>
                      <Feather name="calendar" size={10} color={COLOR_TEXT} />
                      <Text style={styles.childText}>{formatDateLocal(it.date)}</Text>
                    </View>

                    {/* 🔹 Extra charges – main row button */}
                    <TouchableOpacity
                      style={[
                        styles.headerTabBtn,
                        { paddingVertical: 3, paddingHorizontal: 8 },
                        !canOpenRowExtras && { opacity: 0.5 },
                      ]}
                      activeOpacity={canOpenRowExtras ? 0.9 : 1}
                      disabled={!canOpenRowExtras}
                      onPress={(e) => {
                        e.stopPropagation(); // don't trigger card onPress
                        if (!canOpenRowExtras) return;

                        const plate = (it.truck_plate || '').trim();

                        if (rowRealLotId) {
                          router.push({
                            pathname: '/Shidaal/extracostspage',
                            params: { lot_id: String(rowRealLotId), plate },
                          });
                        } else if (rowRealOilId) {
                          router.push({
                            pathname: '/Shidaal/extracostspage',
                            params: { oil_id: String(rowRealOilId), plate },
                          });
                        }
                      }}
                    >
                      <Feather name="layers" size={11} color="#0B2447" />
                      <Text style={styles.headerTabTxt}>Extra charges</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* RIGHT: Child oil(s) compact */}
                <View style={styles.rightCol}>
                  {right.map((c, ix) => (
                    <ChildOilBadge
                      key={`${c.oil_id}_${ix}`}
                      label={(c.oil_type || '—').toUpperCase()}
                      instock={Number(c.in_stock_l || 0)}
                      displayUnit={displayUnit}
                    />
                  ))}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Floating "+ Dalab Cusub" button */}
      <TouchableOpacity
        activeOpacity={0.92}
        style={[styles.fab, { bottom: (insets.bottom || 0) + 85 }]}
        onPress={() => router.push('/Shidaal/oilmodal')}
      >
        <Feather name="plus" size={16} color="#FFFFFF" />
        <Text style={styles.fabTxt}>Dalab Cusub</Text>
      </TouchableOpacity>

      {/* DETAILS POPUP */}
      <Modal visible={detailsOpen} onRequestClose={closeDetails} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={closeDetails}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={[styles.modalCard, { maxHeight: '85%' }]}>
                {/* Header: title on left, Actions on right */}
                <View style={[styles.modalHeader, { marginBottom: 8 }]}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.modalTitle}>
                      {(selected?.truck_plate && selected.truck_plate.trim()) ||
                        selected?.supplier_name ||
                        'Details'}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {(() => {
                      const hasOil = !!(selected?.oil_id || selected?.child_oils?.[0]?.oil_id);
                      return (
                        <TouchableOpacity
                          style={[styles.headerTabBtn, !canOpenActions && { opacity: 0.5 }]}
                          disabled={!canOpenActions}
                          onPress={() => {
                            if (!canOpenActions) return;
                            setActionsOpen(true); // OilActionsModal already gets token, will behave as before
                          }}
                        >
                          <Feather name="settings" size={12} color="#0B2447" />
                          <Text style={styles.headerTabTxt}>Actions</Text>
                        </TouchableOpacity>
                      );
                    })()}
                  </View>
                </View>

                {/* Date line under header */}
                <View
                  style={{
                    marginTop: -2,
                    marginBottom: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Feather name="calendar" size={12} color={COLOR_MUTED} />
                  <Text style={{ color: COLOR_MUTED, fontSize: 11, fontWeight: '700' }}>
                    {formatDateLocal(selected?.date)}
                  </Text>
                </View>

                {/* List header inside popup — Truck plate only */}
                <View style={styles.listHeaderRow}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      flexShrink: 1,
                    }}
                  >
                    {!!(selected?.truck_plate && selected.truck_plate.trim()) && (
                      <View style={styles.inlinePill}>
                        <Feather name="truck" size={11} color={COLOR_TEXT} />
                        <Text style={styles.inlinePillTxt} numberOfLines={1}>
                          {selected.truck_plate.trim()}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                <View style={styles.listHeaderDivider} />

                <ScrollView
                  contentContainerStyle={{ paddingBottom: 10 }}
                  showsVerticalScrollIndicator
                  keyboardShouldPersistTaps="handled"
                >
                  {/* MAIN first: Child oil sections */}
                  {selected?.child_oils && selected.child_oils.length > 0
                    ? selected.child_oils.map((c, ix) =>
                        renderChildSection(
                          c,
                          ix,
                          selected?.truck_plate || undefined,
                          selected?.date || undefined
                        )
                      )
                    : selected?.oil_id
                    ? renderChildSection(
                        {
                          oil_id: selected.oil_id!,
                          oil_type: selected.oil_type,
                          liters: selected.liters,
                          sold_l: 0,
                          in_stock_l: 0,
                          oil_total_landed_cost: selected.oil_total_landed_cost,
                          total_extra_cost: selected.total_extra_cost,
                          over_all_cost:
                            selected.over_all_cost ??
                            selected.oil_total_landed_cost + selected.total_extra_cost,
                          total_paid: selected.total_paid,
                          amount_due: selected.amount_due,
                          extra_costs: [],
                        },
                        0,
                        selected?.truck_plate || undefined,
                        selected?.date || undefined
                      )
                    : null}

                  {/* Total Extra Costs */}
                  <Divider />
                  <View style={styles.inlineGrid}>
                    <Field
                      label="Total Extra Costs"
                      value={formatCurrency(
                        (() => {
                          const children = selected?.child_oils || [];
                          if (typeof selected?.total_extra_cost === 'number')
                            return Number(selected?.total_extra_cost || 0);
                          if (children.length > 0)
                            return children.reduce(
                              (acc, c) => acc + Number(c.total_extra_cost || 0),
                              0
                            );
                          return 0;
                        })()
                      )}
                    />
                  </View>

                  {/* Overall / Paid / Due */}
                  <Divider />
                  <View style={[styles.inlineGrid, { marginBottom: 4 }]}>
                    <Field
                      label="Overall cost"
                      value={formatCurrency(
                        (() => {
                          const base = Number(selected?.over_all_cost ?? 0);
                          if (base) return base;
                          return Number(
                            (selected?.oil_total_landed_cost || 0) + (selected?.total_extra_cost || 0)
                          );
                        })()
                      )}
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

      {/* Vendor Payment Sheet */}
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

      {/* Filters Modal (now "Display") */}
      <Modal visible={showFilters} transparent animationType="fade" onRequestClose={closeFilters}>
        <TouchableWithoutFeedback onPress={closeFilters}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={[styles.modalCard, { width: '94%', maxHeight: '80%' }]}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Display</Text>
                  <TouchableOpacity onPress={closeFilters}>
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
                          setDateRange({
                            startDate: dayjs().startOf('day').toDate(),
                            endDate: dayjs().endOf('day').toDate(),
                          });
                          closeFilters();
                        }}
                      />
                      <QuickRangeChip
                        label={`This Month (${dayjs().format('MMM')})`}
                        onPress={() => {
                          setDateRange({
                            startDate: dayjs().startOf('month').toDate(),
                            endDate: dayjs().endOf('month').toDate(),
                          });
                          closeFilters();
                        }}
                      />
                      <QuickRangeChip
                        label={`This Year (${dayjs().format('YYYY')})`}
                        onPress={() => {
                          setDateRange({
                            startDate: dayjs().startOf('year').toDate(),
                            endDate: dayjs().endOf('day').toDate(),
                          });
                          closeFilters();
                        }}
                      />
                    </View>
                  </View>

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
                        <Feather name="calendar" size={12} color="#0B2447" />
                      </TouchableOpacity>
                      <Text style={styles.rangeSep}>to</Text>
                      <TouchableOpacity
                        style={styles.dateBtn}
                        onPress={() => setShowDatePicker('end')}
                      >
                        <Text style={styles.dateBtnText}>
                          {dayjs(dateRange.endDate).format('MMM D, YYYY')}
                        </Text>
                        <Feather name="calendar" size={12} color="#0B2447" />
                      </TouchableOpacity>
                    </View>

                    {showDatePicker && (
                      <DateTimePicker
                        value={showDatePicker === 'start' ? dateRange.startDate : dateRange.endDate}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(_, sel) => {
                          const picker = showDatePicker;
                          setShowDatePicker(null);
                          if (!sel) return;
                          setDateRange((prev) =>
                            picker === 'start'
                              ? { ...prev, startDate: dayjs(sel).startOf('day').toDate() }
                              : { ...prev, endDate: dayjs(sel).endOf('day').toDate() }
                          );
                        }}
                      />
                    )}
                  </View>

                  {/* Truck + Display unit (button opens real popup) */}
                  <View style={styles.filterSection}>
                    <Text style={styles.filterLabel}>Truck & Display In</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {/* Truck picker */}
                      <View style={styles.pickerContainer}>
                        <Text style={styles.pickerLabel}>Truck</Text>
                        <TouchableOpacity
                          style={styles.pickerBtn}
                          activeOpacity={0.9}
                          onPress={() => setTruckPickerOpen(true)}
                        >
                          <Text style={styles.pickerValue} numberOfLines={1}>
                            {selectedTruck === ALL_TRUCKS ? 'All trucks' : selectedTruck}
                          </Text>
                          <Feather name="chevron-down" size={14} color="#0B2447" />
                        </TouchableOpacity>
                      </View>

                      {/* Unit picker */}
                      <View style={styles.pickerContainer}>
                        <Text style={styles.pickerLabel}>Display in</Text>
                        <TouchableOpacity
                          style={styles.pickerBtn}
                          activeOpacity={0.9}
                          onPress={() => setUnitPickerOpen(true)}
                        >
                          <Text style={styles.pickerValue}>
                            {displayUnit === 'liters'
                              ? 'Liters'
                              : displayUnit === 'fuusto'
                              ? 'Fuusto'
                              : 'Caag'}
                          </Text>
                          <Feather name="chevron-down" size={14} color="#0B2447" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </ScrollView>

                <View style={styles.filterActions}>
                  <TouchableOpacity
                    style={styles.resetBtn}
                    onPress={() => {
                      setDateRange({
                        startDate: dayjs().startOf('month').toDate(),
                        endDate: dayjs().endOf('day').toDate(),
                      });
                      setSelectedTruck(ALL_TRUCKS);
                      setDisplayUnit('liters');
                    }}
                  >
                    <Text style={styles.resetTxt}>Reset</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.applyBtn} onPress={closeFilters}>
                    <Text style={styles.applyTxt}>Apply</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* REAL POPUP: Truck picker */}
      <Modal
        visible={truckPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setTruckPickerOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setTruckPickerOpen(false)}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.pickerCard}>
                <View style={styles.pickerModalHeader}>
                  <Text style={styles.pickerModalTitle}>Select Truck</Text>
                  <TouchableOpacity onPress={() => setTruckPickerOpen(false)}>
                    <AntDesign name="close" size={16} color="#1F2937" />
                  </TouchableOpacity>
                </View>

                <ScrollView style={{ maxHeight: 260 }}>
                  {truckOptions.map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={styles.pickerOption}
                      activeOpacity={0.9}
                      onPress={() => {
                        setSelectedTruck(opt);
                        setTruckPickerOpen(false);
                      }}
                    >
                      <Text style={styles.pickerOptionText}>
                        {opt === ALL_TRUCKS ? 'All trucks' : opt}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* REAL POPUP: Display in picker */}
      <Modal
        visible={unitPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setUnitPickerOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setUnitPickerOpen(false)}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.pickerCard}>
                <View style={styles.pickerModalHeader}>
                  <Text style={styles.pickerModalTitle}>Display In</Text>
                  <TouchableOpacity onPress={() => setUnitPickerOpen(false)}>
                    <AntDesign name="close" size={16} color="#1F2937" />
                  </TouchableOpacity>
                </View>

                <View>
                  {(['liters', 'fuusto', 'caag'] as const).map((u) => (
                    <TouchableOpacity
                      key={u}
                      style={styles.pickerOption}
                      activeOpacity={0.9}
                      onPress={() => {
                        setDisplayUnit(u);
                        setUnitPickerOpen(false);
                      }}
                    >
                      <Text style={styles.pickerOptionText}>
                        {u === 'liters'
                          ? 'Liters'
                          : u === 'fuusto'
                          ? 'Fuusto (240L)'
                          : 'Caag (20L)'}
                      </Text>
                    </TouchableOpacity>
                  ))}
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
      <Text
        style={[{ color: COLOR_TEXT, fontSize: 12, fontWeight: '800' }, valueStyle]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}
function Divider() {
  return <View style={{ height: 1, backgroundColor: COLOR_DIV, marginVertical: 10 }} />;
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
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
    position: 'relative',
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 14, fontWeight: '800', color: '#E0E7FF' },
  headerDate: { fontSize: 10, color: '#CBD5E1', marginTop: 2 },

  /* KPI row (single big card) */
  cardsRowSingle: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
    paddingHorizontal: 16,
    alignItems: 'stretch',
    zIndex: 40,
  },
  cardKPIFlex: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E8EDF4',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    position: 'relative',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardTitleMain: { color: '#0B2447', fontSize: 12, fontWeight: '900' },
  dateChipBtnSmall: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D8E0F5',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateChipTxtSmall: { color: '#0B2447', fontSize: 9, fontWeight: '900' },

  kpiInnerRow: {
    flexDirection: 'row',
    marginTop: 2,
    gap: 6,
  },
  kpiStatCard: {
    flex: 1,
    borderRadius: 9,
    backgroundColor: '#0B2447',
    borderWidth: 1,
    borderColor: '#0B2447',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  kpiStatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  kpiStatLabel: { fontSize: 9, fontWeight: '800', color: '#E5E7EB' },
  kpiStatValue: { fontSize: 11, fontWeight: '900', color: '#FFFFFF' },
  kpiStatSub: { fontSize: 9, color: '#CBD5F5', marginTop: 1 },

  /* Search row */
  searchRow: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  searchBox: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#94A3B8',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
  },
  searchInput: { flex: 1, fontSize: 12, paddingVertical: 4, color: COLOR_TEXT },

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
    paddingVertical: 9,
    paddingHorizontal: 10,
    marginBottom: 8,
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
  childText: { color: COLOR_TEXT, fontSize: 9, fontWeight: '700' },

  rightCol: { alignItems: 'flex-end', justifyContent: 'center', minWidth: 150, gap: 4 },
  childBadge: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7ECF3',
    borderRadius: 10,
    paddingVertical: 5,
    paddingHorizontal: 7,
    gap: 4,
    minWidth: 140,
  },
  badgeType: { fontSize: 9, fontWeight: '900', color: COLOR_TEXT },

  // Green stock pill
  stockPill: {
    backgroundColor: '#10B981',
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 7,
  },
  stockPillTxt: { color: 'white', fontWeight: '900', fontSize: 8 },

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

  // list header (inside popup)
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  listHeaderDivider: {
    height: 1,
    backgroundColor: COLOR_DIV,
    marginTop: 8,
    marginBottom: 10,
  },

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
  childHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  childHeaderTitle: { fontSize: 12, fontWeight: '900', color: COLOR_TEXT },

  // inline pills in child header
  inlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7ECF3',
  },
  inlinePillTxt: { fontSize: 9, fontWeight: '800', color: COLOR_TEXT },

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
  applyBtn: {
    flex: 1,
    padding: 9,
    borderRadius: 8,
    backgroundColor: '#0B2447',
    alignItems: 'center',
  },
  applyTxt: { fontSize: 11, fontWeight: '800', color: 'white' },

  /* Picker popups */
  pickerContainer: {
    flex: 1,
  },
  pickerLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 3,
  },
  pickerBtn: {
    height: 34,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#D4DFEE',
    backgroundColor: '#F9FAFB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  pickerValue: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0B2447',
    flex: 1,
    marginRight: 6,
  },
  pickerCard: {
    width: '86%',
    maxHeight: '70%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  pickerModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  pickerModalTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#111827',
  },
  pickerOption: {
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  pickerOptionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0B2447',
  },

  /* FAB */
  fab: {
    position: 'absolute',
    right: 16,
    borderRadius: 999,
    backgroundColor: '#0B2447',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 6 },
    }),
  },
  fabTxt: { color: '#FFFFFF', fontWeight: '900', fontSize: 12 },
});
