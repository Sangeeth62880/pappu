import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';

SplashScreen.preventAutoHideAsync().catch(() => {});
import {
  BalooChettan2_600SemiBold,
  BalooChettan2_700Bold,
  BalooChettan2_800ExtraBold,
} from '@expo-google-fonts/baloo-chettan-2';
import {
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
} from '@expo-google-fonts/nunito';
import {
  NotoSansMalayalam_600SemiBold,
  NotoSansMalayalam_700Bold,
} from '@expo-google-fonts/noto-sans-malayalam';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './src/data/queryClient';
import HomeScreen from './src/screens/HomeScreen';
import StyleguideScreen from './src/screens/StyleguideScreen';
import StartupHealthGate from './src/components/ui/StartupHealthGate';
import { colors } from './src/theme/tokens';
import './global.css';

export default function App({ initialShowStyleguide = false }) {
  const [showStyleguide, setShowStyleguide] = useState(() => {
    if (initialShowStyleguide) return true;
    if (typeof window !== 'undefined' && window.location?.search?.includes('styleguide')) {
      return true;
    }
    return false;
  });

  const [fontsLoaded] = useFonts({
    BalooChettan2_600SemiBold,
    BalooChettan2_700Bold,
    BalooChettan2_800ExtraBold,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    NotoSansMalayalam_600SemiBold,
    NotoSansMalayalam_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded && showStyleguide) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, showStyleguide]);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }} testID="splash-gate">
        <ActivityIndicator size="large" color={colors.gold} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <StartupHealthGate>
            {showStyleguide ? (
              <StyleguideScreen onBack={() => setShowStyleguide(false)} />
            ) : (
              <HomeScreen />
            )}
          </StartupHealthGate>
          <StatusBar style="dark" />
        </View>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
