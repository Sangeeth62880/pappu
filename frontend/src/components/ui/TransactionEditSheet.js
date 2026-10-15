import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Dimensions,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import Dialog from './Dialog';
import { updateTransaction, deleteTransaction } from '../../api/client';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const CATEGORIES = [
  { name: 'Food', dotColor: colors.categories.Food },
  { name: 'Shopping', dotColor: colors.categories.Shopping },
  { name: 'Transport', dotColor: colors.categories.Transport },
  { name: 'Bills', dotColor: colors.categories.Bills },
  { name: 'Entertainment', dotColor: colors.categories.Entertainment },
  { name: 'Other', dotColor: colors.categories.Other },
];

export default function TransactionEditSheet({
  visible,
  onClose,
  transaction,
  token,
  onSaved,
  onDeleted,
  onSaveTxn = null,
  onDeleteTxn = null,
}) {
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const [type, setType] = useState(transaction?.type || 'expense');
  const [amount, setAmount] = useState(
    transaction?.amount !== undefined ? String(transaction?.amount) : ''
  );
  const [categoryName, setCategoryName] = useState(transaction?.category_name || 'Food');
  const [description, setDescription] = useState(transaction?.description || '');
  const [txnDate, setTxnDate] = useState(
    transaction?.txn_date || new Date().toISOString().split('T')[0]
  );
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const isPersonTxn = Boolean(transaction?.contact_id || transaction?.contact_name);
  const contactName = transaction?.contact_name || '';

  const prevTxnIdRef = useRef(transaction?.id);
  useEffect(() => {
    if (transaction && transaction.id !== prevTxnIdRef.current) {
      prevTxnIdRef.current = transaction.id;
      setType(transaction.type || 'expense');
      setAmount(transaction.amount !== undefined ? String(transaction.amount) : '');
      setCategoryName(transaction.category_name || 'Food');
      setDescription(transaction.description || '');
      setTxnDate(transaction.txn_date || new Date().toISOString().split('T')[0]);
      setShowDeleteConfirm(false);
      setErrorMessage(null);
    }
  }, [transaction?.id]);

  if (!visible) return null;

  const isTest = process.env.NODE_ENV === 'test' || typeof jest !== 'undefined';
  const KeyboardWrapper = Platform.OS === 'ios' && !isTest ? KeyboardAvoidingView : View;

  const handleSave = async () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setErrorMessage('Please enter a valid amount greater than 0.');
      return;
    }

    const payload = {
      type,
      amount: numAmount,
      category_name: categoryName,
      description: description.trim() || null,
      txn_date: txnDate || new Date().toISOString().split('T')[0],
    };

    if (isPersonTxn && transaction?.contact_id) {
      payload.contact_id = transaction.contact_id;
    }

    try {
      setLoading(true);
      setErrorMessage(null);

      let result = null;
      if (onSaveTxn) {
        result = await onSaveTxn(transaction.id, payload);
      } else if (token && transaction?.id) {
        result = await updateTransaction(token, transaction.id, payload);
      }

      if (onSaved) {
        await onSaved(result || payload);
      }
      onClose();
    } catch (err) {
      if (isMounted.current) {
        setErrorMessage(err.message || 'Failed to update transaction');
        setLoading(false);
      }
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      setDeleting(true);
      setShowDeleteConfirm(false);

      if (onDeleteTxn) {
        await onDeleteTxn(transaction.id);
      } else if (token && transaction?.id) {
        await deleteTransaction(token, transaction.id);
      }

      if (onDeleted) {
        await onDeleted(transaction.id);
      }
      onClose();
    } catch (err) {
      if (isMounted.current) {
        setErrorMessage(err.message || 'Failed to delete transaction');
      }
    } finally {
      if (isMounted.current) {
        setDeleting(false);
      }
    }
  };

  const isExpense = type === 'expense';
  const amountColor = isExpense ? colors.expense : colors.income;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      testID="transaction-edit-sheet"
    >
      <TouchableWithoutFeedback onPress={onClose} testID="edit-sheet-backdrop">
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      <KeyboardWrapper
        behavior={Platform.OS === 'ios' && !isTest ? 'padding' : undefined}
        style={styles.sheetContainer}
      >
        <View style={styles.sheetInner}>
          {/* 1. Drag Handle */}
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>

          {/* 2. Title Row */}
          <View style={styles.titleRow}>
            <Text style={styles.sheetTitle}>Edit transaction</Text>
            <TouchableOpacity
              testID="edit-txn-close-btn"
              onPress={onClose}
              style={styles.circleCloseBtn}
              activeOpacity={0.7}
              accessibilityLabel="Close"
            >
              <Feather name="x" size={20} color={colors.ink} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {errorMessage ? (
              <View testID="edit-txn-error" style={styles.errorBox}>
                <Feather name="alert-circle" size={16} color={colors.expense} style={{ marginRight: 6 }} />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            {/* 3. Amount Block */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Amount</Text>
              <View style={styles.amountInputContainer}>
                <Text style={[styles.amountCurrencyPrefix, { color: amountColor }]}>₹</Text>
                <TextInput
                  testID="edit-txn-amount-input"
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.ink_muted}
                  style={[styles.amountInput, { color: amountColor }]}
                />
              </View>
            </View>

            {/* 4. Type / Direction Control */}
            {isPersonTxn ? (
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Direction</Text>
                <View style={styles.segmentedRow}>
                  <TouchableOpacity
                    testID="edit-txn-dir-sent"
                    onPress={() => setType('expense')}
                    style={[
                      styles.segmentBtn,
                      isExpense ? styles.segmentBtnActive : styles.segmentBtnInactive,
                    ]}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.segmentBtnText,
                        isExpense ? styles.segmentBtnTextActive : styles.segmentBtnTextInactive,
                      ]}
                    >
                      You paid
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    testID="edit-txn-dir-received"
                    onPress={() => setType('income')}
                    style={[
                      styles.segmentBtn,
                      !isExpense ? styles.segmentBtnActive : styles.segmentBtnInactive,
                    ]}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.segmentBtnText,
                        !isExpense ? styles.segmentBtnTextActive : styles.segmentBtnTextInactive,
                      ]}
                    >
                      They paid
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Type</Text>
                <View style={styles.segmentedRow}>
                  <TouchableOpacity
                    testID="edit-txn-type-expense"
                    onPress={() => setType('expense')}
                    style={[
                      styles.segmentBtn,
                      isExpense ? styles.segmentBtnActive : styles.segmentBtnInactive,
                    ]}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.segmentBtnText,
                        isExpense ? styles.segmentBtnTextActive : styles.segmentBtnTextInactive,
                      ]}
                    >
                      Expense
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    testID="edit-txn-type-income"
                    onPress={() => setType('income')}
                    style={[
                      styles.segmentBtn,
                      !isExpense ? styles.segmentBtnActive : styles.segmentBtnInactive,
                    ]}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.segmentBtnText,
                        !isExpense ? styles.segmentBtnTextActive : styles.segmentBtnTextInactive,
                      ]}
                    >
                      Income
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* 5. Description Field */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Description</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  testID="edit-txn-desc-input"
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Note or merchant (e.g. Lunch)"
                  placeholderTextColor={colors.ink_muted}
                  style={styles.textInput}
                />
              </View>
            </View>

            {/* 6. Category / Person Block */}
            {isPersonTxn ? (
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Person</Text>
                <View style={styles.personContainer}>
                  <View style={styles.personLeft}>
                    <View style={styles.personAvatarCircle}>
                      <Text style={styles.personAvatarInitial}>
                        {contactName ? contactName.charAt(0).toUpperCase() : 'P'}
                      </Text>
                    </View>
                    <Text style={styles.personNameText}>{contactName || 'Person'}</Text>
                  </View>
                  <Feather name="chevron-right" size={20} color={colors.ink} />
                </View>
              </View>
            ) : (
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Category</Text>
                <View style={styles.categoryChipsWrap}>
                  {CATEGORIES.map((cat) => {
                    const isSelected = categoryName.toLowerCase() === cat.name.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={cat.name}
                        testID={`edit-txn-category-chip-${cat.name}`}
                        onPress={() => setCategoryName(cat.name)}
                        style={[
                          styles.catChip,
                          isSelected ? styles.catChipSelected : styles.catChipUnselected,
                        ]}
                        activeOpacity={0.8}
                      >
                        <View style={[styles.catDot, { backgroundColor: cat.dotColor }]} />
                        <Text
                          style={[
                            styles.catChipText,
                            isSelected ? styles.catChipTextSelected : styles.catChipTextUnselected,
                          ]}
                        >
                          {cat.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* 7. Date Field */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Date</Text>
              <View style={styles.dateContainer}>
                <View style={styles.dateLeft}>
                  <Feather name="calendar" size={20} color={colors.ink} style={{ marginRight: 10 }} />
                  <TextInput
                    testID="edit-txn-date-input"
                    value={txnDate}
                    onChangeText={setTxnDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.ink_muted}
                    style={styles.dateTextInput}
                  />
                </View>
                <Feather name="chevron-right" size={20} color={colors.ink} />
              </View>
            </View>

            {/* 8 & 9. Bottom Action Buttons: Save & Destructive Outline Delete */}
            <View style={styles.actionButtonsContainer}>
              <TouchableOpacity
                testID="edit-txn-save-button"
                onPress={handleSave}
                disabled={loading}
                activeOpacity={0.85}
                style={styles.saveButton}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={colors.ink} />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                testID="edit-txn-delete-button"
                onPress={() => setShowDeleteConfirm(true)}
                disabled={deleting}
                activeOpacity={0.85}
                style={styles.deleteOutlineButton}
              >
                <Feather name="trash-2" size={20} color={colors.expense} style={{ marginRight: 8 }} />
                <Text style={styles.deleteOutlineButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardWrapper>

      {/* Delete Confirmation Dialog matching Stitch delete_dialog.html */}
      <Dialog
        visible={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        mascotMood="concerned"
        title="Delete this transaction?"
        description={
          transaction
            ? `${transaction.description || transaction.category_name || transaction.contact_name || 'Transaction'}, ₹${transaction.amount} on ${transaction.txn_date || 'this date'}. This cannot be undone.`
            : 'This cannot be undone.'
        }
        cancelTitle="Keep it"
        confirmTitle="Delete"
        confirmVariant="destructive"
        onConfirm={handleDeleteConfirm}
        loading={deleting}
        testID="edit-txn-delete-dialog"
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.dim_overlay,
  },
  sheetContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: SCREEN_HEIGHT * 0.88,
  },
  sheetInner: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderColor: colors.border,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['2xl'],
  },
  handleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  sheetTitle: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 24,
    lineHeight: 28,
    color: colors.ink,
  },
  circleCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: spacing.lg,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.errorBg || colors.surface,
    borderWidth: 1,
    borderColor: colors.expense,
    borderRadius: radius.input,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 14,
    color: colors.expense,
    flex: 1,
  },
  fieldGroup: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink_muted,
    marginBottom: 6,
  },
  amountInputContainer: {
    height: 64,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
  },
  amountCurrencyPrefix: {
    fontFamily: 'BalooChettan2_800ExtraBold',
    fontSize: 32,
    lineHeight: 36,
    marginRight: 4,
  },
  amountInput: {
    flex: 1,
    fontFamily: 'BalooChettan2_800ExtraBold',
    fontSize: 32,
    lineHeight: 36,
    fontVariant: ['tabular-nums'],
    padding: 0,
  },
  segmentedRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  segmentBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: colors.gold,
    borderWidth: 1,
    borderColor: colors.ink,
    borderBottomWidth: 3,
    borderBottomColor: colors.gold_edge,
  },
  segmentBtnInactive: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
  },
  segmentBtnText: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 16,
    lineHeight: 20,
  },
  segmentBtnTextActive: {
    color: colors.ink,
  },
  segmentBtnTextInactive: {
    color: colors.ink_muted,
  },
  inputContainer: {
    height: 52,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  textInput: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 15,
    color: colors.ink,
    padding: 0,
  },
  personContainer: {
    height: 52,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  personLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  personAvatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.gold,
    borderWidth: 1,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personAvatarInitial: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 14,
    color: colors.ink,
  },
  personNameText: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 16,
    color: colors.ink,
  },
  categoryChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  catChip: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  catChipSelected: {
    backgroundColor: colors.gold,
    borderWidth: 1,
    borderColor: colors.ink,
    borderBottomWidth: 3,
    borderBottomColor: colors.gold_edge,
  },
  catChipUnselected: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
  },
  catDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  catChipText: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 14,
    lineHeight: 18,
  },
  catChipTextSelected: {
    color: colors.ink,
  },
  catChipTextUnselected: {
    color: colors.ink_muted,
  },
  dateContainer: {
    height: 52,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateTextInput: {
    flex: 1,
    fontFamily: 'Nunito_700Bold',
    fontSize: 15,
    color: colors.ink,
    padding: 0,
  },
  actionButtonsContainer: {
    marginTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  saveButton: {
    width: '100%',
    height: 52,
    backgroundColor: colors.gold,
    borderWidth: 1,
    borderColor: colors.ink,
    borderBottomWidth: 4,
    borderBottomColor: colors.gold_edge,
    borderRadius: radius.input,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 17,
    color: colors.ink,
  },
  deleteOutlineButton: {
    width: '100%',
    height: 52,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.expense,
    borderBottomWidth: 4,
    borderBottomColor: colors.expense,
    borderRadius: radius.input,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  deleteOutlineButtonText: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 17,
    color: colors.expense,
  },
});
