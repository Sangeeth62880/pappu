import React from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableWithoutFeedback,
} from 'react-native';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import Button from './Button';

/**
 * Flat Dialog Primitive matching Stitch specifications (Delete confirmation, Sign out, Clear chat).
 * Strictly flat dim overlay (zero blur), white card with 2px border, 20px radius, 48px paired buttons.
 */
export default function Dialog({
  visible,
  onClose,
  title,
  description,
  confirmTitle = 'Confirm',
  confirmVariant = 'destructive',
  cancelTitle = 'Cancel',
  onConfirm,
  loading = false,
  testID = 'dialog',
}) {
  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      testID={testID}
    >
      <TouchableWithoutFeedback onPress={onClose} testID={`${testID}-backdrop`}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <View style={styles.card} testID={`${testID}-card`}>
              {title ? (
                <Text style={[styles.title, typography.headline_h2]}>{title}</Text>
              ) : null}

              {description ? (
                <Text style={[styles.description, typography.body_main]}>
                  {description}
                </Text>
              ) : null}

              <View style={styles.buttonRow}>
                <View style={styles.buttonWrapper}>
                  <Button
                    title={cancelTitle}
                    variant="secondary"
                    size="dialog"
                    onPress={onClose}
                    disabled={loading}
                    testID={`${testID}-cancel`}
                  />
                </View>

                <View style={styles.buttonWrapper}>
                  <Button
                    title={confirmTitle}
                    variant={confirmVariant}
                    size="dialog"
                    onPress={onConfirm}
                    loading={loading}
                    testID={`${testID}-confirm`}
                  />
                </View>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.dim_overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing['2xl'],
    alignItems: 'center',
  },
  title: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  description: {
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    color: colors.ink_muted,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  buttonRow: {
    flexDirection: 'row',
    width: '100%',
    gap: spacing.md,
  },
  buttonWrapper: {
    flex: 1,
  },
});
