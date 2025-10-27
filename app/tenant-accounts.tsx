// app/(Accounts)/tenant-accounts.tsx
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';

import { BackHandler } from 'react-native';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';

import api from '@/services/api';
import { useAuth } from '@/src/context/AuthContext';

/* ─────────────────── Types from /diiwaantenantsaccounts/summary ─────────────────── */
type AccountType = 'ar' | 'ap' | 'revenue' | 'cash' | 'inventory';

type AccountBalance = {
  account_type: AccountType;
  balance_native: number;
  balance_usd: number;
};

type AccountSummary = {
  per_account: AccountBalance[];

  ar_native: number; ap_native: number; revenue_native: number; cash_native: number; inventory_native: number;
  ar_usd: number;    ap_usd: number;    revenue_usd: number;    cash_usd: number;    inventory_usd: number;

  oil_asset_native: number;
  oil_asset_usd: number;
  cogs_native: number;
  cogs_usd: number;
  net_profit_native: number;
  net_profit_usd: number;

  truck_plate?: string | null;
};

type AccountTruckPlate = {
  truck_plate: string;
  summary: AccountSummary;
};

type AccountSummaryResponse = {
  overall: AccountSummary;
  trucks: AccountTruckPlate[];
};

/* ─────────────────── Theme / helpers ─────────────────── */
const BORDER = '#E5E7EB';
const BRAND = '#0B2447';
const OK = '#059669';
const BAD = '#DC2626';
const TEXT = '#111827';
const { width } = Dimensions.get('window');

const numFace = Platform.OS === 'android'
  ? { fontFamily: 'monospace' as const }
  : { fontVariant: ['tabular-nums'] as const };

const normalizeUSD = (c?: string | null) => {
  const cur = (c || 'USD').toUpperCase().trim();
  if (cur === 'USD' || cur === 'US' || cur === 'US$' || cur === 'USD$') return 'USD';
  return cur;
};
const money = (n?: number | null, currency?: string | null) => {
  const cur = normalizeUSD(currency);
  const val = n ?? 0;
  if (cur === 'USD') {
    const num = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(val);
    return `$${num}`;
  }
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(val);
};

/* ─────────────────── Tiny dropdown ─────────────────── */
type DropdownItem = { label: string; value: string };

const modeItems: DropdownItem[] = [
  { label: 'Annual', value: 'annual' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'As-Of Date', value: 'custom' },
];

function Dropdown({
  items, value, onChange, placeholder = 'Select...', maxVisibleItems = 6,
}: {
  items: DropdownItem[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxVisibleItems?: number;
}) {
  const [open, setOpen] = useState(false);
  const [itemH, setItemH] = useState(36);
  const selected = items.find(i => i.value === value)?.label ?? placeholder;
  return (
    <View style={styles.dd}>
      <TouchableOpacity style={styles.ddHead} onPress={() => setOpen(true)} activeOpacity={0.85}>
        <Text numberOfLines={1} style={styles.ddHeadText}>{selected}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color="#111827" />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.ddOverlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={[styles.ddList, { maxHeight: itemH * Math.min(maxVisibleItems, items.length) + 2 }]}>
            <FlatList
              data={items}
              keyExtractor={(i) => i.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.ddItem, { backgroundColor: item.value === value ? '#F3F4F6' : '#FFFFFF' }]}
                  onPress={() => { onChange(item.value); setOpen(false); }}
                  onLayout={(e) => { const h = e.nativeEvent.layout.height; if (h !== itemH) setItemH(h); }}
                >
                  <Text style={styles.ddItemText}>{item.label}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

/* ─────────────────── Screen ─────────────────── */
export default function TenantAccountsStatement() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();

  // Mode & date controls
  const [mode, setMode] = useState<'annual'|'monthly'|'custom'>('annual');
  const now = new Date();
  const currentYear = now.getFullYear();

  const [year, setYear] = useState<string>(String(currentYear));
  const [month, setMonth] = useState<string>(`${currentYear}-${String(now.getMonth()+1).padStart(2,'0')}`);
  const [asOf, setAsOf] = useState<Date>(now);
  const [showPicker, setShowPicker] = useState(false);

  // Truck plate filter
  const [truckPlate, setTruckPlate] = useState<string>('');
  const [truckItems, setTruckItems] = useState<DropdownItem[]>([{ label: 'All Trucks', value: '' }]);
  const [trucksData, setTrucksData] = useState<AccountTruckPlate[]>([]);
  const allPlatesRef = useRef<string[]>([]); // cache of all trucks to always show in dropdown

  // Build request params
  const buildRange = useCallback(() => {
    if (mode === 'annual') {
      const y = Number(year);
      const start = new Date(Date.UTC(y, 0, 1)).toISOString();
      const end   = new Date(Date.UTC(y, 11, 31, 23,59,59)).toISOString();
      return { start, end, label: `Year ${year}` };
    }
    if (mode === 'monthly') {
      const [y, m] = month.split('-').map(Number);
      const start = new Date(Date.UTC(y, m-1, 1)).toISOString();
      const end   = new Date(Date.UTC(y, m, 0, 23,59,59)).toISOString();
      return { start, end, label: `Month ${month}` };
    }
    const end = new Date(Date.UTC(asOf.getFullYear(), asOf.getMonth(), asOf.getDate(), 23,59,59)).toISOString();
    return { end, label: `As-Of ${asOf.toISOString().slice(0,10)}` };
  }, [mode, year, month, asOf]);

  // Data
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [loading, setLoading] = useState(true);



  

  const fetchSummary = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const { start, end } = buildRange();
      const params: any = { start, end };
      if (truckPlate) params.truck_plate = truckPlate;

      const res = await api.get<AccountSummaryResponse>('/diiwaantenantsaccounts/summary', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        params,
      });

      setSummary(res.data.overall);
      setTrucksData(res.data.trucks || []);

      // Gather plates from response
      const plates = Array.from(
        new Set((res.data.trucks || [])
          .map(t => (t.truck_plate || '').trim())
          .filter(Boolean))
      );

      // If "All Trucks" is selected, refresh the cached full list
      if (!truckPlate) {
        allPlatesRef.current = plates;
      }

      // Always show ALL known plates in the dropdown
      const baseList = allPlatesRef.current.length ? allPlatesRef.current : plates;
      const deduped = Array.from(new Set(baseList));
      const items: DropdownItem[] = [{ label: 'All Trucks', value: '' }, ...deduped.map(p => ({ label: p, value: p }))];

      // Ensure current selection is visible even if not in list for this range
      if (truckPlate && !deduped.includes(truckPlate)) {
        items.push({ label: truckPlate, value: truckPlate });
      }
      setTruckItems(items);

      setShotUri(null);
    } catch (e: any) {
      console.error(e);
      Alert.alert('Load failed', e?.response?.data?.detail ?? 'Unable to load tenant accounts summary.');
      setSummary(null);
      setTrucksData([]);
      setTruckItems([{ label: 'All Trucks', value: '' }]);
    } finally {
      setLoading(false);
    }
  }, [token, buildRange, truckPlate]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  // Helpers
  const getUsdFromSummary = (s: AccountSummary | null | undefined, t: AccountType) =>
    s?.per_account.find(p => p.account_type === t)?.balance_usd ?? 0;

  // Values
  const cash      = getUsdFromSummary(summary, 'cash');
  const ar        = getUsdFromSummary(summary, 'ar');
  const revenue   = getUsdFromSummary(summary, 'revenue');
  const inventory = getUsdFromSummary(summary, 'inventory');

  const ap = useMemo(() => {
    if (truckPlate) {
      const ts = trucksData.find(t => t.truck_plate === truckPlate)?.summary;
      return getUsdFromSummary(ts, 'ap');
    }
    return getUsdFromSummary(summary, 'ap');
  }, [truckPlate, trucksData, summary]);

  const cogs = summary?.cogs_usd ?? Math.max(0, - (summary?.oil_asset_usd ?? 0));
  const net  = summary?.net_profit_usd ?? (revenue - cogs);

  const { label: periodLabel } = buildRange();
  const truckLabel = truckPlate ? ` • Plate: ${truckPlate}` : '';

  const totalAssets = cash + ar + inventory; // kept only for share text
  const shareText = useMemo(() => {
    return [
      `*Tenant Accounts (USD View)*`,
      `${periodLabel}${truckLabel}`,
      '',
      `• Cash: ${money(cash)}`,
      `• A/R: ${money(ar)}`,
      `• Inventory (Remaining): ${money(inventory)}`,
      `• Total Assets: ${money(totalAssets)}`,
      `• A/P: ${money(ap)}`,
      `• Revenue: ${money(revenue)}`,
      `• COGS: ${money(cogs)}`,
      `• Net Profit: ${money(net)}`,
    ].join('\n');
  }, [periodLabel, truckLabel, cash, ar, ap, revenue, cogs, net, inventory, totalAssets]);

  /* ─────────────────── Screenshot + actions (Degso) ─────────────────── */
  const statementRef = useRef<View>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [shotUri, setShotUri] = useState<string | null>(null);
  const [busyShot, setBusyShot] = useState(false);

  const ensureShot = useCallback(async () => {
    if (busyShot) return shotUri;
    try {
      setBusyShot(true);
      const uri = await captureRef(statementRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      } as any);
      setShotUri(uri as string);
      return uri as string;
    } catch (e) {
      console.warn('capture failed', e);
      Alert.alert('Snapshot failed', 'Unable to capture the statement image.');
      return null;
    } finally {
      setBusyShot(false);
    }
  }, [busyShot, statementRef.current]);

  useEffect(() => {
    setShotUri(null);
  }, [mode, year, month, asOf?.toISOString(), truckPlate]);

  const onPressDegso = async () => {
    setActionsOpen(true);
    if (!shotUri) {
      await ensureShot();
    }
  };


  useFocusEffect(
  React.useCallback(() => {
    const onHardwareBackPress = () => {
      router.replace('/menu'); // always go to /menu
      return true;             // consume the back press so the app never exits
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBackPress);
    return () => sub.remove();
  }, [router])
);

  const onDownload = async () => {
    const uri = shotUri ?? (await ensureShot());
    if (!uri) return;
    try {
      const perm = await MediaLibrary.getPermissionsAsync();
      if (perm.status !== 'granted') {
        const req = await MediaLibrary.requestPermissionsAsync();
        if (req.status !== 'granted') {
          Alert.alert('Permission needed', 'Allow storage permission to save the image.');
          return;
        }
      }
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('Saved', 'Statement image saved to your gallery.');
      setActionsOpen(false);
    } catch (e) {
      console.error(e);
      Alert.alert('Save failed', 'Unable to save the image to your gallery.');
    }
  };

  const onShareWhatsApp = async () => {
    const uri = shotUri ?? (await ensureShot());
    if (!uri) return;
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert('Sharing unavailable', 'System sharing is not available on this device.');
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Share to WhatsApp',
        UTI: 'public.png',
      });
      setActionsOpen(false);
    } catch (e) {
      console.error(e);
      Alert.alert('Share failed', 'Unable to share the statement.');
    }
  };

  /* ─────────────────── Render ─────────────────── */
  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Gradient header */}
      <LinearGradient
        colors={[BRAND, BRAND]}
        start={{ x:0, y:0 }}
        end={{ x:1, y:0 }}
        style={[styles.gradientHeader, { paddingTop: Math.max(insets.top, 10) + 6 }]}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerLeftGroup}>
            <TouchableOpacity onPress={() => router.replace('/menu')} style={styles.backBtn}  hitSlop={{ top:8, left:8, right:8, bottom:8 }}>
              <Ionicons name="chevron-back" size={20} color="#E0E7FF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle} numberOfLines={1}>Income Statement (USD)</Text>
          </View>

          {/* Degso (Download/Share) */}
          <TouchableOpacity style={styles.headerRightPill} onPress={onPressDegso} activeOpacity={0.9}>
            <Ionicons name="download-outline" size={16} color="#fff" />
            <Text style={styles.headerRightPillTxt}>Degso</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* Content */}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Controls */}
        <View style={styles.controls}>
          <View className="mode"><Dropdown items={modeItems} value={mode} onChange={(v)=>setMode(v as any)} /></View>

          {mode === 'annual' && (
            <View style={styles.control}><Dropdown items={Array.from({ length: 6 }, (_, i) => {
              const y = String(currentYear - i); return { label: y, value: y };
            })} value={year} onChange={setYear} /></View>
          )}

          {mode === 'monthly' && (
            <View style={styles.control}><Dropdown items={Array.from({ length: 12 }, (_, i) => {
              const v = `${currentYear}-${String(i+1).padStart(2,'0')}`; return { label: v, value: v };
            })} value={month} onChange={setMonth} /></View>
          )}

          {mode === 'custom' && (
            <View style={[styles.control, styles.dateControl]}>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setShowPicker(true)}>
                <Ionicons name="calendar-outline" size={14} color="#111827" />
                <Text style={styles.dateText}>{asOf.toISOString().slice(0,10)}</Text>
              </TouchableOpacity>
              {showPicker && (
                <DateTimePicker
                  mode="date"
                  value={asOf}
                  display="default"
                  onChange={(_, d) => { setShowPicker(false); if (d) setAsOf(d); }}
                />
              )}
            </View>
          )}

          {/* Truck plate dropdown */}
          <View style={styles.control}>
            <Dropdown
              items={truckItems}
              value={truckPlate}
              onChange={setTruckPlate}
              placeholder={'All Trucks'}
            />
          </View>
        </View>

        {/* STATEMENT PAPER */}
        <View ref={statementRef} collapsable={false} style={styles.paper}>
          {/* Overview card */}
                  {/* Overview card */}
        <View style={[styles.card, { backgroundColor: '#F0F9FF' }]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Overview</Text>
            <View style={styles.badge}>
              <Ionicons name="time-outline" size={12} color="#1E40AF" />
              <Text style={styles.badgeTxt}>
                {buildRange().label}{truckPlate ? ` • ${truckPlate}` : ''}
              </Text>
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="trending-up-outline" size={16} color="#0EA5E9" />
              <Text style={styles.rowLabel}>Net Profit</Text>
            </View>
            <Text style={[styles.rowValue, numFace, { color: net >= 0 ? OK : BAD }]}>{money(net)}</Text>
          </View>

          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="add-circle-outline" size={16} color="#0EA5E9" />
              <Text style={styles.rowLabel}>Revenue</Text>
            </View>
            <Text style={[styles.rowValue, numFace]}>{money(revenue)}</Text>
          </View>

          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="trending-up-outline" size={16} color="#0EA5E9" />
              <Text style={styles.rowLabel}>COGS</Text>
            </View>
            <Text style={[styles.rowValue, numFace]}>{money(cogs)}</Text>
          </View>

          {/* ✅ Put Total Assets back */}
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="layers-outline" size={16} color="#0EA5E9" />
              <Text style={styles.rowLabel}>Total Assets (Cash + A/R + Inventory)</Text>
            </View>
            <Text style={[styles.rowValue, numFace]}>{money(totalAssets)}</Text>
          </View>
        </View>


          {/* Sections */}
          <Card>
            <CardHeader title="Cash & Receivables" />
            <Row icon="cash-outline" label="Cash" value={cash} valueColor={cash >= 0 ? OK : BAD} />
            <Row icon="card-outline" label="Deymaha Ka Maqan (A/R)" value={ar} valueColor={ar >= 0 ? OK : BAD} />
          </Card>

          <Card>
            <CardHeader title="Liabilities" />
            <Row icon="document-text-outline" label="Deymaha Kugu Maqan (A/P)" value={ap} valueColor={ap >= 0 ? BAD : OK} />
          </Card>

          <Card>
            <CardHeader title="Income, COGS & Inventory (USD View)" />
            <Row icon="add-circle-outline" label="Revenue" value={revenue} valueColor={revenue >= 0 ? OK : BAD} />
            <Row icon="trending-up-outline" label="COGS" value={cogs} valueColor={cogs > 0 ? BAD : OK} />
            <Row icon="cube-outline" label="Inventory (Remaining)" value={inventory} />
          </Card>
        </View>
      </ScrollView>

      {/* Degso popup (centered) */}
      <Modal visible={actionsOpen} transparent animationType="fade" onRequestClose={() => setActionsOpen(false)}>
        <View style={styles.popupOverlay}>
          <TouchableOpacity style={styles.popupBackdrop} activeOpacity={1} onPress={() => setActionsOpen(false)} />
          <View style={styles.popupCard}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Degso Statement</Text>
              {busyShot ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <ActivityIndicator size="small" />
                  <Text style={styles.sheetHint}>Preparing image…</Text>
                </View>
              ) : (
                <Text style={styles.sheetHint}>{buildRange().label}{truckPlate ? ` • ${truckPlate}` : ''}</Text>
              )}
            </View>

            <TouchableOpacity style={styles.sheetBtn} onPress={onDownload} activeOpacity={0.9}>
              <Ionicons name="download-outline" size={16} color="#0B1221" />
              <Text style={styles.sheetBtnTxt}>Download</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.sheetBtn} onPress={onShareWhatsApp} activeOpacity={0.9}>
              <Ionicons name="logo-whatsapp" size={16} color="#0B1221" />
              <Text style={styles.sheetBtnTxt}>WhatsApp</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* ─────────────────── Small card primitives ─────────────────── */
const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View style={styles.card}>{children}</View>
);

const CardHeader: React.FC<{ title: string }> = ({ title }) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionTitle}>{title}</Text>
  </View>
);

const Row: React.FC<{ icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: number; valueColor?: string; }> =
({ icon, label, value, valueColor }) => (
  <View style={styles.row}>
    <View style={styles.rowLeft}>
      <Ionicons name={icon} size={16} color="#374151" />
      <Text style={styles.rowLabel}>{label}</Text>
    </View>
    <Text style={[styles.rowValue, numFace, { color: valueColor ?? TEXT }]}>{money(value)}</Text>
  </View>
);

/* ─────────────────── Styles ─────────────────── */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },

  gradientHeader: {
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeftGroup: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  backBtn: {
    width: 30, height: 30, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  headerTitle: {
    color: '#E0E7FF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'lowercase',
    flexShrink: 1,
  },
  headerRightPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  headerRightPillTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },

  scroll: { flex: 1 },
  content: { padding: 12, paddingBottom: 20 },

  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  /* Controls (dropdowns + date) */
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  control: {
    flexBasis: '48%',
    flexGrow: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  dateControl: { padding: 0 },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 10 },
  dateText: { fontSize: 12, fontWeight: '500', color: '#111827' },

  /* Dropdown */
  dd: { width: '100%', borderRadius: 8, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  ddHead: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  ddHeadText: { fontSize: 13, fontWeight: '500', color: '#111827', maxWidth: width * 0.6 },
  ddOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center' },
  ddList: {
    width: Math.min(width * 0.86, 360),
    borderRadius: 10, borderWidth: 1, borderColor: BORDER,
    backgroundColor: '#FFFFFF', overflow: 'hidden',
  },
  ddItem: {
    paddingHorizontal: 14, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: BORDER, height: 36,
  },
  ddItemText: { fontSize: 13, color: '#111827' },

  /* Paper */
  paper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 10,
  },

  /* Cards */
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },

  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  rowLabel: { marginLeft: 10, fontSize: 12, color: '#374151' },
  rowValue: { fontSize: 12, fontWeight: '700', color: '#111827' },

  /* Overview tag */
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#DBEAFE', borderColor: '#BFDBFE', borderWidth: 1,
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4,
  },
  badgeTxt: { fontSize: 11, fontWeight: '700', color: '#1E40AF' },

  /* Degso POPUP (centered) */
  popupOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  popupBackdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
  },
  popupCard: {
    width: Math.min(width * 0.9, 420),
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 18,
  },

  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sheetTitle: { fontSize: 15, fontWeight: '800', color: '#0B1221' },
  sheetHint: { fontSize: 12, color: '#6B7280' },
  sheetBtn: {
    marginTop: 8,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
  },
  sheetBtnTxt: { fontSize: 13, fontWeight: '800', color: '#0B1221' },
});
