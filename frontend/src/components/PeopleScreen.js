import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { fetchPeopleSummary, fetchContactDetail } from '../api/client';
import TransactionRow from './ui/TransactionRow';
import Avatar from './ui/Avatar';
import Card from './ui/Card';

/**
 * PeopleScreen: Person-to-person transaction tracking ("People" category).
 * Displays contact list with net balances, and drills down into per-contact transaction history.
 */
export default function PeopleScreen({ token, refreshTrigger = 0 }) {
  const [peopleData, setPeopleData] = useState(null);
  const [selectedContactId, setSelectedContactId] = useState(null);
  const [contactDetail, setContactDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState(null);

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
    } catch (err) {
      setError(err.message || 'Failed to load people summary');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPeople();
  }, [token, refreshTrigger]);

  // Load detail when a contact is selected
  useEffect(() => {
    if (!selectedContactId || !token) {
      setContactDetail(null);
      return;
    }

    const loadDetail = async () => {
      try {
        setDetailLoading(true);
        const data = await fetchContactDetail(token, selectedContactId);
        setContactDetail(data);
      } catch (err) {
        setError(err.message || 'Failed to load contact details');
      } finally {
        setDetailLoading(false);
      }
    };

    loadDetail();
  }, [selectedContactId, token, refreshTrigger]);

  if (loading && !peopleData) {
    return (
      <View testID="people-loading" className="flex-1 bg-surface-canvas items-center justify-center">
        <ActivityIndicator size="small" color="#2563EB" />
        <Text className="text-text-tertiary font-sans text-xs mt-2">Loading people…</Text>
      </View>
    );
  }

  // ── Contact Detail View ──
  if (selectedContactId && contactDetail) {
    const isOwed = contactDetail.net_balance > 0;
    const youOwe = contactDetail.net_balance < 0;

    return (
      <ScrollView testID="contact-detail-view" className="flex-1 bg-surface-canvas px-5 pt-2">
        {/* Back Button */}
        <TouchableOpacity
          testID="back-to-people-button"
          onPress={() => setSelectedContactId(null)}
          className="flex-row items-center py-3 mb-2"
        >
          <Text className="text-brand-blue font-sans text-xs font-semibold">← Back to People</Text>
        </TouchableOpacity>

        {/* Contact Header Card */}
        <View className="bg-surface-card border border-border-subtle rounded-2xl p-5 mb-4 shadow-sm">
          <View className="flex-row items-center mb-3">
            <Avatar name={contactDetail.contact_name} size="lg" className="mr-3" />
            <View className="flex-1">
              <Text className="text-text-primary text-xl font-bold font-sans">
                {contactDetail.contact_name}
              </Text>
              <Text className="text-text-secondary font-sans text-xs font-medium mt-0.5">
                {contactDetail.display_text}
              </Text>
            </View>
          </View>

          {/* Balance breakdown */}
          <View className="flex-row justify-between pt-3 border-t border-border-subtle">
            <View>
              <Text className="text-text-tertiary font-sans text-[10px] uppercase font-semibold tracking-wider">Total Sent</Text>
              <Text className="text-accent-expense font-sans text-sm font-semibold mt-0.5">
                ₹{Number(contactDetail.total_sent || 0).toFixed(2)}
              </Text>
            </View>
            <View>
              <Text className="text-text-tertiary font-sans text-[10px] uppercase font-semibold tracking-wider">Total Received</Text>
              <Text className="text-accent-income font-sans text-sm font-semibold mt-0.5">
                ₹{Number(contactDetail.total_received || 0).toFixed(2)}
              </Text>
            </View>
            <View>
              <Text className="text-text-tertiary font-sans text-[10px] uppercase font-semibold tracking-wider">Net Balance</Text>
              <Text
                className={`font-sans text-sm font-bold mt-0.5 ${
                  isOwed ? 'text-accent-income' : youOwe ? 'text-accent-expense' : 'text-text-secondary'
                }`}
              >
                ₹{Math.abs(Number(contactDetail.net_balance || 0)).toFixed(2)}
              </Text>
            </View>
          </View>
        </View>

        {/* Transaction History with Contact */}
        <View className="py-2 mb-2">
          <Text className="text-text-tertiary font-sans text-[11px] font-semibold uppercase tracking-wider">
            History with {contactDetail.contact_name} ({contactDetail.transactions?.length || 0})
          </Text>
        </View>

        {(!contactDetail.transactions || contactDetail.transactions.length === 0) ? (
          <View className="bg-surface-card border border-border-subtle rounded-2xl p-6 items-center">
            <Text className="text-text-tertiary font-sans text-xs italic text-center">
              No transactions found with this contact.
            </Text>
          </View>
        ) : (
          <View className="bg-surface-card border border-border-subtle rounded-2xl overflow-hidden shadow-sm">
            {contactDetail.transactions.map((txn, index) => (
              <View
                key={txn.id}
                className={index < contactDetail.transactions.length - 1 ? 'border-b border-border-subtle' : ''}
              >
                <TransactionRow
                  testID={`contact-txn-${txn.id}`}
                  category={txn.category_name || 'People'}
                  description={txn.description || (txn.type === 'expense' ? 'Sent' : 'Received')}
                  amount={txn.amount}
                  type={txn.type}
                  date={txn.txn_date}
                />
              </View>
            ))}
          </View>
        )}

        <View className="h-24" />
      </ScrollView>
    );
  }

  // ── Contact List View ──
  const contacts = peopleData?.contacts || [];
  const totalOwed = Number(peopleData?.total_owed_to_user || 0).toFixed(2);
  const totalOwe = Number(peopleData?.total_user_owes || 0).toFixed(2);

  return (
    <ScrollView testID="people-view" className="flex-1 bg-surface-canvas px-5 pt-2">
      {/* Header */}
      <View className="py-3 mb-1">
        <Text className="text-text-tertiary font-sans text-[11px] font-semibold uppercase tracking-wider">
          People & Debts
        </Text>
      </View>

      {error && (
        <View className="p-3 bg-accent-expense-subtle border border-accent-expense/30 rounded-xl mb-3">
          <Text className="text-accent-expense font-sans text-xs">{error}</Text>
        </View>
      )}

      {/* Aggregate Overview Card */}
      <View className="bg-surface-card border border-border-subtle rounded-2xl p-4 mb-4 flex-row justify-around shadow-sm">
        <View className="items-center flex-1">
          <Text className="text-text-tertiary font-sans text-[10px] uppercase font-semibold tracking-wider mb-1">
            Owed to you
          </Text>
          <Text className="text-accent-income font-sans text-base font-bold">
            ₹{totalOwed}
          </Text>
        </View>
        <View className="h-full w-[1px] bg-border-subtle" />
        <View className="items-center flex-1">
          <Text className="text-text-tertiary font-sans text-[10px] uppercase font-semibold tracking-wider mb-1">
            You owe
          </Text>
          <Text className="text-accent-expense font-sans text-base font-bold">
            ₹{totalOwe}
          </Text>
        </View>
      </View>

      {/* Contacts List */}
      {contacts.length === 0 ? (
        <View className="py-12 items-center bg-surface-card border border-border-subtle rounded-2xl p-6">
          <Text className="text-text-primary font-sans text-sm font-semibold text-center mb-1">
            No person-to-person records yet
          </Text>
          <Text className="text-text-tertiary font-sans text-xs text-center px-4">
            Say something like "I sent 500 to Rahul" or "John paid me back 200" in the Assistant tab.
          </Text>
        </View>
      ) : (
        <View className="gap-2.5">
          {contacts.map((contact) => {
            const isOwed = contact.net_balance > 0;
            const youOwe = contact.net_balance < 0;

            return (
              <TouchableOpacity
                key={contact.contact_id}
                testID={`contact-card-${contact.contact_id}`}
                onPress={() => setSelectedContactId(contact.contact_id)}
                className="bg-surface-card border border-border-subtle rounded-2xl p-4 flex-row items-center justify-between active:bg-surface-canvas shadow-sm"
              >
                <View className="flex-row items-center flex-1 pr-3">
                  <Avatar name={contact.contact_name} size="md" className="mr-3" />
                  <View className="flex-1">
                    <Text className="text-text-primary font-bold text-base font-sans mb-0.5">
                      {contact.contact_name}
                    </Text>
                    <Text className="text-text-tertiary font-sans text-xs">
                      {contact.transaction_count} transaction{contact.transaction_count === 1 ? '' : 's'}
                    </Text>
                  </View>
                </View>

                <View className="items-end">
                  <View
                    className={`px-2.5 py-1 rounded-full ${
                      isOwed
                        ? 'bg-accent-income-subtle border border-accent-income/30'
                        : youOwe
                        ? 'bg-accent-expense-subtle border border-accent-expense/30'
                        : 'bg-surface-canvas-subtle border border-border-subtle'
                    }`}
                  >
                    <Text
                      className={`font-sans text-xs font-semibold ${
                        isOwed
                          ? 'text-accent-income'
                          : youOwe
                          ? 'text-accent-expense'
                          : 'text-text-secondary'
                      }`}
                    >
                      {isOwed
                        ? `+₹${Number(contact.net_balance).toFixed(2)}`
                        : youOwe
                        ? `-₹${Math.abs(Number(contact.net_balance)).toFixed(2)}`
                        : 'Settled'}
                    </Text>
                  </View>
                  <Text className="text-text-tertiary font-sans text-[10px] mt-1 font-medium">
                    {isOwed ? 'Owes you' : youOwe ? 'You owe' : 'All square'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <View className="h-24" />
    </ScrollView>
  );
}
