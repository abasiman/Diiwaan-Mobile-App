// components/CreateCustomerModal.tsx
import api from '@/services/api';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

const BRAND_BLUE = '#0B2447';
const ACCENT = '#576CBC';
const TEXT = '#0B1220';
const MUTED = '#6B7280';
const BORDER = '#E5E7EB';

export type CustomerPayload = {
  name: string;
  phone?: string | null;
  address?: string | null;
  status?: 'active' | 'inactive';
};

export type CustomerModel = {
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

type Props = {
  /** Show/hide modal */
  visible: boolean;
  /** 'add' for create, 'edit' for update */
  mode: 'add' | 'edit';
  /** If editing, pass the selected customer */
  customer?: CustomerModel | null;
  /** Optional token (if you set headers here); otherwise api can already inject auth */
  token?: string | null;

  /** Called after successful create/update */
  onSaved?: (createdOrUpdated?: CustomerModel) => void;
  /** Called when user closes without saving */
  onClose?: () => void;
};

export default function CreateCustomerModal({
  visible,
  mode,
  customer,
  token,
  onSaved,
  onClose,
}: Props) {
  // Form state
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [submitting, setSubmitting] = useState(false);

  // Slide-up animation (nice-on-open)
  const slideY = useRef(new Animated.Value(40)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // seed from customer (for edit) or defaults (for add)
      if (mode === 'edit' && customer) {
        setName(customer.name || '');
        setPhone(customer.phone || '');
        setAddress(customer.address || '');
        setStatus((customer.status as 'active' | 'inactive') || 'active');
      } else {
        setName('');
        setPhone('');
        setAddress('');
        setStatus('active');
      }

      // animate open
      Animated.parallel([
        Animated.timing(slideY, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    } else {
      // reset animation
      slideY.setValue(40);
      fade.setValue(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, mode, customer?.id]);

  const headerTitle = useMemo(
    () => (mode === 'add' ? 'Ku dar Macaamiil' : 'Wax ka beddel Macaamiil'),
    [mode]
  );

  const handleSubmit = async () => {
    if (!name.trim()) {
      return Alert.alert('Xog maqan', 'Fadlan geli magaca macaamiilka.');
    }

    const payload: CustomerPayload = {
      name: name.trim(),
      phone: phone.trim() || null,
      address: address.trim() || null,
      status,
    };

    setSubmitting(true);
    try {
      let res;
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

      if (mode === 'add') {
        res = await api.post('/diiwaancustomers', payload, { headers });
      } else {
        if (!customer?.id) throw new Error('Customer not provided for edit.');
        res = await api.patch(`/diiwaancustomers/${customer.id}`, payload, { headers });
      }

      const saved = res?.data as CustomerModel | undefined;
      onSaved?.(saved);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Operation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Animated.View
        style={[
          styles.backdrop,
          { opacity: fade },
        ]}
      >
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
      </Animated.View>

      {/* Card */}
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', android: 'height' })}
        keyboardVerticalOffset={Platform.select({ ios: 12, android: 0 })}
        style={StyleSheet.absoluteFill}
      >
        <View style={styles.centerWrap}>
          <Animated.View
            style={[
              styles.card,
              {
                transform: [{ translateY: slideY }],
                opacity: fade,
              },
            ]}
          >
            <View style={styles.headerRow}>
              <Text style={styles.title}>{headerTitle}</Text>
            </View>

            <ScrollView
              contentContainerStyle={{ paddingBottom: 12, paddingTop: 4 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
              style={{ maxHeight: 460 }}
            >
              {/* Name */}
              <View style={styles.formRow}>
                <Text style={styles.label}>Magaca</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Magaca macaamiilka"
                  placeholderTextColor="#9CA3AF"
                  style={styles.input}
                  returnKeyType="next"
                />
              </View>

              {/* Phone */}
              <View style={styles.formRow}>
                <Text style={styles.label}>Phone</Text>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="(+252) 61 234 5678"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="phone-pad"
                  style={styles.input}
                  returnKeyType="next"
                />
              </View>

              {/* Address */}
              <View style={styles.formRow}>
                <Text style={styles.label}>Address</Text>
                <TextInput
                  value={address}
                  onChangeText={setAddress}
                  placeholder="Degmada, xaafadda…"
                  placeholderTextColor="#9CA3AF"
                  style={[styles.input, { height: 100, textAlignVertical: 'top', paddingTop: 12 }]}
                  multiline
                  returnKeyType="done"
                />
              </View>

              {/* Status */}
              <View style={[styles.formRow, { marginTop: 4 }]}>
                <Text style={styles.label}>Status</Text>
                <View style={styles.segment}>
                  <TouchableOpacity
                    style={[styles.segmentBtn, status === 'active' && styles.segmentBtnActive]}
                    onPress={() => setStatus('active')}
                    activeOpacity={0.9}
                  >
                    <Text
                      style={[
                        styles.segmentTxt,
                        status === 'active' && styles.segmentTxtActive,
                      ]}
                    >
                      Active
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.segmentBtn, status === 'inactive' && styles.segmentBtnActive]}
                    onPress={() => setStatus('inactive')}
                    activeOpacity={0.9}
                  >
                    <Text
                      style={[
                        styles.segmentTxt,
                        status === 'inactive' && styles.segmentTxtActive,
                      ]}
                    >
                      Inactive
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>

            {/* Actions */}
            <View style={styles.actionsRow}>
              <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={onClose} disabled={submitting}>
                <Text style={[styles.btnTxt, { color: TEXT }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, submitting && { opacity: 0.6 }]}
                onPress={handleSubmit}
                disabled={submitting}
                activeOpacity={0.9}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnTxt}>{mode === 'add' ? 'Save' : 'Update'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  centerWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EEF1F6',
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  headerRow: { marginBottom: 8, alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '900', color: TEXT },

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

  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    padding: 4,
    gap: 6,
  },
  segmentBtn: {
    flex: 1,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: ACCENT,
  },
  segmentTxt: { color: MUTED, fontWeight: '800' },
  segmentTxtActive: { color: '#fff' },

  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  btn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: BORDER },
  btnTxt: { color: '#fff', fontWeight: '900' },
});
