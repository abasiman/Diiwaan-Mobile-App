// app/Shidaal/VendorPaymentMultiSheet.tsx
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
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

type Row = {
  oilId: number;
  oilType: 'diesel' | 'petrol';
  truckPlate?: string | null;
  currentPayable: number;   // total_landed_cost minus any previous payments (at creation it's just total_landed_cost)
};

type ExtraCostsShared = {
  truckRent: number;
  depotCost: number;
  tax: number;
  currency: string; // display code (e.g., 'USD' / 'SOS')
};

type Props = {
  visible: boolean;
  onClose: () => void;
  token: string | null;

  vendorName: string;    // display (oil_well or supplier)
  currencyCode?: string; // 'USD' or 'SOS' (display only)

  rows: Row[];           // two rows usually (diesel, petrol)
  onCreated?: () => void;

  companyName?: string | null;
  companyContact?: string | null;

  // NEW: shared extras you passed from oilmodal (attached to the first created row on backend)
  extraCostsShared?: ExtraCostsShared;
};

const ACCENT = '#576CBC';
const BORDER = '#E5E7EB';
const BG = '#FFFFFF';
const TEXT = '#0B1220';
const MUTED = '#6B7280';
const PAPER_W = 330;

export default function VendorPaymentMultiSheet({
  visible,
  onClose,
  token,
  vendorName,
  currencyCode = 'USD',
  rows,
  onCreated,
  companyName,
  companyContact,
  extraCostsShared,
}: Props) {
  const insets = useSafeAreaInsets();
  const bottomSafe = insets.bottom || 0;
  const SCREEN_H = Dimensions.get('window').height;
  const SHEET_H = Math.round(SCREEN_H * 0.92);

  // local amounts keyed by oilId
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // receipt
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [paidMap, setPaidMap] = useState<Record<number, number>>({});
  const [remainMap, setRemainMap] = useState<Record<number, number>>({});

  const paperRef = useRef<View>(null);

  const authHeader = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

  // slide
  const slideY = useRef(new Animated.Value(SHEET_H)).current;
  useEffect(() => {
    if (visible) {
      Animated.timing(slideY, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      slideY.setValue(SHEET_H);
    }
  }, [visible, SHEET_H, slideY]);

  // reset on open
  useEffect(() => {
    if (visible) {
      const init: Record<number, string> = {};
      rows.forEach(r => { init[r.oilId] = r.currentPayable > 0 ? r.currentPayable.toFixed(2) : ''; });
      setAmounts(init);
    }
  }, [visible, rows]);

  const sanitize = (raw: string) => {
    let s = raw.replace(/[^0-9.]/g, '');
    const i = s.indexOf('.');
    if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '');
    return s;
  };
  const toNum = (s: string) => {
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  };

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode || 'USD',
      maximumFractionDigits: 2,
    }).format(n || 0);

  const setAmt = (oilId: number, v: string) => setAmounts(prev => ({ ...prev, [oilId]: sanitize(v) }));
  const quickFill = (oilId: number) => {
    const row = rows.find(r => r.oilId === oilId);
    if (!row) return;
    setAmounts(prev => ({ ...prev, [oilId]: Math.max(0, row.currentPayable).toFixed(2) }));
  };

  const totals = rows.reduce(
    (acc, r) => {
      const a = toNum(amounts[r.oilId] || '0');
      const due = Math.max(0, r.currentPayable);
      const pay = Math.min(a, due);
      acc.pay += pay;
      acc.dueAfter += Math.max(0, due - pay);
      return acc;
    },
    { pay: 0, dueAfter: 0 }
  );

  // ── Extra costs (informational block) ─────────────────────
  const extra = extraCostsShared;
  const extraItems = useMemo(() => {
    if (!extra) return [] as Array<{ label: string; amt: number }>;
    return [
      { label: 'Truck rent', amt: Number(extra.truckRent || 0) },
      { label: 'Depot cost', amt: Number(extra.depotCost || 0) },
      { label: 'Tax', amt: Number(extra.tax || 0) },
    ].filter(x => x.amt > 0.0001);
  }, [extra]);

  const extraTotal = useMemo(
    () => extraItems.reduce((s, x) => s + x.amt, 0),
    [extraItems]
  );

  const onSave = async () => {
    // Build payloads for amounts > 0
    const payloads = rows
      .map(r => {
        const raw = toNum(amounts[r.oilId] || '0');
        if (!(raw > 0)) return null;
        const pay = Math.min(raw, Math.max(0, r.currentPayable));
        return {
          oilId: r.oilId,
          body: {
            amount: pay,
            supplier_name: vendorName,
            oil_id: r.oilId,
            payment_method: 'equity' as const,
            note: `Payment for ${r.oilType} lot (funded by owner equity)`,
          },
          paid: pay,
          remain: Math.max(0, Math.max(0, r.currentPayable) - pay),
        };
      })
      .filter(Boolean) as { oilId: number; body: any; paid: number; remain: number }[];

    if (payloads.length === 0) {
      Alert.alert('Fadlan', 'Geli lacag sax ah (ugu yaraan hal sadar).');
      return;
    }

    setSubmitting(true);
    try {
      // post one by one to keep snapshots correct
      for (const p of payloads) {
        await api.post('/diiwaanvendorpayments', p.body, { headers: authHeader });
      }

      // receipt state
      const pm: Record<number, number> = {};
      const rm: Record<number, number> = {};
      payloads.forEach(p => { pm[p.oilId] = p.paid; rm[p.oilId] = p.remain; });
      setPaidMap(pm);
      setRemainMap(rm);
      setSavedAt(new Date());

      onCreated?.();

      // close form & show receipt
      onClose();
      setShowReceipt(true);
    } catch (e: any) {
      Alert.alert('Error', String(e?.response?.data?.detail || e?.message || 'Save failed.'));
    } finally {
      setSubmitting(false);
    }
  };

  const buildReceiptLines = () =>
    rows.map(r => {
      const paid = paidMap[r.oilId] || 0;
      const remain = remainMap[r.oilId] ?? r.currentPayable;
      return `${r.oilType.toUpperCase()}: paid ${fmtMoney(paid)} — new due ${fmtMoney(remain)}`;
    }).join('\n');

  // share / receipt
  const [shareOpen, setShareOpen] = useState(false);
  const [shareMsg, setShareMsg] = useState('');

  const capturePaper = async () => {
    if (!paperRef.current) return null;
    const pixelRatio = Platform.OS === 'android' ? 3 : 2;
    return await captureRef(paperRef.current, {
      format: 'png',
      quality: 1,
      fileName: 'vendor_payment_receipt_multi',
      result: 'tmpfile',
      pixelRatio,
      backgroundColor: '#FFFFFF',
    });
  };

  useEffect(() => {
    let t: NodeJS.Timeout | null = null;
    if (showReceipt) {
      t = setTimeout(async () => {
        try {
          const uri = await capturePaper();
          setReceiptUri(uri);
          if (uri) {
            const paidTotal = Object.values(paidMap).reduce((a, b) => a + (b || 0), 0);
            const msg =
              `Waxaad siisay ${vendorName} ${fmtMoney(paidTotal)}.\n\n` +
              buildReceiptLines() +
              (extraItems.length
                ? `\n\nExtra costs recorded (${extra?.currency || currencyCode}):\n` +
                  extraItems.map(it => `• ${it.label}: ${fmtMoney(it.amt)}`).join('\n') +
                  `\nTotal extras: ${fmtMoney(extraTotal)}`
                : '');
            setShareMsg(msg);
            setShareOpen(true);
          }
        } catch {}
      }, 180);
    }
    return () => { if (t) clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showReceipt, paidMap, remainMap, extraItems, extraTotal]);

  async function shareImage() {
    if (!receiptUri) return;
    try {
      await Sharing.shareAsync(receiptUri, {
        mimeType: 'image/png',
        dialogTitle: 'Send Receipt',
        UTI: 'public.png',
      });
    } catch {}
  }

  async function sendWhatsAppText(text: string) {
    const msg = encodeURIComponent(text || '');
    const canDeep = await Linking.canOpenURL('whatsapp://send');
    if (canDeep) {
      try { await Linking.openURL(`whatsapp://send?text=${msg}`); return; } catch {}
    }
    const canWeb = await Linking.canOpenURL(`https://wa.me/?text=${msg}`);
    if (canWeb) { try { await Linking.openURL(`https://wa.me/?text=${msg}`); } catch {} }
  }
  async function sendSmsText(text: string) {
    const msg = encodeURIComponent(text || '');
    const url = Platform.select({ ios: `sms:&body=${msg}`, android: `sms:?body=${msg}`, default: `sms:?body=${msg}` });
    try { const can = await Linking.canOpenURL(url!); if (can) await Linking.openURL(url!); } catch {}
  }
  const closeShareAndReceipt = () => { setShareOpen(false); setShowReceipt(false); };

  return (
    <>
      {/* Bottom Sheet */}
      <Modal visible={visible} transparent animationType="slide" presentationStyle="overFullScreen" onRequestClose={onClose}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <Animated.View style={[styles.sheetWrap, { height: SHEET_H, transform: [{ translateY: slideY }] }]}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 18 : 0} style={{ flex: 1 }}>
            <View style={[styles.sheetCard, { paddingBottom: Math.max(16, bottomSafe) }]}>
              <View style={styles.sheetHandle} />
              <Text style={styles.title}>Record Payment (Multiple Lots)</Text>

              {/* Vendor banner */}
              <View style={[styles.banner, { marginBottom: 8 }]}>
                <Text style={styles.left}>Vendor</Text>
                <Text style={styles.right} numberOfLines={1}>{vendorName || '-'}</Text>
              </View>

              {/* Rows */}
              <View style={{ gap: 10 }}>
                {rows.map(r => {
                  const due = Math.max(0, r.currentPayable);
                  const typed = toNum(amounts[r.oilId] || '0');
                  const pay = Math.min(typed, due);
                  const over = typed > due && due > 0;
                  const remain = Math.max(0, due - pay);
                  return (
                    <View key={r.oilId} style={styles.rowCard}>
                      <View style={styles.rowHead}>
                        <Text style={styles.rowTitle}>{r.oilType.toUpperCase()}</Text>
                        <Text style={styles.rowDue}>Due: {fmtMoney(due)}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <TextInput
                          value={amounts[r.oilId] || ''}
                          onChangeText={(t) => setAmt(r.oilId, t)}
                          placeholder="0.00"
                          placeholderTextColor="#9CA3AF"
                          style={[
                            styles.input,
                            over ? { borderColor: '#FCA5A5', backgroundColor: '#FFF7F7' } : null,
                            { flex: 1 },
                          ]}
                          keyboardType="decimal-pad"
                          maxLength={18}
                        />
                        <TouchableOpacity onPress={() => quickFill(r.oilId)} style={styles.quickBtn} activeOpacity={0.9}>
                          <Feather name="zap" size={14} color="#0B2447" />
                          <Text style={styles.quickTxt}>Full</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={[styles.hint, { color: over ? '#DC2626' : '#059669' }]}>
                        {over ? `Over by ${fmtMoney(typed - due)} (will clamp to ${fmtMoney(pay)})`
                              : `Remaining after payment: ${fmtMoney(remain)}`}
                      </Text>
                    </View>
                  );
                })}
              </View>

              {/* Total footer */}
              <View style={[styles.banner, { marginTop: 10 }]}>
                <Text style={styles.left}>Total to pay</Text>
                <Text style={styles.right}>{fmtMoney(totals.pay)}</Text>
              </View>

              {/* NEW: Extra costs (informational) */}
              {extraItems.length > 0 && (
                <View style={[styles.banner, { marginTop: 8, backgroundColor: '#F8FAFF' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.left, { marginBottom: 6 }]}>Extra costs recorded</Text>
                    {extraItems.map((it, idx) => (
                      <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={[styles.left, { color: '#475569' }]}>{it.label}</Text>
                        <Text style={[styles.right]}>{fmtMoney(it.amt)}</Text>
                      </View>
                    ))}
                    <View style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderColor: BORDER, marginVertical: 6 }} />
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={[styles.left, { fontWeight: '900' }]}>Total extras</Text>
                      <Text style={[styles.right]}>{fmtMoney(extraTotal)}</Text>
                    </View>
                    <Text style={{ color: '#6B7280', fontSize: 11, marginTop: 6 }}>
                      * Extras were added to the first lot on creation. Paying any lot may reduce the overall vendor due depending on backend allocation. Use “Extra Cost” flow to pay a specific extra item by ID.
                    </Text>
                  </View>
                </View>
              )}

              {/* Actions */}
              <View style={[styles.actions, { marginTop: 10 }]}>
                <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={onClose} disabled={submitting}>
                  <Text style={styles.btnGhostText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, submitting ? { opacity: 0.6 } : null]} onPress={onSave} disabled={submitting}>
                  {submitting ? <ActivityIndicator size="small" color="#fff" /> : (<><Feather name="save" size={16} color="#fff" /><Text style={styles.btnTxt}>Save</Text></>)}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      </Modal>

      {/* Image Receipt */}
      <Modal visible={showReceipt} transparent animationType="fade" onRequestClose={() => setShowReceipt(false)}>
        <TouchableWithoutFeedback onPress={() => setShowReceipt(false)}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <View style={styles.paperCenter}>
          <View ref={paperRef} collapsable={false} style={styles.paper}>
            <Text style={styles.paperCompany} numberOfLines={1}>{(companyName || 'Rasiid Bixin-sameeye').toUpperCase()}</Text>
            {!!companyContact && <Text style={styles.paperCompanySub} numberOfLines={1}>{companyContact}</Text>}

            <View style={styles.dots} />
            <Text style={styles.paperTitle}>Vendor Payment Receipt (Multiple)</Text>
            <Text style={styles.paperMeta}>{savedAt ? savedAt.toLocaleString() : new Date().toLocaleString()}</Text>
            <View style={styles.dots} />

            <View style={styles.rowKV}><Text style={styles.k}>Vendor</Text><Text style={styles.v} numberOfLines={1}>{vendorName || '-'}</Text></View>

            <View style={styles.dots} />
            {rows.map(r => {
              const paid = paidMap[r.oilId] || 0;
              const remain = remainMap[r.oilId] ?? r.currentPayable;
              return (
                <View key={`receipt-${r.oilId}`} style={{ marginBottom: 6 }}>
                  <View style={styles.rowKV}><Text style={styles.k}>{r.oilType.toUpperCase()} — PAID</Text><Text style={styles.v}>{fmtMoney(paid)}</Text></View>
                  <View style={styles.rowKV}><Text style={styles.k}>New Payable</Text><Text style={[styles.v, remain > 0 ? styles.vDanger : styles.vOk]}>{fmtMoney(remain)}</Text></View>
                </View>
              );
            })}
            {extraItems.length > 0 && (
              <>
                <View style={styles.dots} />
                <Text style={[styles.k, { marginBottom: 4 }]}>Extra costs recorded</Text>
                {extraItems.map((it, idx) => (
                  <View key={`x-${idx}`} style={styles.rowKV}>
                    <Text style={styles.k}>{it.label}</Text>
                    <Text style={styles.v}>{fmtMoney(it.amt)}</Text>
                  </View>
                ))}
                <View style={styles.rowKV}>
                  <Text style={[styles.k, { fontWeight: '900' }]}>Total extras</Text>
                  <Text style={[styles.v, { fontWeight: '900' }]}>{fmtMoney(extraTotal)}</Text>
                </View>
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
        <TouchableWithoutFeedback onPress={closeShareAndReceipt}>
          <View style={styles.sheetBackdrop} />
        </TouchableWithoutFeedback>
        <View style={[styles.shareSheetContainer, { paddingBottom: Math.max(20, bottomSafe + 6) }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Udir rasiidka</Text>
          <Text style={styles.sheetDesc}>Dooro meesha aad ku wadaagi doonto rasiidka sawirka (PNG) iyo fariinta.</Text>

          <View style={{ gap: 10 }}>
            <TouchableOpacity style={styles.sheetItem} onPress={async () => { await shareImage(); closeShareAndReceipt(); }} activeOpacity={0.9}>
              <View style={[styles.sheetIcon, { backgroundColor: '#F5F7FB' }]}><Feather name="share-2" size={18} color="#0B2447" /></View>
              <View style={{ flex: 1 }}><Text style={styles.sheetItemTitle}>System Share</Text><Text style={styles.sheetItemSub}>Let the device choose an app</Text></View>
              <Feather name="chevron-right" size={18} color="#6B7280" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.sheetItem} onPress={async () => { await shareImage(); await sendWhatsAppText(shareMsg); closeShareAndReceipt(); }} activeOpacity={0.9}>
              <View style={[styles.sheetIcon, { backgroundColor: '#E7F9EF' }]}><FontAwesome name="whatsapp" size={18} color="#25D366" /></View>
              <View style={{ flex: 1 }}><Text style={styles.sheetItemTitle}>WhatsApp</Text><Text style={styles.sheetItemSub}>Share image then open chat with text</Text></View>
              <Feather name="chevron-right" size={18} color="#6B7280" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.sheetItem} onPress={async () => { await shareImage(); await Linking.openURL(`sms:?body=${encodeURIComponent(shareMsg)}`); closeShareAndReceipt(); }} activeOpacity={0.9}>
              <View style={[styles.sheetIcon, { backgroundColor: '#EEF2FF' }]}><Feather name="message-circle" size={18} color="#4F46E5" /></View>
              <View style={{ flex: 1 }}><Text style={styles.sheetItemTitle}>SMS</Text><Text style={styles.sheetItemSub}>Share image via sheet, then prefill SMS</Text></View>
              <Feather name="chevron-right" size={18} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.sheetCancel} onPress={closeShareAndReceipt}><Text style={styles.sheetCancelTxt}>Close</Text></TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

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

  banner: {
    flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#FAFBFF',
    borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12,
  },
  left: { color: MUTED, fontWeight: '700' },
  right: { color: TEXT, fontWeight: '900', maxWidth: 190 },

  rowCard: { borderWidth: 1, borderColor: BORDER, borderRadius: 12, padding: 12, backgroundColor: '#fff' },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  rowTitle: { fontWeight: '900', color: TEXT },
  rowDue: { fontWeight: '800', color: TEXT },

  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingHorizontal: 12, height: 44, color: TEXT },
  quickBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1.5, borderColor: BORDER, backgroundColor: '#EEF2FF', height: 44 },
  quickTxt: { color: '#0B2447', fontWeight: '800', fontSize: 12 },
  hint: { marginTop: 6, fontSize: 12, fontWeight: '700' },

  actions: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, height: 48, borderRadius: 12, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  btnTxt: { color: '#fff', fontWeight: '800' },
  btnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: BORDER },
  btnGhostText: { color: TEXT, fontWeight: '800' },

  // receipt
  paperCenter: { ...StyleSheet.absoluteFillObject, padding: 18, justifyContent: 'center', alignItems: 'center' },
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

  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  shareSheetContainer: {
    position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff', borderTopLeftRadius: 22,
    borderTopRightRadius: 22, paddingHorizontal: 16, paddingTop: 10, borderWidth: 1, borderColor: '#EEF1F6',
  },
  sheetTitle: { fontSize: 16, fontWeight: '900', color: '#111827', textAlign: 'center' },
  sheetDesc: { fontSize: 12, color: '#6B7280', textAlign: 'center', marginTop: 4, marginBottom: 10 },
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
