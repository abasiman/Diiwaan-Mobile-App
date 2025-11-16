// app/(auth)/login.tsx
import { Button } from '@/components/Button';
import { FormInput } from '@/components/FormInput';
import { Colors } from '@/constants/Colors';
import { Feather, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useMemo, useState } from 'react';


import { Controller, useForm } from 'react-hook-form';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  LayoutAnimation,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../src/context/AuthContext';

type Data = { username: string; password: string };

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/* -------------------- Errors -------------------- */
type ParsedError =
  | { type: 'invalid_credentials'; message: string }
  | { type: 'rate_limited'; message: string }
  | { type: 'network'; message: string }
  | { type: 'server'; message: string }
  | { type: 'unknown'; message: string };

function parseAuthError(err: any): ParsedError {
  try {
    const isAxios = !!(err?.isAxiosError || err?.name === 'AxiosError' || err?.response);
    const status = isAxios ? err?.response?.status : err?.status;
    const code = err?.code;

    if (!status && (code === 'ERR_NETWORK' || code === 'ECONNABORTED' || err?.message === 'Network request failed')) {
      return { type: 'network', message: "Can't reach the server. Check your connection and try again." };
    }
    if (status === 401 || status === 403) {
      return { type: 'invalid_credentials', message: 'Incorrect username/email or password.' };
    }
    if (status === 429) {
      return { type: 'rate_limited', message: 'Too many attempts. Please wait a minute and try again.' };
    }
    if (status && status >= 500) {
      return { type: 'server', message: 'Server error. Please try again shortly.' };
    }
    if (String(err?.message || '').toLowerCase().includes('network')) {
      return { type: 'network', message: "Can't reach the server. Check your connection and try again." };
    }
    return { type: 'unknown', message: 'Something went wrong while logging in.' };
  } catch {
    return { type: 'unknown', message: 'Something went wrong while logging in.' };
  }
}

/* -------------------- Assets & Env -------------------- */
const LOGO = require('@/assets/images/android/play_store_512.png');

const KEY_REMEMBER = 'diiwaan.remember';
const KEY_USERNAME = 'diiwaan.username';
const KEY_PASSWORD = 'diiwaan.password';

// NEW: one-shot prefill keys used after signup
const KEY_PREFILL_USERNAME = 'diiwaan.prefill.username';
const KEY_PREFILL_PASSWORD = 'diiwaan.prefill.password';

const WHATSAPP_NUMBER =
  (process.env.EXPO_PUBLIC_WHATSAPP_NUMBER as string) ||
  (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER as string) ||
  '0617259034';

const WHATSAPP_DEFAULT_MESSAGE =
  (process.env.EXPO_PUBLIC_WHATSAPP_DEFAULT_MESSAGE as string) ||
  (process.env.NEXT_PUBLIC_WHATSAPP_DEFAULT_MESSAGE as string) ||
  'Hello!%20I%20have%20a%20question%20about%20your%20services.';

/* -------------------- UX Helpers -------------------- */
const LOGIN_TIMEOUT_MS = 12000;
function withTimeout<T>(p: Promise<T>, ms = LOGIN_TIMEOUT_MS) {
  let t: any;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej({ type: 'network', message: 'Login timed out.' }), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}

const FONT = Platform.select({
  ios: 'Helvetica Neue',
  android: 'Roboto',
  default: 'System',
});

/* -------------------- Component -------------------- */
export default function LoginForm({ onSuccess }: { onSuccess?: () => void }) {
  const [showPassword, setShowPassword] = useState(false);
  const [usernameFocused, setUsernameFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [remember, setRemember] = useState<boolean>(false);
  const [prefilling, setPrefilling] = useState(true);

  const router = useRouter();
  const { login } = useAuth();
  const {
    control,
    handleSubmit,
    clearErrors,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Data>({ defaultValues: { username: '', password: '' } });

  const canSubmit = useMemo(() => !isSubmitting, [isSubmitting]);

  useEffect(() => {
    (async () => {
      try {
        // Normal "Remember me" flow
        const [rememberStr, rememberedUsername] = await Promise.all([
          AsyncStorage.getItem(KEY_REMEMBER),
          AsyncStorage.getItem(KEY_USERNAME),
        ]);
        const remembered = rememberStr === '1';
        setRemember(remembered);

        if (remembered) {
          if (rememberedUsername) setValue('username', rememberedUsername, { shouldDirty: false });
          const savedPassword = await SecureStore.getItemAsync(KEY_PASSWORD);
          if (savedPassword) setValue('password', savedPassword, { shouldDirty: false });
        }

        // NEW: one-shot prefill from signup (independent of Remember me)
        const [prefillUser, prefillPass] = await Promise.all([
          AsyncStorage.getItem(KEY_PREFILL_USERNAME),
          SecureStore.getItemAsync(KEY_PREFILL_PASSWORD),
        ]);

        if (prefillUser) {
          setValue('username', prefillUser, { shouldDirty: false });
          await AsyncStorage.removeItem(KEY_PREFILL_USERNAME); // clear after use
        }
        if (prefillPass) {
          setValue('password', prefillPass, { shouldDirty: false });
          await SecureStore.deleteItemAsync(KEY_PREFILL_PASSWORD); // clear after use
        }
      } catch {
        // noop
      } finally {
        setPrefilling(false);
      }
    })();
  }, [setValue]);

  const routeByRole = (role?: string | null) => {
    if (role === 'super_admin') {
      router.replace('/diiwaanadmin/userslist');
    } else {
      router.replace('/oilsalesdashboard');
    }
  };
const onSubmit = async (data: Data) => {
  setFormError(null);
  clearErrors();

  const loginOrEmail = data.username.trim();
  const password = data.password;

  try {
    const info = await withTimeout(login(loginOrEmail, password));

    // Optional: grab ownerId / token if you need them
    const ownerId =
      (info as any)?.user?.id ??
      (info as any)?.id ??
      null;

    const tokenStr =
      (info as any)?.token ??
      (info as any)?.access_token ??
      null;

    // Route based on role
    routeByRole((info as any)?.role);
    onSuccess?.();

    // Persist based on "Remember me"
    if (remember) {
      const toSet: [string, string][] = [
        [KEY_REMEMBER, '1'],
        [KEY_USERNAME, loginOrEmail],
      ];

      Promise.allSettled([
        AsyncStorage.multiSet(toSet),
        SecureStore.setItemAsync(KEY_PASSWORD, password),
      ]).catch(() => {});
    } else {
      Promise.allSettled([
        AsyncStorage.multiRemove([KEY_REMEMBER, KEY_USERNAME]),
        SecureStore.deleteItemAsync(KEY_PASSWORD),
      ]).catch(() => {});
    }
  } catch (err: any) {
    const parsed = parseAuthError(err);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFormError(parsed.message);
  }
};


  const handleWhatsAppPress = async () => {
    const digits = (WHATSAPP_NUMBER || '').replace(/\D/g, '');
    const msg = WHATSAPP_DEFAULT_MESSAGE || '';
    const deepLink = `whatsapp://send?phone=${digits}&text=${msg}`;
    const webLink = `https://wa.me/${digits}?text=${msg}`;

    try {
      const supported = await Linking.canOpenURL('whatsapp://send');
      if (supported) {
        await Linking.openURL(deepLink);
      } else {
        await Linking.openURL(webLink);
      }
    } catch {
      Alert.alert('WhatsApp', 'Could not open WhatsApp.');
    }
  };

  return (
    <SafeAreaView style={styles.safeRoot} edges={['top', 'left', 'right']}>
      {/* HEADER */}
      <View style={styles.headerWrap}>
        <LinearGradient
          colors={['#0B2447', '#0B2447']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerBg}
        >
          <View style={styles.centerHeader}>
            <View style={styles.logoWrap}>
              <Image source={LOGO} style={styles.logoImg} resizeMode="cover" />
            </View>
            <Text style={styles.brandTitle}>Diiwaan App</Text>
          </View>
        </LinearGradient>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex1}>
        <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
          {/* Error banner */}
          {formError ? (
            <View style={styles.errorBanner}>
              <Ionicons name="warning-outline" size={18} style={styles.errorIcon} />
              <Text style={styles.errorText}>{formError}</Text>
              <TouchableOpacity
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setFormError(null);
                }}
                style={styles.bannerCloseBtn}
                accessibilityLabel="Dismiss error"
              >
                <Ionicons name="close" size={18} />
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.formContainer}>
            {/* Username OR Email */}
            <Controller
              control={control}
              name="username"
              rules={{ required: 'Username or email is required', minLength: { value: 3, message: 'At least 3 characters' } }}
              render={({ field: { onChange, value} }) => (
                <FormInput
                  label="Username or Email"
                  placeholder="Enter username or email"
                  placeholderTextColor={Colors.light.gray500}
                  value={value}
                  onChangeText={onChange}
                  error={errors.username?.message}
                  icon="person-outline"
                  autoCapitalize="none"
                  inputContainerStyle={[
                    styles.inputContainer,
                    usernameFocused && styles.inputContainerFocused,
                    !!errors.username && styles.inputContainerError,
                  ]}
                  onFocus={() => setUsernameFocused(true)}
                  onBlur={() => setUsernameFocused(false)}
                  inputStyle={{ color: '#000', fontSize: 16, fontFamily: FONT }}
                  autoCorrect={false}
                />
              )}
            />

            {/* Password */}
            <Controller
              control={control}
              name="password"
              rules={{ required: 'Password is required' }}
              render={({ field: { onChange, value } }) => (
                <FormInput
                  label="Password"
                  placeholder="Enter password"
                  placeholderTextColor={Colors.light.gray500}
                  secureTextEntry={!showPassword}
                  value={value}
                  onChangeText={onChange}
                  error={errors.password?.message}
                  rightIcon={
                    <TouchableOpacity onPress={() => setShowPassword((v) => !v)}>
                      <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color={Colors.light.gray500} />
                    </TouchableOpacity>
                  }
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                  inputContainerStyle={[
                    styles.inputContainer,
                    passwordFocused && styles.inputContainerFocused,
                    !!errors.password && styles.inputContainerError,
                  ]}
                  inputStyle={{ color: '#000', fontSize: 16, fontFamily: FONT }}
                />
              )}
            />

            {/* Remember me */}
            <TouchableOpacity style={styles.rememberRow} onPress={() => setRemember((v) => !v)} activeOpacity={0.8}>
              <View style={[styles.checkbox, remember && styles.checkboxChecked]}>
                {remember ? <Feather name="check" size={12} color="#fff" /> : null}
              </View>
              <Text style={styles.rememberText}>Remember me</Text>
            </TouchableOpacity>

            <Button
              onPress={handleSubmit(onSubmit)}
              title={isSubmitting ? 'Logging in…' : 'Log In'}
              loading={isSubmitting}
              disabled={!canSubmit || prefilling}
              style={styles.loginButton}
            />

            <TouchableOpacity
              style={styles.forgotBtn}
              onPress={() => Alert.alert('Password reset', 'Use the “Forgot Password?” flow.')}
            >
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>

            {/* Create account */}
            <TouchableOpacity
              style={styles.createBtn}
              onPress={() => router.replace('/(auth)/signup')}
              activeOpacity={0.9}
            >
              <Text style={styles.createBtnText}>Furo Account Cusub</Text>
            </TouchableOpacity>

            {/* Contact Card */}
            <View style={styles.contactCard}>
              <Text style={styles.contactTitle}>Contact us</Text>
              <View style={styles.contactRow}>
                <View>
                  <Text style={styles.contactLabel}>Phone</Text>
                  <Text style={styles.contactValue}>061 725 9034</Text>
                </View>
                <TouchableOpacity style={styles.whatsBtn} onPress={handleWhatsAppPress} activeOpacity={0.9}>
                  <Ionicons name="logo-whatsapp" size={14} color="#fff" />
                  <Text style={styles.whatsBtnText}>WhatsApp</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.footer} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* -------------------- Styles -------------------- */
const styles = StyleSheet.create({
  safeRoot: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  flex1: { flex: 1 },

  /* Header */
  headerWrap: {
    overflow: 'hidden',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    backgroundColor: '#0B2447',
  },
  headerBg: {
    paddingTop: 10,
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  centerHeader: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrap: {
    width: 54,
    height: 54,
    borderRadius: 14,
    backgroundColor: '#0D2A56',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImg: { width: '100%', height: '100%', borderRadius: 10 },
  brandTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.2,
    marginTop: 6,
    fontFamily: FONT,
  },

  /* Body */
  scrollContainer: {
    padding: 24,
    paddingTop: 16,
    flexGrow: 1,
  },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: '#FFE8E6',
    borderWidth: 1,
    borderColor: '#FFB3AD',
    marginBottom: 10,
  },
  errorIcon: { marginRight: 6, color: '#C62828' },
  errorText: { flex: 1, color: '#7A1F1F', fontSize: 13, fontFamily: FONT },
  bannerCloseBtn: { paddingHorizontal: 4, paddingVertical: 2, marginLeft: 6 },

  formContainer: { marginBottom: 14 },

  inputContainer: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
  },
  inputContainerFocused: { borderColor: '#576CBC', borderWidth: 2 },
  inputContainerError: { borderColor: '#EF4444' },

  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
    marginBottom: 6,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.25,
    borderColor: '#C7D2FE',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#576CBC', borderColor: '#576CBC' },
  rememberText: { color: '#374151', fontWeight: '600', fontSize: 13, fontFamily: FONT },

  loginButton: { marginTop: 6, backgroundColor: Colors.light.primary },

  forgotBtn: { marginTop: 8, alignItems: 'flex-end' },
  forgotText: { color: '#576CBC', fontSize: 13, fontWeight: '600', fontFamily: FONT },

  createBtn: {
    marginTop: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#ffffffff',
    borderWidth: 1,
    borderColor: '#020508ff',
  },
  createBtnText: { color: '#002456ff', fontWeight: '800', fontSize: 16, fontFamily: FONT },

  contactCard: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  contactTitle: {
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  contactLabel: {
    fontFamily: FONT,
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 2,
  },
  contactValue: {
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: '900',
    color: '#0B1220',
  },
  whatsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#22C55E',
  },
  whatsBtnText: { color: '#fff', fontSize: 12, fontWeight: '800', fontFamily: FONT },

  footer: { alignItems: 'center', marginTop: 12 },
});
