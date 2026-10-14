import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { colors, radius, spacing, typography } from '../../theme/tokens';

/**
 * App Header identical on Home, History, People and Me.
 * Visual source of truth: Stitch HTML (home.html, history.html, people.html, me.html)
 * Left: 32px coin mark with inner rim and 'P', followed by Baloo 800 22px "Pappu" wordmark.
 * Right: Screen-specific action only (History: search 40px circle, People: add 40px gold circle, Home/Me: blank).
 * Strictly NO language chip, NO avatar, NO status text, NO gradients.
 */
export default function AppHeader({
  screen = 'home',
  onSearchPress,
  onAddPersonPress,
  style,
}) {
  return (
    <View style={[styles.headerContainer, style]}>
      {/* Left: Brand Coin Mark & Wordmark */}
      <View style={styles.leftBrandGroup}>
        {/* 32px Coin Mark */}
        <View style={styles.coinMarkOuter}>
          <View style={styles.coinMarkEdge} />
          <View style={styles.coinMarkFace}>
            <View style={styles.coinInnerRim}>
              <Text style={styles.coinMarkLetter}>P</Text>
            </View>
          </View>
        </View>

        {/* Pappu Wordmark */}
        <Text style={styles.wordmark}>Pappu</Text>
      </View>

      {/* Right Side per Screen Spec */}
      <View style={styles.rightActionGroup}>
        {screen === 'history' ? (
          <TouchableOpacity
            testID="header-search-button"
            onPress={onSearchPress}
            style={styles.searchButton}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Search transactions"
          >
            <Feather name="search" size={20} color={colors.ink} />
          </TouchableOpacity>
        ) : screen === 'people' ? (
          <TouchableOpacity
            testID="header-add-person-button"
            onPress={onAddPersonPress}
            style={styles.addPersonButton}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Add person"
          >
            <Feather name="plus" size={20} color={colors.ink} />
          </TouchableOpacity>
        ) : (
          <View style={styles.blankPlaceholder} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    height: 64,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bg,
  },
  leftBrandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  coinMarkOuter: {
    width: 32,
    height: 32,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinMarkEdge: {
    position: 'absolute',
    top: 2,
    left: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.gold_edge,
  },
  coinMarkFace: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.gold,
    borderWidth: 2,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinInnerRim: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.gold_edge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinMarkLetter: {
    fontFamily: typography.fonts.display,
    fontWeight: '800',
    fontSize: 14,
    lineHeight: 16,
    color: colors.ink,
    textAlign: 'center',
  },
  wordmark: {
    fontFamily: typography.fonts.display,
    fontWeight: '800',
    fontSize: 22,
    lineHeight: 26,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  rightActionGroup: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPersonButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.gold,
    borderWidth: 2,
    borderColor: colors.ink,
    borderBottomWidth: 3,
    borderBottomColor: colors.gold_edge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blankPlaceholder: {
    width: 40,
    height: 40,
  },
});
