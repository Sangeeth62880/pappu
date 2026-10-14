import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors, radius, spacing } from '../theme/tokens';
import Avatar from '../components/ui/Avatar';
import Button from '../components/ui/Button';

export default function MeScreen({
  userEmail = 'User',
  onClearChatHistory,
  onSignOut,
}) {
  return (
    <ScrollView
      testID="me-screen"
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      <View style={styles.profileCard}>
        <Avatar name={userEmail} size={64} />
        <View style={styles.profileInfo}>
          <Text style={styles.profileLabel}>Signed in as</Text>
          <Text
            testID="user-email-header"
            style={styles.profileEmail}
            numberOfLines={1}
          >
            {userEmail}
          </Text>
        </View>
      </View>

      <View style={styles.actionsCard}>
        <Button
          testID="profile-clear-chat-button"
          onPress={onClearChatHistory}
          title="Clear Chat History"
          variant="outline"
          style={styles.actionButton}
        />
        <Button
          testID="auth-signout-button"
          onPress={onSignOut}
          title="Sign Out"
          variant="destructive"
          style={styles.actionButton}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  contentContainer: {
    padding: spacing.lg,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.card || 20,
    borderWidth: 2,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  profileInfo: {
    marginLeft: spacing.lg,
    flex: 1,
  },
  profileLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink_muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  profileEmail: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    marginTop: 4,
  },
  actionsCard: {
    gap: spacing.md,
  },
  actionButton: {
    width: '100%',
  },
});
