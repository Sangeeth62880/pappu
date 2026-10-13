import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../theme/tokens';

export function ScreenBackground() {
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {/* Base Canvas */}
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.canvas }]} />

      {/* Subtle top pastel glow (soft brand blue) */}
      <LinearGradient
        colors={['rgba(219, 234, 254, 0.45)', 'rgba(238, 242, 255, 0.2)', 'transparent']}
        style={styles.topGlow}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
      />

      {/* Subtle mid pastel glow (hint of emerald/mint) */}
      <LinearGradient
        colors={['rgba(209, 250, 229, 0.2)', 'transparent']}
        style={styles.midGlow}
        start={{ x: 1, y: 0.4 }}
        end={{ x: 0, y: 0.9 }}
      />
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
    backgroundColor: colors.canvas,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 100, // Room for bottom floating navigation bar
  },
  topGlow: {
    position: 'absolute',
    top: -50,
    left: -50,
    right: -50,
    height: 320,
    borderRadius: 160,
  },
  midGlow: {
    position: 'absolute',
    top: 250,
    right: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
  },
});
