import React from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import HomeScreen from './src/screens/HomeScreen';
import './global.css';

export default function App() {
  return (
    <View className="flex-1 bg-ink-navy">
      <HomeScreen />
      <StatusBar style="light" />
    </View>
  );
}
