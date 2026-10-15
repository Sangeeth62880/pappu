import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { colors, radius, spacing } from '../../theme/tokens';
import { useReduceMotion } from '../../utils/reduceMotion';

function hasMalayalam(text) {
  if (!text) return false;
  return /[\u0D00-\u0D7F]/.test(text);
}

function formatAmount(val) {
  const num = Number(val || 0);
  return num.toLocaleString('en-IN');
}

const CATEGORY_COLORS = {
  Food: { bg: colors.bg, text: colors.categories.Food, icon: 'coffee' },
  Transport: { bg: colors.bg, text: colors.categories.Transport, icon: 'truck' },
  Shopping: { bg: colors.bg, text: colors.categories.Shopping, icon: 'shopping-bag' },
  Salary: { bg: colors.bg, text: colors.categories.Salary, icon: 'briefcase' },
  Bills: { bg: colors.bg, text: colors.categories.Bills, icon: 'file-text' },
  Entertainment: { bg: colors.bg, text: colors.categories.Entertainment, icon: 'film' },
  Other: { bg: colors.bg, text: colors.categories.Other, icon: 'tag' },
  People: { bg: colors.bg, text: colors.categories.People, icon: 'users' },
};

/**
 * Shared Transaction Row matching Stitch specifications.
 * - Subtitle uses the transaction type: Income for income, Expense (or Category) for expense.
 * - No arrow glyphs anywhere.
 * - Tabular formatted currency (+₹ / −₹).
 * - Optional isNew slide-in animation over 200ms (translateY -16 -> 0, opacity 0 -> 1).
 */
export default function TransactionRow({
  transaction,
  category,
  description,
  amount,
  type,
  date,
  contactName,
  isLast = false,
  isNew = false,
  onPress,
  testID,
  style,
}) {
  const reduceMotion = useReduceMotion();
  const isTest = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';

  const slideAnim = useRef(new Animated.Value(isNew && !reduceMotion && !isTest ? 0 : 1)).current;

  useEffect(() => {
    if (isNew && !reduceMotion && !isTest) {
      slideAnim.setValue(0);
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [isNew, reduceMotion, isTest, slideAnim]);

  // Normalize props from transaction object or direct props
  const txnType = transaction?.type || type || 'expense';
  const isIncome = txnType === 'income';
  const txnAmount = transaction?.amount !== undefined ? transaction.amount : amount;
  const txnCat = transaction?.category_name || category || '';
  const txnDesc = transaction?.description || description || '';
  const txnContact = transaction?.contact_name || contactName || '';

  const isPeople = Boolean(txnContact || transaction?.contact_id);

  // Title: For contact/person transactions, contact name takes precedence per Stitch spec
  const title = isPeople
    ? txnContact || txnDesc || 'Person'
    : txnDesc || txnCat || (isIncome ? 'Income' : 'Expense');
  const isMalayalam = hasMalayalam(title);

  // Subtitle strictly derived from type (Rule 2 / Prompt 4 fix):
  // Income rows say "Income" (or "Received" if contact transaction)
  // Expense rows say category or "Expense" (or "Sent" if contact transaction)
  const subtitle = isIncome
    ? (isPeople ? 'Received' : 'Income')
    : (isPeople ? 'Sent' : (txnCat || 'Expense'));

  const catConfig = isIncome && !isPeople
    ? CATEGORY_COLORS.Salary
    : isPeople
      ? CATEGORY_COLORS.People
      : CATEGORY_COLORS[txnCat] || CATEGORY_COLORS.Other;

  const rowContent = (
    <View style={[styles.innerRow, style]}>
      {/* 40px Circle Avatar / Category Icon */}
      <View style={[styles.avatarCircle, { backgroundColor: catConfig.bg }]}>
        {isPeople ? (
          <Feather name="users" size={18} color={catConfig.text} />
        ) : (
          <Feather name={catConfig.icon || 'tag'} size={18} color={catConfig.text} />
        )}
      </View>

      {/* Info Column */}
      <View style={styles.infoCol}>
        <Text
          style={[
            styles.titleText,
            isMalayalam && styles.malayalamTitleText,
          ]}
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text style={styles.subtitleText} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>

      {/* Tabular Amount (Strictly No Arrow Glyphs) */}
      <View style={styles.amountCol}>
        <Text
          style={[
            styles.amountText,
            { color: isIncome ? colors.income : colors.expense },
          ]}
        >
          {isIncome ? '+₹' : '−₹'}{formatAmount(txnAmount)}
        </Text>
      </View>
    </View>
  );

  const animatedStyle = {
    opacity: slideAnim,
    transform: [
      {
        translateY: slideAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [-16, 0],
        }),
      },
    ],
  };

  if (onPress) {
    return (
      <Animated.View style={animatedStyle}>
        <TouchableOpacity
          testID={testID}
          activeOpacity={0.7}
          onPress={onPress}
          style={[
            styles.touchableWrapper,
            !isLast && styles.divider,
          ]}
        >
          {rowContent}
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={animatedStyle}>
      <View testID={testID} style={[styles.touchableWrapper, !isLast && styles.divider]}>
        {rowContent}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  touchableWrapper: {
    backgroundColor: colors.surface,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  innerRow: {
    height: 64,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  infoCol: {
    flex: 1,
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  titleText: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 16,
    lineHeight: 20,
    color: colors.ink,
  },
  malayalamTitleText: {
    fontFamily: 'NotoSansMalayalam_700Bold',
    fontSize: 15,
    lineHeight: 21,
  },
  subtitleText: {
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink_muted,
    marginTop: 1,
  },
  amountCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  amountText: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 16,
    lineHeight: 20,
    fontVariant: ['tabular-nums'],
  },
});
