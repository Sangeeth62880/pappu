import React, { useState, useEffect } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { colors, radius, shadows, spacing } from '../../theme/tokens';
import Skeleton from './Skeleton';

/**
 * Hero Glass Card for Dashboard — matched to stitch/home.html.
 * Frosted translucent glass card with ambient blue tint, tabular figures, and clean secondary metrics.
 */
export default function Balance({
  balance = '0.00',
  income = '0.00',
  expense = '0.00',
  loading = false,
  title = 'Spent this week',
  deltaText,
  isLowerDelta = false,
}) {
  const [fadeAnim] = useState(() => new Animated.Value(0));
  const [scaleAnim] = useState(() => new Animated.Value(0.97));

  useEffect(() => {
    if (!loading) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [loading]);

  if (loading) {
    return (
      <View testID="balance-loading" style={styles.loadingCard}>
        <Skeleton width={120} height={16} borderRadius={radius.sm} />
        <Skeleton width={180} height={40} borderRadius={radius.md} style={{ marginVertical: spacing.md }} />
        <View style={styles.secondaryRow}>
          <Skeleton width={80} height={20} borderRadius={radius.sm} />
          <Skeleton width={80} height={20} borderRadius={radius.sm} />
        </View>
      </View>
    );
  }

  return (
    <Animated.View
      testID="balance-hero"
      style={[
        styles.heroContainer,
        { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
      ]}
    >
      <LinearGradient
        colors={['rgba(255,255,255,0.98)', 'rgba(255,255,255,0.90)', 'rgba(219,225,255,0.40)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        {/* Top Header & Delta comparison */}
        <View style={styles.headerRow}>
          <Text style={styles.titleText}>{title}</Text>
          {deltaText ? (
            <View
              style={[
                styles.deltaBadge,
                isLowerDelta ? styles.deltaGreen : styles.deltaRed,
              ]}
            >
              <MaterialIcons
                name={isLowerDelta ? 'arrow-downward' : 'arrow-upward'}
                size={12}
                color={isLowerDelta ? colors.semantic.income : colors.semantic.expense}
                style={{ marginRight: 2 }}
              />
              <Text
                style={[
                  styles.deltaBadgeText,
                  { color: isLowerDelta ? colors.semantic.income : colors.semantic.expense },
                ]}
              >
                {deltaText}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Hero Figure */}
        <View style={styles.amountRow}>
          <Text
            testID="dashboard-balance"
            style={styles.heroAmount}
            numberOfLines={1}
            adjustsFontSizeToFit={true}
          >
            ₹{balance}
          </Text>
        </View>

        {/* Ambient Hairline Separator */}
        <View style={styles.hairlineDivider} />

        {/* Secondary Figures Grid */}
        <View style={styles.secondaryGrid}>
          <View style={styles.subCol}>
            <Text style={styles.subLabel}>Income</Text>
            <Text testID="dashboard-income" style={styles.incomeAmount}>
              +₹{income}
            </Text>
          </View>
          <View style={styles.verticalDivider} />
          <View style={[styles.subCol, { paddingLeft: spacing.md }]}>
            <Text style={styles.subLabel}>Net</Text>
            <Text testID="dashboard-expense" style={styles.expenseAmount}>
              -₹{expense}
            </Text>
          </View>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  loadingCard: {
    backgroundColor: colors.surface,
    borderRadius: radius['3xl'],
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 180,
    justifyContent: 'center',
    ...shadows.hero,
  },
  heroContainer: {
    borderRadius: radius['3xl'],
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    ...shadows.hero,
    overflow: 'hidden',
  },
  gradient: {
    padding: spacing.xl,
    borderRadius: radius['3xl'],
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  titleText: {
    color: colors.text.secondary,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  deltaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  deltaGreen: {
    backgroundColor: colors.semantic.incomeBg,
  },
  deltaRed: {
    backgroundColor: colors.semantic.expenseBg,
  },
  deltaBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  amountRow: {
    marginVertical: spacing.xs,
  },
  heroAmount: {
    color: colors.text.primary,
    fontSize: 38,
    lineHeight: 46,
    fontWeight: '800',
    letterSpacing: -0.8,
    fontVariant: ['tabular-nums'],
  },
  hairlineDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  secondaryGrid: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subCol: {
    flex: 1,
  },
  subLabel: {
    color: colors.text.secondary,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
    letterSpacing: 0.3,
  },
  incomeAmount: {
    color: colors.text.primary,
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  expenseAmount: {
    color: colors.semantic.expense,
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  verticalDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: spacing.xl,
  },
});
