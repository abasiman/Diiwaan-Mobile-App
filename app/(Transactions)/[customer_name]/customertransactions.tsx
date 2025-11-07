// app/(Transactions)/[customer_name].tsx
import {
  getCustomerLedgerLocal,
  upsertCustomerLedgerFromServer,
  type CustomerLedgerResponse,
  type LedgerItem,
  type LedgerTotals,
} from '@/app/db/customerLedgerRepo';
import api from '@/services/api';
import { useAuth } from '@/src/context/AuthContext';
import { Feather, FontAwesome } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system/legacy'; // ✅ use legacy shim on SDK 54+
import { LinearGradient } from 'expo-linear-gradient';
import * as Print from 'expo-print';
import { useGlobalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

/* ----------------------------- Types (ledger endpoint) ----------------------------- */
type MeProfile = {
  id: number;
  username: string;
  email: string | null;
  company_name: string | null;
  phone_number: string | null;
};

/* ----------------------------- Theme ----------------------------- */
const BRAND_BLUE = '#0B2447';
const BRAND_BLUE_2 = '#19376D';
const BG = '#F7F9FC';
const CARD = '#FFFFFF';
const BORDER = '#E5E7EB';
const TEXT = '#0B1220';
const MUTED = '#6B7280';
const LINK = '#2563EB';
const SUCCESS = '#059669';
const DANGER = '#EF4444';
const AMBER = '#F59E0B';

/* ----------------------------- Small utils ----------------------------- */
const fmtYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;

export default function CustomerLedgerPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();

  const { customer_name: raw } =
    useGlobalSearchParams<{ customer_name?: string | string[] }>();
  const customerNameParam = Array.isArray(raw) ? raw[0] : raw;
  const decodedName = customerNameParam
    ? decodeURIComponent(customerNameParam)
    : undefined;

  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [ledger, setLedger] = useState<CustomerLedgerResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // filters
  const [fromDate, setFromDate] = useState<string>(''); // yyyy-mm-dd
  const [toDate, setToDate] = useState<string>(''); // yyyy-mm-dd
  const [search, setSearch] = useState('');

  // date pickers
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  // export
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const exportGuard = useRef<null | 'pdf' | 'csv' | 'wa'>(null); // prevent double taps

  const [online, setOnline] = useState(true);

  const authHeader = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

  const fmtMoney = (n?: number | null) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    }).format(n || 0);

  const fmtDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return iso;
    }
  };

  // ---- connectivity ----
  useEffect(() => {
    const sub = NetInfo.addEventListener((state) => {
      const ok = Boolean(state.isConnected && state.isInternetReachable);
      setOnline(ok);
    });
    return () => sub();
  }, []);

  const fetchProfile = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.get<MeProfile>('/diiwaan/me', { headers: authHeader });
      setProfile(res.data);
    } catch {
      // non-blocking
    }
  }, [token, authHeader]);

  const fetchLedger = useCallback(async () => {
    const name = (decodedName || '').trim();
    if (!name || !user?.id) return;

    setLoading(true);
    setError(null);

    const fromISO = fromDate
      ? new Date(fromDate + 'T00:00:00Z').toISOString()
      : undefined;
    const toISO = toDate
      ? new Date(toDate + 'T23:59:59Z').toISOString()
      : undefined;

    try {
      // ONLINE → hit API, then cache to SQLite
      if (online && token) {
        const params: any = {
          name,
          match: 'exact',
          case_sensitive: false,
          order: 'date_asc',
          limit: 500,
          offset: 0,
          sync_due: true,
        };
        if (fromISO) params.from_date = fromISO;
        if (toISO) params.to_date = toISO;

        const res = await api.get<CustomerLedgerResponse>(
          '/diiwaanpayments/search/by-customer-name',
          {
            headers: authHeader,
            params,
          }
        );

        setLedger(res.data);
        // cache items to local payments table so *future* offline works even if this page isn't opened
        upsertCustomerLedgerFromServer(res.data, user.id);
        return;
      }

      // OFFLINE or no token → local only
      const local = getCustomerLedgerLocal(user.id, name, {
        fromISO,
        toISO,
        limit: 500,
      });
      setLedger(local);
    } catch (e: any) {
      // Fallback to local cache on any error
      try {
        const local = getCustomerLedgerLocal(user.id, name, {
          fromISO,
          toISO,
          limit: 500,
        });
        setLedger(local);
        setError(null);
      } catch (err: any) {
        setError(
          err?.message ||
            e?.response?.data?.detail ||
            'Failed to load ledger from local DB.'
        );
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authHeader, decodedName, fromDate, toDate, online, token, user?.id]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  // live update when dates change (no Apply). debounce a bit.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!decodedName || !user?.id) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchLedger(), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchLedger();
  };

  const descOf = (it: LedgerItem) => {
    const note = (it.note ?? '').trim();
    const base = note || 'Oil sale payment';
    return base;
  };

  const sellerTitle = profile?.company_name?.trim()
    ? profile.company_name.trim()
    : profile?.username ?? '';
  const sellerContact = profile?.phone_number?.trim()
    ? profile.phone_number!.trim()
    : profile?.email?.trim() ?? '';

  const filteredItems: LedgerItem[] = useMemo(() => {
    if (!ledger?.items) return [];
    const q = search.trim().toLowerCase();
    if (!q) return ledger.items;
    return ledger.items.filter((row) => {
      const inNote = descOf(row).toLowerCase().includes(q);
      const inMethod = (row.payment_method || '').toLowerCase().includes(q);
      const inId = /^\d+$/.test(q) && String(row.id).includes(q);
      const inInvoice =
        row.invoice_id != null && String(row.invoice_id).includes(q);
      return inNote || inMethod || inId || inInvoice;
    });
  }, [ledger, search]);

  /* ----------------------------- Export helpers (PDF / CSV) ----------------------------- */
  const escapeHtml = (s: string) =>
    s.replace(
      /[&<>"']/g,
      (m) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        }[m] as string)
    );

  const buildDescForPdf = (it: LedgerItem) => {
    const parts = [
      descOf(it),
      it.invoice_id ? `Inv #${it.invoice_id}` : '',
      it.payment_method || '',
    ].filter(Boolean);
    return parts.join(' • ');
  };

  const buildLedgerHtml = (
    custName: string,
    items: LedgerItem[],
    totals: LedgerTotals
  ) => {
    const rows = items
      .map(
        (it) => `
      <tr>
        <td>${fmtDate(it.payment_date)}</td>
        <td>${escapeHtml(buildDescForPdf(it))}</td>
        <td style="text-align:right">${it.debit ? fmtMoney(it.debit) : ''}</td>
        <td style="text-align:right">${it.credit ? fmtMoney(it.credit) : ''}</td>
        <td style="text-align:right">${fmtMoney(it.running_balance)}</td>
      </tr>`
      )
      .join('');

    const range = [fromDate, toDate].filter(Boolean).join(' → ');
    return `
      <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Helvetica Neue', Arial, 'Noto Sans', 'Apple Color Emoji', 'Segoe UI Emoji'; padding: 16px; color: #0B1220; }
          .header { text-align:center; margin-bottom: 12px; }
          .title { font-size: 18px; font-weight: 900; }
          .sub { font-size: 12px; color:#6B7280; }
          .customer { margin: 10px 0 14px; font-size: 14px; font-weight: 800; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border-bottom: 1px solid #E5E7EB; padding: 6px 6px; }
          th { background: #F3F4F6; text-align: left; }
          .totals { margin-top: 12px; display:flex; gap:16px; }
          .card { border:1px solid #E5E7EB; border-radius:8px; padding:10px 12px; flex:1; }
          .label { font-size:11px; color:#111827; margin-bottom:4px; }
          .value { font-weight:900; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">${escapeHtml(sellerTitle || 'Ledger')}</div>
          ${sellerContact ? `<div class="sub">${escapeHtml(sellerContact)}</div>` : ''}
          <div class="sub">${new Date().toLocaleString()}</div>
        </div>
        <div class="customer">Customer: ${escapeHtml(custName)}${
      range ? ` • Range: ${escapeHtml(range)}` : ''
    }</div>
        <table>
          <thead>
            <tr>
              <th style="width:18%">Date</th>
              <th>Description</th>
              <th style="width:18%; text-align:right">Debit</th>
              <th style="width:18%; text-align:right">Credit</th>
              <th style="width:18%; text-align:right">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${
              rows ||
              `<tr><td colspan="5" style="text-align:center; padding:12px; color:#6B7280">No entries</td></tr>`
            }
          </tbody>
        </table>
        <div class="totals">
          <div class="card">
            <div class="label">Total Debit</div>
            <div class="value">${fmtMoney(totals.total_debit)}</div>
          </div>
          <div class="card">
            <div class="label">Total Credit</div>
            <div class="value">${fmtMoney(totals.total_credit)}</div>
          </div>
          <div class="card">
            <div class="label">Closing Balance</div>
            <div class="value">${fmtMoney(totals.closing_balance)}</div>
          </div>
        </div>
      </body>
      </html>
    `;
  };

  const exportPdf = async () => {
    if (exportBusy || exportGuard.current) return;
    exportGuard.current = 'pdf';
    if (!ledger) return;
    try {
      setExportBusy(true);
      const html = buildLedgerHtml(
        ledger.customer_name,
        filteredItems,
        ledger.totals
      );
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Share Ledger PDF',
      });
    } catch (e: any) {
      Alert.alert('Export failed', e?.message || 'Could not create PDF.');
    } finally {
      exportGuard.current = null;
      setExportBusy(false);
      setExportOpen(false);
    }
  };

  const csvEscape = (s: string) => {
    const needQuote = /[",\n]/.test(s);
    const body = s.replace(/"/g, '""');
    return needQuote ? `"${body}"` : body;
  };

  const exportCsv = async () => {
    if (exportBusy || exportGuard.current) return;
    exportGuard.current = 'csv';
    if (!ledger) return;
    try {
      setExportBusy(true);
      const header = ['Date', 'Description', 'Debit', 'Credit', 'Balance'];
      const rows = filteredItems.map((it) => {
        const desc = buildDescForPdf(it);
        return [
          fmtDate(it.payment_date),
          csvEscape(desc),
          (it.debit || 0).toFixed(2),
          (it.credit || 0).toFixed(2),
          (it.running_balance || 0).toFixed(2),
        ];
      });
      const csv = [header, ...rows]
        .map((r) => r.join(','))
        .join('\n');
      const path =
        FileSystem.cacheDirectory + `ledger_${Date.now()}.csv`;
      await FileSystem.writeAsStringAsync(path, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      await Sharing.shareAsync(path, {
        mimeType: 'text/csv',
        dialogTitle: 'Share Ledger CSV',
      });
    } catch (e: any) {
      Alert.alert('Export failed', e?.message || 'Could not create CSV.');
    } finally {
      exportGuard.current = null;
      setExportBusy(false);
      setExportOpen(false);
    }
  };

  const shareWhatsAppPdf = async () => {
    if (exportBusy || exportGuard.current) return;
    exportGuard.current = 'wa';
    if (!ledger) return;
    try {
      setExportBusy(true);
      const html = buildLedgerHtml(
        ledger.customer_name,
        filteredItems,
        ledger.totals
      );
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Send via WhatsApp',
        UTI: 'com.adobe.pdf',
      });
      const digits = (ledger.customer_phone || '').replace(/[^\d]/g, '');
      if (digits) {
        const msg = `Ledger • ${ledger.customer_name}\nBalance: ${fmtMoney(
          ledger.totals.closing_balance
        )}${
          fromDate || toDate
            ? `\nRange: ${[fromDate, toDate].filter(Boolean).join(' → ')}`
            : ''
        }`;
        const link = `whatsapp://send?phone=${digits}&text=${encodeURIComponent(
          msg
        )}`;
        const can = await Linking.canOpenURL('whatsapp://send');
        if (can) await Linking.openURL(link);
      }
    } catch (e: any) {
      Alert.alert('WhatsApp', e?.message || 'Could not share on WhatsApp.');
    } finally {
      exportGuard.current = null;
      setExportBusy(false);
      setExportOpen(false);
    }
  };

  /* ----------------------------- UI ----------------------------- */
  const headerRight = (
    <TouchableOpacity
      onPress={() => !exportBusy && setExportOpen(true)}
      style={styles.headerAction}
      activeOpacity={0.9}
    >
      <Feather name="download-cloud" size={16} color={BRAND_BLUE} />
      <Text style={styles.headerActionTxt}>Export</Text>
    </TouchableOpacity>
  );

  const renderItem = ({ item }: { item: LedgerItem }) => {
    const description = descOf(item);
    const isDebit = item.transaction_type === 'debit';

    return (
      <View style={styles.row}>
        <View style={styles.colDesc}>
          <Text style={styles.descTxt} numberOfLines={2}>
            {description}
          </Text>
          <Text style={styles.subDateTxt}>{fmtDate(item.payment_date)}</Text>
        </View>

        <View style={styles.colMoney}>
          <Text
            style={[
              styles.moneyTxt,
              isDebit ? styles.debit : styles.faint,
            ]}
            numberOfLines={1}
          >
            {isDebit ? fmtMoney(item.debit || 0) : '—'}
          </Text>
        </View>
        <View style={styles.colMoney}>
          <Text
            style={[
              styles.moneyTxt,
              !isDebit ? styles.credit : styles.faint,
            ]}
            numberOfLines={1}
          >
            {!isDebit ? fmtMoney(item.credit || 0) : '—'}
          </Text>
        </View>
        <View style={styles.colMoney}>
          <Text
            style={[styles.moneyTxt, styles.balance]}
            numberOfLines={1}
          >
            {fmtMoney(item.running_balance || 0)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />
      {/* HEADER */}
      <LinearGradient
        colors={[BRAND_BLUE, BRAND_BLUE_2]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerInner}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            hitSlop={8}
          >
            <Feather name="arrow-left" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {ledger?.customer_name || decodedName || 'Ledger'}
          </Text>
          {headerRight}
        </View>

        {/* Quick KPIs */}
        <View style={styles.kpis}>
          <View style={styles.kpiCard}>
            <Text style={[styles.kpiLabel, { color: '#111827' }]}>
              Total Debit
            </Text>
            <Text style={[styles.kpiValue, { color: AMBER }]}>
              {fmtMoney(ledger?.totals.total_debit)}
            </Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={[styles.kpiLabel, { color: '#111827' }]}>
              Total Credit
            </Text>
            <Text style={[styles.kpiValue, { color: SUCCESS }]}>
              {fmtMoney(ledger?.totals.total_credit)}
            </Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={[styles.kpiLabel, { color: '#111827' }]}>
              Balance
            </Text>
            <Text style={[styles.kpiValue, { color: DANGER }]}>
              {fmtMoney(ledger?.totals.closing_balance)}
            </Text>
          </View>
        </View>
      </LinearGradient>

      {/* Filters */}
      <View style={styles.filters}>
        <TouchableOpacity
          style={styles.dateInputWrap}
          activeOpacity={0.9}
          onPress={() => setShowFromPicker(true)}
        >
          <Feather name="calendar" size={14} color={MUTED} />
          <Text
            style={[
              styles.dateDisplay,
              { color: fromDate ? TEXT : '#9CA3AF' },
            ]}
          >
            {fromDate || 'From (yyyy-mm-dd)'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.dateInputWrap}
          activeOpacity={0.9}
          onPress={() => setShowToPicker(true)}
        >
          <Feather name="calendar" size={14} color={MUTED} />
          <Text
            style={[
              styles.dateDisplay,
              { color: toDate ? TEXT : '#9CA3AF' },
            ]}
          >
            {toDate || 'To (yyyy-mm-dd)'}
          </Text>
        </TouchableOpacity>

        {fromDate || toDate ? (
          <TouchableOpacity
            onPress={() => {
              setFromDate('');
              setToDate('');
            }}
            style={styles.resetBtn}
            activeOpacity={0.9}
          >
            <Feather name="rotate-ccw" size={14} color={BRAND_BLUE} />
            <Text style={styles.resetTxt}>Reset</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* iOS/Android date pickers */}
      {showFromPicker && (
        <DateTimePicker
          value={fromDate ? new Date(fromDate) : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
          onChange={(_, d) => {
            setShowFromPicker(false);
            if (d) setFromDate(fmtYMD(d));
          }}
        />
      )}
      {showToPicker && (
        <DateTimePicker
          value={toDate ? new Date(toDate) : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
          onChange={(_, d) => {
            setShowToPicker(false);
            if (d) setToDate(fmtYMD(d));
          }}
        />
      )}

      {/* Search */}
      <View style={styles.searchWrapOuter}>
        <Feather name="search" size={16} color="#9CA3AF" />
        <TextInput
          placeholder="Search note, method, id…"
          placeholderTextColor="#9CA3AF"
          value={search}
          onChangeText={setSearch}
          style={styles.searchInputOuter}
          returnKeyType="search"
          autoCorrect={false}
        />
      </View>

      {/* Table header */}
      <View style={styles.tableHeader}>
        <Text style={[styles.th, { flex: 3.4 }]}>Description</Text>
        <Text style={[styles.th, styles.thRight, { flex: 1.2 }]}>
          Debit
        </Text>
        <Text style={[styles.th, styles.thRight, { flex: 1.2 }]}>
          Credit
        </Text>
        <Text style={[styles.th, styles.thRight, { flex: 1.3 }]}>
          Balance
        </Text>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={LINK} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            onPress={fetchLedger}
            style={styles.retryBtn}
          >
            <Text style={styles.retryTxt}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(i) => String(i.id)}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>
                No entries in this range.
              </Text>
            </View>
          }
          contentContainerStyle={{
            paddingBottom: Math.max(20, (insets.bottom || 0) + 20),
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={LINK}
            />
          }
        />
      )}

      {/* Export modal */}
      <Modal
        visible={exportOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setExportOpen(false)}
      >
        <TouchableWithoutFeedback
          onPress={() => !exportBusy && setExportOpen(false)}
        >
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
        <View
          style={[
            styles.centerModal,
            { paddingBottom: Math.max(16, insets.bottom + 8) },
          ]}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Export / Send</Text>
            <Text style={styles.modalSub}>
              Choose a format to share the customer ledger.
            </Text>

            <TouchableOpacity
              style={[
                styles.actionRow,
                exportBusy && styles.actionRowDisabled,
              ]}
              onPress={exportPdf}
              disabled={exportBusy}
            >
              <View
                style={[
                  styles.iconChip,
                  { backgroundColor: '#EEF2FF' },
                ]}
              >
                <Feather
                  name="file-text"
                  size={16}
                  color={BRAND_BLUE}
                />
              </View>
              <Text style={styles.actionTxt}>
                Download / Share PDF
              </Text>
              {exportBusy && exportGuard.current === 'pdf' ? (
                <ActivityIndicator size="small" color={BRAND_BLUE} />
              ) : (
                <Feather
                  name="chevron-right"
                  size={18}
                  color={MUTED}
                />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionRow,
                exportBusy && styles.actionRowDisabled,
              ]}
              onPress={exportCsv}
              disabled={exportBusy}
            >
              <View
                style={[
                  styles.iconChip,
                  { backgroundColor: '#ECFDF5' },
                ]}
              >
                <Feather
                  name="grid"
                  size={16}
                  color={SUCCESS}
                />
              </View>
              <Text style={styles.actionTxt}>
                Download CSV (Excel)
              </Text>
              {exportBusy && exportGuard.current === 'csv' ? (
                <ActivityIndicator size="small" color={SUCCESS} />
              ) : (
                <Feather
                  name="chevron-right"
                  size={18}
                  color={MUTED}
                />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionRow,
                exportBusy && styles.actionRowDisabled,
              ]}
              onPress={shareWhatsAppPdf}
              disabled={exportBusy}
            >
              <View
                style={[
                  styles.iconChip,
                  { backgroundColor: '#E7F9EF' },
                ]}
              >
                <FontAwesome
                  name="whatsapp"
                  size={16}
                  color="#25D366"
                />
              </View>
              <Text style={styles.actionTxt}>
                Send PDF via WhatsApp
              </Text>
              {exportBusy && exportGuard.current === 'wa' ? (
                <ActivityIndicator size="small" color="#25D366" />
              ) : (
                <Feather
                  name="chevron-right"
                  size={18}
                  color={MUTED}
                />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modalCancel,
                exportBusy && { opacity: 0.6 },
              ]}
              onPress={() => !exportBusy && setExportOpen(false)}
              disabled={exportBusy}
            >
              <Text style={styles.modalCancelTxt}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* ------------------------------ Styles ------------------------------ */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },

  header: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  headerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  headerActionTxt: { color: BRAND_BLUE, fontWeight: '800', fontSize: 12 },

  kpis: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    marginBottom: 6,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  kpiLabel: { fontSize: 11 },
  kpiValue: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 14,
    marginTop: 2,
  },

  filters: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    marginTop: 10,
  },
  dateInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    borderRadius: 10,
    height: 40,
    borderWidth: 1,
    borderColor: '#DDE3F0',
  },
  dateDisplay: { flex: 1, fontSize: 13, paddingVertical: 2 },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#DDE3F0',
  },
  resetTxt: { color: BRAND_BLUE, fontWeight: '800', fontSize: 12 },

  searchWrapOuter: {
    marginTop: 8,
    marginBottom: 6,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 10,
    height: 40,
    borderWidth: 1,
    borderColor: '#DDE3F0',
  },
  searchInputOuter: { flex: 1, color: TEXT, fontSize: 14, paddingVertical: 2 },

  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#F5F7FB',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#EEF1F6',
  },
  th: { color: '#4B5563', fontSize: 12, fontWeight: '700' },
  thRight: { textAlign: 'right' as const },

  row: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: CARD,
  },
  sep: { height: 1, backgroundColor: '#F0F2F5' },

  colDesc: { flex: 3.4, paddingRight: 8, justifyContent: 'center' },
  colMoney: {
    flex: 1.2,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },

  descTxt: { fontSize: 12, color: '#1F2937' },
  subDateTxt: { marginTop: 2, fontSize: 10, color: '#6B7280' },

  moneyTxt: { fontSize: 12, fontWeight: '900' },
  debit: { color: AMBER },
  credit: { color: SUCCESS },
  faint: { color: '#9CA3AF' },
  balance: { color: TEXT },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  errorText: { color: DANGER, fontSize: 14, marginBottom: 10 },
  retryBtn: {
    backgroundColor: LINK,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  emptyText: { color: MUTED, fontSize: 14 },

  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  centerModal: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  modalCard: { gap: 10, paddingBottom: 12 },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: TEXT,
    textAlign: 'center',
  },
  modalSub: {
    fontSize: 12,
    color: MUTED,
    textAlign: 'center',
    marginBottom: 2,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: '#FAFBFF',
    borderWidth: 1,
    borderColor: '#EEF1F6',
  },
  actionRowDisabled: { opacity: 0.6 },
  iconChip: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTxt: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: '#0B1220',
  },
  modalCancel: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  modalCancelTxt: { fontWeight: '800', color: MUTED },
});
