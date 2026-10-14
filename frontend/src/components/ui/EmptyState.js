import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../../theme/tokens';
import Button from './Button';
import Pappu from './Pappu';

export default function EmptyState({
  mascotMood = 'sleepy',
  icon,
  title,
  description,
  actionTitle,
  onActionPress,
  style,
  testID = 'empty-state',
}) {
  return (
    <View style={[styles.container, style]} testID={testID}>
      {icon ? (
        <View style={styles.iconContainer}>{icon}</View>
      ) : mascotMood ? (
        <View style={styles.mascotContainer}>
          <Pappu mood={mascotMood} size={120} />
        </View>
      ) : null}

      {title ? <Text style={[styles.title, typography.headline_h2]}>{title}</Text> : null}
      {description ? (
        <Text style={[styles.description, typography.body_main]}>{description}</Text>
      ) : null}

      {actionTitle && onActionPress ? (
        <Button
          title={actionTitle}
          onPress={onActionPress}
          variant="secondary"
          size="sm"
          style={styles.actionBtn}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['3xl'],
    paddingHorizontal: spacing.xl,
  },
  mascotContainer: {
    marginBottom: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    marginBottom: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
  },
  description: {
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 15,
    color: colors.ink_muted,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 22,
  },
  actionBtn: {
    marginTop: spacing.lg,
  },
});
