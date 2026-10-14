/**
 * Shared React Query Keys and Invalidation Rules for Pappu.
 *
 * INVALIDATION RULES (Mandatory across all mutations):
 * Whenever any transaction is created, edited, or deleted, or when an assistant change
 * alters transaction/debt state, the following caches MUST be invalidated:
 * 1. summary: ['summary'] (all periods: week, month, year)
 * 2. people: ['people'] (contacts list and balances)
 * 3. transactions: ['transactions'] (all filter combinations)
 * 4. affected contact: ['contact', contactId] (if a contact was involved)
 *
 * Whenever profile preferences change (language, voice replies):
 * - profile: ['profile'] MUST be invalidated.
 *
 * Whenever chat messages are cleared or mutated:
 * - chatHistory: ['chatHistory'] MUST be invalidated.
 */

export const queryKeys = {
  // Summary queries
  allSummary: ['summary'],
  summary: (period = 'week') => ['summary', period],

  // People & contacts queries
  people: () => ['people'],
  contact: (id) => ['contact', String(id)],

  // Transaction queries
  allTransactions: ['transactions'],
  transactions: (filters = {}) => ['transactions', filters],

  // Profile preferences
  profile: () => ['profile'],

  // Chat message history
  chatHistory: () => ['chatHistory'],
};

/**
 * Standard invalidation helper to execute invalidation rules consistently.
 * @param {import('@tanstack/react-query').QueryClient} queryClient
 * @param {{ contactId?: string | number }} options
 */
export async function invalidateOnTransactionChange(queryClient, { contactId } = {}) {
  if (!queryClient) return;

  const promises = [
    queryClient.invalidateQueries({ queryKey: queryKeys.allSummary }),
    queryClient.invalidateQueries({ queryKey: queryKeys.people() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.allTransactions }),
  ];

  if (contactId) {
    promises.push(
      queryClient.invalidateQueries({ queryKey: queryKeys.contact(contactId) })
    );
  }

  await Promise.all(promises);
}
