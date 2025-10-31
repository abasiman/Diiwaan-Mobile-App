// components/SaleCurrencyModalCashSale.tsx
import { Feather } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
    Modal,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

export type CurrencyKey = 'USD' | 'shimaal';
export type PaymentMethodKey = 'cash' | 'baankisat';
type SaleUnitType = 'liters' | 'fuusto' | 'caag';

const BORDER = '#CBD5E1';

const DISPLAY_SYMBOL: Record<'USD' | 'SOS', string> = {
  USD: '$',
  SOS: 'Sh',
};

const SERVER_CODE_FROM_KEY: Record<CurrencyKey, 'USD' | 'SOS'> = {
  USD: 'USD',
  shimaal: 'SOS',
};

// Map UI payment choices to server enum
const PAYMENT_SERVER_FROM_KEY: Record<PaymentMethodKey, 'cash' | 'bank'> = {
  cash: 'cash',
  baankisat: 'bank',
};

const unitTitle = (u?: SaleUnitType) =>
  u === 'fuusto' ? 'Fuusto' : u === 'caag' ? 'Caag' : u === 'liters' ? 'Liters' : 'Qty';

export default function SaleCurrencyModal({
  visible,
  defaultFxRate = '',
  lineTotal = 0,
  qty,
  unitType,
  baseCurrency = 'USD',
  onClose,
  onConfirm,
}: {
  visible: boolean;
  defaultFxRate?: string;
  lineTotal?: number;
  qty?: number;
  unitType?: SaleUnitType;
  baseCurrency?: 'USD' | 'SOS';
  onClose: () => void;
  // now also returns the chosen payment method (server enum)
  onConfirm: (currencyKey: CurrencyKey, fxRate: string, paymentMethodServer: 'cash' | 'bank') => void;
}) {
  // currency + payment method state
  const [currencyKey, setCurrencyKey] = useState<CurrencyKey | null>(null);
  const [paymentKey, setPaymentKey] = useState<PaymentMethodKey | null>(null);
  const [fxRate, setFxRate] = useState<string>(defaultFxRate);

  // dropdown open/close
  const [openCurrency, setOpenCurrency] = useState(false);
  const [openPayment, setOpenPayment] = useState(false);

  useEffect(() => {
    if (visible) {
      setCurrencyKey(null);     // force user to pick
      setPaymentKey(null);      // force user to pick
      setFxRate(defaultFxRate || '');
      setOpenCurrency(false);
      setOpenPayment(false);
    }
  }, [visible, defaultFxRate]);

  const targetServerCode = useMemo(
    () => (currencyKey ? SERVER_CODE_FROM_KEY[currencyKey] : null),
    [currencyKey]
  );

  const baseSymbol = baseCurrency === 'USD' ? DISPLAY_SYMBOL.USD : DISPLAY_SYMBOL.SOS;
  const fmt2 = (n: number) => Number(n || 0).toFixed(2);

  // Sanitize to allow only numbers and one dot
  const sanitizeRate = (s: string) => {
    let out = s.replace(/[^\d.]/g, '');
    const firstDot = out.indexOf('.');
    if (firstDot !== -1) {
      out = out.slice(0, firstDot + 1) + out.slice(firstDot + 1).replace(/\./g, '');
    }
    return out;
  };

  const parsedFx = useMemo(() => {
    const n = parseFloat((fxRate || '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }, [fxRate]);

  const convertedSOS = useMemo(() => {
    if (targetServerCode !== 'SOS') return null;
    if (baseCurrency === 'SOS') return lineTotal;
    if (baseCurrency === 'USD') {
      if (!parsedFx) return null;
      return lineTotal * parsedFx;
    }
    return null;
  }, [targetServerCode, baseCurrency, lineTotal, parsedFx]);

  // Disable confirm if: no currency OR (SOS without valid fx) OR no payment method
  const disabledConfirm =
    !currencyKey ||
    (targetServerCode === 'SOS' && (!parsedFx || parsedFx <= 0)) ||
    !paymentKey;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={styles.headerIconWrap}>
                <Feather name="dollar-sign" size={14} color="#0F172A" />
              </View>
              <Text style={styles.headerTitle}>Confirm Currency & Payment</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Feather name="x" size={16} color="#0B1221" />
            </TouchableOpacity>
          </View>

          {/* Row: Currency + Payment (same size, compact values) */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Currency</Text>
              <TouchableOpacity
                style={styles.selectBtn}
                onPress={() => {
                  setOpenCurrency((s) => !s);
                  setOpenPayment(false);
                }}
                activeOpacity={0.9}
              >
                <Text
                  style={[
                    styles.selectValueSm,
                    !currencyKey && { color: '#64748B', fontWeight: '600' },
                  ]}
                  numberOfLines={1}
                >
                  {currencyKey
                    ? currencyKey === 'USD'
                      ? 'doller (USD)'
                      : 'shimaali sh (SOS)'
                    : 'select currency'}
                </Text>
                <Feather name={openCurrency ? 'chevron-up' : 'chevron-down'} size={16} color="#0B1221" />
              </TouchableOpacity>

              {openCurrency && (
                <View style={styles.dropdownPanel}>
                  <TouchableOpacity
                    style={styles.optionRow}
                    activeOpacity={0.9}
                    onPress={() => {
                      setCurrencyKey('USD');
                      setOpenCurrency(false);
                    }}
                  >
                    <Text style={styles.optionText}>doller (USD)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.optionRow, { borderBottomWidth: 0 }]}
                    activeOpacity={0.9}
                    onPress={() => {
                      setCurrencyKey('shimaal');
                      setOpenCurrency(false);
                    }}
                  >
                    <Text style={styles.optionText}>shimaali sh (SOS)</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Payment</Text>
              <TouchableOpacity
                style={styles.selectBtn}
                onPress={() => {
                  setOpenPayment((s) => !s);
                  setOpenCurrency(false);
                }}
                activeOpacity={0.9}
              >
                <Text
                  style={[
                    styles.selectValueSm,
                    !paymentKey && { color: '#64748B', fontWeight: '600' },
                  ]}
                  numberOfLines={1}
                >
                  {paymentKey ? (paymentKey === 'cash' ? 'cash' : 'baankisat') : 'select payment method'}
                </Text>
                <Feather name={openPayment ? 'chevron-up' : 'chevron-down'} size={16} color="#0B1221" />
              </TouchableOpacity>

              {openPayment && (
                <View style={styles.dropdownPanel}>
                  <TouchableOpacity
                    style={styles.optionRow}
                    activeOpacity={0.9}
                    onPress={() => {
                      setPaymentKey('cash');
                      setOpenPayment(false);
                    }}
                  >
                    <Text style={styles.optionText}>cash</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.optionRow, { borderBottomWidth: 0 }]}
                    activeOpacity={0.9}
                    onPress={() => {
                      setPaymentKey('baankisat');
                      setOpenPayment(false);
                    }}
                  >
                    <Text style={styles.optionText}>baankisat</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          {/* If SHIMAALI is selected, show exchange rate */}
          {targetServerCode === 'SOS' && (
            <>
              <Text style={styles.sectionTitleTight}>Exchange Rate (SOS per 1 USD)</Text>
              <TextInput
                value={fxRate}
                onChangeText={(t) => setFxRate(sanitizeRate(t))}
                placeholder="geli rate-ka"
                placeholderTextColor="#64748B"
                style={styles.input}
              />
            </>
          )}

          {/* Qty + amounts container (COMPACT) */}
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.labelSm}>Qty</Text>
              <Text style={styles.valueSm}>
                {qty != null ? qty : '—'} {unitTitle(unitType)}
              </Text>
            </View>

            <View style={styles.divider} />

            <View style={[styles.amountRow, targetServerCode !== 'SOS' && { gap: 6 }]}>
              <View style={[styles.amountCol, targetServerCode !== 'SOS' && { flex: 1 }]}>
                <Text style={styles.amountLabel}>Amount (doller)</Text>
                <Text style={styles.amountValue}>
                  {baseSymbol} {fmt2(lineTotal)}
                </Text>
              </View>

              {targetServerCode === 'SOS' && (
                <>
                  <View style={styles.vSpacer} />
                  <View style={styles.amountCol}>
                    <Text style={styles.amountLabel}>Converted (shimaali sh)</Text>
                    <Text style={styles.amountValue}>
                      {convertedSOS != null ? `${DISPLAY_SYMBOL.SOS} ${fmt2(convertedSOS)}` : '—'}
                    </Text>
                  </View>
                </>
              )}
            </View>
          </View>

          {/* Actions */}
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.9}>
              <Text style={styles.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, disabledConfirm && { opacity: 0.5 }]}
              disabled={disabledConfirm}
              onPress={() => {
                if (!currencyKey || !paymentKey) return;
                onConfirm(currencyKey, fxRate, PAYMENT_SERVER_FROM_KEY[paymentKey]);
              }}
              activeOpacity={0.92}
            >
              <Feather name="check" size={16} color="#fff" />
              <Text style={styles.confirmTxt}>Confirm & Create</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  sheet: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },

  sectionTitle: { marginTop: 10, marginBottom: 6, fontWeight: '800', color: '#0B1221', fontSize: 13 },
  sectionTitleTight: { marginTop: 6, marginBottom: 6, fontWeight: '800', color: '#0B1221', fontSize: 13 },

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
  // Smaller value text for both dropdowns
  selectValueSm: { fontSize: 12, fontWeight: '700', color: '#0B1221' },

  dropdownPanel: {
    borderWidth: 1,
    borderColor: BORDER,
    borderTopWidth: 0,
    backgroundColor: '#fff',
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    overflow: 'hidden',
  },
  optionRow: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomColor: '#E5E7EB',
    borderBottomWidth: 1,
  },
  optionText: { fontSize: 13, color: '#0B1221', fontWeight: '700' },

  input: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
    fontSize: 13,
    color: '#0B1221',
  },

  card: {
    marginTop: 8,
    marginBottom: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  labelSm: { color: '#6B7280', fontSize: 11 },
  valueSm: { color: '#0B1221', fontWeight: '800', fontSize: 11 },

  amountRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    marginTop: 6,
  },
  amountCol: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 8,
    backgroundColor: '#F9FAFB',
  },
  amountLabel: { fontSize: 10, color: '#6B7280' },
  amountValue: { marginTop: 2, fontSize: 13, fontWeight: '800', color: '#0B1221' },

  vSpacer: { width: 8 },

  divider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 8 },

  actionsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 10 },
  cancelBtn: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  cancelTxt: { color: '#0B1221', fontWeight: '800' },
  confirmBtn: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  confirmTxt: { color: '#FFFFFF', fontWeight: '800' },
});
