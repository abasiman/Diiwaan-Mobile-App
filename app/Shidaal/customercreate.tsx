// app/(tabs)/customercreate.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type Mode = 'add' | 'edit';

type InitialValues = {
  name?: string | null;
  phone?: string | null;
  address?: string | null;
};

type SubmitPayload = {
  name: string;
  phone: string | null;
  address: string | null;
};

type Props = {
  visible: boolean;
  mode?: Mode;                        // default 'add'
  initial?: InitialValues;            // prefill when editing
  submitting?: boolean;               // spinner state
  onClose: () => void;                // cancel/close
  onSubmit: (payload: SubmitPayload) => void | Promise<void>;
};

const BRAND_BLUE = '#0B2447';
const ACCENT = '#576CBC';
const BG = '#F7F9FC';
const TEXT = '#0B1220';
const MUTED = '#6B7280';
const BORDER = '#E5E7EB';

const { height: SCREEN_H } = Dimensions.get('window');
const TOP_GAP = 80;
const SHEET_H = Math.min(SCREEN_H - TOP_GAP, SCREEN_H * 0.9);

export default function CustomerCreateModal({
  visible,
  mode = 'add',
  initial,
  submitting = false,
  onClose,
  onSubmit,
}: Props) {
  // Form state (mirrors existing design & fields)
  const [formName, setFormName] = useState(initial?.name || '');
  const [formPhone, setFormPhone] = useState(initial?.phone || '');
  const [formAddress, setFormAddress] = useState(initial?.address || '');

  // Keep fields in sync when switching from add→edit with fresh initial
  useEffect(() => {
    if (visible) {
      setFormName(initial?.name || '');
      setFormPhone(initial?.phone || '');
      setFormAddress(initial?.address || '');
    }
  }, [visible, initial?.name, initial?.phone, initial?.address]);

  // Bottom-sheet animation (identical motion profile)
  const addY = useRef(new Animated.Value(SCREEN_H)).current;
  const openSheet = () => {
    Animated.timing(addY, {
      toValue: SCREEN_H - SHEET_H,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  };
  const closeSheet = (cb?: () => void) => {
    Animated.timing(addY, {
      toValue: SCREEN_H,
      duration: 240,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && cb) cb();
    });
  };

  // Open/close when visibility changes
  useEffect(() => {
    if (visible) openSheet();
    else addY.setValue(SCREEN_H);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const formScrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    if (visible) {
      requestAnimationFrame(() =>
        formScrollRef.current?.scrollTo({ y: 0, animated: false })
      );
    }
  }, [visible]);

  const title = useMemo(
    () => (mode === 'add' ? 'Add macaamiil' : 'Edit macaamiil'),
    [mode]
  );

  const handleCancel = () => {
    closeSheet(onClose);
  };

  const handleSave = () => {
    const payload: SubmitPayload = {
      name: formName.trim(),
      phone: formPhone.trim() ? formPhone.trim() : null,
      address: formAddress.trim() ? formAddress.trim() : null,
    };
    onSubmit(payload);
  };

  if (!visible) return null;

  return (
    <>
      {/* Backdrop (same tone/opacity) */}
      <View style={styles.backdrop}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={handleCancel} />
      </View>

      {/* Add/Edit Bottom Sheet (scrollable) — exact style */}
      <Animated.View style={[styles.sheet, { height: SHEET_H, top: addY }]}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>{title}</Text>

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
                onPress={handleCancel}
                disabled={submitting}
                activeOpacity={0.9}
              >
                <Text style={[styles.btnTxt, { color: TEXT }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btn, submitting ? { opacity: 0.6 } : null]}
                onPress={handleSave}
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
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  // Backdrop identical to list screen
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 10,
    elevation: 10,
  },

  // Sheet base — copied for exact design
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
  btnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: BORDER },
  btnTxt: { color: '#fff', fontWeight: '800' },
});
