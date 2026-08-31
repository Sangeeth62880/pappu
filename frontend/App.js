import React from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import HomeScreen from './src/screens/HomeScreen';
import './global.css';

export default function App() {
  return (
    <View className="flex-1 bg-slate-950">
      <HomeScreen />
      <StatusBar style="light" />
    </View>
  );
}
