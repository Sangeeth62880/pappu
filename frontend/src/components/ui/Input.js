import React, { useState } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { colors, radius, spacing, typography } from '../../theme/tokens';

export default function Input({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  secureTextEntry = false,
  keyboardType = 'default',
  autoCapitalize = 'none',
  leadingIcon,
  trailingIcon,
  editable = true,
  style,
  inputStyle,
  testID = 'input',
  ...props
}) {
  const [isFocused, setIsFocused] = useState(false);
  const [isSecure, setIsSecure] = useState(secureTextEntry);

  const getBorderColor = () => {
    if (error) return colors.expense;
    if (isFocused) return colors.gold;
    return colors.border;
  };

  return (
    <View style={[styles.container, style]}>
      {label ? (
        <Text style={[styles.label, typography.body_secondary]}>{label}</Text>
      ) : null}

      <View
        style={[
          styles.inputContainer,
          {
            borderColor: getBorderColor(),
            backgroundColor: editable ? colors.surface : colors.bg,
          },
        ]}
      >
        {leadingIcon ? (
          <View style={styles.leadingIconContainer}>{leadingIcon}</View>
        ) : null}

        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.ink_muted}
          secureTextEntry={isSecure}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          editable={editable}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          style={[styles.input, typography.body_main, inputStyle]}
          {...props}
        />

        {secureTextEntry ? (
          <TouchableOpacity
            testID={`${testID}-toggle-secure`}
            onPress={() => setIsSecure(!isSecure)}
            style={styles.trailingIconContainer}
            accessibilityRole="button"
            accessibilityLabel={isSecure ? 'Show password' : 'Hide password'}
          >
            <MaterialIcons
              name={isSecure ? 'visibility' : 'visibility-off'}
              size={20}
              color={colors.ink_muted}
            />
          </TouchableOpacity>
        ) : trailingIcon ? (
          <View style={styles.trailingIconContainer}>{trailingIcon}</View>
        ) : null}
      </View>

      {error ? (
        <Text style={[styles.errorText, typography.caption_bold]} testID={`${testID}-error`}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginBottom: spacing.md,
  },
  label: {
    color: colors.ink,
    marginBottom: spacing.xs,
    fontFamily: 'Nunito_600SemiBold',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: radius.input,
    paddingHorizontal: spacing.md,
    minHeight: 52,
  },
  leadingIconContainer: {
    marginRight: spacing.sm,
  },
  trailingIconContainer: {
    marginLeft: spacing.sm,
    padding: 4,
  },
  input: {
    flex: 1,
    color: colors.ink,
    fontSize: 15,
    fontFamily: 'Nunito_600SemiBold',
    minHeight: 48,
    includeFontPadding: false,
  },
  errorText: {
    color: colors.expense,
    marginTop: 4,
    fontFamily: 'Nunito_700Bold',
  },
});
