import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Dashboard from '../components/Dashboard';
import ConversationLog from '../components/ConversationLog';
import HistoryScreen from '../components/HistoryScreen';
import PeopleScreen from '../components/PeopleScreen';
import AuthScreen from './AuthScreen';
import { getSession, signOut, supabase } from '../api/supabase';
import { undoTransaction } from '../api/client';

const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: '₹' },
  { key: 'assistant', label: 'Assistant', icon: '💬' },
  { key: 'history',   label: 'History',   icon: '📋' },
  { key: 'people',    label: 'People',    icon: '👥' },
];

export default function HomeScreen({ initialToken = null, initialSession = null }) {
  const [session, setSession] = useState(initialSession);
  const [token, setToken] = useState(initialToken || initialSession?.access_token || null);
  const [authChecking, setAuthChecking] = useState(!initialToken && !initialSession);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [activeTab, setActiveTab] = useState('dashboard');
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
    // Check existing active session on mount
    if (!initialToken && !initialSession) {
      getSession()
        .then((sess) => {
          if (sess?.access_token) {
            setSession(sess);
            setToken(sess.access_token);
          }
        })
        .catch(() => {
          // No session found
        })
        .finally(() => {
          setAuthChecking(false);
        });
    } else {
      setAuthChecking(false);
    }

    // Listen to Supabase auth state changes
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
      await signOut();
      setSession(null);
      setToken(null);
    } catch (err) {
      // Sign out error handling
    }
  };

  const handleTransactionMutated = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleUndo = async () => {
    if (!token) return;
    try {
      await undoTransaction(token);
      handleTransactionMutated();
    } catch (err) {
      // Undo error
    }
  };

  // ── Auth checking state ──
  if (authChecking) {
    return (
      <SafeAreaView testID="auth-loading-screen" className="flex-1 bg-ink-navy items-center justify-center">
        <ActivityIndicator size="large" color="#C9A227" />
        <Text className="text-bone-darker font-sans mt-3 text-sm">Checking session…</Text>
      </SafeAreaView>
    );
  }

  // ── Auth gate ──
  if (!token) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  const userEmail = session?.user?.email || 'Logged In';

  // ── Render active tab content ──
  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard
            token={token}
            refreshTrigger={refreshTrigger}
            onUndo={handleUndo}
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
          />
        );
      case 'people':
        return (
          <PeopleScreen
            token={token}
            refreshTrigger={refreshTrigger}
          />
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView testID="home-screen" className="flex-1 bg-ink-navy">
      {/* ── Header ── */}
      <View className="px-5 py-3 flex-row justify-between items-center border-b border-ink-navy-lighter">
        <Text
          className="text-warm-brass text-xl font-bold tracking-tight"
          style={{ fontFamily: 'Libre Baskerville, Georgia, serif' }}
        >
          Pappu
        </Text>

        <View className="flex-row items-center">
          <Text testID="user-email-header" className="text-bone-darker font-sans text-xs mr-3" numberOfLines={1}>
            {userEmail}
          </Text>
          <TouchableOpacity
            testID="auth-signout-button"
            onPress={handleSignOut}
            className="py-1.5 px-3 rounded-lg border border-ink-navy-lighter active:bg-ink-navy-lighter"
          >
            <Text className="text-bone-darker font-sans text-xs font-medium">Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Tab Content ── */}
      <View className="flex-1">
        {renderTabContent()}
      </View>

      {/* ── Bottom Tab Bar ── */}
      <View className="flex-row bg-ink-navy-light border-t border-ink-navy-lighter">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              testID={`tab-${tab.key}`}
              onPress={() => setActiveTab(tab.key)}
              className="flex-1 items-center py-3"
            >
              <Text className={`text-lg mb-0.5 ${isActive ? '' : 'opacity-40'}`}>
                {tab.icon}
              </Text>
              <Text
                className={`font-sans text-[10px] font-medium uppercase tracking-wider ${
                  isActive ? 'text-warm-brass' : 'text-bone-darker'
                }`}
              >
                {tab.label}
              </Text>
              {/* Active indicator bar */}
              {isActive && (
                <View className="absolute top-0 left-4 right-4 h-[2px] bg-warm-brass rounded-full" />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}
