// OilExtraCostModal.tsx
import api from '@/services/api';
import { useAuth } from '@/src/context/AuthContext';
import VendorPaymentCreateSheet from './vendorpayment';

import { Feather } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
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
const COLOR_INPUT_BG = '#F9FAFB';
const COLOR_ACCENT = '#0F172A';

type CurrencyKey = 'USD' | 'shimaal' | 'junuubi';
const CURRENCY_OPTIONS: { label: string; key: CurrencyKey; code: string; symbol: string }[] = [
  { label: 'USD (US Dollar)', key: 'USD', code: 'USD', symbol: '$' },
  { label: 'Shimaal',         key: 'shimaal', code: 'SOS', symbol: 'Sh' },
  { label: 'Junuubi',         key: 'junuubi', code: 'JNB', symbol: 'J' },
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
   Small UI: Floating Input + Floating Select
────────────────────────────────────────────────────────── */
function FloatingInput({
  label,
  value,
  onChangeText,
  keyboardType = 'default',
  editable = true,
  rightAddon,
  onBlur,
  onFocus,
  testID,
}: {
  label: string;
  value: string;
  onChangeText?: (t: string) => void;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
  editable?: boolean;
  rightAddon?: React.ReactNode;
  onFocus?: () => void;
  onBlur?: () => void;
  testID?: string;
}) {
  const [focused, setFocused] = useState(false);
  const active = focused || (value?.length ?? 0) > 0;

  return (
    <View style={{ marginBottom: 12 }}>
      <View style={[styles.floatWrap, focused && { borderColor: COLOR_BORDER_FOCUS }]}>
        <Text style={[styles.floatLabel, active && styles.floatLabelActive]}>{label}</Text>
        <TextInput
          testID={testID}
          style={[styles.inputBase, styles.inputPadded, !editable && styles.inputDisabled]}
          value={value}
          onChangeText={onChangeText}
          editable={editable}
          keyboardType={keyboardType}
          placeholder=""                  // ← no placeholder text (label handles it)
          placeholderTextColor={COLOR_PLACEHOLDER}
          onFocus={() => { setFocused(true); onFocus?.(); }}
          onBlur={() => { setFocused(false); onBlur?.(); }}
        />
        {rightAddon ? <View style={styles.addonWrap}>{rightAddon}</View> : null}
      </View>
    </View>
  );
}

function FloatingSelect<T extends string>({
  label,
  value,
  onSelect,
  options,
  renderLabel,
}: {
  label: string;
  value?: T;
  onSelect: (v: T) => void;
  options: T[];
  renderLabel?: (v: T) => string;
}) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const hasValue = !!value;
  const showFloat = focused || hasValue;
  const display = value ? (renderLabel ? renderLabel(value) : String(value)) : label;

  return (
    <View style={{ marginBottom: 12 }}>
      <View style={[styles.floatWrap, focused && { borderColor: COLOR_BORDER_FOCUS }]}>
        <Text style={[styles.floatLabel, showFloat && styles.floatLabelActive]}>{label}</Text>

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => { setOpen((s) => !s); setFocused((f) => !f); }}
          style={[styles.inputBase, styles.inputPadded]}
        >
          <Text
            numberOfLines={1}
            style={[styles.inputText, { color: hasValue ? COLOR_TEXT : COLOR_PLACEHOLDER }]}
          >
            {display}
          </Text>
          <Feather name={open ? 'chevron-up' : 'chevron-down'} size={18} color={COLOR_TEXT} />
        </TouchableOpacity>

        {open && (
          <View style={styles.dropdown}>
            {options.map((opt) => {
              const lbl = renderLabel ? renderLabel(opt) : String(opt);
              return (
                <TouchableOpacity
                  key={opt}
                  activeOpacity={0.85}
                  onPress={() => {
                    onSelect(opt);
                    setOpen(false);
                    setFocused(false);
                  }}
                  style={styles.dropdownItem}
                >
                  <Text style={styles.dropdownText}>{lbl}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

/* ──────────────────────────────────────────────────────────
   Component
────────────────────────────────────────────────────────── */
export default function OilExtraCostModal({
  visible,
  onClose,
  oilId,
}: {
  visible: boolean;
  onClose: () => void;
  oilId: number;
}) {
  const { token } = useAuth();

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
  const [currencyKey, setCurrencyKey] = useState<CurrencyKey>('USD');
  const currencyObj = CURRENCY_OPTIONS.find((c) => c.key === currencyKey)!;

  const [exchangeToUSD, setExchangeToUSD] = useState(''); // how many [selected] for $1
  const [perBarrel, setPerBarrel] = useState('');
  const [qtyBarrel, setQtyBarrel] = useState('');
  const [categoryName, setCategoryName] = useState(''); // first field

  // derived
  const rate = parseFloat(exchangeToUSD.replace(',', '.')) || 0;
  const perB = parseFloat(perBarrel.replace(',', '.')) || 0;
  const qty = Math.max(parseInt(qtyBarrel || '0', 10) || 0, 0);

  // totals
  const totalInSelected = useMemo(() => {
    const n = perB * qty;
    return isFinite(n) ? n : 0;
  }, [perB, qty]);

  const totalInUSD = useMemo(() => {
    if (currencyKey === 'USD') return totalInSelected;
    if (!(rate > 0)) return 0;
    // selected = USD * rate → USD = selected / rate
    return totalInSelected / rate;
  }, [totalInSelected, rate, currencyKey]);

  const symbol = currencyObj?.symbol || '';

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
    if (firstDot !== -1) {
      out = out.slice(0, firstDot + 1) + out.slice(firstDot + 1).replace(/\./g, '');
    }
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

      // default currency to oil's if present
      const oilCur = String(oilData?.currency || 'USD').toUpperCase();
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
  }, [visible, oilId]);

  const clearForm = () => {
    setExchangeToUSD('');
    setPerBarrel('');
    setQtyBarrel('');
    setCategoryName('');
    setCreatedExtraId(null);
    setShowPayPrompt(false);
    setShowVendorSheet(false);
  };

  // Fetch due for a specific extra cost id
  const fetchExtraDue = async (extraId: number) => {
    try {
      const r = await api.get<SupplierDueResponse>(`/diiwaanvendorpayments/supplier-dues`, {
        headers: authHeader,
        params: { oil_id: oilId, only_with_payments_q: 'false' },
      });
      const items = r?.data?.items || [];
      const one = items.find((it) => it.oil_id === oilId);
      const ecList = (one?.extra_costs || []) as SupplierDueItem['extra_costs'];
      const match = ecList?.find((ec) => ec.id === extraId);
      const due = Number(match?.due || 0);
      return due;
    } catch {
      return 0;
    }
  };

  // Submit: send category and amount in USD
  const submitCreate = async () => {
    const name = (categoryName || '').trim();
    const qtyNum = qty;

    // validations (minimal, per your flow)
    if (!name) return;
    if (qtyNum <= 0) return;
    if (perB <= 0) return;
    if (currencyKey !== 'USD' && !(rate > 0)) return;

    const finalCategory = `${name}-${qtyNum}-barrel`;
    const amountUSD = Number.isFinite(totalInUSD) ? totalInUSD : 0;
    if (!(amountUSD > 0)) return;

    const payload = {
      category: finalCategory,
      amount: amountUSD, // USD sent to backend
    };

    try {
      setLoading(true);
      const res = await api.post(`/diiwaanoil/${oilId}/extra-costs`, payload, { headers: authHeader });
      clearForm();
      const newId: number | undefined = res?.data?.id;
      if (newId) {
        setCreatedExtraId(newId);
        const due = await fetchExtraDue(newId);
        setCurrentPayable(due);
        setShowPayPrompt(true);
      } else {
        setShowPayPrompt(false);
      }
    } catch {
      // optional: show a toast or inline error
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

  // UI strings
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

              {/* Content */}
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 18 }}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.sectionTitle}>Add new extra cost</Text>

                {/* 1) Other charges name (FIRST) */}
                <FloatingInput
                  label="Other charges name"
                  value={categoryName}
                  onChangeText={setCategoryName}
                />

                {/* 2) Currency (floating select) */}
                <FloatingSelect<CurrencyKey>
                  label="Currency"
                  value={currencyKey}
                  onSelect={setCurrencyKey}
                  options={['USD', 'shimaal', 'junuubi']}
                  renderLabel={(v) => CURRENCY_OPTIONS.find((c) => c.key === v)?.label || v}
                />

                {/* 3) Exchange rate to $1 — only when NOT USD */}
                {currencyKey !== 'USD' && (
                  <FloatingInput
                    label={`Exchange rate to $1 (${selectedCurrencyName} per $1)`}
                    value={exchangeToUSD}
                    onChangeText={(t) => setExchangeToUSD(toDecimal(t))}
                    keyboardType="decimal-pad"
                  />
                )}

                {/* 4) Amount per barrel + Qty of barrel (flex row) */}
                <View style={styles.row2}>
                  <View style={styles.col}>
                    <FloatingInput
                      label={`Amount per barrel (${symbol})`}
                      value={perBarrel}
                      onChangeText={(t) => setPerBarrel(toDecimal(t))}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={styles.col}>
                    <FloatingInput
                      label="Qty (barrels)"
                      value={qtyBarrel}
                      onChangeText={(t) => setQtyBarrel(toInt(t))}
                      keyboardType="number-pad"
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

                  {/* helper hint when rate missing for non-USD */}
                  {currencyKey !== 'USD' && !(rate > 0) ? (
                    <Text style={styles.rateHint}>Enter a valid exchange rate to calculate USD total.</Text>
                  ) : null}
                </View>

                {/* Submit */}
                <TouchableOpacity
                  style={[styles.submitBtn, loading && { opacity: 0.7 }]}
                  onPress={submitCreate}
                  disabled={loading}
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
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      </Modal>

      {/* Pay Now? prompt — for THIS extra cost only */}
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
          <Text style={styles.payPromptBody}>
            Current payable for this extra cost is{' '}
            <Text style={{ fontWeight: '900', color: COLOR_TEXT }}>
              ${Number(currentPayable || 0).toFixed(2)}
            </Text>. Do you want to record a payment now?
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: '#F3F4F6' }]}
              onPress={() => {
                setShowPayPrompt(false);
                onClose();
              }}
            >
              <Text style={{ color: '#0B1221', fontWeight: '800' }}>Later</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitBtn]}
              onPress={() => {
                setShowPayPrompt(false);
                onClose();
                setShowVendorSheet(true);
              }}
            >
              <Text style={styles.submitText}>Pay now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Vendor Payment Sheet (scoped to extra_cost_id) */}
      <VendorPaymentCreateSheet
        visible={showVendorSheet}
        onClose={() => setShowVendorSheet(false)}
        token={token || null}
        oilId={oilId}
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

  // Sections
  sectionTitle: { fontSize: 14, color: COLOR_SUB, fontWeight: '800', marginBottom: 8, marginTop: 6 },

  // Floating field frames
  floatWrap: {
    borderWidth: 1.2,
    borderColor: COLOR_BORDER,
    borderRadius: 12,
    backgroundColor: COLOR_INPUT_BG,
    position: 'relative',
  },
  floatLabel: {
    position: 'absolute',
    left: 10,
    top: -10,
    paddingHorizontal: 6,
    backgroundColor: COLOR_BG,
    fontSize: 11,
    color: COLOR_PLACEHOLDER,
  },
  floatLabelActive: { color: COLOR_BORDER_FOCUS, fontWeight: '800' },

  // Input base
  inputBase: {
    minHeight: 46,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  inputPadded: { paddingHorizontal: 12, paddingVertical: 10 },
  inputText: { fontSize: 15, color: COLOR_TEXT },
  inputDisabled: { backgroundColor: '#F3F4F6' },
  addonWrap: { position: 'absolute', right: 8, top: 0, bottom: 0, justifyContent: 'center' },

  // Dropdown
  dropdown: {
    marginTop: 8,
    borderWidth: 1.2,
    borderColor: COLOR_BORDER,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: COLOR_BG,
  },
  dropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLOR_DIVIDER,
  },
  dropdownText: { fontSize: 15, color: COLOR_TEXT },

  // Grid
  row2: { flexDirection: 'row', gap: 12 },
  col: { flex: 1 },

  // Summary
  summaryCard: {
    marginTop: 4,
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

  // Buttons
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
  payPromptBody: { color: COLOR_SUB, marginBottom: 12 },
});
