// app/(customer)/CustomerInvoicesPage.tsx
import { useAuth } from '@/src/context/AuthContext';

import {
  getCustomerDetailsLocalByName,
  getCustomerInvoiceReportLocal,
  getSaleLocal,
  upsertCustomerInvoicesFromServer,
} from '@/app/db/CustomerInvoicesPagerepo';
import PaymentCreateSheet from '@/app/ManageInvoice/PaymentCreateSheet';
import api from '@/services/api';
import { Feather, FontAwesome } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { LinearGradient } from 'expo-linear-gradient';
import { useGlobalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  PixelRatio,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

/* ----------------------------- API Types (match /oilsale/summary/by-customer-name) ----------------------------- */
type SaleUnitType = 'liters' | 'fuusto' | 'caag' | 'lot';

type OilSaleRead = {
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

  currency: string; // 3-letter
  price_per_l?: number | null;
  subtotal_native?: number | null;
  discount_native?: number | null;
  tax_native?: number | null;
  total_native?: number | null;
  fx_rate_to_usd?: number | null;
  total_usd?: number | null;

  payment_status: 'unpaid' | 'partial' | 'paid';
  payment_method?: 'cash' | 'bank' | 'mobile' | 'credit' | null;
  paid_native?: number | null;
  note?: string | null;

  created_at: string;
  updated_at: string;
};

type OilTypeTotals = {
  oil_type: string;
  count: number;
  revenue_native: number;
  revenue_usd: number;
};

type OilSaleTotals = {
  per_type: OilTypeTotals[];
  overall_count: number;
  overall_revenue_native: number;
  overall_revenue_usd: number;
  // (per_currency exists in backend response; we don't use it here)
};

type OilSaleCustomerReport = {
  customer_id?: number | null;
  customer_name: string;
  customer_contact?: string | null;
  items: OilSaleRead[];
  totals: OilSaleTotals;
  offset: number;
  limit: number;
  returned: number;
  has_more: boolean;
};

type MeProfile = {
  id: number;
  username: string;
  email: string | null;
  company_name: string | null;
  phone_number: string | null;
};

/* ---- Macaamiil (customer) for amount_paid / amount_due + phone ---- */
type CustomerDetails = {
  id: number;
  name: string | null;
  phone: string | null;
  address?: string | null;
  status?: string | null;
  amount_due: number;
  amount_paid: number;
  created_at: string;
  updated_at: string;
};

/* ----------------------------- Theme ----------------------------- */
const BRAND_BLUE = '#0B2447';
const BRAND_BLUE_2 = '#19376D';
const ACCENT = '#576CBC';
const BG = '#F7F9FC';
const TEXT = '#0B1220';
const MUTED = '#6B7280';
const DANGER = '#EF4444';
const SUCCESS = '#10B981';
const BORDER = '#E5E7EB';
const CARD_BG = '#FFFEFB';
const PAPER_BORDER = '#EAE7DC';

export default function CustomerInvoicesPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth(); // user.id is your tenant / owner_id

  const { customer_name: raw } = useGlobalSearchParams<{ customer_name?: string | string[] }>();
  const customerName = Array.isArray(raw) ? raw[0] : raw;
  const decodedName = customerName ? decodeURIComponent(customerName) : undefined;

  const [isPayOpen, setIsPayOpen] = useState(false);
  const [isSaleOpen, setIsSaleOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [report, setReport] = useState<OilSaleCustomerReport | null>(null);
  const [customer, setCustomer] = useState<CustomerDetails | null>(null);
  const [meProfile, setMeProfile] = useState<MeProfile | null>(null);

  const [search, setSearch] = useState('');
  const [shareOpen, setShareOpen] = useState(false);

  const [online, setOnline] = useState(true);

  // 📌 Capture refs
  const scrollRef = useRef<ScrollView>(null); // capture THIS to get full content
  const sheetRef = useRef<View>(null); // inner paper (kept for layout measurement)
  const [paperHeight, setPaperHeight] = useState(0);

  // Receipt modal state
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [activeSaleId, setActiveSaleId] = useState<number | null>(null);
  const [activeSale, setActiveSale] = useState<OilSaleRead | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);

  const authHeader = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

  // NetInfo: track connectivity
  useEffect(() => {
    const sub = NetInfo.addEventListener((state) => {
      const ok = Boolean(state.isConnected && state.isInternetReachable);
      setOnline(ok);
    });
    return () => sub();
  }, []);

  // Profile
  const fetchProfile = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.get<MeProfile>('/diiwaan/me', { headers: authHeader });
      setMeProfile(res.data);
    } catch {
      setMeProfile(null);
    }
  }, [token, authHeader]);

// inside CustomerInvoicesPage.tsx
const fetchReport = useCallback(
  async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    setError(null);
    setLoading(true);

    try {
      // ONLINE → API + cache to sqlite
      if (online && token && user?.id) {
        const res = await api.get<OilSaleCustomerReport>(
          '/oilsale/summary/by-customer-name',
          {
            headers: authHeader,
            params: {
              customer_name: trimmed,
              match: 'exact',
              case_sensitive: false,
              order: 'created_desc',
              offset: 0,
              limit: 200,
            },
          }
        );

        // 1) use server data for current view
        setReport(res.data);

        // 2) cache to oilsales so offline works next time
        upsertCustomerInvoicesFromServer(res.data, user.id);

        // 3) KPIs: try API, fallback to local customers table
        if (res.data.customer_id) {
          try {
            const c = await api.get<CustomerDetails>(
              `/diiwaancustomers/${res.data.customer_id}`,
              { headers: authHeader }
            );
            setCustomer(c.data);
          } catch {
            const local = getCustomerDetailsLocalByName(
              user.id,
              res.data.customer_name
            );
            setCustomer(local);
          }
        } else {
          const local = getCustomerDetailsLocalByName(
            user.id,
            res.data.customer_name
          );
          setCustomer(local);
        }

        return;
      }

      // OFFLINE (or no token) → local-only
      if (user?.id) {
        const localReport = getCustomerInvoiceReportLocal(user.id, trimmed);
        setReport(localReport);

        const localCustomer = getCustomerDetailsLocalByName(
          user.id,
          localReport.customer_name
        );
        setCustomer(localCustomer);
      } else {
        setReport(null);
        setCustomer(null);
      }
    } catch (e: any) {
      // If online call fails, fallback to local cache
      if (user?.id) {
        try {
          const localReport = getCustomerInvoiceReportLocal(user.id, trimmed);
          setReport(localReport);
          const localCustomer = getCustomerDetailsLocalByName(
            user.id,
            localReport.customer_name
          );
          setCustomer(localCustomer);
          setError(null);
        } catch {
          setError('Failed to load customer oil sales from local DB.');
        }
      } else {
        setError(e?.response?.data?.detail || 'Failed to fetch customer oil sales.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  },
  [authHeader, online, token, user]
);



  const refetch = useCallback(() => {
    if (decodedName) fetchReport(decodedName);
  }, [decodedName, fetchReport]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    if (decodedName) fetchReport(decodedName);
  }, [decodedName, fetchReport]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    if (decodedName) fetchReport(decodedName);
  }, [fetchReport, decodedName]);

  // search: filter by oil type or sale id
  const filteredItems = useMemo(() => {
    if (!report?.items) return [];
    const q = search.trim().toLowerCase();
    if (!q) return report.items;
    return report.items.filter((row) => {
      const byOil = row.oil_type?.toLowerCase().includes(q);
      const byId = /^\d+$/.test(q) ? String(row.id).includes(q) : false;
      return byOil || byId;
    });
  }, [search, report]);

  // formatters
  const fmtDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return iso;
    }
  };

  const fmtNum = (n: number | null | undefined, digits = 2) =>
    typeof n === 'number' && isFinite(n) ? n.toFixed(digits) : '—';

  const fmtUSDMoney = (n?: number | null) =>
    typeof n === 'number' && isFinite(n)
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)
      : '—';

  const fmtCurrencyAmount = (currency: string, amount?: number | null) => {
    const cur = (currency || 'USD').toUpperCase();
    if (cur === 'USD') return fmtUSDMoney(amount); // $ with symbol
    return `${cur} ${fmtNum(amount, 2)}`;
  };

  // qty label: show number + unit (e.g., "2 fuusto", "1 caag", "25 L", "1 lot")
  const getQtyLabel = (r: OilSaleRead) => {
    if (r.unit_type === 'liters') return `${fmtNum(r.liters_sold, 0)} L`;
    if (r.unit_type === 'fuusto' || r.unit_type === 'caag') {
      const q = r.unit_qty || 0;
      return `${q} ${r.unit_type}`;
    }
    return '1 lot';
  };

  // ======= header =======
  const renderTableHeader = () => (
    <View style={styles.tableHeader}>
      <Text style={[styles.colItem, styles.headerText]}>Description</Text>
      <Text style={[styles.colQty, styles.headerText]}>Qty</Text>
      <Text style={[styles.colTotal, styles.headerText]}>Total</Text>
    </View>
  );

  // open receipt (online + offline)
  const openReceipt = useCallback(
    async (saleId: number) => {
      if (!user?.id) return;

      setReceiptOpen(true);
      setReceiptLoading(true);
      setActiveSaleId(saleId);
      setActiveSale(null);

      try {
        if (online && token) {
          const res = await api.get<OilSaleRead>(`/oilsale/${saleId}`, { headers: authHeader });
          setActiveSale(res.data);
        } else {
          const localSale = getSaleLocal(user.id, saleId);
          if (!localSale) throw new Error('Sale not found in local cache.');
          setActiveSale(localSale);
        }
      } catch (e: any) {
        // fallback to local if API fails
        try {
          const localSale = getSaleLocal(user.id, saleId);
          if (!localSale) throw e;
          setActiveSale(localSale);
        } catch (err: any) {
          Alert.alert(
            'Failed to load receipt',
            err?.response?.data?.detail || err?.message || 'Please try again.'
          );
          setReceiptOpen(false);
        }
      } finally {
        setReceiptLoading(false);
      }
    },
    [authHeader, online, token, user]
  );

  // ======= row =======
  const renderItem = useCallback(
    ({ item }: { item: OilSaleRead }) => {
      const isUSD = (item.currency || '').toUpperCase() === 'USD';
      const showUsdChild = !isUSD && typeof item.total_usd === 'number' && isFinite(item.total_usd);

      return (
        <TouchableOpacity
          onPress={() => openReceipt(item.id)}
          activeOpacity={0.8}
          style={styles.tableRow}
        >
          {/* Description: oil type + date under */}
          <View style={styles.colItemWrap}>
            <Text style={styles.cellText} numberOfLines={3}>
              {item.oil_type?.toUpperCase() || '—'}
            </Text>
            <Text style={styles.itemDate}>{fmtDate(item.created_at)}</Text>
          </View>

          {/* Qty */}
          <View style={styles.colQtyWrap}>
            <Text style={styles.qtyNumber}>{getQtyLabel(item)}</Text>
          </View>

          {/* Total column */}
          <View style={{ flex: 2, alignItems: 'flex-end' }}>
            <Text style={styles.cellText}>
              {fmtCurrencyAmount(item.currency, item.total_native)}
            </Text>
            {showUsdChild ? (
              <Text style={styles.itemDate}>{fmtUSDMoney(item.total_usd)}</Text>
            ) : null}
          </View>
        </TouchableOpacity>
      );
    },
    [openReceipt]
  );

  const handleBack = () => {
    router.replace('/customerslist');
  };

  const headerTitleText = 'Invoices';

  /* --------------------------------- Share helpers --------------------------------- */

  const openWhatsAppTo = async (phoneRaw: string, text: string) => {
    const digits = (phoneRaw || '').replace(/[^\d]/g, '');
    const msg = encodeURIComponent(text || '');
    const deepLink = `whatsapp://send?phone=${digits}&text=${msg}`;
    const webLink = `https://wa.me/${digits}?text=${msg}`;

    const canDeep = await Linking.canOpenURL('whatsapp://send');
    if (canDeep) {
      try {
        return await Linking.openURL(deepLink);
      } catch {}
    }
    const canWeb = await Linking.canOpenURL(webLink);
    if (canWeb) {
      try {
        return await Linking.openURL(webLink);
      } catch {}
    }
    Alert.alert('WhatsApp unavailable', 'Could not open WhatsApp on this device.');
  };

  /**
   * 🔧 Build a full-length image:
   * - capture the ScrollView (not just inner paper) so offscreen content is stitched
   * - use snapshotContentContainer: true
   * - adapt pixelRatio to avoid Android memory/bitmap height limits
   */
  const buildCapture = async () => {
    const target = scrollRef.current ?? sheetRef.current;
    if (!target) throw new Error('Nothing to capture');

    const canShare = await Sharing.isAvailableAsync();

    const basePR = PixelRatio.get() || 2;
    const safeMaxOutPx = 9000;
    const measuredHeight = paperHeight || 0;

    let pixelRatio = Math.max(1.5, Math.min(3, basePR));
    if (measuredHeight > 0) {
      pixelRatio = Math.min(pixelRatio, Math.max(1.2, safeMaxOutPx / measuredHeight));
    }

    const uri = await captureRef(target, {
      format: 'png',
      quality: 1,
      fileName: 'invoice',
      result: 'tmpfile',
      backgroundColor: '#FFFFFF',
      pixelRatio,
      snapshotContentContainer: true,
    });

    return { uri, canShare };
  };

  const onShareImage = async () => {
    try {
      const { uri, canShare } = await buildCapture();
      if (!canShare) {
        Alert.alert('Sharing unavailable', 'System sharing is not available on this device.');
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Share invoice',
        UTI: 'public.png',
      });
    } catch (e: any) {
      Alert.alert('Share failed', e?.message || 'Unable to generate image.');
    }
  };

  const onShareWhatsApp = async () => {
    try {
      const { uri, canShare } = await buildCapture();
      if (!canShare) {
        const canOpen = await Linking.canOpenURL('whatsapp://send');
        if (canOpen) {
          await Linking.openURL(
            'whatsapp://send?text=' + encodeURIComponent('See attached invoice.')
          );
        } else {
          Alert.alert(
            'Sharing unavailable',
            'WhatsApp or system share sheet is not available.'
          );
        }
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        UTI: 'public.png',
        dialogTitle: 'Send to WhatsApp',
      });
    } catch (e: any) {
      Alert.alert('WhatsApp share failed', e?.message || 'Unable to prepare image for WhatsApp.');
    }
  };

  // Seller header text
  const sellerTitle =
    meProfile?.company_name?.trim() ? meProfile.company_name.trim() : meProfile?.username ?? '';
  const sellerContact =
    meProfile?.phone_number?.trim() ? meProfile.phone_number!.trim() : meProfile?.email?.trim() ?? '';

  /* --------------------------------- UI --------------------------------- */
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
      {/* HEADER */}
      <LinearGradient
        colors={[BRAND_BLUE, BRAND_BLUE_2]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerInner}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={8}>
            <Feather name="arrow-left" size={20} color="#fff" />
          </TouchableOpacity>

          <Text style={styles.headerTitle} numberOfLines={1}>
            {headerTitleText}
          </Text>

          <TouchableOpacity
            style={styles.headerShareBtn}
            onPress={() => setShareOpen(true)}
            activeOpacity={0.9}
          >
            <Feather name="send" size={14} color={BRAND_BLUE} />
            <Text style={styles.headerShareTxt}>Udir macmiil</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* Quick actions */}
      <View style={styles.headerBar}>
        <TouchableOpacity
          style={[styles.pill, styles.pillPrimary]}
          activeOpacity={0.9}
          onPress={() => setIsPayOpen(true)}
        >
          <Feather name="dollar-sign" size={16} color={BRAND_BLUE} />
          <Text style={styles.pillPrimaryTxt}>Bixi deyn</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.pill, styles.pillAlt]}
          activeOpacity={0.9}
          onPress={() =>
            router.push({
              pathname: '/Shidaal/oilsaleforminvoice',
              params: {
                customer_name:
                  report?.customer_name || customer?.name || decodedName || '',
                customer_contact: customer?.phone || report?.customer_contact || '',
              },
            })
          }
        >
          <Feather name="plus" size={16} color={BRAND_BLUE} />
          <Text style={styles.pillAltTxt}>Diiwaan cusub</Text>
        </TouchableOpacity>
      </View>

      {/* SEARCH */}
      <View style={styles.searchRow}>
        <View style={styles.searchWrapOuter}>
          <Feather name="search" size={16} color={MUTED} />
          <TextInput
            placeholder="raadi shidaal"
            placeholderTextColor="#9CA3AF"
            style={styles.searchInputOuter}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>
      </View>

      {/* Content */}
      {loading && !report ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={ACCENT} />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      ) : report ? (
        <>
          {/* capture THIS ScrollView for a full-page stitched image */}
          <ScrollView
            ref={scrollRef}
            collapsable={false}
            contentContainerStyle={{ paddingBottom: insets.bottom }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={ACCENT}
              />
            }
          >
            {/* PRINTABLE / SHAREABLE PAPER */}
            <View
              style={styles.paperWrap}
              ref={sheetRef}
              collapsable={false}
              onLayout={(e) => setPaperHeight(e.nativeEvent.layout.height)}
            >
              {/* Seller (centered) */}
              <View style={styles.receiptHeaderCenter}>
                <Text style={styles.receiptTitle} numberOfLines={2}>
                  {sellerTitle || 'Receipt'}
                </Text>
                {!!sellerContact && (
                  <Text style={styles.receiptContact} numberOfLines={1}>
                    {sellerContact}
                  </Text>
                )}
              </View>

              {/* perforation */}
              <View style={styles.perforation} />

              {/* Customer header */}
              <View style={styles.customerNameLine}>
                <Text style={styles.customerNameTxt} numberOfLines={2}>
                  {report.customer_name || customer?.name || decodedName || '—'}
                </Text>
                {!!(customer?.phone || report.customer_contact) && (
                  <Text style={styles.customerPhoneTxt} numberOfLines={1}>
                    {customer?.phone || report.customer_contact}
                  </Text>
                )}
              </View>

              {/* KPI cards from Macaamiil (amount_paid / amount_due) */}
              <View style={styles.kpisInline}>
                <View style={styles.kpiCardInline}>
                  <Text style={styles.kpiLabel}>Bixisay</Text>
                  <Text style={[styles.kpiValueInline, { color: SUCCESS }]}>
                    {fmtUSDMoney(customer?.amount_paid ?? 0)}
                  </Text>
                </View>
                <View style={styles.kpiCardInline}>
                  <Text style={styles.kpiLabel}>kugu dhiman</Text>
                  <Text style={[styles.kpiValueInline, { color: DANGER }]}>
                    {fmtUSDMoney(customer?.amount_due ?? 0)}
                  </Text>
                </View>
              </View>

              {/* Items table */}
              <View style={styles.tableCard}>
                {renderTableHeader()}
                <FlatList
                  data={filteredItems}
                  keyExtractor={(it) => `${it.id}-${it.updated_at}`}
                  renderItem={renderItem}
                  ItemSeparatorComponent={() => <View style={styles.rowSep} />}
                  ListEmptyComponent={
                    <Text style={styles.emptyText}>
                      {search ? 'No matches.' : 'No oil sales for this customer.'}
                    </Text>
                  }
                  scrollEnabled={false}
                  contentContainerStyle={{ paddingVertical: 2 }}
                />
              </View>
            </View>
          </ScrollView>
        </>
      ) : (
        <View style={styles.center}>
          {error ? <Text style={styles.errorText}>{error}</Text> : <Text>No data.</Text>}
        </View>
      )}

      {/* Payment sheet (uses Macaamiil due) */}
      <PaymentCreateSheet
        visible={isPayOpen}
        onClose={() => setIsPayOpen(false)}
        token={token}
        customerId={customer?.id ?? report?.customer_id ?? undefined}
        onCreated={refetch}
        customerName={report?.customer_name || customer?.name}
        customerPhone={customer?.phone || report?.customer_contact || undefined}
        companyName={meProfile?.company_name || meProfile?.username}
        companyContact={meProfile?.phone_number || meProfile?.email || undefined}
        currentDue={customer?.amount_due ?? 0}
      />

      {/* Share popup */}
      <SharePopup
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        onShareImg={onShareImage}
        onShareWhatsApp={onShareWhatsApp}
        onOpenWhatsAppChat={() =>
          openWhatsAppTo(
            customer?.phone || report?.customer_contact || '',
            `Salaan ${
              report?.customer_name || customer?.name || ''
            }, fadlan eeg rasiidka (sawirka/PNG) ee aan kuu diray.`
          )
        }
      />

      {/* Receipt popup */}
      <ReceiptModal
        visible={receiptOpen}
        loading={receiptLoading}
        sale={activeSale}
        onClose={() => setReceiptOpen(false)}
        sellerTitle={sellerTitle}
        sellerContact={sellerContact}
        customerName={report?.customer_name || customer?.name || decodedName || ''}
        customerPhone={customer?.phone || report?.customer_contact || ''}
      />

      {/* Oil sale create modal (if you later add) */}
      {/* <OilSaleCreateSheet visible={isSaleOpen} onClose={() => setIsSaleOpen(false)} /> */}
    </SafeAreaView>
  );
}

/* ------------------------------ Receipt Modal ------------------------------ */
function ReceiptModal({
  visible,
  loading,
  sale,
  onClose,
  sellerTitle,
  sellerContact,
  customerName,
  customerPhone,
}: {
  visible: boolean;
  loading: boolean;
  sale: OilSaleRead | null;
  onClose: () => void;
  sellerTitle: string;
  sellerContact: string;
  customerName: string;
  customerPhone: string;
}) {
  const isUSD = (sale?.currency || '').toUpperCase() === 'USD';
  const fmtNum = (n?: number | null, d = 2) =>
    typeof n === 'number' && isFinite(n) ? n.toFixed(d) : '—';
  const fmtUSD = (n?: number | null) =>
    typeof n === 'number' && isFinite(n)
      ? new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 2,
        }).format(n)
      : '—';
  const fmtCur = (cur?: string, n?: number | null) => {
    const c = (cur || 'USD').toUpperCase();
    if (c === 'USD') return fmtUSD(n);
    return `${c} ${fmtNum(n, 2)}`;
  };
  const qtyLabel = sale
    ? sale.unit_type === 'liters'
      ? `${fmtNum(sale.liters_sold, 0)} L`
      : sale.unit_type === 'lot'
      ? '1 lot'
      : `${sale.unit_qty || 0} ${sale.unit_type}`
    : '—';

  // summary balances (based on single sale)
  const subtotal = sale?.subtotal_native ?? null;
  const discount = sale?.discount_native ?? 0;
  const tax = sale?.tax_native ?? 0;
  const totalNative = sale?.total_native ?? null;
  const paidNative = sale?.paid_native ?? 0;
  const balanceNative = (totalNative ?? 0) - (paidNative ?? 0);

  // USD view (only if sale is non-USD and has total_usd)
  const usdView = !isUSD && typeof sale?.total_usd === 'number' ? sale?.total_usd : null;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.centerWrap}>
        <View style={[styles.centerCard, { maxWidth: 600 }]}>
          <Text style={styles.popupTitle}>Receipt</Text>

          {loading ? (
            <View style={{ paddingVertical: 20, alignItems: 'center' }}>
              <ActivityIndicator size="large" color={ACCENT} />
            </View>
          ) : sale ? (
            <View>
              {/* Seller */}
              <View style={styles.receiptHeaderCenter}>
                <Text style={styles.receiptTitle}>{sellerTitle || 'Seller'}</Text>
                {!!sellerContact && <Text style={styles.receiptContact}>{sellerContact}</Text>}
              </View>

              {/* Customer line */}
              <View style={[styles.customerNameLine, { marginTop: 8 }]}>
                <Text style={styles.customerNameTxt}>{customerName || '—'}</Text>
                {!!customerPhone && <Text style={styles.customerPhoneTxt}>{customerPhone}</Text>}
              </View>

              <View
                style={{
                  marginVertical: 8,
                  borderBottomWidth: 1,
                  borderBottomColor: '#F1F1F1',
                }}
              />

              {/* Body */}
              <View style={{ gap: 6 }}>
                <KV label="Sale ID" value={`#${sale.id}`} />
                <KV label="Date" value={new Date(sale.created_at).toLocaleString()} />
                <KV label="Oil type" value={sale.oil_type?.toUpperCase()} />
                <KV label="Quantity" value={qtyLabel} />
                <KV
                  label="Currency"
                  value={isUSD ? '$ (USD)' : (sale.currency || '').toUpperCase()}
                />
                {typeof sale.price_per_l === 'number' ? (
                  <KV
                    label={
                      sale.unit_type === 'liters'
                        ? 'Price per L'
                        : 'Price per L (derived)'
                    }
                    value={fmtCur(sale.currency, sale.price_per_l)}
                  />
                ) : null}
              </View>

              {/* Summary */}
              <View style={styles.summaryCard}>
                <Row label="Subtotal" value={fmtCur(sale.currency, subtotal)} bold={false} />
                {discount ? (
                  <Row
                    label="Discount"
                    value={`- ${fmtCur(sale.currency, discount)}`}
                    bold={false}
                  />
                ) : null}
                {tax ? (
                  <Row label="Tax" value={fmtCur(sale.currency, tax)} bold={false} />
                ) : null}
                <Row label="Total" value={fmtCur(sale.currency, totalNative)} bold />
                {!isUSD && typeof usdView === 'number' ? (
                  <Row label="USD View" value={fmtUSD(usdView)} />
                ) : null}
                {typeof paidNative === 'number' && paidNative > 0 ? (
                  <Row label="Paid" value={`- ${fmtCur(sale.currency, paidNative)}`} />
                ) : null}
                <View style={{ height: 6 }} />
                <Row label="Balance" value={fmtCur(sale.currency, balanceNative)} bold />
              </View>

              {!!sale.note && (
                <View style={{ marginTop: 8 }}>
                  <Text style={{ color: MUTED, fontSize: 11 }}>Note</Text>
                  <Text style={{ color: TEXT, fontSize: 12 }}>{sale.note}</Text>
                </View>
              )}

              <View style={{ marginTop: 12, alignItems: 'center' }}>
                <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                  <Text style={styles.closeBtnTxt}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <Text style={{ textAlign: 'center,', color: MUTED }}>No sale loaded.</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ color: MUTED, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: TEXT, fontSize: 12, fontWeight: '700' }}>{value}</Text>
    </View>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
      <Text style={{ color: TEXT, fontSize: 13, fontWeight: bold ? '800' : '600' }}>
        {label}
      </Text>
      <Text style={{ color: TEXT, fontSize: 13, fontWeight: bold ? '900' : '700' }}>
        {value}
      </Text>
    </View>
  );
}

/* ------------------------------ Share Popup ------------------------------ */
function SharePopup({
  visible,
  onClose,
  onShareImg,
  onShareWhatsApp,
  onOpenWhatsAppChat,
}: {
  visible: boolean;
  onClose: () => void;
  onShareImg: () => void;
  onShareWhatsApp: () => void;
  onOpenWhatsAppChat: () => void;
}) {
  return (
    <CenterModal visible={visible} onClose={onClose}>
      <Text style={styles.popupTitle}>Udir macmiil</Text>
      <TouchableOpacity
        style={styles.popupBtn}
        onPress={() => {
          onShareImg();
          onClose();
        }}
      >
        <Feather name="image" size={16} color={TEXT} />
        <Text style={styles.popupBtnTxt}>Share Image (PNG)</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.popupBtn}
        onPress={() => {
          onShareWhatsApp();
          onClose();
        }}
      >
        <FontAwesome name="whatsapp" size={16} color="#25D366" />
        <Text style={styles.popupBtnTxt}>WhatsApp</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.popupBtn}
        onPress={() => {
          onOpenWhatsAppChat();
          onClose();
        }}
      >
        <FontAwesome name="whatsapp" size={16} color="#25D366" />
        <Text style={styles.popupBtnTxt}>Open WhatsApp Chat</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.popupBtn, styles.popupBtnGhost]} onPress={onClose}>
        <Text style={[styles.popupBtnTxt, { color: MUTED }]}>Close</Text>
      </TouchableOpacity>
    </CenterModal>
  );
}

/* ----------------------------- Center Modal ----------------------------- */
function CenterModal({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
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
        <View style={styles.centerCard}>{children}</View>
      </View>
    </Modal>
  );
}

/* --------------------------------- Styles -------------------------------- */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },

  header: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 16,
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

  headerShareBtn: {
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
  headerShareTxt: { color: BRAND_BLUE, fontWeight: '800', fontSize: 12 },

  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 10,
    marginBottom: 10,
    paddingHorizontal: 14,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  pillPrimary: { backgroundColor: '#fff', borderColor: BRAND_BLUE },
  pillPrimaryTxt: { color: BRAND_BLUE, fontWeight: '800' },
  pillAlt: { backgroundColor: '#EEF2FF', borderColor: BRAND_BLUE },
  pillAltTxt: { color: BRAND_BLUE, fontWeight: '800' },

  searchRow: {
    marginTop: 6,
    marginBottom: 6,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchWrapOuter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    borderRadius: 10,
    height: 40,
    borderWidth: 1,
    borderColor: '#DDE3F0',
  },
  searchInputOuter: {
    flex: 1,
    color: TEXT,
    fontSize: 14,
    paddingVertical: 2,
  },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  errorText: { color: DANGER, marginTop: 8 },
  emptyText: { textAlign: 'center', color: MUTED, marginTop: 12 },

  paperWrap: {
    marginTop: 12,
    marginHorizontal: 14,
    marginBottom: 0,

    backgroundColor: CARD_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PAPER_BORDER,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  receiptHeaderCenter: {
    alignItems: 'center',
    marginBottom: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#EFEDE6',
    borderStyle: 'dashed',
  },
  receiptTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: TEXT,
    textAlign: 'center',
  },
  receiptContact: {
    marginTop: 4,
    color: MUTED,
    fontSize: 11,
    textAlign: 'center',
  },

  perforation: {
    borderBottomWidth: 1,
    borderBottomColor: '#EFEDE6',
    borderStyle: 'dashed',
    marginTop: 2,
    marginBottom: 8,
  },

  customerNameLine: {
    marginTop: 2,
    marginBottom: 6,
  },
  customerNameTxt: {
    fontSize: 13,
    color: TEXT,
    fontWeight: '800',
  },
  customerPhoneTxt: {
    marginTop: 2,
    fontSize: 11,
    color: MUTED,
  },

  kpisInline: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 2,
    justifyContent: 'space-between',
  },
  kpiCardInline: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#FAFBFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    minWidth: 110,
  },
  kpiLabel: { color: MUTED, fontSize: 11, marginBottom: 2 },
  kpiValueInline: { fontSize: 14, fontWeight: '900', color: TEXT },

  tableCard: {
    marginTop: 6,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 4,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1F6',
    backgroundColor: '#F5F7FB',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    paddingHorizontal: 4,
  },
  headerText: { fontSize: 12, fontWeight: '700', color: '#4B5563' },

  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F2F5',
  },
  rowSep: { height: 0 },

  colItemWrap: { flex: 2, paddingRight: 2 },
  colItem: { flex: 2, paddingRight: 2 },
  colQty: { flex: 2, textAlign: 'center' as const },
  colTotal: { flex: 2, textAlign: 'right' as const, paddingRight: 6 },

  colQtyWrap: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyNumber: { fontSize: 13, fontWeight: '800', color: TEXT, lineHeight: 16 },

  cellText: { fontSize: 12, color: TEXT, lineHeight: 16 },
  itemDate: { marginTop: 2, fontSize: 11, color: MUTED },

  /* ----- Center/Modal styles ----- */
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  centerCard: {
    width: '92%',
    maxWidth: 520,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
    elevation: 8,
  },
  popupTitle: {
    fontWeight: '900',
    color: TEXT,
    fontSize: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  popupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EEF1F6',
    backgroundColor: '#F9FAFB',
    marginTop: 6,
  },
  popupBtnGhost: {
    alignSelf: 'center',
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  popupBtnTxt: { fontWeight: '700', color: TEXT },

  summaryCard: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    backgroundColor: '#FAFAFA',
  },
  closeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: BRAND_BLUE,
  },
  closeBtnTxt: {
    color: '#fff',
    fontWeight: '800',
  },
});
