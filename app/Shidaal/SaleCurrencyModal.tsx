// components/SaleCurrencyModal.tsx
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

const unitTitle = (u?: SaleUnitType) =>
  u === 'fuusto' ? 'Fuusto' : u === 'caag' ? 'Caag' : u === 'liters' ? 'Liters' : 'Qty';

export default function SaleCurrencyModal({
  visible,
  defaultFxRate = '',
  lineTotal = 0,                 // total from the form (in baseCurrency)
  qty,                           // quantity from the form
  unitType,                      // 'liters' | 'fuusto' | 'caag'  (for "3 fuusto")
  baseCurrency = 'USD',          // currency of lineTotal (defaults to USD)
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
  onConfirm: (currencyKey: CurrencyKey, fxRate: string) => void;
}) {
  // IMPORTANT: start as "no selection" to show placeholder "select currency"
  const [currencyKey, setCurrencyKey] = useState<CurrencyKey | null>(null);
  const [fxRate, setFxRate] = useState<string>(defaultFxRate);

  // dropdown open/close
  const [openCurrency, setOpenCurrency] = useState(false);

  useEffect(() => {
    if (visible) {
      setCurrencyKey(null);           // default: "select currency"
      setFxRate(defaultFxRate || '');
      setOpenCurrency(false);
    }
  }, [visible, defaultFxRate]);

  const targetServerCode = useMemo(
    () => (currencyKey ? SERVER_CODE_FROM_KEY[currencyKey] : null),
    [currencyKey]
  );

  const baseSymbol = baseCurrency === 'USD' ? DISPLAY_SYMBOL.USD : DISPLAY_SYMBOL.SOS;

  const numberOrEmpty = (s: string) => (s === '' ? '' : s.replace(',', '.'));
  const fmt2 = (n: number) => Number(n || 0).toFixed(2);

  // fx as SOS per 1 USD (your existing convention)
  const parsedFx = useMemo(() => {
    const n = parseFloat((fxRate || '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }, [fxRate]);

  // Live converted total (only meaningful when target is SOS)
  const convertedSOS = useMemo(() => {
    if (targetServerCode !== 'SOS') return null;
    if (baseCurrency === 'SOS') return lineTotal; // already SOS
    if (baseCurrency === 'USD') {
      if (!parsedFx) return null;
      return lineTotal * parsedFx;
    }
    return null;
  }, [targetServerCode, baseCurrency, lineTotal, parsedFx]);

  // Disable confirm if: no currency selected OR (selected SOS but fx invalid)
  const disabledConfirm =
    !currencyKey || (targetServerCode === 'SOS' && (!parsedFx || parsedFx <= 0));

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
              <Text style={styles.headerTitle}>Confirm Currency</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Feather name="x" size={16} color="#0B1221" />
            </TouchableOpacity>
          </View>

          {/* Currency dropdown */}
          <Text style={styles.sectionTitle}>Currency</Text>
          <View style={{ marginBottom: 8 }}>
            <TouchableOpacity
              style={styles.selectBtn}
              onPress={() => setOpenCurrency((s) => !s)}
              activeOpacity={0.9}
            >
              <Text style={[styles.selectValue, !currencyKey && { color: '#64748B', fontWeight: '600' }]}>
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

          {/* If SHIMAALI is selected, the exchange rate appears ABOVE the amounts container */}
          {targetServerCode === 'SOS' && (
            <>
              <Text style={styles.sectionTitleTight}>Exchange Rate (SOS per 1 USD)</Text>
              <TextInput
                value={fxRate}
                onChangeText={(t) => setFxRate(numberOrEmpty(t))}
                keyboardType="decimal-pad"
                placeholder="geli rate-ka"
                placeholderTextColor="#64748B"
                style={styles.input}
              />
            </>
          )}

          {/* Qty + amounts container */}
          <View style={styles.card}>
            {/* Qty + Sell type */}
            <View style={styles.rowBetween}>
              <Text style={styles.labelSm}>Qty</Text>
              <Text style={styles.valueSm}>
                {qty != null ? qty : '—'} {unitTitle(unitType)}
              </Text>
            </View>

            <View style={styles.divider} />

            {/* Row: Original amount | Converted (ONLY for shimaali) */}
            <View style={[styles.amountRow, targetServerCode !== 'SOS' && { gap: 0 }]}>
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
              onPress={() => currencyKey && onConfirm(currencyKey, fxRate)}
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

  // Dropdown styles
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
  selectValue: { fontSize: 13, fontWeight: '800', color: '#0B1221' },
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
    height: 44,
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
    marginBottom: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  labelSm: { color: '#6B7280', fontSize: 12 },
  valueSm: { color: '#0B1221', fontWeight: '800', fontSize: 12 },

  amountRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    marginTop: 8,
  },
  amountCol: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#F9FAFB',
  },
  amountLabel: { fontSize: 11, color: '#6B7280' },
  amountValue: { marginTop: 4, fontSize: 16, fontWeight: '800', color: '#0B1221' },

  vSpacer: { width: 12 },

  divider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 10 },

  actionsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 12 },
  cancelBtn: {
    flex: 1,
    height: 44,
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
    height: 44,
    borderRadius: 12,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  confirmTxt: { color: '#FFFFFF', fontWeight: '800' },
});
