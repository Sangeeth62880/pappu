import React, { useState, useEffect, useCallback, useRef, useContext, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Switch,
  Animated,
  AccessibilityInfo,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import {
  useQuery,
  useMutation,
  useQueryClient,
  QueryClientContext,
  QueryClientProvider,
  QueryClient,
} from '@tanstack/react-query';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { queryKeys } from '../data/queryKeys';
import { fetchProfile, patchProfile } from '../api/client';
import Dialog from '../components/ui/Dialog';
import Button from '../components/ui/Button';
import BottomSheet from '../components/ui/BottomSheet';
import MascotDevToggle from '../components/ui/MascotDevToggle';
import { useReduceMotion } from '../utils/reduceMotion';
import * as Haptics from 'expo-haptics';

/**
 * Me Screen (Profile & Settings)
 * Visual source of truth: Stitch design spec & DESIGN.md
 * - Profile Card (72px avatar with ₹, user name, email)
 * - Settings Card (Language switcher, Voice replies switch, Clear chat history row)
 * - Sign Out button (Destructive outline)
 * - Dialogs: "Clear chat history?" (Pappu concerned) and "Sign out?" (Pappu happy/waving)
 *
 * No Dialect row. No hyphens or em dashes in user facing strings.
 */

const LANGUAGE_SEGMENTS = [
  { key: 'en', label: 'English' },
  { key: 'ml', label: 'മലയാളം' },
];

/**
 * Tactile Switch Toggle matching Stitch Me screen specifications.
 * Track: 48x28 rounded-full, gold on with gold_edge border, bg off with border.
 * Thumb: 20x20 rounded-full in solid ink (#1F2937), translates 20px over 140ms.
 */
function TactileSwitch({
  value,
  onValueChange,
  testID = 'voice-replies-toggle',
  disabled = false,
  accessibilityLabel = 'Voice replies',
}) {
  const reduceMotion = useReduceMotion();
  const isTest = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';
  const transX = useRef(new Animated.Value(value ? 20 : 0)).current;

  useEffect(() => {
    if (reduceMotion || isTest) {
      transX.setValue(value ? 20 : 0);
    } else {
      Animated.timing(transX, {
        toValue: value ? 20 : 0,
        duration: 140,
        useNativeDriver: true,
      }).start();
    }
  }, [value, reduceMotion, isTest]);

  const handleToggle = () => {
    if (disabled) return;
    if (!isTest) {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      } catch (_) {}
    }
    if (onValueChange) {
      onValueChange(!value);
    }
  };

  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: Boolean(value) }}
      activeOpacity={0.85}
      onPress={handleToggle}
      onValueChange={onValueChange}
      style={[
        styles.switchTrack,
        value ? styles.switchTrackOn : styles.switchTrackOff,
      ]}
    >
      <Animated.View
        testID={`${testID}-thumb`}
        style={[
          styles.switchThumb,
          { transform: [{ translateX: transX }] },
        ]}
      />
    </TouchableOpacity>
  );
}

function MeScreenInner({
  token,
  userEmail = 'test@pappu.dev',
  userName = null,
  onClearChatHistory,
  onSignOut,
}) {
  const queryClient = useQueryClient();
  const reduceMotion = useReduceMotion();

  // ── Profile Query ──
  const { data: profile } = useQuery({
    queryKey: queryKeys.profile(),
    queryFn: () => fetchProfile(token),
    enabled: !!token,
    staleTime: 1000 * 60 * 5,
  });

  // ── Local state synced from profile ──
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [voiceReplies, setVoiceReplies] = useState(true);
  const [clearChatDialogVisible, setClearChatDialogVisible] = useState(false);
  const [signOutDialogVisible, setSignOutDialogVisible] = useState(false);
  const [mascotDevVisible, setMascotDevVisible] = useState(false);
  const [clearingChat, setClearingChat] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Sync local state when profile loads
  useEffect(() => {
    if (profile) {
      if (profile.language) setSelectedLanguage(profile.language);
      if (profile.voice_replies !== undefined && profile.voice_replies !== null) {
        setVoiceReplies(profile.voice_replies);
      }
    }
  }, [profile]);

  const displayName = userName || profile?.name || (userEmail ? userEmail.split('@')[0] : 'User');
  const displayEmail = profile?.email || userEmail;

  // ── Toggle slide animation for voice replies ──
  const toggleAnim = useRef(new Animated.Value(voiceReplies ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      toggleAnim.setValue(voiceReplies ? 1 : 0);
    } else {
      Animated.timing(toggleAnim, {
        toValue: voiceReplies ? 1 : 0,
        duration: 200,
        useNativeDriver: false,
      }).start();
    }
  }, [voiceReplies, reduceMotion]);

  // ── Preferences Mutation ──
  const prefsMutation = useMutation({
    mutationFn: (updates) => patchProfile(token, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.profile() });
    },
  });

  const handleLanguageToggle = useCallback((lang) => {
    setSelectedLanguage(lang);
    prefsMutation.mutate({ language: lang });
  }, [prefsMutation]);

  const handleVoiceToggle = useCallback((val) => {
    setVoiceReplies(val);
    prefsMutation.mutate({ voice_replies: val });
  }, [prefsMutation]);

  // ── Clear Chat ──
  const confirmClearChat = useCallback(async () => {
    setClearingChat(true);
    try {
      if (onClearChatHistory) {
        await onClearChatHistory();
      }
      // Invalidate chat query cache
      queryClient.invalidateQueries({ queryKey: queryKeys.chatHistory() });
    } finally {
      setClearingChat(false);
      setClearChatDialogVisible(false);
    }
  }, [onClearChatHistory, queryClient]);

  // ── Sign Out ──
  const confirmSignOut = useCallback(async () => {
    setSigningOut(true);
    try {
      if (onSignOut) {
        await onSignOut();
      }
    } finally {
      setSigningOut(false);
      setSignOutDialogVisible(false);
    }
  }, [onSignOut]);

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
            {displayEmail}
          </Text>
        </View>
      </View>

      {/* ── 2. Settings Card ── */}
      <View style={styles.settingsCard}>
        {/* Row 1: Language Preference */}
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Language</Text>
          <View style={styles.langSegmentContainer}>
            {LANGUAGE_SEGMENTS.map((seg) => (
              <TouchableOpacity
                key={seg.key}
                testID={`lang-segment-${seg.key}`}
                onPress={() => handleLanguageToggle(seg.key)}
                style={[
                  styles.langSegment,
                  selectedLanguage === seg.key && styles.langSegmentActive,
                ]}
                activeOpacity={0.8}
                accessibilityRole="tab"
                accessibilityState={{ selected: selectedLanguage === seg.key }}
                accessibilityLabel={`Language ${seg.label}`}
              >
                <Text
                  style={[
                    styles.langSegmentText,
                    selectedLanguage === seg.key && styles.langSegmentTextActive,
                  ]}
                >
                  {seg.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.divider} />

        {/* Row 2: Voice Replies Switch (Tactile Stitch Switch) */}
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Voice replies</Text>
          <TactileSwitch
            testID="voice-replies-toggle"
            value={voiceReplies}
            onValueChange={handleVoiceToggle}
            accessibilityLabel="Voice replies"
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

        {/* Row 4: Mascot Showcase Dev Toggle (gated to __DEV__ development environment) */}
        {__DEV__ ? (
          <>
            <View style={styles.divider} />
            <TouchableOpacity
              testID="profile-mascot-dev-button"
              onPress={() => setMascotDevVisible(true)}
              style={styles.settingRow}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Mascot showcase"
            >
              <View style={styles.clearRowLeft}>
                <Feather name="smile" size={18} color={colors.ink} style={{ marginRight: 10 }} />
                <Text style={[styles.settingLabel, { color: colors.ink }]}>Mascot showcase</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.ink_muted} />
            </TouchableOpacity>
          </>
        ) : null}
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
        loading={clearingChat}
        testID="dialog-clear-chat"
        mascotMood="concerned"
        mascotSize={72}
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
        loading={signingOut}
        testID="dialog-signout"
        mascotMood="happy"
        mascotSize={72}
      />

      {/* ── Mascot Showcase Dev Sheet ── */}
      <BottomSheet
        visible={mascotDevVisible}
        onClose={() => setMascotDevVisible(false)}
        testID="mascot-dev-bottom-sheet"
      >
        <Text style={[typography.headline_h2, { color: colors.ink, marginBottom: 12 }]}>
          Mascot Showcase
        </Text>
        <MascotDevToggle />
      </BottomSheet>
    </ScrollView>
  );
}

export default function MeScreen(props) {
  const existingClient = useContext(QueryClientContext);
  const clientToUse = useMemo(() => {
    if (existingClient) return null;
    return new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: 0, gcTime: 0 },
      },
    });
  }, [existingClient]);

  if (!existingClient) {
    return (
      <QueryClientProvider client={clientToUse}>
        <MeScreenInner {...props} />
      </QueryClientProvider>
    );
  }
  return <MeScreenInner {...props} />;
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
    height: 36,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    padding: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
  switchTrack: {
    width: 48,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    padding: 2,
    justifyContent: 'center',
  },
  switchTrackOn: {
    backgroundColor: colors.gold,
    borderColor: colors.gold_edge,
  },
  switchTrackOff: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
  },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.ink,
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
