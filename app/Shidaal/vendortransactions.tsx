// app/(tabs)/vendorpayments.tsx
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Print from 'expo-print';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

import api from '@/services/api';
import { useAuth } from '@/src/context/AuthContext';

/** Server types (mirroring /diiwaanvendorpayments list endpoint) */
type ExtraCostSummary = {
  id: number;
  category?: string | null;
  description?: string | null;
  amount: number;
  total_paid: number;
  due: number;
};

type SupplierDueItem = {
  supplier_name: string;
  oil_id?: number | null;
  oil_type?: string | null;
  liters?: number | null;
  truck_plate?: string | null;
  truck_type?: string | null;
  oil_total_landed_cost: number;
  total_extra_cost: number;
  total_paid: number;
  amount_due: number;
  last_payment_amount_due_snapshot?: number | null;
  last_payment_amount?: number | null;
  last_payment_date?: string | null;
  extra_costs: ExtraCostSummary[];
};

type VendorPaymentRead = {
  id: number;
  amount: number;
  amount_due: number; // snapshot at time of payment
  note?: string | null;
  payment_method?: string | null;
  payment_date: string; // tz-aware ISO
  supplier_name: string;
  oil_id?: number | null;
  extra_cost_id?: number | null;
  created_at: string;
  updated_at: string;
  truck_plate?: string | null;
  truck_type?: string | null;
};

type VendorPaymentWithContext = VendorPaymentRead & {
  supplier_due_context?: SupplierDueItem | null;
  extra_cost_context?: ExtraCostSummary | null;
};

type VendorPaymentTotals = {
  count: number;
  sum_amount: number;
  totals_by_supplier: Array<{ supplier_name: string; sum_amount: number }>;
  totals_by_extra_cost: Array<{
    extra_cost_id: number;
    category?: string | null;
    description?: string | null;
    sum_paid: number;
    cap_amount: number;
    due_remaining: number;
  }>;
  total_amount_due_now: number;
  totals_due_by_supplier: Array<{ supplier_name: string; sum_amount: number }>;
};

type VendorPaymentListResponse = {
  items: VendorPaymentWithContext[];
  totals: VendorPaymentTotals;
};

/** UI constants */
const COLOR_BG = '#FFFFFF';
const COLOR_TEXT = '#0B1221';
const COLOR_MUTED = '#64748B';
const COLOR_DIV = '#E5E7EB';
const COLOR_CARD = '#F8FAFC';
const COLOR_ACCENT = '#0B2447';
const COLOR_SHADOW = 'rgba(2, 6, 23, 0.06)';

function formatCurrency(n: number | undefined | null, currency = 'USD') {
  const v = Number(n ?? 0);
  return `${currency} ${v.toFixed(2)}`;
}

function fmtDateLocal(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

/** Build a stable key */
function rowKey(p: VendorPaymentWithContext) {
  return `vp_${p.id}`;
}

export default function VendorPaymentsScreen() {
  const router = useRouter();
  const { token } = useAuth();

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<VendorPaymentWithContext[]>([]);
  const [totals, setTotals] = useState<VendorPaymentTotals | null>(null);

  const headers = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : undefined),
    [token]
  );

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      // default order is date_desc on the API; override if you want created_desc
      const res = await api.get<VendorPaymentListResponse>(
        '/diiwaanvendorpayments?order=created_desc&limit=200',
        { headers }
      );
      setItems(res?.data?.items ?? []);
      setTotals(res?.data?.totals ?? null);
    } catch (e) {
      // optionally toast
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const grandPaid = useMemo(
    () => Number(totals?.sum_amount ?? 0),
    [totals]
  );

  const grandDueNow = useMemo(
    () => Number(totals?.total_amount_due_now ?? 0),
    [totals]
  );

  /** PDF Export (table layout) with share sheet (WhatsApp shows if installed) */
  const onExportPdf = useCallback(async () => {
    const rowsHtml = items
      .map((p) => {
        const ctx = p.supplier_due_context;
        const isExtra = !!p.extra_cost_id && !!p.extra_cost_context;
        const type = isExtra ? 'Extra Cost' : 'Main';
        const category = isExtra ? (p.extra_cost_context?.category || '') : '';
        const desc =
          (isExtra
            ? p.extra_cost_context?.description || ''
            : p.note || '') || '';
        const truck = [p.truck_type?.trim(), p.truck_plate?.trim()].filter(Boolean).join(' · ');
        const oil = p.oil_id ? `#${p.oil_id}` : '';
        const amountPaid = formatCurrency(p.amount);
        const balanceDue = formatCurrency(ctx?.amount_due ?? 0);
        const date = fmtDateLocal(p.payment_date);

        return `<tr>
          <td>${date}</td>
          <td>${escapeHtml(p.supplier_name)}</td>
          <td>${escapeHtml(truck)}</td>
          <td>${escapeHtml(oil)}</td>
          <td>${escapeHtml(type)}</td>
          <td>${escapeHtml(category)}</td>
          <td>${escapeHtml(desc)}</td>
          <td style="text-align:right;">${amountPaid}</td>
          <td style="text-align:right;">${balanceDue}</td>
        </tr>`;
      })
      .join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Vendor Payments</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Ubuntu, 'Helvetica Neue', Arial, 'Noto Sans', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol'; color: #0B1221; }
    h1 { font-size: 20px; margin: 0 0 8px; }
    .meta { color: #475569; font-size: 12px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #e5e7eb; padding: 8px; vertical-align: top; }
    th { background: #f8fafc; text-align: left; }
    tfoot td { font-weight: bold; background: #f8fafc; }
  </style>
</head>
<body>
  <h1>Vendor Payments</h1>
  <div class="meta">Exported: ${fmtDateLocal(new Date().toISOString())}</div>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Supplier</th>
        <th>Truck</th>
        <th>Oil</th>
        <th>Type</th>
        <th>Category</th>
        <th>Description / Note</th>
        <th>Amount Paid</th>
        <th>Balance Due</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml || '<tr><td colspan="9" style="text-align:center;color:#64748B;">No payments</td></tr>'}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="7">Totals</td>
        <td style="text-align:right;">${formatCurrency(grandPaid)}</td>
        <td style="text-align:right;">${formatCurrency(grandDueNow)}</td>
      </tr>
    </tfoot>
  </table>
</body>
</html>`;

    const file = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(file.uri, {
      UTI: 'com.adobe.pdf',
      mimeType: 'application/pdf',
      dialogTitle: 'Share Vendor Payments',
    });
  }, [items, grandPaid, grandDueNow]);

  return (
    <View style={styles.page}>
      {/* Header */}
      <LinearGradient
        colors={['#0F172A', '#0B2447']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="arrow-left" size={18} color="#fff" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Vendor Payments</Text>

        <TouchableOpacity
          onPress={onExportPdf}
          style={styles.exportBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="share-2" size={16} color="#0B2447" />
          <Text style={styles.exportTxt}>Export</Text>
        </TouchableOpacity>
      </LinearGradient>

      {/* Totals Bar */}
      <View style={styles.totalsBar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={styles.badge}>
            <Feather name="trending-up" size={14} color={COLOR_TEXT} />
          </View>
          <Text style={styles.totalLabel}>Total Paid</Text>
        </View>
        <Text style={styles.totalValue}>{formatCurrency(grandPaid)}</Text>
      </View>
      <View style={styles.totalsBar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={styles.badge}>
            <Feather name="alert-circle" size={14} color={COLOR_TEXT} />
          </View>
          <Text style={styles.totalLabel}>Total Balance Due (now)</Text>
        </View>
        <Text style={styles.totalValue}>{formatCurrency(grandDueNow)}</Text>
      </View>

      {/* List */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator />
          </View>
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="inbox" size={22} color={COLOR_MUTED} />
            <Text style={styles.emptyText}>No payments yet.</Text>
          </View>
        ) : (
          items.map((p) => {
            const ctx = p.supplier_due_context;
            const isExtra = !!p.extra_cost_id && !!p.extra_cost_context;
            const title = [p.truck_type?.trim(), p.truck_plate?.trim()]
              .filter(Boolean)
              .join(' · ') || p.supplier_name;

            const subtitle = isExtra
              ? `Extra: ${p.extra_cost_context?.category || '—'}`
              : 'Main Payment';
            const description =
              (isExtra
                ? p.extra_cost_context?.description || ''
                : p.note || '') || '';
            const amountPaid = formatCurrency(p.amount);
            const balanceDue = formatCurrency(ctx?.amount_due ?? 0);

            return (
              <View key={rowKey(p)} style={styles.card}>
                {/* LEFT */}
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{title}</Text>

                  <View style={styles.metaRow}>
                    <View style={styles.pill}>
                      <Feather name="calendar" size={12} color={COLOR_TEXT} />
                      <Text style={styles.pillTxt}>{fmtDateLocal(p.payment_date)}</Text>
                    </View>
                    {p.oil_id ? (
                      <View style={styles.pill}>
                        <Feather name="hash" size={12} color={COLOR_TEXT} />
                        <Text style={styles.pillTxt}>Oil #{p.oil_id}</Text>
                      </View>
                    ) : null}
                    {ctx?.oil_type ? (
                      <View style={styles.pill}>
                        <Feather name="droplet" size={12} color={COLOR_TEXT} />
                        <Text style={styles.pillTxt}>{ctx.oil_type}</Text>
                      </View>
                    ) : null}
                  </View>

                  <Text style={styles.subtitle}>{subtitle}</Text>
                  {!!description && <Text style={styles.desc}>{description}</Text>}
                </View>

                {/* RIGHT */}
                <View style={styles.rightCol}>
                  <Text style={styles.rightLabel}>Paid</Text>
                  <Text style={styles.rightValue}>{amountPaid}</Text>
                  <View style={{ height: 8 }} />
                  <Text style={styles.rightLabel}>Balance Due</Text>
                  <Text style={[styles.rightValue, { color: '#b91c1c' }]}>{balanceDue}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

/** Helpers */
function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Styles */
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLOR_BG },

  header: {
    paddingTop: Platform.select({ ios: 48, android: 24 }),
    paddingBottom: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  exportTxt: { color: '#0B2447', fontWeight: '900' },

  totalsBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomColor: '#EEF2F7',
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#EEF2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalLabel: { color: COLOR_TEXT, fontWeight: '800' },
  totalValue: { color: COLOR_TEXT, fontWeight: '900' },

  scrollContent: { padding: 14, paddingBottom: 28 },

  loading: { padding: 24, alignItems: 'center', justifyContent: 'center' },
  empty: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyText: { color: COLOR_MUTED, fontSize: 13 },

  /** Card */
  card: {
    backgroundColor: COLOR_CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EDF1F7',
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    gap: 14,
    shadowColor: COLOR_SHADOW,
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  title: { fontSize: 15, fontWeight: '900', color: COLOR_TEXT },
  metaRow: { flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  pill: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E7ECF3',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pillTxt: { color: COLOR_TEXT, fontSize: 12, fontWeight: '700' },
  subtitle: { marginTop: 8, color: COLOR_TEXT, fontWeight: '800' },
  desc: { marginTop: 4, color: COLOR_MUTED, fontSize: 12 },

  rightCol: { alignItems: 'flex-end', justifyContent: 'center', minWidth: 130 },
  rightLabel: { fontSize: 11, color: COLOR_MUTED, textAlign: 'right' },
  rightValue: { fontSize: 16, fontWeight: '900', color: COLOR_TEXT, marginTop: 2 },
});
