import React, { useState, useEffect } from 'react';
import { View, Text, Animated } from 'react-native';

/**
 * Hero balance figure — the visual anchor of the Dashboard tab.
 * Uses serif font for the currency figure, with a single subtle
 * scale+fade animation on first render.
 *
 * Props:
 *   balance    — numeric string, e.g. "12450.00"
 *   income     — numeric string
 *   expense    — numeric string
 *   loading    — boolean, shows placeholder while fetching
 */
export default function Balance({ balance = '0.00', income = '0.00', expense = '0.00', loading = false }) {
  const [fadeAnim] = useState(() => new Animated.Value(0));
  const [scaleAnim] = useState(() => new Animated.Value(0.95));

  useEffect(() => {
    if (!loading) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [loading]);

  if (loading) {
    return (
      <View testID="balance-loading" className="items-center py-8">
        <View className="w-48 h-10 bg-ink-navy-lighter rounded-lg opacity-40" />
        <View className="flex-row mt-4 gap-8">
          <View className="w-20 h-5 bg-ink-navy-lighter rounded opacity-30" />
          <View className="w-20 h-5 bg-ink-navy-lighter rounded opacity-30" />
        </View>
      </View>
    );
  }

  return (
    <Animated.View
      testID="balance-hero"
      style={{ opacity: fadeAnim, transform: [{ scale: scaleAnim }] }}
      className="items-center py-6"
    >
      {/* Label */}
      <Text className="text-bone-darker font-sans text-xs font-medium uppercase tracking-widest mb-2">
        Total Balance
      </Text>

      {/* Hero figure */}
      <Text
        testID="dashboard-balance"
        className="font-serif text-bone text-5xl font-bold tracking-tight"
        style={{ fontFamily: 'Libre Baskerville, Georgia, serif' }}
      >
        ₹{balance}
      </Text>

      {/* Income / Expense pair */}
      <View className="flex-row mt-5 gap-10">
        <View className="items-center">
          <Text className="text-bone-darker font-sans text-[10px] font-medium uppercase tracking-wider mb-1">
            Income
          </Text>
          <Text
            testID="dashboard-income"
            className="font-serif text-banana-leaf text-lg font-bold"
            style={{ fontFamily: 'Libre Baskerville, Georgia, serif' }}
          >
            +₹{income}
          </Text>
        </View>
        <View className="items-center">
          <Text className="text-bone-darker font-sans text-[10px] font-medium uppercase tracking-wider mb-1">
            Expenses
          </Text>
          <Text
            testID="dashboard-expense"
            className="font-serif text-clay-rust text-lg font-bold"
            style={{ fontFamily: 'Libre Baskerville, Georgia, serif' }}
          >
            -₹{expense}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}
