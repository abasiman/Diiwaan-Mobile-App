// app/Shidaal/VendorPaymentCreateSheet.tsx
import api from '@/services/api';
import { Feather, FontAwesome } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
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
import { captureRef } from 'react-native-view-shot';
import { events, EVT_VENDOR_PAYMENT_CREATED } from './eventBus';

type Method = 'cash' | 'custom'; // UI-only; backend still uses 'equity'

type ExtraCosts = {
  truckRent: number;
  depotCost: number;
  tax: number;
  currency: string; // 'USD' | 'SOS'
};

type Allocation = {
  oilCost: number;
  extras: { category: string; amount: number }[];
  currency: string; // e.g., 'USD' | 'SOS'
  total: number; // oilCost + sum(extras)
};

type Props = {
  visible: boolean;
  onClose: () => void;
  token: string | null;
  allocation?: Allocation;
  extraCostIds?: number[];
  oilId: number;
  lotId?: number;
  extraCostId?: number;
  vendorNameOverride?: string | null;
  prefillAmountUSD?: number;
  currentPayable?: number;
  onCreated?: () => void;
  companyName?: string | null;
  companyContact?: string | null;
  extraCosts?: ExtraCosts;
};

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
  extraCostIds,
  vendorNameOverride,
  currentPayable = 0,
  onCreated,
  allocation,
  companyName,
  companyContact,
  extraCosts,
  prefillAmountUSD,
}: Props) {
  const insets = useSafeAreaInsets();
  const bottomSafe = insets.bottom || 0;

  const [amount, setAmount] = useState<string>('');
  const [method, setMethod] = useState<Method>('cash'); // UI-only; API uses 'equity'
  const [customMethod, setCustomMethod] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const [vendorName, setVendorName] = useState<string>('-');
  const [oilType, setOilType] = useState<string | null>(null);

  const [snapshotDue, setSnapshotDue] = useState<number>(currentPayable);

  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [paidAmt, setPaidAmt] = useState<number>(0);
  const [prevDue, setPrevDue] = useState<number>(currentPayable);
  const [newDue, setNewDue] = useState<number>(currentPayable);

  const [shareOpen, setShareOpen] = useState(false);
  const [shareMsg, setShareMsg] = useState('');

  const paperRef = useRef<View>(null);

  const authHeader = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

  const isBatchExtras = Array.isArray(extraCostIds) && extraCostIds.length > 0;
  const isSingleExtra = typeof extraCostId === 'number';

  type ExtraDue = { id: number; due: number };
  const [batchDues, setBatchDues] = useState<ExtraDue[] | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  const resolvedCurrency = allocation?.currency || extraCosts?.currency || 'USD';
  const fmtMoney = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: resolvedCurrency,
      maximumFractionDigits: 2,
    }).format(n || 0);

  const fmtMoneyExtra = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: allocation?.currency || extraCosts?.currency || 'USD',
      maximumFractionDigits: 2,
    }).format(n || 0);

  const close = () => {
    if (submitting) return;
    onClose();
  };

  // Fetch vendor/oil meta (unchanged)
  useEffect(() => {
    let isMounted = true;
    (async () => {
      if (!visible) return;
      if (!oilId && !lotId) {
        const prefer = (vendorNameOverride && vendorNameOverride.trim()) || '-';
        if (isMounted) {
          setVendorName(prefer);
          setOilType(null);
        }
        return;
      }
      try {
        let data: any = null;
        if (oilId) {
          const r = await api.get(`/diiwaanoil/${oilId}`, { headers: authHeader });
          data = r?.data || {};
        } else if (lotId) {
          const r = await api.get(`/diiwaanoil/lot/${lotId}`, { headers: authHeader });
          data = r?.data || {};
        }
        const prefer =
          (vendorNameOverride && vendorNameOverride.trim()) ||
          (data?.oil_well && String(data.oil_well).trim()) ||
          (data?.supplier_name && String(data.supplier_name).trim()) ||
          '-';
        if (!isMounted) return;
        setVendorName(prefer);
        setOilType(data?.oil_type ?? null);
      } catch {
        const prefer = (vendorNameOverride && vendorNameOverride.trim()) || '-';
        if (!isMounted) return;
        setVendorName(prefer);
        setOilType(null);
      }
    })();
    return () => { isMounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, oilId, lotId, vendorNameOverride, token]);

  // Prefill amounts/method (unchanged logic)
  useEffect(() => {
    let cancel = false;
    if (visible && allocation && !isBatchExtras && !isSingleExtra) {
      const due = Number(allocation.total || 0);
      setSnapshotDue(due);
      setPrevDue(due);
      setNewDue(due);
      setAmount(due > 0 ? (Math.round(due * 100) / 100).toFixed(2) : '');
      setMethod('cash');
      return () => { cancel = true; };
    }
    const primeFromProps = () => {
      const due = Number.isFinite(currentPayable) ? currentPayable : 0;
      setSnapshotDue(due);
      setPrevDue(due);
      setNewDue(due);
      setAmount(due > 0 ? (Math.round(due * 100) / 100).toFixed(2) : '');
      setMethod('cash');
    };
    const primeFromBackendForLot = async () => {
      try {
        const r = await api.get('/diiwaanvendorpayments/supplier-dues', {
          headers: authHeader,
          params: { lot_id: lotId },
        });
        const lotDue = r?.data?.items?.[0]?.amount_due ?? 0;
        if (cancel) return;
        setSnapshotDue(lotDue);
        setPrevDue(lotDue);
        setNewDue(lotDue);
        setAmount(lotDue > 0 ? (Math.round(lotDue * 100) / 100).toFixed(2) : '');
        setMethod('cash');
      } catch {
        if (cancel) return;
        primeFromProps();
      }
    };
    if (visible && !isBatchExtras && !isSingleExtra) {
      if (lotId) primeFromBackendForLot();
      else primeFromProps();
    }
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, lotId, currentPayable, token, allocation, isBatchExtras, isSingleExtra]);

  // Helpers
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
    const clean = sanitizeAmount(raw);
    const num = parseFloat(clean);
    return Number.isFinite(num) ? num : 0;
  };

  const typedAmt = sanitizeAmountToNumber(amount);
  const remainingPreview = Math.max(0, (prevDue || 0) - typedAmt);
  const isOverpay = typedAmt > (prevDue || 0);

  // Extras (for receipt only)
  const extraItems = useMemo(() => {
    if (!extraCosts) return [] as Array<{ label: string; amt: number }>;
    return [
      { label: 'Truck rent', amt: Number(extraCosts.truckRent || 0) },
      { label: 'Depot cost', amt: Number(extraCosts.depotCost || 0) },
      { label: 'Tax', amt: Number(extraCosts.tax || 0) },
    ].filter((x) => x.amt > 0.0001);
  }, [extraCosts]);

  const extraTotal = useMemo(
    () => extraItems.reduce((s, x) => s + x.amt, 0),
    [extraItems]
  );

  // Slim totals (UI)
  const allocationExtras = allocation?.extras ?? [];
  const allocationHasExtras = allocationExtras.length > 0;

  const uiExtrasTotal = useMemo(() => {
    if (allocation && allocationHasExtras) {
      return allocationExtras.reduce((s, x) => s + Number(x.amount || 0), 0);
    }
    return extraTotal;
  }, [allocation, allocationHasExtras, allocationExtras, extraTotal]);

  const uiOilCostTotal = useMemo(() => {
    if (allocation && typeof allocation.oilCost === 'number') return Number(allocation.oilCost || 0);
    return 0;
  }, [allocation]);

  const uiGrandTotal = useMemo(() => {
    if (allocation && typeof allocation.total === 'number') return Number(allocation.total || 0);
    return Number(uiOilCostTotal + uiExtrasTotal);
  }, [allocation, uiOilCostTotal, uiExtrasTotal]);

  const totalsCurrency = allocation?.currency || extraCosts?.currency || resolvedCurrency || 'USD';
  const fmtTotals = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: totalsCurrency,
      maximumFractionDigits: 2,
    }).format(n || 0);

  // Fetch dues for batch/single extra modes (unchanged)
  useEffect(() => {
    let cancel = false;
    const fetchDuesFor = async (ids: number[]) => {
      try {
        const r = await api.get('/diiwaanvendorpayments/supplier-dues', {
          headers: authHeader,
          params: oilId
            ? { oil_id: oilId, only_with_payments_q: 'false' }
            : { lot_id: lotId, only_with_payments_q: 'false' },
        });
        const items = r?.data?.items || [];
        const target = oilId
          ? items.find((it: any) => it.oil_id === oilId)
          : items.find((it: any) => it.lot_id === lotId);
        const ecList = (target?.extra_costs || []) as Array<{ id: number; due: number }>;
        const map = new Map(ecList.map((x) => [x.id, Number(x.due || 0)]));
        const dues: ExtraDue[] = ids.map((id) => ({ id, due: map.get(id) ?? 0 }));
        return dues;
      } catch {
        return ids.map((id) => ({ id, due: 0 }));
      }
    };
    const prefillFromExtras = async () => {
      if (prefilled || (!isBatchExtras && !isSingleExtra)) return;
      const ids = isBatchExtras ? (extraCostIds as number[]) : isSingleExtra ? [extraCostId as number] : [];
      if (!ids.length) return;

      if (isBatchExtras && (prefillAmountUSD ?? 0) > 0) {
        const due = Number(prefillAmountUSD);
        setSnapshotDue(due);
        setPrevDue(due);
        setNewDue(due);
        setAmount(due > 0 ? (Math.round(due * 100) / 100).toFixed(2) : '');
        setMethod('cash');
      }

      const dues = await fetchDuesFor(ids);
      if (cancel) return;

      setBatchDues(dues);
      const total = dues.reduce((s, x) => s + x.due, 0);

      if (total > 0) {
        setSnapshotDue(total);
        setPrevDue(total);
        setNewDue(total);
        setAmount((Math.round(total * 100) / 100).toFixed(2));
      } else if (!prefillAmountUSD) {
        setSnapshotDue(0);
        setPrevDue(0);
        setNewDue(0);
        setAmount('');
      }
      setPrefilled(true);
    };

    if (visible) {
      prefillFromExtras();
    } else {
      setBatchDues(null);
      setPrefilled(false);
    }
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, token, oilId, lotId, extraCostId, extraCostIds, isBatchExtras, isSingleExtra, prefillAmountUSD, prefilled]);

  const buildShareMessage = (paid: number, remain: number) => {
    const paidStr = fmtMoney(paid);
    const remainStr = fmtMoney(Math.max(0, remain));
    const core =
      remain > 0
        ? `Waxaad siisay ${vendorName} ${paidStr}. Haraaga waa ${remainStr}.`
        : `Waxaad siisay ${vendorName} ${paidStr}. Dayntii waa la bixiyay. Mahadsanid.`;
    if (extraItems.length) {
      const extras =
        `\n\nExtra costs recorded (${allocation?.currency || extraCosts?.currency || 'USD'}):\n` +
        extraItems.map((it) => `• ${it.label}: ${fmtMoneyExtra(it.amt)}`).join('\n') +
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
      if (canWeb) {
        try { await Linking.openURL(webLink); } catch {}
      } else {
        Alert.alert('WhatsApp unavailable', 'Could not open WhatsApp on this device.');
      }
    }
  }
  async function sendSmsText(text: string) {
    const msg = encodeURIComponent(text || '');
    const url = Platform.select({
      ios: `sms:&body=${msg}`,
      android: `sms:?body=${msg}`,
      default: `sms:?body=${msg}`,
    });
    try {
      const can = await Linking.canOpenURL(url!);
      if (can) await Linking.openURL(url!);
    } catch {}
  }

  const capturePaper = async () => {
    if (!paperRef.current) return null;
    const pixelRatio = Platform.OS === 'android' ? 3 : 2;
    const uri = await captureRef(paperRef.current, {
      format: 'png',
      quality: 1,
      fileName: 'vendor_payment_receipt',
      result: 'tmpfile',
      pixelRatio,
      backgroundColor: '#FFFFFF',
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
            const msg = buildShareMessage(paidAmt, newDue);
            setShareMsg(msg);
            setShareOpen(true);
          }
        } catch (e: any) {
          console.warn('Vendor receipt capture failed:', e?.message || e);
        }
      }, 180);
    }
    return () => { if (t) clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showReceipt, newDue, paidAmt, extraItems, extraTotal, allocation?.currency, extraCosts?.currency]);

  // ---------- SAVE (unchanged) ----------
  const onSave = async () => {
    if (!oilId && !lotId)
      return Alert.alert('Fadlan', 'Wax aan bixinno lama helin (oil ama lot).');

    if (isBatchExtras) {
      if (!batchDues || batchDues.length === 0)
        return Alert.alert('Fadlan', 'Dues for the selected extras were not found.');
      const payableItems = batchDues.filter((x) => x.due > 0.000001);
      if (payableItems.length === 0)
        return Alert.alert('Ok', 'All selected extras are fully paid.');

      setSubmitting(true);
      try {
        let paid = 0;
        for (const item of payableItems) {
          const body = {
            amount: item.due,
            supplier_name: (vendorName && vendorName !== '-') ? vendorName : '',
            payment_method: 'equity' as const,
            note: oilType ? `Payment for ${oilType} extra (${item.id})` : `Payment for extra (${item.id})`,
            extra_cost_id: item.id,
          };
          await api.post('/diiwaanvendorpayments', body, { headers: authHeader });
          paid += item.due;
        }
        const dueNow = Math.max(0, payableItems.reduce((s, x) => s + x.due, 0));
        const remain = 0;
        setPaidAmt(dueNow);
        setPrevDue(dueNow);
        setNewDue(remain);
        setSavedAt(new Date());
        events.emit(EVT_VENDOR_PAYMENT_CREATED, undefined);
        onCreated?.();
        setAmount('');
        setMethod('cash');
        onClose();
        setShowReceipt(true);
        return;
      } catch (e: any) {
        Alert.alert('Error', String(e?.response?.data?.detail || e?.message || 'Batch payment failed.'));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (isSingleExtra) {
      const targetDue = (batchDues?.[0]?.due ?? sanitizeAmountToNumber(amount));
      if (!(targetDue > 0)) return Alert.alert('Fadlan', 'Lacag sax ah lama helin.');

      setSubmitting(true);
      try {
        const body: any = {
          amount: targetDue,
          payment_method: 'equity' as const,
          note: oilType ? `Payment for ${oilType} extra (${extraCostId})` : `Payment for extra (${extraCostId})`,
          extra_cost_id: extraCostId,
          ...(lotId ? { lot_id: lotId } : {}),
          ...(oilId ? { oil_id: oilId } : {}),
        };
        const sn = (vendorNameOverride ?? vendorName)?.trim();
        if (sn && sn !== '-') body.supplier_name = sn;

        await api.post('/diiwaanvendorpayments', body, { headers: authHeader });

        setPaidAmt(targetDue);
        setPrevDue(targetDue);
        setNewDue(0);
        setSavedAt(new Date());
        events.emit(EVT_VENDOR_PAYMENT_CREATED, undefined);
        onCreated?.();
        setAmount('');
        setMethod('cash');
        onClose();
        setShowReceipt(true);
      } catch (e: any) {
        Alert.alert('Error', String(e?.response?.data?.detail || e?.message || 'Save failed.'));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const amtNum = sanitizeAmountToNumber(amount);
    if (!(amtNum > 0))
      return Alert.alert('Fadlan', 'Geli lacag sax ah (ka weyn 0).');

    setSubmitting(true);
    try {
      const body: any = {
        amount: amtNum,
        supplier_name: (vendorName && vendorName !== '-') ? vendorName : '',
        payment_method: 'equity' as const,
        note: oilType ? `Payment for ${oilType} lot (funded by owner equity)` : 'Funded by owner equity',
      };
      if (lotId) body.lot_id = lotId;
      else if (oilId) body.oil_id = oilId;

      await api.post('/diiwaanvendorpayments', body, { headers: authHeader });

      const dueNow = Math.max(0, snapshotDue || 0);
      const remain = Math.max(0, dueNow - amtNum);
      setPaidAmt(amtNum);
      setPrevDue(dueNow);
      setNewDue(remain);
      setSavedAt(new Date());
      events.emit(EVT_VENDOR_PAYMENT_CREATED, undefined);
      onCreated?.();
      setAmount('');
      setMethod('cash');
      onClose();
      setShowReceipt(true);
    } catch (e: any) {
      Alert.alert('Error', String(e?.response?.data?.detail || e?.message || 'Save failed.'));
    } finally {
      setSubmitting(false);
    }
  };

  const shareImage = async () => {
    if (!receiptUri) return;
    try {
      await Sharing.shareAsync(receiptUri, {
        mimeType: 'image/png',
        dialogTitle: 'Send Receipt',
        UTI: 'public.png',
      });
    } catch {}
  };

  const closeShareAndReceipt = () => {
    setShareOpen(false);
    setShowReceipt(false);
  };

  const resolvedMethodLabel = 'Equity (Owner capital)';
  const primaryBtnLabel = isBatchExtras ? 'Pay All Extras' : isSingleExtra ? 'Pay This Extra' : 'Confirm & Save';

  return (
    <>
      {/* ENTRY MODAL */}
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        onRequestClose={close}
      >
        <TouchableWithoutFeedback onPress={close}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <View style={styles.centerWrap}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 18 : 0}
            style={{ width: '100%', alignItems: 'center' }}
          >
            {/* FULL-WIDTH, COMPACT CARD */}
            <View style={[styles.centerCard, { paddingBottom: Math.max(12, bottomSafe) }]}>
              <View style={styles.sheetHandle} />
              <Text style={styles.title}>Record Payment</Text>

              {/* TOP INFO BANNERS (COMPACT) */}
              <View style={[dueStyles.banner, { marginBottom: 8 }]}>
                <Text style={dueStyles.left}>Vendor</Text>
                <Text style={[dueStyles.right, { maxWidth: undefined, flexShrink: 1 }]} numberOfLines={1}>
                  {vendorName || '-'}
                </Text>
              </View>
              <View style={dueStyles.banner}>
                <Text style={dueStyles.left}>Amount payable</Text>
                <Text style={dueStyles.right}>{fmtMoney(Math.max(0, prevDue || 0))}</Text>
              </View>

              {/* COMPACT TOTALS ONLY */}
              {!isBatchExtras && !isSingleExtra && (
                <View style={[dueStyles.banner, { backgroundColor: '#F8FAFF' }]}>
                  <View style={{ flex: 1 }}>
                    <Row label="Oil cost" value={fmtTotals(uiOilCostTotal)} />
                    <Row label="Extra costs" value={fmtTotals(uiExtrasTotal)} />
                    <View style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderColor: BORDER, marginVertical: 6 }} />
                    <Row label="Grand total" value={fmtTotals(uiGrandTotal)} strong />
                  </View>
                </View>
              )}

              {/* BATCH EXTRAS SUMMARY (NO EXTRA TEXT) */}
              {isBatchExtras && batchDues && (
                <View style={[dueStyles.banner, { backgroundColor: '#F8FAFF' }]}>
                  <View style={{ flex: 1 }}>
                    {batchDues.map((it) => (
                      <Row key={it.id} label={`Extra #${it.id}`} value={fmtMoney(it.due)} />
                    ))}
                    <View style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderColor: BORDER, marginVertical: 6 }} />
                    <Row label="Total" value={fmtMoney(batchDues.reduce((s, x) => s + x.due, 0))} strong />
                  </View>
                </View>
              )}

              {/* FORM (NO SCROLL; MINIMAL TEXT) */}
              <View style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={styles.label}>
                    {isBatchExtras ? 'Total to pay'
                      : isSingleExtra ? 'Amount to pay'
                      : 'Amount to pay'}
                  </Text>
                  {!isBatchExtras && !isSingleExtra && (
                    <TouchableOpacity
                      onPress={() => setAmount((Math.round(Math.max(0, prevDue || 0) * 100) / 100).toFixed(2))}
                      style={dueStyles.quickFill}
                      activeOpacity={0.8}
                    >
                      <Feather name="zap" size={14} color="#0B2447" />
                      <Text style={dueStyles.quickFillTxt}>Full</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <TextInput
                  key={visible ? 'amount-open' : 'amount-closed'}
                  value={amount}
                  onChangeText={(t) => {
                    if (isBatchExtras || isSingleExtra) return;
                    setAmount(sanitizeAmount(t));
                  }}
                  placeholder="0.00"
                  placeholderTextColor="#9CA3AF"
                  editable={!isBatchExtras && !isSingleExtra}
                  style={[
                    styles.input,
                    (isBatchExtras || isSingleExtra) && { backgroundColor: '#F8FAFC', borderColor: '#E5E7EB' },
                    (!isBatchExtras && !isSingleExtra && isOverpay && prevDue > 0) && { borderColor: '#FCA5A5', backgroundColor: '#FFF7F7' },
                  ]}
                  maxLength={18}
                  keyboardType="decimal-pad"
                />

                {/* tiny helper only when not batch/single */}
                {!isBatchExtras && !isSingleExtra && (
                  <Text
                    style={{
                      marginTop: 6,
                      fontSize: 11,
                      fontWeight: '700',
                      color: isOverpay && prevDue > 0 ? '#DC2626' : '#059669',
                    }}
                  >
                    {isOverpay && prevDue > 0
                      ? `Over by ${fmtMoney(typedAmt - Math.max(0, prevDue || 0))}`
                      : `Remaining: ${fmtMoney(Math.max(0, remainingPreview))}`}
                  </Text>
                )}
              </View>

              {/* METHOD (kept, but minimal; Cash preselected) */}
              <View style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setMethod('cash')}
                    style={[methodPillStyles.pill, method === 'cash' && methodPillStyles.pillActive]}
                  >
                    <Feather name="dollar-sign" size={16} color={method === 'cash' ? '#fff' : TEXT} />
                    <Text style={[methodPillStyles.pillTxt, method === 'cash' && { color: '#fff' }]}>
                      Cash (auto)
                    </Text>
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <TextInput
                      value={customMethod}
                      onChangeText={(t) => {
                        setCustomMethod(t);
                        setMethod(t.trim().length > 0 ? 'custom' : 'cash');
                      }}
                      placeholder="Optional note"
                      placeholderTextColor="#9CA3AF"
                      style={styles.input}
                    />
                  </View>
                </View>
              </View>

              {/* ACTIONS (ALWAYS VISIBLE) */}
              <View style={[styles.actions, { marginTop: 0 }]}>
                <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={close} disabled={submitting}>
                  <Text style={styles.btnGhostText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, submitting && { opacity: 0.6 }]}
                  onPress={onSave}
                  disabled={submitting || (!oilId && !lotId)}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Feather name="save" size={16} color="#fff" />
                      <Text style={styles.btnTxt}>{primaryBtnLabel}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* RECEIPT MODAL (unchanged) */}
      <Modal visible={showReceipt} transparent animationType="fade" onRequestClose={() => setShowReceipt(false)}>
        <TouchableWithoutFeedback onPress={() => setShowReceipt(false)}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <View style={styles.paperCenter}>
          <View style={styles.paperNotchLeft} />
          <View style={styles.paperNotchRight} />

          <View ref={paperRef} collapsable={false} style={styles.paper}>
            <Text style={styles.paperCompany} numberOfLines={1}>
              {(companyName || 'Rasiid Bixin-sameeye').toUpperCase()}
            </Text>
            {!!companyContact && (
              <Text style={styles.paperCompanySub} numberOfLines={1}>
                {companyContact}
              </Text>
            )}

            <View style={styles.dots} />

            <Text style={styles.paperTitle}>Vendor Payment Receipt</Text>
            <Text style={styles.paperMeta}>
              {savedAt ? savedAt.toLocaleString() : new Date().toLocaleString()}
            </Text>

            <View style={styles.dots} />

            <View style={styles.rowKV}>
              <Text style={styles.k}>Vendor</Text>
              <Text style={styles.v} numberOfLines={1}>{vendorName || '-'}</Text>
            </View>
            {oilType ? (
              <View style={styles.rowKV}>
                <Text style={styles.k}>Oil Type</Text>
                <Text style={styles.v}>{oilType}</Text>
              </View>
            ) : null}
            <View style={styles.rowKV}>
              <Text style={styles.k}>Method</Text>
              <Text style={styles.v}>{resolvedMethodLabel}</Text>
            </View>

            <View style={styles.dots} />

            <View style={styles.amountBlock}>
              <Text style={styles.amountLabel}>PAID</Text>
              <Text style={styles.amountValue}>{fmtMoney(paidAmt)}</Text>
            </View>

            <View style={styles.rowKV}>
              <Text style={styles.k}>Previous Payable</Text>
              <Text style={styles.v}>{fmtMoney(prevDue)}</Text>
            </View>
            <View style={styles.rowKV}>
              <Text style={[styles.k]}>New Payable</Text>
              <Text style={[styles.v, newDue > 0 ? styles.vDanger : styles.vOk]}>{fmtMoney(newDue)}</Text>
            </View>

            {extraItems.length > 0 && (
              <>
                <View style={styles.dots} />
                <Text style={[styles.k, { marginBottom: 4 }]}>Extra costs recorded</Text>
                {extraItems.map((it, idx) => (
                  <View key={`x-${idx}`} style={styles.rowKV}>
                    <Text style={styles.k}>{it.label}</Text>
                    <Text style={styles.v}>{fmtMoneyExtra(it.amt)}</Text>
                  </View>
                ))}
                <View style={styles.rowKV}>
                  <Text style={[styles.k, { fontWeight: '900' }]}>Total extras</Text>
                  <Text style={[styles.v, { fontWeight: '900' }]}>{fmtMoneyExtra(extraTotal)}</Text>
                </View>
              </>
            )}

            <View style={styles.dots} />

            <Text style={styles.footerThanks}>Mahadsanid!</Text>
            <Text style={styles.footerFine}>
              Rasiidkan waa caddeyn bixinta lacagta alaab-qeybiyaha (funded by owner equity).
            </Text>
          </View>
        </View>
      </Modal>

      {/* SHARE SHEET (unchanged) */}
      <Modal visible={shareOpen} transparent animationType="slide" onRequestClose={closeShareAndReceipt}>
        <TouchableWithoutFeedback onPress={closeShareAndReceipt}>
          <View style={styles.sheetBackdrop} />
        </TouchableWithoutFeedback>
        <View style={[styles.shareSheetContainer, { paddingBottom: Math.max(20, bottomSafe + 6) }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Udir rasiidka</Text>
          <Text style={styles.sheetDesc}>Dooro meesha aad ku wadaagi doonto rasiidka sawirka (PNG) iyo fariinta.</Text>

          <View style={styles.sheetList}>
            <TouchableOpacity
              style={styles.sheetItem}
              onPress={async () => { await shareImage(); closeShareAndReceipt(); }}
              activeOpacity={0.9}
            >
              <View style={[styles.sheetIcon, { backgroundColor: '#F5F7FB' }]}>
                <Feather name="share-2" size={18} color="#0B2447" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetItemTitle}>System Share</Text>
                <Text style={styles.sheetItemSub}>Let the device choose an app</Text>
              </View>
              <Feather name="chevron-right" size={18} color="#6B7280" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetItem}
              onPress={async () => { await shareImage(); await sendWhatsAppText(undefined, shareMsg); closeShareAndReceipt(); }}
              activeOpacity={0.9}
            >
              <View style={[styles.sheetIcon, { backgroundColor: '#E7F9EF' }]}>
                <FontAwesome name="whatsapp" size={18} color="#25D366" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetItemTitle}>WhatsApp</Text>
                <Text style={styles.sheetItemSub}>Share image then open chat with text</Text>
              </View>
              <Feather name="chevron-right" size={18} color="#6B7280" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetItem}
              onPress={async () => { await shareImage(); await sendSmsText(shareMsg); closeShareAndReceipt(); }}
              activeOpacity={0.9}
            >
              <View style={[styles.sheetIcon, { backgroundColor: '#EEF2FF' }]}>
                <Feather name="message-circle" size={18} color="#4F46E5" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetItemTitle}>SMS</Text>
                <Text style={styles.sheetItemSub}>Share image via sheet, then prefill SMS</Text>
              </View>
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

/** minimal row */
const Row = ({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
    <Text style={[{ color: MUTED, fontWeight: '700', fontSize: 14 }, strong && { fontSize: 16 }]}>{label}</Text>
    <Text style={[{ color: TEXT, fontWeight: '800', fontSize: 14 }, strong && { fontSize: 16 }]}>{value}</Text>
  </View>
);

const dueStyles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#FAFBFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  left: { color: MUTED, fontWeight: '700' },
  right: { color: TEXT, fontWeight: '900' },
  quickFill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#DDE3F0',
  },
  quickFillTxt: { color: '#0B2447', fontWeight: '800', fontSize: 12 },
});

const methodPillStyles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: '#fff',
  },
  pillActive: {
    backgroundColor: '#0B2447',
    borderColor: '#0B2447',
  },
  pillTxt: {
    color: TEXT,
    fontWeight: '800',
  },
});

const styles = StyleSheet.create({
  // Backdrops & centered wrapper
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  centerWrap: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8 },

  // FULL-WIDTH CARD, no scrolling needed
  centerCard: {
    width: '98%',            // ⬅️ nearly full width
    backgroundColor: BG,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 12,
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 20,
  },
  sheetHandle: { alignSelf: 'center', width: 46, height: 5, borderRadius: 3, backgroundColor: '#E5E7EB', marginBottom: 8 },
  title: { fontSize: 18, fontWeight: '800', marginBottom: 10, color: TEXT, textAlign: 'center' },

  label: { fontWeight: '700', color: TEXT, marginBottom: 6 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingHorizontal: 12, height: 48, color: TEXT },

  actions: { flexDirection: 'row', gap: 10, marginTop: 2, marginBottom: 2 },
  btn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  btnTxt: { color: '#fff', fontWeight: '800' },
  btnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: BORDER },
  btnGhostText: { color: TEXT, fontWeight: '800' },

  // Receipt visuals (unchanged)
  paperCenter: { ...StyleSheet.absoluteFillObject, padding: 18, justifyContent: 'center', alignItems: 'center' },
  paperNotchLeft: { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: 'rgba(0,0,0,0.05)', left: '50%', marginLeft: -(PAPER_W / 2) - 7, top: '20%' },
  paperNotchRight: { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: 'rgba(0,0,0,0.05)', right: '50%', marginRight: -(PAPER_W / 2) - 7, bottom: '22%' },
  paper: {
    width: PAPER_W,
    backgroundColor: '#FFFEFC',
    borderRadius: 12,
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

  // Share sheet (unchanged)
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  shareSheetContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderWidth: 1,
    borderColor: '#EEF1F6',
  },
  sheetTitle: { fontSize: 16, fontWeight: '900', color: '#111827', textAlign: 'center' },
  sheetDesc: { fontSize: 12, color: '#6B7280', textAlign: 'center', marginTop: 4, marginBottom: 10 },
  sheetList: { gap: 10 },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: '#FAFBFF',
    borderWidth: 1,
    borderColor: '#EEF1F6',
  },
  sheetIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sheetItemTitle: { fontSize: 14, fontWeight: '800', color: '#0B1220' },
  sheetItemSub: { fontSize: 11, color: '#6B7280' },
  sheetCancel: { marginTop: 12, alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 16 },
  sheetCancelTxt: { fontWeight: '800', color: '#6B7280' },
});
