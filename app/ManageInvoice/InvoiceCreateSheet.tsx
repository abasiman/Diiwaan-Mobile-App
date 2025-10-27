// app/manage-invoice/create.tsx
import api from '@/services/api';
import { useAuth } from '@/src/context/AuthContext';
import { Feather } from '@expo/vector-icons';
import { useGlobalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const HEADER_BG = '#0B3B74';
const ACCENT = '#576CBC';
const TEXT = '#0B1220';
const MUTED = '#6B7280';
const DANGER = '#EF4444';
const BORDER = '#E5E7EB';
const BG = '#FFFFFF';

type ItemRow = { itemName: string; qty: string; price: string };

// allow only digits and a single dot, keep full keyboard UI
const sanitizeNumber = (s: string) => {
  let v = s.replace(/[^0-9.]/g, '');
  const firstDot = v.indexOf('.');
  if (firstDot !== -1) {
    v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, '');
  }
  return v;
};

export default function InvoiceCreatePage() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();

  // read customer_name from route
  const { customer_name: raw } = useGlobalSearchParams<{ customer_name?: string | string[] }>();
  const customerNameParam = Array.isArray(raw) ? raw[0] : raw;
  const customerName = customerNameParam ? decodeURIComponent(customerNameParam) : '';

  const [items, setItems] = useState<ItemRow[]>([{ itemName: '', qty: '1', price: '0' }]);
  const [submitting, setSubmitting] = useState(false);
  const [kbHeight, setKbHeight] = useState(0);

  // resolved customer id (from API)
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [resolvingCustomer, setResolvingCustomer] = useState<boolean>(!!customerName);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const authHeader = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);

  const resolveCustomer = useCallback(async () => {
    if (!token || !customerName) {
      setCustomerId(null);
      setResolvingCustomer(false);
      return;
    }
    try {
      setResolvingCustomer(true);
      setResolveError(null);

      const res = await api.get<{ customer_id?: number | null; customer_name?: string | null }>(
        '/diiwaaninvoices/report/by-customer-name',
        {
          headers: authHeader,
          params: {
            customer_name: customerName,
            match: 'exact',
            case_sensitive: false,
            order: 'created_desc',
          },
        }
      );

      const cid = res.data?.customer_id ?? null;
      if (!cid) {
        setResolveError('Macmiilka lama helin magacan.');
        setCustomerId(null);
      } else {
        setCustomerId(cid);
      }
    } catch (e: any) {
      setResolveError(e?.response?.data?.detail || 'Ku xidhidda macmiilka waa ku guuldareysatay.');
      setCustomerId(null);
    } finally {
      setResolvingCustomer(false);
    }
  }, [token, customerName, authHeader]);

  useEffect(() => {
    setItems([{ itemName: '', qty: '1', price: '0' }]);
    setSubmitting(false);
  }, []);

  useEffect(() => {
    resolveCustomer();
  }, [resolveCustomer]);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      e => setKbHeight(e.endCoordinates?.height ?? 0)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKbHeight(0)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const toNum = (s: string) => (Number.isFinite(Number(s)) ? Number(s) : NaN);
  const currency = (n: number) => Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n || 0);

  const updateItem = (i: number, patch: Partial<ItemRow>) =>
    setItems(p => p.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const addItem = () => setItems(p => [...p, { itemName: '', qty: '1', price: '0' }]);
  const removeItem = (i: number) => setItems(p => p.filter((_, idx) => idx !== i));

  const grandTotal = items.reduce((sum, it) => {
    const q = toNum(it.qty),
      p = toNum(it.price);
    return sum + (!Number.isFinite(q) || q <= 0 || !Number.isFinite(p) || p < 0 ? 0 : q * p);
  }, 0);

  const validateAll = (): string | null => {
    if (!customerId) return 'Macmiilka lama helin.';
    if (items.length === 0) return 'Kugudar ugu yaraan hal alaab.';
    for (let i = 0; i < items.length; i++) {
      const name = items[i].itemName.trim();
      const q = toNum(items[i].qty);
      const p = toNum(items[i].price);
      if (!name) return `Alaab #${i + 1}: geli magaca alaabta.`;
      if (!Number.isFinite(q) || q <= 0) return `Alaab #${i + 1}: qty waa in uu ka weyn yahay 0.`;
      if (!Number.isFinite(p) || p < 0) return `Alaab #${i + 1}: qiimaha sax u geli.`;
    }
    return null;
  };

  const submit = async () => {
    const err = validateAll();
    if (err) return Alert.alert('Fadlan', err);
    try {
      setSubmitting(true);
      await api.post(
        '/diiwaaninvoices/bulk',
        {
          customer_id: customerId,
          items: items.map(it => ({
            item_name: it.itemName.trim(),
            qty: toNum(it.qty),
            price: toNum(it.price),
            cost: null,
          })),
        },
        { headers: authHeader }
      );

      router.back();
    } catch (e: any) {
      Alert.alert('Error', String(e?.response?.data?.detail || e?.message || 'Create failed.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn} accessibilityLabel="Go back">
          <Feather name="arrow-left" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Diiwaan Cusub</Text>
        <View style={styles.headerBtn} />
      </View>

      {/* Selected customer pill / status */}
      <View style={{ paddingHorizontal: 14, paddingTop: 8, paddingBottom: 4 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: '#EEF2FF',
            borderColor: '#E0E7FF',
            borderWidth: 1,
            borderRadius: 10,
            paddingHorizontal: 10,
            paddingVertical: 8,
          }}
        >
          <Feather name="user" size={14} color={ACCENT} />
          <Text style={{ color: TEXT, fontWeight: '800', fontSize: 12 }}>
            {customerName || 'Macmiil aan la cayimin'}
          </Text>
          {resolvingCustomer ? (
            <ActivityIndicator size="small" color={ACCENT} />
          ) : resolveError ? (
            <Text style={{ color: DANGER, fontSize: 12, marginLeft: 4 }}>{resolveError}</Text>
          ) : null}
        </View>
      </View>

      {/* Body */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
        style={{ flex: 1 }}
      >
        <ScrollView
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ padding: 14, paddingBottom: (insets.bottom || 12) + kbHeight + 200 }}
          showsVerticalScrollIndicator
          nestedScrollEnabled
        >
          {items.map((it, idx) => {
            const q = toNum(it.qty),
              p = toNum(it.price);
            const lineTotal = !Number.isFinite(q) || q <= 0 || !Number.isFinite(p) || p < 0 ? 0 : q * p;

            return (
              <View key={idx} style={styles.block}>
                <View style={styles.blockHead}>
                  <Text style={styles.blockTitle}> {idx + 1}</Text>
                  {items.length > 1 && (
                    <TouchableOpacity onPress={() => removeItem(idx)} style={styles.deleteBtn}>
                      <Feather name="trash-2" size={14} color={DANGER} />
                    </TouchableOpacity>
                  )}
                </View>

                <Text style={styles.label}>Badeeco</Text>
                <TextInput
                  value={it.itemName}
                  onChangeText={v => updateItem(idx, { itemName: v })}
                  placeholder="geli magaca badeecada"
                  placeholderTextColor="#9CA3AF"
                  style={styles.input}
                  autoFocus={idx === 0}
                  returnKeyType="next"
                />

                <View style={styles.inline}>
                  <View style={{ flex: 0.8 }}>
                    <Text style={styles.label}>QTY(tirada)</Text>
                    <TextInput
                      value={it.qty}
                      onChangeText={v => updateItem(idx, { qty: sanitizeNumber(v) })}
                      placeholder="1"
                      placeholderTextColor="#9CA3AF"
                      style={styles.input}
                      // FULL default keyboard: no keyboardType, no inputMode
                      autoCorrect={false}
                      autoCapitalize="none"
                    />
                  </View>

                  <View style={{ width: 8 }} />

                  <View style={{ flex: 1.2 }}>
                    <Text style={styles.label}>Price</Text>
                    <TextInput
                      value={it.price}
                      onChangeText={v => updateItem(idx, { price: sanitizeNumber(v) })}
                      placeholder="0.00"
                      placeholderTextColor="#9CA3AF"
                      style={styles.input}
                      // FULL default keyboard: no keyboardType, no inputMode
                      autoCorrect={false}
                      autoCapitalize="none"
                    />
                  </View>

                  <View style={{ width: 8 }} />

                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Total</Text>
                    <View style={[styles.input, { justifyContent: 'center' }]}>
                      <Text style={styles.totalInlineVal}>{currency(lineTotal)}</Text>
                    </View>
                  </View>
                </View>
              </View>
            );
          })}

          {/* Grand Total + Add item */}
          <View style={styles.footerRow}>
            <View style={styles.totalCard}>
              <Text style={styles.totalKey}>Isku darka(total)</Text>
              <Text style={styles.totalVal}>{currency(grandTotal)}</Text>
            </View>

            
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={addItem} disabled={submitting}>
              <Feather name="plus" size={14} />
              <Text style={styles.addTxt}>Badeeco kale</Text>
            </TouchableOpacity>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnGhost]}
              onPress={() => router.back()}
              disabled={submitting}
            >
              <Text style={[styles.btnTxt, { color: TEXT }]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, (submitting || !customerId) && { opacity: 0.6 }]}
              onPress={submit}
              disabled={submitting || !customerId}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Feather name="save" size={14} color="#fff" />
                  <Text style={styles.btnTxt}>Save</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },

  header: {
    height: 52,
    backgroundColor: HEADER_BG,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },

  block: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: BORDER,
  },
  blockHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  blockTitle: { flex: 1, fontWeight: '800', color: TEXT, fontSize: 13 },
  deleteBtn: {
    padding: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    backgroundColor: '#FFF1F2',
  },

  label: { fontWeight: '700', color: TEXT, marginBottom: 4, marginTop: 4, fontSize: 12 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 40,
    color: TEXT,
    fontSize: 13,
  },
  inline: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 4 },

  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, marginBottom: 8 },
  totalCard: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalKey: { color: MUTED, fontWeight: '700', fontSize: 12 },
  totalVal: { color: TEXT, fontWeight: '900', fontSize: 14 },

  totalInlineVal: { color: TEXT, fontWeight: '800', fontSize: 13 },

  addBtn: {
    paddingHorizontal: 10,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ACCENT,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  addTxt: { color: ACCENT, fontWeight: '800', marginLeft: 6, fontSize: 12 },

  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  btnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: BORDER },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
