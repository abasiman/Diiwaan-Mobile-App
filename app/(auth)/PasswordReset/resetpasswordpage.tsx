import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Linking,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import axios from 'axios';

const ResetPasswordScreen = () => {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  // Handle deep link to get token
  useEffect(() => {
    const getTokenFromURL = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        const tokenParam = extractTokenFromURL(initialUrl);
        if (tokenParam) {
          setToken(tokenParam);
        } else {
          setError('Reset token missing. Please use the link we emailed you.');
        }
      }
    };

    getTokenFromURL();

    const linkingListener = Linking.addEventListener('url', ({ url }) => {
      const tokenParam = extractTokenFromURL(url);
      if (tokenParam) {
        setToken(tokenParam);
      }
    });

    return () => linkingListener.remove();
  }, []);

  const extractTokenFromURL = (url: string) => {
    // Match token in URLs like: appname://reset-password?token=abc123
    const match = url.match(/[&?]token=([^&]+)/);
    return match ? match[1] : null;
  };

  const handleSubmit = async () => {
    setError('');
    setMessage('');

    if (!token) {
      setError('No reset token available.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setIsLoading(true);
    try {
      const { data } = await axios.post('https://api.luneksa.com/auth/reset-password', {
        token,
        new_password: newPassword,
      });
      
      setMessage(data.message || 'Password reset successfully!');
      Alert.alert('Success', 'Password reset successfully!', [
        { text: 'OK', onPress: () => router.push('/login') }
      ]);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to reset password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.innerContainer}>
        <Text style={styles.title}>Choose a New Password</Text>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {message ? (
          <View style={styles.successBox}>
            <Text style={styles.successText}>{message}</Text>
          </View>
        ) : null}

        <View style={styles.inputGroup}>
          <Text style={styles.label}>New Password</Text>
          <View style={styles.passwordInputContainer}>
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry={!passwordVisible}
              placeholder="At least 8 characters"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.visibilityToggle}
              onPress={() => setPasswordVisible(!passwordVisible)}
            >
              <Text style={styles.visibilityText}>
                {passwordVisible ? 'Hide' : 'Show'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Confirm Password</Text>
          <TextInput
            style={styles.input}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!passwordVisible}
            placeholder="Confirm your password"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <TouchableOpacity
          style={[styles.button, (isLoading || message) && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={isLoading || !!message}
          activeOpacity={0.8}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.buttonText}>Reset Password</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  innerContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 32,
    fontFamily: 'Inter-SemiBold',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 8,
    fontFamily: 'Inter-Medium',
  },
  input: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    color: '#111827',
    fontFamily: 'Inter-Regular',
  },
  passwordInputContainer: {
    position: 'relative',
  },
  visibilityToggle: {
    position: 'absolute',
    right: 16,
    top: 16,
  },
  visibilityText: {
    color: '#6B7280',
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  button: {
    backgroundColor: '#4F46E5',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Inter-SemiBold',
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  successBox: {
    backgroundColor: '#D1FAE5',
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
  },
  successText: {
    color: '#065F46',
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
});

export default ResetPasswordScreen;