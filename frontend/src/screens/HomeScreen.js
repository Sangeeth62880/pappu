import React, { useState, useEffect } from 'react';
import {
  View,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  NavigationContainer,
  NavigationContext,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import Dashboard from '../components/Dashboard';
import ConversationLog from '../components/ConversationLog';
import HistoryScreen from '../components/HistoryScreen';
import PeopleScreen from '../components/PeopleScreen';
import AuthScreen from './AuthScreen';
import MeScreen from './MeScreen';
import PersonDetailScreen from './PersonDetailScreen';
import AppHeader from '../components/ui/AppHeader';
import CustomTabBar from '../components/ui/CustomTabBar';
import Toast from '../components/ui/Toast';
import VoiceListeningSheet from '../components/ui/VoiceListeningSheet';

import { colors, spacing } from '../theme/tokens';
import { getSession, signOut, supabase } from '../api/supabase';
import { undoTransaction, clearChatHistory } from '../api/client';

const RootStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

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
  setVoiceSheetVisible,
  rootNavigation,
  initialTooltipVisible = null,
}) {
  const [currentTab, setCurrentTab] = useState('Home');

  return (
    <SafeAreaView testID="home-screen" style={styles.screen}>
      <StatusBar style="dark" />

      {/* ── App Header (identical on Home, History, People and Me per Stitch) ── */}
      <AppHeader
        screen={currentTab.toLowerCase()}
        onSearchPress={() => {
          // Focus search on History screen
        }}
        onAddPersonPress={() => {
          // Open add contact on People screen
        }}
      />

      {/* ── Tab Navigator with Custom 5-Slot Tab Bar ── */}
      <View style={styles.tabContentContainer}>
        <Tab.Navigator
          tabBar={(tabProps) => (
            <CustomTabBar
              {...tabProps}
              rootNavigation={rootNavigation}
              initialTooltipVisible={initialTooltipVisible}
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

function InnerHomeScreen({
  initialToken = null,
  initialSession = null,
  initialTooltipVisible = null,
}) {
  const [session, setSession] = useState(initialSession);
  const [token, setToken] = useState(initialToken || initialSession?.access_token || null);
  const [authChecking, setAuthChecking] = useState(!initialToken && !initialSession);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
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
  };

  const handleSignOut = async () => {
    try {
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
        <ActivityIndicator size="large" color={colors.gold} />
      </SafeAreaView>
    );
  }

  const userEmail = session?.user?.email || 'Logged In';

  return (
    <View style={styles.container}>
      <RootStack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_bottom',
        }}
      >
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
                  setVoiceSheetVisible={setVoiceSheetVisible}
                  rootNavigation={props.navigation}
                  initialTooltipVisible={initialTooltipVisible}
                />
              )}
            </RootStack.Screen>

            {/* Assistant Modal Stack Screen over tabs */}
            <RootStack.Screen
              name="Assistant"
              options={{
                presentation: 'modal',
                animation: 'slide_from_bottom',
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

            {/* Person Detail Stack Screen */}
            <RootStack.Screen
              name="PersonDetail"
              options={{
                animation: 'slide_from_right',
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

      {/* Toast Notification */}
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
    backgroundColor: colors.bg,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabContentContainer: {
    flex: 1,
  },
});
