// app/(tabs)/TrackVendorBills/Shidaal/extracosts.tsx
import api from '@/services/api';
import { useAuth } from '@/src/context/AuthContext';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import VendorPaymentCreateSheet from './vendorpayment';
// add this import at the top with others
import OilExtraCostModal from './oilExtraCostModal';

/** ---- Types pulled from supplier-dues ---- */
type ExtraCostItem = {
  id: number;
  category?: string | null;
  description?: string | null;
  amount: number;
  total_paid: number;
  due: number;
  oil_id?: number | null;
  currency?: string | null; // not provided by supplier-dues; kept for formatter compatibility
};

type ChildOil = {
  oil_id: number;
  oil_type?: string | null;
  liters?: number | null;
  sold_l?: number | null;
  in_stock_l?: number | null;
  oil_total_landed_cost?: number | null;
  total_extra_cost?: number | null;
  over_all_cost?: number | null;
  total_paid?: number | null;
  amount_due?: number | null;
  extra_costs?: ExtraCostItem[];
};

type SupplierDueItem = {
  supplier_name: string;
  lot_id?: number | null;
  oil_id?: number | null;
  oil_type?: string | null;
  liters?: number | null;
  truck_plate?: string | null;
  truck_type?: string | null;
  oil_total_landed_cost?: number | null;
  total_extra_cost?: number | null;
  over_all_cost?: number | null;
  total_paid?: number | null;
  amount_due?: number | null;
  date?: string | null;
  last_payment_amount_due_snapshot?: number | null;
  last_payment_amount?: number | null;
  last_payment_date?: string | null;
  last_payment_transaction_type?: string | null;
  child_oils?: ChildOil[];
  extra_costs?: ExtraCostItem[];
};

type SupplierDueResponse = { items: SupplierDueItem[] };

const COLOR_TEXT = '#0B1221';
const COLOR_MUTED = '#64748B';
const COLOR_CARD_BORDER = '#E7ECF3';
const BORDER = '#E7ECF3';

function formatCurrency(n?: number | null, currency?: string) {
  const v = Number(n ?? 0);
  const sym = (currency || 'USD').toUpperCase() === 'USD' ? '$' : 'Sh';
  return `${sym}${v.toFixed(2)}`;
}


// helper: parse to number or return null
const toNum = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};


export default function ExtraCostsPage() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();
  const { oil_id, lot_id } = useLocalSearchParams<{ oil_id?: string; lot_id?: string }>();

  const isLot = !!lot_id;
  const anchorId = useMemo(() => (isLot ? toNum(lot_id) : toNum(oil_id)), [isLot, lot_id, oil_id]);
  const headerTitle = isLot ? `Lot #${anchorId ?? '—'} • Extra Costs` : `Oil #${anchorId ?? '—'} • Extra Costs`;


  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<ExtraCostItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [addExtraOpen, setAddExtraOpen] = useState(false);


  // Search
  const [query, setQuery] = useState('');

  // Centered actions modal
  const [openActionFor, setOpenActionFor] = useState<ExtraCostItem | null>(null);

  // Inline editor
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editCategory, setEditCategory] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editBusy, setEditBusy] = useState(false);

  // Delete
  const [deleteBusyId, setDeleteBusyId] = useState<number | null>(null);

  // Payment modal
  const [payOpen, setPayOpen] = useState(false);
  const [payOilId, setPayOilId] = useState<number | undefined>(undefined);
  const [payLotId, setPayLotId] = useState<number | undefined>(undefined);
  const [payExtraId, setPayExtraId] = useState<number | undefined>(undefined);
  const [payCurrentDue, setPayCurrentDue] = useState<number>(0);
  const payingRef = useRef(false);





  // when the modal closes, refresh the list and hide it
const handleAddExtraClosed = async () => {
  setAddExtraOpen(false);
  await fetchList();
};

const onAddExtraTop = () => {
  if (!anchorId) {
    Alert.alert('Missing ID', 'Cannot add extra cost: invalid or missing identifier.');
    return;
  }
  setAddExtraOpen(true);
};



  /** Fetch supplier-dues and extract the extras for this oil/lot */
  const fetchList = useCallback(async () => {
    if (!token || !anchorId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<SupplierDueResponse>('/diiwaanvendorpayments/supplier-dues', {
        headers: { Authorization: `Bearer ${token}` },
        params: { _ts: Date.now() },
      });

      const all = res?.data?.items ?? [];

      // Find a matching entry:
      // 1) Exact lot match if viewing a lot
      // 2) Exact oil match if viewing an oil
      // 3) Or any parent whose child_oils contains our oil_id
      let match: SupplierDueItem | undefined;

      if (isLot) {
        match = all.find((it) => it.lot_id === anchorId);
      } else {
        match =
          all.find((it) => it.oil_id === anchorId) ||
          all.find((it) => (it.child_oils || []).some((c) => c.oil_id === anchorId));
      }

      const extras = (match?.extra_costs ?? []).map((x) => ({
        ...x,
        total_paid: Number(x.total_paid ?? 0),
        due: Number(x.due ?? Math.max(Number(x.amount ?? 0) - Number(x.total_paid ?? 0), 0)),
      }));

      setItems(extras);
      if (!match) {
        setError('No matching bill found for this oil/lot.');
      }
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to load extra costs.');
    } finally {
      setLoading(false);
    }
  }, [token, anchorId, isLot]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const onRefresh = useCallback(async () => {
    if (!token || !anchorId) return;
    setRefreshing(true);
    try {
      await fetchList();
    } finally {
      setRefreshing(false);
    }
  }, [token, anchorId, fetchList]);

  // Actions
  const openActions = (item: ExtraCostItem) => setOpenActionFor(item);
  const closeActions = () => setOpenActionFor(null);

  // Start editing
  const beginEdit = (item: ExtraCostItem) => {
    closeActions();
    setEditingId(item.id);
    setEditCategory(item.category || '');
    setEditDescription(item.description || '');
    setEditAmount(String(item.amount ?? ''));
  };

  // Cancel editing
  const cancelEdit = () => {
    setEditingId(null);
    setEditCategory('');
    setEditDescription('');
    setEditAmount('');
  };

  // Save edit (PATCH /diiwaanoil/extra-costs/{id})
  const saveEdit = async () => {
    if (!token || !editingId) return;
    const amt = parseFloat((editAmount || '').replace(',', '.'));
    if (!Number.isFinite(amt) || amt < 0) {
      Alert.alert('Invalid amount', 'Please enter a valid non-negative number.');
      return;
    }
    try {
      setEditBusy(true);
      const payload: Record<string, any> = {
        category: editCategory?.trim() || null,
        description: editDescription?.trim() || null,
        amount: amt,
      };
      const res = await api.patch(`/diiwaanoil/extra-costs/${editingId}`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Update local + recompute due (prefer backend if it returns it)
      setItems((prev) =>
        prev.map((it) =>
          it.id === editingId
            ? {
                ...it,
                ...res.data,
                total_paid: Number(res.data?.total_paid ?? it.total_paid ?? 0),
                due: Number(
                  res.data?.due ??
                    Math.max(Number(res.data?.amount ?? amt) - Number(res.data?.total_paid ?? it.total_paid ?? 0), 0)
                ),
              }
            : it
        )
      );
      cancelEdit();
    } catch (e: any) {
      Alert.alert(
        'Update failed',
        String(e?.response?.data?.detail || e?.message || 'Unable to update extra cost.')
      );
    } finally {
      setEditBusy(false);
    }
  };

  // Delete (DELETE /diiwaanoil/extra-costs/{id})
  const confirmDelete = (item: ExtraCostItem) => {
    closeActions();
    Alert.alert(
      'Delete extra cost?',
      `This will remove “${item.category || 'Extra'}” and adjust the ledger accordingly.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => doDelete(item.id),
        },
      ]
    );
  };

  const doDelete = async (id: number) => {
    if (!token) return;
    try {
      setDeleteBusyId(id);
      await api.delete(`/diiwaanoil/extra-costs/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setItems((prev) => prev.filter((it) => it.id !== id));
      if (editingId === id) cancelEdit();
    } catch (e: any) {
      Alert.alert(
        'Delete failed',
        String(e?.response?.data?.detail || e?.message || 'Unable to delete extra cost.')
      );
    } finally {
      setDeleteBusyId(null);
    }
  };

  // Pay actions — open VendorPaymentCreateSheet
  const payForExtra = (ex: ExtraCostItem) => {
    if (payingRef.current) return;
    payingRef.current = true;
    try {
      setPayExtraId(ex.id);
      setPayCurrentDue(Number(ex.due || 0));
      if (isLot) {
        setPayLotId(anchorId);
        setPayOilId(undefined);
      } else {
        setPayOilId(anchorId);
        setPayLotId(undefined);
      }
      setPayOpen(true);
    } finally {
      // release in onClose/onCreated
    }
  };

  const onPaymentCreated = async () => {
    await fetchList();
    setPayOpen(false);
    setPayOilId(undefined);
    setPayLotId(undefined);
    setPayExtraId(undefined);
    setPayCurrentDue(0);
    payingRef.current = false;
  };

  const onPaymentClosed = async () => {
    setPayOpen(false);
    await fetchList();
    setPayOilId(undefined);
    setPayLotId(undefined);
    setPayExtraId(undefined);
    setPayCurrentDue(0);
    payingRef.current = false;
  };

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const hay = `${it.category ?? ''} ${it.description ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, query]);

  return (
    <View style={styles.container}>
      {/* Header (pushed down) */}
      <View style={[styles.headerRow, { marginTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="arrow-left" size={18} color="#0B1221" />
        </TouchableOpacity>

        <Text style={styles.headerTitle} numberOfLines={1}>{headerTitle}</Text>

        <TouchableOpacity
        onPress={onAddExtraTop}
        style={[styles.addTopBtn, !anchorId && { opacity: 0.5 }]}
        activeOpacity={0.9}
        disabled={!anchorId}
      >

          <Feather name="plus" size={12} color="#0B2447" />
          <Text style={styles.addTopBtnTxt}>Add Extra Cost</Text>
        </TouchableOpacity>

      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Feather name="search" size={12} color={COLOR_MUTED} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search extra costs (category, description)…"
            placeholderTextColor={COLOR_MUTED}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {!!query && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Feather name="x-circle" size={12} color={COLOR_MUTED} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Content */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.select({ ios: 'padding', android: undefined })} keyboardVerticalOffset={Platform.select({ ios: 0, android: 0 })}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 12, paddingBottom: Math.max(insets.bottom, 16) }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
        >
          {loading ? (
            <View style={{ paddingTop: 40, alignItems: 'center' }}>
              <ActivityIndicator />
              <Text style={{ marginTop: 8, color: COLOR_MUTED, fontSize: 12 }}>Loading…</Text>
            </View>
          ) : error ? (
            <View style={styles.errorBox}>
              <Feather name="alert-triangle" size={14} color="#92400E" />
              <Text style={styles.errorTxt}>{error}</Text>
            </View>
          ) : filteredItems.length === 0 ? (
            <View style={styles.noExtras}>
              <Feather name="file" size={12} color={COLOR_MUTED} />
              <Text style={styles.noExtrasText}>No extra costs.</Text>
            </View>
          ) : (
            filteredItems.map((ex) => {
              const isEditing = editingId === ex.id;
              const paid = Number(ex.total_paid ?? 0);
              const due = Number(ex.due ?? Math.max(Number(ex.amount ?? 0) - paid, 0));

              return (
                <View key={`ex_${ex.id}`} style={styles.cardRow}>
                  {/* LEFT: title/desc + Pay/FullyPaid */}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    {!isEditing ? (
                      <>
                        <Text style={styles.cardTitle} numberOfLines={1}>{ex.category || 'Extra'}</Text>
                        {!!ex.description && <Text style={styles.cardDesc} numberOfLines={2}>{ex.description}</Text>}

                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, alignItems: 'center' }}>
                          {due <= 0 ? (
                            <View style={styles.paidPill}>
                              <Feather name="check-circle" size={12} color="#065F46" />
                              <Text style={styles.paidPillText}>Fully Paid</Text>
                            </View>
                          ) : (
                            <TouchableOpacity style={styles.payBtn} onPress={() => payForExtra(ex)} activeOpacity={0.9}>
                              <Feather name="dollar-sign" size={12} color="#fff" />
                              <Text style={styles.payBtnTxt}>Pay</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </>
                    ) : (
                      <View style={styles.editWrap}>
                        <Text style={styles.editLabel}>Category</Text>
                        <TextInput
                          value={editCategory}
                          onChangeText={setEditCategory}
                          placeholder="e.g. Transport"
                          placeholderTextColor="#94A3B8"
                          style={styles.input}
                        />

                        <Text style={[styles.editLabel, { marginTop: 8 }]}>Description</Text>
                        <TextInput
                          value={editDescription}
                          onChangeText={setEditDescription}
                          placeholder="Optional description"
                          placeholderTextColor="#94A3B8"
                          style={[styles.input, { minHeight: 44 }]}
                          multiline
                        />

                        <Text style={[styles.editLabel, { marginTop: 8 }]}>Amount</Text>
                        <TextInput
                          value={editAmount}
                          onChangeText={(t) => {
                            let cleaned = t.replace(/[^0-9.]/g, '');
                            const firstDot = cleaned.indexOf('.');
                            if (firstDot !== -1) {
                              cleaned =
                                cleaned.slice(0, firstDot + 1) +
                                cleaned.slice(firstDot + 1).replace(/\./g, '');
                            }
                            setEditAmount(cleaned);
                          }}
                          placeholder="0.00"
                          placeholderTextColor="#94A3B8"
                          style={styles.input}
                          keyboardType="decimal-pad"
                        />

                        <View style={styles.editActions}>
                          <TouchableOpacity onPress={cancelEdit} style={[styles.editBtn, styles.editCancel]} activeOpacity={0.9} disabled={editBusy}>
                            <Text style={styles.editCancelTxt}>Cancel</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={saveEdit} style={[styles.editBtn, styles.editSave, editBusy && { opacity: 0.6 }]} activeOpacity={0.9} disabled={editBusy}>
                            {editBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.editSaveTxt}>Save</Text>}
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>

                  {/* RIGHT: Amount/Paid/Due + actions trigger */}
                  <View style={{ alignItems: 'flex-end', marginLeft: 4 }}>
                    {!isEditing && (
                      <TouchableOpacity onPress={() => openActions(ex)} style={styles.actionsBtn} activeOpacity={0.9}>
                        <Feather name="more-horizontal" size={16} color="#0B1221" />
                      </TouchableOpacity>
                    )}

                    <Text style={styles.amountLine}>Amount: {formatCurrency(ex.amount, ex.currency)}</Text>
                    <Text style={[styles.amountLine, { color: '#059669', fontWeight: '800' }]}>
                      Paid: {formatCurrency(paid, ex.currency)}
                    </Text>
                    <Text style={[styles.amountLine, { color: '#DC2626', fontWeight: '900' }]}>
                      Due: {formatCurrency(due, ex.currency)}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Centered Actions Modal */}
      <Modal visible={!!openActionFor} transparent animationType="fade" onRequestClose={closeActions}>
        <TouchableWithoutFeedback onPress={closeActions}>
          <View style={styles.centerBackdrop}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.centerCard}>
                <Text style={styles.centerTitle}>{openActionFor?.category || 'Extra'} — Actions</Text>

                <View style={styles.centerList}>
                  {openActionFor && openActionFor.due > 0 && (
                    <TouchableOpacity
                      style={styles.centerItem}
                      onPress={() => {
                        payForExtra(openActionFor);
                        closeActions();
                      }}
                      activeOpacity={0.9}
                    >
                      <Feather name="dollar-sign" size={14} color="#0B1221" />
                      <Text style={styles.centerText}>Pay Now</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.centerItem}
                    onPress={() => openActionFor && beginEdit(openActionFor)}
                    activeOpacity={0.9}
                  >
                    <Feather name="edit-3" size={14} color="#0B1221" />
                    <Text style={styles.centerText}>Edit</Text>
                  </TouchableOpacity>

                  <View style={styles.menuDivider} />

                  <TouchableOpacity
                    style={styles.centerItem}
                    onPress={() => openActionFor && confirmDelete(openActionFor)}
                    activeOpacity={0.9}
                  >
                    {deleteBusyId === openActionFor?.id ? (
                      <ActivityIndicator size="small" />
                    ) : (
                      <Feather name="trash-2" size={14} color="#B91C1C" />
                    )}
                    <Text style={[styles.centerText, { color: '#B91C1C' }]}>Delete</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.centerCancel} onPress={closeActions} activeOpacity={0.9}>
                  <Text style={styles.centerCancelTxt}>Close</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>


      {/* Add Extra Cost (Oil) */}
      {/* Add Extra Cost (Oil or Lot) */}
      {anchorId && (
        <OilExtraCostModal
          visible={addExtraOpen}
          onClose={handleAddExtraClosed}
          oilId={!isLot ? anchorId : undefined}
          lotId={isLot ? anchorId : undefined}
        />
      )}




      {/* Vendor Payment Modal */}
      <VendorPaymentCreateSheet
        visible={payOpen}
        onClose={onPaymentClosed}
        token={token ?? null}
        oilId={payOilId}
        lotId={payLotId}
        vendorNameOverride={undefined}
        currentPayable={payCurrentDue}
        extraCostId={payExtraId}
        onCreated={onPaymentCreated}
        companyName={undefined}
        companyContact={undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },

  headerRow: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { flex: 1, fontSize: 14, fontWeight: '900', color: COLOR_TEXT },
  addTopBtn: {
    backgroundColor: '#EEF2FF',
    borderRadius: 9,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#DDE3F0',
  },
  addTopBtnTxt: { color: '#0B2447', fontWeight: '900', fontSize: 11 },

  /* Search */
  searchRow: { paddingHorizontal: 12, paddingTop: 8 },
  searchBox: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
  },
  searchInput: { flex: 1, fontSize: 11, paddingVertical: 2, color: COLOR_TEXT },

  noExtras: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: COLOR_CARD_BORDER,
    backgroundColor: '#FAFCFF',
    borderRadius: 10,
    padding: 10,
  },
  noExtrasText: { color: COLOR_MUTED, fontSize: 12 },

  errorBox: {
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorTxt: { color: '#92400E', fontSize: 12, flex: 1 },

  cardRow: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: COLOR_CARD_BORDER,
    borderRadius: 10,
    padding: 10,
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#FAFCFF',
  },
  cardTitle: { fontSize: 12, fontWeight: '800', color: COLOR_TEXT },
  cardDesc: { fontSize: 11, color: COLOR_MUTED, marginTop: 2 },
  amountLine: { fontSize: 11, color: COLOR_TEXT, marginTop: 2 },

  // pay + fully paid pill
  payBtn: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  payBtnTxt: { color: '#fff', fontWeight: '900', fontSize: 11 },
  paidPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#C7F4DE',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  paidPillText: { color: '#065F46', fontWeight: '900', fontSize: 11 },

  actionsBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },

  // Inline edit styles
  editWrap: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    padding: 10,
  },
  editLabel: { fontSize: 11, color: '#475569', marginBottom: 4 },
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
  editActions: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'flex-end',
  },
  editBtn: {
    height: 40,
    borderRadius: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editCancel: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  editCancelTxt: { color: '#0B1221', fontWeight: '800', fontSize: 13 },
  editSave: {
    backgroundColor: '#0F172A',
    shadowColor: '#0F172A',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  editSaveTxt: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },

  // Centered actions modal
  centerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  centerCard: {
    width: '92%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  centerTitle: { fontWeight: '800', color: COLOR_TEXT, fontSize: 14, marginBottom: 8 },
  centerList: { borderWidth: 1, borderColor: '#EEF2F7', borderRadius: 10, overflow: 'hidden' },
  centerItem: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
  },
  centerText: { color: '#0B1221', fontSize: 12, fontWeight: '800' },
  centerCancel: {
    marginTop: 10,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerCancelTxt: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  menuDivider: { height: 1, backgroundColor: '#EEF2F7' },
});
