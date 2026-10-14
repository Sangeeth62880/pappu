import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import BottomSheet from './BottomSheet';
import Button from './Button';
import SegmentedControl from './SegmentedControl';
import { colors, radius, spacing } from '../../theme/tokens';
import { updateTransaction, deleteTransaction } from '../../api/client';

const CATEGORIES = [
  { name: 'Food', icon: 'restaurant', type: 'expense' },
  { name: 'Transport', icon: 'directions-car', type: 'expense' },
  { name: 'Shopping', icon: 'shopping-bag', type: 'expense' },
  { name: 'Bills', icon: 'receipt-long', type: 'expense' },
  { name: 'Entertainment', icon: 'movie', type: 'expense' },
  { name: 'Salary', icon: 'work', type: 'income' },
  { name: 'People', icon: 'groups', type: 'expense' },
  { name: 'Other', icon: 'label', type: 'expense' },
];

export default function TransactionEditSheet({
  visible,
  onClose,
  transaction,
  token,
  onSaved,
  onDeleted,
}) {
  const [type, setType] = useState('expense');
  const [amount, setAmount] = useState('');
  const [categoryName, setCategoryName] = useState('Food');
  const [description, setDescription] = useState('');
  const [txnDate, setTxnDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    if (transaction) {
      setType(transaction.type || 'expense');
      setAmount(transaction.amount ? String(transaction.amount) : '');
      setCategoryName(transaction.category_name || 'Food');
      setDescription(transaction.description || '');
      setTxnDate(transaction.txn_date || new Date().toISOString().split('T')[0]);
      setShowDeleteConfirm(false);
      setErrorMessage(null);
    }
  }, [transaction, visible]);

  const handleSave = async () => {
    if (!token || !transaction?.id) return;
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setErrorMessage('Please enter a valid amount greater than 0.');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);

      const payload = {
        type,
        amount: numAmount,
        category_name: categoryName,
        description: description.trim() || null,
        txn_date: txnDate || new Date().toISOString().split('T')[0],
      };

      const updated = await updateTransaction(token, transaction.id, payload);
      if (onSaved) {
        onSaved(updated);
      }
      onClose();
    } catch (err) {
      setErrorMessage(err.message || 'Failed to update transaction');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!token || !transaction?.id) return;

    try {
      setDeleting(true);
      setErrorMessage(null);
      await deleteTransaction(token, transaction.id);
      if (onDeleted) {
        onDeleted(transaction.id);
      }
      onClose();
    } catch (err) {
      setErrorMessage(err.message || 'Failed to delete transaction');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Edit Transaction"
      testID="transaction-edit-sheet"
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {errorMessage ? (
          <View testID="edit-txn-error" style={styles.errorBox}>
            <MaterialIcons name="error-outline" size={16} color={colors.semantic.expense} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {/* 1. Type Toggle */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Transaction Type</Text>
          <SegmentedControl
            segments={[
              { key: 'expense', label: 'Expense' },
              { key: 'income', label: 'Income' },
            ]}
            selectedKey={type}
            onSelect={(key) => setType(key)}
          />
        </View>

        {/* 2. Amount Input */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Amount (₹)</Text>
          <View style={styles.amountInputRow}>
            <Text style={styles.currencySymbol}>₹</Text>
            <TextInput
              testID="edit-txn-amount-input"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.text.muted}
              style={styles.amountInput}
            />
          </View>
        </View>

        {/* 3. Category Selector */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Category</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryChips}
          >
            {CATEGORIES.map((cat) => {
              const isSelected = categoryName.toLowerCase() === cat.name.toLowerCase();
              return (
                <TouchableOpacity
                  key={cat.name}
                  testID={`edit-txn-category-chip-${cat.name}`}
                  onPress={() => setCategoryName(cat.name)}
                  style={[
                    styles.chip,
                    isSelected && styles.chipSelected,
                  ]}
                  activeOpacity={0.7}
                >
                  <MaterialIcons
                    name={cat.icon}
                    size={15}
                    color={isSelected ? '#FFFFFF' : colors.text.secondary}
                    style={{ marginRight: 5 }}
                  />
                  <Text
                    style={[
                      styles.chipText,
                      isSelected && styles.chipTextSelected,
                    ]}
                  >
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* 4. Description Input */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Note / Description</Text>
          <TextInput
            testID="edit-txn-desc-input"
            value={description}
            onChangeText={setDescription}
            placeholder="Add note (e.g. Lunch with team)"
            placeholderTextColor={colors.text.muted}
            style={styles.input}
          />
        </View>

        {/* 5. Date Input */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
          <TextInput
            testID="edit-txn-date-input"
            value={txnDate}
            onChangeText={setTxnDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.text.muted}
            style={styles.input}
          />
        </View>

        {/* Action Buttons */}
        <View style={styles.actionSection}>
          <Button
            testID="edit-txn-save-button"
            title="Save Changes"
            variant="primary"
            size="lg"
            loading={loading}
            onPress={handleSave}
            style={styles.saveBtn}
          />

          {!showDeleteConfirm ? (
            <Button
              testID="edit-txn-delete-button"
              title="Delete Transaction"
              variant="destructive"
              size="md"
              onPress={() => setShowDeleteConfirm(true)}
              style={styles.deleteBtn}
            />
          ) : (
            <View testID="delete-confirm-box" style={styles.confirmBox}>
              <Text style={styles.confirmPrompt}>Are you sure you want to delete this?</Text>
              <View style={styles.confirmBtnRow}>
                <Button
                  testID="edit-txn-cancel-delete"
                  title="Cancel"
                  variant="secondary"
                  size="sm"
                  onPress={() => setShowDeleteConfirm(false)}
                  style={{ flex: 1 }}
                />
                <Button
                  testID="edit-txn-confirm-delete-button"
                  title="Yes, Delete"
                  variant="destructive"
                  size="sm"
                  loading={deleting}
                  onPress={handleDelete}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xl,
  },
  fieldGroup: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.canvas,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.md,
    height: 52,
  },
  currencySymbol: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text.primary,
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: colors.text.primary,
  },
  input: {
    backgroundColor: colors.canvas,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.md,
    height: 46,
    fontSize: 14,
    color: colors.text.primary,
  },
  categoryChips: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingVertical: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: {
    backgroundColor: colors.brand.default,
    borderColor: colors.brand.default,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
  actionSection: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  saveBtn: {
    width: '100%',
  },
  deleteBtn: {
    width: '100%',
    marginTop: 4,
  },
  confirmBox: {
    backgroundColor: colors.semantic.expenseBg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.semantic.expenseBorder,
    padding: spacing.md,
    marginTop: 4,
  },
  confirmPrompt: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.semantic.expense,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  confirmBtnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.semantic.expenseBg,
    borderColor: colors.semantic.expenseBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  errorText: {
    fontSize: 12,
    color: colors.semantic.expense,
    flex: 1,
  },
});
