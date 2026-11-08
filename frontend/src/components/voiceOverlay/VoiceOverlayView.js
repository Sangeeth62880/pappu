import React from 'react';
import { View, Modal, Pressable, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import Feather from '@expo/vector-icons/Feather';
import { SafeAreaView } from 'react-native-safe-area-context';
import Pappu from '../ui/Pappu';
import IconButton from '../ui/IconButton';
import { colors, spacing } from '../../theme/tokens';

const MASCOT_SIZE = 140;

/**
 * Presentational voice overlay: a transparent modal over the current screen with a
 * cream scrim, a close button and Pappu in the lower half. No session logic, so the
 * styleguide can render any state without the backend.
 */
export default function VoiceOverlayView({ pose = 'listening', onClose, testID = 'voice-overlay' }) {
  return (
    <Modal
      testID={testID}
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable
          testID="voice-overlay-scrim"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close Pappu"
        >
          {/* A soft blur is cheap on iOS; Android gets the tinted scrim only. */}
          {Platform.OS === 'ios' ? (
            <BlurView intensity={20} tint="light" style={StyleSheet.absoluteFill} />
          ) : null}
          <View style={[StyleSheet.absoluteFill, styles.scrim]} />
        </Pressable>

        {/* Native safe area view: no provider needed, measures inside the modal window. */}
        <SafeAreaView pointerEvents="box-none" style={styles.content}>
          <View style={styles.topBar} pointerEvents="box-none">
            <IconButton
              testID="voice-overlay-close"
              variant="outline"
              onPress={onClose}
              accessibilityLabel="Close Pappu"
              icon={<Feather name="x" size={20} color={colors.ink} />}
            />
          </View>

          <View style={styles.lowerHalf} pointerEvents="box-none">
            <Pappu state={pose} size={MASCOT_SIZE} autoSleepy={false} testID="voice-overlay-mascot" />
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrim: {
    backgroundColor: 'rgba(255, 248, 231, 0.88)',
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  lowerHalf: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
});
