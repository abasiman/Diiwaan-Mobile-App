// VendorPaymentCreateSheet.tsx
import api from '@/services/api';
import { Feather, FontAwesome } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import { events, EVT_VENDOR_PAYMENT_CREATED } from './eventBus';

type Method = 'cash' | 'custom'; // UI-only; we will ALWAYS send 'equity' to backend
type ExtraCosts = { truckRent: number; depotCost: number; tax: number; currency: string };
type Props = {
  visible: boolean;
  onClose: () => void;
  token: string | null;

  /** Identify the item; if this oil belongs to a lot, we’ll auto-upgrade to lot scope */
  oilId: number;
  /** If provided, we’ll use lot scope explicitly */
  lotId?: number;

  /** Optional: pay a specific extra-cost row */
  extraCostId?: number;

  vendorNameOverride?: string | null;
  currentPayable?: number;
  onCreated?: () => void;
  companyName?: string | null;
  companyContact?: string | null;
  extraCosts?: ExtraCosts;
};

// ───────────────────────── DEBUG ─────────────────────────
const DEBUG = true;
const mkTraceId = () => `vp-${Date.now().toString(36)}-${Math.round(Math.random() * 1e6).toString(36)}`;
const dlog = (t: string, ...a: any[]) => DEBUG && console.log(`[VendorPayment][${t}]`, ...a);
const derror = (t: string, ...a: any[]) => DEBUG && console.error(`[VendorPayment][${t}]`, ...a);
// ────────────────────────────────────────────────────────

const ACCENT = '#576CBC';
const BORDER = '#E5E7EB';
const BG = '#FFFFFF';
const TEXT = '#0B1220';
const MUTED = '#6B7280';
const PAPER_W = 330;

export default function VendorPaymentCreateSheet({
  visible,
  onClose,
  token,
  oilId,
  lotId,
  extraCostId,
  vendorNameOverride,
  currentPayable = 0,
  onCreated,
  companyName,
  companyContact,
  extraCosts,
}: Props) {
  const traceIdRef = useRef<string>(mkTraceId());
  useEffect(() => {
    if (visible) {
      traceIdRef.current = mkTraceId();
      dlog(traceIdRef.current, 'Sheet opened', { oilId, lotId, extraCostId, vendorNameOverride, currentPayable });
    }
  }, [visible, oilId, lotId, extraCostId, vendorNameOverride, currentPayable]);

  const insets = useSafeAreaInsets();
  const bottomSafe = insets.bottom || 0;
  const SCREEN_H = Dimensions.get('window').height;
  const SHEET_H = Math.round(SCREEN_H * 0.92);

  const [amount, setAmount] = useState<string>('');
  const [method, setMethod] = useState<Method>('cash'); // UI only
  const [customMethod, setCustomMethod] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  // vendor/oil context
  const [vendorName, setVendorName] = useState<string>('-');
  const [oilType, setOilType] = useState<string | null>(null);
  const [oilLotId, setOilLotId] = useState<number | null>(null); // ← NEW: detect lot from oil

  // receipt states
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [paidAmt, setPaidAmt] = useState<number>(0);
  const [prevDue, setPrevDue] = useState<number>(currentPayable);
  const [newDue, setNewDue] = useState<number>(currentPayable);

  const [shareOpen, setShareOpen] = useState(false);
  const [shareMsg, setShareMsg] = useState('');

  const paperRef = useRef<View>(null);

  const authHeader = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n || 0);

  const fmtMoneyExtra = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: extraCosts?.currency || 'USD',
      maximumFractionDigits: 2,
    }).format(n || 0);

  // slide animation
  const slideY = useRef(new Animated.Value(SHEET_H)).current;
  useEffect(() => {
    if (visible) {
      Animated.timing(slideY, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else {
      slideY.setValue(SHEET_H);
    }
  }, [visible, SHEET_H, slideY]);

  const close = () => {
    if (submitting) return;
    dlog(traceIdRef.current, 'Sheet closed by user');
    onClose();
  };

  /** Resolve vendor + detect lot_id from oil if present */
  useEffect(() => {
    let isMounted = true;
    (async () => {
      if (!visible) return;

      try {
        if (oilId) {
          dlog(traceIdRef.current, 'Fetching oil', { oilId });
          const r = await api.get(`/diiwaanoil/${oilId}`, { headers: authHeader });
          const data = r?.data || {};
          if (!isMounted) return;

          const prefer =
            (vendorNameOverride && vendorNameOverride.trim()) ||
            (data?.oil_well && String(data.oil_well).trim()) ||
            (data?.supplier_name && String(data.supplier_name).trim()) ||
            '-';

          setVendorName(prefer);
          setOilType(data?.oil_type ?? null);
          setOilLotId(Number.isFinite(data?.lot_id) ? Number(data.lot_id) : null); // ← store lot
          dlog(traceIdRef.current, 'Resolved vendor/oil', {
            vendorName: prefer,
            oilType: data?.oil_type ?? null,
            oilLotId: Number.isFinite(data?.lot_id) ? Number(data.lot_id) : null,
          });
          return;
        }

        if (lotId) {
          dlog(traceIdRef.current, 'Fetching lot (for vendor)', { lotId });
          const r = await api.get(`/diiwaanoil/lot/${lotId}`, { headers: authHeader });
          const data = r?.data || {};
          const prefer =
            (vendorNameOverride && vendorNameOverride.trim()) ||
            (data?.oil_well && String(data.oil_well).trim()) ||
            (data?.supplier_name && String(data.supplier_name).trim()) ||
            '-';
          if (!isMounted) return;
          setVendorName(prefer);
          setOilType(data?.oil_type ?? null);
          setOilLotId(lotId); // explicit lot
          dlog(traceIdRef.current, 'Resolved vendor from lot', { vendorName: prefer, oilType: data?.oil_type ?? null, oilLotId: lotId });
          return;
        }

        // no oil/lot provided
        const prefer = (vendorNameOverride && vendorNameOverride.trim()) || '-';
        if (isMounted) {
          setVendorName(prefer);
          setOilType(null);
          setOilLotId(null);
        }
        dlog(traceIdRef.current, 'No oil/lot; using override vendor', { vendorName: prefer });
      } catch (e: any) {
        const prefer = (vendorNameOverride && vendorNameOverride.trim()) || '-';
        if (!isMounted) return;
        setVendorName(prefer);
        setOilType(null);
        setOilLotId(lotId ?? null); // keep whatever hint we had
        derror(traceIdRef.current, 'Vendor detection failed', {
          error: e?.message,
          server: e?.response?.data,
          status: e?.response?.status,
        });
      }
    })();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, oilId, lotId, vendorNameOverride, token]);

  /** Prefill amount */
  useEffect(() => {
    if (visible) {
      const due = Number.isFinite(currentPayable) ? currentPayable : 0;
      setPrevDue(due);
      setNewDue(due);
      setAmount(due > 0 ? (Math.round(due * 100) / 100).toFixed(2) : '');
      setMethod('cash');
      dlog(traceIdRef.current, 'Prefill amount', { currentPayable: due });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, currentPayable]);

  // helpers
  const sanitizeAmount = (raw: string) => {
    let cleaned = raw.replace(/[^0-9.]/g, '');
    const firstDot = cleaned.indexOf('.');
    if (firstDot !== -1) {
      const before = cleaned.slice(0, firstDot + 1);
      const after = cleaned.slice(firstDot + 1).replace(/\./g, '');
      cleaned = before + after;
    }
    cleaned = cleaned.replace(/^0+(?=\d)/, '0');
    return cleaned;
  };
  const sanitizeAmountToNumber = (raw: string) => {
    const num = parseFloat(sanitizeAmount(raw));
    return Number.isFinite(num) ? num : 0;
  };

  const typedAmt = sanitizeAmountToNumber(amount);
  const remainingPreview = Math.max(0, (currentPayable || 0) - typedAmt);
  const isOverpay = typedAmt > (currentPayable || 0);

  // extras (display)
  const extraItems = useMemo(() => {
    if (!extraCosts) return [] as Array<{ label: string; amt: number }>;
    return [
      { label: 'Truck rent', amt: Number(extraCosts.truckRent || 0) },
      { label: 'Depot cost', amt: Number(extraCosts.depotCost || 0) },
      { label: 'Tax', amt: Number(extraCosts.tax || 0) },
    ].filter(x => x.amt > 0.0001);
  }, [extraCosts]);
  const extraTotal = useMemo(() => extraItems.reduce((s, x) => s + x.amt, 0), [extraItems]);

  const buildShareMessage = (paid: number, remain: number) => {
    const paidStr = fmtMoney(paid);
    const remainStr = fmtMoney(Math.max(0, remain));
    const core = remain > 0
      ? `Waxaad siisay ${vendorName} ${paidStr}. Haraaga waa ${remainStr}.`
      : `Waxaad siisay ${vendorName} ${paidStr}. Dayntii waa la bixiyay. Mahadsanid.`;
    if (extraItems.length) {
      const extras =
        `\n\nExtra costs recorded (${extraCosts?.currency || 'USD'}):\n` +
        extraItems.map(it => `• ${it.label}: ${fmtMoneyExtra(it.amt)}`).join('\n') +
        `\nTotal extras: ${fmtMoneyExtra(extraTotal)}`;
      return core + extras;
    }
    return core;
  };

  async function sendWhatsAppText(phoneRaw: string | undefined, text: string) {
    const digits = (phoneRaw || '').replace(/[^\d]/g, '');
    theMsg: {
      const msg = encodeURIComponent(text || '');
      const deepLink = `whatsapp://send?phone=${digits}&text=${msg}`;
      const webLink = `https://wa.me/${digits}?text=${msg}`;
      const canDeep = await Linking.canOpenURL('whatsapp://send');
      if (canDeep) {
        try { await Linking.openURL(deepLink); break theMsg; } catch {}
      }
      const canWeb = await Linking.canOpenURL(webLink);
      if (canWeb) { try { await Linking.openURL(webLink); } catch {} }
      else { Alert.alert('WhatsApp unavailable', 'Could not open WhatsApp on this device.'); }
    }
  }
  async function sendSmsText(text: string) {
    const msg = encodeURIComponent(text || '');
    const url = Platform.select({ ios: `sms:&body=${msg}`, android: `sms:?body=${msg}`, default: `sms:?body=${msg}` });
    try { const can = await Linking.canOpenURL(url!); if (can) await Linking.openURL(url!); } catch {}
  }

  const capturePaper = async () => {
    if (!paperRef.current) return null;
    const pixelRatio = Platform.OS === 'android' ? 3 : 2;
    const uri = await captureRef(paperRef.current, {
      format: 'png', quality: 1, fileName: 'vendor_payment_receipt', result: 'tmpfile', pixelRatio, backgroundColor: '#FFFFFF',
    });
    return uri;
  };

  useEffect(() => {
    let t: NodeJS.Timeout | null = null;
    if (showReceipt) {
      t = setTimeout(async () => {
        try {
          const uri = await capturePaper();
          setReceiptUri(uri);
          if (uri) {
            setShareMsg(buildShareMessage(paidAmt, newDue));
            setShareOpen(true);
          }
        } catch (e: any) {
          derror(traceIdRef.current, 'Receipt capture failed', e?.message || e);
        }
      }, 180);
    }
    return () => { if (t) clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showReceipt, newDue, paidAmt, extraItems, extraTotal, extraCosts?.currency]);

  const onSave = async () => {
    const T0 = Date.now();
    const trace = traceIdRef.current;

    // must have at least one target: oil, lot, or a specific extra
    const hasTarget =
      !!oilId ||
      !!lotId ||
      (typeof extraCostId === 'number');

    if (!hasTarget) {
      derror(trace, 'No target (oil/lot/extra) provided; cannot proceed');
      return Alert.alert('Fadlan', 'Wax aan bixinno lama helin (oil, lot, ama extra).');
    }


    const amtNum = sanitizeAmountToNumber(amount);
    dlog(trace, 'User clicked Save', { rawAmount: amount, parsedAmount: amtNum, currentPayable, oilId, lotId, extraCostId, oilLotId });

    if (!(amtNum > 0)) {
      derror(trace, 'Invalid amount (<= 0)');
      return Alert.alert('Fadlan', 'Geli lacag sax ah (ka weyn 0).');
    }

    const dueNow = Math.max(0, currentPayable || 0);
    const payAmount = dueNow > 0 ? Math.min(amtNum, dueNow) : amtNum;

    if (amtNum > dueNow && dueNow > 0) {
      dlog(trace, 'Overpayment clamped', { amtNum, dueNow, payAmount });
      Alert.alert('Overpayment adjusted', `Waxaad gelisay ${fmtMoney(amtNum)}, balse haraaga waa ${fmtMoney(dueNow)}. Waxaanu diiwaan gelinay ${fmtMoney(payAmount)}.`);
    }

    // ── SCOPE DECISION ─────────────────────────────────────────────
    // priority: pay specific extra → explicit lotId → auto-upgrade to lot if oil has lot → else oil
    let scope: 'extra' | 'lot' | 'oil' = 'oil';
    let usedLotId: number | null = null;

    if (typeof extraCostId === 'number') {
      scope = 'extra';
    } else if (typeof lotId === 'number') {
      scope = 'lot';
      usedLotId = lotId;
    } else if (typeof oilLotId === 'number' && Number.isFinite(oilLotId)) {
      scope = 'lot';
      usedLotId = oilLotId; // ← AUTO-UPGRADE
    } else {
      scope = 'oil';
    }

    dlog(trace, 'scopeDecision', { scope, usedLotId, oilId, extraCostId });

    setSubmitting(true);
    try {
      const body: any = {
        amount: payAmount,
        supplier_name: vendorName,
        payment_method: 'equity' as const,
        note: oilType ? `Payment for ${oilType} lot (funded by owner equity)` : 'Funded by owner equity',
      };


      // Tell backend how to apply this payment
      if (scope === 'extra') {
        // Paying a specific extra: only that extra should be touched
        body.apply_to = 'extras_only';
      } else if (scope === 'lot') {
        // Pay ONLY the base part of the lot; do NOT spill into extras
        body.apply_to = 'base_only';
      } else {
        // Single-oil fallback: leave default behavior (or force base-only if you prefer)
        body.apply_to = 'base_only';
      }


      if (scope === 'extra') {
        body.extra_cost_id = extraCostId;
        if (typeof lotId === 'number') body.lot_id = lotId; // optional hint; backend will resolve from extra
      } else if (scope === 'lot') {
        body.lot_id = usedLotId;     // ← send lot_id ONLY
      } else {
        body.oil_id = oilId;         // ← single-oil scope
      }

      dlog(trace, 'POST /diiwaanvendorpayments request', { url: '/diiwaanvendorpayments', headersSet: !!authHeader.Authorization, body });

      const resp = await api.post('/diiwaanvendorpayments', body, { headers: authHeader });
      dlog(trace, 'POST /diiwaanvendorpayments response', { status: resp?.status, data: resp?.data, durationMs: Date.now() - T0 });

      const remain = Math.max(0, dueNow - payAmount);
      setPaidAmt(payAmount);
      setPrevDue(dueNow);
      setNewDue(remain);
      setSavedAt(new Date());

      events.emit(EVT_VENDOR_PAYMENT_CREATED, undefined);
      dlog(trace, 'Emitted EVT_VENDOR_PAYMENT_CREATED');

      onCreated?.();

      setAmount('');
      setMethod('cash');

      onClose();
      setShowReceipt(true);
    } catch (e: any) {
      const serverDetail = e?.response?.data?.detail;
      const status = e?.response?.status;
      const data = e?.response?.data;

      derror(trace, 'Payment creation failed', {
        status,
        serverDetail,
        serverData: data,
        requestBodySnapshot: {
          amount: sanitizeAmountToNumber(amount),
          oil_id: scope === 'oil' ? oilId : null,
          lot_id: scope === 'lot' ? usedLotId : null,
          extra_cost_id: scope === 'extra' ? extraCostId : null,
          payment_method: 'equity',
          supplier_name: vendorName,
        },
        hint: 'Lot scope should omit oil_id; extra scope must include extra_cost_id.',
        durationMs: Date.now() - T0,
      });

      Alert.alert('Error', String(serverDetail || e?.message || 'Save failed.'));
    } finally {
      setSubmitting(false);
    }
  };

  const shareImage = async () => {
    if (!receiptUri) return;
    try {
      await Sharing.shareAsync(receiptUri, { mimeType: 'image/png', dialogTitle: 'Send Receipt', UTI: 'public.png' });
      dlog(traceIdRef.current, 'Shared receipt image');
    } catch (e: any) {
      derror(traceIdRef.current, 'Share image failed', e?.message || e);
    }
  };

  const closeShareAndReceipt = () => {
    setShareOpen(false);
    setShowReceipt(false);
    dlog(traceIdRef.current, 'Closed share & receipt');
  };

  return (
    <>
      {/* Bottom Sheet */}
      <Modal visible={visible} transparent animationType="slide" presentationStyle="overFullScreen" onRequestClose={close}>
        <TouchableWithoutFeedback onPress={close}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <Animated.View style={[styles.sheetWrap, { height: SHEET_H, transform: [{ translateY: slideY }] }]}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 18 : 0} style={{ flex: 1 }}>
            <View style={[styles.sheetCard, { paddingBottom: Math.max(16, bottomSafe) }]}>
              <View style={styles.sheetHandle} />
              <Text style={styles.title}>Record Payment</Text>

              {/* Vendor & AP banner */}
              <View style={[dueStyles.banner, { marginBottom: 8 }]}>
                <Text style={dueStyles.left}>Vendor</Text>
                <Text style={dueStyles.right} numberOfLines={1}>{vendorName || '-'}</Text>
              </View>
              <View style={dueStyles.banner}>
                <Text style={dueStyles.left}>Amount payable</Text>
                <Text style={dueStyles.right}>{fmtMoney(Math.max(0, currentPayable || 0))}</Text>
              </View>

              {/* Extra costs (display) */}
              {extraItems.length > 0 && (
                <View style={[dueStyles.banner, { backgroundColor: '#F8FAFF' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[dueStyles.left, { marginBottom: 6 }]}>Extra costs recorded</Text>
                    {extraItems.map((it, idx) => (
                      <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={[dueStyles.left, { color: '#475569' }]}>{it.label}</Text>
                        <Text style={[dueStyles.right]}>{fmtMoneyExtra(it.amt)}</Text>
                      </View>
                    ))}
                    <View style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderColor: BORDER, marginVertical: 6 }} />
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={[dueStyles.left, { fontWeight: '900' }]}>Total extras</Text>
                      <Text style={[dueStyles.right]}>{fmtMoneyExtra(extraTotal)}</Text>
                    </View>
                    <Text style={{ color: '#6B7280', fontSize: 11, marginTop: 6 }}>
                      * To pay a specific extra, use the “Extra Cost” flow.
                    </Text>
                  </View>
                </View>
              )}

              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 18 }}>
                {/* Amount */}
                <View style={styles.row}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.label}>Amount to pay</Text>
                    <TouchableOpacity
                      onPress={() => {
                        const v = (Math.round(Math.max(0, currentPayable || 0) * 100) / 100).toFixed(2);
                        setAmount(v);
                        dlog(traceIdRef.current, 'Quick fill full amount', { value: v });
                      }}
                      style={dueStyles.quickFill}
                      activeOpacity={0.8}
                    >
                      <Feather name="zap" size={14} color="#0B2447" />
                      <Text style={dueStyles.quickFillTxt}>Full amount</Text>
                    </TouchableOpacity>
                  </View>

                  <TextInput
                    key={visible ? 'amount-open' : 'amount-closed'}
                    value={amount}
                    onChangeText={(t) => { const s = sanitizeAmount(t); setAmount(s); dlog(traceIdRef.current, 'Typing amount', { raw: t, sanitized: s }); }}
                    placeholder="0.00"
                    placeholderTextColor="#9CA3AF"
                    style={[styles.input, isOverpay && currentPayable > 0 ? { borderColor: '#FCA5A5', backgroundColor: '#FFF7F7' } : null]}
                    maxLength={18}
                  />
                  <Text style={{ marginTop: 6, fontSize: 12, fontWeight: '700', color: isOverpay && currentPayable > 0 ? '#DC2626' : '#059669' }}>
                    {isOverpay && currentPayable > 0
                      ? `Over by ${fmtMoney(typedAmt - Math.max(0, currentPayable || 0))} (will be adjusted)`
                      : `Remaining after payment: ${fmtMoney(Math.max(0, remainingPreview))}`}
                  </Text>
                </View>

                {/* Method (UI note only) */}
                <View style={styles.row}>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => { setMethod('cash'); dlog(traceIdRef.current, 'Method selected', { method: 'cash' }); }}
                      style={[methodPillStyles.pill, method === 'cash' ? methodPillStyles.pillActive : null]}
                    >
                      <Feather name="dollar-sign" size={16} color={method === 'cash' ? '#fff' : TEXT} />
                      <Text style={[methodPillStyles.pillTxt, method === 'cash' ? { color: '#fff' } : null]}>Cash</Text>
                    </TouchableOpacity>

                    <View style={{ flex: 1 }}>
                      <TextInput
                        value={customMethod}
                        onChangeText={(t) => { setCustomMethod(t); setMethod(t.trim().length > 0 ? 'custom' : 'cash'); }}
                        placeholder="Note: Equity (owner capital)"
                        placeholderTextColor="#9CA3AF"
                        style={styles.input}
                      />
                    </View>
                  </View>
                </View>

                {/* Actions */}
                <View style={[styles.actions, { marginTop: 0 }]}>
                  <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={close} disabled={submitting}>
                    <Text style={styles.btnGhostText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btn, submitting ? { opacity: 0.6 } : null]}
                   onPress={onSave} 
                   disabled={
                    submitting ||
                    (!oilId && !lotId && typeof extraCostId !== 'number')
                  }>

                   
                    {submitting ? <ActivityIndicator size="small" color="#fff" /> : (<><Feather name="save" size={16} color="#fff" /><Text style={styles.btnTxt}>Save</Text></>)}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      </Modal>

      {/* IMAGE-ONLY Receipt */}
      <Modal visible={showReceipt} transparent animationType="fade" onRequestClose={() => setShowReceipt(false)}>
        <TouchableWithoutFeedback onPress={() => setShowReceipt(false)}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <View style={styles.paperCenter}>
          <View style={styles.paperNotchLeft} />
          <View style={styles.paperNotchRight} />

          <View ref={paperRef} collapsable={false} style={styles.paper}>
            <Text style={styles.paperCompany} numberOfLines={1}>{(companyName || 'Rasiid Bixin-sameeye').toUpperCase()}</Text>
            {!!companyContact && <Text style={styles.paperCompanySub} numberOfLines={1}>{companyContact}</Text>}

            <View style={styles.dots} />

            <Text style={styles.paperTitle}>Vendor Payment Receipt</Text>
            <Text style={styles.paperMeta}>{savedAt ? savedAt.toLocaleString() : new Date().toLocaleString()}</Text>

            <View style={styles.dots} />

            <View style={styles.rowKV}><Text style={styles.k}>Vendor</Text><Text style={styles.v} numberOfLines={1}>{vendorName || '-'}</Text></View>
            {oilType ? (<View style={styles.rowKV}><Text style={styles.k}>Oil Type</Text><Text style={styles.v}>{oilType}</Text></View>) : null}
            <View style={styles.rowKV}><Text style={styles.k}>Method</Text><Text style={styles.v}>{'Equity (Owner capital)'}</Text></View>

            <View style={styles.dots} />

            <View style={styles.amountBlock}><Text style={styles.amountLabel}>PAID</Text><Text style={styles.amountValue}>{fmtMoney(paidAmt)}</Text></View>

            <View style={styles.rowKV}><Text style={styles.k}>Previous Payable</Text><Text style={styles.v}>{fmtMoney(prevDue)}</Text></View>
            <View style={styles.rowKV}><Text style={[styles.k]}>New Payable</Text><Text style={[styles.v, newDue > 0 ? styles.vDanger : styles.vOk]}>{fmtMoney(newDue)}</Text></View>

            {extraItems.length > 0 && (
              <>
                <View style={styles.dots} />
                <Text style={[styles.k, { marginBottom: 4 }]}>Extra costs recorded</Text>
                {extraItems.map((it, idx) => (<View key={`x-${idx}`} style={styles.rowKV}><Text style={styles.k}>{it.label}</Text><Text style={styles.v}>{fmtMoneyExtra(it.amt)}</Text></View>))}
                <View style={styles.rowKV}><Text style={[styles.k, { fontWeight: '900' }]}>Total extras</Text><Text style={[styles.v, { fontWeight: '900' }]}>{fmtMoneyExtra(extraTotal)}</Text></View>
              </>
            )}

            <View style={styles.dots} />
            <Text style={styles.footerThanks}>Mahadsanid!</Text>
            <Text style={styles.footerFine}>Rasiidkan waa caddeyn bixinta lacagta alaab-qeybiyaha (funded by owner equity).</Text>
          </View>
        </View>
      </Modal>

      {/* Share chooser */}
      <Modal visible={shareOpen} transparent animationType="slide" onRequestClose={closeShareAndReceipt}>
        <TouchableWithoutFeedback onPress={closeShareAndReceipt}><View style={styles.sheetBackdrop} /></TouchableWithoutFeedback>
        <View style={[styles.shareSheetContainer, { paddingBottom: Math.max(20, bottomSafe + 6) }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Udir rasiidka</Text>
          <Text style={styles.sheetDesc}>Dooro meesha aad ku wadaagi doonto rasiidka sawirka (PNG) iyo fariinta.</Text>

          <View style={styles.sheetList}>
            <TouchableOpacity style={styles.sheetItem} onPress={async () => { await shareImage(); closeShareAndReceipt(); }} activeOpacity={0.9}>
              <View style={[styles.sheetIcon, { backgroundColor: '#F5F7FB' }]}><Feather name="share-2" size={18} color="#0B2447" /></View>
              <View style={{ flex: 1 }}><Text style={styles.sheetItemTitle}>System Share</Text><Text style={styles.sheetItemSub}>Let the device choose an app</Text></View>
              <Feather name="chevron-right" size={18} color="#6B7280" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.sheetItem} onPress={async () => { await shareImage(); await sendWhatsAppText(undefined, shareMsg); closeShareAndReceipt(); }} activeOpacity={0.9}>
              <View style={[styles.sheetIcon, { backgroundColor: '#E7F9EF' }]}><FontAwesome name="whatsapp" size={18} color="#25D366" /></View>
              <View style={{ flex: 1 }}><Text style={styles.sheetItemTitle}>WhatsApp</Text><Text style={styles.sheetItemSub}>Share image then open chat with text</Text></View>
              <Feather name="chevron-right" size={18} color="#6B7280" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.sheetItem} onPress={async () => { await shareImage(); await sendSmsText(shareMsg); closeShareAndReceipt(); }} activeOpacity={0.9}>
              <View style={[styles.sheetIcon, { backgroundColor: '#EEF2FF' }]}><Feather name="message-circle" size={18} color="#4F46E5" /></View>
              <View style={{ flex: 1 }}><Text style={styles.sheetItemTitle}>SMS</Text><Text style={styles.sheetItemSub}>Share image via sheet, then prefill SMS</Text></View>
              <Feather name="chevron-right" size={18} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.sheetCancel} onPress={closeShareAndReceipt}>
            <Text style={styles.sheetCancelTxt}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

const dueStyles = StyleSheet.create({
  banner: {
    flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#FAFBFF',
    borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 12,
  },
  left: { color: MUTED, fontWeight: '700' },
  right: { color: TEXT, fontWeight: '900', maxWidth: 190 },
  quickFill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 20, backgroundColor: '#EEF2FF', borderWidth: 1, borderColor: '#DDE3F0',
  },
  quickFillTxt: { color: '#0B2447', fontWeight: '800', fontSize: 12 },
});

const methodPillStyles = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 40,
    borderRadius: 12, borderWidth: 1.5, borderColor: BORDER, backgroundColor: '#fff',
  },
  pillActive: { backgroundColor: '#0B2447', borderColor: '#0B2447' },
  pillTxt: { color: TEXT, fontWeight: '800' },
});

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheetCard: {
    flex: 1, backgroundColor: BG, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1,
    borderColor: BORDER, shadowColor: '#000', shadowOpacity: 0.18, shadowOffset: { width: 0, height: -8 },
    shadowRadius: 16, elevation: 20,
  },
  sheetHandle: { alignSelf: 'center', width: 46, height: 5, borderRadius: 3, backgroundColor: '#E5E7EB', marginBottom: 8 },
  title: { fontSize: 18, fontWeight: '800', marginBottom: 10, color: TEXT, textAlign: 'center' },

  row: { marginBottom: 14 },
  label: { fontWeight: '700', color: TEXT, marginBottom: 6 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingHorizontal: 12, height: 48, color: TEXT },

  actions: { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1, height: 48, borderRadius: 12, backgroundColor: ACCENT,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8,
  },
  btnTxt: { color: '#fff', fontWeight: '800' },
  btnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: BORDER },
  btnGhostText: { color: TEXT, fontWeight: '800' },

  paperCenter: { ...StyleSheet.absoluteFillObject, padding: 18, justifyContent: 'center', alignItems: 'center' },
  paperNotchLeft: { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: 'rgba(0,0,0,0.05)', left: '50%', marginLeft: -(PAPER_W / 2) - 7, top: '20%' },
  paperNotchRight: { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: 'rgba(0,0,0,0.05)', right: '50%', marginRight: -(PAPER_W / 2) - 7, bottom: '22%' },
  paper: {
    width: PAPER_W, backgroundColor: '#FFFEFC', borderRadius: 12, borderWidth: 1, borderColor: '#E9EDF5',
    paddingVertical: 14, paddingHorizontal: 14, shadowColor: '#000', shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 8 }, shadowRadius: 12, elevation: 4,
  },
  paperCompany: { textAlign: 'center', fontSize: 14, fontWeight: '900', color: TEXT },
  paperCompanySub: { textAlign: 'center', fontSize: 11, color: MUTED, marginTop: 2 },
  paperTitle: { textAlign: 'center', fontSize: 13, color: '#475569', fontWeight: '800', marginTop: 2 },
  paperMeta: { textAlign: 'center', fontSize: 11, color: MUTED, marginTop: 2 },
  dots: { borderBottomWidth: 1, borderStyle: 'dotted', borderColor: '#C7D2FE', marginVertical: 10 },
  rowKV: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  k: { color: '#475569', fontSize: 12, fontWeight: '700' },
  v: { color: TEXT, fontSize: 12, fontWeight: '800' },
  vDanger: { color: '#DC2626' },
  vOk: { color: '#059669' },
  amountBlock: { alignItems: 'center', marginVertical: 4 },
  amountLabel: { fontSize: 11, color: '#64748B', fontWeight: '700', marginBottom: 2 },
  amountValue: { fontSize: 20, fontWeight: '900', color: '#059669' },

  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  shareSheetContainer: {
    position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff', borderTopLeftRadius: 22,
    borderTopRightRadius: 22, paddingHorizontal: 16, paddingTop: 10, borderWidth: 1, borderColor: '#EEF1F6',
  },
  sheetTitle: { fontSize: 16, fontWeight: '900', color: '#111827', textAlign: 'center' },
  sheetDesc: { fontSize: 12, color: '#6B7280', textAlign: 'center', marginTop: 4, marginBottom: 10 },
  sheetList: { gap: 10 },
  sheetItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 10,
    borderRadius: 14, backgroundColor: '#FAFBFF', borderWidth: 1, borderColor: '#EEF1F6',
  },
  sheetIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sheetItemTitle: { fontSize: 14, fontWeight: '800', color: '#0B1220' },
  sheetItemSub: { fontSize: 11, color: '#6B7280' },
  sheetCancel: { marginTop: 12, alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 16 },
  sheetCancelTxt: { fontWeight: '800', color: '#6B7280' },
});
