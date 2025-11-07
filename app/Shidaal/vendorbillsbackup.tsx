// app/(tabs)/customerslist.tsx
import { Feather } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import api from '@/services/api';
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  Dimensions,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import {
  createOrUpdateCustomerLocal,
  getCustomersLocal,
  hardDeleteCustomerLocal,
  markCustomerDeletedLocal,
  syncCustomersWithServer,
  upsertCustomersFromServer,
  type CustomerRow as Customer,
} from '../db/customerRepo';

const BRAND_BLUE = '#0B2447';
const BRAND_BLUE_2 = '#0B2447';
const ACCENT = '#576CBC';
const BG = '#F7F9FC';
const TEXT = '#0B1220';
const MUTED = '#6B7280';
const DANGER = '#EF4444';
const SUCCESS = '#10B981';
const BORDER = '#E5E7EB';

const { height: SCREEN_H } = Dimensions.get('window');
const TOP_GAP = 80;
const SHEET_H = Math.min(SCREEN_H - TOP_GAP, SCREEN_H * 0.9);
const MINI_SHEET_H = 180;

export default function CustomersList() {
  const { token, user } = useAuth();
  const router = useRouter();

  const [online, setOnline] = useState(true);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [limit] = useState(20);
  const [hasMore, setHasMore] = useState(true);

  const offsetRef = useRef(0);
  const loadingRef = useRef(false);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedId) || null,
    [selectedId, customers]
  );

  const settingsY = useRef(new Animated.Value(SCREEN_H)).current;
  const addY = useRef(new Animated.Value(SCREEN_H)).current;
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const [formMode, setFormMode] = useState<'add' | 'edit'>('add');
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAmountDue, setFormAmountDue] = useState<string>('0'); // still unused, kept for compatibility
  const [formStatus, setFormStatus] = useState<'active' | 'inactive' | ''>('active');
  const [formAddress, setFormAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const formScrollRef = useRef<ScrollView>(null);

  // ---- network status (offline/online) ----
  useEffect(() => {
    const sub = NetInfo.addEventListener((state) => {
      const ok = Boolean(state.isConnected && state.isInternetReachable);
      setOnline(ok);
    });
    return () => sub();
  }, []);

  const resetForm = useCallback(() => {
    setFormMode('add');
    setFormName('');
    setFormPhone('');
    setFormAmountDue('0');
    setFormStatus('active');
    setFormAddress('');
    setSubmitting(false);
  }, []);

  const goToInvoices = useCallback(
    (name?: string | null) => {
      const safe = (name ?? '').trim();
      if (!safe) return Alert.alert('Xulasho khaldan', 'Magaca macaamiilka waa madhan.');
      const encoded = encodeURIComponent(safe);
      router.push({ pathname: '/(Transactions)/[customer]', params: { customer: encoded } });
    },
    [router]
  );

  const closeSettings = useCallback(() => {
    Animated.timing(settingsY, {
      toValue: SCREEN_H,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => finished && setIsSettingsOpen(false));
  }, [settingsY]);

  const openAdd = useCallback(() => {
    setFormMode('add');
    resetForm();
    setIsAddOpen(true);
    Animated.timing(addY, {
      toValue: SCREEN_H - SHEET_H,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => {
      requestAnimationFrame(() => formScrollRef.current?.scrollTo({ y: 0, animated: false }));
    });
  }, [addY, resetForm]);

  const openEdit = useCallback(
    (c: Customer) => {
      setFormMode('edit');
      setFormName(c.name || '');
      setFormPhone(c.phone || '');
      setFormAmountDue(String(c.amount_due ?? 0));
      setFormStatus((c.status as any) || 'active');
      setFormAddress(c.address || '');

      Animated.parallel([
        Animated.timing(settingsY, {
          toValue: SCREEN_H,
          duration: 180,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(addY, {
          toValue: SCREEN_H - SHEET_H,
          delay: 100,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]).start(() => {
        setIsAddOpen(true);
        requestAnimationFrame(() => formScrollRef.current?.scrollTo({ y: 0, animated: false }));
      });
    },
    [addY, settingsY]
  );

  const closeAdd = useCallback(() => {
    Animated.timing(addY, {
      toValue: SCREEN_H,
      duration: 240,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => finished && setIsAddOpen(false));
  }, [addY]);

  // ---- Local page loader (SQLite only) ----
  const loadPage = useCallback(
    (reset = false) => {
      if (!user?.id) return; // no tenant yet
      if (loadingRef.current) return;
      loadingRef.current = true;

      try {
        if (reset) {
          setLoading(true);
          setHasMore(true);
          offsetRef.current = 0;
          setOffset(0);
        }

        const localOffset = reset ? 0 : offsetRef.current;
        const data = getCustomersLocal(search, limit, localOffset, user.id);

        setCustomers((prev) => {
          if (reset) return data;
          return [...prev, ...data];
        });

        setHasMore(data.length === limit);
        offsetRef.current = localOffset + data.length;
        setOffset(offsetRef.current);
        setError(null);
      } catch (e: any) {
        setError(e?.message || 'Failed to load customers from local db.');
      } finally {
        setLoading(false);
        loadingRef.current = false;
      }
    },
    [search, limit, user?.id]
  );

  // ---- Pull fresh data from server → SQLite (when online) ----
  // ---- Pull fresh data from server → SQLite (when online) ----
const pullLatestFromServer = useCallback(async () => {
  if (!online || !token || !user?.id) return;

  try {
    const res = await api.get('/diiwaancustomers', {
      // IMPORTANT: do NOT send q: undefined, just offset/limit
      params: {
        offset: 0,
        limit: 5000, // big enough to cover all existing customers
      },
    });

    // Some backends return array, some wrap in .items – keep it safe
    const raw = (res as any).data;
    const data = Array.isArray(raw?.items) ? raw.items : (Array.isArray(raw) ? raw : []);

    upsertCustomersFromServer(data, user.id);
  } catch (e) {
    // ignore; offline still works
    console.log('pullLatestFromServer error', e?.response?.data || e?.message || e);
  }
}, [online, token, user?.id]);


  // Initial load
  useEffect(() => {
    if (!user?.id) return;

    // 1) always load from local db
    loadPage(true);

    // 2) if online, sync dirty → server and pull fresh list
    if (online && token) {
      (async () => {
        try {
          await syncCustomersWithServer(api);
          await pullLatestFromServer();
          loadPage(true);
        } catch {
          // ignore
        }
      })();
    }
  }, [online, token, user?.id, loadPage, pullLatestFromServer]);

  // Re-run local query on search change (no network)
  useEffect(() => {
    if (!user?.id) return;
    const t = setTimeout(() => {
      loadPage(true);
    }, 200);
    return () => clearTimeout(t);
  }, [search, loadPage, user?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (online && token && user?.id) {
        await syncCustomersWithServer(api);
        await pullLatestFromServer();
      }
      loadPage(true);
    } finally {
      setRefreshing(false);
    }
  }, [online, token, user?.id, loadPage, pullLatestFromServer]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore && !loadingRef.current) {
      loadPage(false);
    }
  }, [hasMore, loading, loadPage]);

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    }).format(n || 0);

  const handleCreateOrUpdate = useCallback(async () => {
    if (!formName.trim()) {
      Alert.alert('Fadlan geli magaca macaamiilka');
      return;
    }
    if (!user?.id) {
      Alert.alert('Error', 'No tenant selected.');
      return;
    }

    const payload = {
      name: formName.trim(),
      phone: formPhone.trim() || null,
      address: formAddress.trim() || null,
      status: formStatus || 'active',
    };

    setSubmitting(true);
    try {
      if (online && token) {
        // Online: hit API, then cache into SQLite
        if (formMode === 'add') {
          const res = await api.post('/diiwaancustomers', payload);
          upsertCustomersFromServer([res.data], user.id);
        } else if (formMode === 'edit' && selectedCustomer) {
          const res = await api.patch(
            `/diiwaancustomers/${selectedCustomer.id}`,
            payload
          );
          upsertCustomersFromServer([res.data], user.id);
        }
      } else {
        // Offline: write to SQLite only; server will get it on next sync
        if (formMode === 'add') {
          createOrUpdateCustomerLocal(payload, user.id);
        } else if (formMode === 'edit' && selectedCustomer) {
          createOrUpdateCustomerLocal(payload, user.id, selectedCustomer);
        }
      }

      closeAdd();
      loadPage(true);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Operation failed.');
    } finally {
      setSubmitting(false);
    }
  }, [
    formName,
    formPhone,
    formAddress,
    formStatus,
    formMode,
    selectedCustomer,
    closeAdd,
    online,
    token,
    loadPage,
    user?.id,
  ]);

  const handleDelete = useCallback(() => {
    if (!selectedCustomer) return;
    Alert.alert('Delete', `Delete ${selectedCustomer.name || 'this customer'}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            if (online && token && selectedCustomer.id > 0) {
              // online delete: tell server, then hard delete from local
              await api.delete(`/diiwaancustomers/${selectedCustomer.id}`);
              hardDeleteCustomerLocal(selectedCustomer.id);
            } else {
              // offline: mark deleted + dirty, so sync can send DELETE later
              markCustomerDeletedLocal(selectedCustomer.id);
            }
            closeSettings();
            loadPage(true);
            setSelectedId(null);
          } catch (e: any) {
            Alert.alert('Error', e?.response?.data?.detail || 'Delete failed.');
          }
        },
      },
    ]);
  }, [selectedCustomer, closeSettings, online, token, loadPage]);

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        let handled = false;
        if (isAddOpen) {
          closeAdd();
          handled = true;
        }
        if (isSettingsOpen) {
          closeSettings();
          handled = true;
        }
        return handled;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [isAddOpen, isSettingsOpen, closeAdd, closeSettings])
  );

  const renderItem = ({ item }: { item: Customer }) => {
    const selected = item.id === selectedId;
    return (
      <TouchableOpacity
        onPress={() => goToInvoices(item.name)}
        onLongPress={() => {
          setSelectedId(item.id);
          setIsSettingsOpen(true);
          Animated.timing(settingsY, {
            toValue: SCREEN_H - MINI_SHEET_H,
            duration: 260,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }).start();
        }}
        style={[styles.itemRow, selected && styles.itemRowSelected]}
        activeOpacity={0.7}
      >
        <View style={styles.itemLeft}>
          <Text style={styles.itemName} numberOfLines={1}>
            {item.name || '—'}
          </Text>
          <Text style={styles.itemSub} numberOfLines={1}>
            {item.phone || 'No phone'}
          </Text>
        </View>

        <View style={styles.itemRight}>
          <Text
            style={[
              styles.amountDue,
              (item.amount_due || 0) > 0 ? styles.amountDanger : styles.amountOkay,
            ]}
          >
            {fmtMoney(item.amount_due || 0)}
          </Text>
          <Text style={styles.amountHint}>Balance</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      {/* Header */}
      <LinearGradient
        colors={[BRAND_BLUE, BRAND_BLUE_2]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerInner}>
          <View style={{ width: 32 }} />
          <Text style={styles.headerTitle} numberOfLines={1}>
            Macaamiisha
          </Text>
          <View style={{ width: 32 }} />
        </View>
        {!online && (
          <Text style={{ color: '#FBBF24', marginTop: 6, textAlign: 'center', fontSize: 11 }}>
            Offline – xogta waxa laga soo qaaday kaydka gudaha
          </Text>
        )}
      </LinearGradient>

      {/* Actions */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.pill, styles.pillPrimary]}
          onPress={() => router.push('/customersettings')}
          activeOpacity={0.9}
        >
          <Feather name="settings" size={16} color={BRAND_BLUE} />
          <Text style={styles.pillPrimaryTxt}>bedel xogta</Text>
          <View style={{ width: 8 }} />
        </TouchableOpacity>

        <TouchableOpacity style={[styles.pill, styles.pillAlt]} onPress={openAdd} activeOpacity={0.9}>
          <Feather name="user-plus" size={16} color="#243B6B" />
          <Text style={styles.pillAltTxt}>ku dar macmiil</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchWrapOuter}>
        <Feather name="search" size={18} color={MUTED} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="raadi macaamiil (offline/online)"
          placeholderTextColor="#9CA3AF"
          style={styles.searchInputOuter}
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      {/* Content */}
      <View style={styles.content}>
        {loading && customers.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={ACCENT} />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>
        ) : (
          <FlatList
            data={customers}
            keyExtractor={(it) => String(it.id)}
            renderItem={renderItem}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 24, paddingTop: 8 }}
            onEndReachedThreshold={0.4}
            onEndReached={loadMore}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={ACCENT}
              />
            }
            ListEmptyComponent={
              !loading ? <Text style={styles.emptyText}>No customers yet.</Text> : null
            }
            ListFooterComponent={
              hasMore ? (
                <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                  <ActivityIndicator color={ACCENT} />
                </View>
              ) : null
            }
          />
        )}
      </View>

      {/* Backdrop */}
      <Backdrop
        visible={isSettingsOpen || isAddOpen}
        onPress={() => {
          if (isAddOpen) closeAdd();
          if (isSettingsOpen) closeSettings();
        }}
      />

      {/* Settings Bottom Sheet */}
      <Animated.View
        style={[styles.sheet, { height: MINI_SHEET_H, top: settingsY }]}
        pointerEvents={isSettingsOpen ? 'auto' : 'none'}
      >
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>{selectedCustomer?.name || 'Actions'}</Text>
        <View style={styles.sheetRow}>
          <TouchableOpacity
            style={[styles.sheetAction, { backgroundColor: selectedCustomer ? ACCENT : '#B9C3FF' }]}
            onPress={() => selectedCustomer && openEdit(selectedCustomer)}
            disabled={!selectedCustomer}
          >
            <Feather name="edit-2" size={16} color="#fff" />
            <Text style={styles.sheetActionText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sheetAction, { backgroundColor: selectedCustomer ? DANGER : '#F5B4B4' }]}
            onPress={handleDelete}
            disabled={!selectedCustomer}
          >
            <Feather name="trash-2" size={16} color="#fff" />
            <Text style={styles.sheetActionText}>Delete</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.sheetClose} onPress={closeSettings}>
          <Text style={styles.sheetCloseTxt}>Close</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Add/Edit Bottom Sheet */}
      <Animated.View
        style={[styles.sheet, { height: SHEET_H, top: addY }]}
        pointerEvents={isAddOpen ? 'auto' : 'none'}
      >
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>
          {formMode === 'add' ? 'Add macaamiil' : 'Edit macaamiil'}
        </Text>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.select({ ios: 12, android: 0 })}
          style={{ flex: 1 }}
        >
          <ScrollView
            ref={formScrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 24, paddingTop: 4, flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
            <View style={styles.formRow}>
              <Text style={styles.label}>Magaca</Text>
              <TextInput
                value={formName}
                onChangeText={setFormName}
                placeholder="Magaca macaamiilka"
                placeholderTextColor="#9CA3AF"
                style={styles.input}
                returnKeyType="next"
              />
            </View>

            <View style={styles.formRow}>
              <Text style={styles.label}>Phone</Text>
              <TextInput
                value={formPhone}
                onChangeText={setFormPhone}
                placeholder="(+252) 61 234 5678"
                placeholderTextColor="#9CA3AF"
                keyboardType="phone-pad"
                style={styles.input}
                returnKeyType="next"
              />
            </View>

            <View style={styles.formRow}>
              <Text style={styles.label}>Address</Text>
              <TextInput
                value={formAddress}
                onChangeText={setFormAddress}
                placeholder="Degmada, xaafadda…"
                placeholderTextColor="#9CA3AF"
                style={[styles.input, { height: 100, textAlignVertical: 'top', paddingTop: 12 }]}
                multiline
                returnKeyType="done"
              />
            </View>

            <View style={styles.formActions}>
              <TouchableOpacity
                style={[styles.btn, styles.btnGhost]}
                onPress={closeAdd}
                disabled={submitting}
              >
                <Text style={[styles.btnTxt, { color: TEXT }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, submitting ? { opacity: 0.6 } : null]}
                onPress={handleCreateOrUpdate}
                disabled={submitting}
              >
                <Text style={styles.btnTxt}>
                  {formMode === 'add' ? 'Save' : 'Update'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
    </SafeAreaView>
  );
}

function Backdrop({ visible, onPress }: { visible: boolean; onPress: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [visible, opacity]);

  if (!visible) return null;
  return (
    <Animated.View style={[styles.backdrop, { opacity }]}>
      <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onPress} />
    </Animated.View>
  );
}

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
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },

  actionsRow: {
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
    borderWidth: 1,
  },
  pillPrimary: { backgroundColor: '#fff', borderColor: 'rgba(0,0,0,0.05)' },
  pillPrimaryTxt: { color: BRAND_BLUE, fontWeight: '800' },
  pillAlt: { backgroundColor: '#EEF2FF', borderColor: '#E0E7FF' },
  pillAltTxt: { color: '#243B6B', fontWeight: '800' },

  searchWrapOuter: {
    marginTop: 6,
    marginBottom: 6,
    alignSelf: 'center',
    width: '88%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
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

  content: { flex: 1, paddingHorizontal: 14, paddingTop: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  errorText: { color: DANGER, marginTop: 8 },
  emptyText: { textAlign: 'center', color: MUTED, marginTop: 24 },

  separator: { height: 10 },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  itemRowSelected: {
    borderColor: ACCENT,
    shadowColor: ACCENT,
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 3,
  },
  itemLeft: { flex: 1, paddingRight: 10 },
  itemName: { fontSize: 16, color: TEXT, fontWeight: '700' },
  itemSub: { fontSize: 13, color: MUTED, marginTop: 3 },
  itemRight: { alignItems: 'flex-end' },
  amountDue: { fontSize: 15, fontWeight: '800' },
  amountDanger: { color: DANGER },
  amountOkay: { color: SUCCESS },
  amountHint: { fontSize: 11, color: MUTED, marginTop: 2 },

  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderColor: BORDER,
    zIndex: 20,
    elevation: 20,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
    marginBottom: 10,
  },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: TEXT, textAlign: 'center', marginBottom: 8 },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 8,
  },
  sheetAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    height: 44,
    borderRadius: 12,
  },
  sheetActionText: { color: '#fff', fontWeight: '700' },
  sheetClose: { marginTop: 12, alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 12 },
  sheetCloseTxt: { color: MUTED, fontWeight: '600' },

  formRow: { marginBottom: 12 },
  label: { fontWeight: '700', color: TEXT, marginBottom: 6 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    color: TEXT,
  },

  formActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  btn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhost: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BORDER,
  },
  btnTxt: { color: '#fff', fontWeight: '800' },

  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 10,
    elevation: 10,
  },
});
