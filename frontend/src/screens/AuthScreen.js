import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { signIn, signUp } from '../api/supabase';
import { colors, radius, shadows, spacing } from '../theme/tokens';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';

export default function AuthScreen({ onAuthenticated }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [focusedField, setFocusedField] = useState(null);

  const emailRef = useRef('');
  const passwordRef = useRef('');
  const nameRef = useRef('');

  const handleSubmit = async () => {
    const trimmedEmail = (emailRef.current || email || '').trim();
    const trimmedPassword = (passwordRef.current || password || '').trim();
    const trimmedName = (nameRef.current || name || '').trim();

    if (!trimmedEmail || !trimmedPassword) {
      setError('Please enter both email and password.');
      return;
    }

    if (isSignUp && !trimmedName) {
      setError('Please enter your name.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      if (isSignUp) {
        const res = await signUp({
          email: trimmedEmail,
          password: trimmedPassword,
          name: trimmedName,
          preferred_language: 'en',
        });
        if (res?.session) {
          onAuthenticated(res.session);
        } else {
          setLoading(false);
          setError('Sign up successful! Please check your email to confirm or sign in.');
        }
      } else {
        const res = await signIn({
          email: trimmedEmail,
          password: trimmedPassword,
        });
        if (res?.session) {
          onAuthenticated(res.session);
        } else {
          setLoading(false);
          setError('Failed to obtain session. Please try again.');
        }
      }
    } catch (err) {
      setError(err.message || 'Authentication failed');
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.keyboardContainer}
    >
      <View testID="auth-screen" style={styles.container}>
        {/* Brand Wordmark & Tagline */}
        <View style={styles.brandContainer}>
          <Text testID="auth-app-title" style={styles.appTitle}>
            Pappu
          </Text>
          <Text style={styles.appTagline}>
            Bilingual Voice-First Financial Assistant
          </Text>
        </View>

        {/* Elevated White Form Card */}
        <Card style={styles.formCard} padding="xl" elevation="md">
          <Text testID="auth-mode-heading" style={styles.modeHeading}>
            {isSignUp ? 'Create an Account' : 'Sign In to Pappu'}
          </Text>

          {/* Error Banner */}
          {error && (
            <View testID="auth-error" style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Name input (Sign up only) */}
          {isSignUp && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                testID="auth-name-input"
                defaultValue={name}
                onChangeText={(text) => {
                  nameRef.current = text;
                  setName(text);
                }}
                onFocus={() => setFocusedField('name')}
                onBlur={() => setFocusedField(null)}
                placeholder="Rahul Nair"
                placeholderTextColor={colors.text.muted}
                style={[
                  styles.input,
                  focusedField === 'name' && styles.inputFocused,
                ]}
                autoCapitalize="words"
              />
            </View>
          )}

          {/* Email input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email Address</Text>
            <TextInput
              testID="auth-email-input"
              defaultValue={email}
              onChangeText={(text) => {
                emailRef.current = text;
                setEmail(text);
              }}
              onFocus={() => setFocusedField('email')}
              onBlur={() => setFocusedField(null)}
              placeholder="you@example.com"
              placeholderTextColor={colors.text.muted}
              style={[
                styles.input,
                focusedField === 'email' && styles.inputFocused,
              ]}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          {/* Password input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              testID="auth-password-input"
              defaultValue={password}
              onChangeText={(text) => {
                passwordRef.current = text;
                setPassword(text);
              }}
              onFocus={() => setFocusedField('password')}
              onBlur={() => setFocusedField(null)}
              placeholder="••••••••"
              placeholderTextColor={colors.text.muted}
              style={[
                styles.input,
                focusedField === 'password' && styles.inputFocused,
              ]}
              secureTextEntry
            />
          </View>

          {/* Submit Action */}
          <Button
            testID="auth-submit-button"
            onPress={handleSubmit}
            title={isSignUp ? 'Sign Up' : 'Sign In'}
            loading={loading}
            style={styles.submitBtn}
          />

          {/* Mode Toggle Link */}
          <TouchableOpacity
            testID="auth-toggle-mode"
            onPress={() => {
              setIsSignUp(!isSignUp);
              setError(null);
            }}
            style={styles.toggleRow}
            activeOpacity={0.7}
          >
            <Text style={styles.toggleText}>
              {isSignUp
                ? 'Already have an account? '
                : "Don't have an account? "}
              <Text style={styles.toggleTextLink}>
                {isSignUp ? 'Sign In' : 'Sign Up'}
              </Text>
            </Text>
          </TouchableOpacity>
        </Card>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: spacing['2xl'],
  },
  appTitle: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.brand.default,
    letterSpacing: -1,
  },
  appTagline: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 4,
    fontWeight: '500',
  },
  formCard: {
    borderRadius: radius['3xl'],
  },
  modeHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: spacing.lg,
  },
  errorBanner: {
    backgroundColor: colors.semantic.expenseBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.semantic.expenseBorder,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    color: colors.semantic.expense,
    fontSize: 13,
    fontWeight: '500',
  },
  inputGroup: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  input: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.text.primary,
    minHeight: 48,
  },
  inputFocused: {
    borderColor: colors.brand.default,
    backgroundColor: colors.surface,
  },
  submitBtn: {
    marginTop: spacing.md,
  },
  toggleRow: {
    marginTop: spacing.lg,
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  toggleText: {
    fontSize: 13,
    color: colors.text.secondary,
  },
  toggleTextLink: {
    color: colors.brand.default,
    fontWeight: '700',
  },
});
