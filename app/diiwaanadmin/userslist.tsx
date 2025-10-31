import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import api from '@/services/api';
import { useAuth } from '@/src/context/AuthContext';
import { useRouter } from 'expo-router';

/* ============================ Types ============================ */
type SuperAdminUser = {
  id: number;
  username: string;
  status: 'active' | 'inactive' | 'deleted';
  role?: string | null;

  email?: string | null;
  phone_number?: string | null;

  created_at?: string | null;
  updated_at?: string | null;
  last_login_at?: string | null;
  last_seen_at?: string | null;
  is_online: boolean;

  signup_ip?: string | null;
  last_ip?: string | null;
  last_user_agent?: string | null;

  geo_country_code?: string | null;
  geo_country?: string | null;
  geo_region?: string | null;
  geo_city?: string | null;
  geo_timezone?: string | null;
  geo_lat?: number | null;
  geo_lng?: number | null;
};

type SuperAdminUsersResponse = {
  users: SuperAdminUser[];
  total: number;
  online: number;
  offline: number;
  window: {
    start_date: string | null;
    end_date: string | null;
    online_grace_seconds: number;
  };
};

/* Purge endpoint response (matches what we added on backend) */
type PurgeDryRunItem = { table: string; count: number };
type PurgeDryRunResponse = {
  dry_run?: boolean;
  user_id: number;
  will_delete_user_rows?: number;
  will_delete_dependents?: PurgeDryRunItem[];
  note?: string;
};
type PurgeExecuteResponse = {
  message: string;
  user_id: number;
  deleted_dependents: PurgeDryRunItem[];
  deleted_user_rows: number;
};

/* ============================ Theme ============================ */
const BRAND_BLUE = '#0B2447';
const BRAND_BLUE_2 = '#19376D';
const ACCENT = '#576CBC';
const TEXT = '#0B1220';
const MUTED = '#6B7280';
const BORDER = '#E5E7EB';
const CARD_BG = '#FFFFFF';
const DANGER = '#EF4444';
const SUCCESS = '#10B981';
const WARN = '#F59E0B';

/* ============================ Screen ============================ */
export default function DiiwaanUsersList() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { token, user, logout } = useAuth();

  useEffect(() => {
    if (!token) {
      router.replace('/(auth)/login');
    }
  }, [token, router]);

  const role = (user as any)?.role ?? null;
  const isSuperAdmin = role === 'super_admin';

  const [data, setData] = useState<SuperAdminUsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<SuperAdminUser | null>(null);

  const [acting, setActing] = useState(false);           // single user manage/activate/deactivate/delete
  const [purging, setPurging] = useState(false);         // single user purge
  const [bulkPurging, setBulkPurging] = useState(false); // bulk purge in progress

  // Multi-select state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const [loggingOut, setLoggingOut] = useState(false);

  const authHeader = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);

  const fetchAll = useCallback(async () => {
    if (!isSuperAdmin) return;
    setError(null);
    setLoading(true);
    try {
      const res = await api.get<SuperAdminUsersResponse>('/diiwaan/superadmin/users', {
        headers: authHeader,
      });
      setData(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to load users.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [authHeader, isSuperAdmin]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchAll();
    } finally {
      setRefreshing(false);
    }
  }, [fetchAll]);

  const fmtDateTime = (iso?: string | null) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso ?? '—';
    }
  };

  const filtered = useMemo(() => {
    if (!data?.users) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.users;
    return data.users.filter((u) => {
      const inName = u.username?.toLowerCase().includes(q);
      const inPhone = (u.phone_number || '').toLowerCase().includes(q);
      const inEmail = (u.email || '').toLowerCase().includes(q);
      return inName || inPhone || inEmail;
    });
  }, [data, search]);

  const manage = async (userId: number, action: 'activate' | 'deactivate' | 'delete') => {
    setActing(true);
    try {
      await api.post(
        '/diiwaan/superadmin/manage',
        { user_id: userId, action },
        { headers: authHeader }
      );
      await fetchAll();
      setSelected((prev) => (prev && prev.id === userId ? null : prev));
    } catch (e: any) {
      Alert.alert('Action failed', e?.response?.data?.detail || 'Unable to update user.');
    } finally {
      setActing(false);
    }
  };

  /* ============================ PURGE (single) ============================ */
  const dryRunPurge = async (userId: number) => {
    const res = await api.post<PurgeDryRunResponse>(
      '/diiwaan/superadmin/users/purge',
      { user_id: userId, dry_run: true },
      { headers: authHeader }
    );
    return res.data;
  };

  const execPurge = async (userId: number) => {
    const res = await api.post<PurgeExecuteResponse>(
      '/diiwaan/superadmin/users/purge',
      { user_id: userId, dry_run: false },
      { headers: authHeader }
    );
    return res.data;
  };

  const confirmAndPurgeSingle = async (userToPurge: SuperAdminUser) => {
    setPurging(true);
    try {
      const dry = await dryRunPurge(userToPurge.id);
      const depCount = (dry.will_delete_dependents || []).reduce((s, r) => s + (r.count || 0), 0);
      const total = (dry.will_delete_user_rows || 0) + depCount;

      Alert.alert(
        'Purge user?',
        `This will permanently delete ${userToPurge.username || 'the user'} and ${depCount} related row(s) across ${
          (dry.will_delete_dependents || []).filter(x => x.count > 0).length
        } table(s). Total rows (including user): ${total}.\n\nThis action cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Purge',
            style: 'destructive',
            onPress: async () => {
              try {
                await execPurge(userToPurge.id);
                await fetchAll();
                setSelected((prev) => (prev && prev.id === userToPurge.id ? null : prev));
                Alert.alert('Purged', 'User and related data were permanently deleted.');
              } catch (e: any) {
                Alert.alert('Purge failed', e?.response?.data?.detail || 'Unable to purge user.');
              }
            },
          },
        ]
      );
    } catch (e: any) {
      Alert.alert('Dry run failed', e?.response?.data?.detail || 'Unable to analyze purge impact.');
    } finally {
      setPurging(false);
    }
  };

  /* ============================ BULK SELECTION + PURGE ============================ */
  const toggleSelectMode = (on?: boolean) => {
    if (typeof on === 'boolean') {
      setSelectionMode(on);
      if (!on) setSelectedIds(new Set());
      return;
    }
    setSelectionMode((v) => {
      const next = !v;
      if (!next) setSelectedIds(new Set());
      return next;
    });
  };

  const toggleSelectId = (id: number) => {
    setSelectedIds((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  };

  const selectAllVisible = () => {
    const s = new Set<number>();
    filtered.forEach((u) => s.add(u.id));
    setSelectedIds(s);
  };

  const clearSelection = () => setSelectedIds(new Set());

  const bulkPurge = async () => {
    if (selectedIds.size === 0) return;

    setBulkPurging(true);
    try {
      // Run dry-runs to estimate totals
      let totalUsers = 0;
      let totalUserRows = 0;
      let totalDependents = 0;

      for (const id of selectedIds) {
        try {
          const dry = await dryRunPurge(id);
          totalUsers += 1;
          totalUserRows += dry.will_delete_user_rows || 0;
          totalDependents += (dry.will_delete_dependents || []).reduce((s, r) => s + (r.count || 0), 0);
        } catch (e: any) {
          setBulkPurging(false);
          Alert.alert('Dry run failed', e?.response?.data?.detail || `Unable to analyze user ${id}.`);
          return;
        }
      }

      const totalRows = totalUserRows + totalDependents;

      Alert.alert(
        'Bulk purge?',
        `You are about to permanently purge ${totalUsers} user(s).\nEstimated total rows to delete: ${totalRows}.\n\nThis cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Purge selected',
            style: 'destructive',
            onPress: async () => {
              // Execute purges sequentially
              try {
                for (const id of selectedIds) {
                  await execPurge(id);
                }
                await fetchAll();
                toggleSelectMode(false);
                Alert.alert('Done', 'Selected users were purged.');
              } catch (e: any) {
                Alert.alert('Purge failed', e?.response?.data?.detail || 'One of the purges failed.');
              } finally {
                setBulkPurging(false);
              }
            },
          },
        ]
      );
    } catch {
      setBulkPurging(false);
      Alert.alert('Bulk purge failed', 'Unexpected error during dry-run.');
    }
  };

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          try {
            setLoggingOut(true);
            await logout();
            router.replace('/(auth)/login');
          } finally {
            setLoggingOut(false);
          }
        },
      },
    ]);
  };

  const StatusChip = ({ status }: { status: SuperAdminUser['status'] }) => {
    const bg =
      status === 'active' ? 'rgba(16,185,129,0.12)' : status === 'inactive' ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)';
    const color =
      status === 'active' ? SUCCESS : status === 'inactive' ? WARN : DANGER;
    return (
      <View style={[styles.chip, { backgroundColor: bg, borderColor: 'transparent' }]}>
        <Text style={[styles.chipTxt, { color }]}>{status}</Text>
      </View>
    );
  };

  const OnlineDot = ({ on }: { on: boolean }) => (
    <View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: on ? SUCCESS : '#CBD5E1',
        marginRight: 6,
      }}
    />
  );

  if (!isSuperAdmin) {
    return (
      <SafeAreaView style={[styles.screen, { paddingTop: insets.top }]}>
        <LinearGradient colors={[BRAND_BLUE, BRAND_BLUE_2]} style={styles.header}>
          <Text style={styles.headerTitle}>Super Admin</Text>
        </LinearGradient>
        <View style={styles.center}>
          <Feather name="lock" size={18} color={MUTED} />
          <Text style={{ color: MUTED, fontWeight: '700', marginTop: 6, fontSize: 13 }}>
            You are not authorized to view this page.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen]} edges={['top', 'bottom', 'left', 'right']}>
      {/* HEADER */}
      <LinearGradient colors={[BRAND_BLUE, BRAND_BLUE_2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Users • Super Admin</Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {/* Toggle selection mode */}
            <TouchableOpacity
              onPress={() => toggleSelectMode()}
              style={styles.headerIconBtn}
              accessibilityLabel={selectionMode ? 'Exit selection' : 'Select multiple'}
            >
              <Feather name={selectionMode ? 'x-square' : 'check-square'} size={16} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleLogout}
              style={styles.logoutBtn}
              accessibilityLabel="Log out"
            >
              {loggingOut ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Feather name="log-out" size={16} color="#fff" />
                  <Text style={styles.logoutTxt}>Logout</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>

      {/* TOP STATS */}
      {loading && !data ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={ACCENT} />
          {error ? <Text style={{ color: DANGER, marginTop: 8, fontSize: 12 }}>{error}</Text> : null}
        </View>
      ) : (
        <>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Total</Text>
              <Text style={styles.statValue}>{data?.total ?? 0}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Online</Text>
              <Text style={[styles.statValue, { color: SUCCESS }]}>{data?.online ?? 0}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Inactive</Text>
              <Text style={[styles.statValue, { color: WARN }]}>
                {data ? data.users.filter((u) => u.status !== 'active').length : 0}
              </Text>
            </View>
          </View>

          {/* SEARCH */}
          <View style={styles.searchRow}>
            <Feather name="search" size={16} color={MUTED} />
            <TextInput
              placeholder="Search name / phone / email"
              placeholderTextColor="#9CA3AF"
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
              returnKeyType="search"
            />
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={10}>
              <Feather name="x" size={16} color={MUTED} />
            </TouchableOpacity>
          </View>

          {/* SELECTION TOOLBAR */}
          {selectionMode && (
            <View style={styles.selectionBar}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="layers" size={14} color="#fff" />
                <Text style={styles.selectionBarText}>{selectedIds.size} selected</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={styles.selectionBtn} onPress={selectAllVisible}>
                  <Feather name="select-all" size={14} color="#fff" />
                  <Text style={styles.selectionBtnTxt}>Select all</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.selectionBtn} onPress={clearSelection}>
                  <Feather name="x" size={14} color="#fff" />
                  <Text style={styles.selectionBtnTxt}>Clear</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.selectionBtn, { backgroundColor: '#DC2626' }]}
                  onPress={bulkPurge}
                  disabled={bulkPurging || selectedIds.size === 0}
                >
                  {bulkPurging ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Feather name="x-octagon" size={14} color="#fff" />
                      <Text style={styles.selectionBtnTxt}>Purge selected</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* LIST */}
          <FlatList
            data={filtered}
            keyExtractor={(u) => String(u.id)}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
            contentContainerStyle={{ paddingBottom: 24 }}
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={{ color: MUTED, fontSize: 12 }}>No users found.</Text>
              </View>
            }
            renderItem={({ item }) => {
              const isChecked = selectedIds.has(item.id);
              return (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    if (selectionMode) {
                      toggleSelectId(item.id);
                    } else {
                      setSelected(item);
                    }
                  }}
                  onLongPress={() => {
                    if (!selectionMode) {
                      toggleSelectMode(true);
                      toggleSelectId(item.id);
                    }
                  }}
                  style={styles.userRow}
                >
                  {selectionMode && (
                    <View style={styles.checkboxWrap}>
                      <Feather name={isChecked ? 'check-square' : 'square'} size={20} color={isChecked ? ACCENT : '#9CA3AF'} />
                    </View>
                  )}

                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <OnlineDot on={item.is_online} />
                      <Text style={styles.userName} numberOfLines={1}>
                        {item.username || '—'}
                      </Text>
                    </View>
                    <Text style={styles.userSub} numberOfLines={1}>
                      {item.phone_number || item.email || '—'}
                    </Text>
                  </View>

                  <View style={{ alignItems: 'flex-end' }}>
                    <StatusChip status={item.status} />
                    <Text style={styles.lastSeen} numberOfLines={1}>
                      {item.last_seen_at ? `Seen ${fmtDateTime(item.last_seen_at)}` : 'Never seen'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        </>
      )}

      {/* DETAIL MODAL */}
      <UserDetailModal
        visible={!!selected}
        onClose={() => setSelected(null)}
        user={selected}
        fmtDateTime={fmtDateTime}
        onActivate={() => selected && manage(selected.id, 'activate')}
        onDeactivate={() => selected && manage(selected.id, 'deactivate')}
        onDelete={() => {
          if (!selected) return;
          Alert.alert(
            'Delete user',
            `Are you sure you want to delete ${selected.username || 'this user'}?`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => manage(selected.id, 'delete'),
              },
            ]
          );
        }}
        onPurge={() => selected && confirmAndPurgeSingle(selected)}
        acting={acting}
        purging={purging}
      />
    </SafeAreaView>
  );
}

/* ============================ Modal ============================ */
function UserDetailModal({
  visible,
  onClose,
  user,
  fmtDateTime,
  onActivate,
  onDeactivate,
  onDelete,
  onPurge,
  acting,
  purging,
}: {
  visible: boolean;
  onClose: () => void;
  user: SuperAdminUser | null;
  fmtDateTime: (iso?: string | null) => string;
  onActivate: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
  onPurge: () => void;
  acting: boolean;
  purging: boolean;
}) {
  if (!user) return null;

  const ActionBar = () => {
    const isActive = user.status === 'active';
    return (
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.btn, styles.btnGhost]}
          onPress={onClose}
          disabled={acting || purging}
        >
          <Text style={[styles.btnGhostText]}>Close</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: isActive ? WARN : SUCCESS, opacity: acting ? 0.6 : 1 }]}
          onPress={isActive ? onDeactivate : onActivate}
          disabled={acting || purging}
        >
          {acting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Feather name={isActive ? 'slash' : 'check'} size={16} color="#fff" />
              <Text style={styles.btnTxt}>{isActive ? 'Deactivate' : 'Activate'}</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: DANGER, opacity: acting ? 0.6 : 1 }]}
          onPress={onDelete}
          disabled={acting || purging}
        >
          {acting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Feather name="trash-2" size={16} color="#fff" />
              <Text style={styles.btnTxt}>Delete</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  const PurgeBar = () => (
    <View style={[styles.actionRow, { marginTop: 8 }]}>
      <TouchableOpacity
        style={[styles.btn, { backgroundColor: '#B91C1C', opacity: purging ? 0.6 : 1 }]}
        onPress={onPurge}
        disabled={purging || acting}
      >
        {purging ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Feather name="x-octagon" size={16} color="#fff" />
            <Text style={styles.btnTxt}>Purge (Delete All Data)</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop} />
      <View style={styles.modalWrap}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle} numberOfLines={1}>
            {user.username || 'User'}
          </Text>
          <View style={styles.rowBetween}>
            <Text style={styles.metaLabel}>Role</Text>
            <Text style={styles.metaValue}>{user.role || '—'}</Text>
          </View>
          <View style={styles.rowBetween}>
            <Text style={styles.metaLabel}>Status</Text>
            <Text style={[styles.metaValue, { textTransform: 'capitalize' }]}>{user.status}</Text>
          </View>
          <View style={styles.rowBetween}>
            <Text style={styles.metaLabel}>Phone</Text>
            <Text style={styles.metaValue}>{user.phone_number || '—'}</Text>
          </View>
          <View style={styles.rowBetween}>
            <Text style={styles.metaLabel}>Email</Text>
            <Text style={styles.metaValue} numberOfLines={1}>{user.email || '—'}</Text>
          </View>

          <View style={styles.line} />

          <View style={styles.rowBetween}>
            <Text style={styles.metaLabel}>Created</Text>
            <Text style={styles.metaValue}>{fmtDateTime(user.created_at)}</Text>
          </View>
          <View style={styles.rowBetween}>
            <Text style={styles.metaLabel}>Updated</Text>
            <Text style={styles.metaValue}>{fmtDateTime(user.updated_at)}</Text>
          </View>
          <View style={styles.rowBetween}>
            <Text style={styles.metaLabel}>Last Login</Text>
            <Text style={styles.metaValue}>{fmtDateTime(user.last_login_at)}</Text>
          </View>
          <View style={styles.rowBetween}>
            <Text style={styles.metaLabel}>Last Seen</Text>
            <Text style={styles.metaValue}>{fmtDateTime(user.last_seen_at)}</Text>
          </View>

          <View style={styles.line} />

          <View>
            <Text style={styles.metaLabel}>Location</Text>
            <Text style={[styles.metaValue, { textAlign: 'right' }]}>
              {[user.geo_city, user.geo_region, user.geo_country].filter(Boolean).join(', ') || '—'}
            </Text>
            <Text style={[styles.metaValue, { textAlign: 'right', marginTop: 2, color: MUTED, fontSize: 11 }]}>
              {user.geo_country_code || '—'} · {user.geo_timezone || '—'}
            </Text>
          </View>

          <ActionBar />
          <PurgeBar />
        </View>
      </View>
    </Modal>
  );
}

/* ============================ Styles ============================ */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F9FC' },

  header: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 16,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },

  headerIconBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },

  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  logoutTxt: { color: '#fff', fontWeight: '800', fontSize: 12 },

  statsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    marginTop: 10,
    marginBottom: 6,
  },
  statCard: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowOffset: { width: 0, height: 4 }, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  statLabel: { color: MUTED, fontSize: 11, marginBottom: 4 },
  statValue: { color: TEXT, fontSize: 16, fontWeight: '900' },

  searchRow: {
    marginTop: 4,
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
  searchInput: { flex: 1, color: TEXT, fontSize: 13, paddingVertical: 2 },

  /* Selection toolbar */
  selectionBar: {
    marginHorizontal: 14,
    marginBottom: 6,
    backgroundColor: ACCENT,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#41518a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  selectionBarText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  selectionBtn: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  selectionBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 12 },

  userRow: {
    marginHorizontal: 14,
    marginTop: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    gap: 10,
  },
  checkboxWrap: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userName: { fontSize: 13, fontWeight: '800', color: TEXT },
  userSub: { fontSize: 11, color: MUTED, marginTop: 2 },
  lastSeen: { fontSize: 10, color: MUTED, marginTop: 8 },

  chip: {
    alignSelf: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipTxt: { fontSize: 10, fontWeight: '900' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },

  /* Modal */
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  modalWrap: { ...StyleSheet.absoluteFillObject, padding: 18, alignItems: 'center', justifyContent: 'center' },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.12, shadowOffset: { width: 0, height: 10 }, shadowRadius: 16 },
      android: { elevation: 8 },
    }),
  },
  modalTitle: { fontWeight: '900', color: TEXT, fontSize: 15, textAlign: 'center', marginBottom: 10 },

  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  metaLabel: { color: MUTED, fontSize: 11 },
  metaValue: { color: TEXT, fontSize: 12, fontWeight: '700', marginLeft: 8 },

  line: { height: 1, backgroundColor: '#EEF1F6', marginVertical: 10 },

  block: { marginTop: 8 },

  actionRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  btn: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 12 },
  btnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: BORDER },
  btnGhostText: { color: TEXT, fontWeight: '800', fontSize: 12 },
});
