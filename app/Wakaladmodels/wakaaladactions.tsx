// app/Wakaladmodels/wakaaladactions.tsx
import api from '@/services/api';
import { useAuth } from '@/src/context/AuthContext';
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import dayjs from 'dayjs';
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
import type { WakaaladRead } from '../Wakaalad/wakaalad_dashboard';

export type WakaaladActionMode = 'edit' | 'delete' | 'restock';

type Props = {
  visible: boolean;
  mode: WakaaladActionMode;
  wakaalad: WakaaladRead | null;
  onClose: () => void;
  onSuccess: () => void; // called after successful action
};

type OilSellOption = {
  id: number;
  oil_type: string;
  truck_plate?: string | null;
  in_stock_l: number;
  in_stock_fuusto?: number;
  in_stock_caag?: number;
  currency?: string | null;
  liter_price?: number | null;
  fuusto_price?: number | null;
  caag_price?: number | null;
};

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
const COLOR_WARN = '#B91C1C';

const FUUSTO_DEFAULT_L = 240;
const CAAG_L = 20;

const fuustoCap = (oilType?: string) =>
  (oilType || '').toLowerCase() === 'petrol' ? 230 : FUUSTO_DEFAULT_L;

type Unit = 'fuusto' | 'liters' | 'caag';

/** Small pill tabs */
const TabButton = ({
  active,
  label,
  icon,
  onPress,
}: {
  active: boolean;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
}) => (
  <TouchableOpacity
    onPress={onPress}
    style={[styles.tabBtn, active && { backgroundColor: '#EEF2FF', borderColor: '#DDE3F0' }]}
    activeOpacity={0.9}
  >
    <Feather name={icon} size={12} color={active ? COLOR_ACCENT : '#334155'} />
    <Text style={[styles.tabTxt, active && { color: COLOR_ACCENT }]}>{label}</Text>
  </TouchableOpacity>
);

/** Floating text input (same vibe as CreateWakaaladModal) */
function FloatingInput({
  label,
  value,
  onChangeText,
  keyboardType = 'default',
  editable = true,
  placeholder = '',
  style,
  onPressIn,
}: {
  label: string;
  value: string;
  onChangeText?: (t: string) => void;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
  editable?: boolean;
  placeholder?: string;
  style?: any;
  onPressIn?: () => void;
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
          !editable && styles.inputDisabled,
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
          onPressIn={onPressIn}
        />
      </View>
    </View>
  );
}

/** Pressable floating field */
function PickerField({
  label,
  value,
  onPress,
  style,
  disabled,
}: {
  label: string;
  value?: string;
  onPress: () => void;
  style?: any;
  disabled?: boolean;
}) {
  const hasValue = !!value;
  return (
    <View style={[{ marginBottom: 20 }, style]}>
      <View
        style={[
          styles.floatWrap,
          { borderColor: DARK_BORDER, backgroundColor: COLOR_INPUT_BG },
          disabled && { opacity: 0.6 },
        ]}
      >
        <Text style={[styles.floatLabel, (hasValue ? true : false) && styles.floatLabelActive]}>{label}</Text>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={onPress}
          disabled={disabled}
          style={[styles.inputBase, styles.inputPadded]}
        >
          <Text numberOfLines={1} style={[styles.inputText, { color: hasValue ? COLOR_TEXT : COLOR_PLACEHOLDER }]}>
            {hasValue ? value : 'Select'}
          </Text>
          <Feather name="chevron-down" size={18} color={COLOR_TEXT} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** Clean popup to choose an oil lot */
function OilPickerModal({
  open,
  onClose,
  options,
  loading,
  query,
  setQuery,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  options: OilSellOption[];
  loading: boolean;
  query: string;
  setQuery: (t: string) => void;
  onSelect: (opt: OilSellOption) => void;
}) {
  return (
    <Modal transparent visible={open} animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={styles.popupCard}>
              <View style={styles.popupHeader}>
                <Text style={styles.popupTitle}>Select Oil lot</Text>
                <TouchableOpacity onPress={onClose}>
                  <Feather name="x" size={18} color={COLOR_TEXT} />
                </TouchableOpacity>
              </View>

              <View style={{ paddingHorizontal: 12, paddingBottom: 10 }}>
                <TextInput
                  placeholder="Search oil or plate…"
                  placeholderTextColor={COLOR_PLACEHOLDER}
                  style={[styles.inputBase, styles.inputPadded, styles.popupSearch]}
                  value={query}
                  onChangeText={setQuery}
                />
              </View>

              {loading ? (
                <View style={{ padding: 14, alignItems: 'center' }}>
                  <ActivityIndicator />
                </View>
              ) : options.length === 0 ? (
                <View style={{ padding: 14 }}>
                  <Text style={{ color: COLOR_SUB, fontSize: 12 }}>No matching lots.</Text>
                </View>
              ) : (
                <ScrollView style={{ maxHeight: 420 }}>
                  {options.map((o) => (
                    <TouchableOpacity
                      key={o.id}
                      style={styles.optionRowSm}
                      onPress={() => onSelect(o)}
                      activeOpacity={0.9}
                    >
                      <Text style={styles.pickerMain}>
                        {(o.oil_type || '').toUpperCase()} • {o.truck_plate || '—'}
                      </Text>
                      <Text style={styles.pickerSub}>Stock: {Number(o.in_stock_l || 0).toFixed(2)} L</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

/** ---- Main Modal ---- */
const WakaaladActionsModal: React.FC<Props> = ({ visible, mode, wakaalad, onClose, onSuccess }) => {
  const isOpen = visible && !!wakaalad;

  const { token } = useAuth();
  const headers = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : undefined), [token]);

  // bottom-sheet geometry (match CreateWakaaladModal)
  const insets = useSafeAreaInsets();
  const bottomSafe = insets.bottom || 0;
  const SCREEN_H = Dimensions.get('window').height;
  const SHEET_H = Math.round(SCREEN_H * 0.92);
  const slideY = useRef(new Animated.Value(SHEET_H)).current;

  useEffect(() => {
    if (isOpen) {
      Animated.timing(slideY, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      slideY.setValue(SHEET_H);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const title =
    mode === 'edit' ? 'Edit Wakaalad' : mode === 'restock' ? 'Restock Wakaalad' : 'Delete Wakaalad';

  // tabs
  const [tab, setTab] = useState<WakaaladActionMode>(mode);
  useEffect(() => setTab(mode), [mode, visible]);

  // shared
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // edit
  const [name, setName] = useState<string>(wakaalad?.wakaalad_name ?? '');
  const [editDate, setEditDate] = useState<Date>(wakaalad?.date ? new Date(wakaalad.date) : new Date());
  const [showEditDate, setShowEditDate] = useState(false);

  // delete
  const [confirmTxt, setConfirmTxt] = useState('');

  // restock
  const [oilPickerOpen, setOilPickerOpen] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [options, setOptions] = useState<OilSellOption[]>([]);
  const [oilQuery, setOilQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = useMemo(() => options.find((o) => o.id === selectedId) || null, [options, selectedId]);

  const [unitPickerOpen, setUnitPickerOpen] = useState(false);
  const [unit, setUnit] = useState<Unit>('fuusto');
  const [amount, setAmount] = useState<string>(''); // number in chosen unit
  const [restockDate, setRestockDate] = useState<Date>(new Date());
  const [showRestockDate, setShowRestockDate] = useState(false);

  // reset when opening or wakaalad changes
  useEffect(() => {
    setErr(null);
    setLoading(false);
    setName(wakaalad?.wakaalad_name ?? '');
    setEditDate(wakaalad?.date ? new Date(wakaalad.date) : new Date());
    setConfirmTxt('');
    setOilPickerOpen(false);
    setOptions([]);
    setLoadingOptions(false);
    setOilQuery('');
    setSelectedId(null);
    setAmount('');
    setUnit('fuusto');
    setRestockDate(new Date());
    setShowEditDate(false);
    setShowRestockDate(false);
  }, [wakaalad, visible]);

  // fetch oil options when entering restock tab
  useEffect(() => {
    if (!isOpen) return;
    if (tab !== 'restock') return;
    let mounted = true;
    (async () => {
      try {
        setLoadingOptions(true);
        const res = await api.get<OilSellOption[]>('/diiwaanoil/sell-options', {
          headers,
          params: { only_available: true, order: 'created_desc' },
        });
        if (!mounted) return;
        setOptions(res.data || []);
      } catch (e: any) {
        setErr(String(e?.response?.data?.detail || 'Failed to load oil lots'));
      } finally {
        if (mounted) setLoadingOptions(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [tab, isOpen, headers]);

  const filteredOptions = useMemo(() => {
    const q = oilQuery.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        (o.oil_type || '').toLowerCase().includes(q) ||
        (o.truck_plate || '').toLowerCase().includes(q)
    );
  }, [oilQuery, options]);

  // conversions
  const toDecimal = (s: string) => {
    let out = s.replace(/[^0-9.]/g, '');
    const firstDot = out.indexOf('.');
    if (firstDot !== -1) out = out.slice(0, firstDot + 1) + out.slice(firstDot + 1).replace(/\./g, '');
    return out;
  };

  const allocLiters = useMemo(() => {
  const v = parseFloat((amount || '').replace(',', '.'));
  if (!Number.isFinite(v)) return 0;
  if (unit === 'liters') return v;
  if (unit === 'fuusto') return v * fuustoCap(selected?.oil_type);
  return v * CAAG_L;
}, [amount, unit, selected?.oil_type]);


  const availableInUnit = useMemo(() => {
  if (!selected) return 0;
  const L = Number(selected.in_stock_l || 0);
  if (unit === 'liters') return L;
  if (unit === 'fuusto') return Math.floor(L / fuustoCap(selected.oil_type));
  return Math.floor(L / CAAG_L);
}, [selected, unit]);


  const exceeds = useMemo(() => (selected ? allocLiters > (Number(selected.in_stock_l || 0) + 1e-9) : false), [
    selected,
    allocLiters,
  ]);

  const canRestock = !!selected && allocLiters > 0 && !exceeds;

  /** ---------- EDIT ---------- */
  async function doEdit() {
    if (!headers || !wakaalad) return;
    const body: any = {};
    if (name && name.trim() !== '' && name.trim() !== wakaalad.wakaalad_name) body.wakaalad_name = name.trim();
    if (editDate) body.date = editDate.toISOString();

    if (Object.keys(body).length === 0) {
      handleCloseAll();
      return;
    }

    try {
      setLoading(true);
      setErr(null);
      await api.patch(`/wakaalad_diiwaan/${wakaalad.id}`, body, { headers });
      onSuccess();
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Failed to update.');
    } finally {
      setLoading(false);
    }
  }

  /** ---------- DELETE ---------- */
  async function doDelete() {
    if (!headers || !wakaalad) return;
    if (confirmTxt.trim().toLowerCase() !== 'delete') {
      setErr('Type "delete" to confirm.');
      return;
    }
    try {
      setLoading(true);
      setErr(null);
      await api.delete(`/wakaalad_diiwaan/${wakaalad.id}`, { headers });
      onSuccess();
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Failed to delete.');
    } finally {
      setLoading(false);
    }
  }

  /** ---------- RESTOCK ---------- */
  async function doRestock() {
    if (!headers || !wakaalad) return;
    if (!selected) {
      setErr('Select an oil lot.');
      return;
    }
    if (!canRestock) {
      setErr('Please enter a valid amount and ensure it does not exceed available stock.');
      return;
    }

    const body = {
      from_oil_id: selected.id,
      liters: allocLiters, // always send liters to backend
      date: restockDate?.toISOString(),
    };

    try {
      setLoading(true);
      setErr(null);
      await api.post(`/wakaalad_diiwaan/${wakaalad.id}/restock`, body, { headers });
      onSuccess();
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Failed to restock.');
    } finally {
      setLoading(false);
    }
  }

  const handleCloseAll = () => {
    setOilPickerOpen(false);
    setUnitPickerOpen(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <Modal visible={isOpen} animationType="none" onRequestClose={handleCloseAll} transparent>
        <TouchableWithoutFeedback onPress={handleCloseAll}>
          <View style={styles.backdropOverlay} />
        </TouchableWithoutFeedback>

        <Animated.View style={[styles.sheetWrapAbs, { height: SHEET_H, transform: [{ translateY: slideY }] }]}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 18 : 0}
            style={{ flex: 1 }}
          >
            <View style={[styles.sheetCard, { paddingBottom: Math.max(18, bottomSafe) }]}>
              <View style={styles.sheetHandle} />

              {/* Header */}
              <View style={styles.headerRow}>
                <Text style={styles.titleCenter}>{title}</Text>
                <TouchableOpacity
                  onPress={handleCloseAll}
                  style={styles.closeBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Feather name="x" size={20} color={COLOR_TEXT} />
                </TouchableOpacity>
              </View>
              <Text style={styles.subtitleCenter} numberOfLines={1}>
                {wakaalad!.wakaalad_name} • #{wakaalad!.id}
              </Text>

              {/* Tabs */}
              <View style={[styles.tabsRow, { marginTop: 12, marginBottom: 6 }]}>
                <TabButton active={tab === 'edit'} label="Edit" icon="edit-2" onPress={() => setTab('edit')} />
                <TabButton active={tab === 'restock'} label="Restock" icon="refresh-ccw" onPress={() => setTab('restock')} />
                <TabButton active={tab === 'delete'} label="Delete" icon="trash-2" onPress={() => setTab('delete')} />
              </View>

              {/* Content + Buttons grouped together */}
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingTop: 12, paddingBottom: 18 }}
                showsVerticalScrollIndicator={false}
              >
                {tab === 'edit' && (
                  <>
                    <FloatingInput label="Wakaalad name" value={name} onChangeText={setName} placeholder="magaca wakaalada" />
                    <PickerField
                      label="Date"
                      value={dayjs(editDate).format('MMM D, YYYY')}
                      onPress={() => setShowEditDate(true)}
                    />
                    {showEditDate && (
                      <DateTimePicker
                        value={editDate}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(_, sel) => {
                          setShowEditDate(false);
                          if (sel) setEditDate(sel);
                        }}
                      />
                    )}

                    {!!err && (
                      <View style={styles.errorBox}>
                        <Feather name="info" size={12} color="#991B1B" />
                        <Text style={styles.errorTxt}>{err}</Text>
                      </View>
                    )}

                    <View style={styles.actionBar}>
                      <TouchableOpacity style={styles.secondaryBtn} onPress={handleCloseAll} disabled={loading}>
                        <Text style={styles.secondaryTxt}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.primaryBtn} onPress={doEdit} disabled={loading}>
                        {loading ? <ActivityIndicator /> : <Feather name="save" size={16} color="#fff" style={{ marginRight: 6 }} />}
                        <Text style={styles.primaryTxt}>Save Changes</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}

                {tab === 'delete' && (
                  <>
                    <View style={styles.inlineWarning}>
                      <Feather name="alert-triangle" size={14} color={COLOR_WARN} />
                      <Text style={styles.inlineWarningText}>
                        This will soft-delete the wakaalad. Type <Text style={{ fontWeight: '900' }}>"delete"</Text> to confirm.
                      </Text>
                    </View>
                    <FloatingInput
                      label='Type "delete" to confirm'
                      value={confirmTxt}
                      onChangeText={setConfirmTxt}
                    />

                    {!!err && (
                      <View style={styles.errorBox}>
                        <Feather name="info" size={12} color="#991B1B" />
                        <Text style={styles.errorTxt}>{err}</Text>
                      </View>
                    )}

                    <View style={styles.actionBar}>
                      <TouchableOpacity style={styles.secondaryBtn} onPress={handleCloseAll} disabled={loading}>
                        <Text style={styles.secondaryTxt}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.primaryBtn, { backgroundColor: '#BE123C' }]}
                        onPress={doDelete}
                        disabled={loading}
                      >
                        {loading ? <ActivityIndicator /> : <Feather name="trash-2" size={16} color="#fff" style={{ marginRight: 6 }} />}
                        <Text style={styles.primaryTxt}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}

                {tab === 'restock' && (
                  <>
                    {/* Oil lot */}
                    <PickerField
                      label="From Oil lot"
                      value={
                        selected
                          ? `${(selected.oil_type || '').toUpperCase()} • ${selected.truck_plate || '—'}`
                          : undefined
                      }
                      onPress={() => {
                        setOilQuery('');
                        setOilPickerOpen(true);
                      }}
                      style={{ marginTop: 2 }}
                    />

                    {/* Stock summary */}
                    {selected && (
                      <View style={styles.infoCard}>
                        <View style={styles.infoRow}>
                          <Feather name="database" size={12} color={COLOR_TEXT} />
                          <Text style={styles.infoText}>In-stock</Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 12 }}>
                          <View style={styles.stockChip}>
                            <Text style={styles.stockChipLabel}>Liters</Text>
                            <Text style={styles.stockChipValue}>{Number(selected.in_stock_l || 0).toFixed(2)} L</Text>

                          </View>
                          <View style={styles.stockChip}>
                            <Text style={styles.stockChipLabel}>Fuusto</Text>
                           <Text style={styles.stockChipValue}>
                            {Math.floor(Number(selected.in_stock_l || 0) / fuustoCap(selected.oil_type))} fuusto
                          </Text>
                          </View>
                          <View style={styles.stockChip}>
                            <Text style={styles.stockChipLabel}>Caag</Text>
                           <Text style={styles.stockChipValue}>
                            {Math.floor(Number(selected.in_stock_l || 0) / CAAG_L)} caag
                          </Text>
                          </View>
                        </View>
                      </View>
                    )}

                    {/* Row: Qoondo + Amount */}
                    <View style={{ flexDirection: 'row', gap: 16, marginBottom: 20 }}>
                      <View style={{ flex: 1 }}>
                        <View
                          style={[
                            styles.floatWrap,
                            { borderColor: DARK_BORDER, backgroundColor: COLOR_INPUT_BG },
                          ]}
                        >
                          <Text style={[styles.floatLabel, styles.floatLabelActive]}>Qoondo</Text>
                          <TouchableOpacity
                            style={[styles.inputBase, styles.inputPadded]}
                            onPress={() => setUnitPickerOpen(true)}
                            activeOpacity={0.9}
                          >
                            <Text style={styles.inputText}>
                              {unit === 'fuusto' ? 'Fuusto' : unit === 'caag' ? 'Caag' : 'Litir'}
                            </Text>
                            <Feather name="chevron-down" size={18} color={COLOR_TEXT} />
                          </TouchableOpacity>
                        </View>
                      </View>

                      <FloatingInput
                        label={`Tirada (${unit === 'liters' ? 'litir' : unit})`}
                        value={amount}
                        onChangeText={(t) => setAmount(toDecimal(t))}
                        keyboardType="decimal-pad"
                        style={{ flex: 1, marginBottom: 0 }}
                        placeholder=""
                        onPressIn={() => {
                          if (!selected) {
                            setOilPickerOpen(true);
                          }
                        }}
                      />
                    </View>

                    {selected && allocLiters > 0 && exceeds && (
                      <View style={styles.inlineWarning}>
                        <Feather name="alert-triangle" size={14} color="#92400E" />
                        <Text style={styles.inlineWarningText}>
                          {`Requested ${
                            unit === 'liters'
                              ? allocLiters.toFixed(2) + ' L'
                              : `${Number(amount || 0)} ${unit}`
                          } exceeds available ${
                            unit === 'liters'
                              ? Number(selected.in_stock_l || 0).toFixed(2) + ' L'
                              : `${Math.floor(availableInUnit)} ${unit}`
                          }.`}
                        </Text>
                      </View>
                    )}

                    {/* Date */}
                    <PickerField
                      label="Restock Date"
                      value={dayjs(restockDate).format('MMM D, YYYY')}
                      onPress={() => !!selected && setShowRestockDate(true)}
                      disabled={!selected}
                    />
                    {showRestockDate && (
                      <DateTimePicker
                        value={restockDate}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(_, sel) => {
                          setShowRestockDate(false);
                          if (sel) setRestockDate(sel);
                        }}
                      />
                    )}

                    {!!err && (
                      <View style={styles.errorBox}>
                        <Feather name="info" size={12} color="#991B1B" />
                        <Text style={styles.errorTxt}>{err}</Text>
                      </View>
                    )}

                    <View style={styles.actionBar}>
                      <TouchableOpacity style={styles.secondaryBtn} onPress={handleCloseAll} disabled={loading}>
                        <Text style={styles.secondaryTxt}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.primaryBtn, !canRestock && { opacity: 0.7 }]}
                        onPress={doRestock}
                        disabled={loading || !canRestock}
                      >
                        {loading ? <ActivityIndicator /> : <Feather name="refresh-ccw" size={16} color="#fff" style={{ marginRight: 6 }} />}
                        <Text style={styles.primaryTxt}>Restock</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      </Modal>

      {/* Oil picker popup */}
      <OilPickerModal
        open={oilPickerOpen}
        onClose={() => setOilPickerOpen(false)}
        options={filteredOptions}
        loading={loadingOptions}
        query={oilQuery}
        setQuery={setOilQuery}
        onSelect={(opt) => {
          setSelectedId(opt.id);
          setOilPickerOpen(false);
        }}
      />

      {/* Unit popup */}
      <Modal visible={unitPickerOpen} transparent animationType="fade" onRequestClose={() => setUnitPickerOpen(false)}>
        <TouchableWithoutFeedback onPress={() => setUnitPickerOpen(false)}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
        <View style={styles.popupCard}>
          <View style={styles.popupHeader}>
            <Text style={styles.popupTitle}>Qoondo</Text>
            <TouchableOpacity onPress={() => setUnitPickerOpen(false)}>
              <Feather name="x" size={18} color={COLOR_TEXT} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.optionRowSm}
            onPress={() => {
              setUnit('fuusto');
              setUnitPickerOpen(false);
            }}
          >
           <Text style={styles.pickerMain}>Fuusto (×{fuustoCap(selected?.oil_type)} L)</Text>

            {selected ? (
              <Text style={styles.pickerSub}>
                Available: {Math.floor(Number(selected?.in_stock_l || 0) / fuustoCap(selected?.oil_type))} fuusto
              </Text>

            ) : null}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.optionRowSm}
            onPress={() => {
              setUnit('caag');
              setUnitPickerOpen(false);
            }}
          >
            <Text style={styles.pickerMain}>Caag (×{CAAG_L} L)</Text>
            {selected ? (
              <Text style={styles.pickerSub}>
                Available: {Math.floor(Number(selected.in_stock_caag || 0))} caag
              </Text>
            ) : null}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.optionRowSm, { borderBottomWidth: 0 }]}
            onPress={() => {
              setUnit('liters');
              setUnitPickerOpen(false);
            }}
          >
            <Text style={styles.pickerMain}>Litir</Text>
            {selected ? (
              <Text style={styles.pickerSub}>Available: {Number(selected.in_stock_l || 0).toFixed(2)} L</Text>
            ) : null}
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
};

export default WakaaladActionsModal;

const styles = StyleSheet.create({
  // overlay behind sheet
  backdropOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },

  // bottom sheet
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
  headerRow: { minHeight: 34, justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
  titleCenter: { fontSize: 18, fontWeight: '800', color: COLOR_TEXT, textAlign: 'center' },
  subtitleCenter: { color: COLOR_SUB, fontSize: 11.5, textAlign: 'center', marginTop: 2 },

  closeBtn: {
    position: 'absolute', right: 4, top: -2, width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
  },

  // tabs
  tabsRow: { flexDirection: 'row', gap: 6 },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  tabTxt: { fontSize: 11, fontWeight: '900', color: '#334155' },

  // floating input styles (matching create modal)
  floatWrap: { borderWidth: 1.2, borderColor: COLOR_BORDER, borderRadius: 12, backgroundColor: COLOR_INPUT_BG, position: 'relative' },
  floatLabel: { position: 'absolute', left: 10, top: -10, paddingHorizontal: 6, backgroundColor: COLOR_BG, fontSize: 11, color: COLOR_PLACEHOLDER },
  floatLabelActive: { color: COLOR_BORDER_FOCUS, fontWeight: '800' },
  inputBase: { minHeight: 48, alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  inputPadded: { paddingHorizontal: 12, paddingVertical: 10 },
  inputText: { fontSize: 15, color: COLOR_TEXT },
  inputDisabled: { backgroundColor: '#F3F4F6' },

  // stock summary tiles
  infoCard: {
    marginTop: -2,
    marginBottom: 20,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    borderWidth: 1.4,
    borderColor: DARK_BORDER,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  infoText: { fontSize: 12, color: COLOR_TEXT, fontWeight: '800' },
  stockChip: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1.2,
    borderColor: DARK_BORDER,
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  stockChipLabel: { fontSize: 10, color: COLOR_SUB, fontWeight: '800', marginBottom: 4 },
  stockChipValue: { fontSize: 12, color: COLOR_TEXT, fontWeight: '900' },

  // warnings / errors
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

  errorBox: {
    flexDirection: 'row',
    gap: 6,
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    marginTop: 6,
  },
  errorTxt: { color: '#991B1B', fontSize: 12, fontWeight: '700' },

  // action bar (buttons placed close to content)
  actionBar: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#EEF1F6',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  secondaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  secondaryTxt: { color: '#0F172A', fontWeight: '900', fontSize: 12 },
  primaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: COLOR_ACCENT,
    flexDirection: 'row',
    alignItems: 'center',
  },
  primaryTxt: { color: '#FFFFFF', fontWeight: '900', fontSize: 12, marginLeft: 6 },

  // generic popup (oil + unit)
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2,6,23,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  popupCard: {
    position: 'absolute',
    left: 16, right: 16, top: '12%',
    borderRadius: 16, backgroundColor: '#fff', paddingBottom: 8,
    borderWidth: 1, borderColor: DARK_BORDER, maxHeight: '76%', overflow: 'hidden',
  },
  popupHeader: {
    paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: DARK_BORDER,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8FAFC',
  },
  popupTitle: { fontWeight: '800', color: COLOR_TEXT, fontSize: 14 },
  popupSearch: { borderRadius: 10, borderWidth: 1.2, borderColor: DARK_BORDER, backgroundColor: '#FFFFFF' },
  optionRowSm: { paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLOR_DIVIDER },
  pickerMain: { fontSize: 13.5, fontWeight: '700', color: COLOR_TEXT },
  pickerSub: { fontSize: 11.5, color: COLOR_SUB, marginTop: 2 },
});
