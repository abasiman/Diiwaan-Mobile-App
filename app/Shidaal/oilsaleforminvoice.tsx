import api from '@/services/api';
import { useAuth } from '@/src/context/AuthContext';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

import SaleCurrencyModal, { CurrencyKey } from './SaleCurrencyModal';

const BORDER = '#CBD5E1';

type SaleUnitType = 'liters' | 'fuusto' | 'caag';
type SaleType = 'cashsale' | 'invoice';

/** ───────────────────────── Wakaalad Sell Option ───────────────────────── */
type WakaaladSellOption = {
  wakaalad_id: number;                 // for sale create
  oil_id: number;                      // pricing lives on the lot
  oil_type: string;
  wakaalad_name: string;
  truck_plate?: string | null;
  currency?: string | null;

  in_stock_l: number;
  // preview prices in lot currency (server-computed for convenience)
  liter_price?: number | null;
  fuusto_price?: number | null;
  caag_price?: number | null;

  // capacities from server (fallbacks below)
  fuusto_capacity_l?: number | null;
  caag_capacity_l?: number | null;
};

type CreateSalePayload = {
  oil_id: number;
  wakaalad_id: number;                 // <<< important
  unit_type: SaleUnitType;
  unit_qty?: number;
  liters_sold?: number;
  price_per_l?: number;
  customer?: string | null;
  customer_contact?: string | null;
  currency?: string;
  fx_rate_to_usd?: number;             // only for non-USD sales
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

// Fallback capacities (server is the source of truth)
const DEFAULT_FUUSTO_L = 240;
const DEFAULT_CAAG_L = 20;

const DISPLAY_SYMBOL: Record<'USD' | 'SOS', string> = { USD: '$', SOS: 'Sh' };
const CURRENCY_FROM_KEY: Record<CurrencyKey, 'USD' | 'SOS'> = { USD: 'USD', shimaal: 'SOS' };
const SALE_TYPE: SaleType = 'invoice';

const fmtNum = (n: number, d = 2) => Number(n).toFixed(d);
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const symbolFor = (cur?: string | null) =>
  (cur || 'USD').toUpperCase() === 'USD' ? DISPLAY_SYMBOL.USD : DISPLAY_SYMBOL.SOS;

// Helper: resolve capacity in liters for a unit & option (server is source of truth)
function capacityL(unit: SaleUnitType, opt?: WakaaladSellOption): number {
  if (unit === 'fuusto') return (opt?.fuusto_capacity_l ?? DEFAULT_FUUSTO_L);
  if (unit === 'caag')   return (opt?.caag_capacity_l ?? DEFAULT_CAAG_L);
  return 1; // liter
}


function billableFuustoL(opt?: WakaaladSellOption): number {
  const physical = capacityL('fuusto', opt); // usually 240
  const isPetrol = (opt?.oil_type || '').toLowerCase() === 'petrol';
  // bill 230 for petrol fuusto, otherwise full physical
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
              <Row label="Oil" value={`${receipt.oil_type.toUpperCase()}`} />
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
}: {
  visible: boolean;
  onClose: () => void;
  oilId: number;
  authToken?: string;
  initialBasis: SaleUnitType;
  initialAmount: string;
  onSaved: (update: { basis: SaleUnitType; value: number }) => void;
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

      await api.post(`/diiwaanoil/${oilId}/reprice`, payload, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
      });

      onSaved({ basis, value });
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

export default function OilSaleInvoiceForm() {
  const router = useRouter();
  const { token } = useAuth();
  const { show: showToast, ToastView } = useToast();

  const [options, setOptions] = useState<WakaaladSellOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // selection uses wakaalad_id
  const [selectedWkId, setSelectedWkId] = useState<number | null>(null);
  const selected = useMemo(
    () => options.find((o) => o.wakaalad_id === selectedWkId) || null,
    [options, selectedWkId]
  );

  const [unitType, setUnitType] = useState<SaleUnitType>('liters');

  // floating inputs
  const [qty, setQty] = useState<string>('1');
  const [priceDisplay, setPriceDisplay] = useState<string>(''); // per UNIT, in LOT currency

  // --- Change price mini modal state
  const [changeOpen, setChangeOpen] = useState(false);

  // customer from route
  const { customer_name, customer_contact } =
    useLocalSearchParams<{ customer_name?: string; customer_contact?: string }>();
  const routeCustomerParam = typeof customer_name === 'string' ? customer_name : '';
  const [custName, setCustName] = useState<string>(routeCustomerParam || '');
  const [custContact, setCustContact] = useState<string>(
    typeof customer_contact === 'string' ? customer_contact : ''
  );

  // helper to go to /[customer_name]/invoices
  const customerSegment = encodeURIComponent((custName || routeCustomerParam || '').trim());
  const goToInvoices = () => {
    if (customerSegment) router.replace(`/${customerSegment}/invoices`);
    else router.replace('/oilsalespage');
  };

  // customer dropdown & paging
  const [openCustomer, setOpenCustomer] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 20;
  const offsetRef = useRef(0);
  const loadingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(
    async (reset = false) => {
      if (!token) return;
      if (loadingRef.current) return;
      loadingRef.current = true;

      try {
        if (reset) {
          setLoading(true);
          setHasMore(true);
          offsetRef.current = 0;
          setOffset(0);
        }

        const res = await api.get<any[]>('/diiwaancustomers', {
          params: { q: search || undefined, offset: reset ? 0 : offsetRef.current, limit },
          headers: { Authorization: `Bearer ${token}` },
        });

        const data: Customer[] = (res.data || []).map((c: any) => ({
          id: c.id,
          name: c.name,
          contact: c.contact ?? c.phone ?? null,
          phone: c.phone ?? null,
        }));

        setCustomers((prev) => {
          if (reset) return data;
          const map = new Map(prev.map((c) => [c.id, c]));
          data.forEach((c) => {
            map.set(c.id, { ...map.get(c.id), ...c });
          });
          return Array.from(map.values());
        });

        setHasMore(data.length === limit);
        offsetRef.current += data.length;
        setOffset(offsetRef.current);
        setError(null);
      } catch (e: any) {
        setError(e?.response?.data?.detail || 'Failed to load customers.');
      } finally {
        setLoading(false);
        setRefreshing(false);
        loadingRef.current = false;
      }
    },
    [token, search, limit]
  );

  useEffect(() => {
    if (openCustomer) loadPage(true);
  }, [openCustomer, loadPage]);

  // oil & unit dropdowns
  const [openOil, setOpenOil] = useState(false);
  const [openUnit, setOpenUnit] = useState(false);

  // oil local search (in-dropdown)
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

  // ── fetch WAKAALAD sell options
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoadingOptions(true);
        const res = await api.get<WakaaladSellOption[]>('/wakaalad_diiwaan/sell-options', {
          headers: { Authorization: `Bearer ${token}` },
          params: { only_available: true, order: 'created_desc' },
        });
        if (!mounted) return;
        setOptions(res.data || []);
      } catch (e: any) {
        openValidation('Load failed', e?.response?.data?.detail || 'Failed to load wakaalad sell options.');
      } finally {
        if (mounted) setLoadingOptions(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [token]);

  // default price from selected (per UNIT, lot currency)
  useEffect(() => {
    if (!selected) {
      setPriceDisplay('');
      return;
    }
    const p = getUnitPrice(selected, unitType);
    setPriceDisplay(p > 0 ? String(p) : '');
  }, [selected, unitType]);

  // default sale currency (from lot currency attached to option)
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

  // PHYSICAL liters used for stock checking (e.g., 240L per petrol fuusto)
  const estimatedLiters = useMemo(() => {
    if (!selected) return 0;
    if (unitType === 'liters') return qtyNum;
    return qtyNum * capacityL(unitType, selected);
  }, [selected, unitType, qtyNum]);

  // BILLED liters (e.g., 230L per petrol fuusto due to 10L shorts)
  const billedLiters = useMemo(() => {
    if (!selected) return 0;
    if (unitType === 'liters') return qtyNum;
    if (unitType === 'caag') return qtyNum * capacityL('caag', selected);
    if (unitType === 'fuusto') {
      const cap = capacityL('fuusto', selected); // usually 240
      const billedPer =
        (selected.oil_type || '').toLowerCase() === 'petrol'
          ? Math.max(0, cap - 10) // 230 billed for petrol
          : cap;                  // others bill full capacity
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

  // Canonical per-liter in LOT currency, derived from the displayed unit price
  const perLInLotCurrency = useMemo(() => {
  const r = (n: number, d = 6) => Math.round(n * 10 ** d) / 10 ** d;
  if (!selected || priceNum <= 0) return 0;

  if (unitType === 'liters') return r(priceNum, 6);
  if (unitType === 'fuusto') return r(priceNum / billableFuustoL(selected), 6); // <-- was capacityL
  if (unitType === 'caag')   return r(priceNum / capacityL('caag', selected), 6);

  return 0;
}, [selected, unitType, priceNum]);


  // Line total should use BILLED liters (so petrol fuusto bills 230L × per-L price)
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

  // --- Currency helpers ---
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

    const saleCurrency = saleCurrencyFromKey(pickedCurrencyKey);
    const fxRaw = parseFloat((fxRateStr || '').replace(',', '.'));
    const fxValid = !isNaN(fxRaw) && fxRaw > 0 ? fxRaw : undefined;

    const perL_sale = convertPerL(lotCurrency, saleCurrency, perLInLotCurrency, fxValid);

    if (lotCurrency !== saleCurrency && !fxValid) {
      openValidation('FX required', 'Please provide a valid exchange rate.');
      return;
    }

    const payload: CreateSalePayload = {
      oil_id: selected.oil_id,               // lot id for pricing/ledger
      wakaalad_id: selected.wakaalad_id,     // deduct from wakaalad
      unit_type: unitType,
      sale_type: SALE_TYPE,
      liters_sold: unitType === 'liters' ? qtyNum : undefined,
      unit_qty: unitType === 'fuusto' || unitType === 'caag' ? qtyNum : undefined,
      price_per_l: perL_sale || undefined,   // server canonical per-L
      customer: custName?.trim() ? custName.trim() : undefined,
      customer_contact: custContact?.trim() ? custContact.trim() : undefined,
      currency: saleCurrency,
      fx_rate_to_usd: saleCurrency === 'USD' ? undefined : fxValid,
    };

    setSubmitting(true);
    try {
      const res = await api.post<OilSaleRead>('/oilsale', payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setReceipt(res.data);
      setReceiptOpen(true);
      showToast('Invoice created successfully');
      setFinalOpen(false);
      goToInvoices();
    } catch (e: any) {
      setFinalOpen(false);
      openValidation(
        'Create failed',
        String(e?.response?.data?.detail || e?.message || 'Unable to create invoice sale.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Amount (USD) for the summary — derived from lineTotal
  const amountUSD: number | null = useMemo(() => {
    if (lineTotal <= 0) return null;
    if (lotCurrency === 'USD') return lineTotal;
    const fx = parseFloat((finalFxRate || '').replace(',', '.'));
    if (fx > 0) return lineTotal / fx; // convert SOS -> USD
    return null;
  }, [lineTotal, lotCurrency, finalFxRate]);

  // Update options array after price change (per-liter canonical).
  // IMPORTANT: multiple wakaalads can share the same oil_id — update all of them.
  const applyPriceIntoOption = useCallback((oilId: number, update: { basis: SaleUnitType; value: number }) => {
  setOptions((prev) =>
    prev.map((o) => {
      if (o.oil_id !== oilId) return o;
      const next: WakaaladSellOption = { ...o };
      const fuustoBillable = billableFuustoL(next);    // <-- 230 for petrol
      const fuustoPhysical = capacityL('fuusto', next); // 240 (exposed capacity, left unchanged)

      if (update.basis === 'liters') {
        // user set per-liter → derive correct per-unit prices
        next.liter_price  = update.value;
        next.fuusto_price = update.value * fuustoBillable;  // <-- use 230 for petrol
        next.caag_price   = update.value * capacityL('caag', next);
      } else if (update.basis === 'fuusto') {
        // user set per-fuusto → derive per-liter from BILLABLE fuusto
        next.fuusto_price = update.value;
        next.liter_price  = update.value / fuustoBillable;  // <-- use 230 for petrol
        next.caag_price   = next.liter_price * capacityL('caag', next);
      } else {
        // user set per-caag
        next.caag_price   = update.value;
        next.liter_price  = update.value / capacityL('caag', next);
        next.fuusto_price = next.liter_price * fuustoBillable; // <-- use 230 for petrol
      }
      return next;
    })
  );
}, []);


  // Filtering (oil_type, wakaalad_name, truck_plate)
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
          {/* Customer */}
          <View style={styles.inlineRow}>
            <View className="inlineField" style={styles.inlineField}>
              <InlineDropdown
                label="Customer name"
                value={custName || undefined}
                open={openCustomer}
                onToggle={() => setOpenCustomer((s) => !s)}
                columnLabel
                z={60}
              >
                <View style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
                  <TextInput
                    placeholder="Type to search customers"
                    placeholderTextColor="#64748B"
                    style={[styles.input, { height: 42 }]}
                    value={search}
                    onChangeText={(t) => {
                      setSearch(t);
                      setRefreshing(true);
                      loadPage(true);
                    }}
                  />
                  {error ? <Text style={{ marginTop: 6, color: '#B91C1C', fontSize: 11 }}>{error}</Text> : null}
                </View>

                <ScrollView style={{ maxHeight: 260 }}>
                  {customers.map((item) => (
                    <TouchableOpacity
                      key={String(item.id)}
                      style={styles.optionRowSm}
                      onPress={() => {
                        setCustName(item.name);
                        setCustContact(item.contact || item.phone || '');
                        setOpenCustomer(false);
                      }}
                      activeOpacity={0.9}
                    >
                      <Text style={styles.pickerMain}>{item.name}</Text>
                      <Text style={styles.pickerSub}>{item.contact || item.phone || '—'}</Text>
                    </TouchableOpacity>
                  ))}

                  {loading ? (
                    <View style={{ padding: 10, alignItems: 'center' }}>
                      <ActivityIndicator />
                    </View>
                  ) : hasMore ? (
                    <TouchableOpacity
                      style={{ padding: 10, alignItems: 'center' }}
                      onPress={() => !loading && loadPage(false)}
                      activeOpacity={0.85}
                    >
                      <Text style={{ fontSize: 12, color: '#0B1221', fontWeight: '700' }}>Load more…</Text>
                    </TouchableOpacity>
                  ) : null}
                </ScrollView>
              </InlineDropdown>
            </View>

            {/* Contact field */}
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

          {/* Wakaalad + Sell type */}
          <View style={styles.inlineRow}>
            <View style={[styles.inlineField, { zIndex: 50 }]}>
              <InlineDropdown
                label="Wakaalad (Oil • Name)"
                value={
                  selected
                    ? `${selected.oil_type.toUpperCase()} • ${selected.wakaalad_name} `
                    : undefined
                }
                open={openOil}
                onToggle={() => {
                  setOpenOil((s) => !s);
                  setOilQuery('');
                }}
                columnLabel
                z={50}
              >
                {/* Inline search */}
                <View style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
                  <TextInput
                    placeholder="Search oil, wakaalad, or plate…"
                    placeholderTextColor="#64748B"
                    style={[styles.input, { height: 42 }]}
                    value={oilQuery}
                    onChangeText={setOilQuery}
                  />
                </View>

                {loadingOptions ? (
                  <View style={{ padding: 10, alignItems: 'center' }}>
                    <ActivityIndicator />
                  </View>
                ) : filteredOptions.length === 0 ? (
                  <View style={{ padding: 12 }}>
                    <Text style={{ color: '#6B7280', fontSize: 12 }}>No matching wakaalad.</Text>
                  </View>
                ) : (
                  <ScrollView style={{ maxHeight: 260 }}>
                    {filteredOptions.map((o) => (
                      <TouchableOpacity
                        key={`${o.wakaalad_id}`}
                        style={styles.optionRowSm}
                        onPress={() => {
                          setSelectedWkId(o.wakaalad_id);
                          const p = getUnitPrice(o, unitType);
                          setPriceDisplay(p > 0 ? String(p) : '');
                          setOpenOil(false);
                        }}
                        activeOpacity={0.9}
                      >
                        <Text style={styles.pickerMain}>
                          {o.oil_type.toUpperCase()} • {o.wakaalad_name} • {o.truck_plate || '—'}
                        </Text>
                        <Text style={styles.pickerSub}>
                          Stock: {fmtNum(o.in_stock_l, 2)} L
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </InlineDropdown>
            </View>

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

          {/* Summary – primary is Amount (USD), base total smaller */}
          {selected && (
            <View style={styles.summaryCard}>
              {/* Wakaalad row (small) */}
              <View style={styles.summaryRow}>
                <Text style={styles.summaryKey}>Wakaalad</Text>
                <Text style={styles.summaryVal}>
                  {selected.oil_type.toUpperCase()} • {selected.wakaalad_name} • {selected.truck_plate || '—'}
                </Text>
              </View>

              <View style={styles.divider} />

              {/* Amount in Dollar (primary) */}
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryKey, styles.bold]}>Amount (USD)</Text>
                <Text style={[styles.summaryVal, styles.bold]}>
                  {amountUSD != null ? `$${fmtNum(amountUSD, 2)}` : '—'}
                </Text>
              </View>

              {/* Base total (smaller / muted) */}
              <View style={styles.summaryInlineSmall}>
                <Text style={styles.smallMuted}>
                  Base total: {symbolFor(selected?.currency)} {fmtNum(lineTotal, 2)}
                </Text>
                {(selected?.currency || 'USD').toUpperCase() !== 'USD' && amountUSD == null ? (
                  <Text style={styles.tinyHint}>
                    Enter USD rate at checkout to preview dollars.
                  </Text>
                ) : null}
              </View>

              {/* Simple shorts note for petrol fuusto */}
              {unitType === 'fuusto' && shortsPerFuusto > 0 && (
                <Text style={[styles.smallMuted, { marginTop: 6 }]}>
                  Shorts: 10 L per fuusto
                </Text>
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

      {/* Change price mini modal (targets lot by oil_id) */}
      {selected && (
        <ChangePriceMiniModal
          visible={changeOpen}
          onClose={() => setChangeOpen(false)}
          oilId={selected.oil_id}
          authToken={token || undefined}
          initialBasis={unitType}
          initialAmount={priceDisplay || ''}
          onSaved={({ basis, value }) => {
            applyPriceIntoOption(selected.oil_id, { basis, value });

            // refresh currently viewed unit’s displayed price
            let fresh = value;
            if (basis !== unitType) {
              if (basis === 'liters') {
                fresh = unitType === 'liters'
                  ? value
                  : value * capacityL(unitType, selected);
                setPriceDisplay(String(fresh));
              } else if (basis === unitType) {
                setPriceDisplay(String(value));
              }
            } else {
              setPriceDisplay(String(value));
            }

            showToast('Price updated');
          }}
        />
      )}

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

  /* Right addon container inside the input */
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

  // modal base
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

  // change price segment buttons
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
    borderColor: '#0B122A',
    backgroundColor: '#0B122A',
  },
  segmentText: { fontWeight: '800', color: '#0B1221', fontSize: 12 },
  segmentTextActive: { color: '#FFFFFF' },

  // modal actions
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

  // toast
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
