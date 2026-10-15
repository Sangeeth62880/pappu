import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, typography, spacing } from '../../theme/tokens';
import Pappu from './Pappu';
import Button from './Button';
import { checkBackendHealth } from '../../config/api';

/**
 * StartupHealthGate checks GET /health against the resolved backend URL on app boot.
 * - Shows a seamless splash-matching background (#FFF8E7) while checking.
 * - After 3 seconds of waiting (e.g. cold start on Render), displays the "Waking Pappu up" state.
 * - If unreachable or timed out, displays the friendly offline state with a Retry button.
 * - If improperly configured (e.g. cleartext in production), displays a configuration error screen.
 */
export default function StartupHealthGate({
  children,
  skipCheck = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test',
  testMode = null, // for testing: 'checking' | 'waking' | 'offline' | 'config_error' | 'healthy'
}) {
  const [healthState, setHealthState] = useState(testMode || (skipCheck ? 'healthy' : 'checking'));
  const [errorMessage, setErrorMessage] = useState('');
  const wakingTimerRef = useRef(null);

  const runHealthCheck = useCallback(async () => {
    if (skipCheck && !testMode) {
      setHealthState('healthy');
      return;
    }

    setHealthState('checking');
    setErrorMessage('');

    if (wakingTimerRef.current) {
      clearTimeout(wakingTimerRef.current);
    }

    // Set 3s timer for hosting cold start state ("Waking Pappu up")
    wakingTimerRef.current = setTimeout(() => {
      setHealthState((current) => (current === 'checking' ? 'waking' : current));
    }, 3000);

    try {
      await checkBackendHealth(12000);
      if (wakingTimerRef.current) {
        clearTimeout(wakingTimerRef.current);
      }
      setHealthState('healthy');
    } catch (err) {
      if (wakingTimerRef.current) {
        clearTimeout(wakingTimerRef.current);
      }
      const msg = err?.message || '';
      if (
        msg.includes('Production builds require') ||
        msg.includes('API URL is not configured') ||
        msg.includes('ConfigurationError')
      ) {
        setHealthState('config_error');
        setErrorMessage(msg);
      } else {
        setHealthState('offline');
        setErrorMessage(msg || "Can't connect to server.");
      }
    }
  }, [skipCheck, testMode]);

  useEffect(() => {
    if (testMode) {
      setHealthState(testMode);
      return;
    }
    if (!skipCheck) {
      runHealthCheck();
    }
    return () => {
      if (wakingTimerRef.current) {
        clearTimeout(wakingTimerRef.current);
      }
    };
  }, [runHealthCheck, skipCheck, testMode]);

  if (healthState === 'healthy') {
    return children;
  }

  return (
    <View style={styles.container} testID={`startup-health-${healthState}`}>
      {healthState === 'checking' && (
        <View style={styles.content}>
          <Pappu state="idle" size={120} />
          <ActivityIndicator size="large" color={colors.gold} style={styles.loader} />
        </View>
      )}

      {healthState === 'waking' && (
        <View style={styles.content}>
          <Pappu state="sleepy" size={120} />
          <Text style={styles.title}>Waking Pappu up</Text>
          <Text style={styles.subtitle}>
            The server is waking up after being idle. This takes a few moments.
          </Text>
          <ActivityIndicator size="small" color={colors.gold} style={styles.loader} />
        </View>
      )}

      {healthState === 'offline' && (
        <View style={styles.content}>
          <Pappu state="concerned" size={120} />
          <Text style={styles.title}>Can't reach Pappu</Text>
          <Text style={styles.subtitle}>
            Check your internet connection or verify the server is running.
          </Text>
          <View style={styles.buttonWrapper}>
            <Button
              testID="health-retry-button"
              title="Retry"
              variant="primary"
              onPress={runHealthCheck}
            />
          </View>
        </View>
      )}

      {healthState === 'config_error' && (
        <View style={styles.content}>
          <Pappu state="confused" size={120} />
          <Text style={styles.title}>Configuration Error</Text>
          <Text style={styles.subtitle}>{errorMessage}</Text>
          <View style={styles.buttonWrapper}>
            <Button
              testID="health-config-retry-button"
              title="Retry"
              variant="secondary"
              onPress={runHealthCheck}
            />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 320,
    width: '100%',
  },
  title: {
    ...typography.h2,
    color: colors.ink,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    color: colors.ink_muted,
    marginTop: spacing.xs,
    textAlign: 'center',
    lineHeight: 22,
  },
  loader: {
    marginTop: spacing.md,
  },
  buttonWrapper: {
    width: '100%',
    marginTop: spacing.lg,
  },
});
