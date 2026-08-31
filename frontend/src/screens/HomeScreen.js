import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Dashboard from '../components/Dashboard';
import ConversationLog from '../components/ConversationLog';
import { getSession } from '../api/supabase';
import { undoTransaction } from '../api/client';

export default function HomeScreen({ initialToken = null }) {
  const [token, setToken] = useState(initialToken);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [language, setLanguage] = useState('en'); // 'en' | 'ml' | 'mixed'
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'split'

  useEffect(() => {
    if (!token) {
      getSession()
        .then((session) => {
          if (session?.access_token) {
            setToken(session.access_token);
          }
        })
        .catch(() => {
          // In test/demo environments without an active Supabase session
        });
    }
  }, [token]);

  const handleTransactionMutated = () => {
    // Live update trigger! Increments refreshTrigger so Dashboard re-fetches immediately
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleUndo = async () => {
    if (!token) return;
    try {
      await undoTransaction(token);
      handleTransactionMutated();
    } catch (err) {
      // Alert user on failure or 404
    }
  };

  return (
    <SafeAreaView testID="home-screen" className="flex-1 bg-slate-950">
      {/* Header */}
      <View className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex-row justify-between items-center">
        <View>
          <Text className="text-xl font-bold text-white tracking-tight">Pappu</Text>
          <Text className="text-slate-400 text-xs">Financial Voice Assistant</Text>
        </View>

        {/* Language selector toggle */}
        <View className="flex-row bg-slate-800 rounded-lg p-0.5 border border-slate-700">
          {['en', 'ml', 'mixed'].map((lang) => (
            <TouchableOpacity
              key={lang}
              testID={`lang-toggle-${lang}`}
              onPress={() => setLanguage(lang)}
              className={`px-2.5 py-1 rounded-md ${
                language === lang ? 'bg-blue-600' : 'bg-transparent'
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  language === lang ? 'text-white' : 'text-slate-400'
                }`}
              >
                {lang.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Main Content Area */}
      <View className="flex-1 flex-col">
        {/* Top: Financial Dashboard (55% flex) */}
        <View className="flex-[5.5]">
          <Dashboard
            token={token}
            refreshTrigger={refreshTrigger}
            onUndo={handleUndo}
          />
        </View>

        {/* Bottom: Interactive Conversation Log (4.5% flex) */}
        <View className="flex-[4.5]">
          <ConversationLog
            token={token}
            onTransactionMutated={handleTransactionMutated}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
