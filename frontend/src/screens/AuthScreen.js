import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  BackHandler,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { signIn, signUp } from '../api/supabase';
import { colors, radius, shadows, spacing } from '../theme/tokens';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';

export default function AuthScreen({ onAuthenticated, onBack = null }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
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

  React.useEffect(() => {
    const onBackPress = () => {
      if (isSignUp) {
        setIsSignUp(false);
        setError(null);
        return true;
      }
      if (onBack) {
        onBack();
        return true;
      }
      return false;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [isSignUp, onBack]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.keyboardContainer}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View testID="auth-screen" style={styles.container}>
          {/* Top Back Navigation Row (if onBack or in SignUp mode) */}
          {(isSignUp || onBack) && (
            <View style={styles.topNavRow}>
              <TouchableOpacity
                testID="auth-back-button"
                onPress={() => {
                  if (isSignUp) {
                    setIsSignUp(false);
                    setError(null);
                  } else if (onBack) {
                    onBack();
                  }
                }}
                style={styles.backButton}
                accessibilityLabel={isSignUp ? 'Back to Sign In' : 'Back'}
                activeOpacity={0.7}
              >
                <MaterialIcons name="arrow-back" size={22} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
          )}

          {/* Top Brand Section */}
          <View style={styles.brandContainer}>
            {/* Friendly Voice Wave Icon Badge */}
            <View style={styles.voiceBadge}>
              <MaterialIcons name="graphic-eq" size={26} color="#FFFFFF" />
              <View style={styles.micSubBadge}>
                <MaterialIcons name="mic" size={11} color="#FFFFFF" />
              </View>
            </View>

            {/* Wordmark */}
            <Text testID="auth-app-title" style={styles.appTitle}>
              Pappu
            </Text>

            {/* Tagline */}
            <Text style={styles.appTagline}>
              Bilingual Voice-First Financial Assistant
            </Text>

            {/* Bilingual Regional Micro-Badge */}
            <View style={styles.bilingualBadge}>
              <View style={styles.pulsingDot} />
              <Text style={styles.bilingualBadgeText}>
                സംസാരിച്ചുകൊണ്ട് പണം ട്രാക്ക് ചെയ്യാം
              </Text>
            </View>
          </View>

          {/* Elevated Frosted Form Card */}
          <Card style={styles.formCard} padding="xl" elevation="md">
            <View style={styles.headerBlock}>
              <Text testID="auth-mode-heading" style={styles.modeHeading}>
                {isSignUp ? 'Create an Account' : 'Sign In to Pappu'}
              </Text>
              <Text style={styles.modeSubheading}>
                {isSignUp
                  ? 'Sign up to track daily expenses & split balances with voice'
                  : 'Log in to manage your daily expenses and shared splits'}
              </Text>
            </View>

            {/* Inline Error Banner */}
            {error && (
              <View testID="auth-error" style={styles.errorBanner}>
                <MaterialIcons
                  name="error-outline"
                  size={16}
                  color={colors.semantic.expense}
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Name input (Sign up only) */}
            {isSignUp && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Full Name</Text>
                <View
                  style={[
                    styles.inputWrapper,
                    focusedField === 'name' && styles.inputWrapperFocused,
                  ]}
                >
                  <MaterialIcons
                    name="person-outline"
                    size={20}
                    color={focusedField === 'name' ? colors.brand.default : colors.text.muted}
                    style={styles.inputIcon}
                  />
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
                    style={styles.input}
                    autoCapitalize="words"
                  />
                </View>
              </View>
            )}

            {/* Email input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email Address</Text>
              <View
                style={[
                  styles.inputWrapper,
                  focusedField === 'email' && styles.inputWrapperFocused,
                ]}
              >
                <MaterialIcons
                  name="mail-outline"
                  size={20}
                  color={focusedField === 'email' ? colors.brand.default : colors.text.muted}
                  style={styles.inputIcon}
                />
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
                  style={styles.input}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>
            </View>

            {/* Password input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View
                style={[
                  styles.inputWrapper,
                  focusedField === 'password' && styles.inputWrapperFocused,
                ]}
              >
                <MaterialIcons
                  name="lock-outline"
                  size={20}
                  color={focusedField === 'password' ? colors.brand.default : colors.text.muted}
                  style={styles.inputIcon}
                />
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
                  style={[styles.input, { paddingRight: 40 }]}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeToggleBtn}
                  accessibilityLabel="Toggle password visibility"
                  activeOpacity={0.7}
                >
                  <MaterialIcons
                    name={showPassword ? 'visibility-off' : 'visibility'}
                    size={20}
                    color={colors.text.muted}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Quick Voice Tip Banner */}
            <View style={styles.tipBox}>
              <View style={styles.tipIconCircle}>
                <MaterialIcons name="record-voice-over" size={14} color={colors.brand.default} />
              </View>
              <Text style={styles.tipText}>
                Tip: You can say <Text style={styles.tipHighlight}>"ചായ 20 രൂപ"</Text> immediately after signing in!
              </Text>
            </View>

            {/* Submit Action */}
            <Button
              testID="auth-submit-button"
              onPress={handleSubmit}
              title={isSignUp ? 'Create Account' : 'Sign In'}
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
                  : 'New here? '}
                <Text style={styles.toggleTextLink}>
                  {isSignUp ? 'Sign In' : 'Create an Account'}
                </Text>
              </Text>
            </TouchableOpacity>
          </Card>

          {/* Micro Security Assurance Footer */}
          <View style={styles.footerContainer}>
            <View style={styles.footerRow}>
              <MaterialIcons name="verified-user" size={14} color={colors.text.tertiary} style={{ marginRight: 4 }} />
              <Text style={styles.footerLabel}>End-to-end encrypted financial ledger</Text>
            </View>
            <Text style={styles.footerSub}>Pappu Engine • Kochi, India</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  topNavRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  voiceBadge: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    backgroundColor: colors.brand.default,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    ...shadows.md,
    position: 'relative',
  },
  micSubBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: radius.full,
    backgroundColor: colors.semantic.income,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  appTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.brand.default,
    letterSpacing: -0.8,
  },
  appTagline: {
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: 2,
    fontWeight: '500',
  },
  bilingualBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.full,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pulsingDot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.semantic.income,
    marginRight: 6,
  },
  bilingualBadgeText: {
    fontSize: 11,
    color: colors.semantic.income,
    fontWeight: '600',
  },
  formCard: {
    borderRadius: radius['2xl'],
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.md,
  },
  headerBlock: {
    marginBottom: spacing.md,
  },
  modeHeading: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
  },
  modeSubheading: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 4,
    lineHeight: 18,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
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
    flex: 1,
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
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    minHeight: 48,
    position: 'relative',
  },
  inputWrapperFocused: {
    borderColor: colors.brand.default,
    backgroundColor: colors.surface,
  },
  inputIcon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.text.primary,
    paddingVertical: spacing.md,
  },
  eyeToggleBtn: {
    position: 'absolute',
    right: 12,
    padding: 6,
  },
  tipBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.lg,
    padding: spacing.sm,
    marginTop: 4,
    marginBottom: spacing.md,
  },
  tipIconCircle: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    backgroundColor: colors.brand.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  tipText: {
    fontSize: 12,
    color: colors.text.secondary,
    flex: 1,
    lineHeight: 16,
  },
  tipHighlight: {
    fontWeight: '700',
    color: colors.text.primary,
  },
  submitBtn: {
    marginTop: spacing.xs,
    borderRadius: radius.full,
  },
  toggleRow: {
    marginTop: spacing.md,
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
  footerContainer: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerLabel: {
    fontSize: 12,
    color: colors.text.tertiary,
    fontWeight: '500',
  },
  footerSub: {
    fontSize: 11,
    color: colors.text.muted,
    marginTop: 2,
  },
});
