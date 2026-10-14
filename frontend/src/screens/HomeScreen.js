import React, { useState, useEffect, useRef } from 'react';
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
import {
  NavigationContainer,
  NavigationContext,
  useNavigation,
  useNavigationState,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import Dashboard from '../components/Dashboard';
import ConversationLog from '../components/ConversationLog';
import HistoryScreen from '../components/HistoryScreen';
import PeopleScreen from '../components/PeopleScreen';
import AuthScreen from './AuthScreen';
import MeScreen from './MeScreen';
import PersonDetailScreen from './PersonDetailScreen';
import BottomSheet from '../components/ui/BottomSheet';
import Toast from '../components/ui/Toast';
import Avatar from '../components/ui/Avatar';
import Button from '../components/ui/Button';
import VoiceListeningSheet from '../components/ui/VoiceListeningSheet';

import { colors, radius, spacing } from '../theme/tokens';
import { getSession, signOut, supabase } from '../api/supabase';
import { undoTransaction, clearChatHistory } from '../api/client';

const RootStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const TABS = [
  { key: 'Home',    testID: 'tab-dashboard', label: 'Home',      icon: 'account-balance-wallet' },
  { key: 'Assistant', testID: 'tab-assistant', label: 'Assistant', icon: 'mic' },
  { key: 'History', testID: 'tab-history',   label: 'History',   icon: 'receipt-long' },
  { key: 'People',  testID: 'tab-people',    label: 'People',    icon: 'group' },
  { key: 'Me',      testID: 'tab-me',        label: 'Me',        icon: 'person' },
];

function CustomTabBar({ state, navigation, rootNavigation }) {
  const currentTabName = state.routes[state.index]?.name;

  return (
    <View style={styles.floatingNavContainer} pointerEvents="box-none">
      <View style={styles.navGlassCard}>
        <View style={styles.navRow}>
          {TABS.map((tab) => {
            const isActive = currentTabName === tab.key;
            const iconColor = isActive ? colors.brand.default : colors.text.tertiary;

            const handlePress = () => {
              if (tab.key === 'Assistant') {
                if (rootNavigation) {
                  rootNavigation.navigate('Assistant');
                } else {
                  navigation.navigate('Assistant');
                }
              } else {
                navigation.navigate(tab.key);
              }
            };

            return (
              <TouchableOpacity
                key={tab.key}
                testID={tab.testID}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={tab.label}
                onPress={handlePress}
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
      </View>
    </View>
  );
}

function MainTabNavigator({
  token,
  userEmail,
  refreshTrigger,
  handleUndo,
  showToast,
  handleTransactionMutated,
  historyFilter,
  setHistoryFilter,
  selectedPersonId,
  setSelectedPersonId,
  handleClearChatHistory,
  handleSignOut,
  setProfileSheetVisible,
  setVoiceSheetVisible,
  rootNavigation,
}) {
  const [currentTab, setCurrentTab] = useState('Home');

  return (
    <SafeAreaView testID="home-screen" style={styles.screen}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.brandIconBadge}>
            <MaterialIcons name="account-balance-wallet" size={18} color="#FFFFFF" />
          </View>
          <View style={styles.headerTitleBox}>
            <Text style={styles.headerKicker}>Pappu</Text>
            <Text style={styles.wordmark}>{currentTab}</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <View style={styles.langPill}>
            <MaterialIcons name="translate" size={13} color={colors.text.tertiary} style={{ marginRight: 4 }} />
            <Text style={styles.langPillText}>EN / മലയാളം</Text>
          </View>

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

      {/* Tab Navigator */}
      <View style={styles.tabContentContainer}>
        <Tab.Navigator
          tabBar={(tabProps) => (
            <CustomTabBar
              {...tabProps}
              rootNavigation={rootNavigation}
            />
          )}
          screenOptions={{ headerShown: false }}
          backBehavior="firstRoute"
          screenListeners={{
            state: (e) => {
              const route = e.data?.state?.routes[e.data?.state?.index];
              if (route?.name) setCurrentTab(route.name);
            },
          }}
        >
          <Tab.Screen name="Home">
            {(props) => (
              <Dashboard
                {...props}
                token={token}
                refreshTrigger={refreshTrigger}
                onUndo={handleUndo}
                onShowToast={showToast}
                onTransactionMutated={handleTransactionMutated}
                onNavigateToHistory={(filter) => {
                  setHistoryFilter(filter);
                  props.navigation.navigate('History');
                }}
                onNavigateToPeople={(personId) => {
                  setSelectedPersonId(personId);
                  props.navigation.navigate('People');
                }}
              />
            )}
          </Tab.Screen>

          <Tab.Screen name="History">
            {(props) => (
              <HistoryScreen
                {...props}
                token={token}
                refreshTrigger={refreshTrigger}
                initialFilter={historyFilter}
                onShowToast={showToast}
                onTransactionMutated={handleTransactionMutated}
                onBack={() => {
                  setHistoryFilter(null);
                  props.navigation.navigate('Home');
                }}
              />
            )}
          </Tab.Screen>

          <Tab.Screen name="People">
            {(props) => (
              <PeopleScreen
                {...props}
                token={token}
                refreshTrigger={refreshTrigger}
                initialContactId={selectedPersonId}
                onShowToast={showToast}
                onTransactionMutated={handleTransactionMutated}
                onSelectPerson={(personId) => {
                  rootNavigation.navigate('PersonDetail', { contactId: personId });
                }}
                onBack={() => {
                  setSelectedPersonId(null);
                  props.navigation.navigate('Home');
                }}
              />
            )}
          </Tab.Screen>

          <Tab.Screen name="Me">
            {(props) => (
              <MeScreen
                {...props}
                userEmail={userEmail}
                onClearChatHistory={handleClearChatHistory}
                onSignOut={handleSignOut}
              />
            )}
          </Tab.Screen>
        </Tab.Navigator>
      </View>
    </SafeAreaView>
  );
}

function InnerHomeScreen({ initialToken = null, initialSession = null }) {
  const [session, setSession] = useState(initialSession);
  const [token, setToken] = useState(initialToken || initialSession?.access_token || null);
  const [authChecking, setAuthChecking] = useState(!initialToken && !initialSession);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
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

  const handleAuthenticated = (newSession) => {
    setSession(newSession);
    setToken(newSession?.access_token || null);
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

  if (authChecking) {
    return (
      <SafeAreaView testID="auth-loading-screen" style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.brand.default} />
        <Text style={styles.loadingText}>Checking session…</Text>
      </SafeAreaView>
    );
  }

  const userEmail = session?.user?.email || 'Logged In';

  return (
    <View style={styles.container}>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {!token ? (
          <RootStack.Screen name="Auth">
            {(props) => <AuthScreen {...props} onAuthenticated={handleAuthenticated} />}
          </RootStack.Screen>
        ) : (
          <>
            <RootStack.Screen name="Main">
              {(props) => (
                <MainTabNavigator
                  {...props}
                  token={token}
                  userEmail={userEmail}
                  refreshTrigger={refreshTrigger}
                  handleUndo={handleUndo}
                  showToast={showToast}
                  handleTransactionMutated={handleTransactionMutated}
                  historyFilter={historyFilter}
                  setHistoryFilter={setHistoryFilter}
                  selectedPersonId={selectedPersonId}
                  setSelectedPersonId={setSelectedPersonId}
                  handleClearChatHistory={handleClearChatHistory}
                  handleSignOut={handleSignOut}
                  setProfileSheetVisible={setProfileSheetVisible}
                  setVoiceSheetVisible={setVoiceSheetVisible}
                  rootNavigation={props.navigation}
                />
              )}
            </RootStack.Screen>

            <RootStack.Screen
              name="Assistant"
              options={{
                presentation: 'modal',
                headerShown: false,
              }}
            >
              {(props) => (
                <ConversationLog
                  {...props}
                  token={token}
                  onTransactionMutated={handleTransactionMutated}
                  messages={conversationMessages}
                  setMessages={handleUpdateMessages}
                  onClearMessages={handleClearMessages}
                  onBack={() => props.navigation.goBack()}
                />
              )}
            </RootStack.Screen>

            <RootStack.Screen
              name="PersonDetail"
              options={{
                headerShown: false,
              }}
            >
              {(props) => (
                <PersonDetailScreen
                  {...props}
                  token={token}
                  onShowToast={showToast}
                  onTransactionMutated={handleTransactionMutated}
                />
              )}
            </RootStack.Screen>
          </>
        )}
      </RootStack.Navigator>

      {/* Profile Bottom Sheet */}
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

      {/* Toast */}
      <Toast
        testID="home-toast"
        visible={toastVisible}
        message={toastMessage}
        actionText="Undo"
        onAction={handleUndo}
        onDismiss={() => setToastVisible(false)}
      />

      {/* Voice Listening Sheet */}
      <VoiceListeningSheet
        visible={voiceSheetVisible}
        onClose={() => setVoiceSheetVisible(false)}
        token={token}
        onTransactionMutated={handleTransactionMutated}
        setMessages={handleUpdateMessages}
      />
    </View>
  );
}

export default function HomeScreen(props) {
  const hasParentNavigation = React.useContext(NavigationContext);
  if (hasParentNavigation) {
    return <InnerHomeScreen {...props} />;
  }
  return (
    <NavigationContainer>
      <InnerHomeScreen {...props} />
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
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
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
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
