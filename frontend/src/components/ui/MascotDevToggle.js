import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import Pappu, {
  resolveMascotPose,
  SERVER_MOODS,
  CLIENT_STATES,
  ALL_POSES,
} from './Pappu';
import Chip from './Chip';
import Button from './Button';

/**
 * MascotDevToggle Component.
 * Interactive developer toggle and playground to demonstrate every mood and state:
 * - 6 Server Moods: neutral, happy, excited, concerned, confused, worried
 * - 4 Client Overrides: listening, thinking, speaking, sleepy
 * - All 10 Poses direct selector
 * - 60s Inactivity simulation
 * - Live resolution explanation
 */
export default function MascotDevToggle({ style, testID = 'mascot-dev-toggle' }) {
  const [selectedServerMood, setSelectedServerMood] = useState('neutral');
  const [selectedClientState, setSelectedClientState] = useState(null);
  const [simulatedSleepy, setSimulatedSleepy] = useState(false);

  const resolvedPose = resolveMascotPose({
    serverMood: selectedServerMood,
    clientState: selectedClientState,
    isSleepy: simulatedSleepy,
  });

  const handleSelectDirectPose = (pose) => {
    setSimulatedSleepy(false);
    if (['listening', 'thinking', 'speaking', 'sleepy'].includes(pose)) {
      setSelectedClientState(pose);
    } else {
      setSelectedClientState(null);
      setSelectedServerMood(pose === 'idle' ? 'neutral' : pose);
    }
  };

  const getExplanation = () => {
    if (simulatedSleepy) {
      return '60-second inactivity timeout active: Sleepy overrides all other states.';
    }
    if (selectedClientState && selectedClientState !== 'idle') {
      return `Client state "${selectedClientState}" overrides server mood "${selectedServerMood}".`;
    }
    if (selectedServerMood === 'neutral') {
      return 'Server mood "neutral" maps to canonical "idle" pose.';
    }
    return `Server mood "${selectedServerMood}" maps to "${resolvedPose}" pose.`;
  };

  return (
    <View testID={testID} style={[styles.container, style]}>
      {/* ── Mascot Showcase Preview Area ── */}
      <View style={styles.previewCard} testID="mascot-dev-preview-card">
        <Pappu
          serverMood={selectedServerMood}
          clientState={selectedClientState}
          isSleepy={simulatedSleepy}
          autoSleepy={false}
          size={120}
          testID="mascot-dev-mascot"
        />

        <View style={styles.badgeRow}>
          <View style={styles.poseBadge}>
            <Text style={styles.poseBadgeText} testID="mascot-dev-active-pose">
              Active Pose: {resolvedPose}
            </Text>
          </View>
        </View>

        <Text style={styles.explanationText} testID="mascot-dev-explanation">
          {getExplanation()}
        </Text>
      </View>

      {/* ── Direct 10-Pose Selector Strip ── */}
      <View style={styles.sectionWrap}>
        <Text style={styles.sectionLabel}>Quick Pose Select (All 10 Poses):</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalRow}>
          {ALL_POSES.map((pose) => {
            const isSelected = resolvedPose === pose && !simulatedSleepy;
            return (
              <TouchableOpacity
                key={pose}
                testID={`dev-pose-${pose}`}
                onPress={() => handleSelectDirectPose(pose)}
                activeOpacity={0.7}
                style={[styles.posePill, isSelected && styles.posePillActive]}
              >
                <Text style={[styles.posePillText, isSelected && styles.posePillTextActive]}>
                  {pose}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Server Moods Selector ── */}
      <View style={styles.sectionWrap}>
        <Text style={styles.sectionLabel}>
          Server Moods (supported by backend):
        </Text>
        <View style={styles.chipsWrap}>
          {SERVER_MOODS.map((mood) => {
            const isSelected = selectedServerMood === mood;
            return (
              <Chip
                key={mood}
                testID={`dev-server-mood-${mood}`}
                label={mood}
                selected={isSelected}
                onPress={() => {
                  setSimulatedSleepy(false);
                  setSelectedServerMood(mood);
                }}
              />
            );
          })}
        </View>
      </View>

      {/* ── Client Interaction States (Overrides) ── */}
      <View style={styles.sectionWrap}>
        <Text style={styles.sectionLabel}>
          Client States (Overrides Server Mood):
        </Text>
        <View style={styles.chipsWrap}>
          <Chip
            testID="dev-client-state-none"
            label="None (Idle)"
            selected={!selectedClientState && !simulatedSleepy}
            onPress={() => {
              setSelectedClientState(null);
              setSimulatedSleepy(false);
            }}
          />
          {['listening', 'thinking', 'speaking', 'sleepy'].map((st) => {
            const isSelected = selectedClientState === st && !simulatedSleepy;
            return (
              <Chip
                key={st}
                testID={`dev-client-state-${st}`}
                label={st}
                selected={isSelected}
                onPress={() => {
                  setSimulatedSleepy(false);
                  setSelectedClientState(st);
                }}
              />
            );
          })}
        </View>
      </View>

      {/* ── Inactivity Sleepy Simulation ── */}
      <View style={styles.actionsWrap}>
        <Button
          testID="dev-simulate-inactivity-btn"
          title={simulatedSleepy ? 'Reset from Sleepy Standby' : 'Simulate 60s Inactivity (Sleepy)'}
          variant={simulatedSleepy ? 'secondary' : 'primary'}
          size="sm"
          onPress={() => setSimulatedSleepy((prev) => !prev)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.md,
  },
  previewCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    backgroundColor: colors.bg,
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  badgeRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  poseBadge: {
    backgroundColor: colors.gold,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.gold_edge,
  },
  poseBadgeText: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 13,
    color: colors.ink,
    fontWeight: '700',
    includeFontPadding: false,
  },
  explanationText: {
    fontFamily: typography.fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink_muted,
    textAlign: 'center',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  sectionWrap: {
    gap: spacing.xs,
  },
  sectionLabel: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 13,
    color: colors.ink,
    fontWeight: '700',
  },
  horizontalRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  posePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.bg,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  posePillActive: {
    backgroundColor: colors.gold,
    borderColor: colors.ink,
  },
  posePillText: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 12,
    color: colors.ink_muted,
    fontWeight: '700',
  },
  posePillTextActive: {
    color: colors.ink,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionsWrap: {
    marginTop: spacing.xs,
  },
});
