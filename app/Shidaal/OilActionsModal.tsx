// /OilActionsModal.tsx
import api from '@/services/api';
import { Feather } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

type Props = {
  visible: boolean;
  onClose: () => void;
  oilId: number;                  // from VendorBills (selected.oil_id)
  supplierName?: string | null;
  truckPlate?: string | null;
  authToken?: string;             // If you pass token explicitly; optional
  onChanged?: () => void;         // Refetch list after updates/deletes
};

type OilRead = {
  id: number;
  sell_price_per_l?: number | null;

  truck_plate?: string | null;
  truck_type?: string | null;
  supplier_name?: string | null;
  oil_well?: string | null;
};

type TabId = 'price' | 'identity' | 'danger';

const ACCENT = '#0B2447';
const BORDER = '#E5E7EB';
const BG = '#FFFFFF';
const TEXT = '#0B1220';
const MUTED = '#6B7280';
const ACTIVE_LIGHT = '#E0F2FE';
const ACTIVE_BORDER = '#7DD3FC';
const ACTIVE_INK = '#075985';

export default function OilActionsModal({
  visible,
  onClose,
  oilId,
  supplierName,
  truckPlate,
  authToken,
  onChanged,
}: Props) {
  const insets = useSafeAreaInsets();
  const bottomSafe = insets.bottom || 0;

  // --- Slide animation (match PaymentCreateSheet style) ---
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

  const close = () => {
    if (busy) return;
    onClose();
  };

  // --- tabs / states ---
  const [tab, setTab] = useState<TabId>('price');
  const [busy, setBusy] = useState(false);
  const [loadingOil, setLoadingOil] = useState(false);
  const [oil, setOil] = useState<OilRead | null>(null);

  // price (ONLY per-liter)
  const [sellPriceL, setSellPriceL] = useState<string>('');

  // identity (2-per-row layout)
  const [editTruckType, setEditTruckType] = useState<string>('');
  const [editTruckPlate, setEditTruckPlate] = useState<string>(truckPlate ?? '');
  const [editSupplier, setEditSupplier] = useState<string>(supplierName ?? '');
  const [editOilWell, setEditOilWell] = useState<string>('');

  // Title: prioritize truck plate
  const title = useMemo(() => {
    if (truckPlate && truckPlate.trim()) return truckPlate;
    if (supplierName && supplierName.trim()) return supplierName;
    return 'Manage Oil';
  }, [supplierName, truckPlate]);

  // axios headers (if you need to override per-request)
  const authHeader = useMemo(
    () => (authToken ? { Authorization: `Bearer ${authToken}` } : undefined),
    [authToken]
  );

  // API wrapper via axios instance
  async function callJson<T = any>(
    path: string,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    data?: any
  ): Promise<T> {
    const res = await api.request<T>({
      url: path,      // e.g. `/diiwaanoil/${oilId}`
      method,
      data,
      headers: authHeader,
    });
    return res.data as T;
  }

  // Load clicked oil to populate fields
  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!visible || !oilId) return;
      try {
        setLoadingOil(true);
        const data = await callJson<OilRead>(`/diiwaanoil/${oilId}`, 'GET');
        if (!mounted) return;
        setOil(data);

        // populate
        setSellPriceL(
          data?.sell_price_per_l != null && !Number.isNaN(Number(data.sell_price_per_l))
            ? String(data.sell_price_per_l)
            : ''
        );
        setEditTruckType(data?.truck_type || '');
        setEditTruckPlate((truckPlate && truckPlate.trim()) || data?.truck_plate || '');
        setEditSupplier((supplierName && supplierName.trim()) || data?.supplier_name || '');
        setEditOilWell(data?.oil_well || '');
      } catch (e: any) {
        Alert.alert('Load failed', String(e?.response?.data?.detail || e?.message || e));
      } finally {
        setLoadingOil(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, oilId]);

  // Actions
  async function handleSavePrice() {
    try {
      setBusy(true);
      const payload = { sell_price_per_l: sellPriceL ? Number(sellPriceL) : null };
      await callJson(`/diiwaanoil/${oilId}/reprice`, 'POST', payload);
      onChanged?.();
      Alert.alert('Updated', 'Sell price was updated.');
      onClose();
    } catch (e: any) {
      Alert.alert('Update failed', String(e?.response?.data?.detail || e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function handleIdentitySave() {
    try {
      setBusy(true);
      const payload = {
        truck_type: editTruckType || null,
        truck_plate: editTruckPlate || null,
        supplier_name: editSupplier || null,
        oil_well: editOilWell || null,
      };
      await callJson(`/diiwaanoil/${oilId}`, 'PATCH', payload);
      onChanged?.();
      Alert.alert('Saved', 'Truck/Supplier info updated.');
      onClose();
    } catch (e: any) {
      Alert.alert('Save failed', String(e?.response?.data?.detail || e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    Alert.alert(
      'Delete this oil lot?',
      'This will post reversal ledger entries and remove the oil record.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setBusy(true);
              await callJson(`/diiwaanoil/${oilId}`, 'DELETE');
              onChanged?.();
              Alert.alert('Deleted', 'Oil record removed.');
              onClose();
            } catch (e: any) {
              Alert.alert('Delete failed', String(e?.response?.data?.detail || e?.message || e));
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }

  // UI helpers (match your other sheet visual language)
  const TabButton = ({ id, label, icon }: { id: TabId; label: string; icon: keyof typeof Feather.glyphMap }) => {
    const active = tab === id;
    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => setTab(id)}
        style={[
          styles.tabBtn,
          active && { backgroundColor: ACTIVE_LIGHT, borderColor: ACTIVE_BORDER },
        ]}
      >
        <Feather name={icon} size={14} color={active ? ACTIVE_INK : TEXT} />
        <Text style={[styles.tabBtnTxt, { color: active ? ACTIVE_INK : TEXT }]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  const Input = ({
    value, onChangeText, placeholder, keyboardType = 'default',
  }: {
    value: string;
    onChangeText: (t: string) => void;
    placeholder?: string;
    keyboardType?: 'default' | 'numeric';
  }) => (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#9CA3AF"
      keyboardType={keyboardType}
      style={styles.input}
    />
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={close}
    >
      {/* Backdrop (tap to close) */}
      <TouchableWithoutFeedback onPress={close}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      {/* Animated sheet */}
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
          <View style={[styles.sheetCard, { paddingBottom: Math.max(16, bottomSafe) }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.title} numberOfLines={1}>{title}</Text>

            {/* Tabs */}
            <View style={styles.tabsRow}>
              <TabButton id="price" label="Change price" icon="tag" />
              <TabButton id="identity" label="Edit truck/supplier" icon="truck" />
              <TabButton id="danger" label="Delete" icon="trash-2" />
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 18 }}>
              {loadingOil ? (
                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                  <ActivityIndicator />
                </View>
              ) : tab === 'price' ? (
                <View>
                  {/* Current price badge */}
                  <View style={styles.banner}>
                    <Text style={styles.bannerLeft}>Current price (per liter)</Text>
                    <View style={styles.badge}>
                      <Feather name="dollar-sign" size={12} color={ACTIVE_INK} />
                      <Text style={styles.badgeTxt}>
                        {oil?.sell_price_per_l != null ? Number(oil.sell_price_per_l).toFixed(2) : '—'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.row}>
                    <Text style={styles.label}>New sell price (per liter)</Text>
                    <TextInput
                        key={visible ? 'price-open' : 'price-closed'}
                        value={sellPriceL}
                        onChangeText={(text) => {
                        // allow only digits and one dot
                        let cleaned = text.replace(/[^0-9.]/g, '');
                        const firstDot = cleaned.indexOf('.');
                        if (firstDot !== -1) {
                            const before = cleaned.slice(0, firstDot + 1);
                            const after = cleaned.slice(firstDot + 1).replace(/\./g, '');
                            cleaned = before + after;
                        }
                        setSellPriceL(cleaned);
                        }}
                        textContentType="none"
                        autoCapitalize="none"
                        autoCorrect={false}
                        placeholder="e.g., 1.25"
                        placeholderTextColor="#9CA3AF"
                        keyboardType="default"   // ✅ text keyboard (not numeric)
                        inputMode="decimal"      // ✅ hints to OS it's decimal input
                        style={styles.input}
                        maxLength={18}
                    />
                    </View>


                  {/* Actions */}
                  <View style={styles.actions}>
                    <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={close} disabled={busy}>
                      <Text style={styles.btnGhostText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btn, busy ? { opacity: 0.6 } : null]}
                      onPress={handleSavePrice}
                      disabled={busy || !oilId}
                    >
                      {busy ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Feather name="save" size={16} color="#fff" />
                          <Text style={styles.btnTxt}>Save</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : tab === 'identity' ? (
                <View>
                  <View style={styles.row}>
                    <Text style={styles.label}>Truck</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Input value={editTruckType} onChangeText={setEditTruckType} placeholder="Type" />
                      <Input value={editTruckPlate} onChangeText={setEditTruckPlate} placeholder="Plate" />
                    </View>
                  </View>

                  <View style={styles.row}>
                    <Text style={styles.label}>Vendor</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Input value={editSupplier} onChangeText={setEditSupplier} placeholder="Supplier" />
                      <Input value={editOilWell} onChangeText={setEditOilWell} placeholder="Oil well" />
                    </View>
                  </View>

                  {/* Actions */}
                  <View style={styles.actions}>
                    <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={close} disabled={busy}>
                      <Text style={styles.btnGhostText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btn, busy ? { opacity: 0.6 } : null]}
                      onPress={handleIdentitySave}
                      disabled={busy || !oilId}
                    >
                      {busy ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Feather name="save" size={16} color="#fff" />
                          <Text style={styles.btnTxt}>Save</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View>
                  <View style={styles.dangerBox}>
                    <Text style={styles.dangerTitle}>Danger zone</Text>
                    <Text style={styles.dangerText}>
                      Deleting reverses inventory/funding via your backend and removes the oil record.
                    </Text>
                  </View>

                  {/* Actions */}
                  <View style={styles.actions}>
                    <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={close} disabled={busy}>
                      <Text style={styles.btnGhostText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btn, { backgroundColor: '#B91C1C' }, busy ? { opacity: 0.6 } : null]}
                      onPress={handleDelete}
                      disabled={busy || !oilId}
                    >
                      {busy ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Feather name="trash-2" size={16} color="#fff" />
                          <Text style={styles.btnTxt}>Delete</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Backdrop & sheet container (matches your payment sheet)
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
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
  title: { fontSize: 18, fontWeight: '800', marginBottom: 10, color: TEXT, textAlign: 'center' },

  // Tabs row + tab button (active = light blue)
  tabsRow: { flexDirection: 'row', gap: 8, marginBottom: 12, justifyContent: 'center' },
  tabBtn: {
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
  tabBtnTxt: { fontWeight: '800', fontSize: 12 },

  // Sections / inputs
  row: { marginBottom: 14 },
  label: { fontWeight: '700', color: TEXT, marginBottom: 6 },
  input: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    color: TEXT,
  },

  // Current price banner + badge (light blue)
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
  bannerLeft: { color: MUTED, fontWeight: '700' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: ACTIVE_LIGHT,
    borderWidth: 1,
    borderColor: ACTIVE_BORDER,
    borderRadius: 999,
  },
  badgeTxt: { color: ACTIVE_INK, fontWeight: '900', fontSize: 12 },

  // Actions (Cancel / Save)
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

  // Danger section
  dangerBox: {
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  dangerTitle: { color: '#991B1B', fontWeight: '900', marginBottom: 6 },
  dangerText: { color: '#7F1D1D' },
});
