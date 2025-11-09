// paymentcreatesheet.tsx
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
import { queuePaymentForSync } from './paymentOfflineRepo';

type Props = {
  visible: boolean;
  onClose: () => void;
  token: string | null;
  customerId?: number | null;
  onCreated?: () => void;

  /** For receipt + message */
  customerName?: string | null;
  customerPhone?: string | null;
  companyName?: string | null;
  companyContact?: string | null;

  /** 👇 shown at the top of the sheet + used to prefill */
  currentDue?: number; // USD

  /** offline queue */
  ownerId?: number | null;
  online?: boolean;
};

type Method = 'cash' | 'custom';

const ACCENT = '#576CBC';
const BORDER = '#E5E7EB';
const BG = '#FFFFFF';
const TEXT = '#0B1220';
const MUTED = '#6B7280';

const PAPER_W = 330; // fixed narrow width for nice receipts

export default function PaymentCreateSheet({
  visible,
  onClose,
  token,
  customerId,
  onCreated,
  customerName,
  customerPhone,
  companyName,
  companyContact,
  currentDue = 0,
  ownerId,
  online = true,
}: Props) {
  const insets = useSafeAreaInsets();
  const bottomSafe = insets.bottom || 0;
  const SCREEN_H = Dimensions.get('window').height;
  const SHEET_H = Math.round(SCREEN_H * 0.92);

  const [amount, setAmount] = useState<string>(''); // "Amount to receive"
  const [method, setMethod] = useState<Method>('cash');
  const [customMethod, setCustomMethod] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  // receipt states
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [paidAmt, setPaidAmt] = useState<number>(0);
  const [prevDue, setPrevDue] = useState<number>(currentDue);
  const [newDue, setNewDue] = useState<number>(currentDue);

  const [shareOpen, setShareOpen] = useState(false);
  const [shareMsg, setShareMsg] = useState('');

  const paperRef = useRef<View>(null);

  const authHeader = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    }).format(n || 0);

  const resolvedMethodLabel =
    method === 'cash' ? 'Cash' : (customMethod?.trim() || 'Custom');

  // --- slide animation
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

  const close = () => {
    if (submitting) return;
    onClose();
  };

  /** Prefill & sync the form whenever the sheet opens or due changes */
  useEffect(() => {
    if (visible) {
      const due = Number.isFinite(currentDue) ? currentDue : 0;
      setPrevDue(due);
      setNewDue(due);
      // prefill "Amount to receive" with the due (rounded to 2dp), but empty if no due
      setAmount(due > 0 ? (Math.round(due * 100) / 100).toFixed(2) : '');
      // default to Cash when opening; keep custom text but not selected
      setMethod('cash');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, currentDue]);

  /** Live computed numbers from the typed amount */
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
  const remainingPreview = Math.max(0, (currentDue || 0) - typedAmt);
  const isOverpay = typedAmt > (currentDue || 0);

  /** Somali share message */
  const buildShareMessage = (paid: number, remain: number) => {
    const paidStr = fmtMoney(paid);
    const remainStr = fmtMoney(Math.max(0, remain));
    if (remain > 0) {
      return `macamiil waxaad bixisay ${paidStr}. waxaa kugu dhiman ${remainStr}.`;
    }
    return `macamiil waxaad bixisay ${paidStr}. Mahadsanid, dhammaan lacagta waa la bixiyay.`;
  };

  async function sendWhatsAppText(phoneRaw: string | undefined, text: string) {
    const digits = (phoneRaw || '').replace(/[^\d]/g, '');
    theMsg: {
      const msg = encodeURIComponent(text || '');
      const deepLink = `whatsapp://send?phone=${digits}&text=${msg}`;
      const webLink = `https://wa.me/${digits}?text=${msg}`;
      const canDeep = await Linking.canOpenURL('whatsapp://send');
      if (canDeep) {
        try {
          await Linking.openURL(deepLink);
          break theMsg;
        } catch {}
      }
      const canWeb = await Linking.canOpenURL(webLink);
      if (canWeb) {
        try {
          await Linking.openURL(webLink);
        } catch {}
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
      fileName: 'payment_receipt',
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
            const remain = newDue;
            const msg = buildShareMessage(paidAmt, remain);
            setShareMsg(msg);
            setShareOpen(true);
          }
        } catch (e: any) {
          console.warn('Receipt capture failed:', e?.message || e);
        }
      }, 180);
    }
    return () => {
      if (t) clearTimeout(t);
    };
  }, [showReceipt, newDue, paidAmt]);

 const onSave = async () => {
  if (!customerId) return Alert.alert('Fadlan', 'Macmiilka lama helin.');
  const amtNum = sanitizeAmountToNumber(amount);
  if (!(amtNum > 0)) return Alert.alert('Fadlan', 'Geli lacag sax ah (ka weyn 0).');

  // Clamp overpay to due (never create negative balances)
  const dueNow = Math.max(0, currentDue || 0);
  const payAmount = Math.min(amtNum, dueNow);

  if (amtNum > dueNow && dueNow > 0) {
    Alert.alert(
      'Overpayment adjusted',
      `Waxaad gelisay ${fmtMoney(amtNum)}, balse kugu dhiman waa ${fmtMoney(
        dueNow
      )}. Waxaan kuu qaadanay ${fmtMoney(payAmount)}.`
    );
  }
  if (dueNow === 0) {
    Alert.alert('No amount due', 'Macmiilkan lama laha wax deyn ah.');
    return;
  }

  const paymentMethod =
    method === 'cash' ? 'cash' : (customMethod.trim() || 'custom');

  const payload = {
    amount: payAmount,
    customer_id: customerId,
    payment_method: paymentMethod,
  };

  setSubmitting(true);
  try {
    let handledOffline = false;

    // 1) If we *believe* we are online and have token → try API
    if (online && token) {
      try {
        await api.post('/diiwaanpayments', payload, { headers: authHeader });
      } catch (e: any) {
        const isNetworkError = !e?.response; // no HTTP response → likely offline / network
        if (ownerId && isNetworkError) {
          // ✅ fallback to offline queue instead of showing network error popup
          queuePaymentForSync(ownerId, payload);
          handledOffline = true;
          Alert.alert(
            'Offline mode',
            'Internet ma jiro. Bixinta waxaa lagu kaydiyay offline, waxaana lala sync-gareyn doonaa marka aad online noqoto.'
          );
        } else {
          // real server error – rethrow so catch below handles it
          throw e;
        }
      }
    } else {
      // 2) Clearly offline (or no token) → queue directly
      if (!ownerId) {
        Alert.alert(
          'Offline payment',
          'Owner ID lama helin, lama kaydin karo bixinta offline.'
        );
        return;
      }
      queuePaymentForSync(ownerId, payload);
      handledOffline = true;
      Alert.alert(
        'Offline mode',
        'Bixinta ayaa offline loogu kaydiyay. Waxaa lala sync-gareyn doonaa marka aad online noqoto.'
      );
    }

    // If we reached here, either:
    // - online API succeeded, OR
    // - we queued offline successfully.
    const remain = Math.max(0, dueNow - payAmount);
    setPaidAmt(payAmount);
    setPrevDue(dueNow);
    setNewDue(remain);
    setSavedAt(new Date());

    onCreated?.();

    // reset inputs
    setAmount('');
    setMethod('cash');

    onClose();            // close form
    setShowReceipt(true); // open receipt
  } catch (e: any) {
    // Only show this for *real* failures (not network fallback)
    Alert.alert(
      'Error',
      String(e?.response?.data?.detail || e?.message || 'Save failed.')
    );
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

  const shareViaWhatsApp = async () => {
    await shareImage();
    await sendWhatsAppText(customerPhone || undefined, shareMsg);
    closeShareAndReceipt();
  };
  const shareViaSms = async () => {
    await shareImage();
    await sendSmsText(shareMsg);
    closeShareAndReceipt();
  };

  return (
    <>
      {/* Bottom Sheet: Create Payment */}
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        presentationStyle="overFullScreen"
        onRequestClose={close}
      >
        <TouchableWithoutFeedback onPress={close}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <Animated.View
          style={[
            styles.sheetWrap,
            { height: SHEET_H, transform: [{ translateY: slideY }] },
          ]}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 18 : 0}
            style={{ flex: 1 }}
          >
            <View
              style={[
                styles.sheetCard,
                { paddingBottom: Math.max(16, bottomSafe) },
              ]}
            >
              <View style={styles.sheetHandle} />
              <Text style={styles.title}>Bixi deyn</Text>

              {/* 👉 DUE banner */}
              <View style={dueStyles.banner}>
                <Text style={dueStyles.left}>Amount due</Text>
                <Text style={dueStyles.right}>
                  {fmtMoney(Math.max(0, currentDue || 0))}
                </Text>
              </View>

              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 18 }}
              >
                {/* Amount to receive */}
                <View style={styles.row}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={styles.label}>Amount to receive</Text>
                    <TouchableOpacity
                      onPress={() =>
                        setAmount(
                          (
                            Math.round(
                              Math.max(0, currentDue || 0) * 100
                            ) / 100
                          ).toFixed(2)
                        )
                      }
                      style={dueStyles.quickFill}
                      activeOpacity={0.8}
                    >
                      <Feather name="zap" size={14} color="#0B2447" />
                      <Text style={dueStyles.quickFillTxt}>Full due</Text>
                    </TouchableOpacity>
                  </View>

                  <TextInput
                    key={visible ? 'amount-open' : 'amount-closed'}
                    value={amount}
                    onChangeText={(t) => setAmount(sanitizeAmount(t))}
                    textContentType="none"
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="0.00"
                    placeholderTextColor="#9CA3AF"
                    style={[
                      styles.input,
                      isOverpay && {
                        borderColor: '#FCA5A5',
                        backgroundColor: '#FFF7F7',
                      },
                    ]}
                    maxLength={18}
                  />
                  {/* live helper */}
                  <Text
                    style={{
                      marginTop: 6,
                      fontSize: 12,
                      fontWeight: '700',
                      color: isOverpay ? '#DC2626' : '#059669',
                    }}
                  >
                    {isOverpay
                      ? `Over by ${fmtMoney(
                          typedAmt - Math.max(0, currentDue || 0)
                        )} (will be adjusted)`
                      : `Remaining after receive: ${fmtMoney(
                          remainingPreview
                        )}`}
                  </Text>
                </View>

                {/* Method: Cash or your own */}
                <View style={styles.row}>
                  <Text style={styles.label}>Method</Text>

                  {/* Cash pill */}
                  <View
                    style={{
                      flexDirection: 'row',
                      gap: 8,
                      alignItems: 'center',
                      marginBottom: 8,
                    }}
                  >
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setMethod('cash')}
                      style={[
                        methodPillStyles.pill,
                        method === 'cash' ? methodPillStyles.pillActive : null,
                      ]}
                    >
                      <Feather
                        name="dollar-sign"
                        size={16}
                        color={method === 'cash' ? '#fff' : TEXT}
                      />
                      <Text
                        style={[
                          methodPillStyles.pillTxt,
                          method === 'cash' ? { color: '#fff' } : null,
                        ]}
                      >
                        Cash
                      </Text>
                    </TouchableOpacity>

                    {/* Other method input */}
                    <View style={{ flex: 1 }}>
                      <TextInput
                        value={customMethod}
                        onChangeText={(t) => {
                          setCustomMethod(t);
                          if (t.trim().length > 0) setMethod('custom');
                          else setMethod('cash');
                        }}
                        placeholder="Other (e.g., Bank Transfer, Mobile)"
                        placeholderTextColor="#9CA3AF"
                        style={styles.input}
                      />
                      <Text
                        style={{
                          color: MUTED,
                          fontSize: 11,
                          marginTop: 4,
                        }}
                      >
                        If filled, this will be used instead of Cash.
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Actions */}
                <View style={[styles.actions, { marginTop: 0 }]}>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnGhost]}
                    onPress={close}
                    disabled={submitting}
                  >
                    <Text style={styles.btnGhostText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, submitting ? { opacity: 0.6 } : null]}
                    onPress={onSave}
                    disabled={submitting || !customerId}
                  >
                    {submitting ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Feather name="save" size={16} color="#fff" />
                        <Text style={styles.btnTxt}>Save</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      </Modal>

      {/* IMAGE-ONLY Receipt Popup */}
      <Modal
        visible={showReceipt}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReceipt(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowReceipt(false)}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <View style={styles.paperCenter}>
          <View style={styles.paperNotchLeft} />
          <View style={styles.paperNotchRight} />

          <View ref={paperRef} collapsable={false} style={styles.paper}>
            <Text style={styles.paperCompany} numberOfLines={1}>
              {(companyName || 'Rasiid Lacag-bixin').toUpperCase()}
            </Text>
            {!!companyContact && (
              <Text style={styles.paperCompanySub} numberOfLines={1}>
                {companyContact}
              </Text>
            )}

            <View style={styles.dots} />

            <Text style={styles.paperTitle}>Payment Receipt</Text>
            <Text style={styles.paperMeta}>
              {savedAt ? savedAt.toLocaleString() : new Date().toLocaleString()}
            </Text>

            <View style={styles.dots} />

            <View style={styles.rowKV}>
              <Text style={styles.k}>Customer</Text>
              <Text style={styles.v} numberOfLines={1}>
                {customerName || '-'}
              </Text>
            </View>
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
              <Text style={styles.k}>Previous Due</Text>
              <Text style={styles.v}>{fmtMoney(prevDue)}</Text>
            </View>
            <View style={styles.rowKV}>
              <Text style={styles.k}>New Balance</Text>
              <Text style={[styles.v, newDue > 0 ? styles.vDanger : styles.vOk]}>
                {fmtMoney(newDue)}
              </Text>
            </View>

            <View style={styles.dots} />

            <Text style={styles.footerThanks}>Mahadsanid!</Text>
            <Text style={styles.footerFine}>
              Rasiidkan waa caddeyn bixinta lacagta. Fadlan la xiriir haddii aad
              qabtid su’aal.
            </Text>
          </View>
        </View>
      </Modal>

      {/* Modern Share Chooser */}
      <Modal
        visible={shareOpen}
        transparent
        animationType="slide"
        onRequestClose={closeShareAndReceipt}
      >
        <TouchableWithoutFeedback onPress={closeShareAndReceipt}>
          <View style={styles.sheetBackdrop} />
        </TouchableWithoutFeedback>
        <View
          style={[
            styles.shareSheetContainer,
            { paddingBottom: Math.max(20, bottomSafe + 6) },
          ]}
        >
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Udir rasiidka</Text>
          <Text style={styles.sheetDesc}>
            Dooro meesha aad ku wadaagi doonto rasiidka sawirka (PNG) iyo
            fariinta.
          </Text>

          <View style={styles.sheetList}>
            <TouchableOpacity
              style={styles.sheetItem}
              onPress={shareViaWhatsApp}
              activeOpacity={0.9}
            >
              <View
                style={[styles.sheetIcon, { backgroundColor: '#E7F9EF' }]}
              >
                <FontAwesome name="whatsapp" size={18} color="#25D366" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetItemTitle}>WhatsApp</Text>
                <Text style={styles.sheetItemSub}>
                  Share image then open chat with text
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color="#6B7280" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetItem}
              onPress={shareViaSms}
              activeOpacity={0.9}
            >
              <View
                style={[styles.sheetIcon, { backgroundColor: '#EEF2FF' }]}
              >
                <Feather name="message-circle" size={18} color="#4F46E5" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetItemTitle}>SMS</Text>
                <Text style={styles.sheetItemSub}>
                  Share image via sheet, then prefill SMS
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color="#6B7280" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetItem}
              onPress={async () => {
                await shareImage();
                closeShareAndReceipt();
              }}
              activeOpacity={0.9}
            >
              <View
                style={[styles.sheetIcon, { backgroundColor: '#F5F7FB' }]}
              >
                <Feather name="share-2" size={18} color="#0B2447" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetItemTitle}>System Share</Text>
                <Text style={styles.sheetItemSub}>
                  Let the device choose an app
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.sheetCancel}
            onPress={closeShareAndReceipt}
          >
            <Text style={styles.sheetCancelTxt}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

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

/* keep your existing styles below (unchanged) */
const styles = StyleSheet.create({
  // --- Shared Backdrop ---
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheetCard: {
    flex: 1,
    backgroundColor: BG,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: BORDER,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: -8 },
    shadowRadius: 16,
    elevation: 20,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 46,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#E5E7EB',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10,
    color: TEXT,
    textAlign: 'center',
  },
  row: { marginBottom: 14 },
  label: { fontWeight: '700', color: TEXT, marginBottom: 6 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    color: TEXT,
  },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectText: { color: TEXT, fontWeight: '600' },
  menu: {
    position: 'absolute',
    top: 52,
    left: 0,
    right: 0,
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 16,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 12,
    zIndex: 50,
  },
  menuItem: { paddingVertical: 12, paddingHorizontal: 12 },
  menuItemText: { color: TEXT, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10 },
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

  // receipt popup & share styles
  paperCenter: {
    ...StyleSheet.absoluteFillObject,
    padding: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  paperNotchLeft: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(0,0,0,0.05)',
    left: '50%',
    marginLeft: -(PAPER_W / 2) - 7,
    top: '20%',
  },
  paperNotchRight: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(0,0,0,0.05)',
    right: '50%',
    marginRight: -(PAPER_W / 2) - 7,
    bottom: '22%',
  },
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
  paperCompany: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '900',
    color: TEXT,
  },
  paperCompanySub: {
    textAlign: 'center',
    fontSize: 11,
    color: MUTED,
    marginTop: 2,
  },
  paperTitle: {
    textAlign: 'center',
    fontSize: 13,
    color: '#475569',
    fontWeight: '800',
    marginTop: 2,
  },
  paperMeta: {
    textAlign: 'center',
    fontSize: 11,
    color: MUTED,
    marginTop: 2,
  },
  dots: {
    borderBottomWidth: 1,
    borderStyle: 'dotted',
    borderColor: '#C7D2FE',
    marginVertical: 10,
  },
  rowKV: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  k: { color: '#475569', fontSize: 12, fontWeight: '700' },
  v: { color: TEXT, fontSize: 12, fontWeight: '800' },
  vDanger: { color: '#DC2626' },
  vOk: { color: '#059669' },
  amountBlock: { alignItems: 'center', marginVertical: 4 },
  amountLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '700',
    marginBottom: 2,
  },
  amountValue: { fontSize: 20, fontWeight: '900', color: '#059669' },
  noteLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  noteText: { color: TEXT, fontSize: 12, lineHeight: 16 },
  footerThanks: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '900',
    color: TEXT,
    marginTop: 8,
  },
  footerFine: {
    textAlign: 'center',
    fontSize: 11,
    color: MUTED,
    marginTop: 4,
  },

  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
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
  sheetTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
  },
  sheetDesc: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 10,
  },
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
  sheetIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetItemTitle: { fontSize: 14, fontWeight: '800', color: '#0B1220' },
  sheetItemSub: { fontSize: 11, color: '#6B7280' },
  sheetCancel: {
    marginTop: 12,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  sheetCancelTxt: { fontWeight: '800', color: '#6B7280' },
});
