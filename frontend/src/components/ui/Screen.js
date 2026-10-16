import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../../theme/tokens';

export function ScreenBackground() {
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.bg }]} />
    </View>
  );
}

export default function Screen({
  children,
  scrollable = true,
  contentContainerStyle,
  style,
  testID = 'screen',
}) {
  return (
    <SafeAreaView style={[styles.safeArea, style]} edges={['top', 'left', 'right']} testID={testID}>
      <StatusBar style="dark" />
      <ScreenBackground />
      {scrollable ? (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.contentContainer, contentContainerStyle]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.contentContainer, contentContainerStyle]}>
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 108, // Safe padding matching Stitch
  },
});
