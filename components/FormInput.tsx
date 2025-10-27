// components/FormInput.tsx
import React from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TextInputProps,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';

type Props = TextInputProps & {
  label: string;
  error?: string;
  containerStyle?: ViewStyle;
  inputStyle?: TextStyle;
  /**
   * If you pass a string here, it'll render that Ionicon on the left.
   * If you pass a ReactNode to `rightIcon`, it'll render it on the right.
   */
  iconName?: string;
  iconColor?: string;
  rightIcon?: React.ReactNode;
};

export function FormInput({
  label,
  error,
  containerStyle,
  inputStyle,
  iconName,
  iconColor = Colors.light.gray500,
  rightIcon,
  placeholderTextColor,
  ...rest
}: Props) {
  return (
    <View style={[styles.container, containerStyle]}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputWrapper, error && styles.inputWrapperError]}>
        {iconName && (
          <Ionicons
            name={iconName}
            size={20}
            color={iconColor}
            style={styles.leftIcon}
          />
        )}
        <TextInput
          style={[styles.input, inputStyle]}
          placeholderTextColor={placeholderTextColor}
          {...rest}
        />
        {rightIcon && <View style={styles.rightIcon}>{rightIcon}</View>}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    color: Colors.light.text,
    marginBottom: 4,
    fontSize: 14,
    fontWeight: '500',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.light.gray500,
    borderRadius: 6,
    backgroundColor: Colors.light.background,
  },
  inputWrapperError: {
    borderColor: Colors.light.danger,
  },
  leftIcon: {
    marginHorizontal: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 4,
    color: Colors.light.text,
  },
  rightIcon: {
    marginHorizontal: 8,
  },
  error: {
    color: Colors.light.danger,
    marginTop: 4,
    fontSize: 12,
  },
});
