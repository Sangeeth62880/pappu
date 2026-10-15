import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableWithoutFeedback,
  Animated,
} from 'react-native';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { useReduceMotion } from '../../utils/reduceMotion';
import Button from './Button';
import Pappu from './Pappu';

/**
 * Flat Dialog Primitive matching Stitch specifications (Delete confirmation, Sign out, Clear chat).
 * Strictly flat dim overlay (zero blur), white card with 2px border, 20px radius, 48px paired buttons.
 * Card scales in from scale(0.94) -> scale(1.0) with opacity 0 -> 1 over 180ms.
 * Reduce-Motion fallback: instant display without scale (0ms).
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
  mascotMood = null,
  mascotSize = 72,
}) {
  const reduceMotion = useReduceMotion();
  const isTest = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';

  const scaleAnim = useRef(new Animated.Value(reduceMotion || isTest ? 1 : 0.94)).current;
  const opacityAnim = useRef(new Animated.Value(reduceMotion || isTest ? 1 : 0)).current;

  useEffect(() => {
    if (visible) {
      if (reduceMotion || isTest) {
        scaleAnim.setValue(1);
        opacityAnim.setValue(1);
      } else {
        scaleAnim.setValue(0.94);
        opacityAnim.setValue(0);
        Animated.parallel([
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 180,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 1,
            duration: 180,
            useNativeDriver: true,
          }),
        ]).start();
      }
    }
  }, [visible, reduceMotion, isTest, scaleAnim, opacityAnim]);

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
            <Animated.View
              style={[
                styles.card,
                {
                  opacity: opacityAnim,
                  transform: [{ scale: scaleAnim }],
                },
              ]}
              testID={`${testID}-card`}
            >
              {mascotMood ? (
                <View style={styles.mascotContainer} testID={`${testID}-mascot`}>
                  <Pappu mood={mascotMood} size={mascotSize} />
                </View>
              ) : null}

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
            </Animated.View>
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
  mascotContainer: {
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
