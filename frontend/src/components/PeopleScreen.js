import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { fetchPeopleSummary, fetchContactDetail } from '../api/client';
import TransactionRow from './ui/TransactionRow';

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
      <View testID="people-loading" className="flex-1 bg-ink-navy items-center justify-center">
        <ActivityIndicator size="small" color="#C9A227" />
        <Text className="text-bone-darker font-sans text-xs mt-2">Loading people…</Text>
      </View>
    );
  }

  // ── Contact Detail View ──
  if (selectedContactId && contactDetail) {
    const isOwed = contactDetail.net_balance > 0;
    const youOwe = contactDetail.net_balance < 0;

    return (
      <ScrollView testID="contact-detail-view" className="flex-1 bg-ink-navy px-5 pt-2">
        {/* Back Button */}
        <TouchableOpacity
          testID="back-to-people-button"
          onPress={() => setSelectedContactId(null)}
          className="flex-row items-center py-3 mb-2"
        >
          <Text className="text-warm-brass font-sans text-xs font-semibold">← Back to People</Text>
        </TouchableOpacity>

        {/* Contact Header Card */}
        <View className="bg-ink-navy-light border border-ink-navy-lighter rounded-2xl p-5 mb-4 shadow-sm">
          <Text
            className="text-warm-brass text-xl font-bold mb-1"
            style={{ fontFamily: 'Libre Baskerville, Georgia, serif' }}
          >
            {contactDetail.contact_name}
          </Text>
          <Text className="text-bone-dark font-sans text-sm font-medium mb-3">
            {contactDetail.display_text}
          </Text>

          {/* Balance breakdown */}
          <View className="flex-row justify-between pt-3 border-t border-ink-navy-lighter">
            <View>
              <Text className="text-bone-darker font-sans text-[10px] uppercase tracking-wider">Total Sent</Text>
              <Text className="text-clay-rust-light font-sans text-sm font-semibold">
                ₹{Number(contactDetail.total_sent || 0).toFixed(2)}
              </Text>
            </View>
            <View>
              <Text className="text-bone-darker font-sans text-[10px] uppercase tracking-wider">Total Received</Text>
              <Text className="text-forest-green-light font-sans text-sm font-semibold">
                ₹{Number(contactDetail.total_received || 0).toFixed(2)}
              </Text>
            </View>
            <View>
              <Text className="text-bone-darker font-sans text-[10px] uppercase tracking-wider">Net Balance</Text>
              <Text
                className={`font-sans text-sm font-bold ${
                  isOwed ? 'text-warm-brass' : youOwe ? 'text-clay-rust' : 'text-bone-dark'
                }`}
              >
                ₹{Math.abs(Number(contactDetail.net_balance || 0)).toFixed(2)}
              </Text>
            </View>
          </View>
        </View>

        {/* Transaction History with Contact */}
        <View className="py-2 mb-2">
          <Text className="text-bone-darker font-sans text-[10px] font-medium uppercase tracking-widest">
            History with {contactDetail.contact_name} ({contactDetail.transactions.length})
          </Text>
        </View>

        {contactDetail.transactions.length === 0 ? (
          <Text className="text-bone-darker font-sans text-xs italic text-center py-6">
            No transactions found with this contact.
          </Text>
        ) : (
          contactDetail.transactions.map((txn) => (
            <TransactionRow
              key={txn.id}
              testID={`contact-txn-${txn.id}`}
              category={txn.category_name || 'People'}
              description={txn.description || (txn.type === 'expense' ? 'Sent' : 'Received')}
              amount={txn.amount}
              type={txn.type}
              date={txn.txn_date}
            />
          ))
        )}

        <View className="h-6" />
      </ScrollView>
    );
  }

  // ── Contact List View ──
  const contacts = peopleData?.contacts || [];
  const totalOwed = Number(peopleData?.total_owed_to_user || 0).toFixed(2);
  const totalOwe = Number(peopleData?.total_user_owes || 0).toFixed(2);

  return (
    <ScrollView testID="people-view" className="flex-1 bg-ink-navy px-5 pt-2">
      {/* Header */}
      <View className="py-3 mb-2">
        <Text className="text-bone-darker font-sans text-[10px] font-medium uppercase tracking-widest">
          People & Debts
        </Text>
      </View>

      {error && (
        <View className="p-3 bg-clay-rust/15 border border-clay-rust/30 rounded-xl mb-3">
          <Text className="text-clay-rust-light font-sans text-xs">{error}</Text>
        </View>
      )}

      {/* Aggregate Overview Card */}
      <View className="bg-ink-navy-light border border-ink-navy-lighter rounded-2xl p-4 mb-4 flex-row justify-around">
        <View className="items-center">
          <Text className="text-bone-darker font-sans text-[10px] uppercase tracking-wider mb-1">
            Owed to you
          </Text>
          <Text className="text-warm-brass font-sans text-base font-bold">
            ₹{totalOwed}
          </Text>
        </View>
        <View className="h-full w-[1px] bg-ink-navy-lighter" />
        <View className="items-center">
          <Text className="text-bone-darker font-sans text-[10px] uppercase tracking-wider mb-1">
            You owe
          </Text>
          <Text className="text-clay-rust font-sans text-base font-bold">
            ₹{totalOwe}
          </Text>
        </View>
      </View>

      {/* Contacts List */}
      {contacts.length === 0 ? (
        <View className="py-12 items-center">
          <Text
            className="text-bone-darker font-sans text-sm italic text-center mb-2"
            style={{ fontFamily: 'Libre Baskerville, Georgia, serif' }}
          >
            No person-to-person records yet
          </Text>
          <Text className="text-bone-darker font-sans text-xs text-center px-6 opacity-60">
            Say something like "I sent 500 to Rahul" or "John paid me back 200" in the Assistant tab.
          </Text>
        </View>
      ) : (
        contacts.map((contact) => {
          const isOwed = contact.net_balance > 0;
          const youOwe = contact.net_balance < 0;

          return (
            <TouchableOpacity
              key={contact.contact_id}
              testID={`contact-card-${contact.contact_id}`}
              onPress={() => setSelectedContactId(contact.contact_id)}
              className="bg-ink-navy-light border border-ink-navy-lighter rounded-xl p-4 mb-3 flex-row items-center justify-between active:bg-ink-navy-lighter"
            >
              <View className="flex-1 pr-3">
                <Text
                  className="text-bone font-bold text-base mb-0.5"
                  style={{ fontFamily: 'Libre Baskerville, Georgia, serif' }}
                >
                  {contact.contact_name}
                </Text>
                <Text className="text-bone-darker font-sans text-xs">
                  {contact.transaction_count} transaction{contact.transaction_count === 1 ? '' : 's'}
                </Text>
              </View>

              <View className="items-end">
                <View
                  className={`px-2.5 py-1 rounded-full ${
                    isOwed
                      ? 'bg-warm-brass/15 border border-warm-brass/30'
                      : youOwe
                      ? 'bg-clay-rust/15 border border-clay-rust/30'
                      : 'bg-bone-darker/15 border border-bone-darker/30'
                  }`}
                >
                  <Text
                    className={`font-sans text-xs font-semibold ${
                      isOwed
                        ? 'text-warm-brass'
                        : youOwe
                        ? 'text-clay-rust-light'
                        : 'text-bone-dark'
                    }`}
                  >
                    {isOwed
                      ? `+₹${Number(contact.net_balance).toFixed(2)}`
                      : youOwe
                      ? `-₹${Math.abs(Number(contact.net_balance)).toFixed(2)}`
                      : 'Settled'}
                  </Text>
                </View>
                <Text className="text-bone-darker font-sans text-[10px] mt-1">
                  {isOwed ? 'Owes you' : youOwe ? 'You owe' : 'All square'}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })
      )}

      <View className="h-6" />
    </ScrollView>
  );
}
