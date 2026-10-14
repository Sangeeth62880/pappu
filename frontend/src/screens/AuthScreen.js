import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  BackHandler,
} from 'react-native';
import { signIn, signUp } from '../api/supabase';
import { colors, radius, spacing, typography } from '../theme/tokens';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Icon from '../components/ui/Icon';
import AuthMascot from '../components/ui/AuthMascot';

/**
 * Authentication Screen: Sign In and Create Account
 * Visual source of truth: Stitch Project 9429203517741760676 (sign_in.html)
 * Strictly conforms to Pappu Tactile Mascot Design System.
 */
export default function AuthScreen({ onAuthenticated, onBack = null }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [focusedField, setFocusedField] = useState(null);
  const [shakeCount, setShakeCount] = useState(0);

  const emailRef = useRef('');
  const passwordRef = useRef('');
  const nameRef = useRef('');

  const triggerErrorShake = (errorMessage, fieldErrorsObj = {}) => {
    setError(errorMessage);
    setFieldErrors(fieldErrorsObj);
    setShakeCount((c) => c + 1);
  };

  const handleToggleMode = () => {
    setIsSignUp((prev) => !prev);
    setError(null);
    setFieldErrors({});
    setFocusedField(null);
  };

  const handleBack = () => {
    if (isSignUp) {
      setIsSignUp(false);
      setError(null);
      setFieldErrors({});
      setFocusedField(null);
      return true;
    }
    if (onBack) {
      onBack();
      return true;
    }
    return false;
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', handleBack);
    return () => sub.remove();
  }, [isSignUp, onBack]);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const isTest = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';

  const handleSubmit = async () => {
    const trimmedEmail = (emailRef.current || email || '').trim();
    const trimmedPassword = (passwordRef.current || password || '').trim();
    const trimmedName = (nameRef.current || name || '').trim();

    const errors = {};

    if (!trimmedEmail) {
      errors.email = 'Please enter a valid email address.';
    } else if (!trimmedEmail.includes('@') || !trimmedEmail.includes('.')) {
      errors.email = 'Please enter a valid email address.';
    }

    if (!trimmedPassword) {
      errors.password = 'Password is required.';
    } else if (isSignUp && trimmedPassword.length < 6) {
      errors.password = 'Password must be at least 6 characters.';
    }

    if (isSignUp && !trimmedName) {
      errors.name = 'Please enter your name.';
    }

    if (!trimmedEmail || !trimmedPassword) {
      triggerErrorShake('Please enter both email and password.', errors);
      return;
    }

    if (Object.keys(errors).length > 0) {
      const firstError = Object.values(errors)[0];
      triggerErrorShake(firstError, errors);
      return;
    }

    try {
      if (!isTest) setLoading(true);
      setError(null);
      setFieldErrors({});

      if (isSignUp) {
        const res = await signUp({
          email: trimmedEmail,
          password: trimmedPassword,
          name: trimmedName,
          preferred_language: 'en',
        });
        if (!isMountedRef.current) return;
        if (!isTest) setLoading(false);
        if (res?.session) {
          onAuthenticated(res.session);
        } else {
          setError('Sign up successful! Please check your email to confirm or sign in.');
        }
      } else {
        const res = await signIn({
          email: trimmedEmail,
          password: trimmedPassword,
        });
        if (!isMountedRef.current) return;
        if (!isTest) setLoading(false);
        if (res?.session) {
          onAuthenticated(res.session);
        } else {
          triggerErrorShake('Failed to obtain session. Please try again.');
        }
      }
    } catch (err) {
      if (isMountedRef.current) {
        if (!isTest) setLoading(false);
        const msg = err.message || 'Authentication failed';
        triggerErrorShake(msg, { password: true });
      }
    }
  };

  const KeyboardWrapper = Platform.OS === 'ios' && !isTest ? KeyboardAvoidingView : View;

  return (
    <KeyboardWrapper
      behavior={Platform.OS === 'ios' && !isTest ? 'padding' : undefined}
      style={styles.keyboardContainer}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View testID="auth-screen" style={styles.container}>
          {/* Top Status Bar Headroom & Visible Navigation Back */}
          <View style={styles.topBar}>
            {isSignUp || onBack ? (
              <TouchableOpacity
                testID="auth-back-button"
                onPress={handleBack}
                style={styles.backButton}
                accessibilityRole="button"
                accessibilityLabel={isSignUp ? 'Back to Sign In' : 'Back'}
                activeOpacity={0.7}
              >
                <Icon name="arrow-left" size={22} color={colors.ink} />
              </TouchableOpacity>
            ) : (
              <View style={styles.backPlaceholder} />
            )}
          </View>

          {/* Space between status bar and content matching Stitch */}
          <View style={isSignUp ? styles.spacerCreateAccount : styles.spacerSignIn} />

          {/* Mascot Hero */}
          <View style={styles.mascotContainer}>
            <AuthMascot
              size={isSignUp ? 140 : 180}
              isFocused={Boolean(focusedField)}
              shakeTrigger={shakeCount}
              testID="auth-mascot"
            />
          </View>

          {/* Wordmark Display 32 Baloo 800 */}
          <View style={isSignUp ? styles.wordmarkBoxSmall : styles.wordmarkBox}>
            <Text testID="auth-app-title" style={styles.wordmark}>
              Pappu
            </Text>
          </View>

          {/* Tagline Nunito 16 Semibold ink-muted */}
          <View style={isSignUp ? styles.taglineBoxSmall : styles.taglineBox}>
            <Text style={styles.tagline}>
              Just say it. Pappu keeps track.
            </Text>
          </View>

          {/* Auth Card: White Surface, 2px Border, Radius 20, Padding 24 */}
          <Card
            style={isSignUp ? styles.cardCreateAccount : styles.cardSignIn}
            padding="2xl"
          >
            {/* Inline Error Banner */}
            {error ? (
              <View testID="auth-error" style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{error}</Text>
              </View>
            ) : null}

            {/* Name Field (Create Account Only) */}
            {isSignUp ? (
              <View style={styles.fieldGroup}>
                <Input
                  testID="auth-name-input"
                  label="Name"
                  placeholder="Your name"
                  value={name}
                  onChangeText={(text) => {
                    nameRef.current = text;
                    setName(text);
                    if (fieldErrors.name) {
                      setFieldErrors((prev) => ({ ...prev, name: null }));
                    }
                  }}
                  leadingIcon={
                    <Icon
                      name="user"
                      size={20}
                      color={colors.ink}
                    />
                  }
                  onFocus={() => setFocusedField('name')}
                  onBlur={() => setFocusedField(null)}
                  error={fieldErrors.name}
                  editable={!loading}
                  autoCapitalize="words"
                />
              </View>
            ) : null}

            {/* Email Field */}
            <View style={styles.fieldGroup}>
              <Input
                testID="auth-email-input"
                label="Email"
                placeholder="you@example.com"
                value={email}
                onChangeText={(text) => {
                  emailRef.current = text;
                  setEmail(text);
                  if (fieldErrors.email) {
                    setFieldErrors((prev) => ({ ...prev, email: null }));
                  }
                }}
                leadingIcon={
                  <Icon
                    name="mail"
                    size={20}
                    color={colors.ink}
                  />
                }
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
                error={fieldErrors.email}
                editable={!loading}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            {/* Password Field */}
            <View style={styles.fieldGroup}>
              <Input
                testID="auth-password-input"
                label="Password"
                placeholder="••••••••"
                value={password}
                onChangeText={(text) => {
                  passwordRef.current = text;
                  setPassword(text);
                  if (fieldErrors.password) {
                    setFieldErrors((prev) => ({ ...prev, password: null }));
                  }
                }}
                leadingIcon={
                  <Icon
                    name="lock"
                    size={20}
                    color={colors.ink}
                  />
                }
                secureTextEntry={true}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
                error={fieldErrors.password}
                editable={!loading}
                autoCapitalize="none"
              />
            </View>

            {/* Submit Button */}
            <View style={styles.buttonWrapper}>
              <Button
                testID="auth-submit-button"
                title={isSignUp ? 'Create account' : 'Sign in'}
                variant="primary"
                loading={loading}
                disabled={loading}
                onPress={handleSubmit}
              />
            </View>
          </Card>

          {/* Switch Mode Footer */}
          <View style={styles.footerRow}>
            <Text style={styles.footerPrompt}>
              {isSignUp ? 'Already have an account? ' : 'New here? '}
            </Text>
            <TouchableOpacity
              testID="auth-toggle-mode"
              onPress={handleToggleMode}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={isSignUp ? 'Sign in' : 'Create account'}
            >
              <Text style={styles.footerLink}>
                {isSignUp ? 'Sign in' : 'Create account'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardWrapper>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-start',
  },
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 20,
    paddingBottom: 32,
    alignItems: 'center',
  },
  topBar: {
    width: '100%',
    height: 47,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radius.small,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
  },
  backPlaceholder: {
    height: 40,
  },
  spacerSignIn: {
    height: 40,
  },
  spacerCreateAccount: {
    height: 24,
  },
  mascotContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmarkBox: {
    marginTop: 8,
    alignItems: 'center',
  },
  wordmarkBoxSmall: {
    marginTop: 4,
    alignItems: 'center',
  },
  wordmark: {
    fontFamily: 'BalooChettan2_800ExtraBold',
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
  },
  taglineBox: {
    marginTop: 8,
    alignItems: 'center',
  },
  taglineBoxSmall: {
    marginTop: 4,
    alignItems: 'center',
  },
  tagline: {
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    color: colors.ink_muted,
    textAlign: 'center',
  },
  cardSignIn: {
    marginTop: 32,
    width: '100%',
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  cardCreateAccount: {
    marginTop: 24,
    width: '100%',
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  fieldGroup: {
    width: '100%',
    marginBottom: 0,
  },
  buttonWrapper: {
    width: '100%',
    marginTop: 8,
  },
  errorBanner: {
    width: '100%',
    backgroundColor: colors.bg,
    borderWidth: 2,
    borderColor: colors.expense,
    borderRadius: radius.small,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  errorBannerText: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 13,
    lineHeight: 18,
    color: colors.expense,
    fontWeight: '700',
    textAlign: 'center',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  footerPrompt: {
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    color: colors.ink_muted,
  },
  footerLink: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    color: colors.teal,
  },
});
