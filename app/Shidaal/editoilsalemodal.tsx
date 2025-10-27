import api from '@/services/api';
import { Feather } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

/* ---------- Types align with /oilsale update ---------- */
type SaleUnitType = 'liters' | 'fuusto' | 'caag' | 'lot';
type OilSalePaymentStatus = 'unpaid' | 'partial' | 'paid';
type OilSalePaymentMethod = 'cash' | 'bank' | 'mobile' | 'credit';

export type OilSaleRead = {
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

  payment_status: OilSalePaymentStatus;
  payment_method?: OilSalePaymentMethod | null;
  paid_native?: number | null;
  note?: string | null;

  created_at: string;
  updated_at: string;
};

type OilSaleUpdate = Partial<{
  oil_id: number | null;

  customer: string | null;
  customer_contact: string | null;

  unit_type: SaleUnitType;
  unit_qty: number | null;
  unit_capacity_l: number | null;
  liters_sold: number | null;

  currency: string | null;
  price_per_l: number | null;
  discount_native: number | null;
  tax_native: number | null;
  fx_rate_to_usd: number | null;

  payment_status: OilSalePaymentStatus | null;
  payment_method: OilSalePaymentMethod | null;
  paid_native: number | null;

  note: string | null;
}>;

export default function EditOilSaleModal({
  visible,
  onClose,
  token,
  sale,
  onSuccess,
}: {
  visible: boolean;
  onClose: () => void;
  token?: string | null;
  sale: OilSaleRead | null;
  onSuccess?: (updated: OilSaleRead) => void;
}) {
  const authHeader = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );


  const [unitType, setUnitType] = useState<SaleUnitType>('liters');
  const [unitQty, setUnitQty] = useState<string>('');       
  const [litersSold, setLitersSold] = useState<string>('');
  const [pricePerL, setPricePerL] = useState<string>('');
  const [discount, setDiscount] = useState<string>('');
  const [tax, setTax] = useState<string>('');
  const [currency, setCurrency] = useState<string>('USD');
  const [fxRate, setFxRate] = useState<string>(''); 

  const [paymentStatus, setPaymentStatus] = useState<OilSalePaymentStatus>('unpaid');
  const [paymentMethod, setPaymentMethod] = useState<OilSalePaymentMethod | ''>('');
  const [paidNative, setPaidNative] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [customerContact, setCustomerContact] = useState<string>('');
  const [note, setNote] = useState<string>('');

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!sale) return;
    setUnitType(sale.unit_type);
    setUnitQty(sale.unit_qty != null ? String(sale.unit_qty) : '');
    setLitersSold(sale.liters_sold != null ? String(sale.liters_sold) : '');
    setPricePerL(sale.price_per_l != null ? String(sale.price_per_l) : '');
    setDiscount(sale.discount_native != null ? String(sale.discount_native) : '');
    setTax(sale.tax_native != null ? String(sale.tax_native) : '');
    setCurrency((sale.currency || 'USD').toUpperCase());
    setFxRate(sale.fx_rate_to_usd != null ? String(sale.fx_rate_to_usd) : '');
    setPaymentStatus(sale.payment_status);
    setPaymentMethod(sale.payment_method || '');
    setPaidNative(sale.paid_native != null ? String(sale.paid_native) : '');
    setCustomerName(sale.customer || '');
    setCustomerContact(sale.customer_contact || '');
    setNote(sale.note || '');
  }, [sale, visible]);

  const disabledFx = currency.toUpperCase() === 'USD';


  function buildPayload(): OilSaleUpdate {
    const cur = (currency || 'USD').toUpperCase();

  
    const num = (s: string) => {
      const v = Number(s);
      return Number.isFinite(v) ? v : undefined;
    };

    const payload: OilSaleUpdate = {
      customer: customerName.trim() || null,
      customer_contact: customerContact.trim() || null,
      unit_type: unitType,
      price_per_l: num(pricePerL),
      discount_native: num(discount),
      tax_native: num(tax),
      currency: cur,
      payment_status: paymentStatus,
      payment_method: paymentMethod || null,
      paid_native: num(paidNative),
      note: note.trim() || null,
    };


    if (unitType === 'liters') {
      payload.liters_sold = num(litersSold) ?? null;
      payload.unit_qty = null;
    } else if (unitType === 'fuusto' || unitType === 'caag') {
      payload.unit_qty = num(unitQty) ?? null;
      payload.liters_sold = null;
    } else {

      payload.unit_qty = null;
      payload.liters_sold = null;
    }

 
    if (cur === 'USD') {
      payload.fx_rate_to_usd = null;
    } else {
      const fx = num(fxRate);
      payload.fx_rate_to_usd = fx != null && fx > 0 ? fx : null;
    }

    return payload;
  }

  async function onSubmit() {
    if (!sale) return;
 
    if (unitType === 'liters') {
      const liters = Number(litersSold);
      if (!Number.isFinite(liters) || liters <= 0) {
        Alert.alert('Xog khaldan', 'Liters Sold waa in ay ka waynaato 0.');
        return;
      }
    }
    if ((unitType === 'fuusto' || unitType === 'caag')) {
      const qty = Number(unitQty);
      if (!Number.isFinite(qty) || qty <= 0) {
        Alert.alert('Xog khaldan', 'Qty waa in ay ka waynaato 0.');
        return;
      }
    }
    if (currency.toUpperCase() !== 'USD') {
      const fx = Number(fxRate);
      if (!(Number.isFinite(fx) && fx > 0)) {
        Alert.alert('FX Rate', 'Fadlan geli sicirka isweydaarsiga: native per USD (> 0).');
        return;
      }
    }

    const payload = buildPayload();

    setSubmitting(true);
    try {
      const res = await api.patch<OilSaleRead>(`/oilsale/${sale.id}`, payload, {
        headers: authHeader,
      });
      onSuccess?.(res.data);
      onClose();
    } catch (e: any) {
      Alert.alert('Update failed', e?.response?.data?.detail || 'Could not update oil sale.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.centerWrap}>
        <View style={styles.card}>
          <Text style={styles.title}>Edit Oil Sale</Text>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.select({ ios: 10, android: 0 })}
          >
            <ScrollView
              style={{ maxHeight: 520 }}
              contentContainerStyle={{ paddingBottom: 8, gap: 10 }}
              keyboardShouldPersistTaps="handled"
            >
              {/* Customer (free text link) */}
              <Field
                label="Customer"
                value={customerName}
                onChangeText={setCustomerName}
                placeholder="Magaca macmiilka"
              />
              <Field
                label="Contact"
                value={customerContact}
                onChangeText={setCustomerContact}
                placeholder="Phone / contact"
              />

              {/* Unit type */}
              <PickerRow
                label="Unit Type"
                value={unitType}
                options={[
                  { value: 'liters', label: 'Liters' },
                  { value: 'fuusto', label: 'Fuusto (20L each)' },
                  { value: 'caag', label: 'Caag (10L each)' },
                  { value: 'lot', label: 'Whole Lot' },
                ]}
                onChange={(v) => setUnitType(v as SaleUnitType)}
              />

              {unitType === 'liters' ? (
                <Field
                  label="Liters Sold"
                  value={litersSold}
                  onChangeText={setLitersSold}
                  keyboardType="numeric"
                  placeholder="0"
                />
              ) : null}

              {(unitType === 'fuusto' || unitType === 'caag') ? (
                <Field
                  label="Qty"
                  value={unitQty}
                  onChangeText={setUnitQty}
                  keyboardType="numeric"
                  placeholder="0"
                />
              ) : null}

              {/* Pricing */}
              <Field
                label="Price per Liter"
                value={pricePerL}
                onChangeText={setPricePerL}
                keyboardType="numeric"
                placeholder="0.00"
              />

              <Field
                label="Discount (native)"
                value={discount}
                onChangeText={setDiscount}
                keyboardType="numeric"
                placeholder="0.00"
              />

              <Field
                label="Tax (native)"
                value={tax}
                onChangeText={setTax}
                keyboardType="numeric"
                placeholder="0.00"
              />

              {/* Currency / FX */}
              <Field
                label="Currency (3-letter)"
                value={currency}
                onChangeText={(t) => setCurrency(t.toUpperCase())}
                maxLength={3}
                autoCapitalize="characters"
                placeholder="USD"
              />

              <Field
                label="FX rate (native per USD)"
                value={fxRate}
                onChangeText={setFxRate}
                keyboardType="numeric"
                placeholder="e.g. 3.4"
                editable={!disabledFx}
                disabledStyle={disabledFx}
                helper={disabledFx ? 'FX is not needed for USD.' : undefined}
              />

              {/* Payment meta (optional) */}
              <PickerRow
                label="Payment Status"
                value={paymentStatus}
                options={[
                  { value: 'unpaid', label: 'Unpaid' },
                  { value: 'partial', label: 'Partial' },
                  { value: 'paid', label: 'Paid' },
                ]}
                onChange={(v) => setPaymentStatus(v as OilSalePaymentStatus)}
              />
              <PickerRow
                label="Payment Method"
                value={paymentMethod || ''}
                options={[
                  { value: '', label: '—' },
                  { value: 'cash', label: 'Cash' },
                  { value: 'bank', label: 'Bank' },
                  { value: 'mobile', label: 'Mobile' },
                  { value: 'credit', label: 'Credit' },
                ]}
                onChange={(v) => setPaymentMethod((v || '') as OilSalePaymentMethod | '')}
              />
              <Field
                label="Paid (native)"
                value={paidNative}
                onChangeText={setPaidNative}
                keyboardType="numeric"
                placeholder="0.00"
              />

              <Field
                label="Note"
                value={note}
                onChangeText={setNote}
                placeholder="Optional note"
                multiline
              />

              {/* Actions */}
              <View style={styles.actions}>
                <TouchableOpacity style={styles.btnGhost} onPress={onClose} disabled={submitting}>
                  <Text style={styles.btnGhostTxt}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btnPrimary, submitting && { opacity: 0.7 }]}
                  onPress={onSubmit}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Feather name="check" size={16} color="#fff" />
                      <Text style={styles.btnPrimaryTxt}>Save</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </View>
    </Modal>
  );
}

/* ----------------- Small UI primitives ----------------- */
function Field({
  label,
  value,
  onChangeText,
  keyboardType,
  placeholder,
  maxLength,
  autoCapitalize,
  multiline,
  editable = true,
  disabledStyle = false,
  helper,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  keyboardType?: 'default' | 'numeric';
  placeholder?: string;
  maxLength?: number;
  autoCapitalize?: 'none' | 'characters' | 'sentences' | 'words';
  multiline?: boolean;
  editable?: boolean;
  disabledStyle?: boolean;
  helper?: string;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          !editable || disabledStyle ? { backgroundColor: '#F3F4F6', color: '#6B7280' } : null,
          multiline ? { height: 90, textAlignVertical: 'top' } : null,
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        keyboardType={keyboardType}
        maxLength={maxLength}
        autoCapitalize={autoCapitalize}
        editable={editable && !disabledStyle}
        multiline={!!multiline}
      />
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}
    </View>
  );
}

function PickerRow<
  T extends string | number,
>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {

  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <TouchableOpacity
              key={`${opt.value}`}
              style={[
                styles.pill,
                active ? styles.pillActive : styles.pillIdle,
              ]}
              onPress={() => onChange(opt.value)}
            >
              <Text style={active ? styles.pillActiveTxt : styles.pillIdleTxt}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

/* ----------------- Styles ----------------- */
const ACCENT = '#576CBC';
const BORDER = '#E5E7EB';
const TEXT = '#0B1220';
const MUTED = '#6B7280';

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: {
    width: '92%',
    maxWidth: 560,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
    elevation: 8,
  },
  title: { fontWeight: '900', color: TEXT, fontSize: 16, marginBottom: 8, textAlign: 'center' },
  label: { fontSize: 12, color: MUTED },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: TEXT,
  },
  helper: { fontSize: 11, color: MUTED },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 8 },
  btnPrimary: {
    backgroundColor: ACCENT,
    borderRadius: 10,
    paddingHorizontal: 16,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  btnPrimaryTxt: { color: '#fff', fontWeight: '800' },
  btnGhost: {
    backgroundColor: 'transparent',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhostTxt: { color: MUTED, fontWeight: '800' },

  pill: {
    paddingHorizontal: 12,
    height: 36,
    minWidth: 80,
    borderRadius: 10,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillActive: { backgroundColor: '#EEF2FF', borderColor: '#3B82F6' },
  pillIdle: { backgroundColor: '#fff', borderColor: BORDER },
  pillActiveTxt: { color: '#1E40AF', fontWeight: '800' },
  pillIdleTxt: { color: TEXT, fontWeight: '700' },
});
