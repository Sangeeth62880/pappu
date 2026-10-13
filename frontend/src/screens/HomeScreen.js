import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Dashboard from '../components/Dashboard';
import ConversationLog from '../components/ConversationLog';
import HistoryScreen from '../components/HistoryScreen';
import PeopleScreen from '../components/PeopleScreen';
import AuthScreen from './AuthScreen';
import BottomSheet from '../components/ui/BottomSheet';
import Avatar from '../components/ui/Avatar';
import Button from '../components/ui/Button';
import GlassCard from '../components/ui/GlassCard';
import { colors, radius, shadows, spacing } from '../theme/tokens';
import { getSession, signOut, supabase } from '../api/supabase';
import { undoTransaction } from '../api/client';

const TABS = [
  { key: 'dashboard', label: 'Home', icon: '🏠' },
  { key: 'assistant', label: 'Assistant', icon: '💬' },
  { key: 'history',   label: 'History',   icon: '📜' },
  { key: 'people',    label: 'People',    icon: '👥' },
];

export default function HomeScreen({ initialToken = null, initialSession = null }) {
  const [session, setSession] = useState(initialSession);
  const [token, setToken] = useState(initialToken || initialSession?.access_token || null);
  const [authChecking, setAuthChecking] = useState(!initialToken && !initialSession);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [profileSheetVisible, setProfileSheetVisible] = useState(false);
  const [historyFilter, setHistoryFilter] = useState(null);
  const [selectedPersonId, setSelectedPersonId] = useState(null);

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

  const handleClearMessages = () => {
    setConversationMessages([]);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem('pappu_chat_messages');
      } catch (e) {}
    }
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

  const handleAuthenticated = (newSession) => {
    setSession(newSession);
    setToken(newSession.access_token);
  };

  const handleSignOut = async () => {
    try {
      setProfileSheetVisible(false);
      await signOut();
      setSession(null);
      setToken(null);
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
    } catch (err) {}
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
          />
        );
      case 'history':
        return (
          <HistoryScreen
            token={token}
            refreshTrigger={refreshTrigger}
            initialFilter={historyFilter}
          />
        );
      case 'people':
        return (
          <PeopleScreen
            token={token}
            refreshTrigger={refreshTrigger}
            initialContactId={selectedPersonId}
          />
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView testID="home-screen" style={styles.screen}>
      <StatusBar style="dark" />

      {/* ── 1. Slim Header ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.wordmark}>Pappu</Text>
        </View>

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

      {/* ── 2. Active Tab Screen Content ── */}
      <View style={styles.tabContentContainer}>
        {renderTabContent()}
      </View>

      {/* ── 3. Floating Frosted Bottom Navigation Bar ── */}
      <View style={styles.floatingNavContainer} pointerEvents="box-none">
        <GlassCard style={styles.navGlassCard} padding="none">
          <View style={styles.navRow}>
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;
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
                    <Text style={[styles.navIcon, isActive && styles.navIconActive]}>
                      {tab.icon}
                    </Text>
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
            testID="auth-signout-button"
            onPress={handleSignOut}
            title="Sign Out"
            variant="destructive"
            style={styles.signOutBtn}
          />
        </View>
      </BottomSheet>
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
  wordmark: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.brand.default,
    letterSpacing: -0.5,
  },
  avatarButton: {
    padding: 2,
  },
  tabContentContainer: {
    flex: 1,
  },
  floatingNavContainer: {
    position: 'absolute',
    bottom: 12,
    left: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
  },
  navGlassCard: {
    width: '100%',
    borderRadius: radius['3xl'],
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    ...shadows.lg,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 6,
    paddingHorizontal: 6,
    minHeight: 58,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  indicatorPill: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
  },
  indicatorPillActive: {
    backgroundColor: colors.brand.tint,
  },
  navIcon: {
    fontSize: 18,
    marginBottom: 2,
    opacity: 0.6,
  },
  navIconActive: {
    opacity: 1,
  },
  navLabel: {
    fontSize: 11,
    fontWeight: '600',
    includeFontPadding: false,
  },
  navLabelActive: {
    color: colors.brand.default,
  },
  navLabelInactive: {
    color: colors.text.secondary,
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
