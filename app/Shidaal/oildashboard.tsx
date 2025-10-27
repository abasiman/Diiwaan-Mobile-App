// app/Shidaal/oildashboard.tsx
import api from '@/services/api';
import { useAuth } from '@/src/context/AuthContext';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import EditOilModal from '../Shidaal/editmodal';

const { width } = Dimensions.get('window');

type OilType = 'diesel' | 'petrol';
type OilStatus = 'in_transit' | 'in_depot' | 'available' | 'reserved' | 'sold' | 'returned' | 'discarded';

type OilTypeTotals = {
  count: number;
  total_instock_l: number;
  total_sold_l: number;
};

type DiiwaanOilRead = {
  id: number;
  truck_plate?: string | null;
  truck_type?: string | null;
  oil_type: OilType;
  qty: number;
  liters: number;
  supplier_name?: string | null;
  from_location?: string | null;
  depot: boolean;
  depot_name?: string | null;
  to_location?: string | null;
  location_notes?: string | null;
  currency: string;
  landed_cost_per_l?: number | null;
  oil_total_cost?: number | null;
  total_landed_cost?: number | null;
  sold_l: number;
  in_stock_l: number;
  available_l: number;
  pay_ment_status?: string | null;
  sell_price_per_l?: number | null;
  sell_price_per_lot?: number | null;
  discount_per_l?: number | null;
  status: OilStatus;
  tax?: number | null;
  oil_well?: string | null;
  oil_well_cost: number;
  created_at: string;
  updated_at: string;
};

type SummaryResponse = {
  totals: Record<string, OilTypeTotals>;
  depot_lots: number;
  items: DiiwaanOilRead[];
};

const STATUS_COLORS: Record<OilStatus, { bg: string; fg: string; bar: string }> = {
  in_transit: { bg: '#E6F0FF', fg: '#1D4ED8', bar: '#93C5FD' },
  in_depot: { bg: '#DFF8F3', fg: '#0F766E', bar: '#99F6E4' },
  available: { bg: '#DCFCE7', fg: '#047857', bar: '#86EFAC' },
  reserved: { bg: '#FEF3C7', fg: '#92400E', bar: '#FCD34D' },
  sold: { bg: '#E5E7EB', fg: '#374151', bar: '#D1D5DB' },
  returned: { bg: '#FCE7F3', fg: '#9D174D', bar: '#F9A8D4' },
  discarded: { bg: '#FEE2E2', fg: '#991B1B', bar: '#FCA5A5' },
};

const ALL_STATUSES: OilStatus[] = [
  'in_transit',
  'in_depot',
  'available',
  'reserved',
  'sold',
  'returned',
  'discarded',
];

function currencySymbolOrCode(currency?: string) {
  if (!currency) return '';
  if (currency.toUpperCase() === 'USD') return '$';
  return `${currency} `;
}

function formatNumber(n?: number | null, fractionDigits = 0) {
  if (n === undefined || n === null || isNaN(Number(n))) return '—';
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: 0,
  }).format(Number(n));
}

function formatMoney(n?: number | null, currency?: string) {
  if (n === undefined || n === null || isNaN(Number(n))) return '—';
  const sym = currencySymbolOrCode(currency);
  return `${sym}${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(Number(n))}`;
}

function formatDateOnly(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

/* =========================================
   MAIN
========================================= */
export default function OilDashboard() {
  const router = useRouter();
  const { token } = useAuth();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [summary, setSummary] = useState<SummaryResponse | null>(null);

  const [showEdit, setShowEdit] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [active, setActive] = useState<DiiwaanOilRead | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get<SummaryResponse>('/diiwaanoil/summary', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSummary(res.data);
    } catch (e: any) {
      console.warn('summary error', e?.response?.data || e?.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await fetchData();
    } finally {
      setRefreshing(false);
    }
  }, [fetchData]);

  const filtered = useMemo(() => {
    if (!summary?.items) return [];
    const q = search.trim().toLowerCase();
    if (!q) return summary.items;
    return summary.items.filter((it) => {
      const plate = (it.truck_plate || '').toLowerCase();
      const type = (it.oil_type || '').toLowerCase();
      const status = (it.status || '').toLowerCase();
      const depotName = (it.depot_name || '').toLowerCase();
      const fromLoc = (it.from_location || '').toLowerCase();
      const toLoc = (it.to_location || '').toLowerCase();
      return (
        plate.includes(q) ||
        type.includes(q) ||
        status.includes(q) ||
        depotName.includes(q) ||
        fromLoc.includes(q) ||
        toLoc.includes(q)
      );
    });
  }, [summary, search]);

  const overall = summary?.totals?.__overall__;

  const handleDelete = useCallback(
    (item: DiiwaanOilRead) => {
      Alert.alert(
        'Delete record',
        `Are you sure you want to delete ${item.truck_plate || 'this record'}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                setDeleting(true);
                await api.delete(`/diiwaanoil/${item.id}`, {
                  headers: { Authorization: `Bearer ${token}` },
                });
                setDeleting(false);
                setShowReceipt(false);
                setActive(null);
                fetchData();
              } catch (e: any) {
                setDeleting(false);
                Alert.alert('Delete failed', e?.response?.data?.detail || 'Unable to delete record.');
              }
            },
          },
        ],
        { cancelable: true },
      );
    },
    [token, fetchData],
  );

  return (
    <View style={[styles.screen, { paddingBottom: Math.max(insets.bottom, 8) }]}>

      {/* Header */}
      <LinearGradient
        colors={['#0B2447', '#0B2447']}
        style={[styles.header, { paddingTop: Math.max(insets.top, 10) + 6 }]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <View style={styles.headerRowTop}>
          <Text style={styles.headerTitle}>Oil Dashboard</Text>

          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => router.push('/Shidaal/oilcreate')}
            activeOpacity={0.9}
          >
            <Feather name="plus" size={14} color="#0B2447" />
            <Text style={styles.addBtnText}>Dalab Cusub</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
      >
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
        <View style={styles.searchWrap}>
          <Feather name="search" size={16} color="#64748B" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search plate, type, status, depot, location…"
            placeholderTextColor="#94A3B8"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Feather name="x-circle" size={16} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {/* Transactions */}
        {loading ? (
          <View style={{ paddingVertical: 36, alignItems: 'center' }}>
            <ActivityIndicator />
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Feather name="inbox" size={36} color="#94A3B8" />
            <Text style={styles.emptyTitle}>No records</Text>
            <Text style={styles.emptySub}>Try changing your search or add a new lot.</Text>
          </View>
        ) : (
          filtered.map((it) => {
            const sc = STATUS_COLORS[it.status] || { bg: '#EEE', fg: '#111', bar: '#DDD' };
            return (
              <TouchableOpacity
                key={it.id}
                onPress={() => {
                  setActive(it);
                  setShowReceipt(true); // open receipt-like popup
                }}
                activeOpacity={0.92}
                style={styles.txCard}  // ⬅️ no color edge
              >
                {/* Top row: status chip & date */}
                <View style={styles.txTopRow}>
                  <View style={[styles.rowStatusPill, { backgroundColor: sc.bg, borderColor: 'rgba(0,0,0,0.06)' }]}>
                    <Text style={[styles.rowStatusText, { color: sc.fg }]}>{it.status.replace('_', ' ')}</Text>
                  </View>
                  <Text style={styles.txDate}>{formatDateOnly(it.created_at)}</Text>
                </View>

                {/* Plate */}
                <Text style={styles.plateText} numberOfLines={1}>
                  {it.truck_plate || '—'}
                </Text>

                {/* Info grid */}
                <View style={styles.txGrid}>
                  <View style={styles.txCell}>
                    <Text style={styles.txLabel}>Oil Type</Text>
                    <Text style={styles.txValue}>{it.oil_type}</Text>
                  </View>
                  <View style={styles.txCell}>
                    <Text style={styles.txLabel}>Stock (L)</Text>
                    <Text style={styles.txValue}>{formatNumber(it.in_stock_l)}</Text>
                  </View>
                  <View style={styles.txCell}>
                    <Text style={styles.txLabel}>Total</Text>
                    <Text style={[styles.txValue, { fontWeight: '800' }]}>
                      {formatMoney(it.oil_total_cost, it.currency)}
                    </Text>
                  </View>
                </View>

                {/* Meta */}
                <View style={styles.metaRow}>
                  <View style={styles.metaChip}>
                    <Feather name="map-pin" size={12} color="#6B7280" />
                    <Text style={styles.metaText}>
                      {(it.depot ? (it.depot_name || 'Depot') : it.to_location) || '—'}
                    </Text>
                  </View>
                  <View style={styles.metaChip}>
                    <Feather name="truck" size={12} color="#6B7280" />
                    <Text style={styles.metaText}>{it.truck_type || '—'}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Receipt-like popup */}
      <ReceiptModal
        visible={!!active && showReceipt}
        item={active}
        onClose={() => setShowReceipt(false)}
        onEdit={() => {
          setShowReceipt(false);
          setShowEdit(true);
        }}
        onDelete={() => active && handleDelete(active)}
        deleting={deleting}
        onStatusChanged={async (updated) => {
          setActive(updated);
          await fetchData();
        }}
      />

      {/* Edit modal */}
      <EditOilModal
        visible={showEdit}
        item={active}
        onClose={() => setShowEdit(false)}
        onSaved={() => {
          setShowEdit(false);
          fetchData();
        }}
      />
    </View>
  );
}

/* ================================ Components ================================ */

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
    <View style={styles.card}>
      <View style={[styles.cardIconWrap, { backgroundColor: iconBg }]}>
        <Feather name={icon} size={16} color={iconColor} />
      </View>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardValue}>{value}</Text>
    </View>
  );
}

/* ---------- Receipt Modal (with explicit black text on buttons & dropdown) ---------- */
function ReceiptModal({
  visible,
  item,
  onClose,
  onEdit,
  onDelete,
  deleting,
  onStatusChanged,
}: {
  visible: boolean;
  item: DiiwaanOilRead | null;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
  onStatusChanged: (updated: DiiwaanOilRead) => void;
}) {
  const { token } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  useEffect(() => {
    if (!visible) {
      setMenuOpen(false);
      setSavingStatus(false);
    }
  }, [visible]);

  if (!item) return null;
  const colors = STATUS_COLORS[item.status] || { bg: '#EEE', fg: '#111', bar: '#DDD' };

  const tryUpdateStatus = async (status: OilStatus, allowForce = false) => {
    try {
      setSavingStatus(true);
      const res = await api.post<DiiwaanOilRead>(
        `/diiwaanoil/${item.id}/status`,
        { status, forbid_sold_with_available: !allowForce },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setSavingStatus(false);
      setMenuOpen(false);
      onStatusChanged(res.data);
    } catch (e: any) {
      setSavingStatus(false);
      const detail: string | undefined = e?.response?.data?.detail;
      if (detail && /available stock/i.test(detail) && status === 'sold') {
        Alert.alert(
          'Force mark as sold?',
          'There is still available stock. Do you want to force the status to "sold"?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Force', style: 'destructive', onPress: () => tryUpdateStatus(status, true) },
          ],
        );
      } else {
        Alert.alert('Status update failed', detail || 'Unable to update status.');
      }
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={receiptStyles.modalBackdrop}>
        <View style={receiptStyles.card}>
          {/* Paper header */}
          <View style={receiptStyles.paperHeader}>
            <Text style={receiptStyles.paperTitle}>Oil Lot Receipt</Text>
            <Text style={receiptStyles.paperMeta}>
              Lot #{item.id} • {formatDateOnly(item.created_at)}
            </Text>
          </View>

          <View style={receiptStyles.dots} />

          {/* Main rows */}
          <RowKV label="Truck Plate" value={item.truck_plate || '—'} />
          <RowKV label="Oil Type" value={item.oil_type.toUpperCase()} />
          <RowKV label="Liters (Total)" value={formatNumber(item.liters)} />
          <RowKV label="In Stock (L)" value={formatNumber(item.in_stock_l)} />
          <RowKV label="Available (L)" value={formatNumber(item.available_l)} />
          <RowKV label="Sold (L)" value={formatNumber(item.sold_l)} />

          <View style={receiptStyles.dots} />

          <RowKV label="Landed / L" value={formatMoney(item.landed_cost_per_l, item.currency)} />
          <RowKV label="Sell / L" value={item.sell_price_per_l == null ? '—' : formatMoney(item.sell_price_per_l, item.currency)} />
          <RowKV label="Tax" value={item.tax == null ? '—' : formatMoney(item.tax, item.currency)} />
          <RowKV label="Total Landed" value={formatMoney(item.total_landed_cost, item.currency)} />
          <RowKV label="Oil Total Cost" value={formatMoney(item.oil_total_cost, item.currency)} />

          <View style={receiptStyles.dots} />

          <RowKV label="From" value={item.from_location || '—'} />
          <RowKV label="To" value={(item.depot ? (item.depot_name || 'Depot') : item.to_location) || '—'} />
          <RowKV label="Truck Type" value={item.truck_type || '—'} />
          <RowKV label="Status" value={item.status.replace('_', ' ')} valueColor={colors.fg} />

          {/* Actions row (explicit colored buttons with BLACK text) */}
          <View style={receiptStyles.actions}>
            {/* Status picker */}
            <View style={{ position: 'relative' }}>
              <TouchableOpacity
                onPress={() => setMenuOpen((s) => !s)}
                activeOpacity={0.9}
                style={[receiptStyles.actionBtn, { backgroundColor: '#E0E7FF', borderColor: '#C7D2FE' }]}
              >
                <Feather name="flag" size={14} color="#111111" />
                <Text style={receiptStyles.actionBtnText}>
                  {savingStatus ? 'Saving…' : 'Change Status'}
                </Text>
                <Feather
                  name={menuOpen ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color="#111111"
                  style={{ marginLeft: 4 }}
                />
              </TouchableOpacity>

              {menuOpen && (
                <View style={receiptStyles.menu}>
                  {ALL_STATUSES.map((st) => {
                    const c = STATUS_COLORS[st];
                    return (
                      <TouchableOpacity
                        key={st}
                        onPress={() => tryUpdateStatus(st)}
                        disabled={savingStatus}
                        style={receiptStyles.menuItem}
                        activeOpacity={0.8}
                      >
                        <View style={[receiptStyles.menuDot, { backgroundColor: c.bg, borderColor: c.fg }]} />
                        <Text style={receiptStyles.menuText}>{st.replace('_', ' ')}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Edit */}
            <TouchableOpacity
              onPress={onEdit}
              activeOpacity={0.9}
              style={[receiptStyles.actionBtn, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}
            >
              <Feather name="edit-3" size={14} color="#111111" />
              <Text style={receiptStyles.actionBtnText}>Edit</Text>
            </TouchableOpacity>

            {/* Delete */}
            <TouchableOpacity
              onPress={onDelete}
              disabled={deleting}
              activeOpacity={0.9}
              style={[
                receiptStyles.actionBtn,
                { backgroundColor: '#FEE2E2', borderColor: '#FECACA', opacity: deleting ? 0.6 : 1 },
              ]}
            >
              <Feather name="trash-2" size={14} color="#111111" />
              <Text style={receiptStyles.actionBtnText}>Delete</Text>
            </TouchableOpacity>
          </View>

          {/* Close */}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.9}>
            <Feather name="check" size={14} color="#fff" />
            <Text style={styles.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function RowKV({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={receiptStyles.row}>
      <Text style={receiptStyles.k}>{label}</Text>
      <Text style={[receiptStyles.v, valueColor ? { color: valueColor } : null]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/* ================================ Styles ================================ */

const CARD_WIDTH = (width - 16 * 2 - 10 * 2) / 3;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F8FC' },

  /* Header */
  header: {
    paddingBottom: 12,
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

  /* KPI cards */
  cardsRow: { flexDirection: 'row', gap: 10, marginTop: 12, paddingHorizontal: 16 },
  card: {
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

  /* Search */
  searchWrap: {
    marginTop: 10,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: { flex: 1, fontSize: 13, paddingVertical: 6, color: '#0F172A' },

  /* Transaction card (NO color edge) */
  txCard: {
    position: 'relative',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.25,
    borderColor: '#DADDE2',
    shadowColor: '#09121A',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    // ⛔️ Removed: borderLeftWidth and color edge
  },
  txTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  txDate: { fontSize: 10, color: '#6B7280' },

  rowStatusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 6,
  },
  rowStatusText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'capitalize',
  },

  plateText: { color: '#0B1221', fontSize: 14, fontWeight: '800', marginTop: 2 },

  txGrid: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  txCell: {
    flexGrow: 1,
    flexBasis: '30%',
    backgroundColor: '#FAFAFC',
    borderWidth: 1,
    borderColor: '#EEF2F7',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  txLabel: { fontSize: 10, color: '#6B7280', marginBottom: 2 },
  txValue: { fontSize: 13, color: '#0B1221', fontWeight: '700' },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  metaText: { color: '#6B7280', fontSize: 11 },

  /* Empty state */
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 28,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginHorizontal: 16,
    marginTop: 6,
    backgroundColor: '#FFFFFF',
  },
  emptyTitle: { color: '#111827', fontWeight: '800', fontSize: 15, marginTop: 8 },
  emptySub: { color: '#6b7280', fontSize: 12, marginTop: 2 },

  /* Generic Close button (bottom of popup) */
  closeBtn: {
    margin: 12,
    backgroundColor: '#0F172A',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  closeBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});

/* ---------- Receipt styles ---------- */
const receiptStyles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#FFFEFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E9EDF5',
    paddingVertical: 14,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 12,
    elevation: 4,
  },
  paperHeader: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#EFEDE6',
    borderStyle: 'dashed',
    paddingBottom: 6,
  },
  paperTitle: { fontSize: 15, fontWeight: '900', color: '#0B1220' },
  paperMeta: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  dots: { borderBottomWidth: 1, borderStyle: 'dotted', borderColor: '#C7D2FE', marginVertical: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  k: { color: '#475569', fontSize: 12, fontWeight: '700' },
  v: { color: '#0B1220', fontSize: 12, fontWeight: '800', marginLeft: 10, flexShrink: 1, textAlign: 'right' },

  /* Actions row */
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionBtnText: { color: '#111111', fontWeight: '800', fontSize: 12 },

  /* Dropdown (all explicit black text) */
  menu: {
    position: 'absolute',
    top: 44,
    left: 0,
    right: 'auto',
    minWidth: 180,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
    zIndex: 9999,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  menuText: { fontSize: 12, color: '#111111', textTransform: 'capitalize' }, // explicit black
  menuDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 8,
  },

















  /* Modal */
 modalBackdrop: {
  flex: 1,
  backgroundColor: 'rgba(0,0,0,0.35)',
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: 16,
},

  modalCard: {
    width: '100%',
    maxWidth: 560,
    maxHeight: 560,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EEF2F7',
    overflow: 'visible',              // FIX: allow dropdown to extend over the body
  },
  modalHeader: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    position: 'relative',             // FIX: create stacking context for absolute menu
    zIndex: 50,                       // FIX: stay above the scroll body
    elevation: 8,                     // FIX (Android): ensure header sits above
    backgroundColor: '#fff',
  },
  modalTitle: { fontSize: 15, fontWeight: '700' },
  modalBody: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    zIndex: 0,                        // FIX: body sits below header/menu
  },
  gridRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  detailField: {
    flex: 1,
    backgroundColor: '#FAFAFC',
    borderWidth: 1,
    borderColor: '#EEF2F7',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  detailLabel: { color: '#6B7280', fontSize: 11, marginBottom: 2 },
  detailValue: { color: '#111827', fontSize: 13, fontWeight: '600' },

  statusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusBtnText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },

  statusMenu: {
    position: 'absolute',
    top: 34,
    right: 0,
    minWidth: 170,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,                    // FIX (Android): raise above other views
    zIndex: 9999,                     // FIX (iOS): raise above other views
  },
  statusMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  statusMenuText: { fontSize: 12, textTransform: 'capitalize', color: '#0B1221' },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 8,
  },

  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  actionPillText: { fontSize: 12, fontWeight: '700' },

  summaryCard: {
    marginTop: 8,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#EEF2F7',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  summaryTitle: { fontSize: 13, fontWeight: '700', color: '#111827', marginBottom: 6 },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  summaryLabel: { fontSize: 12, color: '#374151' },
  summaryValue: { fontSize: 12, color: '#111827', fontWeight: '600' },
  summaryDivider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 6 },

  closeBtn: {
    margin: 12,
    backgroundColor: '#0F172A',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  closeBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
