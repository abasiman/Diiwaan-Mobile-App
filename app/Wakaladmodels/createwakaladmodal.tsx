import api from '@/services/api';
import { useAuth } from '@/src/context/AuthContext';
import { Feather } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import OilExtraCostModal from '../Shidaal/oilExtraCostModal';

const COLOR_BG = '#FFFFFF';
const COLOR_TEXT = '#0B1221';
const COLOR_SUB = '#475569';
const COLOR_PLACEHOLDER = '#64748B';
const COLOR_BORDER = '#94A3B8';
const COLOR_BORDER_FOCUS = '#0F172A';
const COLOR_DIVIDER = '#E5E7EB';
const COLOR_INPUT_BG = '#F9FAFB';
const COLOR_ACCENT = '#0F172A';
const DARK_BORDER = '#334155';

const FUUSTO_DEFAULT_L = 240;
const CAAG_L = 20;

const fuustoCap = (oilType?: string) =>
  (oilType || '').toLowerCase() === 'petrol' ? 240 : FUUSTO_DEFAULT_L;

/** Types */
type OilSellOption = {
  id: number;
  oil_id: number;
  lot_id?: number | null;
  oil_type: string;
  truck_plate?: string | null;
  in_stock_l: number;
  in_stock_fuusto: number;
  in_stock_caag: number;
  currency?: string | null;
  liter_price?: number | null;
  fuusto_price?: number | null;
  caag_price?: number | null;
};

type WakaaladCreatePayload = {
  oil_id: number;
  wakaalad_name: string;
  allocate_liters: number;
  date?: string;
};

type Props = { visible: boolean; onClose: () => void; onCreated?: (id: number) => void };

/** Toast */
function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const show = (msg: string, duration = 1800) => {
    setMessage(msg);
    Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: true }).start(() => {
      setTimeout(() => {
        Animated.timing(anim, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => setMessage(null));
      }, duration);
    });
  };
  const ToastView = () =>
    message ? (
      <Animated.View
        pointerEvents="none"
        style={[
          styles.toast,
          { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] },
        ]}
      >
        <Feather name="check-circle" size={16} color="#065F46" />
        <Text style={styles.toastText}>{message}</Text>
      </Animated.View>
    ) : null;
  return { show, ToastView };
}

/** Floating Input & Picker */
function FloatingInput({
  label,
  value,
  onChangeText,
  keyboardType = 'default',
  editable = true,
  placeholder = '',
  style,
}: {
  label: string;
  value: string;
  onChangeText?: (t: string) => void;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
  editable?: boolean;
  placeholder?: string;
  style?: any;
}) {
  const [focused, setFocused] = useState(false);
  const active = focused || (value?.length ?? 0) > 0;
  return (
    <View style={[{ marginBottom: 20 }, style]}>
      <View
        style={[
          styles.floatWrap,
          { borderColor: DARK_BORDER, backgroundColor: COLOR_INPUT_BG },
          focused && { borderColor: COLOR_BORDER_FOCUS },
        ]}
      >
        <Text style={[styles.floatLabel, active && styles.floatLabelActive]}>{label}</Text>
        <TextInput
          style={[styles.inputBase, styles.inputPadded]}
          value={value}
          onChangeText={onChangeText}
          editable={editable}
          keyboardType={keyboardType}
          placeholder={placeholder}
          placeholderTextColor={COLOR_PLACEHOLDER}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </View>
    </View>
  );
}

function PickerField({
  label,
  value,
  onPress,
  style,
}: {
  label: string;
  value?: string;
  onPress: () => void;
  style?: any;
}) {
  const hasValue = !!value;
  return (
    <View style={[{ marginBottom: 20 }, style]}>
      <View style={[styles.floatWrap, { borderColor: DARK_BORDER, backgroundColor: COLOR_INPUT_BG }]}>
        <Text style={[styles.floatLabel, (hasValue ? true : false) && styles.floatLabelActive]}>{label}</Text>
        <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={[styles.inputBase, styles.inputPadded]}>
          <Text numberOfLines={1} style={[styles.inputText, { color: hasValue ? COLOR_TEXT : COLOR_PLACEHOLDER }]}>
            {hasValue ? value : 'Select'}
          </Text>
          <Feather name="chevron-down" size={18} color={COLOR_TEXT} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** Component */
export default function CreateWakaaladModal({ visible, onClose, onCreated }: Props) {
  const { token } = useAuth();
  const { show: showToast, ToastView } = useToast();

  const insets = useSafeAreaInsets();
  const bottomSafe = insets.bottom || 0;
  const SCREEN_H = Dimensions.get('window').height;
  const SHEET_H = Math.round(SCREEN_H * 0.96);
  const slideY = useRef(new Animated.Value(SHEET_H)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(slideY, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else {
      slideY.setValue(SHEET_H);
    }
  }, [visible, SHEET_H, slideY]);

  // data
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [options, setOptions] = useState<OilSellOption[]>([]);
  const [oilPickerOpen, setOilPickerOpen] = useState(false);
  const [oilQuery, setOilQuery] = useState('');

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = useMemo(() => options.find((o) => o.id === selectedId) || null, [options, selectedId]);

  const [wkName, setWkName] = useState('');
  const [allocAmt, setAllocAmt] = useState('');
  const [unit, setUnit] = useState<'fuusto' | 'liters' | 'caag'>('fuusto');
  const [unitPickerOpen, setUnitPickerOpen] = useState(false);

  // creation + extra-costs
  const [creating, setCreating] = useState(false);
  const [showExtraCosts, setShowExtraCosts] = useState(false);

  // Decoupled IDs for extras (so we can clear form without unmounting modal)
  const [extraOilId, setExtraOilId] = useState<number | undefined>(undefined);
  const [extraLotId, setExtraLotId] = useState<number | undefined>(undefined);

  // Prefills for OilExtraCostModal (persist even if form resets)
  const [extraPrefillName, setExtraPrefillName] = useState<string | null>(null);
  const [extraPrefillQty, setExtraPrefillQty] = useState<number | null>(null);

  // fetch options
  useEffect(() => {
    if (!visible) return;
    let mounted = true;
    (async () => {
      try {
        setLoadingOptions(true);
        const res = await api.get<OilSellOption[]>('/diiwaanoil/sell-options', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          params: { only_available: true, order: 'created_desc' },
        });
        if (!mounted) return;
        setOptions(res.data || []);
      } catch (e: any) {
        showToast(String(e?.response?.data?.detail || 'Failed to load oil lots'));
      } finally {
        if (mounted) setLoadingOptions(false);
      }
    })();
    return () => { mounted = false; };
  }, [visible, token]);

  const toDecimal = (s: string) => {
    let out = s.replace(/[^0-9.]/g, '');
    const firstDot = out.indexOf('.');
    if (firstDot !== -1) out = out.slice(0, firstDot + 1) + out.slice(firstDot + 1).replace(/\./g, '');
    return out;
  };

  // helpers
  const filteredOptions = useMemo(() => {
    const q = oilQuery.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        (o.oil_type || '').toLowerCase().includes(q) ||
        (o.truck_plate || '').toLowerCase().includes(q)
    );
  }, [oilQuery, options]);

  const allocLiters = useMemo(() => {
    const v = parseFloat((allocAmt || '').replace(',', '.'));
    if (!Number.isFinite(v)) return 0;
    if (unit === 'liters') return v;
    if (unit === 'fuusto') return v * fuustoCap(selected?.oil_type);
    return v * CAAG_L;
  }, [allocAmt, unit, selected?.oil_type]);

  const availableInUnit = useMemo(() => {
    if (!selected) return 0;
    if (unit === 'liters') return Number(selected.in_stock_l || 0);
    if (unit === 'fuusto') return Math.floor(Number(selected.in_stock_fuusto || 0));
    return Math.floor(Number(selected.in_stock_caag || 0));
  }, [selected, unit]);

  const exceeds = useMemo(
    () => (selected ? allocLiters > (Number(selected.in_stock_l || 0) + 1e-9) : false),
    [selected, allocLiters]
  );

  const canSubmit = !!(selected && wkName.trim() && allocLiters > 0 && !exceeds);

  // wakaalada → “fuusto” count for extra-costs
  const qtyBarrels = useMemo(() => {
    const count = parseFloat((allocAmt || '').replace(',', '.')) || 0;
    const fCap = fuustoCap(selected?.oil_type);
    if (unit === 'fuusto') return Math.floor(count);
    if (unit === 'liters') return Math.floor(allocLiters / fCap);
    return Math.floor((count * CAAG_L) / fCap);
  }, [allocAmt, unit, selected?.oil_type, allocLiters]);

  /** Create wakaalad, then TRIGGER OilExtraCostModal (keep this modal open) */
  async function handleSaveOpenExtras() {
    if (!selected || !canSubmit || creating) return;

    const prefillName = `${wkName.trim()} - wakaalad`;
    const prefillQty = qtyBarrels;

    // capture IDs for the extras modal BEFORE clearing form state
    const oilIdForExtras = selected.lot_id ? undefined : (selected.oil_id ?? selected.id);
    const lotIdForExtras = selected.lot_id ?? undefined;

    const payload: WakaaladCreatePayload = {
      oil_id: selected.oil_id ?? selected.id,
      wakaalad_name: wkName.trim(),
      allocate_liters: allocLiters,
    };

    try {
      setCreating(true);

      const res = await api.post('/wakaalad_diiwaan', payload, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      onCreated?.(Number(res?.data?.id || 0));
      showToast('Wakaalad saved');

      // prime the extras modal
      setExtraOilId(oilIdForExtras);
      setExtraLotId(lotIdForExtras);
      setExtraPrefillName(prefillName);
      setExtraPrefillQty(prefillQty);

      // open extras immediately
      setShowExtraCosts(true);

      // reset inputs for next entry (safe because extras modal is now decoupled from `selected`)
      setSelectedId(null);
      setWkName('');
      setAllocAmt('');
      setUnit('fuusto');
    } catch (e: any) {
      showToast(String(e?.response?.data?.detail || e?.message || 'Unable to save wakaalad'));
    } finally {
      setCreating(false);
    }
  }

  const handleCloseAll = () => {
    if (showExtraCosts) return; // block dismiss while extra modal is up
    setOilPickerOpen(false);
    setUnitPickerOpen(false);
    onClose();
  };

  return (
    <>
      <Modal visible={visible} animationType="none" onRequestClose={handleCloseAll} transparent>
        <TouchableWithoutFeedback onPress={handleCloseAll}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <Animated.View style={[styles.sheetWrapAbs, { height: SHEET_H, transform: [{ translateY: slideY }] }]}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
            style={{ flex: 1 }}
          >
            <View style={[styles.sheetCard, { paddingBottom: Math.max(18, bottomSafe) }]}>
              <View style={styles.sheetHandle} />

              {/* Header */}
              <View style={styles.headerRow}>
                <Text style={styles.titleCenter}>Save Wakaalad</Text>
                <TouchableOpacity
                  onPress={handleCloseAll}
                  disabled={showExtraCosts}
                  style={[styles.closeBtn, showExtraCosts && { opacity: 0.4 }]}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Feather name="x" size={20} color={COLOR_TEXT} />
                </TouchableOpacity>
              </View>

              {/* Content */}
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingTop: 16, paddingBottom: 24 }}
                showsVerticalScrollIndicator={false}
              >
                <PickerField
                  label="Dooro Gaariga Shidaalka"
                  value={selected ? `${(selected.oil_type || '').toUpperCase()} • ${selected.truck_plate || '—'}` : undefined}
                  onPress={() => {
                    setOilQuery('');
                    setOilPickerOpen(true);
                  }}
                  style={{ marginTop: 14 }}
                />

                <View style={{ flexDirection: 'row', gap: 16, marginBottom: 20 }}>
                  <FloatingInput
                    label="Wakaalad name"
                    value={wkName}
                    onChangeText={setWkName}
                    placeholder="magaca wakaalada"
                    style={{ flex: 1, marginBottom: 0 }}
                  />
                  <View style={{ flex: 1 }}>
                    <View style={[styles.floatWrap, { borderColor: DARK_BORDER, backgroundColor: COLOR_INPUT_BG }]}>
                      <Text style={[styles.floatLabel, styles.floatLabelActive]}>Qoondada</Text>
                      <TouchableOpacity style={[styles.inputBase, styles.inputPadded]} onPress={() => setUnitPickerOpen(true)} activeOpacity={0.9}>
                        <Text style={styles.inputText}>{unit === 'fuusto' ? 'Fuusto' : unit === 'caag' ? 'Caag' : 'Litir'}</Text>
                        <Feather name="chevron-down" size={18} color={COLOR_TEXT} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                <FloatingInput
                  label={`Tirada (${unit === 'liters' ? 'litir' : unit})`}
                  value={allocAmt}
                  onChangeText={(t) => setAllocAmt(toDecimal(t))}
                  keyboardType="decimal-pad"
                />

                {selected && allocLiters > 0 && exceeds && (
                  <View style={styles.inlineWarning}>
                    <Feather name="alert-triangle" size={14} color="#92400E" />
                    <Text style={styles.inlineWarningText}>
                      {`Requested ${unit === 'liters' ? `${allocLiters.toFixed(2)} L` : `${Number(allocAmt || 0)} ${unit}`} exceeds available ${
                        unit === 'liters' ? `${Number(selected.in_stock_l || 0).toFixed(2)} L` : `${Math.floor(availableInUnit)} ${unit}`
                      }.`}
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.submitBtn, (!canSubmit || creating) && { opacity: 0.7 }]}
                  disabled={!canSubmit || creating}
                  onPress={handleSaveOpenExtras}
                  activeOpacity={0.9}
                >
                  {creating ? (
                    <ActivityIndicator color="#fff" style={{ marginRight: 6 }} />
                  ) : (
                    <Feather name="save" size={16} color="#fff" style={{ marginRight: 6 }} />
                  )}
                  <Text style={styles.submitText}>Save Wakaalad</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>

          <ToastView />
        </Animated.View>
      </Modal>

      {/* Oil Lot Popup - Centered */}
      <Modal visible={oilPickerOpen} transparent animationType="fade" onRequestClose={() => setOilPickerOpen(false)}>
        <TouchableWithoutFeedback onPress={() => setOilPickerOpen(false)}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <View style={styles.popupCenterWrap} pointerEvents="box-none">
          <View style={styles.popupCard}>
            <View style={styles.popupHeader}>
              <Text style={styles.popupTitle}>Select Oil lot</Text>
              <TouchableOpacity onPress={() => setOilPickerOpen(false)}>
                <Feather name="x" size={18} color={COLOR_TEXT} />
              </TouchableOpacity>
            </View>

            <View style={{ paddingHorizontal: 12, paddingBottom: 10, marginTop: 8 }}>
              <TextInput
                placeholder="Search oil or plate…"
                placeholderTextColor={COLOR_PLACEHOLDER}
                style={[styles.inputBase, styles.inputPadded, styles.popupSearch]}
                value={oilQuery}
                onChangeText={setOilQuery}
              />
            </View>

            {loadingOptions ? (
              <View style={{ padding: 14, alignItems: 'center' }}>
                <ActivityIndicator />
              </View>
            ) : filteredOptions.length === 0 ? (
              <View style={{ padding: 14 }}>
                <Text style={{ color: COLOR_SUB, fontSize: 12 }}>No matching lots.</Text>
              </View>
            ) : (
              <ScrollView style={styles.popupScroll}>
                {filteredOptions.map((o) => (
                  <TouchableOpacity
                    key={o.id}
                    style={styles.optionRowSm}
                    onPress={() => {
                      setSelectedId(o.id);
                      setOilPickerOpen(false);
                    }}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.pickerMain}>{(o.oil_type || '').toUpperCase()} • {o.truck_plate || '—'}</Text>
                    <Text style={styles.pickerSub}>Stock: {Number(o.in_stock_l || 0).toFixed(2)} L</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Unit Popup - Centered */}
      <Modal visible={unitPickerOpen} transparent animationType="fade" onRequestClose={() => setUnitPickerOpen(false)}>
        <TouchableWithoutFeedback onPress={() => setUnitPickerOpen(false)}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <View style={styles.popupCenterWrap} pointerEvents="box-none">
          <View style={styles.popupCard}>
            <View style={styles.popupHeader}>
              <Text style={styles.popupTitle}>Qoondo</Text>
              <TouchableOpacity onPress={() => setUnitPickerOpen(false)}>
                <Feather name="x" size={18} color={COLOR_TEXT} />
              </TouchableOpacity>
            </View>

            <View style={{ height: 6 }} />

            <TouchableOpacity style={styles.optionRowSm} onPress={() => { setUnit('fuusto'); setUnitPickerOpen(false); }}>
              <Text style={styles.pickerMain}>Fuusto (×{fuustoCap(selected?.oil_type)} L)</Text>
              {selected ? (
                <Text style={styles.pickerSub}>Available: {Math.floor(Number(selected.in_stock_fuusto || 0))} fuusto</Text>
              ) : null}
            </TouchableOpacity>

            <TouchableOpacity style={styles.optionRowSm} onPress={() => { setUnit('caag'); setUnitPickerOpen(false); }}>
              <Text style={styles.pickerMain}>Caag (×{CAAG_L} L)</Text>
              {selected ? <Text style={styles.pickerSub}>Available: {Math.floor(Number(selected.in_stock_caag || 0))} caag</Text> : null}
            </TouchableOpacity>

            <TouchableOpacity style={[styles.optionRowSm, { borderBottomWidth: 0 }]} onPress={() => { setUnit('liters'); setUnitPickerOpen(false); }}>
              <Text style={styles.pickerMain}>Litir</Text>
              {selected ? <Text style={styles.pickerSub}>Available: {Number(selected.in_stock_l || 0).toFixed(2)} L</Text> : null}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Extra Costs Modal (triggered right after creation; parent stays open) */}
      <OilExtraCostModal
        visible={showExtraCosts}
        onClose={() => setShowExtraCosts(false)}
        oilId={extraOilId}
        lotId={extraLotId}
        defaultCategoryName={extraPrefillName ?? `${wkName.trim()} - wakaalad`}
        defaultQtyBarrel={extraPrefillQty ?? 0}
        // Do NOT auto-close the parent; let caller decide after finishing extra costs.
      />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },

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
  sheetHandle: { alignSelf: 'center', width: 46, height: 5, borderRadius: 3, backgroundColor: '#E5E7EB', marginBottom: 8 },
  headerRow: { minHeight: 34, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  closeBtn: {
    position: 'absolute', right: 4, top: -2, width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
  },
  titleCenter: { fontSize: 18, fontWeight: '800', color: COLOR_TEXT, textAlign: 'center' },

  floatWrap: { borderWidth: 1.2, borderColor: COLOR_BORDER, borderRadius: 12, backgroundColor: COLOR_INPUT_BG, position: 'relative' },
  floatLabel: { position: 'absolute', left: 10, top: -10, paddingHorizontal: 6, backgroundColor: COLOR_BG, fontSize: 11, color: COLOR_PLACEHOLDER },
  floatLabelActive: { color: COLOR_BORDER_FOCUS, fontWeight: '800' },

  inputBase: { minHeight: 48, alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  inputPadded: { paddingHorizontal: 12, paddingVertical: 10 },
  inputText: { fontSize: 15, color: COLOR_TEXT },

  inlineWarning: {
    marginTop: -2,
    marginBottom: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineWarningText: { color: '#92400E', fontSize: 12, flex: 1, lineHeight: 18 },

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

  popupCenterWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },

  popupCard: {
    width: '92%',
    maxWidth: 560,
    borderRadius: 16,
    backgroundColor: '#fff',
    paddingBottom: 8,
    borderWidth: 1,
    borderColor: DARK_BORDER,
    maxHeight: '76%',
    overflow: 'hidden',
  },
  popupHeader: {
    paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: DARK_BORDER,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8FAFC',
  },
  popupTitle: { fontWeight: '800', color: COLOR_TEXT, fontSize: 14 },
  popupSearch: { borderRadius: 10, borderWidth: 1.2, borderColor: DARK_BORDER, backgroundColor: '#FFFFFF' },
  popupScroll: { maxHeight: 420 },

  optionRowSm: { paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLOR_DIVIDER },
  pickerMain: { fontSize: 13.5, fontWeight: '700', color: COLOR_TEXT },
  pickerSub: { fontSize: 11.5, color: COLOR_SUB, marginTop: 2 },

  toast: {
    position: 'absolute', bottom: 14, left: 14, right: 14,
    paddingVertical: 10, paddingHorizontal: 12, backgroundColor: '#ECFDF5',
    borderWidth: 1, borderColor: '#D1FAE5',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  toastText: { color: '#065F46', fontWeight: '700', fontSize: 12 },
});
