import React from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import HomeScreen from './src/screens/HomeScreen';
import { colors } from './src/theme/tokens';
import './global.css';

export default function App() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <HomeScreen />
      <StatusBar style="dark" />
    </View>
  );
}
