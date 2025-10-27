// app/(Transactions)/[customer_name]/accounttransactions.tsx
import api from '@/services/api';
import { useAuth } from '@/src/context/AuthContext';
import { Feather } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import { LinearGradient } from 'expo-linear-gradient';
import * as Print from 'expo-print';
import { useGlobalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

/* ----------------------------- Types ----------------------------- */
type Txn = {
  ts: string; // ISO
  id: number;
  source: 'invoice' | 'payment';
  txn_type: 'debit' | 'credit';
  amount: number;
  description?: string | null;
  invoice_id?: number | null;
  payment_id?: number | null;
  payment_method?: 'cash' | 'evc_plus' | string | null;
};

type Totals = {
  total_debits_in_range: number;
  total_credits_in_range: number;
  net_in_range: number;
  amount_paid_lifetime: number;
  amount_due_current: number;   // authoritative
  balance_current: number;      // alias of amount_due_current
};

type AccountStatement = {
  customer_id: number;
  customer_name: string;
  items: Txn[];
  totals: Totals;
};

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
const DANGER = '#EF4444';
const SUCCESS = '#059669';

const COLW = { no: 48, date: 124, desc: 150, debit: 88, credit: 88 };

/* ----------------------------- Helpers ----------------------------- */
const toISO = (d: Date) => d.toISOString();
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDayExclusive = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);

const startOfMonth = (y: number, m0: number) => new Date(y, m0, 1);
const endOfMonthExclusive = (y: number, m0: number) => new Date(y, m0 + 1, 1);

const startOfYear = (y: number) => new Date(y, 0, 1);
const endOfYearExclusive = (y: number) => new Date(y + 1, 0, 1);

const money = (n: number | undefined | null) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(
    Number(n || 0)
  );

const fmtDateTime = (iso: string) => {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

const csvEscape = (v: any) => {
  const s = v === null || v === undefined ? '' : String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

export default function AccountTransactionsScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { customer_name: raw } = useGlobalSearchParams<{ customer_name?: string | string[] }>();
  const customerName = Array.isArray(raw) ? raw[0] : raw;
  const decodedName = customerName ? decodeURIComponent(customerName) : undefined;

  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [items, setItems] = useState<Txn[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // filters
  type RangeMode = 'all' | 'today' | 'month' | 'year';
  const [mode, setMode] = useState<RangeMode>('all');
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month0, setMonth0] = useState<number>(now.getMonth()); // 0..11

  const authHeader = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

  const computeRange = useCallback((): { from?: string; to?: string; label: string } => {
    if (mode === 'today') {
      const f = startOfDay(now);
      const t = endOfDayExclusive(now);
      return { from: toISO(f), to: toISO(t), label: 'Today' };
    }
    if (mode === 'month') {
      const f = startOfMonth(year, month0);
      const t = endOfMonthExclusive(year, month0);
      const label = `${f.toLocaleString(undefined, { month: 'long' })} ${year}`;
      return { from: toISO(f), to: toISO(t), label };
    }
    if (mode === 'year') {
      const f = startOfYear(year);
      const t = endOfYearExclusive(year);
      return { from: toISO(f), to: toISO(t), label: String(year) };
    }
    return { label: 'All time' };
  }, [mode, year, month0]);

  const range = computeRange();

  const fetchProfile = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.get<MeProfile>('/diiwaan/me', { headers: authHeader });
      setProfile(res.data);
    } catch {
      // ignore
    }
  }, [token, authHeader]);

  const fetchPage = useCallback(
    async (reset = false) => {
      if (!token || !decodedName) return;
      setError(null);
      if (reset) {
        setLoading(true);
        setCursor(null);
        setHasMore(true);
      }
      try {
        const res = await api.get<AccountStatement>(
          '/diiwaanaccounts/customer-transactions/by-name',
          {
            headers: authHeader,
            params: {
              name: decodedName,
              match: 'exact',
              case_sensitive: false,
              order: 'ts_desc',
              limit: 40,
              cursor: reset ? undefined : cursor || undefined,
              from_date: range.from,
              to_date: range.to,
            },
          }
        );

        const nextCursor =
          (res.headers['x-next-cursor'] as string) ||
          ((res.headers as any)['X-Next-Cursor'] as string);
        setCursor(nextCursor || null);
        setHasMore(Boolean(nextCursor));

        if (reset) {
          setItems(res.data.items || []);
        } else {
          setItems((prev) => [...prev, ...(res.data.items || [])]);
        }
        setTotals(res.data.totals);
      } catch (e: any) {
        setError(e?.response?.data?.detail || 'Failed to load statement.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, decodedName, authHeader, cursor, range.from, range.to]
  );

  // For exports, fetch all pages for the selected range
  const fetchAllForExport = useCallback(async (): Promise<{ rows: Txn[]; totals: Totals | null }> => {
    let all: Txn[] = [];
    let c: string | null = null;
    let t: Totals | null = null;

    // loop — keep simple & robust
    for (;;) {
      const res = await api.get<AccountStatement>(
        '/diiwaanaccounts/customer-transactions/by-name',
        {
          headers: authHeader,
          params: {
            name: decodedName,
            match: 'exact',
            case_sensitive: false,
            order: 'ts_asc',      // ascending for statements
            limit: 200,
            cursor: c || undefined,
            from_date: range.from,
            to_date: range.to,
          },
        }
      );
      all = [...all, ...(res.data.items || [])];
      t = res.data.totals;
      const nextC =
        (res.headers['x-next-cursor'] as string) ||
        ((res.headers as any)['X-Next-Cursor'] as string);
      if (!nextC) break;
      c = nextC;
    }
    return { rows: all, totals: t };
  }, [authHeader, decodedName, range.from, range.to]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);
  useEffect(() => { fetchPage(true); }, [fetchPage]);
  // Refetch when mode/month/year changes
  useEffect(() => { fetchPage(true); }, [mode, month0, year]); // eslint-disable-line

  const onRefresh = () => {
    setRefreshing(true);
    fetchPage(true);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((r) => {
      const inDesc = (r.description || '').toLowerCase().includes(q);
      const inId = /^\d+$/.test(q) && String(r.id).includes(q);
      const inInv = r.invoice_id != null && String(r.invoice_id).includes(q);
      const inMethod = (r.payment_method || '').toLowerCase().includes(q);
      const inType = r.txn_type.includes(q);
      return inDesc || inId || inInv || inMethod || inType;
    });
  }, [search, items]);

  const totalsMemo = useMemo(() => {
    const d = totals?.total_debits_in_range ?? 0;
    const c = totals?.total_credits_in_range ?? 0;
    return {
      totalDebits: d,
      totalCredits: c,
      balance: totals?.balance_current ?? Math.max(d - c, 0),
      netInRange: (d - c),
    };
  }, [totals]);

  const sellerTitle =
    profile?.company_name?.trim() ? profile.company_name.trim() : (profile?.username ?? '');

  /* ----------------------------- Export: CSV (Excel) ----------------------------- */
  const exportCSV = useCallback(async () => {
    try {
      const { rows, totals: t } = await fetchAllForExport();
      // Build rows: No., Date, Description, Debit, Credit
      const header = ['No.', 'Date', 'Description', 'Debit', 'Credit'];
      const lines: string[] = [header.map(csvEscape).join(',')];

      rows.forEach((r, i) => {
        const debit = r.txn_type === 'debit' ? r.amount : 0;
        const credit = r.txn_type === 'credit' ? r.amount : 0;
        const dateStr = fmtDateTime(r.ts);
        const desc = r.description || (r.source === 'invoice' ? `Invoice #${r.invoice_id ?? r.id}` : `Payment #${r.payment_id ?? r.id}`);
        lines.push([
          i + 1,
          dateStr,
          desc,
          debit ? debit.toFixed(2) : '',
          credit ? credit.toFixed(2) : '',
        ].map(csvEscape).join(','));
      });

      // Totals row
      const tDeb = t?.total_debits_in_range ?? 0;
      const tCre = t?.total_credits_in_range ?? 0;
      lines.push(['', '', 'TOTAL', tDeb.toFixed(2), tCre.toFixed(2)].map(csvEscape).join(','));

      // Balance row (authoritative)
      const bal = t?.balance_current ?? (tDeb - tCre);
      lines.push(['', '', 'BALANCE', '', bal.toFixed(2)].map(csvEscape).join(','));

      const csv = lines.join('\n');
      const fname = `statement_${decodedName || 'customer'}_${Date.now()}.csv`;
      const path = FileSystem.cacheDirectory! + fname;
      await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });

      await Sharing.shareAsync(path, {
        mimeType: 'text/csv',
        dialogTitle: 'Export Statement (CSV)',
        UTI: 'public.comma-separated-values-text',
      });
    } catch (e: any) {
      Alert.alert('Export failed', e?.message || 'Could not export CSV.');
    }
  }, [fetchAllForExport, decodedName]);

  /* ----------------------------- Export: PDF ----------------------------- */
  const exportPDF = useCallback(async () => {
    try {
      const { rows, totals: t } = await fetchAllForExport();

      const rowsHtml = rows.map((r, i) => {
        const debit = r.txn_type === 'debit' ? r.amount : 0;
        const credit = r.txn_type === 'credit' ? r.amount : 0;
        const desc = r.description || (r.source === 'invoice' ? `Invoice #${r.invoice_id ?? r.id}` : `Payment #${r.payment_id ?? r.id}`);
        return `
          <tr>
            <td class="no">${i + 1}</td>
            <td class="date">${fmtDateTime(r.ts)}</td>
            <td class="desc">${escapeHtml(desc)}</td>
            <td class="num">${debit ? debit.toFixed(2) : ''}</td>
            <td class="num">${credit ? credit.toFixed(2) : ''}</td>
          </tr>`;
      }).join('');

      const tDeb = (t?.total_debits_in_range ?? 0).toFixed(2);
      const tCre = (t?.total_credits_in_range ?? 0).toFixed(2);
      const bal  = (t?.balance_current ?? ((t?.total_debits_in_range ?? 0) - (t?.total_credits_in_range ?? 0))).toFixed(2);

      const rangeLabel = range.label || 'All time';

      const html = `
        <html>
          <head>
            <meta name="viewport" content="initial-scale=1.0, width=device-width" />
            <style>
              @page { margin: 24px 18px; }
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, "Helvetica Neue", Arial, "Noto Sans", "Apple Color Emoji", "Segoe UI Emoji"; color: #0B1220; }
              .head { text-align:center; margin-bottom:8px; }
              .title { font-size:14px; font-weight:900; margin:0; }
              .sub   { font-size:10px; color:#6B7280; margin:2px 0 0 0; }
              .range { font-size:10px; color:#6B7280; margin:4px 0 10px 0; text-align:center; }
              table { width:100%; border-collapse:collapse; }
              th, td { border-bottom: 1px solid #E5E7EB; padding: 6px 6px; font-size:10px; }
              th { text-align:left; color:#374151; background:#F8FAFF; font-weight:800; }
              td.no { width:40px; color:#6B7280; }
              td.date { width:120px; }
              td.desc { }
              td.num { width:80px; text-align:right; font-variant-numeric: tabular-nums; }
              .totals td { font-weight:800; }
              .totals .label { color:#374151; }
              .balance td { font-weight:900; }
            </style>
          </head>
          <body>
            <div class="head">
              <p class="title">${escapeHtml(sellerTitle || 'Account Statement')}</p>
              <p class="sub">${escapeHtml(decodedName || '')}</p>
            </div>
            <div class="range">Range: ${escapeHtml(rangeLabel)}</div>
            <table>
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Debit</th>
                  <th>Credit</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
                <tr class="totals">
                  <td></td>
                  <td></td>
                  <td class="label">TOTAL</td>
                  <td class="num">${tDeb}</td>
                  <td class="num">${tCre}</td>
                </tr>
                <tr class="balance">
                  <td></td>
                  <td></td>
                  <td class="label">BALANCE</td>
                  <td></td>
                  <td class="num">${bal}</td>
                </tr>
              </tbody>
            </table>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { dialogTitle: 'Export Statement (PDF)' });
    } catch (e: any) {
      Alert.alert('Export failed', e?.message || 'Could not export PDF.');
    }
  }, [fetchAllForExport, sellerTitle, decodedName, range.label]);

  /* ----------------------------- UI ----------------------------- */
  const renderHeader = () => (
    <>
      {/* Top bar */}
      <LinearGradient
        colors={[BRAND_BLUE, BRAND_BLUE_2]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerInner}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
            <Feather name="arrow-left" size={18} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Account Statement
          </Text>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity onPress={exportCSV} style={styles.iconBtn} hitSlop={8}>
              <Feather name="file-text" size={16} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={exportPDF} style={styles.iconBtn} hitSlop={8}>
              <Feather name="printer" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>

      {/* Filters */}
      <View style={styles.filtersRow}>
        {/* Mode selector */}
        <View style={styles.modeWrap}>
          {(['all','today','month','year'] as RangeMode[]).map((m) => (
            <TouchableOpacity
              key={m}
              onPress={() => setMode(m)}
              style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
              activeOpacity={0.9}
            >
              <Text style={[styles.modeTxt, mode === m && styles.modeTxtActive]}>
                {m === 'all' ? 'All' : m === 'today' ? 'Today' : m === 'month' ? 'Month' : 'Year'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Month/Year dropdowns (compact) */}
        {mode === 'month' && (
          <View style={styles.dropRow}>
            <CompactDropdown
              label="Month"
              value={month0}
              onChange={setMonth0}
              options={[
                { label: 'Jan', value: 0 }, { label: 'Feb', value: 1 }, { label: 'Mar', value: 2 },
                { label: 'Apr', value: 3 }, { label: 'May', value: 4 }, { label: 'Jun', value: 5 },
                { label: 'Jul', value: 6 }, { label: 'Aug', value: 7 }, { label: 'Sep', value: 8 },
                { label: 'Oct', value: 9 }, { label: 'Nov', value: 10 }, { label: 'Dec', value: 11 },
              ]}
            />
            <CompactDropdown
              label="Year"
              value={year}
              onChange={setYear}
              options={yearsBack(7).map((y) => ({ label: String(y), value: y }))}
            />
          </View>
        )}
        {mode === 'year' && (
          <View style={styles.dropRow}>
            <CompactDropdown
              label="Year"
              value={year}
              onChange={setYear}
              options={yearsBack(10).map((y) => ({ label: String(y), value: y }))}
            />
          </View>
        )}
      </View>

      {/* Search */}
      <View style={styles.searchWrapOuter}>
        <Feather name="search" size={14} color="#9CA3AF" />
        <TextInput
          placeholder="Search description, id, invoice, method, type…"
          placeholderTextColor="#9CA3AF"
          value={search}
          onChangeText={setSearch}
          style={styles.searchInputOuter}
          returnKeyType="search"
          autoCorrect={false}
        />
      </View>

      {/* Totals strip */}
      <View style={styles.totalsStrip}>
        <View style={styles.totCard}>
          <Text style={styles.totLabel}>Debits</Text>
          <Text style={styles.totValue}>{money(totalsMemo.totalDebits)}</Text>
        </View>
        <View style={styles.totCard}>
          <Text style={styles.totLabel}>Credits</Text>
          <Text style={styles.totValue}>{money(totalsMemo.totalCredits)}</Text>
        </View>
        <View style={styles.totCard}>
          <Text style={styles.totLabel}>Balance</Text>
          <Text style={[styles.totValue, { color: DANGER }]}>{money(totalsMemo.balance)}</Text>
        </View>
      </View>

      {/* Table header */}
      <View style={styles.tableHeader}>
        <Text style={[styles.th, { width: COLW.no }]}>No.</Text>
        <Text style={[styles.th, { width: COLW.date }]}>Date</Text>
        <Text style={[styles.th, { flex: 1 }]}>Description</Text>
        <Text style={[styles.th, styles.thNum, { width: COLW.debit }]}>Debit</Text>
        <Text style={[styles.th, styles.thNum, { width: COLW.credit }]}>Credit</Text>
      </View>
    </>
  );

  const renderRow = ({ item, index }: { item: Txn; index: number }) => {
    const debit = item.txn_type === 'debit' ? item.amount : 0;
    const credit = item.txn_type === 'credit' ? item.amount : 0;
    const desc = item.description || (item.source === 'invoice'
      ? `Invoice #${item.invoice_id ?? item.id}`
      : `Payment #${item.payment_id ?? item.id}`);

    return (
      <View style={styles.tr}>
        <Text style={[styles.td, styles.tdNo, { width: COLW.no }]} numberOfLines={1}>
          {index + 1}
        </Text>
        <Text style={[styles.td, { width: COLW.date }]} numberOfLines={1}>
          {fmtDateTime(item.ts)}
        </Text>
        <Text style={[styles.td, { flex: 1 }]} numberOfLines={1}>
          {desc}
        </Text>
        <Text style={[styles.td, styles.tdNum, { width: COLW.debit }]} numberOfLines={1}>
          {debit ? debit.toFixed(2) : ''}
        </Text>
        <Text style={[styles.td, styles.tdNum, { width: COLW.credit }]} numberOfLines={1}>
          {credit ? credit.toFixed(2) : ''}
        </Text>
      </View>
    );
  };

  const renderFooter = () => {
    if (!items.length) return null;
    return (
      <View>
        {/* Totals row */}
        <View style={[styles.tr, styles.totalRow]}>
          <Text style={[styles.td, { width: COLW.no }]} />
          <Text style={[styles.td, { width: COLW.date }]} />
          <Text style={[styles.td, styles.totalLabel, { flex: 1 }]}>TOTAL</Text>
          <Text style={[styles.td, styles.tdNum, styles.totalCell, { width: COLW.debit }]}>
            {(totals?.total_debits_in_range ?? 0).toFixed(2)}
          </Text>
          <Text style={[styles.td, styles.tdNum, styles.totalCell, { width: COLW.credit }]}>
            {(totals?.total_credits_in_range ?? 0).toFixed(2)}
          </Text>
        </View>

        {/* Balance row */}
        <View style={[styles.tr, styles.balanceRow]}>
          <Text style={[styles.td, { width: COLW.no }]} />
          <Text style={[styles.td, { width: COLW.date }]} />
          <Text style={[styles.td, styles.totalLabel, { flex: 1 }]}>BALANCE</Text>
          <Text style={[styles.td, styles.tdNum, { width: COLW.debit }]} />
          <Text style={[styles.td, styles.tdNum, styles.balanceCell, { width: COLW.credit }]}>
            {(totals?.balance_current ?? Math.max((totals?.total_debits_in_range ?? 0) - (totals?.total_credits_in_range ?? 0), 0)).toFixed(2)}
          </Text>
        </View>

        {/* Load more */}
        {hasMore ? (
          <TouchableOpacity style={styles.loadMore} onPress={() => !loading && fetchPage(false)}>
            {loading ? (
              <ActivityIndicator size="small" color={LINK} />
            ) : (
              <Text style={styles.loadMoreText}>Load more</Text>
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />

      {loading && !refreshing ? (
        <>
          {renderHeader()}
          <View style={styles.center}><ActivityIndicator size="large" color={LINK} /></View>
        </>
      ) : error ? (
        <>
          {renderHeader()}
          <View style={styles.center}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => fetchPage(true)} style={styles.retryBtn}>
              <Text style={styles.retryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          {renderHeader()}
          <FlatList
            contentContainerStyle={styles.list}
            data={filtered}
            keyExtractor={(i) => String(i.id)}
            renderItem={renderRow}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={LINK} />}
            ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
            ListFooterComponent={renderFooter}
            ListEmptyComponent={
              <View style={styles.center}><Text style={styles.emptyText}>No transactions found.</Text></View>
            }
          />
        </>
      )}
    </SafeAreaView>
  );
}

/* ----------------------------- Tiny Components ----------------------------- */
function yearsBack(n: number): number[] {
  const y = new Date().getFullYear();
  const arr: number[] = [];
  for (let i = 0; i <= n; i++) arr.push(y - i);
  return arr;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

type Opt<V> = { label: string; value: V };
function CompactDropdown<V extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: V;
  options: Opt<V>[];
  onChange: (v: V) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value)?.label ?? '';

  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)} activeOpacity={0.9} style={styles.ddBtn}>
        <Text style={styles.ddLabel}>{label}</Text>
        <Text style={styles.ddValue}>{current}</Text>
        <Feather name="chevron-down" size={14} color="#64748B" />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableWithoutFeedback onPress={() => setOpen(false)}>
          <View style={styles.ddBackdrop} />
        </TouchableWithoutFeedback>
        <View style={styles.ddModal}>
          <View style={styles.ddCard}>
            <Text style={styles.ddTitle}>{label}</Text>
            {options.map((o) => (
              <TouchableOpacity
                key={String(o.value)}
                onPress={() => { onChange(o.value); setOpen(false); }}
                style={styles.ddItem}
              >
                <Text style={styles.ddItemTxt}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </>
  );
}

/* ------------------------------ STYLES ------------------------------ */
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
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },

  filtersRow: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 },
  modeWrap: { flexDirection: 'row', gap: 6 },
  modeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5EDFF',
    backgroundColor: '#FFFFFF',
  },
  modeBtnActive: { backgroundColor: '#F6F8FF', borderColor: '#DBE5FF' },
  modeTxt: { fontSize: 12, color: '#475569', fontWeight: '700' },
  modeTxtActive: { color: LINK },

  dropRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  ddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#DDE3F0',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  ddLabel: { fontSize: 11, color: '#64748B', marginRight: 2, fontWeight: '700' },
  ddValue: { fontSize: 12, color: '#111827', fontWeight: '800' },

  ddBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  ddModal: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', padding: 16 },
  ddCard: {
    width: '86%',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EEF1F6',
    padding: 12,
  },
  ddTitle: { fontSize: 13, fontWeight: '900', color: '#111827', marginBottom: 6 },
  ddItem: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  ddItemTxt: { fontSize: 12, color: '#111827', fontWeight: '700' },

  searchWrapOuter: {
    marginTop: 6,
    marginBottom: 6,
    alignSelf: 'center',
    width: '88%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    borderRadius: 10,
    height: 38,
    borderWidth: 1,
    borderColor: '#DDE3F0',
  },
  searchInputOuter: { flex: 1, color: TEXT, fontSize: 13, paddingVertical: 2 },

  totalsStrip: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 8 },
  totCard: {
    flex: 1,
    backgroundColor: '#F8FAFF',
    borderWidth: 1,
    borderColor: '#E5EDFF',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  totLabel: { fontSize: 10, color: MUTED, marginBottom: 2, fontWeight: '700' },
  totValue: { fontSize: 12, color: TEXT, fontWeight: '900' },

  list: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 24 },

  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAFBFF',
    borderWidth: 1,
    borderColor: '#EEF1F6',
    marginHorizontal: 12,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 6,
  },
  th: { fontSize: 11, color: '#374151', fontWeight: '800' },
  thNum: { textAlign: 'right' },

  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: BORDER,
    marginHorizontal: 12,
  },
  td: { fontSize: 11, color: '#111827' },
  tdNo: { color: '#6B7280' },
  tdNum: { textAlign: 'right', fontVariant: ['tabular-nums'] },

  totalRow: { marginTop: 8, backgroundColor: '#F8FAFF', borderColor: '#E5EDFF' },
  balanceRow: { marginTop: 6, backgroundColor: '#FFF8F8', borderColor: '#FFE3E3' },
  totalLabel: { fontWeight: '900', color: '#374151' },
  totalCell: { fontWeight: '900' },
  balanceCell: { fontWeight: '900', color: DANGER },

  loadMore: {
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 10,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  loadMoreText: { color: LINK, fontWeight: '800', fontSize: 12 },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  errorText: { color: '#B91C1C', fontSize: 13, marginBottom: 10 },
  retryBtn: { backgroundColor: LINK, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  emptyText: { color: '#9E9E9E', fontSize: 12 },
});
