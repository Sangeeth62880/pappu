import React from 'react';
import { View, Text, Linking, Platform, StyleSheet } from 'react-native';
import Card from './ui/Card';
import Button from './ui/Button';
import { colors, spacing, typography } from '../theme/tokens';
import { LISTEN_URL, handleIncomingUrl } from '../utils/listenTrigger';

// Full steps live in docs/QUICK_ACCESS.md. No hyphens or em dashes in user facing strings.
const STEPS = {
  android: [
    { label: 'App icon', text: 'Long press the Pappu icon and tap Talk to Pappu.' },
    {
      label: 'Quick Settings tile',
      text: 'Swipe down twice, tap the pencil, then drag Talk to Pappu into your tiles.',
    },
    {
      label: 'Power button',
      text:
        'Settings > Apps > Default apps > Digital assistant app > Pappu. ' +
        'Then set press and hold power button to Digital assistant.',
    },
    { label: 'Other buttons', text: `Button mapping apps can open ${LISTEN_URL}.` },
  ],
  ios: [
    { label: 'App icon', text: 'Long press the Pappu icon and tap Talk to Pappu.' },
    {
      label: 'Make a shortcut',
      text: `In Shortcuts, tap +, add Open URLs with ${LISTEN_URL} and name it Talk to Pappu.`,
    },
    { label: 'Action Button', text: 'Settings > Action Button > Shortcut > Talk to Pappu.' },
    {
      label: 'Back Tap',
      text: 'Settings > Accessibility > Touch > Back Tap > Double Tap > Talk to Pappu.',
    },
    {
      label: 'Lock Screen',
      text: 'Customize the Lock Screen, add a Shortcut control and pick Talk to Pappu.',
    },
  ],
};

/** Me screen card: how to talk to Pappu with one press, and a button that tries the link. */
export default function QuickAccessSection() {
  const steps = Platform.OS === 'ios' ? STEPS.ios : STEPS.android;

  // Through the OS, like a real button would; in app if the OS can't open it (e.g. Expo Go).
  const testLink = async () => {
    try {
      await Linking.openURL(LISTEN_URL);
    } catch (_e) {
      handleIncomingUrl(LISTEN_URL);
    }
  };

  return (
    <Card testID="quick-access-card" style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Quick access</Text>
        <Text style={styles.headerCaption}>One press to talk</Text>
      </View>

      <Text style={styles.intro}>
        Open Pappu straight into listening from a button, tile or gesture. Pappu plays a
        short sound, listens until you pause, and speaks the reply.
      </Text>

      <View style={styles.list}>
        {steps.map((step) => (
          <View key={step.label} style={styles.step} testID="quick-access-step">
            <Text style={styles.stepLabel}>{step.label}</Text>
            <Text style={styles.stepText}>{step.text}</Text>
          </View>
        ))}
      </View>

      <Button
        testID="quick-access-test-button"
        title="Test it"
        variant="secondary"
        size="sm"
        onPress={testLink}
        accessibilityLabel="Test quick access: open Pappu listening"
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    ...typography.headline_h2,
    color: colors.ink,
  },
  headerCaption: {
    ...typography.caption_bold,
    color: colors.ink_muted,
  },
  intro: {
    ...typography.body_secondary,
    color: colors.ink_muted,
  },
  list: {
    gap: spacing.md,
  },
  step: {
    gap: 2,
  },
  stepLabel: {
    ...typography.caption_bold,
    color: colors.ink,
  },
  stepText: {
    ...typography.body_secondary,
    color: colors.ink_muted,
  },
});
