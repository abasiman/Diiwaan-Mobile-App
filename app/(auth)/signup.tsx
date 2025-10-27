import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  BackHandler,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { FormInput } from '@/components/FormInput';
import { Colors } from '@/constants/Colors';
import api from '@/services/api';

type FormData = {
  username: string;
  phone: string;
  password: string;
  confirmPassword: string;
};

const OWNER_WHATSAPP = '+6282123060971'; // optional local fallback
const MONTHLY_FEE_NUMBER = '0617259034';

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
    defaultValues: { username: '', phone: '', password: '', confirmPassword: '' },
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [formError, setFormError] = useState('');
  const [successModal, setSuccessModal] = useState(false);
  const canSubmit = useMemo(() => !isSubmitting, [isSubmitting]);

  // keep confirm valid when password changes
  watch('password');

  const goLogin = () => router.replace('/(auth)/login');

  // Handle Android hardware back -> go to login
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      goLogin();
      return true; // prevent default
    });
    return () => sub.remove();
  }, []);

  // Optional local WA fallback (not required since backend already notifies)
  const openWhatsAppToOwner = async (username: string, phone: string) => {
    try {
      const msg = encodeURIComponent(`Diiwaan signup:\n- Username: ${username}\n- Phone: ${phone}`);
      const digits = OWNER_WHATSAPP.replace(/\D/g, '');
      const deepLink = `whatsapp://send?phone=${digits}&text=${msg}`;
      const webLink = `https://wa.me/${digits}?text=${msg}`;
      const supported = await Linking.canOpenURL('whatsapp://send');
      if (supported) await Linking.openURL(deepLink);
      else await Linking.openURL(webLink);
    } catch {
      // Silent fail
    }
  };

  const onSubmit = handleSubmit(async ({ username, phone, password }) => {
    setFormError('');
    try {
      // Public signup: no auth header
      await api.post('/diiwaan/users', {
        username: username.trim(),
        password,
        phone_number: phone.trim(),
      });

      setSuccessModal(true);
      // Optional: also ping WA app locally if you want
      // void openWhatsAppToOwner(username.trim(), phone.trim());
    } catch (e: any) {
      setFormError(e?.response?.data?.detail || e?.message || 'Signup failed.');
    }
  });

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', default: 'height' })}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Page Header */}
        <View style={styles.header}>
          <LinearGradient
            colors={['#0B2447', '#0B2447']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.headerBg, { paddingTop: insets.top + 12 }]} // safe-area top padding
          >
            <View style={[styles.headerInner, { marginTop: 8 }]}>
              {/* Back arrow -> login */}
              <TouchableOpacity
                onPress={goLogin}
                style={styles.backBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="arrow-back" size={20} color="#fff" />
              </TouchableOpacity>

              <View style={styles.headerCenter}>
                <View style={styles.headerIconWrap}>
                  <Ionicons name="person-add-outline" size={24} color="#BFD2FF" />
                </View>
                <Text style={styles.headerTitle}>Create Account</Text>
                <Text style={styles.headerSubtitle}>Is diiwaan geli</Text>
              </View>

              {/* spacer to balance back button */}
              <View style={{ width: 32 }} />
            </View>
          </LinearGradient>
        </View>

        <View style={styles.form}>
          {/* Username */}
          <Controller
            control={control}
            name="username"
            rules={{ required: 'Username required', minLength: { value: 3, message: 'Min 3 chars' } }}
            render={({ field: { onChange, value} }) => (
              <FormInput
                label="Username"
                placeholder="username"
                value={value}
                placeholderTextColor="#888"
                onChangeText={onChange}
                error={errors.username?.message}
                icon="person-outline"
                containerStyle={styles.input}
                autoCapitalize="none"
              />
            )}
          />

          {/* Phone number */}
          <Controller
            control={control}
            name="phone"
            rules={{
              required: 'Phone number required',
              minLength: { value: 6, message: 'Too short' },
            }}
            render={({ field: { onChange, value } }) => (
              <FormInput
                label="Phone Number"
                placeholder="phone number"
                value={value}
                onChangeText={onChange}
                placeholderTextColor="#888"
                error={errors.phone?.message}
                keyboardType="phone-pad"
                autoCapitalize="none"
                icon="call-outline"
                containerStyle={styles.input}
              />
            )}
          />

          {/* Password */}
          <Controller
            control={control}
            name="password"
            rules={{ required: 'Password required', minLength: { value: 6, message: 'Min 6 chars' } }}
            render={({ field: { onChange, value } }) => (
              <FormInput
                label="Password"
                placeholder="••••••"
                secureTextEntry={!showPassword}
                value={value}
                placeholderTextColor="#888"
                onChangeText={onChange}
                error={errors.password?.message}
                icon="lock-closed-outline"
                rightIcon={
                  <TouchableOpacity onPress={() => setShowPassword((v) => !v)}>
                    <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color="#888" />
                  </TouchableOpacity>
                }
                containerStyle={styles.input}
              />
            )}
          />

          {/* Confirm Password */}
          <Controller
            control={control}
            name="confirmPassword"
            rules={{
              required: 'Please confirm your password',
              validate: (v) => v === getValues('password') || 'Passwords do not match',
            }}
            render={({ field: { onChange, value } }) => (
              <FormInput
                label="Confirm Password"
                placeholder="••••••"
                secureTextEntry={!showConfirm}
                value={value}
                placeholderTextColor="#888"
                onChangeText={onChange}
                error={errors.confirmPassword?.message}
                icon="lock-closed-outline"
                rightIcon={
                  <TouchableOpacity onPress={() => setShowConfirm((v) => !v)}>
                    <Ionicons name={showConfirm ? 'eye-off' : 'eye'} size={20} color="#888" />
                  </TouchableOpacity>
                }
                containerStyle={styles.input}
              />
            )}
          />

          {formError ? <Text style={styles.error}>{formError}</Text> : null}

          <Button
            title={isSubmitting ? 'Creating…' : 'Create Account'}
            onPress={onSubmit}
            loading={isSubmitting}
            style={styles.primaryBtn}
            disabled={!canSubmit}
          />

          <TouchableOpacity
            style={{ alignItems: 'center', marginTop: 12 }}
            onPress={goLogin}
          >
            <Text style={{ color: Colors.light.primary, fontWeight: '600' }}>
              Already have an account? Log In
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Success / Payment Modal */}
      <Modal
        visible={successModal}
        transparent
        animationType="fade"
        onRequestClose={() => setSuccessModal(false)}
      >
        <View style={styles.backdrop} />
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            {/* Small gradient header like login */}
            <LinearGradient
              colors={['#0B2447', '#0B2447']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.modalHeader, { paddingTop: 12 + insets.top * 0 }]}
            >
              <View style={styles.modalHeaderInner}>
                <View style={styles.modalHeaderIconWrap}>
                  <Ionicons name="checkmark-circle-outline" size={26} color="#CFE0FF" />
                </View>
                <Text style={styles.modalHeaderTitle}>Account-ka waa sameysatay</Text>
              </View>
            </LinearGradient>

            {/* Body */}
            <View style={styles.modalBody}>
              <Text style={styles.modalText}>
                Fadlan bixi <Text style={styles.bold}>$4</Text> bishii adigoo u diraya:{' '}
                <Text style={styles.bold}>{MONTHLY_FEE_NUMBER}</Text>.
              </Text>
              <Text style={[styles.modalText, { marginTop: 8 }]}>
                Markaad diyaar noqoto, taabo <Text style={styles.bold}>"Gal"</Text>.
              </Text>

              <Button title="Gal" onPress={goLogin} style={styles.modalPrimaryBtn} />

              <TouchableOpacity onPress={goLogin} style={{ marginTop: 10, alignItems: 'center' }}>
                <Text style={{ color: Colors.light.gray700, fontWeight: '700' }}>Back to Login</Text>
              </TouchableOpacity>

              {/* Optional: manual WhatsApp button
              <Button
                title="Notify via WhatsApp"
                onPress={() => openWhatsAppToOwner(getValues('username').trim(), getValues('phone').trim())}
                style={{ marginTop: 10 }}
              /> */}
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  scroll: { flexGrow: 1, paddingBottom: 20 },

  /* Page Header */
  header: {
    overflow: 'hidden',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    backgroundColor: '#0B2447',
  },
  headerBg: { paddingBottom: 16, paddingHorizontal: 16 },
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
  headerCenter: { alignItems: 'center', justifyContent: 'center' },
  headerIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#0D2A56',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '900', letterSpacing: 0.2 },
  headerSubtitle: { color: '#D7E2FF', fontSize: 12, marginTop: 4, fontWeight: '600' },

  /* Form */
  form: { paddingHorizontal: 24, marginTop: 16, marginBottom: 16 },
  input: { marginBottom: 16 },

  primaryBtn: { backgroundColor: Colors.light.primary },

  error: { color: '#B00020', textAlign: 'center', marginBottom: 12 },

  /* Modal */
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  modalWrap: { ...StyleSheet.absoluteFillObject, padding: 20, alignItems: 'center', justifyContent: 'center' },
  modalCard: {
    width: '100%',
    maxWidth: 600,
    backgroundColor: '#fff',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.12, shadowOffset: { width: 0, height: 10 }, shadowRadius: 18 },
      android: { elevation: 10 },
    }),
  },

  // Modal header
  modalHeader: { paddingTop: 12, paddingBottom: 12, paddingHorizontal: 14 },
  modalHeaderInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modalHeaderIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#0D2A56',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeaderTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '900', letterSpacing: 0.2 },

  // Modal body
  modalBody: { paddingHorizontal: 18, paddingVertical: 16 },
  modalText: { color: '#111827', fontSize: 14, textAlign: 'center', lineHeight: 22 },
  bold: { fontWeight: '900' },
  modalPrimaryBtn: { marginTop: 16, backgroundColor: Colors.light.primary },
});
