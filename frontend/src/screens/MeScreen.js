import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Switch,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { colors, radius, spacing, typography } from '../theme/tokens';
import Dialog from '../components/ui/Dialog';
import Button from '../components/ui/Button';

/**
 * Me Screen (Profile & Settings)
 * Visual source of truth: Stitch HTML (me.html) & design/spec/me.md
 * - Profile Card (72px avatar with ₹, user name, email)
 * - Settings Card (Language switcher, Voice replies switch, Clear chat history row)
 * - Sign Out button (Destructive outline)
 * - Dialogs: "Clear chat history?" and "Sign out?"
 */
export default function MeScreen({
  userEmail = 'test@pappu.dev',
  userName = null,
  onClearChatHistory,
  onSignOut,
  voiceRepliesEnabled = true,
  onToggleVoiceReplies,
}) {
  const [selectedLanguage, setSelectedLanguage] = useState('en'); // 'en' | 'ml'
  const [voiceReplies, setVoiceReplies] = useState(voiceRepliesEnabled);
  const [clearChatDialogVisible, setClearChatDialogVisible] = useState(false);
  const [signOutDialogVisible, setSignOutDialogVisible] = useState(false);

  const displayName = userName || (userEmail ? userEmail.split('@')[0] : 'Sangeeth');

  const handleLanguageToggle = (lang) => {
    setSelectedLanguage(lang);
  };

  const handleVoiceToggle = (val) => {
    setVoiceReplies(val);
    if (onToggleVoiceReplies) onToggleVoiceReplies(val);
  };

  const confirmClearChat = () => {
    setClearChatDialogVisible(false);
    if (onClearChatHistory) onClearChatHistory();
  };

  const confirmSignOut = () => {
    setSignOutDialogVisible(false);
    if (onSignOut) onSignOut();
  };

  return (
    <ScrollView
      testID="me-screen"
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* ── 1. Profile Card ── */}
      <View style={styles.profileCard}>
        {/* 72px Avatar Circle with Gold Fill & ₹ Symbol */}
        <View style={styles.avatarCircleOuter}>
          <View style={styles.avatarEdge} />
          <View style={styles.avatarCircle}>
            <View style={styles.avatarInnerRim}>
              <Text style={styles.avatarSymbol}>₹</Text>
            </View>
          </View>
        </View>

        {/* User Info */}
        <View style={styles.profileInfoBox}>
          <Text style={styles.profileName} numberOfLines={1}>
            {displayName}
          </Text>
          <Text
            testID="user-email-header"
            style={styles.profileEmail}
            numberOfLines={1}
          >
            {userEmail}
          </Text>
        </View>
      </View>

      {/* ── 2. Settings Card ── */}
      <View style={styles.settingsCard}>
        {/* Row 1: Language Preference */}
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Language</Text>
          <View style={styles.langSegmentContainer}>
            <TouchableOpacity
              onPress={() => handleLanguageToggle('en')}
              style={[
                styles.langSegment,
                selectedLanguage === 'en' && styles.langSegmentActive,
              ]}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.langSegmentText,
                  selectedLanguage === 'en' && styles.langSegmentTextActive,
                ]}
              >
                English
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleLanguageToggle('ml')}
              style={[
                styles.langSegment,
                selectedLanguage === 'ml' && styles.langSegmentActive,
              ]}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.langSegmentText,
                  selectedLanguage === 'ml' && styles.langSegmentTextActive,
                ]}
              >
                മലയാളം
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Row 2: Voice Replies Switch */}
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Voice replies</Text>
          <Switch
            value={voiceReplies}
            onValueChange={handleVoiceToggle}
            trackColor={{ false: colors.border, true: colors.gold }}
            thumbColor={colors.surface}
            ios_backgroundColor={colors.border}
          />
        </View>

        <View style={styles.divider} />

        {/* Row 3: Clear Chat History Action */}
        <TouchableOpacity
          testID="profile-clear-chat-button"
          onPress={() => setClearChatDialogVisible(true)}
          style={styles.settingRow}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Clear chat history"
        >
          <View style={styles.clearRowLeft}>
            <Feather name="trash-2" size={18} color={colors.expense} style={{ marginRight: 10 }} />
            <Text style={styles.clearRowText}>Clear chat history</Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.expense} />
        </TouchableOpacity>
      </View>

      {/* ── 3. Sign Out Button ── */}
      <View style={styles.signOutButtonContainer}>
        <Button
          testID="auth-signout-button"
          title="Sign out"
          variant="destructiveOutline"
          onPress={() => setSignOutDialogVisible(true)}
          style={styles.signOutBtn}
        />
      </View>

      {/* ── Dialog 1: Clear Chat History Confirmation ── */}
      <Dialog
        visible={clearChatDialogVisible}
        title="Clear chat history?"
        description="This removes all your messages with Pappu. Your transactions stay."
        confirmTitle="Clear"
        cancelTitle="Cancel"
        onConfirm={confirmClearChat}
        onClose={() => setClearChatDialogVisible(false)}
        confirmVariant="destructive"
        testID="dialog-clear-chat"
      />

      {/* ── Dialog 2: Sign Out Confirmation ── */}
      <Dialog
        visible={signOutDialogVisible}
        title="Sign out?"
        description="You can sign back in anytime with your email."
        confirmTitle="Sign out"
        cancelTitle="Stay"
        onConfirm={confirmSignOut}
        onClose={() => setSignOutDialogVisible(false)}
        confirmVariant="destructive"
        testID="dialog-signout"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 110, // Clear the 84px bottom tab bar
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 2,
    borderColor: colors.border,
    marginBottom: 16,
    gap: 16,
  },
  avatarCircleOuter: {
    width: 72,
    height: 72,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEdge: {
    position: 'absolute',
    top: 3,
    left: 0,
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.gold_edge,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.gold,
    borderWidth: 2,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInnerRim: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1.5,
    borderColor: colors.gold_edge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSymbol: {
    fontFamily: typography.fonts.display,
    fontWeight: '800',
    fontSize: 28,
    color: colors.ink,
  },
  profileInfoBox: {
    flex: 1,
    justifyContent: 'center',
  },
  profileName: {
    fontFamily: typography.fonts.display,
    fontWeight: '700',
    fontSize: 20,
    lineHeight: 24,
    color: colors.ink,
  },
  profileEmail: {
    fontFamily: typography.fonts.body,
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink_muted,
    marginTop: 2,
  },
  settingsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 2,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 16,
  },
  settingRow: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingLabel: {
    fontFamily: typography.fonts.body,
    fontWeight: '700',
    fontSize: 15,
    color: colors.ink,
  },
  langSegmentContainer: {
    height: 32,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    padding: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  langSegment: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langSegmentActive: {
    backgroundColor: colors.gold,
    borderBottomWidth: 2,
    borderBottomColor: colors.gold_edge,
  },
  langSegmentText: {
    fontFamily: typography.fonts.display,
    fontWeight: '700',
    fontSize: 13,
    color: colors.ink_muted,
  },
  langSegmentTextActive: {
    color: colors.ink,
  },
  clearRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clearRowText: {
    fontFamily: typography.fonts.body,
    fontWeight: '700',
    fontSize: 15,
    color: colors.expense,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    width: '100%',
  },
  signOutButtonContainer: {
    width: '100%',
  },
  signOutBtn: {
    width: '100%',
  },
});
