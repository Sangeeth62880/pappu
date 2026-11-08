import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { colors, radius, spacing, typography } from '../theme/tokens';
import { fetchBudgets, setBudget, deleteBudget } from '../api/client';
import { queryKeys } from '../data/queryKeys';
import { formatAmount } from './ui/AmountText';
import Card from './ui/Card';
import Chip from './ui/Chip';
import Input from './ui/Input';
import Button from './ui/Button';
import BottomSheet from './ui/BottomSheet';
import Dialog from './ui/Dialog';

// Mirrors BUDGET_CATEGORIES in backend/app/services/budgets.py (GET /budgets also returns it).
const DEFAULT_CATEGORIES = ['Food', 'Transport', 'Shopping', 'Bills', 'Entertainment', 'Other'];

function fillColor(item) {
  if (item.state === 'over') return colors.expense;
  if (item.state === 'near') return colors.warning;
  return colors.categories[item.category] || colors.categories.Other;
}

function BudgetRow({ item, onPress }) {
  const pct = Math.min(100, Math.max(0, Number(item.percent || 0)));
  const isOver = Number(item.over_by || 0) > 0;
  return (
    <TouchableOpacity
      testID={`budget-row-${item.category}`}
      activeOpacity={0.7}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${item.category} budget`}
      style={styles.row}
    >
      <View style={styles.rowHeader}>
        <View style={styles.nameGroup}>
          <View style={[styles.dot, { backgroundColor: colors.categories[item.category] || colors.categories.Other }]} />
          <Text style={styles.name}>{item.category}</Text>
        </View>
        <Text style={styles.amounts}>
          ₹{formatAmount(item.spent)} of ₹{formatAmount(item.budget)}
        </Text>
      </View>
      <View style={styles.track}>
        <View
          testID={`budget-fill-${item.category}`}
          style={[styles.fill, { width: `${pct}%`, backgroundColor: fillColor(item) }]}
        />
      </View>
      <Text
        testID={`budget-left-${item.category}`}
        style={[styles.caption, isOver && { color: colors.expense }]}
      >
        {isOver ? `₹${formatAmount(item.over_by)} over budget` : `₹${formatAmount(item.remaining)} left`}
      </Text>
    </TouchableOpacity>
  );
}

function BudgetEditSheet({ visible, initial, categories, onClose, onSave, onRemove }) {
  const [category, setCategory] = useState(null);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (visible) {
      setCategory(initial?.category || null);
      setAmount(initial?.budget ? String(initial.budget) : '');
      setError(null);
      setSaving(false);
      setConfirmRemove(false);
      setRemoving(false);
    }
  }, [visible, initial]);

  const isEdit = Boolean(initial?.category);

  const handleSave = async () => {
    const value = parseFloat(amount);
    if (!category) {
      setError('Pick a category.');
      return;
    }
    if (isNaN(value) || value <= 0) {
      setError('Enter an amount greater than 0.');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await onSave(category, value);
    } catch (err) {
      setError(err?.message || 'Could not save the budget. Try again.');
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    try {
      setRemoving(true);
      await onRemove(initial.category);
    } catch (err) {
      setConfirmRemove(false);
      setRemoving(false);
      setError(err?.message || 'Could not remove the budget. Try again.');
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} testID="budget-edit-sheet">
      <Text style={styles.sheetTitle}>{isEdit ? `${initial.category} budget` : 'Set a budget'}</Text>
      {!isEdit ? (
        <View style={styles.chipRow}>
          {categories.map((name) => (
            <Chip
              key={name}
              testID={`budget-category-${name}`}
              label={name}
              selected={category === name}
              dotColor={colors.categories[name] || colors.categories.Other}
              onPress={() => setCategory(name)}
              style={styles.chip}
            />
          ))}
        </View>
      ) : null}
      <Input
        testID="budget-amount-input"
        label="Monthly budget (₹)"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder="5000"
        error={error}
      />
      <Button
        testID="budget-save-button"
        title="Save"
        onPress={handleSave}
        loading={saving}
      />
      {isEdit ? (
        <Button
          testID="budget-remove-button"
          title="Remove budget"
          variant="destructive_outline"
          onPress={() => setConfirmRemove(true)}
          disabled={saving || removing}
          style={styles.removeButton}
        />
      ) : null}
      {isEdit ? (
        <Dialog
          visible={confirmRemove}
          onClose={() => setConfirmRemove(false)}
          mascotMood="concerned"
          title={`Remove the ${initial.category} budget?`}
          description="Your spending stays recorded. You can set a budget again any time."
          cancelTitle="Keep it"
          confirmTitle="Remove"
          confirmVariant="destructive"
          onConfirm={handleRemove}
          loading={removing}
          testID="budget-remove-dialog"
        />
      ) : null}
    </BottomSheet>
  );
}

/**
 * Budgets section: this month's spent vs budget per category, and a sheet to set, edit or
 * remove one. Spent and state come from GET /budgets (the backend's spending definition):
 * the bar turns warning at 80% (state 'near') and red at 100% (state 'over').
 */
export default function BudgetsSection({ token, refreshTrigger = 0 }) {
  const queryClient = useQueryClient();
  const [sheetVisible, setSheetVisible] = useState(false);
  const [editing, setEditing] = useState(null);

  const budgetsQuery = useQuery({
    queryKey: queryKeys.budgets(),
    queryFn: async () => (await fetchBudgets(token)) || null,
    enabled: Boolean(token),
  });

  // Spending changes after any add/edit/delete (typed, voice or sheets).
  useEffect(() => {
    if (token && refreshTrigger > 0) {
      budgetsQuery.refetch();
    }
  }, [refreshTrigger]);

  const budgets = budgetsQuery.data?.budgets || [];
  const categories = budgetsQuery.data?.categories || DEFAULT_CATEGORIES;

  const openSheet = (item) => {
    setEditing(item);
    setSheetVisible(true);
  };

  const closeSheet = () => {
    setSheetVisible(false);
    setEditing(null);
  };

  const handleSave = async (category, amount) => {
    await setBudget(token, category, amount);
    await queryClient.invalidateQueries({ queryKey: queryKeys.budgets() });
    closeSheet();
  };

  const handleRemove = async (category) => {
    await deleteBudget(token, category);
    await queryClient.invalidateQueries({ queryKey: queryKeys.budgets() });
    closeSheet();
  };

  return (
    <Card testID="budgets-card" style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Budgets</Text>
        <Text style={styles.headerCaption}>This month</Text>
      </View>

      {budgets.length === 0 ? (
        <Text testID="budgets-empty" style={styles.empty}>
          No budgets yet. Set one to see how much is left each month.
        </Text>
      ) : (
        <View style={styles.list}>
          {budgets.map((item) => (
            <BudgetRow key={item.category} item={item} onPress={() => openSheet(item)} />
          ))}
        </View>
      )}

      <TouchableOpacity
        testID="budget-add-button"
        activeOpacity={0.7}
        onPress={() => openSheet(null)}
        accessibilityRole="button"
        accessibilityLabel="Set a budget"
        style={styles.addLink}
      >
        <Text style={styles.link}>Set a budget</Text>
      </TouchableOpacity>

      <BudgetEditSheet
        visible={sheetVisible}
        initial={editing}
        categories={categories}
        onClose={closeSheet}
        onSave={handleSave}
        onRemove={handleRemove}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    ...typography.headline_h2,
    color: colors.ink,
  },
  headerCaption: {
    ...typography.caption_bold,
    color: colors.ink_muted,
  },
  empty: {
    ...typography.body_secondary,
    color: colors.ink_muted,
  },
  list: {
    gap: 14,
  },
  row: {
    gap: 6,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nameGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  name: {
    ...typography.body_main,
    color: colors.ink,
  },
  amounts: {
    ...typography.body_amount,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  track: {
    width: '100%',
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  caption: {
    ...typography.caption_bold,
    color: colors.ink_muted,
  },
  addLink: {
    alignItems: 'center',
    paddingTop: spacing.xs,
  },
  link: {
    ...typography.button_label,
    fontSize: 15,
    color: colors.teal,
  },
  sheetTitle: {
    ...typography.headline_h2,
    color: colors.ink,
    marginBottom: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.md,
  },
  chip: {
    marginBottom: spacing.sm,
  },
  removeButton: {
    marginTop: spacing.sm,
  },
});
