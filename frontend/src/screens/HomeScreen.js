import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  BackHandler,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Dashboard from '../components/Dashboard';
import ConversationLog from '../components/ConversationLog';
import HistoryScreen from '../components/HistoryScreen';
import PeopleScreen from '../components/PeopleScreen';
import AuthScreen from './AuthScreen';
import BottomSheet from '../components/ui/BottomSheet';
import Toast from '../components/ui/Toast';
import Avatar from '../components/ui/Avatar';
import Button from '../components/ui/Button';
import GlassCard from '../components/ui/GlassCard';
import VoiceListeningSheet from '../components/ui/VoiceListeningSheet';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { colors, radius, shadows, spacing } from '../theme/tokens';
import { getSession, signOut, supabase } from '../api/supabase';
import { undoTransaction, clearChatHistory } from '../api/client';

const TABS = [
  { key: 'dashboard', label: 'Home', icon: 'account-balance-wallet' },
  { key: 'assistant', label: 'Assistant', icon: 'mic' },
  { key: 'history',   label: 'History',   icon: 'receipt-long' },
  { key: 'people',    label: 'People',    icon: 'group' },
];

export default function HomeScreen({ initialToken = null, initialSession = null }) {
  const [session, setSession] = useState(initialSession);
  const [token, setToken] = useState(initialToken || initialSession?.access_token || null);
  const [authChecking, setAuthChecking] = useState(!initialToken && !initialSession);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [profileSheetVisible, setProfileSheetVisible] = useState(false);
  const [voiceSheetVisible, setVoiceSheetVisible] = useState(false);
  const [historyFilter, setHistoryFilter] = useState(null);
  const [selectedPersonId, setSelectedPersonId] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [toastVisible, setToastVisible] = useState(false);

  const showToast = (message) => {
    setToastMessage(message);
    setToastVisible(true);
  };

  const [conversationMessages, setConversationMessages] = useState(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const cached = window.localStorage.getItem('pappu_chat_messages');
        if (cached) return JSON.parse(cached);
      } catch (e) {}
    }
    return [];
  });

  const handleUpdateMessages = (updater) => {
    setConversationMessages((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          window.localStorage.setItem('pappu_chat_messages', JSON.stringify(next));
        } catch (e) {}
      }
      return next;
    });
  };

  const handleClearMessages = async () => {
    setConversationMessages([]);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem('pappu_chat_messages');
      } catch (e) {}
    }
    if (token && typeof clearChatHistory === 'function') {
      try {
        const p = clearChatHistory(token);
        if (p && typeof p.then === 'function') await p;
      } catch (e) {}
    }
  };

  const handleClearChatHistory = async () => {
    await handleClearMessages();
    setProfileSheetVisible(false);
    showToast('Chat history cleared');
  };

  useEffect(() => {
    if (!initialToken && !initialSession) {
      getSession()
        .then((sess) => {
          if (sess?.access_token) {
            setSession(sess);
            setToken(sess.access_token);
          }
        })
        .catch(() => {})
        .finally(() => {
          setAuthChecking(false);
        });
    } else {
      setAuthChecking(false);
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      setToken(currentSession?.access_token || null);
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, [initialToken, initialSession]);

  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // ── Keyboard Visibility Listener (hides floating nav bar when typing) ──
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // ── Android Hardware Back Button Navigation Handler ──
  useEffect(() => {
    const onBackPress = () => {
      // 1. Close voice sheet if open
      if (voiceSheetVisible) {
        setVoiceSheetVisible(false);
        return true;
      }
      // 2. Close profile sheet if open
      if (profileSheetVisible) {
        setProfileSheetVisible(false);
        return true;
      }
      // 3. Return from Contact Detail to People list
      if (activeTab === 'people' && selectedPersonId) {
        setSelectedPersonId(null);
        return true;
      }
      // 4. Return from filtered History to Dashboard
      if (activeTab === 'history' && historyFilter) {
        setHistoryFilter(null);
        setActiveTab('dashboard');
        return true;
      }
      // 5. Return from any non-root tab to Dashboard
      if (activeTab !== 'dashboard') {
        setActiveTab('dashboard');
        return true;
      }
      // 6. At root dashboard: allow system default (exit app)
      return false;
    };

    const backSubscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => backSubscription.remove();
  }, [voiceSheetVisible, profileSheetVisible, activeTab, selectedPersonId, historyFilter]);

  const handleAuthenticated = (newSession) => {
    setSession(newSession);
    setToken(newSession?.access_token || null);
    setActiveTab('dashboard');
    setHistoryFilter(null);
    setSelectedPersonId(null);
    setProfileSheetVisible(false);
  };

  const handleSignOut = async () => {
    try {
      setProfileSheetVisible(false);
      await signOut();
      setSession(null);
      setToken(null);
      setActiveTab('dashboard');
      setHistoryFilter(null);
      setSelectedPersonId(null);
    } catch (err) {}
  };

  const handleTransactionMutated = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleUndo = async () => {
    if (!token) return;
    try {
      await undoTransaction(token);
      handleTransactionMutated();
      showToast('Action undone successfully');
    } catch (err) {
      showToast(err.message || 'Failed to undo');
    }
  };

  const handleNavigateToHistory = (filter = null) => {
    setHistoryFilter(filter);
    setActiveTab('history');
  };

  const handleNavigateToPeople = (personId = null) => {
    setSelectedPersonId(personId);
    setActiveTab('people');
  };

  if (authChecking) {
    return (
      <SafeAreaView testID="auth-loading-screen" style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.brand.default} />
        <Text style={styles.loadingText}>Checking session…</Text>
      </SafeAreaView>
    );
  }

  if (!token) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  const userEmail = session?.user?.email || 'Logged In';
  const userInitial = userEmail ? userEmail[0].toUpperCase() : 'P';

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard
            token={token}
            refreshTrigger={refreshTrigger}
            onUndo={handleUndo}
            onShowToast={showToast}
            onTransactionMutated={handleTransactionMutated}
            onNavigateToHistory={handleNavigateToHistory}
            onNavigateToPeople={handleNavigateToPeople}
          />
        );
      case 'assistant':
        return (
          <ConversationLog
            token={token}
            onTransactionMutated={handleTransactionMutated}
            messages={conversationMessages}
            setMessages={handleUpdateMessages}
            onClearMessages={handleClearMessages}
            onBack={() => setActiveTab('dashboard')}
          />
        );
      case 'history':
        return (
          <HistoryScreen
            token={token}
            refreshTrigger={refreshTrigger}
            initialFilter={historyFilter}
            onShowToast={showToast}
            onTransactionMutated={handleTransactionMutated}
            onBack={() => {
              setHistoryFilter(null);
              setActiveTab('dashboard');
            }}
          />
        );
      case 'people':
        return (
          <PeopleScreen
            token={token}
            refreshTrigger={refreshTrigger}
            initialContactId={selectedPersonId}
            onShowToast={showToast}
            onTransactionMutated={handleTransactionMutated}
            onBack={() => {
              setSelectedPersonId(null);
              setActiveTab('dashboard');
            }}
          />
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView testID="home-screen" style={styles.screen}>
      <StatusBar style="dark" />

      {/* ── 1. Header with Brand Badge, Wordmark & Language Pill (Stitch) ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.brandIconBadge}>
            <MaterialIcons
              name={
                activeTab === 'dashboard'
                  ? 'account-balance-wallet'
                  : activeTab === 'assistant'
                  ? 'mic'
                  : activeTab === 'history'
                  ? 'receipt-long'
                  : 'group'
              }
              size={18}
              color="#FFFFFF"
            />
          </View>
          <View style={styles.headerTitleBox}>
            <Text style={styles.headerKicker}>Pappu</Text>
            <Text style={styles.wordmark}>
              {activeTab === 'dashboard'
                ? 'Home'
                : activeTab === 'assistant'
                ? 'Assistant'
                : activeTab === 'history'
                ? 'History'
                : 'People'}
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <View style={styles.langPill}>
            <MaterialIcons name="translate" size={13} color={colors.text.tertiary} style={{ marginRight: 4 }} />
            <Text style={styles.langPillText}>EN / മലയാളം</Text>
          </View>

          {activeTab !== 'assistant' && (
            <TouchableOpacity
              testID="header-mic-button"
              onPress={() => setVoiceSheetVisible(true)}
              style={styles.headerMicBtn}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Quick voice input"
            >
              <MaterialIcons name="mic" size={20} color={colors.brand.default} />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            testID="profile-avatar-button"
            onPress={() => setProfileSheetVisible(true)}
            style={styles.avatarButton}
            accessibilityRole="button"
            accessibilityLabel="Open profile"
          >
            <Avatar name={userEmail} size={36} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 2. Active Tab Screen Content ── */}
      <View style={styles.tabContentContainer}>
        {renderTabContent()}
      </View>

      {/* ── 3. Floating Frosted Bottom Navigation Bar ── */}
      {!keyboardVisible && (
        <View style={styles.floatingNavContainer} pointerEvents="box-none">
          <GlassCard style={styles.navGlassCard} padding="none">
            <View style={styles.navRow}>
              {TABS.map((tab) => {
                const isActive = activeTab === tab.key;
                const iconColor = isActive ? colors.brand.default : colors.text.tertiary;
                return (
                  <TouchableOpacity
                    key={tab.key}
                    testID={`tab-${tab.key}`}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: isActive }}
                    accessibilityLabel={tab.label}
                    onPress={() => {
                      if (tab.key !== 'history') setHistoryFilter(null);
                      if (tab.key !== 'people') setSelectedPersonId(null);
                      setActiveTab(tab.key);
                    }}
                    style={styles.navItem}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.indicatorPill,
                        isActive && styles.indicatorPillActive,
                      ]}
                    >
                      <MaterialIcons
                        name={tab.icon}
                        size={20}
                        color={iconColor}
                        style={styles.navIcon}
                      />
                      <Text
                        style={[
                          styles.navLabel,
                          isActive ? styles.navLabelActive : styles.navLabelInactive,
                        ]}
                        numberOfLines={1}
                      >
                        {tab.label}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </GlassCard>
        </View>
      )}

      {/* ── 4. Profile Bottom Sheet ── */}
      <BottomSheet
        visible={profileSheetVisible}
        onClose={() => setProfileSheetVisible(false)}
      >
        <View style={styles.profileSheetContent}>
          <View style={styles.profileAvatarRow}>
            <Avatar name={userEmail} size={54} />
            <View style={styles.profileEmailBox}>
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

          <View style={styles.profileDivider} />

          <Button
            testID="profile-clear-chat-button"
            onPress={handleClearChatHistory}
            title="Clear Chat History"
            variant="outline"
            style={{ marginBottom: spacing.md }}
          />

          <Button
            testID="auth-signout-button"
            onPress={handleSignOut}
            title="Sign Out"
            variant="destructive"
            style={styles.signOutBtn}
          />
        </View>
      </BottomSheet>

      {/* ── 5. Notification Toast with Undo Action ── */}
      <Toast
        testID="home-toast"
        visible={toastVisible}
        message={toastMessage}
        actionText="Undo"
        onAction={handleUndo}
        onDismiss={() => setToastVisible(false)}
      />

      {/* ── 6. Voice Listening Sheet from Header Mic (Accessible from Home, History, People) ── */}
      <VoiceListeningSheet
        visible={voiceSheetVisible}
        onClose={() => setVoiceSheetVisible(false)}
        token={token}
        onTransactionMutated={handleTransactionMutated}
        setMessages={handleUpdateMessages}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: colors.text.secondary,
    marginTop: spacing.md,
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.canvas,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandIconBadge: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: colors.brand.default,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    ...shadows.sm,
  },
  headerTitleBox: {
    flexDirection: 'column',
    justifyContent: 'center',
  },
  headerKicker: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.text.tertiary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  wordmark: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: -0.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  langPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  headerMicBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.brand.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
  },
  avatarButton: {
    padding: 2,
  },
  tabContentContainer: {
    flex: 1,
  },
  floatingNavContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 14 : 10,
    left: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
    zIndex: 100,
  },
  navGlassCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.75)',
    ...shadows.floatingNav,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 6,
    paddingHorizontal: 6,
    minHeight: 56,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  indicatorPill: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    minWidth: 56,
    minHeight: 44,
  },
  indicatorPillActive: {
    backgroundColor: colors.brand.tint,
  },
  navIcon: {
    marginBottom: 2,
  },
  navLabel: {
    fontSize: 10,
    fontWeight: '600',
    includeFontPadding: false,
  },
  navLabelActive: {
    color: colors.brand.default,
  },
  navLabelInactive: {
    color: colors.text.tertiary,
  },
  profileSheetContent: {
    paddingTop: spacing.xs,
  },
  profileAvatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  profileEmailBox: {
    marginLeft: spacing.lg,
    flex: 1,
  },
  profileLabel: {
    fontSize: 12,
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  profileEmail: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
    marginTop: 2,
  },
  profileDivider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginBottom: spacing.xl,
  },
  signOutBtn: {
    width: '100%',
  },
});
