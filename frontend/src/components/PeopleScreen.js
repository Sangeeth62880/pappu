import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Share,
  Animated,
  Modal,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Dimensions,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {
  fetchPeopleSummary,
  fetchContactDetail,
  createContact,
  fetchContactRemindText,
  renameContact,
  mergeContacts,
} from '../api/client';
import { colors, radius, spacing, typography } from '../theme/tokens';
import EmptyState from './ui/EmptyState';
import TransactionEditSheet from './ui/TransactionEditSheet';
import Pappu from './ui/Pappu';
import { useReduceMotion } from '../utils/reduceMotion';
import { queryClient } from '../data/queryClient';
import { queryKeys, invalidateOnTransactionChange } from '../data/queryKeys';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const isTest = (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') || typeof jest !== 'undefined';
const KeyboardWrapper = Platform.OS === 'ios' && !isTest ? KeyboardAvoidingView : View;

/**
 * Returns correctly pluralized friend count ("1 friend", "2 friends", "0 friends").
 */
export function formatFriendCount(count) {
  const n = Number(count) || 0;
  return `${n} ${n === 1 ? 'friend' : 'friends'}`;
}

/**
 * Returns correctly pluralized transaction count ("1 transaction", "2 transactions").
 */
export function formatTransactionCount(count) {
  const n = Number(count) || 0;
  return `${n} ${n === 1 ? 'transaction' : 'transactions'}`;
}

export default function PeopleScreen({
  token,
  refreshTrigger = 0,
  addPersonTrigger = 0,
  initialContactId = null,
  showHeader = true,
  onBack = null,
  onShowToast = null,
  onTransactionMutated = null,
  onSelectPerson = null,
}) {
  const reduceMotion = useReduceMotion();

  // State
  const [peopleData, setPeopleData] = useState(null);
  const [selectedContactId, setSelectedContactId] = useState(initialContactId);
  const [contactDetail, setContactDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState(null);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'owed' | 'owe'

  // Add Person Sheet
  const [addSheetVisible, setAddSheetVisible] = useState(false);
  const [addName, setAddName] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addUpiId, setAddUpiId] = useState('');
  const [addError, setAddError] = useState(null);
  const [savingContact, setSavingContact] = useState(false);

  // Transaction Edit Sheet
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [editSheetVisible, setEditSheetVisible] = useState(false);

  // Remind loading
  const [remindLoading, setRemindLoading] = useState(false);

  // Rename Contact Sheet
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameContactTarget, setRenameContactTarget] = useState(null);
  const [renameName, setRenameName] = useState('');
  const [renameError, setRenameError] = useState(null);
  const [renamingContact, setRenamingContact] = useState(false);

  // Merge Contacts Sheet
  const [mergeModalVisible, setMergeModalVisible] = useState(false);
  const [mergeSourceContact, setMergeSourceContact] = useState(null);
  const [mergeTargetContact, setMergeTargetContact] = useState(null);
  const [mergeKeepContact, setMergeKeepContact] = useState('source');
  const [mergeSearchQuery, setMergeSearchQuery] = useState('');
  const [mergeError, setMergeError] = useState(null);
  const [mergingContacts, setMergingContacts] = useState(false);

  const renameSheetAnim = useRef(new Animated.Value(isTest || reduceMotion ? 0 : SCREEN_HEIGHT)).current;
  const mergeSheetAnim = useRef(new Animated.Value(isTest || reduceMotion ? 0 : SCREEN_HEIGHT)).current;

  // Animation values
  const sheetAnim = useRef(new Animated.Value(isTest || reduceMotion ? 0 : SCREEN_HEIGHT)).current;
  const rowFadeAnim = useRef(new Animated.Value(isTest || reduceMotion ? 1 : 0)).current;

  // React to addPersonTrigger from external header if provided
  useEffect(() => {
    if (addPersonTrigger > 0) {
      setAddError(null);
      setAddSheetVisible(true);
    }
  }, [addPersonTrigger]);

  // Load people list
  const loadPeople = async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await fetchPeopleSummary(token);
      setPeopleData(data);
      if (!reduceMotion && !isTest) {
        rowFadeAnim.setValue(0);
        Animated.timing(rowFadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }
    } catch (err) {
      setError(err.message || 'Failed to load people summary');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPeople();
  }, [token, refreshTrigger]);

  useEffect(() => {
    if (initialContactId) {
      setSelectedContactId(initialContactId);
    }
  }, [initialContactId]);

  // Load contact detail when selected
  const loadDetail = async (contactId) => {
    if (!contactId || !token) {
      setContactDetail(null);
      return;
    }
    try {
      setDetailLoading(true);
      const data = await fetchContactDetail(token, contactId);
      setContactDetail(data);
    } catch (err) {
      setError(err.message || 'Failed to load contact details');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (selectedContactId) {
      loadDetail(selectedContactId);
    } else {
      setContactDetail(null);
    }
  }, [selectedContactId, token, refreshTrigger]);

  // Animate bottom sheet open/close
  useEffect(() => {
    if (isTest) return;
    if (addSheetVisible) {
      if (reduceMotion) {
        sheetAnim.setValue(0);
      } else {
        Animated.spring(sheetAnim, {
          toValue: 0,
          damping: 24,
          stiffness: 260,
          useNativeDriver: true,
        }).start();
      }
    } else {
      if (reduceMotion) {
        sheetAnim.setValue(SCREEN_HEIGHT);
      } else {
        Animated.timing(sheetAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 180,
          useNativeDriver: true,
        }).start();
      }
    }
  }, [addSheetVisible, reduceMotion]);

  useEffect(() => {
    if (isTest) return;
    if (renameModalVisible) {
      if (reduceMotion) {
        renameSheetAnim.setValue(0);
      } else {
        Animated.spring(renameSheetAnim, {
          toValue: 0,
          damping: 24,
          stiffness: 260,
          useNativeDriver: true,
        }).start();
      }
    } else {
      if (reduceMotion) {
        renameSheetAnim.setValue(SCREEN_HEIGHT);
      } else {
        Animated.timing(renameSheetAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 180,
          useNativeDriver: true,
        }).start();
      }
    }
  }, [renameModalVisible, reduceMotion]);

  useEffect(() => {
    if (isTest) return;
    if (mergeModalVisible) {
      if (reduceMotion) {
        mergeSheetAnim.setValue(0);
      } else {
        Animated.spring(mergeSheetAnim, {
          toValue: 0,
          damping: 24,
          stiffness: 260,
          useNativeDriver: true,
        }).start();
      }
    } else {
      if (reduceMotion) {
        mergeSheetAnim.setValue(SCREEN_HEIGHT);
      } else {
        Animated.timing(mergeSheetAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 180,
          useNativeDriver: true,
        }).start();
      }
    }
  }, [mergeModalVisible, reduceMotion]);

  // Close Add Sheet helper
  const handleCloseAddSheet = () => {
    setAddSheetVisible(false);
    setAddName('');
    setAddPhone('');
    setAddUpiId('');
    setAddError(null);
  };

  // Save new contact
  const handleSaveContact = async () => {
    const cleanName = addName.trim();
    if (!cleanName) {
      setAddError('Contact name is required');
      return;
    }

    try {
      setSavingContact(true);
      setAddError(null);

      await createContact(token, {
        name: cleanName,
        phone: addPhone.trim() || null,
        upi_id: addUpiId.trim() || null,
      });

      handleCloseAddSheet();

      if (onShowToast) {
        onShowToast('Contact added');
      }

      // Immediate query invalidation
      try {
        await queryClient.invalidateQueries({ queryKey: queryKeys.people() });
        await queryClient.invalidateQueries({ queryKey: queryKeys.allSummary });
      } catch (_e) {}

      await loadPeople();
    } catch (err) {
      const serverMessage = err.data?.detail || err.message || 'Failed to add contact';
      setAddError(serverMessage);
    } finally {
      setSavingContact(false);
    }
  };

  // Rename Contact handlers
  const handleOpenRename = (contact = null) => {
    const target = contact || contactDetail;
    setRenameContactTarget(target);
    const initialName = target?.contact_name || target?.name || '';
    setRenameName(initialName);
    setRenameError(null);
    setRenameModalVisible(true);
  };

  const handleCloseRename = () => {
    setRenameModalVisible(false);
    setRenameContactTarget(null);
    setRenameName('');
    setRenameError(null);
  };

  const handleSaveRename = async () => {
    const cleanName = renameName.trim();
    if (!cleanName) {
      setRenameError('Contact name is required');
      return;
    }
    const targetId = renameContactTarget?.contact_id || renameContactTarget?.id || selectedContactId;
    if (!targetId || !token) return;

    try {
      setRenamingContact(true);
      setRenameError(null);

      await renameContact(token, targetId, cleanName);

      if (contactDetail && (contactDetail.contact_id === targetId || selectedContactId === targetId)) {
        setContactDetail((prev) => (prev ? { ...prev, contact_name: cleanName } : null));
      }

      handleCloseRename();

      if (onShowToast) {
        onShowToast(`Renamed to ${cleanName}`);
      }

      try {
        await queryClient.invalidateQueries({ queryKey: queryKeys.people() });
        await queryClient.invalidateQueries({ queryKey: queryKeys.allSummary });
      } catch (_e) {}

      await loadPeople();
      if (selectedContactId) {
        await loadDetail(selectedContactId);
      }
    } catch (err) {
      const serverMessage = err.data?.detail || err.message || 'Failed to rename contact';
      setRenameError(serverMessage);
    } finally {
      setRenamingContact(false);
    }
  };

  // Merge Contacts handlers
  const handleOpenMerge = (source = null) => {
    const currentList = peopleData?.contacts || [];
    if (currentList.length < 2) {
      if (onShowToast) {
        onShowToast('Need at least 2 contacts to merge');
      }
      return;
    }
    const resolvedSource = source || (contactDetail ? {
      contact_id: contactDetail.contact_id,
      contact_name: contactDetail.contact_name,
      id: contactDetail.contact_id,
      name: contactDetail.contact_name,
    } : null);

    setMergeSourceContact(resolvedSource);
    setMergeTargetContact(null);
    setMergeKeepContact('source');
    setMergeSearchQuery('');
    setMergeError(null);
    setMergeModalVisible(true);
  };

  const handleCloseMerge = () => {
    setMergeModalVisible(false);
    setMergeSourceContact(null);
    setMergeTargetContact(null);
    setMergeKeepContact('source');
    setMergeSearchQuery('');
    setMergeError(null);
  };

  const handleExecuteMerge = async () => {
    if (!mergeSourceContact || !mergeTargetContact || !token) return;

    const sourceId = mergeSourceContact.contact_id || mergeSourceContact.id;
    const targetId = mergeTargetContact.contact_id || mergeTargetContact.id;

    if (sourceId === targetId) {
      setMergeError('Cannot merge a contact with itself');
      return;
    }

    const primaryId = mergeKeepContact === 'source' ? sourceId : targetId;
    const secondaryId = mergeKeepContact === 'source' ? targetId : sourceId;
    const primaryName = mergeKeepContact === 'source'
      ? (mergeSourceContact.contact_name || mergeSourceContact.name)
      : (mergeTargetContact.contact_name || mergeTargetContact.name);

    try {
      setMergingContacts(true);
      setMergeError(null);

      await mergeContacts(token, {
        primaryContactId: primaryId,
        secondaryContactId: secondaryId,
      });

      handleCloseMerge();

      if (onShowToast) {
        onShowToast(`Merged contacts into ${primaryName}`);
      }

      try {
        await queryClient.invalidateQueries({ queryKey: queryKeys.people() });
        await queryClient.invalidateQueries({ queryKey: queryKeys.allSummary });
      } catch (_e) {}

      await loadPeople();

      // If user was viewing the secondary contact (which was deleted), switch to primary
      if (selectedContactId === secondaryId) {
        setSelectedContactId(primaryId);
      } else if (selectedContactId === primaryId) {
        await loadDetail(primaryId);
      }
    } catch (err) {
      const serverMessage = err.data?.detail || err.message || 'Failed to merge contacts';
      setMergeError(serverMessage);
    } finally {
      setMergingContacts(false);
    }
  };

  // Trigger remind share sheet
  const handleRemind = async () => {
    if (!selectedContactId || !token) return;
    try {
      setRemindLoading(true);
      const data = await fetchContactRemindText(token, selectedContactId);
      const textToShare = data?.remind_text || data?.text;
      if (textToShare) {
        if (Share && typeof Share.share === 'function') {
          await Share.share({ message: textToShare });
        }
      }
    } catch (err) {
      if (onShowToast) {
        onShowToast(err.message || 'Failed to generate reminder');
      }
    } finally {
      setRemindLoading(false);
    }
  };

  // ── DETAIL VIEW ──
  if (selectedContactId && (contactDetail || detailLoading)) {
    if (detailLoading && !contactDetail) {
      return (
        <View testID="people-detail-loading" style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.gold} />
          <Text style={styles.loadingText}>Loading details…</Text>
        </View>
      );
    }

    const net = Number(contactDetail?.net_balance || 0);
    const isOwed = net > 0;
    const youOwe = net < 0;
    const isSettled = net === 0;

    let balanceCaption = 'All settled up';
    if (isOwed) {
      balanceCaption = `${contactDetail.contact_name} owes you`;
    } else if (youOwe) {
      balanceCaption = `You owe ${contactDetail.contact_name}`;
    }

    const txns = contactDetail?.transactions || [];

    return (
      <View style={styles.screenWrapper}>
        <ScrollView
          testID="contact-detail-view"
          style={styles.container}
          contentContainerStyle={styles.detailContentContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Top Bar with Back Arrow & Actions */}
          <View style={styles.detailTopBar}>
            <TouchableOpacity
              testID="back-to-people-button"
              onPress={() => {
                setSelectedContactId(null);
                if (onBack && initialContactId) onBack();
              }}
              style={styles.backCircleBtn}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Feather name="arrow-left" size={20} color={colors.ink} />
            </TouchableOpacity>
            <View style={styles.detailTopBarSpacer} />
            <View style={styles.detailTopBarActions}>
              <TouchableOpacity
                testID="top-bar-rename-button"
                onPress={() => handleOpenRename(contactDetail)}
                style={styles.detailTopActionBtn}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Rename contact"
              >
                <Feather name="edit-2" size={17} color={colors.ink} />
              </TouchableOpacity>
              <TouchableOpacity
                testID="top-bar-merge-button"
                onPress={() => handleOpenMerge(contactDetail)}
                style={styles.detailTopActionBtn}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Merge contact"
              >
                <Feather name="git-merge" size={17} color={colors.ink} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Hero Contact Card */}
          <View style={styles.detailHeroCard}>
            {/* 72px Avatar */}
            <View style={styles.largeAvatar}>
              <Text style={styles.largeAvatarText}>
                {contactDetail?.contact_name?.charAt(0)?.toUpperCase() || 'P'}
              </Text>
            </View>

            {/* Name with Rename touch */}
            <TouchableOpacity
              testID="person-name-touch"
              onPress={() => handleOpenRename(contactDetail)}
              style={styles.detailNameTouch}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Rename contact"
            >
              <Text style={styles.detailName}>{contactDetail?.contact_name}</Text>
              <Feather name="edit-2" size={15} color={colors.ink_muted} style={{ marginLeft: 6, marginBottom: 4 }} />
            </TouchableOpacity>

            {/* Balance Figure */}
            <Text
              testID="person-detail-balance"
              style={[
                styles.detailBalanceAmount,
                isOwed
                  ? { color: colors.income }
                  : youOwe
                  ? { color: colors.expense }
                  : { color: colors.ink_muted },
              ]}
            >
              {isOwed ? '+' : youOwe ? '−' : ''}₹{Math.abs(net).toLocaleString('en-IN')}
            </Text>

            {/* Caption */}
            <Text testID="person-detail-caption" style={styles.detailCaption}>
              {balanceCaption}
            </Text>

            {/* Hero Quick Actions: Rename & Merge Contact */}
            <View style={styles.heroActionsRow}>
              <TouchableOpacity
                testID="hero-rename-button"
                onPress={() => handleOpenRename(contactDetail)}
                style={styles.heroActionBtn}
                activeOpacity={0.7}
              >
                <Feather name="edit-2" size={14} color={colors.ink} style={{ marginRight: 6 }} />
                <Text style={styles.heroActionBtnText}>Rename</Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="hero-merge-button"
                onPress={() => handleOpenMerge(contactDetail)}
                style={styles.heroActionBtn}
                activeOpacity={0.7}
              >
                <Feather name="git-merge" size={14} color={colors.ink} style={{ marginRight: 6 }} />
                <Text style={styles.heroActionBtnText}>Merge contact</Text>
              </TouchableOpacity>
            </View>

            {/* Remind Action Row: Hidden if balance is zero */}
            {!isSettled && (
              <View style={styles.remindActionRow}>
                {/* Pappu Concerned Pose (44px) */}
                <View style={styles.mascotConcernedWrap}>
                  <Pappu mood="concerned" size={40} testID="pappu-mascot-concerned" />
                </View>

                {/* Remind Button */}
                <TouchableOpacity
                  testID="remind-person-button"
                  onPress={handleRemind}
                  style={styles.remindBtn}
                  activeOpacity={0.7}
                  disabled={remindLoading}
                >
                  <Feather name="share-2" size={18} color={colors.ink} style={{ marginRight: 8 }} />
                  <Text style={styles.remindBtnText}>
                    {remindLoading ? 'Opening…' : `Remind ${contactDetail?.contact_name}`}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Transactions Section */}
          <View style={styles.txnsSection}>
            <Text style={styles.txnsSectionTitle}>Transactions</Text>

            {txns.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyCardText}>No transactions found with this contact.</Text>
              </View>
            ) : (
              <View style={styles.txnsCard}>
                {txns.map((txn, index) => {
                  const isIncome = txn.type === 'income';
                  const isLast = index === txns.length - 1;
                  return (
                    <TouchableOpacity
                      key={txn.id}
                      testID={`contact-txn-${txn.id}`}
                      activeOpacity={0.7}
                      onPress={() => {
                        setSelectedTxn(txn);
                        setEditSheetVisible(true);
                      }}
                      style={[styles.txnRow, isLast && { borderBottomWidth: 0 }]}
                    >
                      <View style={styles.txnLeft}>
                        <View style={styles.txnIconWrap}>
                          <MaterialIcons
                            name={isIncome ? 'call-received' : 'shopping-bag'}
                            size={18}
                            color={isIncome ? colors.income : colors.categories.food}
                          />
                        </View>
                        <View style={styles.txnMeta}>
                          <Text style={styles.txnDesc}>
                            {txn.description || (isIncome ? 'Received settlement' : 'Split expense')}
                          </Text>
                          <Text style={styles.txnSub}>
                            {txn.txn_date} · {txn.category_name || 'People'}
                          </Text>
                        </View>
                      </View>
                      <Text
                        style={[
                          styles.txnAmount,
                          { color: isIncome ? colors.income : colors.ink },
                        ]}
                      >
                        {isIncome ? '+' : '−'}₹{Number(txn.amount).toLocaleString('en-IN')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>

        {/* Transaction Edit Bottom Sheet */}
        <TransactionEditSheet
          visible={editSheetVisible}
          onClose={() => {
            setEditSheetVisible(false);
            setSelectedTxn(null);
          }}
          transaction={selectedTxn}
          token={token}
          onSaved={async () => {
            await invalidateOnTransactionChange(queryClient, { contactId: selectedContactId });
            await loadPeople();
            if (selectedContactId) await loadDetail(selectedContactId);
            if (onTransactionMutated) onTransactionMutated();
            if (onShowToast) onShowToast('Transaction updated');
          }}
          onDeleted={async () => {
            await invalidateOnTransactionChange(queryClient, { contactId: selectedContactId });
            await loadPeople();
            if (selectedContactId) await loadDetail(selectedContactId);
            if (onTransactionMutated) onTransactionMutated();
            if (onShowToast) onShowToast('Transaction deleted');
          }}
        />
      </View>
    );
  }

  // ── LIST VIEW ──
  const contacts = peopleData?.contacts || [];
  const totalOwed = Number(peopleData?.total_owed_to_user || 0);
  const totalOwe = Number(peopleData?.total_user_owes || 0);
  const netBalance = totalOwed - totalOwe;

  const owedContacts = contacts.filter((c) => Number(c.net_balance) > 0);
  const oweContacts = contacts.filter((c) => Number(c.net_balance) < 0);

  // Filtered contacts based on search and active chip
  const filteredContacts = contacts.filter((c) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = c.contact_name?.toLowerCase().includes(q);
      const matchPhone = c.phone?.toLowerCase().includes(q);
      const matchUpi = c.upi_id?.toLowerCase().includes(q);
      if (!matchName && !matchPhone && !matchUpi) return false;
    }
    if (activeFilter === 'owed') return Number(c.net_balance) > 0;
    if (activeFilter === 'owe') return Number(c.net_balance) < 0;
    return true;
  });

  if (loading && !peopleData) {
    return (
      <View testID="people-loading" style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.gold} />
        <Text style={styles.loadingText}>Loading people…</Text>
      </View>
    );
  }

  return (
    <View style={styles.screenWrapper}>
      <ScrollView
        testID="people-view"
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Optional Back button if navigated from outside */}
        {onBack && (
          <View style={styles.topNavRow}>
            <TouchableOpacity
              testID="people-back-button"
              onPress={onBack}
              style={styles.backButton}
              accessibilityLabel="Back to Home"
              activeOpacity={0.7}
            >
              <Feather name="arrow-left" size={20} color={colors.ink} />
            </TouchableOpacity>
            <Text style={styles.topNavTitle}>People</Text>
            <View style={{ width: 36 }} />
          </View>
        )}

        {/* Optional Header with Gold Plus */}
        {showHeader && (
          <View style={styles.screenHeader}>
            <View style={styles.headerLeft}>
              <View style={styles.coinMarkOuter}>
                <View style={styles.coinMarkEdge} />
                <View style={styles.coinMarkFace}>
                  <View style={styles.coinInnerRim}>
                    <Text style={styles.coinMarkLetter}>P</Text>
                  </View>
                </View>
              </View>
              <Text style={styles.headerWordmark}>Pappu</Text>
            </View>
            <View style={styles.headerRightActions}>
              {contacts.length > 1 && (
                <TouchableOpacity
                  testID="header-merge-contacts-button"
                  onPress={() => handleOpenMerge(null)}
                  style={styles.headerMergeBtn}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Merge contacts"
                >
                  <Feather name="git-merge" size={16} color={colors.ink} style={{ marginRight: 4 }} />
                  <Text style={styles.headerMergeBtnText}>Merge</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                testID="header-add-person-button"
                onPress={() => {
                  setAddError(null);
                  setAddSheetVisible(true);
                }}
                style={styles.headerAddBtn}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Add person"
              >
                <Feather name="plus" size={20} color={colors.ink} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* 1. Search Bar */}
        <View style={styles.searchBar}>
          <Feather name="search" size={20} color={colors.ink_muted} style={{ marginRight: 10 }} />
          <TextInput
            testID="people-search-input"
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search people"
            placeholderTextColor={colors.ink_muted}
            style={styles.searchInput}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={16} color={colors.ink_muted} />
            </TouchableOpacity>
          )}
        </View>

        {/* 2. Overview Card: Two tiles + Net balance row */}
        <View style={styles.overviewCard}>
          <View style={styles.tilesRow}>
            {/* Tile 1: Owed to you */}
            <View style={styles.tileBox}>
              <Text style={styles.tileLabel}>Owed to you</Text>
              <Text testID="owed-to-you-amount" style={[styles.tileAmount, { color: colors.income }]}>
                ₹{totalOwed.toLocaleString('en-IN')}
              </Text>
              <Text testID="owed-to-you-friends-count" style={styles.tileCount}>
                {formatFriendCount(owedContacts.length)}
              </Text>
            </View>

            {/* Tile 2: You owe */}
            <View style={styles.tileBox}>
              <Text style={styles.tileLabel}>You owe</Text>
              <Text testID="you-owe-amount" style={[styles.tileAmount, { color: colors.expense }]}>
                ₹{totalOwe.toLocaleString('en-IN')}
              </Text>
              <Text testID="you-owe-friends-count" style={styles.tileCount}>
                {formatFriendCount(oweContacts.length)}
              </Text>
            </View>
          </View>

          {/* Divider */}
          <View style={styles.overviewDivider} />

          {/* Net balance row */}
          <View style={styles.netBalanceRow}>
            <Text style={styles.netBalanceLabel}>Net balance</Text>
            <Text
              testID="net-balance-amount"
              style={[
                styles.netBalanceAmount,
                netBalance > 0
                  ? { color: colors.income }
                  : netBalance < 0
                  ? { color: colors.expense }
                  : { color: colors.ink_muted },
              ]}
            >
              {netBalance > 0 ? '+' : netBalance < 0 ? '−' : ''}₹{Math.abs(netBalance).toLocaleString('en-IN')}
            </Text>
          </View>
        </View>

        {/* 3. Filter Chips */}
        <View style={styles.filterChipsRow}>
          {/* All */}
          <TouchableOpacity
            testID="filter-chip-all"
            onPress={() => setActiveFilter('all')}
            style={[
              styles.filterChip,
              activeFilter === 'all' ? styles.filterChipActive : styles.filterChipInactive,
            ]}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.filterChipText,
                activeFilter === 'all' ? styles.filterChipTextActive : styles.filterChipTextInactive,
              ]}
            >
              All {contacts.length}
            </Text>
          </TouchableOpacity>

          {/* Owed to you */}
          <TouchableOpacity
            testID="filter-chip-owed"
            onPress={() => setActiveFilter('owed')}
            style={[
              styles.filterChip,
              activeFilter === 'owed' ? styles.filterChipActive : styles.filterChipInactive,
            ]}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.filterChipText,
                activeFilter === 'owed' ? styles.filterChipTextActive : styles.filterChipTextInactive,
              ]}
            >
              Owed to you {owedContacts.length}
            </Text>
          </TouchableOpacity>

          {/* You owe */}
          <TouchableOpacity
            testID="filter-chip-owe"
            onPress={() => setActiveFilter('owe')}
            style={[
              styles.filterChip,
              activeFilter === 'owe' ? styles.filterChipActive : styles.filterChipInactive,
            ]}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.filterChipText,
                activeFilter === 'owe' ? styles.filterChipTextActive : styles.filterChipTextInactive,
              ]}
            >
              You owe {oweContacts.length}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 4. People List or Empty State */}
        {contacts.length === 0 ? (
          <EmptyState
            testID="people-empty"
            mascotMood="idle"
            title="No contacts yet"
            description="Add a friend to track splits or ask Pappu to log a person transaction."
            actionTitle="Add person"
            onActionPress={() => {
              setAddError(null);
              setAddSheetVisible(true);
            }}
          />
        ) : filteredContacts.length === 0 ? (
          <View style={styles.emptySearchCard}>
            <Text style={styles.emptySearchText}>No matching people found.</Text>
          </View>
        ) : (
          <Animated.View style={[styles.peopleCard, { opacity: rowFadeAnim }]}>
            {filteredContacts.map((c, index) => {
              const netVal = Number(c.net_balance || 0);
              const isPositive = netVal > 0;
              const isNegative = netVal < 0;
              const isLast = index === filteredContacts.length - 1;

              return (
                <TouchableOpacity
                  key={c.contact_id || c.id || index}
                  testID={`contact-card-${c.contact_id || c.id}`}
                  activeOpacity={0.7}
                  onPress={() => {
                    const cid = c.contact_id || c.id;
                    if (onSelectPerson) {
                      onSelectPerson(cid);
                    } else {
                      setSelectedContactId(cid);
                    }
                  }}
                  style={[styles.personRow, isLast && { borderBottomWidth: 0 }]}
                >
                  <View style={styles.personLeft}>
                    {/* Avatar */}
                    <View style={styles.avatarCircle}>
                      <Text style={styles.avatarInitial}>
                        {c.contact_name?.charAt(0)?.toUpperCase() || 'P'}
                      </Text>
                    </View>

                    {/* Name & Count */}
                    <View style={styles.personMeta}>
                      <Text style={styles.personName}>{c.contact_name}</Text>
                      <Text style={styles.personSub}>
                        {formatTransactionCount(c.transaction_count)}
                      </Text>
                    </View>
                  </View>

                  {/* Right Amount & Chevron */}
                  <View style={styles.personRight}>
                    <Text
                      style={[
                        styles.personAmount,
                        isPositive
                          ? { color: colors.income }
                          : isNegative
                          ? { color: colors.expense }
                          : { color: colors.ink_muted },
                      ]}
                    >
                      {isPositive ? '+' : isNegative ? '−' : ''}₹{Math.abs(netVal).toLocaleString('en-IN')}
                    </Text>
                    <Feather name="chevron-right" size={20} color={colors.ink_muted} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </Animated.View>
        )}
      </ScrollView>

      {/* ── ADD PERSON BOTTOM SHEET (Modal Slide) ── */}
      {addSheetVisible && (
        <Modal
          visible={addSheetVisible}
          transparent
          animationType="none"
          onRequestClose={handleCloseAddSheet}
        >
          <KeyboardWrapper
            behavior={Platform.OS === 'ios' && !isTest ? 'padding' : undefined}
            style={styles.sheetOverlay}
          >
          {/* Dimmed Backdrop */}
          <TouchableWithoutFeedback onPress={handleCloseAddSheet}>
            <View style={styles.dimBackdrop} />
          </TouchableWithoutFeedback>

          {/* Animated Sheet */}
          <Animated.View
            testID="add-person-sheet"
            style={[
              styles.sheetContainer,
              !isTest && !reduceMotion && { transform: [{ translateY: sheetAnim }] },
            ]}
          >
            {/* Top Handle */}
            <View style={styles.sheetHandle} />

            {/* Header */}
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Add person</Text>
              <TouchableOpacity
                testID="add-person-close-button"
                onPress={handleCloseAddSheet}
                style={styles.sheetCloseBtn}
                activeOpacity={0.7}
              >
                <Feather name="x" size={18} color={colors.ink} />
              </TouchableOpacity>
            </View>

            {/* Inline Error Banner from 409 or 422 */}
            {addError && (
              <View testID="add-person-error-banner" style={styles.errorBox}>
                <Feather name="alert-circle" size={16} color={colors.expense} style={{ marginRight: 6 }} />
                <Text style={styles.errorBoxText}>{addError}</Text>
              </View>
            )}

            {/* Form Fields */}
            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>Name</Text>
              <View style={styles.inputWrap}>
                <Feather name="user" size={18} color={colors.ink_muted} style={{ marginRight: 10 }} />
                <TextInput
                  testID="add-person-name-input"
                  value={addName}
                  onChangeText={(val) => {
                    setAddName(val);
                    if (addError) setAddError(null);
                  }}
                  placeholder="Name"
                  placeholderTextColor={colors.ink_muted}
                  style={styles.fieldInput}
                  autoFocus={!isTest}
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>Phone (optional)</Text>
              <View style={styles.inputWrap}>
                <Feather name="phone" size={18} color={colors.ink_muted} style={{ marginRight: 10 }} />
                <TextInput
                  testID="add-person-phone-input"
                  value={addPhone}
                  onChangeText={setAddPhone}
                  placeholder="Phone (optional)"
                  keyboardType="phone-pad"
                  placeholderTextColor={colors.ink_muted}
                  style={styles.fieldInput}
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>UPI ID (optional)</Text>
              <View style={styles.inputWrap}>
                <Feather name="credit-card" size={18} color={colors.ink_muted} style={{ marginRight: 10 }} />
                <TextInput
                  testID="add-person-upi-input"
                  value={addUpiId}
                  onChangeText={setAddUpiId}
                  placeholder="UPI ID (optional)"
                  autoCapitalize="none"
                  placeholderTextColor={colors.ink_muted}
                  style={styles.fieldInput}
                />
              </View>
            </View>

            {/* Action Buttons Tray */}
            <View style={styles.sheetButtonsRow}>
              <TouchableOpacity
                testID="add-person-cancel-button"
                onPress={handleCloseAddSheet}
                style={styles.cancelBtn}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="add-person-save-button"
                onPress={handleSaveContact}
                disabled={savingContact}
                style={styles.saveBtn}
                activeOpacity={0.7}
              >
                <Text style={styles.saveBtnText}>
                  {savingContact ? 'Saving…' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </KeyboardWrapper>
      </Modal>
      )}

      {/* ── RENAME CONTACT MODAL ── */}
      {renameModalVisible && (
        <Modal
          visible={renameModalVisible}
          transparent
          animationType="none"
          onRequestClose={handleCloseRename}
        >
          <KeyboardWrapper
            behavior={Platform.OS === 'ios' && !isTest ? 'padding' : undefined}
            style={styles.sheetOverlay}
          >
            <TouchableWithoutFeedback onPress={handleCloseRename}>
              <View style={styles.dimBackdrop} />
            </TouchableWithoutFeedback>

            <Animated.View
              testID="rename-contact-sheet"
              style={[
                styles.sheetContainer,
                !isTest && !reduceMotion && { transform: [{ translateY: renameSheetAnim }] },
              ]}
            >
              <View style={styles.sheetHandle} />

              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Rename contact</Text>
                <TouchableOpacity
                  testID="rename-contact-close-button"
                  onPress={handleCloseRename}
                  style={styles.sheetCloseBtn}
                  activeOpacity={0.7}
                >
                  <Feather name="x" size={18} color={colors.ink} />
                </TouchableOpacity>
              </View>

              {renameError && (
                <View testID="rename-contact-error-banner" style={styles.errorBox}>
                  <Feather name="alert-circle" size={16} color={colors.expense} style={{ marginRight: 6 }} />
                  <Text style={styles.errorBoxText}>{renameError}</Text>
                </View>
              )}

              <View style={styles.formGroup}>
                <Text style={styles.fieldLabel}>New name</Text>
                <View style={styles.inputWrap}>
                  <Feather name="user" size={18} color={colors.ink_muted} style={{ marginRight: 10 }} />
                  <TextInput
                    testID="rename-contact-input"
                    value={renameName}
                    onChangeText={(val) => {
                      setRenameName(val);
                      if (renameError) setRenameError(null);
                    }}
                    placeholder="Enter new name"
                    placeholderTextColor={colors.ink_muted}
                    style={styles.fieldInput}
                    autoFocus={!isTest}
                  />
                </View>
              </View>

              <View style={styles.sheetButtonsRow}>
                <TouchableOpacity
                  testID="rename-contact-cancel-button"
                  onPress={handleCloseRename}
                  style={styles.cancelBtn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  testID="rename-contact-save-button"
                  onPress={handleSaveRename}
                  disabled={renamingContact}
                  style={styles.saveBtn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.saveBtnText}>
                    {renamingContact ? 'Saving…' : 'Save'}
                  </Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </KeyboardWrapper>
        </Modal>
      )}

      {/* ── MERGE CONTACTS MODAL ── */}
      {mergeModalVisible && (
        <Modal
          visible={mergeModalVisible}
          transparent
          animationType="none"
          onRequestClose={handleCloseMerge}
        >
          <KeyboardWrapper
            behavior={Platform.OS === 'ios' && !isTest ? 'padding' : undefined}
            style={styles.sheetOverlay}
          >
            <TouchableWithoutFeedback onPress={handleCloseMerge}>
              <View style={styles.dimBackdrop} />
            </TouchableWithoutFeedback>

            <Animated.View
              testID="merge-contact-sheet"
              style={[
                styles.sheetContainer,
                styles.mergeSheetContainer,
                !isTest && !reduceMotion && { transform: [{ translateY: mergeSheetAnim }] },
              ]}
            >
              <View style={styles.sheetHandle} />

              <View style={styles.sheetHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetTitle}>Merge contacts</Text>
                  <Text style={styles.mergeSubTitle}>
                    {mergeSourceContact
                      ? `Merging with ${mergeSourceContact.contact_name || mergeSourceContact.name}`
                      : 'Select the first contact to merge'}
                  </Text>
                </View>
                <TouchableOpacity
                  testID="merge-contact-close-button"
                  onPress={handleCloseMerge}
                  style={styles.sheetCloseBtn}
                  activeOpacity={0.7}
                >
                  <Feather name="x" size={18} color={colors.ink} />
                </TouchableOpacity>
              </View>

              {mergeError && (
                <View testID="merge-contact-error-banner" style={styles.errorBox}>
                  <Feather name="alert-circle" size={16} color={colors.expense} style={{ marginRight: 6 }} />
                  <Text style={styles.errorBoxText}>{mergeError}</Text>
                </View>
              )}

              {/* STEP 1: Select First Contact (if not yet chosen) */}
              {!mergeSourceContact && (
                <View style={{ gap: 12 }}>
                  <Text style={styles.mergeStepPrompt}>Which contact do you want to merge?</Text>
                  <View style={styles.inputWrap}>
                    <Feather name="search" size={18} color={colors.ink_muted} style={{ marginRight: 10 }} />
                    <TextInput
                      testID="merge-source-search-input"
                      value={mergeSearchQuery}
                      onChangeText={setMergeSearchQuery}
                      placeholder="Search contacts…"
                      placeholderTextColor={colors.ink_muted}
                      style={styles.fieldInput}
                    />
                  </View>
                  <ScrollView style={styles.mergePickerList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                    {contacts
                      .filter((c) =>
                        (c.contact_name || c.name || '')
                          .toLowerCase()
                          .includes(mergeSearchQuery.trim().toLowerCase())
                      )
                      .map((c) => (
                        <TouchableOpacity
                          key={c.contact_id || c.id}
                          testID={`merge-pick-source-${c.contact_id || c.id}`}
                          onPress={() => {
                            setMergeSourceContact(c);
                            setMergeSearchQuery('');
                          }}
                          style={styles.mergePickerRow}
                          activeOpacity={0.7}
                        >
                          <View style={styles.avatarCircleSmall}>
                            <Text style={styles.avatarInitialSmall}>
                              {(c.contact_name || c.name || 'P').charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <Text style={styles.mergePickerRowName}>{c.contact_name || c.name}</Text>
                          <Feather name="arrow-right" size={16} color={colors.ink_muted} />
                        </TouchableOpacity>
                      ))}
                  </ScrollView>
                </View>
              )}

              {/* STEP 2: Select Second Contact to Merge With */}
              {mergeSourceContact && !mergeTargetContact && (
                <View style={{ gap: 12 }}>
                  <View style={styles.mergeSelectedPill}>
                    <Text style={styles.mergeSelectedPillLabel}>First contact:</Text>
                    <Text style={styles.mergeSelectedPillName}>
                      {mergeSourceContact.contact_name || mergeSourceContact.name}
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        setMergeSourceContact(null);
                        setMergeSearchQuery('');
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Feather name="edit-3" size={14} color={colors.ink_muted} />
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.mergeStepPrompt}>
                    Select contact to merge with {mergeSourceContact.contact_name || mergeSourceContact.name}:
                  </Text>

                  <View style={styles.inputWrap}>
                    <Feather name="search" size={18} color={colors.ink_muted} style={{ marginRight: 10 }} />
                    <TextInput
                      testID="merge-contact-search-input"
                      value={mergeSearchQuery}
                      onChangeText={setMergeSearchQuery}
                      placeholder="Search contact to merge with…"
                      placeholderTextColor={colors.ink_muted}
                      style={styles.fieldInput}
                    />
                  </View>

                  <ScrollView style={styles.mergePickerList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                    {contacts
                      .filter((c) => {
                        const sid = mergeSourceContact.contact_id || mergeSourceContact.id;
                        const cid = c.contact_id || c.id;
                        if (cid === sid) return false;
                        return (c.contact_name || c.name || '')
                          .toLowerCase()
                          .includes(mergeSearchQuery.trim().toLowerCase());
                      })
                      .map((c) => (
                        <TouchableOpacity
                          key={c.contact_id || c.id}
                          testID={`merge-pick-target-${c.contact_id || c.id}`}
                          onPress={() => {
                            setMergeTargetContact(c);
                            setMergeKeepContact('source');
                          }}
                          style={styles.mergePickerRow}
                          activeOpacity={0.7}
                        >
                          <View style={styles.avatarCircleSmall}>
                            <Text style={styles.avatarInitialSmall}>
                              {(c.contact_name || c.name || 'P').charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.mergePickerRowName}>{c.contact_name || c.name}</Text>
                            <Text style={styles.mergePickerRowSub}>
                              {formatTransactionCount(c.transaction_count)}
                            </Text>
                          </View>
                          <Feather name="check" size={16} color={colors.gold_edge} />
                        </TouchableOpacity>
                      ))}
                  </ScrollView>
                </View>
              )}

              {/* STEP 3: Confirm Direction & Merge */}
              {mergeSourceContact && mergeTargetContact && (
                <View style={{ gap: 14 }}>
                  <Text style={styles.mergeStepPrompt}>Which contact do you want to keep as primary?</Text>

                  {/* Option A: Keep Source */}
                  <TouchableOpacity
                    testID="merge-keep-source-option"
                    onPress={() => setMergeKeepContact('source')}
                    style={[
                      styles.mergeOptionCard,
                      mergeKeepContact === 'source' && styles.mergeOptionCardActive,
                    ]}
                    activeOpacity={0.8}
                  >
                    <View style={styles.mergeRadioOuter}>
                      {mergeKeepContact === 'source' && <View style={styles.mergeRadioInner} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.mergeOptionTitle}>
                        Keep "{mergeSourceContact.contact_name || mergeSourceContact.name}"
                      </Text>
                      <Text style={styles.mergeOptionDesc}>
                        "{mergeTargetContact.contact_name || mergeTargetContact.name}" will be merged into it and deleted.
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* Option B: Keep Target */}
                  <TouchableOpacity
                    testID="merge-keep-target-option"
                    onPress={() => setMergeKeepContact('target')}
                    style={[
                      styles.mergeOptionCard,
                      mergeKeepContact === 'target' && styles.mergeOptionCardActive,
                    ]}
                    activeOpacity={0.8}
                  >
                    <View style={styles.mergeRadioOuter}>
                      {mergeKeepContact === 'target' && <View style={styles.mergeRadioInner} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.mergeOptionTitle}>
                        Keep "{mergeTargetContact.contact_name || mergeTargetContact.name}"
                      </Text>
                      <Text style={styles.mergeOptionDesc}>
                        "{mergeSourceContact.contact_name || mergeSourceContact.name}" will be merged into it and deleted.
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* Information Callout */}
                  <View style={styles.mergeInfoBox}>
                    <Feather name="info" size={15} color={colors.ink_muted} style={{ marginRight: 8, marginTop: 2 }} />
                    <Text style={styles.mergeInfoText}>
                      All transactions and history from both contacts will be combined. The other name will be preserved as an alias.
                    </Text>
                  </View>

                  {/* Buttons */}
                  <View style={styles.sheetButtonsRow}>
                    <TouchableOpacity
                      testID="merge-contact-change-button"
                      onPress={() => setMergeTargetContact(null)}
                      style={styles.cancelBtn}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.cancelBtnText}>Change</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      testID="merge-contact-confirm-button"
                      onPress={handleExecuteMerge}
                      disabled={mergingContacts}
                      style={styles.saveBtn}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.saveBtnText}>
                        {mergingContacts ? 'Merging…' : 'Confirm Merge'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </Animated.View>
          </KeyboardWrapper>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topNavTitle: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 20,
    color: colors.ink,
  },
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 108,
  },
  detailContentContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 108,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    gap: 8,
  },
  loadingText: {
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 14,
    color: colors.ink_muted,
  },

  /* Header with Gold Plus */
  screenHeader: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerLeft: {
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
    fontFamily: 'BalooChettan2_700Bold',
    fontWeight: '800',
    fontSize: 14,
    lineHeight: 16,
    color: colors.ink,
  },
  headerWordmark: {
    fontFamily: 'BalooChettan2_700Bold',
    fontWeight: '800',
    fontSize: 22,
    lineHeight: 26,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  headerAddBtn: {
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

  /* Search Bar */
  searchBar: {
    height: 52,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.border,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 15,
    color: colors.ink,
    height: '100%',
  },

  /* Overview Card */
  overviewCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
    marginBottom: 16,
  },
  tilesRow: {
    flexDirection: 'row',
    gap: 12,
  },
  tileBox: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 12,
    gap: 4,
  },
  tileLabel: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 13,
    color: colors.ink_muted,
  },
  tileAmount: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '700',
  },
  tileCount: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 12,
    color: colors.ink_muted,
  },
  overviewDivider: {
    height: 1,
    backgroundColor: colors.border,
    width: '100%',
  },
  netBalanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  netBalanceLabel: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 14,
    color: colors.ink,
  },
  netBalanceAmount: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 18,
    fontWeight: '700',
  },

  /* Filter Chips */
  filterChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: {
    backgroundColor: colors.gold,
    borderBottomWidth: 3,
    borderBottomColor: colors.gold_edge,
  },
  filterChipInactive: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
  },
  filterChipText: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 14,
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: colors.ink,
  },
  filterChipTextInactive: {
    color: colors.ink_muted,
  },

  /* People Card & Rows */
  peopleCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  personRow: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  personLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bg,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
  },
  personMeta: {
    flex: 1,
  },
  personName: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
    lineHeight: 22,
  },
  personSub: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 13,
    color: colors.ink_muted,
    marginTop: 1,
  },
  personRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  personAmount: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 17,
    fontWeight: '700',
  },
  emptySearchCard: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySearchText: {
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 14,
    color: colors.ink_muted,
  },

  /* ── Detail View Styles ── */
  detailTopBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  backCircleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailTopBarSpacer: {
    width: 40,
    height: 40,
  },
  detailHeroCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  largeAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.bg,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  largeAvatarText: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 30,
    fontWeight: '700',
    color: colors.ink,
  },
  detailName: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 4,
  },
  detailBalanceAmount: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '800',
    marginBottom: 4,
  },
  detailCaption: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 14,
    color: colors.ink_muted,
    marginBottom: 16,
  },
  remindActionRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mascotConcernedWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  remindBtn: {
    flex: 1,
    height: 52,
    backgroundColor: colors.gold,
    borderRadius: 16,
    borderBottomWidth: 4,
    borderBottomColor: colors.gold_edge,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  remindBtnText: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
  },
  txnsSection: {
    gap: 8,
  },
  txnsSectionTitle: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
  },
  txnsCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  txnRow: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  txnLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  txnIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bg,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txnMeta: {
    flex: 1,
  },
  txnDesc: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    lineHeight: 20,
  },
  txnSub: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 13,
    color: colors.ink_muted,
    marginTop: 2,
  },
  txnAmount: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCardText: {
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 14,
    color: colors.ink_muted,
  },

  /* ── Add Person Sheet Styles ── */
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  dimBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.dim_overlay,
  },
  sheetContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderColor: colors.border,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
    gap: 14,
  },
  sheetHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 24,
    fontWeight: '700',
    color: colors.ink,
  },
  sheetCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bg,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.errorBg || colors.surface,
    borderWidth: 1.5,
    borderColor: colors.expense,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  errorBoxText: {
    flex: 1,
    fontFamily: 'Nunito_700Bold',
    fontSize: 13,
    color: colors.expense,
  },
  formGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 13,
    color: colors.ink,
  },
  inputWrap: {
    height: 52,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.border,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  fieldInput: {
    flex: 1,
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 15,
    color: colors.ink,
    height: '100%',
  },
  sheetButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 8,
  },
  cancelBtn: {
    flex: 1,
    height: 52,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.border,
    borderBottomWidth: 4,
    borderBottomColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
  },
  saveBtn: {
    flex: 1,
    height: 52,
    backgroundColor: colors.gold,
    borderRadius: 16,
    borderBottomWidth: 4,
    borderBottomColor: colors.gold_edge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerMergeBtn: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderBottomWidth: 3,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerMergeBtnText: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 13,
    color: colors.ink,
  },
  detailTopBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailTopActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailNameTouch: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  heroActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 16,
  },
  heroActionBtn: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 19,
    backgroundColor: colors.bg,
    borderWidth: 1.5,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroActionBtnText: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 13,
    color: colors.ink,
  },
  mergeSheetContainer: {
    maxHeight: SCREEN_HEIGHT * 0.85,
  },
  mergeSubTitle: {
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 13,
    color: colors.ink_muted,
    marginTop: 2,
  },
  mergeStepPrompt: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 14,
    color: colors.ink,
  },
  mergePickerList: {
    maxHeight: 220,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
  },
  mergePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 10,
  },
  mergePickerRowName: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 14,
    color: colors.ink,
  },
  mergePickerRowSub: {
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 12,
    color: colors.ink_muted,
    marginTop: 2,
  },
  avatarCircleSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.bg,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitialSmall: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  mergeSelectedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.bg,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: 8,
  },
  mergeSelectedPillLabel: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 13,
    color: colors.ink_muted,
  },
  mergeSelectedPillName: {
    flex: 1,
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  mergeOptionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 12,
  },
  mergeOptionCardActive: {
    borderColor: colors.gold_edge,
    backgroundColor: colors.surface,
  },
  mergeRadioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  mergeRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.gold_edge,
  },
  mergeOptionTitle: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 14,
    color: colors.ink,
  },
  mergeOptionDesc: {
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 12,
    color: colors.ink_muted,
    marginTop: 2,
  },
  mergeInfoBox: {
    flexDirection: 'row',
    padding: 10,
    borderRadius: 12,
    backgroundColor: colors.bg,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  mergeInfoText: {
    flex: 1,
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 12,
    color: colors.ink_muted,
    lineHeight: 16,
  },
});