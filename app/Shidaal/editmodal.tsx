// app/Shidaal/editmodal.tsx
import api from '@/services/api';
import { useAuth } from '@/src/context/AuthContext';
import { Feather } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

const { height, width } = Dimensions.get('window');
const SHEET_MAX_HEIGHT = Math.min(height * 0.94, height - 48);
const RADIUS = 18;
const PLACEHOLDER = '#94A3B8';

type OilType = 'diesel' | 'petrol' | 'kerosene' | 'jet' | 'hfo' | 'crude' | 'lube';
type OilStatus = 'in_transit' | 'in_depot' | 'available' | 'reserved' | 'sold' | 'returned' | 'discarded';

export type DiiwaanOilRead = {
  id: number;
  truck_plate?: string | null;
  truck_type?: string | null;
  oil_type: OilType;
  qty: number;
  liters: number;
  supplier_name?: string | null;
  from_location?: string | null;
  depot: boolean;
  depot_name?: string | null;
  to_location?: string | null;
  location_notes?: string | null;
  currency: string;
  landed_cost_per_l?: number | null;
  oil_total_cost?: number | null;
  total_landed_cost?: number | null;
  sold_l: number;
  in_stock_l: number;
  available_l: number;
  pay_ment_status?: string | null;
  sell_price_per_l?: number | null;
  sell_price_per_lot?: number | null;
  discount_per_l?: number | null;
  status: OilStatus;
  tax?: number | null;
  oil_well?: string | null;
  oil_well_cost: number;
  created_at: string;
  updated_at: string;
};

const STATUS_COLORS: Record<OilStatus, { bg: string; fg: string }> = {
  in_transit: { bg: '#E6F0FF', fg: '#1D4ED8' },
  in_depot:   { bg: '#DFF8F3', fg: '#0F766E' },
  available:  { bg: '#DCFCE7', fg: '#047857' },
  reserved:   { bg: '#FEF3C7', fg: '#92400E' },
  sold:       { bg: '#E5E7EB', fg: '#374151' },
  returned:   { bg: '#FCE7F3', fg: '#9D174D' },
  discarded:  { bg: '#FEE2E2', fg: '#991B1B' },
};

const OIL_TYPES: OilType[] = ['diesel','petrol','kerosene','jet','hfo','crude','lube'];
const STATUSES: OilStatus[] = ['in_transit','in_depot','available','reserved','sold','returned','discarded'];

/* -------------------------------------------
 * Utils
 * -----------------------------------------*/
function fmtMoney(n?: number | null, code?: string) {
  if (n === undefined || n === null || isNaN(Number(n))) return '—';
  const sym = code?.toUpperCase() === 'USD' ? '$' : `${code ?? ''} `;
  return `${sym}${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(Number(n))}`;
}
const filterInt = (s: string) => s.replace(/[^0-9]/g, '');
const filterNum = (s: string) => {
  let out = s.replace(/[^0-9.]/g, '');
  const i = out.indexOf('.');
  if (i !== -1) out = out.slice(0, i + 1) + out.slice(i + 1).replace(/\./g, '');
  return out;
};
const cap = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);
const humanStatus = (v: OilStatus) => v.replace('_', ' ');

/* -------------------------------------------
 * Small, z-index-safe inline dropdown
 * -----------------------------------------*/
function InlineSelect<T extends string>({
  label, value, onSelect, options, renderLabel, z = 30,
}: {
  label: string;
  value?: T;
  onSelect: (v: T) => void;
  options: T[];
  renderLabel?: (v: T) => string;
  z?: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginBottom: 10, zIndex: z }}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        onPress={() => setOpen((s) => !s)}
        activeOpacity={0.9}
        style={[styles.input, styles.inputRow]}
      >
        <Text
          style={{ fontSize: 13, color: value ? '#0B1221' : PLACEHOLDER }}
          numberOfLines={1}
        >
          {value ? (renderLabel ? renderLabel(value) : String(value)) : `Select ${label.toLowerCase()}`}
        </Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color="#0B1221" />
      </TouchableOpacity>

      {open && (
        <View style={styles.dropdown}>
          {options.map((opt) => (
            <TouchableOpacity
              key={opt}
              onPress={() => { onSelect(opt); setOpen(false); }}
              style={styles.dropdownItem}
              activeOpacity={0.85}
            >
              <Text style={styles.dropdownText}>
                {renderLabel ? renderLabel(opt) : String(opt)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

/* -------------------------------------------
 * Main
 * -----------------------------------------*/
export default function EditOilModal({
  visible,
  item,
  onClose,
  onSaved,
}: {
  visible: boolean;
  item: DiiwaanOilRead | null;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { token } = useAuth();
  const [saving, setSaving] = useState(false);

  // Form state
  const [truckPlate, setTruckPlate] = useState('');
  const [truckType, setTruckType] = useState<string>('');
  const [oilType, setOilType] = useState<OilType | undefined>(undefined);
  const [status, setStatus] = useState<OilStatus | undefined>(undefined);
  const [qty, setQty] = useState('');
  const [liters, setLiters] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [fromLocation, setFromLocation] = useState('');
  const [toLocation, setToLocation] = useState('');
  const [depot, setDepot] = useState(false);
  const [depotName, setDepotName] = useState('');
  const [locationNotes, setLocationNotes] = useState('');

  const [currency, setCurrency] = useState('USD');
  const [landedPerL, setLandedPerL] = useState('');
  const [sellPerL, setSellPerL] = useState('');
  const [sellPerLot, setSellPerLot] = useState('');
  const [discountPerL, setDiscountPerL] = useState('');

  const [oilWell, setOilWell] = useState('');
  const [oilWellCost, setOilWellCost] = useState('');
  const [tax, setTax] = useState('');
  const [payStatus, setPayStatus] = useState('');

  // Animations
  const translateY = useRef(new Animated.Value(SHEET_MAX_HEIGHT)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    if (item) {
      setTruckPlate(item.truck_plate ?? '');
      setTruckType(item.truck_type ?? '');
      setOilType(item.oil_type);
      setStatus(item.status);
      setQty(String(item.qty ?? ''));
      setLiters(String(item.liters ?? ''));
      setSupplierName(item.supplier_name ?? '');
      setFromLocation(item.from_location ?? 'local_market');
      setToLocation(item.to_location ?? '');
      setDepot(!!item.depot);
      setDepotName(item.depot_name ?? '');
      setLocationNotes(item.location_notes ?? '');
      setCurrency((item.currency || 'USD').toUpperCase());
      setLandedPerL(item.landed_cost_per_l != null ? String(item.landed_cost_per_l) : '');
      setSellPerL(item.sell_price_per_l != null ? String(item.sell_price_per_l) : '');
      setSellPerLot(item.sell_price_per_lot != null ? String(item.sell_price_per_lot) : '');
      setDiscountPerL(item.discount_per_l != null ? String(item.discount_per_l) : '');
      setOilWell(item.oil_well ?? '');
      setOilWellCost(item.oil_well_cost != null ? String(item.oil_well_cost) : '');
      setTax(item.tax != null ? String(item.tax) : '');
      setPayStatus(item.pay_ment_status ?? '');
    }
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, bounciness: 5, speed: 14, useNativeDriver: true }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, item?.id]);

  const close = () => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 140, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: SHEET_MAX_HEIGHT, duration: 200, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  // Live calculations
  const oilTotalCost = useMemo(() => {
    const L = Number(liters || 0);
    const per = Number(landedPerL || 0);
    return L * per;
  }, [liters, landedPerL]);

  const subtotalLanded = useMemo(() => {
    const t = Number(tax || 0);
    const w = Number(oilWellCost || 0);
    return oilTotalCost + t + w;
  }, [oilTotalCost, tax, oilWellCost]);

  const canSave = useMemo(() => !!item, [item]);

  // Build minimal patch
  const buildPatch = () => {
    if (!item) return {};
    const patch: any = {};

    const setIfChanged = (key: string, val: any, orig: any) => {
      // turn '' into null for nullable strings
      if (val === '' || val === undefined || val === null) {
        if (typeof orig === 'string' && orig !== '' && val === '') patch[key] = null;
        return;
      }
      if (val !== orig) patch[key] = val;
    };

    setIfChanged('truck_plate', truckPlate, item.truck_plate ?? '');
    setIfChanged('truck_type', truckType, item.truck_type ?? '');
    if (oilType && oilType !== item.oil_type) patch.oil_type = oilType;
    if (status && status !== item.status) patch.status = status;

    if (qty !== String(item.qty)) patch.qty = Number(qty);
    if (liters !== String(item.liters)) patch.liters = Number(liters);

    setIfChanged('supplier_name', supplierName, item.supplier_name ?? '');
    setIfChanged('from_location', fromLocation, item.from_location ?? '');
    setIfChanged('to_location', toLocation, item.to_location ?? '');
    if (depot !== !!item.depot) patch.depot = depot;
    setIfChanged('depot_name', depotName, item.depot_name ?? '');
    setIfChanged('location_notes', locationNotes, item.location_notes ?? '');

    const cur = currency.toUpperCase();
    if (cur !== (item.currency || '').toUpperCase()) patch.currency = cur;

    if (landedPerL !== (item.landed_cost_per_l != null ? String(item.landed_cost_per_l) : ''))
      patch.landed_cost_per_l = landedPerL === '' ? null : Number(landedPerL);

    if (sellPerL !== (item.sell_price_per_l != null ? String(item.sell_price_per_l) : ''))
      patch.sell_price_per_l = sellPerL === '' ? null : Number(sellPerL);

    if (sellPerLot !== (item.sell_price_per_lot != null ? String(item.sell_price_per_lot) : ''))
      patch.sell_price_per_lot = sellPerLot === '' ? null : Number(sellPerLot);

    if (discountPerL !== (item.discount_per_l != null ? String(item.discount_per_l) : ''))
      patch.discount_per_l = discountPerL === '' ? null : Number(discountPerL);

    setIfChanged('oil_well', oilWell, item.oil_well ?? '');

    if (oilWellCost !== (item.oil_well_cost != null ? String(item.oil_well_cost) : ''))
      patch.oil_well_cost = oilWellCost === '' ? null : Number(oilWellCost);

    if (tax !== (item.tax != null ? String(item.tax) : ''))
      patch.tax = tax === '' ? null : Number(tax);

    setIfChanged('pay_ment_status', payStatus, item.pay_ment_status ?? '');

    delete patch.oil_total_cost;
    delete patch.total_landed_cost;
    return patch;
  };

  const save = async () => {
    if (!item) return;
    const patch = buildPatch();
    if (Object.keys(patch).length === 0) {
      close();
      return;
    }
    try {
      setSaving(true);
      await api.patch(`/diiwaanoil/${item.id}`, patch, {
        headers: { Authorization: `Bearer ${token}` },
      });
      onSaved?.();
      setSaving(false);
      close();
    } catch (e: any) {
      setSaving(false);
      Alert.alert('Update failed', e?.response?.data?.detail || 'Unable to update record.');
    }
  };

  if (!item) return null;

  const statusColors = STATUS_COLORS[(status ?? item.status) as OilStatus] || { bg: '#EEE', fg: '#111' };

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={close}>
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={close}>
        <Animated.View style={[styles.backdrop, { opacity }]} />
      </TouchableWithoutFeedback>

      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        style={{ flex: 1 }}
      >
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          {/* Grabber + Header */}
          <View style={styles.grabberWrap}>
            <View style={styles.grabber} />
          </View>

          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={styles.headerIcon}>
                <Feather name="edit-3" size={14} color="#0F172A" />
              </View>
              <Text style={styles.title}>Edit Oil Record</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View
                style={[
                  styles.statusChip,
                  { backgroundColor: statusColors.bg, borderColor: 'rgba(0,0,0,0.06)' },
                ]}
              >
                <Text style={[styles.statusChipText, { color: statusColors.fg }]}>
                  {humanStatus(status ?? item.status)}
                </Text>
              </View>
              <TouchableOpacity onPress={close} hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}>
                <Feather name="x" size={18} color="#0B1221" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Body */}
          <View style={{ flex: 1 }}>
            <ScrollView
              contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 96 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Truck */}
              <Text style={styles.section}>Truck</Text>
              <View style={styles.row}>
                <View style={styles.col}>
                  <Text style={styles.label}>Truck plate</Text>
                  <TextInput
                    value={truckPlate}
                    onChangeText={setTruckPlate}
                    placeholder="ABC-123"
                    placeholderTextColor={PLACEHOLDER}
                    style={styles.input}
                    autoCapitalize="characters"
                  />
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>Truck type</Text>
                  <TextInput
                    value={truckType}
                    onChangeText={setTruckType}
                    placeholder="Optional"
                    placeholderTextColor={PLACEHOLDER}
                    style={styles.input}
                  />
                </View>
              </View>

              {/* Oil / Status */}
              <Text style={styles.section}>Oil</Text>
              <InlineSelect
                label="Oil type"
                value={oilType}
                onSelect={setOilType}
                options={OIL_TYPES}
                renderLabel={(v) => cap(v)}
                z={60}
              />
              <InlineSelect
                label="Status"
                value={status}
                onSelect={setStatus}
                options={STATUSES}
                renderLabel={humanStatus}
                z={50}
              />

              {/* Quantity */}
              <Text style={styles.section}>Quantity</Text>
              <View style={styles.row}>
                <View style={styles.col}>
                  <Text style={styles.label}>Qty</Text>
                  <TextInput
                    value={qty}
                    onChangeText={(t) => setQty(filterInt(t))}
                    placeholder="10"
                    placeholderTextColor={PLACEHOLDER}
                    style={styles.input}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>Liters</Text>
                  <TextInput
                    value={liters}
                    onChangeText={(t) => setLiters(filterInt(t))}
                    placeholder="20000"
                    placeholderTextColor={PLACEHOLDER}
                    style={styles.input}
                    keyboardType="number-pad"
                  />
                </View>
              </View>

              {/* Locations */}
              <Text style={styles.section}>Logistics</Text>
              <View style={styles.row}>
                <View style={styles.col}>
                  <Text style={styles.label}>From location</Text>
                  <TextInput
                    value={fromLocation}
                    onChangeText={setFromLocation}
                    placeholder="local_market"
                    placeholderTextColor={PLACEHOLDER}
                    style={styles.input}
                  />
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>To location</Text>
                  <TextInput
                    value={toLocation}
                    onChangeText={setToLocation}
                    placeholder="Optional"
                    placeholderTextColor={PLACEHOLDER}
                    style={styles.input}
                  />
                </View>
              </View>

              <View style={styles.toggleRow}>
                <Text style={styles.label}>Depot</Text>
                <Switch value={depot} onValueChange={setDepot} />
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>Depot name</Text>
                <TextInput
                  value={depotName}
                  onChangeText={setDepotName}
                  placeholder="Optional"
                  placeholderTextColor={PLACEHOLDER}
                  style={styles.input}
                />
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>Location notes</Text>
                <TextInput
                  value={locationNotes}
                  onChangeText={setLocationNotes}
                  placeholder="Optional"
                  placeholderTextColor={PLACEHOLDER}
                  style={styles.input}
                />
              </View>

              {/* Pricing */}
              <Text style={styles.section}>Pricing</Text>
              <View style={styles.row}>
                <View style={styles.col}>
                  <Text style={styles.label}>Currency (3-letter)</Text>
                  <TextInput
                    value={currency}
                    onChangeText={(t) => setCurrency(t.toUpperCase())}
                    placeholder="USD"
                    placeholderTextColor={PLACEHOLDER}
                    style={styles.input}
                    autoCapitalize="characters"
                  />
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>Landed cost / L</Text>
                  <TextInput
                    value={landedPerL}
                    onChangeText={(t) => setLandedPerL(filterNum(t))}
                    placeholder="1.25"
                    placeholderTextColor={PLACEHOLDER}
                    style={styles.input}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={styles.col}>
                  <Text style={styles.label}>Sell price / L</Text>
                  <TextInput
                    value={sellPerL}
                    onChangeText={(t) => setSellPerL(filterNum(t))}
                    placeholder="1.45"
                    placeholderTextColor={PLACEHOLDER}
                    style={styles.input}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>Sell price / lot</Text>
                  <TextInput
                    value={sellPerLot}
                    onChangeText={(t) => setSellPerLot(filterNum(t))}
                    placeholder="Optional"
                    placeholderTextColor={PLACEHOLDER}
                    style={styles.input}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={styles.col}>
                  <Text style={styles.label}>Discount / L</Text>
                  <TextInput
                    value={discountPerL}
                    onChangeText={(t) => setDiscountPerL(filterNum(t))}
                    placeholder="Optional"
                    placeholderTextColor={PLACEHOLDER}
                    style={styles.input}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>Payment status</Text>
                  <TextInput
                    value={payStatus}
                    onChangeText={setPayStatus}
                    placeholder="paid / partial / unpaid"
                    placeholderTextColor={PLACEHOLDER}
                    style={styles.input}
                  />
                </View>
              </View>

              {/* Well & Tax */}
              <Text style={styles.section}>Well & Tax</Text>
              <View style={styles.row}>
                <View style={styles.col}>
                  <Text style={styles.label}>Oil well</Text>
                  <TextInput
                    value={oilWell}
                    onChangeText={setOilWell}
                    placeholder="Optional"
                    placeholderTextColor={PLACEHOLDER}
                    style={styles.input}
                  />
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>Oil well cost</Text>
                  <TextInput
                    value={oilWellCost}
                    onChangeText={(t) => setOilWellCost(filterNum(t))}
                    placeholder="500.00"
                    placeholderTextColor={PLACEHOLDER}
                    style={styles.input}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              <View style={styles.col}>
                <Text style={styles.label}>Tax</Text>
                <TextInput
                  value={tax}
                  onChangeText={(t) => setTax(filterNum(t))}
                  placeholder="0.00"
                  placeholderTextColor={PLACEHOLDER}
                  style={styles.input}
                  keyboardType="decimal-pad"
                />
              </View>

              {/* Compact Summary */}
              <View style={styles.summaryCard}>
                <View style={styles.summaryHead}>
                  <Feather name="file-text" size={14} color="#0B1221" />
                  <Text style={styles.summaryTitle}>Totals</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryKey}>Total Oil Cost</Text>
                  <Text style={styles.summaryVal}>{fmtMoney(oilTotalCost, currency)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryKey}>Oil Well Cost</Text>
                  <Text style={styles.summaryVal}>{fmtMoney(Number(oilWellCost || 0), currency)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryKey}>Tax</Text>
                  <Text style={styles.summaryVal}>{fmtMoney(Number(tax || 0), currency)}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryKey, { fontWeight: '800' }]}>Subtotal (Landed)</Text>
                  <Text style={[styles.summaryVal, { fontWeight: '800' }]}>
                    {fmtMoney(subtotalLanded, currency)}
                  </Text>
                </View>
              </View>

              {/* Spacer for sticky footer */}
              <View style={{ height: 8 }} />
            </ScrollView>

            {/* Sticky Footer */}
            <View style={styles.footer}>
              <TouchableOpacity
                style={[styles.saveBtn, (!canSave || saving) && { opacity: 0.6 }]}
                onPress={save}
                disabled={!canSave || saving}
                activeOpacity={0.92}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Feather name="save" size={15} color="#fff" />
                    <Text style={styles.saveTxt}>Save changes</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* -------------------------------------------
 * Styles
 * -----------------------------------------*/
const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.35)' },

  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    maxHeight: SHEET_MAX_HEIGHT,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: RADIUS,
    borderTopRightRadius: RADIUS,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
    elevation: 18,
  },

  grabberWrap: { alignItems: 'center', paddingTop: 8 },
  grabber: { width: 46, height: 4, backgroundColor: '#E5E7EB', borderRadius: 999 },

  header: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomColor: '#F1F5F9',
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerIcon: {
    width: 26, height: 26, borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 16, fontWeight: '800', color: '#0B1221' },

  section: { marginTop: 10, marginBottom: 6, fontSize: 12, color: '#0B1221', fontWeight: '800' },

  row: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  col: { flex: 1, marginBottom: 6 },

  label: { fontSize: 11, color: '#6B7280', marginBottom: 4 },

  input: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 10,
    backgroundColor: '#fff',
    fontSize: 13,
    color: '#0B1221',
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  dropdown: {
    marginTop: 4,
    borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 10,
    backgroundColor: '#FFF',
    overflow: 'hidden',
    // ensure it floats above neighbors
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  dropdownItem: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
  },
  dropdownText: { fontSize: 13, color: '#0B1221' },

  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusChipText: { fontSize: 10, fontWeight: '800', textTransform: 'capitalize' },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },

  summaryCard: {
    marginTop: 4,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  summaryHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  summaryTitle: { fontSize: 13, fontWeight: '800', color: '#0B1221' },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 3 },
  summaryKey: { color: '#6B7280', fontSize: 12 },
  summaryVal: { color: '#0B1221', fontWeight: '700', fontSize: 12 },
  divider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 8 },

  footer: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  saveBtn: {
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
  saveTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
