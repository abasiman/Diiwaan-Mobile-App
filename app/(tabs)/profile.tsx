// app/profile.tsx
import { Button } from '@/components/Button';
import { FormInput } from '@/components/FormInput';
import { Colors } from '@/constants/Colors';
import api from '@/services/api';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../src/context/AuthContext';
import {
  getMeLocal,
  upsertMeFromServer,
  type MeProfile,
} from '../profile/meProfileRepo';


type MeResponse = {
  id: number;
  username: string;
  email: string | null;
  company_name: string | null;
  phone_number: string | null;
};

type ProfileForm = {
  company_name: string | null;
  username: string;
  phone_number: string | null;
};

type PasswordForm = {
  current_password: string;
  new_password: string;
  confirm_password: string;
};

function parseApiError(err: any): string {
  try {
    const isAxios = !!(err?.isAxiosError || err?.response);
    const status = isAxios ? err?.response?.status : err?.status;

    if (!status && (err?.code === 'ERR_NETWORK' || err?.message === 'Network request failed')) {
      return "Can't reach the server. Check your connection.";
    }
    const detail = isAxios ? err?.response?.data?.detail : undefined;
    if (detail) return typeof detail === 'string' ? detail : JSON.stringify(detail);
    if (status === 400) return 'Invalid request.';
    if (status === 401 || status === 403) return 'Unauthorized.';
    if (status && status >= 500) return 'Server error. Try again shortly.';
    return 'Something went wrong.';
  } catch {
    return 'Something went wrong.';
  }
}

export default function ProfileScreen() {
  const router = useRouter();
  const { logout, token, user } = useAuth();

  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sub = NetInfo.addEventListener((state) => {
      const ok = Boolean(state.isConnected && state.isInternetReachable);
      setOnline(ok);
    });
    return () => sub();
  }, []);

  // view/edit state
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [changingPass, setChangingPass] = useState(false); // controls bottom sheet modal
  const [saving, setSaving] = useState(false);
  const [savingPass, setSavingPass] = useState(false);

  // profile form
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProfileForm>({
    defaultValues: { company_name: null, username: '', phone_number: null },
  });

  // password form (used inside bottom sheet)
  const {
    control: controlPwd,
    handleSubmit: handleSubmitPwd,
    reset: resetPwd,
    watch: watchPwd,
    formState: { errors: pwdErrors },
  } = useForm<PasswordForm>({
    defaultValues: { current_password: '', new_password: '', confirm_password: '' },
  });

  const pwd = watchPwd(); // keep confirm valid when password changes

  const canSave = useMemo(() => editing && !saving, [editing, saving]);

  useEffect(() => {
    (async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      const applyProfile = (p: MeProfile | MeResponse | null) => {
        if (!p) return;
        setMe(p as MeResponse);
        reset({
          company_name: p.company_name,
          username: p.username,
          phone_number: p.phone_number,
        });
      };

      try {
        // ONLINE → API then cache
        if (online && token) {
          const resp = await api.get<MeResponse>('/diiwaan/me');
          applyProfile(resp.data);
          upsertMeFromServer(resp.data as MeProfile);
          return;
        }

        // OFFLINE or no token → local cache
        const local = getMeLocal(user.id);
        if (local) {
          applyProfile(local);
        } else if (online && token) {
          // fallback: try online once
          const resp = await api.get<MeResponse>('/diiwaan/me');
          applyProfile(resp.data);
          upsertMeFromServer(resp.data as MeProfile);
        } else {
          Alert.alert(
            'Offline',
            'Profile is not yet available offline. Open this screen once while online.'
          );
        }
      } catch (err) {
        const local = user?.id ? getMeLocal(user.id) : null;
        if (local) {
          applyProfile(local);
        } else {
          Alert.alert('Error', parseApiError(err));
        }
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, token, user?.id]);

  const onEditToggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (!editing) {
      if (me) {
        reset({
          company_name: me.company_name,
          username: me.username,
          phone_number: me.phone_number,
        });
      }
      setEditing(true);
    } else {
      if (me) {
        reset({
          company_name: me.company_name,
          username: me.username,
          phone_number: me.phone_number,
        });
      }
      setEditing(false);
    }
  };

  const onSaveProfile = async (data: ProfileForm) => {
    if (!online || !token) {
      Alert.alert('Offline', 'You must be online to update your profile.');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        company_name:
          data.company_name && data.company_name.trim() !== ''
            ? data.company_name.trim()
            : null,
        username: data.username.trim(),
        phone_number:
          data.phone_number && data.phone_number.trim() !== ''
            ? data.phone_number.trim()
            : null,
      };
      const resp = await api.put<MeResponse>('/diiwaan/me', payload);
      setMe(resp.data);
      reset({
        company_name: resp.data.company_name,
        username: resp.data.username,
        phone_number: resp.data.phone_number,
      });

      // update offline cache
      upsertMeFromServer(resp.data as MeProfile);

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setEditing(false);
      Alert.alert('Saved', 'Your profile has been updated.');
    } catch (err) {
      Alert.alert('Update failed', parseApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const openChangePassword = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    resetPwd({ current_password: '', new_password: '', confirm_password: '' });
    setChangingPass(true);
  };

  const closeChangePassword = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setChangingPass(false);
  };

  const onSavePassword = async (data: PasswordForm) => {
    if (!online || !token) {
      Alert.alert('Offline', 'You must be online to change your password.');
      return;
    }

    try {
      if (data.new_password.length < 6) {
        Alert.alert('Weak password', 'New password must be at least 6 characters.');
        return;
      }
      if (data.new_password !== data.confirm_password) {
        Alert.alert('Mismatch', 'New password and confirmation do not match.');
        return;
      }
      setSavingPass(true);
      await api.put('/diiwaan/me/password', {
        current_password: data.current_password,
        new_password: data.new_password,
        confirm_password: data.confirm_password,
      });
      resetPwd({ current_password: '', new_password: '', confirm_password: '' });
      closeChangePassword();
      Alert.alert('Success', 'Password updated.');
    } catch (err) {
      Alert.alert('Password change failed', parseApiError(err));
    } finally {
      setSavingPass(false);
    }
  };

  const onLogout = async () => {
    try {
      await logout();
    } finally {
      router.replace('/(auth)/login');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeRoot} edges={['top', 'left', 'right']}>
        <View style={[styles.center, { flex: 1 }]}>
          <ActivityIndicator size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeRoot} edges={['top', 'left', 'right']}>
      {/* HEADER */}
      <View style={styles.headerWrap}>
        <LinearGradient
          colors={['#0B2447', '#19376D']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerBg}
        >
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} accessibilityLabel="Back">
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Profile</Text>
            <TouchableOpacity
              style={styles.logoutBtn}
              onPress={onLogout}
              accessibilityLabel="Log out"
              activeOpacity={0.9}
            >
              <Ionicons name="log-out-outline" size={16} color="#FF4D4F" />
              <Text style={styles.logoutTxt}>Logout</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.avatarWrap}>
            <View style={styles.avatarCircle}>
              <Ionicons name="person-circle-outline" size={80} color="#fff" />
            </View>
            <Text style={styles.displayName}>{me?.username || 'User'}</Text>
            <Text style={styles.subtleText}>{me?.email ?? ''}</Text>
          </View>
        </LinearGradient>
      </View>

      {/* BODY */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content}>
          {/* NON-EDIT VIEW */}
          {!editing ? (
            <View style={styles.card}>
              {me?.company_name ? (
                <View style={styles.itemRow}>
                  <Text style={styles.itemLabel}>Company</Text>
                  <Text style={styles.itemValue}>{me.company_name}</Text>
                </View>
              ) : null}

              <View style={styles.itemRow}>
                <Text style={styles.itemLabel}>Username</Text>
                <Text style={styles.itemValue}>{me?.username}</Text>
              </View>

              {me?.phone_number ? (
                <View style={styles.itemRow}>
                  <Text style={styles.itemLabel}>Phone</Text>
                  <Text style={styles.itemValue}>{me.phone_number}</Text>
                </View>
              ) : null}

              <Button title="Edit Profile" onPress={onEditToggle} style={styles.primaryBtn} />
            </View>
          ) : (
            // EDIT MODE
            <View style={styles.card}>
              <Controller
                control={control}
                name="company_name"
                render={({ field: { value, onChange } }) => (
                  <FormInput
                    label="Company Name (optional)"
                    placeholder="Enter company name"
                    placeholderTextColor="#000"
                    value={value ?? ''}
                    onChangeText={(t) => onChange(t === '' ? null : t)}
                    inputContainerStyle={styles.inputContainer}
                  />
                )}
              />

              <Controller
                control={control}
                name="username"
                rules={{ required: 'Username is required', minLength: { value: 3, message: 'Min 3 characters' } }}
                render={({ field: { value, onChange } }) => (
                  <FormInput
                    label="Username"
                    placeholder="Enter username"
                    placeholderTextColor="#000"
                    value={value}
                    onChangeText={onChange}
                    error={errors.username?.message}
                    inputContainerStyle={styles.inputContainer}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                )}
              />

              <Controller
                control={control}
                name="phone_number"
                render={({ field: { value, onChange } }) => (
                  <FormInput
                    label="Phone (optional)"
                    placeholder="e.g. +252 61 2345678"
                    placeholderTextColor="#000"
                    value={value ?? ''}
                    onChangeText={(t) => onChange(t === '' ? null : t)}
                    inputContainerStyle={styles.inputContainer}
                    keyboardType="phone-pad"
                  />
                )}
              />

              <View style={styles.row}>
                <Button
                  title={saving ? 'Saving…' : 'Save Changes'}
                  onPress={handleSubmit(onSaveProfile)}
                  disabled={!canSave}
                  loading={saving}
                  style={[styles.primaryBtn, { flex: 1 }]}
                />
                <View style={{ width: 10 }} />
                <Button title="Cancel" onPress={onEditToggle} style={[styles.secondaryBtn, { flex: 1 }]} />
              </View>
            </View>
          )}

          {/* CHANGE PASSWORD (Button opens bottom sheet) */}
          <View style={styles.card}>
            <Button title="Change Password" onPress={openChangePassword} style={styles.secondaryBtn} />
          </View>

          <View style={{ height: 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ----- Bottom Sheet: Change Password ----- */}
      <Modal
        visible={changingPass}
        transparent
        animationType="slide"
        onRequestClose={closeChangePassword}
      >
        <View style={styles.sheetBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeChangePassword} />
          <View style={styles.sheetContainer}>
            {/* Sheet header */}
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Change Password</Text>
              <TouchableOpacity onPress={closeChangePassword} style={styles.sheetCloseBtn}>
                <Ionicons name="close" size={22} color="#111827" />
              </TouchableOpacity>
            </View>

            {/* Long, scrollable form so it won't clash with tabs */}
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={{ flex: 1 }}
            >
              <ScrollView
                contentContainerStyle={styles.sheetBody}
                keyboardShouldPersistTaps="handled"
              >
                <Controller
                  control={controlPwd}
                  name="current_password"
                  rules={{ required: 'Current password is required' }}
                  render={({ field: { value, onChange } }) => (
                    <FormInput
                      label="Current Password"
                      placeholder="Enter current password"
                      placeholderTextColor="#000"
                      value={value}
                      onChangeText={onChange}
                      error={pwdErrors.current_password?.message}
                      secureTextEntry
                      inputContainerStyle={styles.inputContainer}
                    />
                  )}
                />

                <Controller
                  control={controlPwd}
                  name="new_password"
                  rules={{ required: 'New password is required', minLength: { value: 6, message: 'Min 6 characters' } }}
                  render={({ field: { value, onChange } }) => (
                    <FormInput
                      label="New Password"
                      placeholder="Enter new password"
                      placeholderTextColor="#000"
                      value={value}
                      onChangeText={onChange}
                      error={pwdErrors.new_password?.message}
                      secureTextEntry
                      inputContainerStyle={styles.inputContainer}
                    />
                  )}
                />

                <Controller
                  control={controlPwd}
                  name="confirm_password"
                  rules={{
                    required: 'Confirm your new password',
                    validate: (v) => v === pwd.new_password || 'Passwords do not match',
                  }}
                  render={({ field: { value, onChange } }) => (
                    <FormInput
                      label="Confirm New Password"
                      placeholder="Re-enter new password"
                      placeholderTextColor="#000"
                      value={value}
                      onChangeText={onChange}
                      error={pwdErrors.confirm_password?.message}
                      secureTextEntry
                      inputContainerStyle={styles.inputContainer}
                    />
                  )}
                />

                <View style={[styles.row, { marginTop: 8 }]}>
                  <Button
                    title={savingPass ? 'Updating…' : 'Update Password'}
                    onPress={handleSubmitPwd(onSavePassword)}
                    loading={savingPass}
                    disabled={savingPass}
                    style={[styles.primaryBtn, { flex: 1 }]}
                  />
                  <View style={{ width: 10 }} />
                  <Button title="Cancel" onPress={closeChangePassword} style={[styles.secondaryBtn, { flex: 1 }]} />
                </View>

                {/* Extra spacer so the content is comfortably scrollable */}
                <View style={{ height: 40 }} />
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeRoot: { flex: 1, backgroundColor: Colors.light.background },

  headerWrap: {
    overflow: 'hidden',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    backgroundColor: '#0B2447',
  },
  headerBg: { paddingTop: 12, paddingBottom: 20, paddingHorizontal: 16 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: '#fff', fontWeight: '800', fontSize: 18 },

  avatarWrap: { alignItems: 'center', marginTop: 12, marginBottom: 4 },
  avatarCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    marginBottom: 6,
  },
  displayName: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: 0.3 },
  subtleText: { color: 'rgba(255,255,255,0.85)', marginTop: 2 },

  content: { padding: 16, paddingTop: 18 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 12,
  },

  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  logoutTxt: {
    color: '#FF4D4F',
    fontWeight: '800',
    fontSize: 12,
  },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  itemLabel: { flex: 0.9, color: '#6B7280', fontWeight: '600' },
  itemValue: { flex: 2, color: '#111827', fontWeight: '700' },

  inputContainer: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    backgroundColor: '#fff',
    marginBottom: 10,
  },

  row: { flexDirection: 'row', alignItems: 'center' },
  primaryBtn: { backgroundColor: Colors.light.primary, marginTop: 6 },
  secondaryBtn: { backgroundColor: '#222c3fff', marginTop: 6 },
  dangerBtn: { backgroundColor: '#EF4444', marginTop: 6 },
  center: { alignItems: 'center', justifyContent: 'center' },

  /* Bottom sheet modal */
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheetContainer: {
    height: '88%', // tall so it won't clash with tabs, and scrolls nicely
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    overflow: 'hidden',
  },
  sheetHeader: {
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#E5E7EB',
    marginBottom: 8,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
  },
  sheetCloseBtn: {
    position: 'absolute',
    right: 12,
    top: 8,
    padding: 6,
    borderRadius: 8,
  },
  sheetBody: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 24,
  },
});
