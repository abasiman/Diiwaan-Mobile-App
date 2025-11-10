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

// 🔹 NEW: pending payments helper
import {
  CreatePaymentPayload,
  getPendingPaymentsLocal,
} from '@/app/ManageInvoice/paymentOfflineRepo';

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


const mergeCustomersByName = (rows: Customer[]): Customer[] => {
  const map = new Map<string, Customer>();

  const getTime = (c: Customer) => {
    const t = c.updated_at || c.created_at || '';
    const d = new Date(t);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  };

  for (const c of rows) {
    const key = (c.name || '').trim().toLowerCase();
    if (!key) continue;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...c });
      continue;
    }

    const existingIsReal = existing.id > 0;
    const currentIsReal = c.id > 0;

    let preferred: Customer;

    if (existingIsReal && !currentIsReal) {
      preferred = existing;
    } else if (!existingIsReal && currentIsReal) {
      preferred = c;
    } else {
      // both real or both temp → prefer newer
      preferred = getTime(c) >= getTime(existing) ? c : existing;
    }

    map.set(key, {
      ...preferred,
      // keep nicer phone/address from either row
      phone: existing.phone || c.phone || null,
      address: existing.address || c.address || null,
      // ❗ balances come ONLY from preferred, no summing
      amount_due: preferred.amount_due,
      amount_due_usd: preferred.amount_due_usd,
      amount_due_native: preferred.amount_due_native,
      amount_paid: preferred.amount_paid,
    });
  }

  return Array.from(map.values());
};


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

  console.log('[CustomersList] render', {
    hasUser: !!user,
    userId: user?.id,
    hasToken: !!token,
  });

  // ---- network status (offline/online) ----
  useEffect(() => {
    const sub = NetInfo.addEventListener((state) => {
      const ok = Boolean(state.isConnected && state.isInternetReachable);
      console.log('[CustomersList] NetInfo changed', {
        isConnected: state.isConnected,
        isInternetReachable: state.isInternetReachable,
        online: ok,
      });
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
      console.log('[CustomersList] navigate to invoices for', safe);
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
    console.log('[CustomersList] openAdd');
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
      console.log('[CustomersList] openEdit for', c.id, c.name);
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
    console.log('[CustomersList] closeAdd');
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
      if (user?.id == null) {
        console.log('[CustomersList] loadPage aborted: no user id');
        setLoading(false);
        setCustomers([]);
        setHasMore(false);
        return;
      }
      if (loadingRef.current) {
        console.log('[CustomersList] loadPage skipped (already loading)');
        return;
      }

      loadingRef.current = true;

      try {
        if (reset) {
          console.log('[CustomersList] loadPage(reset=true)', {
            userId: user.id,
            search,
            limit,
          });
          setLoading(true);
          setHasMore(true);
          offsetRef.current = 0;
          setOffset(0);
        } else {
          console.log('[CustomersList] loadPage(reset=false)', {
            userId: user.id,
            search,
            limit,
            currentOffset: offsetRef.current,
          });
        }

        const localOffset = reset ? 0 : offsetRef.current;
        const data = getCustomersLocal(search, limit, localOffset, user.id);

        console.log('[CustomersList] getCustomersLocal returned', data.length, 'rows');

        // 🔹 apply pending offline payments so balances match CustomerInvoicesPage
        let adjusted = data;
        try {
          const pending = getPendingPaymentsLocal(user.id, 500);
          if (pending.length) {
            const extraByCustomer = new Map<number, number>();

            for (const row of pending) {
              try {
                const payload = JSON.parse(row.payload_json) as CreatePaymentPayload;
                if (payload.customer_id) {
                  const prev = extraByCustomer.get(payload.customer_id) || 0;
                  extraByCustomer.set(payload.customer_id, prev + (payload.amount || 0));
                }
              } catch {
                // ignore bad rows
              }
            }

            if (extraByCustomer.size) {
              adjusted = data.map((c) => {
                if (typeof c.id !== 'number') return c;
                const extra = extraByCustomer.get(c.id) || 0;
                if (!extra) return c;
                return {
                  ...c,
                  amount_paid: (c.amount_paid || 0) + extra,
                  amount_due: Math.max(0, (c.amount_due || 0) - extra),
                };
              });
            }
          }
        } catch (e: any) {
          console.log(
            '[CustomersList] applying pending payments failed',
            e?.message || e
          );
        }

        // 🔹 merge duplicate customers by NAME so offline + server rows collapse
        const dedupedPage = mergeCustomersByName(adjusted);

        setCustomers((prev) => {
          if (reset) return dedupedPage;
          return mergeCustomersByName([...prev, ...dedupedPage]);
        });

        setHasMore(data.length === limit);

        offsetRef.current = localOffset + data.length;
        setOffset(offsetRef.current);
        setError(null);
      } catch (e: any) {
        console.log('[CustomersList] loadPage error', e?.message);
        setError(e?.message || 'Failed to load customers from local db.');
      } finally {
        setLoading(false);
        loadingRef.current = false;
      }
    },
    [search, limit, user?.id]
  );

  // ---- Pull fresh data from server → SQLite ----
  const pullLatestFromServer = useCallback(async () => {
    if (!token || !user?.id) {
      console.log('[CustomersList] pullLatestFromServer aborted: missing token or user id', {
        hasToken: !!token,
        userId: user?.id,
      });
      return;
    }

    console.log('[CustomersList] pullLatestFromServer START', {
      userId: user.id,
    });

    try {
      const all: any[] = [];
      const pageSize = 100;
      let pageOffset = 0;

      while (pageOffset < 5000) {
        console.log('[CustomersList] fetching /diiwaancustomers', {
          offset: pageOffset,
          limit: pageSize,
        });

        const res = await api.get('/diiwaancustomers', {
          params: {
            offset: pageOffset,
            limit: pageSize,
          },
        });

        const raw: any = res.data;
        const page: any[] = Array.isArray(raw?.items)
          ? raw.items
          : Array.isArray(raw)
          ? raw
          : [];

        console.log('[CustomersList] page length', page.length);

        if (!page.length) break;

        all.push(...page);
        if (page.length < pageSize) break;

        pageOffset += page.length;
      }

      console.log('[CustomersList] total customers from server', all.length);

      if (all.length) {
        upsertCustomersFromServer(all, user.id);
        console.log('[CustomersList] upserted into SQLite', all.length, 'customers');
      } else {
        console.log('[CustomersList] no customers to upsert');
      }
    } catch (e: any) {
      console.log(
        '[CustomersList] pullLatestFromServer error',
        e?.response?.data || e?.message || e
      );
    }
  }, [token, user?.id]);

  // Initial load
  useEffect(() => {
    console.log('[CustomersList] initial effect', {
      userId: user?.id,
      hasToken: !!token,
    });

    if (user?.id == null) {
      setLoading(false);
      return;
    }

    // 1) always load from local db
    loadPage(true);

    // 2) sync dirty → server and pull fresh list whenever we have a token
    if (token) {
      (async () => {
        try {
          console.log('[CustomersList] initial sync+pull START');
          await syncCustomersWithServer(api, user.id); // 🔹 pass ownerId here
          await pullLatestFromServer();
          loadPage(true);
          console.log('[CustomersList] initial sync+pull DONE');
        } catch (e) {
          console.log('[CustomersList] initial sync+pull failed', (e as any)?.message);
        }
      })();
    }
  }, [token, user?.id, loadPage, pullLatestFromServer]);

  // Re-run local query on search change
  useEffect(() => {
    if (!user?.id) return;
    const t = setTimeout(() => {
      console.log('[CustomersList] search changed → reload', search);
      loadPage(true);
    }, 200);
    return () => clearTimeout(t);
  }, [search, loadPage, user?.id]);

  const onRefresh = useCallback(async () => {
    console.log('[CustomersList] onRefresh');
    setRefreshing(true);
    try {
      if (token && user?.id) {
        await syncCustomersWithServer(api, user.id);  // 🔹 scoped by owner
        await pullLatestFromServer();
      }
      loadPage(true);
    } finally {
      setRefreshing(false);
    }
  }, [token, user?.id, loadPage, pullLatestFromServer]);

  const loadMore = useCallback(() => {
    console.log('[CustomersList] loadMore called', {
      loading,
      hasMore,
      loadingRef: loadingRef.current,
      offset: offsetRef.current,
    });
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

    console.log('[CustomersList] handleCreateOrUpdate', {
      mode: formMode,
      online,
      hasToken: !!token,
      payload,
      selectedId: selectedCustomer?.id,
    });

    setSubmitting(true);
    try {
      if (online && token) {
        // Online: hit API, then cache into SQLite
        if (formMode === 'add') {
          const res = await api.post('/diiwaancustomers', payload);
          upsertCustomersFromServer([res.data], user.id);
          console.log('[CustomersList] created customer on server', res.data?.id);
        } else if (formMode === 'edit' && selectedCustomer) {
          const res = await api.patch(
            `/diiwaancustomers/${selectedCustomer.id}`,
            payload
          );
          upsertCustomersFromServer([res.data], user.id);
          console.log('[CustomersList] updated customer on server', res.data?.id);
        }
      } else {
        // Offline: write to SQLite only; server will get it on next sync
        if (formMode === 'add') {
          const row = createOrUpdateCustomerLocal(payload, user.id);
          console.log('[CustomersList] created customer locally (offline)', row.id);
        } else if (formMode === 'edit' && selectedCustomer) {
          const row = createOrUpdateCustomerLocal(payload, user.id, selectedCustomer);
          console.log('[CustomersList] updated customer locally (offline)', row.id);
        }
      }

      closeAdd();
      loadPage(true);
    } catch (e: any) {
      console.log('[CustomersList] handleCreateOrUpdate error', e?.response?.data || e?.message);
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
          console.log('[CustomersList] handleDelete CONFIRMED', {
            id: selectedCustomer.id,
            online,
            hasToken: !!token,
          });
          try {
            if (online && token && selectedCustomer.id > 0) {
              // online delete: tell server, then hard delete from local
              await api.delete(`/diiwaancustomers/${selectedCustomer.id}`);
              hardDeleteCustomerLocal(selectedCustomer.id);
              console.log('[CustomersList] deleted customer on server & local', selectedCustomer.id);
            } else {
              // offline: mark deleted + dirty, so sync can send DELETE later
              markCustomerDeletedLocal(selectedCustomer.id);
              console.log(
                '[CustomersList] marked customer deleted locally (offline)',
                selectedCustomer.id
              );
            }
            closeSettings();
            loadPage(true);
            setSelectedId(null);
          } catch (e: any) {
            console.log('[CustomersList] handleDelete error', e?.response?.data || e?.message);
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
          console.log('[CustomersList] longPress on customer', item.id, item.name);
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
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />
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
  sheetTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: TEXT,
    textAlign: 'center',
    marginBottom: 8,
  },
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
