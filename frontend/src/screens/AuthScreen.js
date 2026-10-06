import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { signIn, signUp } from '../api/supabase';

export default function AuthScreen({ onAuthenticated }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
    <View
      testID="auth-screen"
      className="flex-1 bg-ink-navy justify-center px-8"
    >
      {/* Wordmark */}
      <View className="items-center mb-12">
        <Text
          testID="auth-app-title"
          className="text-warm-brass text-4xl font-bold tracking-tight"
          style={{ fontFamily: 'Libre Baskerville, Georgia, serif' }}
        >
          Pappu
        </Text>
        <Text className="text-bone-darker font-sans text-sm mt-2 tracking-wide">
          Bilingual Voice-First Financial Assistant
        </Text>
      </View>

      {/* Form */}
      <View className="bg-ink-navy-light rounded-2xl p-6 border border-ink-navy-lighter">
        <Text testID="auth-mode-heading" className="text-bone font-sans text-lg font-semibold mb-5">
          {isSignUp ? 'Create an Account' : 'Sign In to Pappu'}
        </Text>

        {/* Error banner */}
        {error && (
          <View testID="auth-error" className="bg-clay-rust/15 border border-clay-rust/30 p-3 rounded-lg mb-4">
            <Text className="text-clay-rust-light font-sans text-xs font-medium">{error}</Text>
          </View>
        )}

        {/* Name field (sign up only) */}
        {isSignUp && (
          <View className="mb-4">
            <Text className="text-bone-darker font-sans text-xs font-medium mb-1.5 uppercase tracking-wider">
              Full Name
            </Text>
            <TextInput
              testID="auth-name-input"
              value={name}
              onChangeText={(val) => {
                setName(val);
                nameRef.current = val;
              }}
              placeholder="e.g. Sangeeth"
              placeholderTextColor="#8A8A9A"
              className="bg-ink-navy text-bone font-sans px-4 py-3 rounded-xl border border-ink-navy-lighter text-sm"
              autoCapitalize="words"
            />
          </View>
        )}

        {/* Email */}
        <View className="mb-4">
          <Text className="text-bone-darker font-sans text-xs font-medium mb-1.5 uppercase tracking-wider">
            Email
          </Text>
          <TextInput
            testID="auth-email-input"
            value={email}
            onChangeText={(val) => {
              setEmail(val);
              emailRef.current = val;
            }}
            placeholder="you@example.com"
            placeholderTextColor="#8A8A9A"
            className="bg-ink-navy text-bone font-sans px-4 py-3 rounded-xl border border-ink-navy-lighter text-sm"
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        {/* Password */}
        <View className="mb-6">
          <Text className="text-bone-darker font-sans text-xs font-medium mb-1.5 uppercase tracking-wider">
            Password
          </Text>
          <TextInput
            testID="auth-password-input"
            value={password}
            onChangeText={(val) => {
              setPassword(val);
              passwordRef.current = val;
            }}
            placeholder="••••••••"
            placeholderTextColor="#8A8A9A"
            className="bg-ink-navy text-bone font-sans px-4 py-3 rounded-xl border border-ink-navy-lighter text-sm"
            secureTextEntry
            onSubmitEditing={handleSubmit}
          />
        </View>

        {/* Submit */}
        <TouchableOpacity
          testID="auth-submit-button"
          onPress={handleSubmit}
          disabled={loading}
          className="bg-warm-brass py-3.5 rounded-xl items-center justify-center active:bg-warm-brass-dark"
        >
          {loading ? (
            <ActivityIndicator size="small" color="#161B2E" />
          ) : (
            <Text className="text-ink-navy font-sans font-semibold text-sm tracking-wide">
              {isSignUp ? 'Create Account' : 'Sign In'}
            </Text>
          )}
        </TouchableOpacity>

        {/* Toggle */}
        <TouchableOpacity
          testID="auth-toggle-mode"
          onPress={() => {
            setIsSignUp((prev) => !prev);
            setError(null);
          }}
          className="mt-5 items-center py-1"
        >
          <Text className="text-bone-darker font-sans text-xs">
            {isSignUp
              ? 'Already have an account? '
              : "Don't have an account? "}
            <Text className="text-warm-brass font-medium">
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </Text>
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
