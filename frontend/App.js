import React from 'react';
import { View, Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import "./global.css";

export default function App() {
  return (
    <View className="flex-1 items-center justify-center bg-slate-900">
      <Text className="text-2xl font-bold text-white mb-2">Pappu</Text>
      <Text className="text-slate-400 text-base">Bilingual voice-first financial assistant</Text>
      <StatusBar style="light" />
    </View>
  );
}
