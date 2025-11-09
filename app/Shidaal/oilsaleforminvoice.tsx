import api from '@/services/api';
import { useAuth } from '@/src/context/AuthContext';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';



import { queueOilRepriceForSync } from '../dbform/oilRepriceOfflineRepo';

import { upsertLocalWakaaladSellOption } from '../dbform/wakaaladSellOptionsRepo';

import {
  getCustomersLocal,
  upsertCustomersFromServer
} from '../db/customerRepo';




import { getWakaaladSellOptionsLocal, type WakaaladSellOption } from '../dbform/wakaaladSellOptionsRepo';



import NetInfo from '@react-native-community/netinfo';

import { queueOilSaleForSync } from '../dbform/invocieoilSalesOfflineRepo';
import SaleCurrencyModal, { CurrencyKey } from './SaleCurrencyModal';
import CustomerCreateModal from './customercreate';

const BORDER = '#CBD5E1';

type SaleUnitType = 'liters' | 'fuusto' | 'caag';
type SaleType = 'cashsale' | 'invoice';

type CreateSalePayload = {
  oil_id: number;
  wakaalad_id: number;
  unit_type: SaleUnitType;
  unit_qty?: number;
  liters_sold?: number;
  price_per_l?: number;
  customer?: string | null;
  customer_contact?: string | null;
  currency?: string;
  fx_rate_to_usd?: number;
  sale_type: SaleType;
};

type OilSaleRead = {
  id: number;
  oil_id: number;
  owner_id: number;
  customer?: string | null;
  customer_contact?: string | null;
  oil_type: string;
  unit_type: SaleUnitType;
  unit_qty: number;
  unit_capacity_l?: number | null;
  liters_sold: number;
  currency: string;
  price_per_l?: number | null;
  subtotal_native?: number | null;
  discount_native?: number | null;
  tax_native?: number | null;
  total_native?: number | null;
  fx_rate_to_usd?: number | null;
  total_usd?: number | null;
  payment_status: 'unpaid' | 'partial' | 'paid';
  payment_method?: 'cash' | 'bank' | 'mobile' | 'credit' | null;
  paid_native?: number | null;
  note?: string | null;
  created_at: string;
  updated_at: string;
};

type Customer = {
  id: number;
  name: string;
  contact?: string | null;
  phone?: string | null;
};

// Fallback capacities
const DEFAULT_FUUSTO_L = 240;
const DEFAULT_CAAG_L = 20;

const DISPLAY_SYMBOL: Record<'USD' | 'SOS', string> = { USD: '$', SOS: 'Sh' };
const CURRENCY_FROM_KEY: Record<CurrencyKey, 'USD' | 'SOS'> = { USD: 'USD', shimaal: 'SOS' };
const SALE_TYPE: SaleType = 'invoice';

const fmtNum = (n: number, d = 2) => Number(n).toFixed(d);
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const symbolFor = (cur?: string | null) =>
  (cur || 'USD').toUpperCase() === 'USD' ? DISPLAY_SYMBOL.USD : DISPLAY_SYMBOL.SOS;

// Helper: resolve capacity in liters for a unit & option
function capacityL(unit: SaleUnitType, opt?: WakaaladSellOption): number {
  if (unit === 'fuusto') return opt?.fuusto_capacity_l ?? DEFAULT_FUUSTO_L;
  if (unit === 'caag') return opt?.caag_capacity_l ?? DEFAULT_CAAG_L;
  return 1;
}

function billableFuustoL(opt?: WakaaladSellOption): number {
  const physical = capacityL('fuusto', opt);
  const isPetrol = (opt?.oil_type || '').toLowerCase() === 'petrol';
  return isPetrol ? Math.max(0, physical - 10) : physical;
}

/* ---------- Tiny toast ---------- */
function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const anim = useRef(new Animated.Value(0)).current;

  const show = (msg: string, duration = 2000) => {
    setMessage(msg);
    Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: true }).start(() => {
      setTimeout(() => {
        Animated.timing(anim, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => {
          setMessage(null);
        });
      }, duration);
    });
  };

  const ToastView = () =>
    message ? (
      <Animated.View
        pointerEvents="none"
        style={[
          styles.toast,
          {
            opacity: anim,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
          },
        ]}
      >
        <Feather name="check-circle" size={16} color="#065F46" />
        <Text style={styles.toastText}>{message}</Text>
      </Animated.View>
    ) : null;

  return { show, ToastView };
}

/* ---------- Validation modal ---------- */
function ValidationModal({
  visible,
  title,
  message,
  onClose,
}: {
  visible: boolean;
  title: string;
  message: string;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Feather name="alert-circle" size={18} color="#7C2D12" />
            <Text style={styles.modalTitle}>{title}</Text>
          </View>
          <Text style={styles.modalMessage}>{message}</Text>
          <TouchableOpacity style={styles.modalBtn} onPress={onClose} activeOpacity={0.92}>
            <Text style={styles.modalBtnText}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/* ---------- Receipt modal ---------- */
function ReceiptModal({
  visible,
  receipt,
  onClose,
}: {
  visible: boolean;
  receipt: OilSaleRead | null;
  onClose: () => void;
}) {
  const symbol = receipt?.currency?.toUpperCase() === 'USD' ? DISPLAY_SYMBOL.USD : DISPLAY_SYMBOL.SOS;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { maxWidth: 520 }]}>
          <View style={styles.modalHeaderRow}>
            <Text style={styles.modalBigTitle}>Invoice Receipt</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={18} color="#0B1221" />
            </TouchableOpacity>
          </View>

          {receipt ? (
            <View style={{ gap: 6 }}>
              {!!receipt.customer && (
                <Row
                  label="Customer"
                  value={`${receipt.customer}${receipt.customer_contact ? ` • ${receipt.customer_contact}` : ''}`}
                />
              )}
              <Row label="Sale ID" value={`#${receipt.id}`} />
              <Row label="Oil" value={receipt.oil_type.toUpperCase()} />
              <Row label="Unit Type" value={capitalize(receipt.unit_type)} />
              <Row label="Unit Qty" value={`${receipt.unit_qty}`} />
              <Row label="Liters Sold" value={`${fmtNum(receipt.liters_sold, 2)} L`} />
              <Row label="Currency" value={receipt.currency} />
              <Row
                label="Price / L"
                value={receipt.price_per_l != null ? `${symbol}${fmtNum(receipt.price_per_l, 4)}` : '—'}
              />
              <Row
                label="Subtotal"
                value={receipt.subtotal_native != null ? `${symbol}${fmtNum(receipt.subtotal_native, 2)}` : '—'}
              />
              <Row
                label="Total (Native)"
                value={receipt.total_native != null ? `${symbol}${fmtNum(receipt.total_native, 2)}` : '—'}
              />
              <Row label="Rate" value={receipt.fx_rate_to_usd != null ? String(receipt.fx_rate_to_usd) : '—'} />
              <Row label="Total (USD)" value={receipt.total_usd != null ? `$${fmtNum(receipt.total_usd, 2)}` : '—'} />
              <View style={{ marginTop: 8 }}>
                <Text style={{ fontSize: 11, color: '#6B7280' }}>
                  Created: {new Date(receipt.created_at).toLocaleString()}
                </Text>
              </View>
            </View>
          ) : null}

          <TouchableOpacity style={[styles.modalBtn, { marginTop: 14 }]} onPress={onClose} activeOpacity={0.92}>
            <Text style={styles.modalBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/* ---------- Floating label input ---------- */
function FloatingInput({
  label,
  value,
  onChangeText,
  editable = true,
  keyboardType = 'default',
  placeholder,
  testID,
  rightAddon,
}: {
  label: string;
  value: string;
  onChangeText?: (t: string) => void;
  editable?: boolean;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
  placeholder?: string;
  testID?: string;
  rightAddon?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  const active = focused || (value ?? '').length > 0;

  return (
    <View style={styles.floatWrap}>
      <Text
        style={[
          styles.floatLabel,
          active && styles.floatLabelActive,
          !editable && { color: '#94A3B8' },
        ]}
      >
        {label}
      </Text>

      <TextInput
        testID={testID}
        style={[
          styles.input,
          !editable && styles.inputDisabled,
          { paddingTop: 14, paddingRight: rightAddon ? 84 : 10 },
        ]}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        keyboardType={keyboardType}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />

      {rightAddon ? <View style={styles.addonWrap}>{rightAddon}</View> : null}
    </View>
  );
}

/** Mini modal to change lot price (per liter / fuusto / caag). */
function ChangePriceMiniModal({
  visible,
  onClose,
  oilId,
  authToken,
  initialBasis,
  initialAmount,
  onSaved,
  online,
  ownerId,
}: {
  visible: boolean;
  onClose: () => void;
  oilId: number;
  authToken?: string;
  initialBasis: SaleUnitType;
  initialAmount: string;
  onSaved: (update: { basis: SaleUnitType; value: number; offline?: boolean }) => void;
  online: boolean;
  ownerId?: number;
}) {

  const [basis, setBasis] = useState<SaleUnitType>(initialBasis);
  const [amount, setAmount] = useState<string>(initialAmount || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setBasis(initialBasis);
      setAmount(initialAmount || '');
      setBusy(false);
    }
  }, [visible, initialBasis, initialAmount]);

  const parsed = parseFloat((amount || '').replace(',', '.'));
  const valid = Number.isFinite(parsed) && parsed > 0;

    async function save() {
    if (!valid) return;
    try {
      setBusy(true);
      const round = (x: number, d = 6) => Math.round(x * 10 ** d) / 10 ** d;
      const value = Number((amount || '').replace(',', '.'));

      let payload: Record<string, number> = {};
      if (basis === 'liters') {
        payload.sell_price_per_l = round(value, 6);
      } else if (basis === 'fuusto') {
        payload.sell_price_per_fuusto = round(value, 2);
      } else {
        payload.sell_price_per_caag = round(value, 2);
      }

      // 🔹 OFFLINE (or no token): queue reprice + local update
      if (!online || !authToken) {
        if (ownerId) {
          try {
            await queueOilRepriceForSync(ownerId, oilId, payload);
          } catch (e) {
            console.warn('queueOilRepriceForSync failed', e);
          }
        }
        onSaved({ basis, value, offline: true });
        onClose();
        return;
      }

      // 🔹 ONLINE: hit API now
      await api.post(`/diiwaanoil/${oilId}/reprice`, payload, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      onSaved({ basis, value, offline: false });
      onClose();
    } catch (e: any) {
      console.warn('Reprice failed', e?.response?.data || e?.message || e);
    } finally {
      setBusy(false);
    }
  }


  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { maxWidth: 420 }]}>
          <View style={styles.modalHeaderRow}>
            <Text style={styles.modalBigTitle}>Change Price</Text>
            <TouchableOpacity onPress={onClose}>
              <Feather name="x" size={18} color="#0B1221" />
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Change basis</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            {(['liters', 'fuusto', 'caag'] as SaleUnitType[]).map((b) => {
              const active = basis === b;
              return (
                <TouchableOpacity
                  key={b}
                  onPress={() => setBasis(b)}
                  activeOpacity={0.9}
                  style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {b === 'liters' ? 'Per liter' : b === 'fuusto' ? 'Per fuusto' : 'Per caag'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <FloatingInput
            label={`New price (${basis === 'liters' ? 'per liter' : basis === 'fuusto' ? 'per fuusto' : 'per caag'})`}
            value={amount}
            onChangeText={(t) => {
              let cleaned = t.replace(/[^0-9.]/g, '');
              const firstDot = cleaned.indexOf('.');
              if (firstDot !== -1) {
                cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
              }
              setAmount(cleaned);
            }}
            placeholder="25.00"
          />

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={[styles.modalActionBtn, styles.modalCancel]}
              onPress={onClose}
              activeOpacity={0.92}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalActionBtn, styles.modalSave, (!valid || busy) && { opacity: 0.6 }]}
              onPress={save}
              disabled={!valid || busy}
              activeOpacity={0.92}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalSaveText}>Save</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ─────────────────────────────────────────────
   Customer Picker Popup
────────────────────────────────────────────── */
function CustomerPickerModal({
  visible,
  onClose,
  search,
  onSearch,
  data,
  loading,
  error,
  onLoadMore,
  hasMore,
  onSelect,
  onCreatePress,
}: {
  visible: boolean;
  onClose: () => void;
  search: string;
  onSearch: (q: string) => void;
  data: Customer[];
  loading: boolean;
  error: string | null;
  onLoadMore: () => void;
  hasMore: boolean;
  onSelect: (c: Customer) => void;
  onCreatePress: () => void;
}) {
  const ITEM_H = 56;
  const MAX_H = ITEM_H * 5;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { width: '100%', maxWidth: 480, paddingTop: 10 }]}>
          <View style={styles.modalHeaderRow}>
            <Text style={styles.modalBigTitle}>Select Customer</Text>
            <TouchableOpacity onPress={onClose}>
              <Feather name="x" size={18} color="#0B1221" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={onCreatePress} activeOpacity={0.92} style={styles.createRow}>
            <Feather name="user-plus" size={14} color="#0B1221" />
            <Text style={styles.createRowText}>Create customer</Text>
          </TouchableOpacity>

          <View style={{ marginTop: 8 }}>
            <Text style={styles.label}>Search</Text>
            <TextInput
              value={search}
              onChangeText={onSearch}
              placeholder="Type to search customers"
              placeholderTextColor="#64748B"
              style={[styles.input, { height: 42 }]}
              returnKeyType="search"
            />
            {error ? <Text style={{ marginTop: 6, color: '#B91C1C', fontSize: 11 }}>{error}</Text> : null}
          </View>

          <View style={{ marginTop: 8, borderWidth: 1, borderColor: BORDER, borderRadius: 10, overflow: 'hidden' }}>
            <FlatList
              data={data}
              keyExtractor={(it) => String(it.id)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.optionRowSm}
                  onPress={() => onSelect(item)}
                  activeOpacity={0.9}
                >
                  <Text style={styles.pickerMain}>{item.name}</Text>
                  <Text style={styles.pickerSub}>{item.contact || item.phone || '—'}</Text>
                </TouchableOpacity>
              )}
              style={{ maxHeight: MAX_H }}
              ListFooterComponent={
                loading ? (
                  <View style={{ padding: 10, alignItems: 'center' }}>
                    <ActivityIndicator />
                  </View>
                ) : hasMore ? (
                  <TouchableOpacity
                    style={{ padding: 10, alignItems: 'center' }}
                    onPress={onLoadMore}
                    activeOpacity={0.85}
                  >
                    <Text style={{ fontSize: 12, color: '#0B1221', fontWeight: '700' }}>Load more…</Text>
                  </TouchableOpacity>
                ) : null
              }
            />
          </View>

          <TouchableOpacity style={[styles.modalBtn, { marginTop: 12 }]} onPress={onClose} activeOpacity={0.92}>
            <Text style={styles.modalBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/* ─────────────────────────────────────────────
   Wakaalad Picker Popup (centered)
────────────────────────────────────────────── */
function WakaaladPickerModal({
  visible,
  onClose,
  search,
  onSearch,
  data,
  loading,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  search: string;
  onSearch: (q: string) => void;
  data: WakaaladSellOption[];
  loading: boolean;
  onSelect: (o: WakaaladSellOption) => void;
}) {
  const ITEM_H = 56;
  const MAX_H = ITEM_H * 5;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { width: '100%', maxWidth: 520, paddingTop: 10 }]}>
          <View style={styles.modalHeaderRow}>
            <Text style={styles.modalBigTitle}>Select Wakaalad / Oil</Text>
            <TouchableOpacity onPress={onClose}>
              <Feather name="x" size={18} color="#0B1221" />
            </TouchableOpacity>
          </View>

          <View style={{ marginTop: 8 }}>
            <Text style={styles.label}>Search</Text>
            <TextInput
              value={search}
              onChangeText={onSearch}
              placeholder="Search oil, wakaalad, or plate…"
              placeholderTextColor="#64748B"
              style={[styles.input, { height: 42 }]}
              returnKeyType="search"
            />
          </View>

          <View style={{ marginTop: 8, borderWidth: 1, borderColor: BORDER, borderRadius: 10, overflow: 'hidden' }}>
            {loading ? (
              <View style={{ padding: 10, alignItems: 'center' }}>
                <ActivityIndicator />
              </View>
            ) : data.length === 0 ? (
              <View style={{ padding: 12 }}>
                <Text style={{ color: '#6B7280', fontSize: 12 }}>No matching wakaalad.</Text>
              </View>
            ) : (
              <FlatList
                data={data}
                keyExtractor={(o) => String(o.wakaalad_id)}
                style={{ maxHeight: MAX_H }}
                renderItem={({ item: o }) => (
                  <TouchableOpacity
                    style={styles.optionRowSm}
                    onPress={() => onSelect(o)}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.pickerMain}>
                      {o.oil_type.toUpperCase()} • {o.wakaalad_name} • {o.truck_plate || '—'}
                    </Text>
                    <Text style={styles.pickerSub}>Stock: {fmtNum(o.in_stock_l, 2)} L</Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>

          <TouchableOpacity style={[styles.modalBtn, { marginTop: 12 }]} onPress={onClose} activeOpacity={0.92}>
            <Text style={styles.modalBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function OilSaleInvoiceForm() {
  const router = useRouter();
 const { token, user } = useAuth();
  const { show: showToast, ToastView } = useToast();

  const [options, setOptions] = useState<WakaaladSellOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [selectedWkId, setSelectedWkId] = useState<number | null>(null);
  const selected = useMemo(
    () => options.find((o) => o.wakaalad_id === selectedWkId) || null,
    [options, selectedWkId]
  );

  const [unitType, setUnitType] = useState<SaleUnitType>('liters');

  const [qty, setQty] = useState<string>('1');
  const [priceDisplay, setPriceDisplay] = useState<string>('');

  const [changeOpen, setChangeOpen] = useState(false);

  const { customer_name, customer_contact } =
    useLocalSearchParams<{ customer_name?: string; customer_contact?: string }>();
  const routeCustomerParam = typeof customer_name === 'string' ? customer_name : '';
  const [custName, setCustName] = useState<string>(routeCustomerParam || '');
  const [custContact, setCustContact] = useState<string>(
    typeof customer_contact === 'string' ? customer_contact : ''
  );

  const customerSegment = encodeURIComponent((custName || routeCustomerParam || '').trim());
  const goToInvoices = () => {
    if (customerSegment) router.replace(`/${customerSegment}/invoices`);
    else router.replace('/oilsalespage');
  };

  /* ── Customer popup + fetch list ── */
  const [custPickerOpen, setCustPickerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const limit = 20;
  const offsetRef = useRef(0);
  const loadingRef = useRef(false);




  const [online, setOnline] = useState(true);

useEffect(() => {
  const sub = NetInfo.addEventListener((state) => {
    const ok = Boolean(state.isConnected && state.isInternetReachable);
    setOnline(ok);
  });
  return () => sub();
}, []);

// when we come online, try to sync any pending sales
/* useEffect(() => {
  if (!online || !token || !user?.id) return;
  syncPendingOilSales(token, user.id).catch((e) =>
    console.warn('syncPendingOilSales failed', e)
  );
}, [online, token, user?.id]); */

  const loadCustomers = useCallback(
  async (reset = false) => {
    if (!user?.id) return;
    if (loadingRef.current) return;
    loadingRef.current = true;

    try {
      if (reset) {
        setLoading(true);
        setHasMore(true);
        offsetRef.current = 0;
      }

      const localOffset = reset ? 0 : offsetRef.current;
      let data: Customer[] = [];

      if (online && token) {
        // ONLINE → hit API
        const res = await api.get('/diiwaancustomers', {
          params: {
            q: search || undefined,
            offset: localOffset,
            limit,
          },
          headers: { Authorization: `Bearer ${token}` },
        });

        const raw: any = res.data;
        const list: any[] = Array.isArray(raw?.items)
          ? raw.items
          : Array.isArray(raw)
          ? raw
          : [];

        // optional: keep local cache up to date
        if (list.length) {
          upsertCustomersFromServer(list, user.id);
        }

        data = list.map((c: any) => ({
          id: c.id,
          name: c.name,
          contact: c.contact ?? c.phone ?? null,
          phone: c.phone ?? null,
        }));
      } else {
        // OFFLINE (or no token) → purely local SQLite
        const rows = getCustomersLocal(search, limit, localOffset, user.id);
        data = rows.map((c) => ({
          id: c.id,
          name: c.name || '',
          contact: c.phone ?? null,
          phone: c.phone ?? null,
        }));
      }

      setCustomers((prev) => {
        if (reset) return data;
        const map = new Map(prev.map((c) => [c.id, c]));
        data.forEach((c) => map.set(c.id, { ...map.get(c.id), ...c }));
        return Array.from(map.values());
      });

      setHasMore(data.length === limit);
      offsetRef.current = localOffset + data.length;
      setError(null);
    } catch (e: any) {
      console.warn('loadCustomers failed', e?.response?.data || e?.message || e);

      // Final fallback: try local if something blew up while online
      try {
        const localOffset = reset ? 0 : offsetRef.current;
        const rows = getCustomersLocal(search, limit, localOffset, user?.id || 0);
        const data = rows.map((c) => ({
          id: c.id,
          name: c.name || '',
          contact: c.phone ?? null,
          phone: c.phone ?? null,
        }));

        setCustomers((prev) => (reset ? data : [...prev, ...data]));
        setHasMore(data.length === limit);
        offsetRef.current = localOffset + data.length;
        setError(null);
      } catch (inner: any) {
        setError(inner?.message || 'Failed to load customers.');
      }
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  },
  [user?.id, token, online, search, limit]
);

  useEffect(() => {
    if (custPickerOpen) loadCustomers(true);
  }, [custPickerOpen, loadCustomers]);

  useEffect(() => {
    if (!custPickerOpen) return;
    const t = setTimeout(() => loadCustomers(true), 250);
    return () => clearTimeout(t);
  }, [search, custPickerOpen, loadCustomers]);

  // oil & unit
  const [openOil, setOpenOil] = useState(false);
  const [openUnit, setOpenUnit] = useState(false);

  const [oilQuery, setOilQuery] = useState('');

  // receipt + validation + currency modal
  const [receipt, setReceipt] = useState<OilSaleRead | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [valOpen, setValOpen] = useState(false);
  const [valTitle, setValTitle] = useState('Check input');
  const [valMsg, setValMsg] = useState('Please review your entries.');
  const [finalOpen, setFinalOpen] = useState(false);
  const [finalCurrencyKey, setFinalCurrencyKey] = useState<CurrencyKey>('USD');
  const [finalFxRate, setFinalFxRate] = useState<string>('');

  const openValidation = (title: string, msg: string) => {
    setValTitle(title);
    setValMsg(msg);
    setValOpen(true);
  };

  // fetch wakaalad options
  // instead of calling api.get('/wakaalad_diiwaan/sell-options'...)
useEffect(() => {
  if (!user?.id) return;

  let cancelled = false;

  try {
    setLoadingOptions(true);
    const opts = getWakaaladSellOptionsLocal(user.id, {
      onlyAvailable: true,
      limit: 200,
    });
    if (!cancelled) setOptions(opts);
  } catch (e: any) {
    if (!cancelled) {
      console.warn('Local wakaalad options load failed', e);
      openValidation('Load failed', 'Failed to load wakaalad sell options.');
    }
  } finally {
    if (!cancelled) setLoadingOptions(false);
  }

  return () => {
    cancelled = true;
  };
}, [user?.id]);


  // default price
  useEffect(() => {
    if (!selected) {
      setPriceDisplay('');
      return;
    }
    const p = getUnitPrice(selected, unitType);
    setPriceDisplay(p > 0 ? String(p) : '');
  }, [selected, unitType]);

  // default sale currency based on lot currency
  useEffect(() => {
    if (!selected) {
      setFinalCurrencyKey('USD');
      setFinalFxRate('');
      return;
    }
    const cur = (selected.currency || 'USD').toUpperCase();
    setFinalCurrencyKey(cur === 'USD' ? 'USD' : 'shimaal');
    setFinalFxRate('');
  }, [selected]);

  const qtyNum = useMemo(() => Math.max(parseInt(qty || '0', 10) || 0, 0), [qty]);

  // PHYSICAL liters
  const estimatedLiters = useMemo(() => {
    if (!selected) return 0;
    if (unitType === 'liters') return qtyNum;
    return qtyNum * capacityL(unitType, selected);
  }, [selected, unitType, qtyNum]);

  // BILLED liters
  const billedLiters = useMemo(() => {
    if (!selected) return 0;
    if (unitType === 'liters') return qtyNum;
    if (unitType === 'caag') return qtyNum * capacityL('caag', selected);
    if (unitType === 'fuusto') {
      const cap = capacityL('fuusto', selected);
      const billedPer =
        (selected.oil_type || '').toLowerCase() === 'petrol'
          ? Math.max(0, cap - 10)
          : cap;
      return qtyNum * billedPer;
    }
    return 0;
  }, [selected, unitType, qtyNum]);

  const shortsPerFuusto = useMemo(() => {
    if (!selected || unitType !== 'fuusto') return 0;
    return (selected.oil_type || '').toLowerCase() === 'petrol' ? 10 : 0;
  }, [selected, unitType]);

  const unitLabel = useMemo(
    () => (unitType === 'liters' ? 'Liters' : unitType === 'fuusto' ? 'Fuusto' : 'Caag'),
    [unitType]
  );

  const stockExceeded = useMemo(() => {
    if (!selected) return false;
    const stock = selected.in_stock_l ?? Infinity;
    return estimatedLiters > stock + 1e-9;
  }, [selected, estimatedLiters]);

  const priceNum = useMemo(() => parseFloat((priceDisplay || '').replace(',', '.')) || 0, [priceDisplay]);

  const perLInLotCurrency = useMemo(() => {
    const r = (n: number, d = 6) => Math.round(n * 10 ** d) / 10 ** d;
    if (!selected || priceNum <= 0) return 0;

    if (unitType === 'liters') return r(priceNum, 6);
    if (unitType === 'fuusto') return r(priceNum / billableFuustoL(selected), 6);
    if (unitType === 'caag') return r(priceNum / capacityL('caag', selected), 6);

    return 0;
  }, [selected, unitType, priceNum]);

  const lineTotal = useMemo(() => {
    if (!selected) return 0;
    if (billedLiters <= 0 || perLInLotCurrency <= 0) return 0;
    return billedLiters * perLInLotCurrency;
  }, [selected, billedLiters, perLInLotCurrency]);

  const canSubmit = useMemo(() => {
    if (!selected) return false;
    if (estimatedLiters <= 0) return false;
    if (estimatedLiters > (selected.in_stock_l || 0) + 1e-9) return false;
    if (priceNum <= 0) return false;
    return true;
  }, [selected, estimatedLiters, priceNum]);

  function getUnitPrice(o: WakaaladSellOption, u: SaleUnitType): number {
    const r = (n: number, d = 6) => Math.round(n * 10 ** d) / 10 ** d;
    if (u === 'liters') return o.liter_price != null ? r(o.liter_price, 6) : 0;
    if (u === 'fuusto') return o.fuusto_price != null ? r(o.fuusto_price, 2) : 0;
    if (u === 'caag') return o.caag_price != null ? r(o.caag_price, 2) : 0;
    return 0;
  }

  const lastWarnKeyRef = useRef<string>('');
  useEffect(() => {
    const key = selected ? `${selected.wakaalad_id}-${unitType}-${qtyNum}` : '';
    if (stockExceeded && key && lastWarnKeyRef.current !== key) {
      lastWarnKeyRef.current = key;
      openValidation(
        'Not enough stock',
        `Requested ${fmtNum(estimatedLiters, 2)} L exceeds available ${fmtNum(selected?.in_stock_l ?? 0, 2)} L.`
      );
    }
    if (!stockExceeded) lastWarnKeyRef.current = '';
  }, [stockExceeded, selected, unitType, qtyNum, estimatedLiters]);

  const lotCurrency = (selected?.currency || 'USD').toUpperCase() as 'USD' | 'SOS';
  const saleCurrencyFromKey = (ck: CurrencyKey) => CURRENCY_FROM_KEY[ck];

  function convertPerL(lotCur: 'USD' | 'SOS', saleCur: 'USD' | 'SOS', perL_lot: number, fx: number | undefined) {
    if (perL_lot <= 0) return 0;
    if (lotCur === saleCur) return perL_lot;
    if (!fx || !(fx > 0)) return 0;
    if (lotCur === 'USD' && saleCur === 'SOS') return perL_lot * fx;
    if (lotCur === 'SOS' && saleCur === 'USD') return perL_lot / fx;
    return perL_lot;
  }

  const handleSubmit = () => {
    if (!selected) {
      openValidation('Select wakaalad', 'Please choose a wakaalad to sell from.');
      return;
    }
    if (!canSubmit) {
      openValidation('Invalid amount', 'Please check quantity, price, and stock limits.');
      return;
    }
    setFinalOpen(true);
  };

  const confirmAndCreate = async (pickedCurrencyKey: CurrencyKey, fxRateStr: string) => {
  if (!selected) return;
  if (!user?.id) {
    openValidation('Missing user', 'User ID is required to create sales.');
    return;
  }

  const saleCurrency = saleCurrencyFromKey(pickedCurrencyKey);
  const fxRaw = parseFloat((fxRateStr || '').replace(',', '.'));
  const fxValid = !isNaN(fxRaw) && fxRaw > 0 ? fxRaw : undefined;

  const perL_sale = convertPerL(lotCurrency, saleCurrency, perLInLotCurrency, fxValid);

  if (lotCurrency !== saleCurrency && !fxValid) {
    openValidation('FX required', 'Please provide a valid exchange rate.');
    return;
  }

  const payload: CreateSalePayload = {
    oil_id: selected.oil_id,
    wakaalad_id: selected.wakaalad_id,
    unit_type: unitType,
    sale_type: SALE_TYPE,
    liters_sold: unitType === 'liters' ? qtyNum : undefined,
    unit_qty: unitType === 'fuusto' || unitType === 'caag' ? qtyNum : undefined,
    price_per_l: perL_sale || undefined,
    customer: custName?.trim() ? custName.trim() : undefined,
    customer_contact: custContact?.trim() ? custContact.trim() : undefined,
    currency: saleCurrency,
    fx_rate_to_usd: saleCurrency === 'USD' ? undefined : fxValid,
  };

  setSubmitting(true);
  setFinalOpen(false);

  try {
    if (online && token) {
      // ONLINE: normal API flow
      const res = await api.post<OilSaleRead>('/oilsale', payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setReceipt(res.data);
      setReceiptOpen(true);
      showToast('Invoice created successfully');
    } else {
      // OFFLINE: enqueue to local SQLite queue
      await queueOilSaleForSync(user.id, payload);
      showToast('Invoice saved offline – will sync when online');
    }

    goToInvoices();
  } catch (e: any) {
    openValidation(
      'Create failed',
      String(e?.response?.data?.detail || e?.message || 'Unable to create invoice sale.')
    );
  } finally {
    setSubmitting(false);
  }
};

  const amountUSD: number | null = useMemo(() => {
    if (lineTotal <= 0) return null;
    if (lotCurrency === 'USD') return lineTotal;
    const fx = parseFloat((finalFxRate || '').replace(',', '.'));
    if (fx > 0) return lineTotal / fx;
    return null;
  }, [lineTotal, lotCurrency, finalFxRate]);

  const applyPriceIntoOption = useCallback((oilId: number, update: { basis: SaleUnitType; value: number }) => {
    setOptions((prev) =>
      prev.map((o) => {
        if (o.oil_id !== oilId) return o;
        const next: WakaaladSellOption = { ...o };
        const fuustoBillable = billableFuustoL(next);
        if (update.basis === 'liters') {
          next.liter_price = update.value;
          next.fuusto_price = update.value * fuustoBillable;
          next.caag_price = update.value * capacityL('caag', next);
        } else if (update.basis === 'fuusto') {
          next.fuusto_price = update.value;
          next.liter_price = update.value / fuustoBillable;
          next.caag_price = next.liter_price * capacityL('caag', next);
        } else {
          next.caag_price = update.value;
          next.liter_price = update.value / capacityL('caag', next);
          next.fuusto_price = next.liter_price * fuustoBillable;
        }
        return next;
      })
    );
  }, []);

  const filteredOptions = useMemo(() => {
    const q = oilQuery.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      const a = (o.oil_type || '').toLowerCase();
      const b = (o.wakaalad_name || '').toLowerCase();
      const c = (o.truck_plate || '').toLowerCase();
      return a.includes(q) || b.includes(q) || c.includes(q);
    });
  }, [options, oilQuery]);

  const currentUnitPrice = useMemo(() => (selected ? getUnitPrice(selected, unitType) : 0), [selected, unitType]);
  const hasUnitPrice = currentUnitPrice > 0;

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      {/* Header */}
      <View style={styles.pageHeader}>
        <TouchableOpacity
          onPress={goToInvoices}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.backBtn}
        >
          <Feather name="arrow-left" size={18} color="#0B1221" />
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={styles.headerIconWrap}>
            <Feather name="droplet" size={14} color="#0F172A" />
          </View>
          <Text style={styles.headerTitle}>Create Oil Sale</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Invoice</Text>
          </View>
        </View>

        <View style={{ width: 32 }} />
      </View>

      {/* Content */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.select({ ios: 'padding', android: 'padding' })}
        keyboardVerticalOffset={Platform.select({ ios: 0, android: 0 })}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 14, paddingBottom: 28 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          overScrollMode="always"
          showsVerticalScrollIndicator={false}
        >
          {/* Customer + contact */}
          <View style={styles.inlineRow}>
            <View style={styles.inlineField}>
              <Text style={styles.label}>Customer</Text>
              <TouchableOpacity
                style={styles.selectBtn}
                onPress={() => setCustPickerOpen(true)}
                activeOpacity={0.9}
              >
                <Text style={styles.selectValue} numberOfLines={1}>
                  {custName || 'Select'}
                </Text>
                <Feather name="chevron-down" size={16} color="#0B1221" />
              </TouchableOpacity>
            </View>

            <View style={styles.inlineField}>
              <Text style={styles.label}>Contact</Text>
              <TextInput
                value={custContact}
                onChangeText={setCustContact}
                placeholder="Phone or note"
                placeholderTextColor="#64748B"
                style={styles.input}
                returnKeyType="done"
              />
            </View>
          </View>

          {/* Wakaalad popup trigger + sell type dropdown */}
          <View style={styles.inlineRow}>
            {/* Wakaalad button -> popup */}
            <View style={styles.inlineField}>
              <Text style={styles.label}>Wakaalad (Oil • Plate)</Text>
              <TouchableOpacity
                style={styles.selectBtn}
                onPress={() => {
                  setOilQuery('');
                  setOpenOil(true);
                }}
                activeOpacity={0.9}
              >
                <Text style={[styles.selectValue, styles.wakaaladSelectValue]} numberOfLines={1}>
                  {selected
                    ? `${selected.oil_type.toUpperCase()} • ${selected.truck_plate || '—'}`
                    : 'Select'}
                </Text>
                <Feather name="chevron-down" size={16} color="#0B1221" />
              </TouchableOpacity>
            </View>

            {/* Sell type dropdown */}
            <View style={[styles.inlineField, { zIndex: 30 }]}>
              <InlineDropdown
                label="Sell type"
                columnLabel
                value={unitType === 'liters' ? 'Liters' : unitType === 'fuusto' ? 'Fuusto' : 'Caag'}
                open={openUnit}
                onToggle={() => setOpenUnit((s) => !s)}
                z={30}
              >
                {(['liters', 'fuusto', 'caag'] as SaleUnitType[]).map((val) => (
                  <TouchableOpacity
                    key={val}
                    style={styles.optionRowSm}
                    onPress={() => {
                      setUnitType(val);
                      setQty('1');
                      if (selected) {
                        const p = getUnitPrice(selected, val);
                        setPriceDisplay(p > 0 ? String(p) : '');
                      } else {
                        setPriceDisplay('');
                      }
                      setOpenUnit(false);
                    }}
                  >
                    <Text style={styles.pickerMain}>
                      {val === 'liters' ? 'Liters' : val === 'fuusto' ? 'Fuusto' : 'Caag'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </InlineDropdown>
            </View>
          </View>

          {/* Qty + Price + Change price */}
          <View style={styles.inlineRow}>
            <View style={styles.inlineField}>
              <FloatingInput
                label={`Qty (${unitType})`}
                value={qty}
                onChangeText={setQty}
                keyboardType="number-pad"
                placeholder="1"
                testID="qty-input"
              />
            </View>

            <View style={styles.inlineField}>
              <FloatingInput
                label={`Price (per ${unitLabel})`}
                value={priceDisplay}
                editable={false}
                placeholder="—"
                testID="price-display"
                rightAddon={
                  <TouchableOpacity
                    onPress={() => selected && setChangeOpen(true)}
                    disabled={!selected}
                    activeOpacity={0.9}
                    style={[styles.addonBtn, !selected && { opacity: 0.5 }]}
                  >
                    <Feather name={hasUnitPrice ? 'edit-3' : 'plus'} size={12} color="#0B1221" />
                    <Text style={styles.addonBtnText}>{hasUnitPrice ? 'Change' : 'Add price'}</Text>
                  </TouchableOpacity>
                }
              />
            </View>
          </View>

          {/* Summary */}
          {selected && (
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryKey}>Wakaalad</Text>
                <Text style={styles.summaryVal}>
                  {selected.oil_type.toUpperCase()} • {selected.wakaalad_name} • {selected.truck_plate || '—'}
                </Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.summaryRow}>
                <Text style={[styles.summaryKey, styles.bold]}>Amount (USD)</Text>
                <Text style={[styles.summaryVal, styles.bold]}>
                  {amountUSD != null ? `$${fmtNum(amountUSD, 2)}` : '—'}
                </Text>
              </View>

              <View style={styles.summaryInlineSmall}>
                <Text style={styles.smallMuted}>
                  Base total: {symbolFor(selected?.currency)} {fmtNum(lineTotal, 2)}
                </Text>
                {(selected?.currency || 'USD').toUpperCase() !== 'USD' && amountUSD == null ? (
                  <Text style={styles.tinyHint}>Enter USD rate at checkout to preview dollars.</Text>
                ) : null}
              </View>

              {unitType === 'fuusto' && shortsPerFuusto > 0 && (
                <Text style={[styles.smallMuted, { marginTop: 6 }]}>Shorts: 10 L per fuusto</Text>
              )}
            </View>
          )}

          {stockExceeded && (
            <View style={styles.inlineWarning}>
              <Feather name="alert-triangle" size={14} color="#92400E" />
              <Text style={styles.inlineWarningText}>
                Requested {fmtNum(estimatedLiters, 2)} L exceeds available {fmtNum(selected?.in_stock_l ?? 0, 2)} L.
              </Text>
            </View>
          )}

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, (!canSubmit || submitting || !selected) && { opacity: 0.6 }]}
            disabled={!canSubmit || submitting || !selected}
            onPress={handleSubmit}
            activeOpacity={0.92}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Feather name="check" size={15} color="#fff" />
                <Text style={styles.submitText}>Create Invoice</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Validation Modal */}
      <ValidationModal visible={valOpen} title={valTitle} message={valMsg} onClose={() => setValOpen(false)} />

      {/* Receipt Modal */}
      <ReceiptModal visible={receiptOpen} receipt={receipt} onClose={() => setReceiptOpen(false)} />

      {/* Final currency/rate modal */}
      <SaleCurrencyModal
        visible={finalOpen}
        defaultFxRate={finalFxRate}
        lineTotal={lineTotal}
        qty={qtyNum}
        unitType={unitType}
        baseCurrency={(selected?.currency || 'USD').toUpperCase() === 'USD' ? 'USD' : 'SOS'}
        onClose={() => setFinalOpen(false)}
        onConfirm={(ck, fx) => {
          setFinalCurrencyKey(ck);
          setFinalFxRate(fx);
          confirmAndCreate(ck, fx);
        }}
      />

      {/* Change price mini modal */}
            {selected && (
        <ChangePriceMiniModal
          visible={changeOpen}
          onClose={() => setChangeOpen(false)}
          oilId={selected.oil_id}
          authToken={token || undefined}
          initialBasis={unitType}
          initialAmount={priceDisplay || ''}
          online={online}
          ownerId={user?.id}
          onSaved={({ basis, value, offline }) => {
            // 1) Update in-memory options for this session
            applyPriceIntoOption(selected.oil_id, { basis, value });

            // 2) Persist into local wakaalad_sell_options so it survives app restart
            if (user?.id) {
              const current =
                options.find((o) => o.wakaalad_id === selected.wakaalad_id) || selected;

              const fuustoBillable = billableFuustoL(current);
              let liter_price = current.liter_price ?? null;
              let fuusto_price = current.fuusto_price ?? null;
              let caag_price = current.caag_price ?? null;

              if (basis === 'liters') {
                liter_price = value;
                fuusto_price = value * fuustoBillable;
                caag_price = value * capacityL('caag', current);
              } else if (basis === 'fuusto') {
                fuusto_price = value;
                liter_price = value / fuustoBillable;
                caag_price = liter_price * capacityL('caag', current);
              } else {
                // caag basis
                caag_price = value;
                liter_price = value / capacityL('caag', current);
                fuusto_price = liter_price * fuustoBillable;
              }

              upsertLocalWakaaladSellOption({
                ownerId: user.id,
                wakaalad_id: current.wakaalad_id,
                oil_id: current.oil_id,
                oil_type: current.oil_type,
                wakaalad_name: current.wakaalad_name,
                truck_plate: current.truck_plate,
                currency: current.currency,
                in_stock_l: current.in_stock_l,
                liter_price,
                fuusto_price,
                caag_price,
                fuusto_capacity_l: current.fuusto_capacity_l,
                caag_capacity_l: current.caag_capacity_l,
              });
            }

            // 3) Update visible price field based on current unitType
            let fresh = value;
            if (basis !== unitType) {
              if (basis === 'liters') {
                fresh =
                  unitType === 'liters'
                    ? value
                    : value * capacityL(unitType, selected);
                setPriceDisplay(String(fresh));
              } else if (basis === unitType) {
                setPriceDisplay(String(value));
              }
            } else {
              setPriceDisplay(String(value));
            }

            showToast(
              offline
                ? 'Price saved offline – will sync to server when online'
                : 'Price updated'
            );
          }}
        />
      )}

      {/* Customer Picker Popup */}
      <CustomerPickerModal
        visible={custPickerOpen}
        onClose={() => setCustPickerOpen(false)}
        search={search}
        onSearch={setSearch}
        data={customers}
        loading={loading}
        error={error}
        hasMore={hasMore}
        onLoadMore={() => !loading && hasMore && loadCustomers(false)}
        onSelect={(c) => {
          setCustName(c.name);
          setCustContact(c.contact || c.phone || '');
          setCustPickerOpen(false);
        }}
        onCreatePress={() => {
          setCustPickerOpen(false);
          setCreateOpen(true);
        }}
      />

      {/* Create Customer Modal */}
      <CustomerCreateModal
  visible={createOpen}
  mode="add"
  submitting={createSubmitting}
  onClose={() => setCreateOpen(false)}
  onSubmit={async (payload) => {
    if (!payload.name?.trim()) return;
    if (!user?.id) {
      showToast('Missing tenant – cannot create customer');
      return;
    }

    setCreateSubmitting(true);
    try {
      let createdName = payload.name;
      let createdContact = payload.phone;

      if (online && token) {
        // ONLINE: hit API, then upsert into local DB
        const res = await api.post('/diiwaancustomers', payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const created = res?.data || {};

        upsertCustomersFromServer([created], user.id);

        createdName = created?.name || payload.name;
        createdContact = created?.contact || created?.phone || payload.phone || null;
      }

      setCustName(createdName);
      setCustContact(createdContact || '');

      // refresh picker list from whatever source we just wrote to
      loadCustomers(true);
      setCreateOpen(false);
      showToast('Customer created');
    } catch (e: any) {
      showToast(String(e?.response?.data?.detail || e?.message || 'Create failed'));
    } finally {
      setCreateSubmitting(false);
    }
  }}
/>

      {/* Wakaalad Picker Popup */}
      <WakaaladPickerModal
        visible={openOil}
        onClose={() => setOpenOil(false)}
        search={oilQuery}
        onSearch={setOilQuery}
        data={filteredOptions}
        loading={loadingOptions}
        onSelect={(o) => {
          setSelectedWkId(o.wakaalad_id);
          const p = getUnitPrice(o, unitType);
          setPriceDisplay(p > 0 ? String(p) : '');
          setOpenOil(false);
        }}
      />

      {/* Toast */}
      <ToastView />
    </View>
  );
}

/* ---------- Shared small components ---------- */
function InlineDropdown({
  label,
  value,
  open,
  onToggle,
  children,
  columnLabel = false,
  z = 10,
}: {
  label: string;
  value?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  columnLabel?: boolean;
  z?: number;
}) {
  return (
    <View style={{ marginBottom: 10, zIndex: z }}>
      <View style={{ flexDirection: 'column' }}>
        {columnLabel && <Text style={[styles.label, { marginBottom: 4 }]}>{label}</Text>}
        <TouchableOpacity style={styles.selectBtn} onPress={onToggle} activeOpacity={0.9}>
          {!columnLabel && <Text style={styles.selectLabel}>{label}</Text>}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={styles.selectValue} numberOfLines={1}>
              {value || 'Select'}
            </Text>
            <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color="#0B1221" />
          </View>
        </TouchableOpacity>
      </View>
      {open && <View style={styles.dropdownPanel}>{children}</View>}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
      <Text style={{ color: '#6B7280', fontSize: 12 }}>{label}</Text>
      <Text style={{ color: '#0B1221', fontWeight: '700', fontSize: 12 }}>{value}</Text>
    </View>
  );
}

/* ---------- Styles ---------- */
const styles = StyleSheet.create({
  pageHeader: {
    paddingHorizontal: 14,
    paddingTop: Platform.select({ ios: 12, android: 8 }),
    paddingBottom: 10,
    borderBottomWidth: 1,
    marginTop: 44,
    borderBottomColor: '#F1F5F9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  floatWrap: { position: 'relative' },

  addonWrap: {
    position: 'absolute',
    right: 6,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingLeft: 6,
  },

  addonBtn: {
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  addonBtnText: { color: '#0B1221', fontWeight: '800', fontSize: 11 },

  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#0B1221' },

  badge: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#111827',
  },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: 11 },

  inlineRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  inlineField: { flex: 1 },

  label: { fontSize: 11, color: '#475569', marginBottom: 4 },
  input: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
    fontSize: 13,
    color: '#0B1221',
  },
  inputDisabled: { backgroundColor: '#F3F4F6' },

  floatLabel: {
    position: 'absolute',
    left: 12,
    top: -8,
    paddingHorizontal: 6,
    backgroundColor: '#FFFFFF',
    fontSize: 11,
    color: '#64748B',
    zIndex: 2,
  },
  floatLabelActive: {
    color: '#334155',
    fontWeight: '700',
  },

  selectBtn: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectLabel: { fontSize: 11, color: '#64748B' },
  selectValue: { fontSize: 13, fontWeight: '700', color: '#0B1221' },
  // smaller text specifically for wakaalad field
  wakaaladSelectValue: {
    fontSize: 10,
    fontWeight: '700',
  },

  dropdownPanel: {
    borderWidth: 1,
    borderColor: BORDER,
    borderTopWidth: 0,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    backgroundColor: '#fff',
    overflow: 'hidden',
    position: 'relative',
  },
  optionRowSm: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },

  pickerMain: { fontSize: 13, fontWeight: '700', color: '#0B1221' },
  pickerSub: { fontSize: 11, color: '#6B7280', marginTop: 2 },

  smallBtn: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-end',
  },
  smallBtnTxt: { color: '#0B1221', fontWeight: '800', fontSize: 11 },

  summaryCard: {
    marginTop: 4,
    marginBottom: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: BORDER,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  summaryKey: { color: '#6B7280', fontSize: 11 },
  summaryVal: { color: '#0B1221', fontWeight: '700', fontSize: 11 },
  bold: { fontWeight: '800' },
  summaryInlineSmall: { marginTop: 4 },
  smallMuted: { color: '#64748B', fontSize: 10 },
  tinyHint: { color: '#94A3B8', fontSize: 10, marginTop: 2 },
  divider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 8 },

  submitBtn: {
    marginTop: 6,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    shadowColor: '#0F172A',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 7 },
    elevation: 8,
  },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  inlineWarning: {
    marginTop: -2,
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineWarningText: { color: '#92400E', fontSize: 11, flex: 1, lineHeight: 16 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  modalHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  modalTitle: { fontWeight: '800', color: '#7C2D12', fontSize: 14 },
  modalBigTitle: { fontWeight: '800', color: '#0B1221', fontSize: 16 },
  modalMessage: { color: '#0B1221', fontSize: 13, lineHeight: 18, marginTop: 4 },
  modalBtn: {
    height: 44,
    borderRadius: 12,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  modalBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },

  segmentBtn: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  segmentBtnActive: {
    borderColor: '#0B1221',
    backgroundColor: '#0B1221',
  },
  segmentText: { fontWeight: '800', color: '#0B1221', fontSize: 12 },
  segmentTextActive: { color: '#FFFFFF' },

  modalActions: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalActionBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  modalCancel: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
  },
  modalSave: {
    backgroundColor: '#0F172A',
  },
  modalCancelText: {
    color: '#0B1221',
    fontWeight: '800',
    fontSize: 14,
  },
  modalSaveText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },

  createRow: {
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  createRowText: { color: '#0B1221', fontWeight: '800', fontSize: 12 },

  toast: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    right: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#D1FAE5',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  toastText: { color: '#065F46', fontWeight: '700', fontSize: 12 },
});
