// File: screens/ForgetPassword.tsx
import axios from 'axios';
import { useRouter } from 'expo-router';
import { X } from "lucide-react-native";
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

export default function ForgetPassword() {
  const router = useRouter();
  const [visible, setVisible] = useState(true);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Close modal and go back to Login
  const handleClose = () => {
    setVisible(false);
    router.replace('/login');
  };

  const handleSubmit = async () => {
    if (!email) {
      setError('Please enter your email');
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      const { data } = await axios.post(
        'https://api.luneksa.com/auth/forgot-password',
        { email }
      );
      setMessage(data.message || 'Reset link sent successfully');
    } catch (err: any) {
      setError(
        err.response?.data?.detail ||
          'Failed to send reset link. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <View style={styles.overlay}>
          <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Reset Password</Text>
              <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                <X size={24} color="#4B5563" />
              </TouchableOpacity>
            </View>

            {/* Body */}
            <View style={styles.form}>
              {message ? (
                <View style={styles.successMessage}>
                  <Text style={styles.successText}>{message}</Text>
                </View>
              ) : (
                <>
                  {error ? (
                    <View style={styles.errorMessage}>
                      <Text style={styles.errorText}>{error}</Text>
                    </View>
                  ) : null}

                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>Email Address</Text>
                    <TextInput
                      style={styles.input}
                      value={email}
                      onChangeText={setEmail}
                      placeholder="you@example.com"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="done"
                      onSubmitEditing={handleSubmit}
                    />
                  </View>

                  <TouchableOpacity
                    style={[styles.button, isLoading && styles.buttonDisabled]}
                    onPress={handleSubmit}
                    disabled={isLoading}
                    activeOpacity={0.8}
                  >
                    {isLoading ? (
                      <ActivityIndicator color="#FFF" />
                    ) : (
                      <Text style={styles.buttonText}>Send Reset Link</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardAvoidingView: { flex: 1 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: 'white',
    borderRadius: 16,
    overflow: 'hidden',
  },
  header: {
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#374151',
    fontFamily: 'Inter-SemiBold',
  },
  closeButton: {
    position: 'absolute',
    right: 24,
  },
  form: { padding: 24 },
  inputContainer: { marginBottom: 20 },
  label: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 8,
    fontFamily: 'Inter-Medium',
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    color: '#111827',
    fontFamily: 'Inter-Regular',
  },
  button: {
    backgroundColor: '#001F54', // dark blue
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
    fontFamily: 'Inter-Medium',
  },
  errorMessage: {
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  successMessage: {
    backgroundColor: '#D1FAE5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  successText: {
    color: '#065F46',
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
});
