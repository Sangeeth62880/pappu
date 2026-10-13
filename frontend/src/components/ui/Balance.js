import React, { useState, useEffect } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, shadows, spacing } from '../../theme/tokens';
import Skeleton from './Skeleton';

/**
 * Hero Card figure — visual anchor of the Dashboard.
 * Confident brand blue gradient with white text and a frosted secondary strip.
 *
 * Props:
 *   balance       — numeric string, e.g. "12450.00" (Spent in period)
 *   income        — numeric string
 *   expense       — numeric string
 *   loading       — boolean
 *   title         — string (default: "Spent this week")
 *   deltaText     — string (optional delta comparison vs previous period)
 *   isLowerDelta  — boolean (true if spent less than previous period)
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
  const [scaleAnim] = useState(() => new Animated.Value(0.96));

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
        shadows.hero,
        { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
      ]}
    >
      <LinearGradient
        colors={[colors.brand.darker, colors.brand.default]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        {/* Top Header & Delta */}
        <View style={styles.headerRow}>
          <Text style={styles.titleText}>{title}</Text>
          {deltaText ? (
            <View
              style={[
                styles.deltaBadge,
                isLowerDelta ? styles.deltaGreen : styles.deltaRed,
              ]}
            >
              <Text style={styles.deltaBadgeText}>
                {isLowerDelta ? '↓ ' : '↑ '}
                {deltaText}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Hero Figure */}
        <Text
          testID="dashboard-balance"
          style={styles.heroAmount}
          numberOfLines={1}
          adjustsFontSizeToFit={true}
        >
          ₹{balance}
        </Text>

        {/* Frosted Secondary Figures Strip */}
        <View style={styles.frostedStrip}>
          <View style={styles.subFigureCol}>
            <Text style={styles.subLabel}>Income</Text>
            <Text testID="dashboard-income" style={styles.incomeAmount}>
              +₹{income}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.subFigureCol}>
            <Text style={styles.subLabel}>Expenses</Text>
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
  },
  heroContainer: {
    borderRadius: radius['3xl'],
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
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  deltaBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  deltaGreen: {
    backgroundColor: 'rgba(220, 252, 231, 0.25)',
  },
  deltaRed: {
    backgroundColor: 'rgba(254, 226, 226, 0.25)',
  },
  deltaBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  heroAmount: {
    color: '#FFFFFF',
    fontSize: 38,
    lineHeight: 48,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    marginVertical: spacing.sm,
  },
  frostedStrip: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: radius.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  subFigureCol: {
    flex: 1,
    alignItems: 'center',
  },
  subLabel: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  incomeAmount: {
    color: '#A7F3D0', // Soft mint green on blue
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  expenseAmount: {
    color: '#FECACA', // Soft red-coral on blue
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: spacing.xl,
  },
});
