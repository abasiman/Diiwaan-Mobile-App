// app/(auth)/signup.tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Colors } from '@/constants/Colors';
import api from '@/services/api';

type FormData = {
  username: string;
  email?: string;
  phone: string;
  password: string;
  confirmPassword: string;
};

const LOGO = require('@/assets/images/android/play_store_512.png');

// Keys used to prefill login right after signup
const KEY_PREFILL_USERNAME = 'diiwaan.prefill.username';
const KEY_PREFILL_PASSWORD = 'diiwaan.prefill.password';

const FONT = Platform.select({
  ios: 'Helvetica Neue',
  android: 'Roboto',
  default: 'System',
});

/* ───────────────────────── FloatingInput ─────────────────────────
   - Label is a placeholder when unfocused/empty (grey).
   - On focus or when value exists, label floats inside border (top-left),
     with a white background chip and smaller font.
   - Border darkens on focus or when error exists.
   - IMPORTANT: when a left icon exists, both the label and input text
     are padded so they never overlap the icon.
-------------------------------------------------------------------*/
type FloatingProps = {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  iconLeft?: keyof typeof Ionicons.glyphMap;
  rightIcon?: React.ReactNode;
  error?: string;
};

function FloatingInput({
  label,
  value,
  onChangeText,
  placeholder = '',
  keyboardType = 'default',
  secureTextEntry,
  autoCapitalize = 'none',
  iconLeft,
  rightIcon,
  error,
}: FloatingProps) {
  const [focused, setFocused] = useState(false);

  const floating = focused || !!value;
  const borderColor = error
    ? '#EF4444'
    : focused
    ? '#0F2A6F' // dark blue on focus
    : '#D1D5DB';

  // Space reserved for the left icon + a little breathing room
  const labelLeft = iconLeft ? 40 : 12;
  const inputPaddingLeft = iconLeft ? 44 : 12;
  const inputPaddingRight = rightIcon ? 40 : 12;

  return (
    <View style={[styles.fInputContainer, { borderColor }]}>
      {/* Floating / Placeholder label (never overlaps icon) */}
      <Text
        style={[
          styles.fLabelBase,
          floating ? styles.fLabelFloat : styles.fLabelPlaceholder,
          { left: labelLeft },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>

      {/* Left icon */}
      {iconLeft ? (
        <View style={styles.fLeftIcon}>
          <Ionicons name={iconLeft} size={18} color="#9CA3AF" />
        </View>
      ) : null}

      {/* TextInput */}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={floating ? placeholder : ''} // only show placeholder when floated
        placeholderTextColor="#9CA3AF"
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.fTextInput,
          { paddingLeft: inputPaddingLeft, paddingRight: inputPaddingRight },
        ]}
      />

      {/* Right icon (e.g., eye toggle) */}
      {rightIcon ? <View style={styles.fRightIcon}>{rightIcon}</View> : null}

      {/* Error */}
      {error ? <Text style={styles.fError}>{error}</Text> : null}
    </View>
  );
}

export default function SignupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    getValues,
    watch,
  } = useForm<FormData>({
    defaultValues: { username: '', email: '', phone: '', password: '', confirmPassword: '' },
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [formError, setFormError] = useState('');
  const canSubmit = useMemo(() => !isSubmitting, [isSubmitting]);

  // keep confirm valid when password changes
  watch('password');

  const goLogin = () => router.replace('/(auth)/login');

  // Android hardware back -> go to login
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      goLogin();
      return true;
    });
    return () => sub.remove();
  }, []);

  const onSubmit = handleSubmit(async ({ username, email, phone, password }) => {
    setFormError('');
    try {
      await api.post('/diiwaan/users', {
        username: username.trim(),
        password,
        phone_number: phone.trim(),
        email: (email || '').trim() || null,
      });

      // Save prefill creds for login (independent of "Remember me")
      try {
        await Promise.allSettled([
          AsyncStorage.setItem(KEY_PREFILL_USERNAME, username.trim()),
          SecureStore.setItemAsync(KEY_PREFILL_PASSWORD, password),
        ]);
      } catch {}

      // Route to login immediately
      goLogin();
    } catch (e: any) {
      setFormError(e?.response?.data?.detail || e?.message || 'Signup failed.');
    }
  });

  return (
    <SafeAreaView style={styles.safeRoot} edges={['top', 'left', 'right']}>
      {/* HEADER — matches login sizing */}
      <View style={styles.headerWrap}>
        <LinearGradient
          colors={['#0B2447', '#0B2447']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.headerBg, { paddingTop: 10 + (insets.top ? 0 : 0) }]}
        >
          <View style={styles.headerRow}>
            {/* Back */}
            <TouchableOpacity
              onPress={goLogin}
              style={styles.backBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="arrow-back" size={20} color="#fff" />
            </TouchableOpacity>

            {/* Centered Logo + Title */}
            <View style={styles.centerHeader}>
              <View style={styles.logoWrap}>
                <Image source={LOGO} style={styles.logoImg} resizeMode="cover" />
              </View>
              <Text style={styles.brandTitle}>Diiwaan App</Text>
            </View>

            {/* spacer */}
            <View style={{ width: 32 }} />
          </View>
        </LinearGradient>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', default: 'height' })}
        style={styles.flex1}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
          <View style={styles.form}>
            {/* Centered screen title */}
            <Text style={styles.screenTitleCentered}>Sameyso Account</Text>

            {/* Username */}
            <Controller
              control={control}
              name="username"
              rules={{
                required: 'Username required',
                minLength: { value: 3, message: 'Min 3 characters' },
              }}
              render={({ field: { onChange, value } }) => (
                <FloatingInput
                  label="Username"
                  value={value}
                  onChangeText={onChange}
                  autoCapitalize="none"
                  iconLeft="person-outline"
                  error={errors.username?.message}
                />
              )}
            />

            {/* Email (full row) */}
            <Controller
              control={control}
              name="email"
              rules={{
                validate: (v) =>
                  !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'Please enter a valid email',
              }}
              render={({ field: { onChange, value } }) => (
                <FloatingInput
                  label="Email (optional)"
                  value={value || ''}
                  onChangeText={onChange}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  iconLeft="mail-outline"
                  error={errors.email?.message}
                />
              )}
            />

            {/* Phone Number (full row) */}
            <Controller
              control={control}
              name="phone"
              rules={{
                required: 'Phone number required',
                minLength: { value: 6, message: 'Too short' },
              }}
              render={({ field: { onChange, value } }) => (
                <FloatingInput
                  label="Phone Number"
                  value={value}
                  onChangeText={onChange}
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                  iconLeft="call-outline"
                  error={errors.phone?.message}
                />
              )}
            />

            {/* Password (own row) */}
            <Controller
              control={control}
              name="password"
              rules={{ required: 'Password required', minLength: { value: 6, message: 'Min 6 characters' } }}
              render={({ field: { onChange, value } }) => (
                <FloatingInput
                  label="Password"
                  value={value}
                  onChangeText={onChange}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  iconLeft="lock-closed-outline"
                  rightIcon={
                    <TouchableOpacity onPress={() => setShowPassword((v) => !v)}>
                      <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={19} color="#9CA3AF" />
                    </TouchableOpacity>
                  }
                  error={errors.password?.message}
                />
              )}
            />

            {/* Confirm Password (own row) */}
            <Controller
              control={control}
              name="confirmPassword"
              rules={{
                required: 'Please confirm your password',
                validate: (v) => v === getValues('password') || 'Passwords do not match',
              }}
              render={({ field: { onChange, value } }) => (
                <FloatingInput
                  label="Confirm Password"
                  value={value}
                  onChangeText={onChange}
                  secureTextEntry={!showConfirm}
                  autoCapitalize="none"
                  iconLeft="lock-closed-outline"
                  rightIcon={
                    <TouchableOpacity onPress={() => setShowConfirm((v) => !v)}>
                      <Ionicons name={showConfirm ? 'eye-off' : 'eye'} size={19} color="#9CA3AF" />
                    </TouchableOpacity>
                  }
                  error={errors.confirmPassword?.message}
                />
              )}
            />

            {formError ? <Text style={styles.formError}>{formError}</Text> : null}

            <Button
              title={isSubmitting ? 'Sameynaya…' : 'Sameyso Account'}
              onPress={onSubmit}
              loading={isSubmitting}
              style={styles.primaryBtn}
              disabled={!canSubmit}
            />

            <TouchableOpacity style={{ alignItems: 'center', marginTop: 12 }} onPress={goLogin}>
              <Text style={{ color: Colors.light.primary, fontWeight: '700', fontFamily: FONT }}>
                Already have an account? Log In
              </Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 12 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeRoot: { flex: 1, backgroundColor: Colors.light.background },
  flex1: { flex: 1 },

  /* Header (mirror login) */
  headerWrap: {
    overflow: 'hidden',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    backgroundColor: '#0B2447',
  },
  headerBg: { paddingTop: 10, paddingBottom: 12, paddingHorizontal: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
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
  centerHeader: { alignItems: 'center', justifyContent: 'center' },
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
  scrollContainer: { padding: 24, paddingTop: 16, flexGrow: 1 },
  form: { marginTop: 4 },

  screenTitleCentered: {
    color: '#0B1220',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 12,
    textAlign: 'center',
    fontFamily: FONT,
  },

  /* FloatingInput styles */
  fInputContainer: {
    borderWidth: 1.25,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
    position: 'relative',
  },
  fLabelBase: {
    position: 'absolute',
    zIndex: 2,
    paddingHorizontal: 6,
    fontFamily: FONT,
  },
  // Big placeholder style (grey, vertically centered)
  fLabelPlaceholder: {
    top: 14,
    fontSize: 14,
    color: '#9CA3AF',
    backgroundColor: 'transparent',
    fontWeight: '600',
  },
  // Floated chip style
  fLabelFloat: {
    top: -9,
    fontSize: 12,
    color: '#6B7280',
    backgroundColor: '#FFFFFF',
    fontWeight: '700',
  },
  fTextInput: {
    minHeight: 48,
    fontSize: 16,
    color: '#111827',
    fontFamily: FONT,
  },
  fLeftIcon: {
    position: 'absolute',
    left: 12,
    top: 14,
    zIndex: 2,
  },
  fRightIcon: {
    position: 'absolute',
    right: 8,
    top: 10,
    height: 28,
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  fError: {
    color: '#B00020',
    marginTop: 6,
    marginLeft: 4,
    fontSize: 12,
    fontFamily: FONT,
  },

  /* Rows (two per row) — not used for passwords anymore but kept if needed elsewhere */
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  col: {
    flex: 1,
  },

  primaryBtn: { backgroundColor: Colors.light.primary, marginTop: 6 },
  formError: { color: '#B00020', textAlign: 'center', marginBottom: 8, fontFamily: FONT },
});
