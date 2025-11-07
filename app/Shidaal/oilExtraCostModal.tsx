// OilExtraCostModal.tsx
import api from '@/services/api';
import { useAuth } from '@/src/context/AuthContext';
import VendorPaymentCreateSheet from './vendorpayment';

import { Feather } from '@expo/vector-icons';
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/* ──────────────────────────────────────────────────────────
   Layout & Colors
────────────────────────────────────────────────────────── */
const COLOR_BG = '#FFFFFF';
const COLOR_TEXT = '#0B1221';
const COLOR_SUB = '#475569';
const COLOR_PLACEHOLDER = '#64748B';
const COLOR_BORDER = '#94A3B8';
const COLOR_BORDER_FOCUS = '#0F172A';
const COLOR_DIVIDER = '#E5E7EB';
const COLOR_INPUT_BG = '#FFFFFF';
const COLOR_ACCENT = '#0F172A';
const COLOR_ERROR = '#DC2626';

type CurrencyKey = 'USD' | 'shimaal' | 'junuubi';
const CURRENCY_OPTIONS: { label: string; key: CurrencyKey; code: string; symbol: string }[] = [
  { label: 'USD (US Dollar)', key: 'USD', code: 'USD', symbol: '$' },
  { label: 'Shimaal', key: 'shimaal', code: 'SOS', symbol: 'Sh' },
  { label: 'Junuubi', key: 'junuubi', code: 'JNB', symbol: 'J' },
];

/* ──────────────────────────────────────────────────────────
   Types
────────────────────────────────────────────────────────── */
type OilRead = {
  id: number;
  currency: string;
  oil_type: string;
  liters: number;
  oil_total_cost?: number | null;
  total_landed_cost?: number | null;
  tax?: number | null;
  oil_well?: string | null;
  supplier_name?: string | null;
  oil_well_cost: number;
};

type SupplierDueItem = {
  supplier_name: string;
  oil_id: number | null;
  extra_costs?: Array<{
    id: number;
    due: number;
  }>;
};
type SupplierDueResponse = { items: SupplierDueItem[] };

/* ──────────────────────────────────────────────────────────
   Floating Input
   - Label acts as placeholder.
   - On focus or when value exists -> label moves into the border line.
   - When not editable and user taps -> onGuard fires to show inline error.
────────────────────────────────────────────────────────── */
type FloatingInputProps = {
  label: string;
  value: string;
  onChangeText?: (t: string) => void;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
  editable?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  onGuard?: () => void; // called when user tries to interact while disabled
  testID?: string;
  error?: string | null;
};

const FloatingInput = forwardRef<TextInput, FloatingInputProps>(function FI(
  {
    label,
    value,
    onChangeText,
    keyboardType = 'default',
    editable = true,
    onFocus,
    onBlur,
    onGuard,
    testID,
    error,
  },
  ref
) {
  const [focused, setFocused] = useState(false);
  const active = focused || (value?.length ?? 0) > 0;

  return (
    <View style={{ marginBottom: error ? 4 : 14 }}>
      <View
        style={[
          styles.floatWrap,
          (focused || active) && styles.floatWrapFocused,
          !editable && styles.inputDisabled,
          error && { borderColor: COLOR_ERROR },
        ]}
      >
        {/* Label chip only when active (focused or has value) */}
        {active && (
          <View style={[styles.labelChipHolder, { backgroundColor: COLOR_BG }]} pointerEvents="none">
            <Text
              style={[
                styles.labelChipText,
                { color: error ? COLOR_ERROR : COLOR_BORDER_FOCUS, fontWeight: '800' },
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </View>
        )}

        {/* Input. Placeholder shows the label when not active */}
        <TextInput
          ref={ref}
          testID={testID}
          style={[styles.inputBase, styles.inputPadded]}
          value={value}
          onChangeText={onChangeText}
          editable={editable}
          keyboardType={keyboardType}
          placeholder={active ? '' : label}
          placeholderTextColor={COLOR_PLACEHOLDER}
          onFocus={() => {
            if (!editable) return;
            setFocused(true);
            onFocus?.();
          }}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
        />

        {/* Invisible overlay to capture taps on disabled fields and trigger guard */}
        {!editable && (
          <Pressable
            onPress={onGuard}
            style={{ ...StyleSheet.absoluteFillObject, borderRadius: 12 }}
            android_ripple={undefined}
          />
        )}
      </View>

      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
});

/* ──────────────────────────────────────────────────────────
   Currency Button + Popup
   - Shows "Select" by default until chosen.
   - When disabled and tapped -> shows guard error for prerequisite field.
────────────────────────────────────────────────────────── */
function CurrencyButton({
  value,
  onPress,
  disabled,
  error,
}: {
  value?: CurrencyKey;
  onPress: () => void;
  disabled?: boolean;
  error?: string | null;
}) {
  const curr = CURRENCY_OPTIONS.find((c) => c.key === value);
  const label = curr ? curr.label.split(' ')[0] : 'Select';

  return (
    <View style={{ marginBottom: error ? 4 : 14 }}>
      <View
        style={[
          styles.floatWrap,
          styles.floatWrapFocused, // keep focused color for consistency with chip label
          disabled && styles.inputDisabled,
          error && { borderColor: COLOR_ERROR },
        ]}
      >
        <View style={[styles.labelChipHolder, { backgroundColor: COLOR_BG }]} pointerEvents="none">
          <Text
            style={[
              styles.labelChipText,
              { color: error ? COLOR_ERROR : COLOR_BORDER_FOCUS, fontWeight: '800' },
            ]}
          >
            Currency
          </Text>
        </View>

        <TouchableOpacity
          activeOpacity={disabled ? 1 : 0.85}
          onPress={() => {
            if (disabled) return;
            onPress();
          }}
          style={[styles.inputBase, styles.inputPadded]}
        >
          <Text
            numberOfLines={1}
            style={[
              styles.inputText,
              { fontSize: 14, color: curr ? COLOR_TEXT : COLOR_PLACEHOLDER },
            ]}
          >
            {label}
          </Text>
          <Feather name="chevron-down" size={16} color={COLOR_TEXT} />
        </TouchableOpacity>
      </View>

      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

function CurrencyPopup({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (k: CurrencyKey) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.popupBackdrop} />
      </TouchableWithoutFeedback>

      <View style={styles.popupCard}>
        <Text style={styles.popupTitle}>Select currency</Text>
        <View style={styles.popupList}>
          {CURRENCY_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={styles.popupItem}
              activeOpacity={0.85}
              onPress={() => {
                onSelect(opt.key);
                onClose();
              }}
            >
              <Text style={styles.popupItemText}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.popupClose} onPress={onClose} activeOpacity={0.9}>
          <Text style={styles.popupCloseTxt}>Close</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

/* ──────────────────────────────────────────────────────────
   Component
────────────────────────────────────────────────────────── */
export default function OilExtraCostModal({
  visible,
  onClose,
  oilId,
  lotId,
}: {
  visible: boolean;
  onClose: () => void;
  oilId?: number;
  lotId?: number;
}) {

  const { token } = useAuth();
  const anchorId = oilId ?? lotId;


  // safe area + sheet geometry + slide animation
  const insets = useSafeAreaInsets();
  const bottomSafe = insets.bottom || 0;
  const SCREEN_H = Dimensions.get('window').height;
  const SHEET_H = Math.round(SCREEN_H * 0.92);
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

  // Oil summary
  const [oil, setOil] = useState<OilRead | null>(null);

  // Form state
  const [categoryName, setCategoryName] = useState('');
  const [currencyKey, setCurrencyKey] = useState<CurrencyKey | undefined>(undefined); // default: Select
  const currencyObj = CURRENCY_OPTIONS.find((c) => c.key === currencyKey);
  const symbol = currencyObj?.symbol || '';

  const [exchangeToUSD, setExchangeToUSD] = useState(''); // if non-USD
  const [perBarrel, setPerBarrel] = useState('');
  const [qtyBarrel, setQtyBarrel] = useState('');
  const isLotContext = !!lotId;


  // Inline errors
  const [errCategory, setErrCategory] = useState<string | null>(null);
  const [errCurrency, setErrCurrency] = useState<string | null>(null);
  const [errRate, setErrRate] = useState<string | null>(null);
  const [errPerBarrel, setErrPerBarrel] = useState<string | null>(null);
  const [errQty, setErrQty] = useState<string | null>(null);

  // gating (sequential enable)
  const hasCategory = (categoryName || '').trim().length > 0;
  const canPickCurrency = hasCategory;
  const needsRate = currencyKey && currencyKey !== 'USD';
  const rateVal = parseFloat(exchangeToUSD.replace(',', '.')) || 0;
  const rateOk = !needsRate || rateVal > 0;
  const perB = parseFloat(perBarrel.replace(',', '.')) || 0;
  const perOk = perB > 0;
  const qty = Math.max(parseInt(qtyBarrel || '0', 10) || 0, 0);
  const qtyOk = qty > 0;

  const canEditRate = canPickCurrency && !!currencyKey && needsRate;
  const canEditPerBarrel = canPickCurrency && !!currencyKey && (!needsRate || rateOk);
  const canEditQty = canEditPerBarrel && perOk;

  // derived totals
  const totalInSelected = useMemo(() => {
    const n = perB * qty;
    return isFinite(n) ? n : 0;
  }, [perB, qty]);

  const totalInUSD = useMemo(() => {
    if (!currencyKey) return 0;
    if (currencyKey === 'USD') return totalInSelected;
    if (!(rateVal > 0)) return 0;
    return totalInSelected / rateVal;
  }, [totalInSelected, rateVal, currencyKey]);

  // currency popup
  const [showCurrencyPopup, setShowCurrencyPopup] = useState(false);

  // Payment integration
  const [createdExtraId, setCreatedExtraId] = useState<number | null>(null);
  const [showPayPrompt, setShowPayPrompt] = useState(false);
  const [showVendorSheet, setShowVendorSheet] = useState(false);
  const [currentPayable, setCurrentPayable] = useState(0);
  const [vendorNameOverride, setVendorNameOverride] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const authHeader = token ? { Authorization: `Bearer ${token}` } : undefined;

  // numeric filters
  const toDecimal = (s: string) => {
    let out = s.replace(/[^0-9.]/g, '');
    const firstDot = out.indexOf('.');
    if (firstDot !== -1) out = out.slice(0, firstDot + 1) + out.slice(firstDot + 1).replace(/\./g, '');
    return out;
  };
  const toInt = (s: string) => s.replace(/[^0-9]/g, '');

  const loadOil = async () => {
    if (!oilId) return;
    try {
      setLoading(true);
      const oilRes = await api.get(`/diiwaanoil/${oilId}`, { headers: authHeader });
      const oilData: OilRead = oilRes?.data || null;
      setOil(oilData);

      const prefer =
        (oilData?.oil_well && String(oilData.oil_well).trim()) ||
        (oilData?.supplier_name && String(oilData.supplier_name).trim()) ||
        null;
      setVendorNameOverride(prefer);

      // default currency to oil's if present (still show "Select" if none)
      const oilCur = String(oilData?.currency || '').toUpperCase();
      const found = CURRENCY_OPTIONS.find((c) => c.code === oilCur);
      if (found) setCurrencyKey(found.key);
    } catch {
      // noop
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      clearForm();
      loadOil();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, oilId, lotId]);


  const clearErrors = () => {
    setErrCategory(null);
    setErrCurrency(null);
    setErrRate(null);
    setErrPerBarrel(null);
    setErrQty(null);
  };

  const clearForm = () => {
    setExchangeToUSD('');
    setPerBarrel('');
    setQtyBarrel('');
    setCategoryName('');
    setCreatedExtraId(null);
    setShowPayPrompt(false);
    setShowVendorSheet(false);
    setCurrentPayable(0);
    clearErrors();
  };

  // Guard helpers (called when user tries to move out-of-order)
  const guardCurrency = () => {
    if (!hasCategory) {
      setErrCategory('Required');
      return false;
    }
    return true;
  };

  const guardRate = () => {
    if (!currencyKey) {
      setErrCurrency('Please select a currency');
      return false;
    }
    if (needsRate && !(rateVal > 0)) {
      setErrRate('Enter a valid exchange rate');
      return false;
    }
    return true;
  };

  const guardPerBarrel = () => {
    if (!guardCurrency()) return false;
    if (!guardRate()) return false;
    return true;
  };

  const guardQty = () => {
    if (!guardPerBarrel()) return false;
    if (!(perB > 0)) {
      setErrPerBarrel('Enter amount per barrel');
      return false;
    }
    return true;
  };

  // Optional (refresh due from server later if needed)
  const fetchExtraDue = async (extraId: number) => {
    try {
      const params = isLotContext
        ? { lot_id: lotId, only_with_payments_q: 'false' }
        : { oil_id: oilId, only_with_payments_q: 'false' };

      const r = await api.get<SupplierDueResponse>(`/diiwaanvendorpayments/supplier-dues`, {
        headers: authHeader,
        params,
      });

      const items = r?.data?.items || [];
      const one = isLotContext
        ? items.find((it: any) => it.lot_id === lotId)
        : items.find((it: any) => it.oil_id === oilId);

      const ecList = (one?.extra_costs || []) as SupplierDueItem['extra_costs'];
      const match = ecList?.find((ec) => ec.id === extraId);
      return Number(match?.due || 0);
    } catch {
      return 0;
    }
  };


  // Submit: send category and amount in USD
  const submitCreate = async () => {
    clearErrors();
    let ok = true;

    if (!hasCategory) {
      setErrCategory('Required');
      ok = false;
    }
    if (!currencyKey) {
      setErrCurrency('Please select a currency');
      ok = false;
    }
    if (currencyKey && currencyKey !== 'USD' && !(rateVal > 0)) {
      setErrRate('Enter a valid exchange rate');
      ok = false;
    }
    if (!(perB > 0)) {
      setErrPerBarrel('Enter amount per barrel');
      ok = false;
    }
    if (!(qty > 0)) {
      setErrQty('Enter quantity of barrels');
      ok = false;
    }

    if (!ok) return;

    const finalCategory = `${categoryName.trim()}-${qty}-barrel`;
    const amountUSD = Number.isFinite(totalInUSD) ? totalInUSD : 0;
    if (!(amountUSD > 0)) {
      setErrPerBarrel('Check values (total must be > 0)');
      return;
    }

    const payload = {
      category: finalCategory,
      amount: amountUSD, // USD sent to backend
    };

    try {
      setLoading(true);
      if (!anchorId) return;
      const res = await api.post(`/diiwaanoil/${anchorId}/extra-costs`, payload, { headers: authHeader });

      clearForm();
      const newId: number | undefined = res?.data?.id;

      setCreatedExtraId(newId ?? null);
      setCurrentPayable(amountUSD);
      setShowPayPrompt(true);
    } catch {
      // optional: toast
    } finally {
      setLoading(false);
    }
  };

  // Manual close should also dismiss prompt/sheets
  const handleCloseAll = () => {
    setShowPayPrompt(false);
    setShowVendorSheet(false);
    onClose();
  };

  const selectedCurrencyName = currencyObj?.label?.split(' ')[0] || 'Currency';
  const totalSelectedLabel = `Total in ${selectedCurrencyName}`;

  return (
    <>
      {/* Bottom Sheet */}
      <Modal visible={visible} animationType="slide" onRequestClose={handleCloseAll} transparent>
        {/* backdrop */}
        <TouchableWithoutFeedback onPress={handleCloseAll}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <Animated.View style={[styles.sheetWrapAbs, { height: SHEET_H, transform: [{ translateY: slideY }] }]}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 18 : 0}
            style={{ flex: 1 }}
          >
            <View style={[styles.sheetCard, { paddingBottom: Math.max(16, bottomSafe) }]}>
              <View style={styles.sheetHandle} />

              {/* Header */}
              <View style={styles.headerRow}>
                <Text style={styles.titleCenter}>Extra Oil Costs</Text>
                <TouchableOpacity
                  onPress={handleCloseAll}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.closeBtn}
                >
                  <Feather name="x" size={20} color={COLOR_TEXT} />
                </TouchableOpacity>
              </View>

              {/* Content: fully scrollable */}
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.scrollBody}
                showsVerticalScrollIndicator
                bounces
              >
                {/* push the first row down a bit */}
                <View style={{ height: 10 }} />

                {/* Row: Other charges name + Currency (equal width) */}
                <View style={styles.row2}>
                  <View style={styles.col}>
                    <FloatingInput
                      label="Other charges name"
                      value={categoryName}
                      onChangeText={(t) => {
                        setCategoryName(t);
                        if (t.trim().length > 0) setErrCategory(null);
                      }}
                      editable={true}
                      error={errCategory}
                    />
                  </View>
                  <View style={styles.col}>
                    <CurrencyButton
                      value={currencyKey}
                      disabled={!canPickCurrency}
                      onPress={() => {
                        setErrCurrency(null);
                        setShowCurrencyPopup(true);
                      }}
                      error={errCurrency}
                    />
                  </View>
                </View>

                {/* Exchange rate to $1 — only when NOT USD (and after currency) */}
                {currencyKey && currencyKey !== 'USD' ? (
                  <FloatingInput
                    label={`Exchange rate to $1 (${(currencyObj?.label || 'Currency').split(' ')[0]} per $1)`}
                    value={exchangeToUSD}
                    onChangeText={(t) => {
                      const v = toDecimal(t);
                      setExchangeToUSD(v);
                      if ((parseFloat(v || '0') || 0) > 0) setErrRate(null);
                    }}
                    keyboardType="decimal-pad"
                    editable={canEditRate}
                    onGuard={() => {
                      // user tapped while disabled
                      if (!hasCategory) setErrCategory('Required');
                      else if (!currencyKey) setErrCurrency('Please select a currency');
                    }}
                    error={errRate}
                  />
                ) : null}

                {/* Amount per barrel + Qty */}
                <View style={styles.row2}>
                  <View style={styles.col}>
                    <FloatingInput
                      label={`Amount per barrel (${symbol || ''})`}
                      value={perBarrel}
                      onChangeText={(t) => {
                        const v = toDecimal(t);
                        setPerBarrel(v);
                        if ((parseFloat(v || '0') || 0) > 0) setErrPerBarrel(null);
                      }}
                      keyboardType="decimal-pad"
                      editable={canEditPerBarrel}
                      onGuard={() => {
                        if (!guardPerBarrel()) return;
                      }}
                      error={errPerBarrel}
                    />
                  </View>
                  <View style={styles.col}>
                    <FloatingInput
                      label="Qty (barrels)"
                      value={qtyBarrel}
                      onChangeText={(t) => {
                        const v = toInt(t);
                        setQtyBarrel(v);
                        if ((parseInt(v || '0', 10) || 0) > 0) setErrQty(null);
                      }}
                      keyboardType="number-pad"
                      editable={canEditQty}
                      onGuard={() => {
                        if (!guardQty()) return;
                      }}
                      error={errQty}
                    />
                  </View>
                </View>

                {/* Computed totals */}
                <View style={styles.summaryCard}>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryKey}>{totalSelectedLabel}</Text>
                    <Text style={styles.summaryVal}>
                      {symbol} {Number(totalInSelected || 0).toFixed(2)}
                    </Text>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryKey, { fontWeight: '800' }]}>≈ Total in USD</Text>
                    <Text style={[styles.summaryVal, { fontWeight: '800' }]}>
                      ${Number(totalInUSD || 0).toFixed(2)}
                    </Text>
                  </View>

                 
                </View>

                {/* Submit */}
                <TouchableOpacity
                  style={[
                    styles.submitBtn,
                    loading && { opacity: 0.7 },
                    (!hasCategory ||
                      !currencyKey ||
                      (currencyKey !== 'USD' && !(rateVal > 0)) ||
                      !perOk ||
                      !qtyOk) && { opacity: 0.5 },
                  ]}
                  onPress={submitCreate}
                  disabled={
                    loading ||
                    !hasCategory ||
                    !currencyKey ||
                    (currencyKey !== 'USD' && !(rateVal > 0)) ||
                    !perOk ||
                    !qtyOk
                  }
                  activeOpacity={0.9}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Feather name="plus-circle" size={16} color="#fff" style={{ marginRight: 6 }} />
                      <Text style={styles.submitText}>Add cost</Text>
                    </>
                  )}
                </TouchableOpacity>

                <View style={{ height: 18 }} />
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      </Modal>

      {/* Currency Popup */}
      <CurrencyPopup
        visible={showCurrencyPopup}
        onClose={() => setShowCurrencyPopup(false)}
        onSelect={(k) => {
          setCurrencyKey(k);
          setErrCurrency(null);
          // reset rate if switching to USD
          if (k === 'USD') {
            setExchangeToUSD('');
            setErrRate(null);
          }
        }}
      />

      {/* Pay Now? prompt */}
      <Modal
        visible={showPayPrompt}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowPayPrompt(false);
          onClose();
        }}
      >
        <TouchableWithoutFeedback
          onPress={() => {
            setShowPayPrompt(false);
            onClose();
          }}
        >
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <View style={styles.payPromptCard}>
          <Text style={styles.payPromptTitle}>Pay vendor now?</Text>

          <View style={styles.payRow}>
            <Text style={styles.payLabel}>Total (USD)</Text>
            <Text style={styles.payValue}>${Number(currentPayable || 0).toFixed(2)}</Text>
          </View>

          <Text style={styles.payPromptBody}>Do you want to record a payment for this extra cost now?</Text>

          <View style={styles.payBtnRow}>
            <TouchableOpacity
              style={[styles.payBtn, styles.payBtnLight]}
              onPress={() => {
                setShowPayPrompt(false);
                onClose();
              }}
              activeOpacity={0.9}
            >
              <Text style={styles.payBtnLightTxt}>Later</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.payBtn, styles.payBtnDark]}
              onPress={() => {
                setShowPayPrompt(false);
                onClose();
                setShowVendorSheet(true);
              }}
              activeOpacity={0.9}
            >
              <Text style={styles.payBtnDarkTxt}>Pay now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Vendor Payment Sheet */}
      <VendorPaymentCreateSheet
      visible={showVendorSheet}
      onClose={() => setShowVendorSheet(false)}
      token={token || null}
      oilId={oilId}
      lotId={lotId}
      vendorNameOverride={vendorNameOverride ?? undefined}
      currentPayable={currentPayable}
      extraCostId={createdExtraId ?? undefined}
      onCreated={async () => {
        if (createdExtraId) {
          const due = await fetchExtraDue(createdExtraId);
          setCurrentPayable(due);
        }
      }}
      companyName={undefined}
      companyContact={undefined}
    />

    </>
  );
}

/* ──────────────────────────────────────────────────────────
   Styles
────────────────────────────────────────────────────────── */
const styles = StyleSheet.create({
  // Backdrop
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },

  // Sheet base
  sheetWrapAbs: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheetCard: {
    flex: 1,
    backgroundColor: COLOR_BG,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#EEF1F6',
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
  headerRow: {
    minHeight: 34,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  closeBtn: {
    position: 'absolute',
    right: 4,
    top: -2,
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleCenter: { fontSize: 18, fontWeight: '800', color: COLOR_TEXT, textAlign: 'center' },

  // Scroll body padding
  scrollBody: {
    paddingBottom: 18,
    paddingTop: 6,
  },

  // Field frame
  floatWrap: {
    borderWidth: 1.4,
    borderColor: COLOR_BORDER,
    borderRadius: 12,
    backgroundColor: COLOR_INPUT_BG,
    position: 'relative',
  },
  floatWrapFocused: { borderColor: COLOR_BORDER_FOCUS },

  // Label chip that sits over the border line
  labelChipHolder: {
    position: 'absolute',
    left: 12,
    top: -10,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  labelChipText: { fontSize: 11 },

  // Input base
  inputBase: {
    minHeight: 48,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  inputPadded: { paddingHorizontal: 12, paddingVertical: 12 },
  inputText: { fontSize: 15, color: COLOR_TEXT },
  inputDisabled: { backgroundColor: '#F8FAFC' },

  // Error text
  errorText: { marginTop: 4, color: COLOR_ERROR, fontSize: 11, fontWeight: '700' },

  // Grid
  row2: { flexDirection: 'row', gap: 12 },
  col: { flex: 1 },

  // Summary
  summaryCard: {
    marginTop: 6,
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  summaryKey: { color: '#6B7280', fontSize: 12 },
  summaryVal: { color: '#0B122A', fontWeight: '800', fontSize: 13 },
  divider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 8 },
  rateHint: { marginTop: 6, color: '#B45309', fontSize: 11 },

  // Buttons (main submit)
  submitBtn: {
    backgroundColor: COLOR_ACCENT,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    shadowColor: COLOR_ACCENT,
    shadowOpacity: Platform.OS === 'ios' ? 0.16 : 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  submitText: { color: 'white', fontSize: 15, fontWeight: '800' },

  // Currency popup (small)
  popupBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(2,6,23,0.55)' },
  popupCard: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: '28%',
    borderRadius: 16,
    backgroundColor: '#fff',
    padding: 14,
    borderWidth: 1,
    borderColor: '#EEF1F6',
  },
  popupTitle: { fontSize: 14, fontWeight: '900', color: COLOR_TEXT, marginBottom: 10, textAlign: 'center' },
  popupList: {
    borderWidth: 1,
    borderColor: '#EEF2F7',
    borderRadius: 12,
    overflow: 'hidden',
  },
  popupItem: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLOR_DIVIDER,
    backgroundColor: '#fff',
  },
  popupItemText: { color: COLOR_TEXT, fontSize: 13, fontWeight: '700' },
  popupClose: {
    marginTop: 10,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  popupCloseTxt: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },

  // Pay prompt
  payPromptCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: '30%',
    borderRadius: 16,
    backgroundColor: '#fff',
    padding: 16,
    borderWidth: 1,
    borderColor: '#EEF1F6',
  },
  payPromptTitle: { fontSize: 16, fontWeight: '900', color: COLOR_TEXT, marginBottom: 8 },
  payPromptBody: { color: COLOR_SUB, marginTop: 6, marginBottom: 12 },
  payRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  payLabel: { color: COLOR_SUB, fontSize: 12, fontWeight: '800' },
  payValue: { color: COLOR_TEXT, fontSize: 14, fontWeight: '900' },

  // Pay prompt buttons row
  payBtnRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  payBtn: {
    flexGrow: 1,
    flexBasis: '48%',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payBtnLight: { backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  payBtnDark: { backgroundColor: COLOR_ACCENT },
  payBtnLightTxt: { color: '#0B1221', fontWeight: '800', textAlign: 'center' },
  payBtnDarkTxt: { color: '#FFFFFF', fontWeight: '800', textAlign: 'center' },
});