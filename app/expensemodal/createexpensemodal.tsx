// app/DiiwaanExpenses/createexpensemodal.tsx
import { AntDesign } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import dayjs from 'dayjs';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Easing,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';

import api from '@/services/api';
import { useAuth } from '@/src/context/AuthContext';

const BRAND_BLUE = '#0B2447';
const BRAND_BLUE_2 = '#19376D';
const TEXT_MUTED = '#6B7280';
const TEXT_DARK = '#0F172A';
const BORDER = '#E5E7EB';
const BG_WHITE = '#FFFFFF';

type CreateExpenseModalProps = {
  visible: boolean;
  onClose: () => void;
  onCreated?: () => void;
};

/* ────────────────────────────────────────────────
   Floating frame (same idea as in oilmodal)
   Label sits on a chip inside the border & animates
──────────────────────────────────────────────── */
type FloatingFieldFrameProps = {
  label: string;
  active?: boolean;
  hasValue?: boolean;
  children: React.ReactNode;
  style?: any;
};

const FloatingFieldFrame: React.FC<FloatingFieldFrameProps> = ({
  label,
  active,
  hasValue,
  children,
  style,
}) => {
  const shouldFloat = !!active || !!hasValue;
  const anim = useRef(new Animated.Value(shouldFloat ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: shouldFloat ? 1 : 0,
      duration: 140,
      useNativeDriver: false,
      easing: Easing.out(Easing.quad),
    }).start();
  }, [shouldFloat]);

  const borderColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [BORDER, BRAND_BLUE],
  });

  const labelTop = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [14, -8],
  });

  const labelScale = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.88],
  });

  const labelColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [TEXT_MUTED, TEXT_DARK],
  });

  return (
    <Animated.View style={[styles.field, { borderColor }, style]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.floatingChip,
          {
            top: labelTop,
            transform: [{ scale: labelScale }],
          },
        ]}
      >
        <Animated.Text style={[styles.floatingText, { color: labelColor }]}>
          {label}
        </Animated.Text>
      </Animated.View>

      <View style={[styles.innerPad, styles.control]}>{children}</View>
    </Animated.View>
  );
};

/* ────────────────────────────────────────────────
   Floating TextInput (chip label inside border)
──────────────────────────────────────────────── */
type FloatingLabelInputProps = {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad';
  multiline?: boolean;
  numberOfLines?: number;
};

const FloatingLabelInput: React.FC<FloatingLabelInputProps> = ({
  label,
  value,
  onChangeText,
  keyboardType = 'default',
  multiline = false,
  numberOfLines = 1,
}) => {
  const [focused, setFocused] = useState(false);

  return (
    <FloatingFieldFrame
      label={label}
      active={focused}
      hasValue={!!value && value.length > 0}
    >
      <TextInput
        style={[
          styles.textInput,
          multiline && {
            height: numberOfLines * 22 + 10,
            textAlignVertical: 'top',
          },
        ]}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="" // we use the chip instead
        keyboardType={keyboardType}
        multiline={multiline}
        selectionColor={BRAND_BLUE}
      />
    </FloatingFieldFrame>
  );
};

const CreateExpenseModal: React.FC<CreateExpenseModalProps> = ({
  visible,
  onClose,
  onCreated,
}) => {
  const { token } = useAuth();

  const [expenseCategory, setExpenseCategory] = useState('');
  const [expenseName, setExpenseName] = useState('');
  const [payee, setPayee] = useState('');
  const [amount, setAmount] = useState('');
  const [paid, setPaid] = useState('');
  const [expenseDate, setExpenseDate] = useState<Date | null>(new Date());

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setExpenseCategory('');
    setExpenseName('');
    setPayee('');
    setAmount('');
    setPaid('');
    setExpenseDate(new Date());
  };

  const handleDateChange = (_: any, date?: Date) => {
    setShowDatePicker(false);
    if (date) {
      setExpenseDate(date);
    }
  };

  const handleSubmit = async () => {
    if (!token) {
      Alert.alert('Not logged in', 'Please log in to create expenses.');
      return;
    }

    const amt = parseFloat(amount.replace(',', '.'));
    const paidVal =
      paid.trim() === '' ? 0 : parseFloat(paid.replace(',', '.'));

    if (!expenseName.trim()) {
      Alert.alert('Missing name', 'Please enter an expense name.');
      return;
    }

    if (isNaN(amt) || amt < 0) {
      Alert.alert('Invalid amount', 'Please enter a valid amount.');
      return;
    }

    if (isNaN(paidVal) || paidVal < 0) {
      Alert.alert('Invalid paid amount', 'Paid cannot be negative.');
      return;
    }

    if (paidVal > amt) {
      Alert.alert(
        'Invalid paid amount',
        'Paid amount cannot be greater than the total amount.'
      );
      return;
    }

    const payload: any = {
      expense_category: expenseCategory.trim() || null,
      expense_name: expenseName.trim(),
      payee: payee.trim() || null,
      amount: amt,
      paid: paidVal,
    };

    if (expenseDate) {
      payload.expense_date = expenseDate.toISOString();
    }

    setSubmitting(true);
    try {
      await api.post('/diiwaan_expenses/', payload, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      Alert.alert('Success', 'Expense created successfully.');
      resetForm();
      onClose();
      onCreated?.();
    } catch (err: any) {
      console.error('Create expense failed', err);
      Alert.alert(
        'Error',
        err?.response?.data?.detail ??
          'Failed to create expense. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      <View style={styles.modalContainer}>
        <View style={styles.card}>
          <Text style={styles.title}>New Expense</Text>
          <Text style={styles.subtitle}>
            Quickly capture a new expense record.
          </Text>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 8 }}
          >
            <FloatingLabelInput
              label="Category (e.g. Food, Rent, Fuel)"
              value={expenseCategory}
              onChangeText={setExpenseCategory}
            />

            <FloatingLabelInput
              label="Expense name *"
              value={expenseName}
              onChangeText={setExpenseName}
            />

            <FloatingLabelInput
              label="Payee (optional)"
              value={payee}
              onChangeText={setPayee}
            />

            {/* Date selector using floating chip style */}
            <FloatingFieldFrame
              label="Date"
              active={showDatePicker}
              hasValue={!!expenseDate}
            >
              <TouchableOpacity
                style={styles.dateRow}
                onPress={() => setShowDatePicker(true)}
                activeOpacity={0.9}
              >
                <AntDesign name="calendar" size={16} color={TEXT_MUTED} />
                <Text style={styles.dateText}>
                  {expenseDate
                    ? dayjs(expenseDate).format('DD MMM YYYY')
                    : 'Select date'}
                </Text>
              </TouchableOpacity>
            </FloatingFieldFrame>

            <FloatingLabelInput
              label="Total amount"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
            />

            <FloatingLabelInput
              label="Paid now (leave 0 for full credit)"
              value={paid}
              onChangeText={setPaid}
              keyboardType="decimal-pad"
            />
          </ScrollView>

          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                resetForm();
                onClose();
              }}
              disabled={submitting}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={BG_WHITE} />
              ) : (
                <Text style={styles.submitText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {showDatePicker && (
          <DateTimePicker
            value={expenseDate ?? new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={handleDateChange}
          />
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  modalContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  card: {
    backgroundColor: BG_WHITE,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: TEXT_DARK,
  },
  subtitle: {
    fontSize: 12,
    color: TEXT_MUTED,
    marginTop: 4,
    marginBottom: 10,
  },

  /* Floating chip field */
  field: {
    marginTop: 10,
    borderWidth: 1.2,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
  },
  control: {
    minHeight: 44,
    justifyContent: 'center',
  },
  innerPad: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  floatingChip: {
    position: 'absolute',
    left: 12,
    paddingHorizontal: 6,
    backgroundColor: BG_WHITE,
  },
  floatingText: {
    fontSize: 11,
    fontWeight: '700',
  },

  textInput: {
    fontSize: 14,
    color: TEXT_DARK,
    paddingVertical: 0,
  },

  /* Date row inside floating frame */
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateText: {
    fontSize: 14,
    color: TEXT_DARK,
  },

  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
    gap: 10,
  },
  cancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#F9FAFB',
  },
  cancelText: {
    fontSize: 13,
    color: TEXT_DARK,
  },
  submitButton: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: BRAND_BLUE,
  },
  submitText: {
    fontSize: 13,
    fontWeight: '700',
    color: BG_WHITE,
  },
});

export default CreateExpenseModal;
