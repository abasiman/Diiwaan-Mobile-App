// app/(customer)/customer-setting.tsx
import { Feather, Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import api from '@/services/api';
import { useAuth } from '../src/context/AuthContext';

type Customer = {
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

const BRAND_BLUE = '#0B2447';
const BRAND_BLUE_2 = '#19376D';
const ACCENT = '#576CBC';
const BG = '#F7F9FC';
const TEXT = '#0B1220';
const MUTED = '#6B7280';
const DANGER = '#EF4444';
const BORDER = '#E5E7EB';

const { height: SCREEN_H } = Dimensions.get('window');
// Taller edit sheet, up to 90% of screen
const SHEET_H = Math.min(SCREEN_H * 0.9, 720);

export default function CustomerSetting() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();

  // data
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // query/pagination
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [limit] = useState(30);
  const [hasMore, setHasMore] = useState(true);

  // selection + inline actions
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedId) || null,
    [selectedId, customers]
  );

  // EDIT SHEET — translateY so it fully hides off-screen (native driver = super smooth)
  const translateY = useRef(new Animated.Value(SHEET_H)).current; // 0 = open, SHEET_H = hidden
  const [isEditOpen, setIsEditOpen] = useState(false);

  // edit form
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formStatus, setFormStatus] = useState<'active' | 'inactive' | ''>('active');
  const [formAddress, setFormAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const openEdit = useCallback(
    (c: Customer) => {
      setFormName(c.name || '');
      setFormPhone(c.phone || '');
      setFormStatus(((c.status as any) || 'active') as 'active' | 'inactive' | '');
      setFormAddress(c.address || '');
      setIsEditOpen(true);
      // kick from hidden -> open
      Animated.timing(translateY, {
        toValue: 0,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    },
    [translateY]
  );

  const closeEdit = useCallback(() => {
    Animated.timing(translateY, {
      toValue: SHEET_H,
      duration: 240,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setIsEditOpen(false);
      }
    });
  }, [translateY]);

  // delete popup (center card)
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const deleteAnim = useRef(new Animated.Value(0)).current; // 0 hidden, 1 visible

  const openDelete = useCallback(
    (c: Customer) => {
      setDeleteTarget(c);
      Animated.timing(deleteAnim, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    },
    [deleteAnim]
  );

  const closeDelete = useCallback(() => {
    Animated.timing(deleteAnim, {
      toValue: 0,
      duration: 160,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => finished && setDeleteTarget(null));
  }, [deleteAnim]);

  const handleHeaderBack = useCallback(() => {
    if (deleteTarget) {
      closeDelete();
      return;
    }
    if (isEditOpen) {
      closeEdit();
      return;
    }
    if (selectedId !== null) {
      setSelectedId(null);
      return;
    }
    if (search) {
      setSearch('');
      return;
    }
    if (router.canGoBack && router.canGoBack()) {
      router.back();
    }
  }, [deleteTarget, isEditOpen, selectedId, search, closeDelete, closeEdit, router]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/diiwaancustomers/${deleteTarget.id}`);
      setCustomers((prev) => prev.filter((x) => x.id !== deleteTarget.id));
      if (selectedId === deleteTarget.id) setSelectedId(null);
      closeDelete();
    } catch (e: any) {
      console.warn(e?.response?.data?.detail || 'Delete failed.');
      closeDelete();
    }
  }, [deleteTarget, selectedId, closeDelete]);

  // fetch
  const loadPage = useCallback(
    async (reset = false) => {
      if (!token) return;
      try {
        if (reset) {
          setLoading(true);
          setOffset(0);
        }
        const res = await api.get<Customer[]>('/diiwaancustomers', {
          params: {
            q: search || undefined,
            offset: reset ? 0 : offset,
            limit,
          },
        });
        const data = res.data || [];
        setCustomers((prev) =>
          reset ? data : [...prev, ...data.filter((n) => !prev.some((p) => p.id === n.id))]
        );
        setHasMore(data.length === limit);
        setError(null);
        if (reset) setOffset(0 + data.length);
        else setOffset((v) => v + data.length);
      } catch (e: any) {
        setError(e?.response?.data?.detail || 'Failed to load customers.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, search, offset, limit]
  );

  useEffect(() => {
    loadPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    const t = setTimeout(() => loadPage(true), 300);
    return () => clearTimeout(t);
  }, [search, loadPage]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadPage(true);
  }, [loadPage]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) loadPage(false);
  }, [loading, hasMore, loadPage]);

  // submit edit
  const handleUpdate = useCallback(async () => {
    if (!selectedCustomer) return;
    if (!formName.trim()) return;

    setSubmitting(true);
    try {
      await api.patch(`/diiwaancustomers/${selectedCustomer.id}`, {
        name: formName.trim(),
        phone: formPhone.trim() || null,
        status: formStatus || 'active',
        address: formAddress.trim() || null,
      });
      closeEdit();
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === selectedCustomer.id
            ? {
                ...c,
                name: formName.trim(),
                phone: formPhone.trim() || null,
                status: formStatus || 'active',
                address: formAddress.trim() || null,
              }
            : c
        )
      );
    } catch (e: any) {
      console.warn(e?.response?.data?.detail || 'Update failed.');
    } finally {
      setSubmitting(false);
    }
  }, [selectedCustomer, formName, formPhone, formStatus, formAddress, closeEdit]);

  // Android back closes sheet or delete popup
  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (deleteTarget) {
          closeDelete();
          return true;
        }
        if (isEditOpen) {
          closeEdit();
          return true;
        }
        return false;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [isEditOpen, closeEdit, deleteTarget, closeDelete])
  );

  // row
  const renderItem = ({ item }: { item: Customer }) => {
    const expanded = item.id === selectedId;
    return (
      <View style={styles.cardWrap}>
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => setSelectedId((prev) => (prev === item.id ? null : item.id))}
          style={[styles.card, expanded && styles.cardSelected]}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>
              {item.name || '—'}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              {item.phone || 'No phone'}
            </Text>
            {!!item.address && (
              <Text style={[styles.sub, { marginTop: 2 }]} numberOfLines={1}>
                {item.address}
              </Text>
            )}
          </View>

          <View style={styles.statusPill}>
            <View
              style={[
                styles.dot,
                { backgroundColor: (item.status || 'active') === 'active' ? '#10B981' : '#9CA3AF' },
              ]}
            />
            <Text style={styles.statusText}>{(item.status || 'active').toString()}</Text>
          </View>
        </TouchableOpacity>

        {expanded && (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: ACCENT }]}
              onPress={() => openEdit(item)}
            >
              <Feather name="edit-2" size={16} color="#fff" />
              <Text style={styles.actionTxt}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: DANGER }]}
              onPress={() => openDelete(item)}
            >
              <Feather name="trash-2" size={16} color="#fff" />
              <Text style={styles.actionTxt}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      {/* Header */}
      <LinearGradient
        colors={[BRAND_BLUE, BRAND_BLUE_2]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 12 }]}
      >
        <View style={styles.headerBar}>
          <TouchableOpacity style={styles.iconBtn} onPress={handleHeaderBack} activeOpacity={0.8}>
            <Ionicons name="chevron-back" size={20} color="#fff" />
          </TouchableOpacity>

          {/* Centered 2-line title */}
          <View pointerEvents="none" style={styles.headerCenterAbs}>
            <Text style={styles.headerTitleTop} numberOfLines={1}>
              Dejinta Macaamiisha
            </Text>
            <Text style={styles.headerTitleSub} numberOfLines={1}>
              Badel ama tirtir xogta
            </Text>
          </View>

          <View style={{ width: 42 }} />
        </View>
      </LinearGradient>

      {/* Search BELOW header */}
      <View style={{ paddingHorizontal: 14, marginTop: 12 }}>
        <View style={styles.searchWrapLight}>
          <Feather name="search" size={18} color={MUTED} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="raadi macaamiil"
            placeholderTextColor="#9CA3AF"
            style={styles.searchInputLight}
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>
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
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            contentContainerStyle={{ paddingTop: 10, paddingBottom: 24 }}
            onEndReachedThreshold={0.4}
            onEndReached={loadMore}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
            ListEmptyComponent={!loading ? <Text style={styles.emptyText}>No customers yet.</Text> : null}
          />
        )}
      </View>

      {/* EDIT BOTTOM SHEET (no modal/backdrop, fully off-screen when closed) */}
      <Animated.View
        pointerEvents={isEditOpen ? 'auto' : 'none'}
        style={[
          styles.sheet,
          {
            height: SHEET_H,
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Edit macaamiil</Text>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.formRow}>
              <Text style={styles.label}>Magaca</Text>
              <TextInput
                value={formName}
                onChangeText={setFormName}
                placeholder="Magaca macaamiilka"
                placeholderTextColor="#9CA3AF"
                style={styles.input}
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
              />
            </View>

            <View style={styles.formRow}>
              <Text style={styles.label}>Status</Text>
              <View style={styles.pillRow}>
                {(['active', 'inactive'] as const).map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.pill, formStatus === s && styles.pillActive]}
                    onPress={() => setFormStatus(s)}
                  >
                    <Text style={[styles.pillTxt, formStatus === s && styles.pillTxtActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.formRow}>
              <Text style={styles.label}>Address</Text>
              <TextInput
                value={formAddress}
                onChangeText={setFormAddress}
                placeholder="Degmada, xaafadda…"
                placeholderTextColor="#9CA3AF"
                style={[styles.input, { height: 120, textAlignVertical: 'top', paddingTop: 12 }]}
                multiline
              />
            </View>

            <View style={[styles.formActions, { marginBottom: 8 }]}>
              <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={closeEdit} disabled={submitting}>
                <Text style={[styles.btnTxt, { color: TEXT }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, submitting ? { opacity: 0.6 } : null]}
                onPress={handleUpdate}
                disabled={submitting}
              >
                <Text style={styles.btnTxt}>Update</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>

      {/* Delete Popup (modern, centered) */}
      {deleteTarget && (
        <View style={styles.deleteWrap} pointerEvents="box-none">
          <TouchableOpacity style={styles.deleteBackdrop} activeOpacity={1} onPress={closeDelete} />
          <Animated.View
            style={[
              styles.deleteCard,
              {
                transform: [
                  {
                    scale: deleteAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.95, 1],
                    }),
                  },
                ],
                opacity: deleteAnim,
              },
            ]}
          >
            <View style={styles.deleteIconRow}>
              <View style={styles.deleteIconBadge}>
                <Feather name="trash-2" size={20} color="#fff" />
              </View>
            </View>
            <Text style={styles.deleteTitle}>Delete customer?</Text>
            <Text style={styles.deleteText}>
              {`Are you sure you want to delete ${deleteTarget.name || 'this customer'}? This action cannot be undone.`}
            </Text>

            <View style={styles.deleteActions}>
              <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={closeDelete}>
                <Text style={[styles.btnTxt, { color: TEXT }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { backgroundColor: DANGER }]} onPress={confirmDelete}>
                <Text style={styles.btnTxt}>Delete</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },

  header: {
    paddingBottom: 12,
    paddingHorizontal: 12,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  headerBar: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerCenterAbs: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Two-line title
  headerTitleTop: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 0.2 },
  headerTitleSub: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '700', letterSpacing: 0.2, marginTop: 2 },

  searchWrapLight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    borderRadius: 12,
    height: 44,
    borderWidth: 1,
    borderColor: BORDER,
  },
  searchInputLight: { flex: 1, color: TEXT, fontSize: 14, paddingVertical: 8 },

  content: { flex: 1, paddingHorizontal: 14, paddingTop: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  errorText: { color: DANGER, marginTop: 8 },
  emptyText: { textAlign: 'center', color: MUTED, marginTop: 24 },

  // cards
  cardWrap: {},
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  cardSelected: {
    borderColor: ACCENT,
    shadowColor: ACCENT,
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 2,
  },
  name: { fontSize: 16, color: TEXT, fontWeight: '800' },
  sub: { fontSize: 13, color: MUTED, marginTop: 3 },

  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  dot: { width: 8, height: 8, borderRadius: 999 },
  statusText: { color: ACCENT, fontWeight: '700', textTransform: 'capitalize' },

  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
    paddingHorizontal: 8,
    marginTop: 8,
    marginBottom: 2,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    height: 38,
    borderRadius: 10,
  },
  actionTxt: { color: '#fff', fontWeight: '700' },

  // sheet (no backdrop; sits above content; fully hidden using translateY)
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
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
  pillRow: { flexDirection: 'row', gap: 8 },
  pill: {
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  pillActive: { backgroundColor: '#E8EEFF', borderColor: ACCENT },
  pillTxt: { color: MUTED, fontWeight: '600' },
  pillTxtActive: { color: ACCENT, fontWeight: '800' },

  formActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  btn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: BORDER },
  btnTxt: { color: '#fff', fontWeight: '800' },

  // delete popup
  deleteWrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  deleteCard: {
    width: '86%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    position: 'absolute',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  deleteIconRow: { alignItems: 'center', marginTop: 6 },
  deleteIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DANGER,
  },
  deleteTitle: { textAlign: 'center', fontSize: 18, fontWeight: '800', color: TEXT, marginTop: 12 },
  deleteText: { textAlign: 'center', color: MUTED, marginTop: 6, lineHeight: 20 },
  deleteActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
});
