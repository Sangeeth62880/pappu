/**
 * Budgets section on the Me screen: spent vs budget rows, progress bars, and the edit sheet.
 * Also covers the fetchBudgets / setBudget API client calls.
 */

global.IS_REACT_ACT_ENVIRONMENT = true;
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import BudgetsSection from '../src/components/BudgetsSection';
import MeScreen from '../src/screens/MeScreen';
import * as client from '../src/api/client';
import { colors } from '../src/theme/tokens';

jest.mock('../src/api/client');
jest.mock('../src/utils/reduceMotion', () => ({
  useReduceMotion: () => true,
}));

const TOKEN = 'mock_jwt_token_budgets';
const CATEGORIES = ['Food', 'Transport', 'Shopping', 'Bills', 'Entertainment', 'Other'];

const item = (overrides) => ({
  category: 'Food',
  budget: 5000,
  spent: 1200,
  remaining: 3800,
  over_by: 0,
  percent: 24,
  state: 'ok',
  month: '2026-11',
  ...overrides,
});

function listing(budgets) {
  return { month: '2026-11', budgets, categories: CATEGORIES };
}

function renderWithClient(ui) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function fillStyle(category) {
  return StyleSheet.flatten(screen.getByTestId(`budget-fill-${category}`).props.style);
}

describe('BudgetsSection', () => {
  jest.setTimeout(15000);

  beforeEach(() => {
    jest.clearAllMocks();
    client.fetchBudgets.mockResolvedValue(listing([item()]));
    client.setBudget.mockResolvedValue(item());
  });

  afterEach(() => {
    cleanup();
  });

  test('shows spent vs budget and what is left for each budget', async () => {
    await renderWithClient(<BudgetsSection token={TOKEN} />);

    expect(await screen.findByText('₹1,200 of ₹5,000')).toBeTruthy();
    expect(screen.getByText('₹3,800 left')).toBeTruthy();
    expect(fillStyle('Food').width).toBe('24%');
    expect(fillStyle('Food').backgroundColor).toBe(colors.categories.Food);
    expect(client.fetchBudgets).toHaveBeenCalledWith(TOKEN);
  });

  test('near and over budgets use warning and expense colors, bar capped at 100%', async () => {
    client.fetchBudgets.mockResolvedValue(listing([
      item({ category: 'Bills', budget: 2000, spent: 2500, remaining: 0, over_by: 500, percent: 125, state: 'over' }),
      item({ category: 'Shopping', budget: 1000, spent: 850, remaining: 150, percent: 85, state: 'near' }),
    ]));
    await renderWithClient(<BudgetsSection token={TOKEN} />);

    expect(await screen.findByText('₹500 over budget')).toBeTruthy();
    expect(fillStyle('Bills').width).toBe('100%');
    expect(fillStyle('Bills').backgroundColor).toBe(colors.expense);
    expect(fillStyle('Shopping').width).toBe('85%');
    expect(fillStyle('Shopping').backgroundColor).toBe(colors.warning);
    expect(screen.getByText('₹150 left')).toBeTruthy();
  });

  test('shows an empty state when no budgets are set', async () => {
    client.fetchBudgets.mockResolvedValue(listing([]));
    await renderWithClient(<BudgetsSection token={TOKEN} />);
    expect(await screen.findByTestId('budgets-empty')).toBeTruthy();
  });

  test('sets a new budget from the sheet and refetches', async () => {
    client.fetchBudgets.mockResolvedValue(listing([]));
    await renderWithClient(<BudgetsSection token={TOKEN} />);
    await screen.findByTestId('budgets-empty');

    await fireEvent.press(screen.getByTestId('budget-add-button'));
    expect(await screen.findAllByText('Set a budget')).toHaveLength(2); // link + sheet title
    await fireEvent.press(screen.getByTestId('budget-category-Transport'));
    await fireEvent.changeText(screen.getByTestId('budget-amount-input'), '3000');
    await fireEvent.press(screen.getByTestId('budget-save-button'));

    await waitFor(() => expect(client.setBudget).toHaveBeenCalledWith(TOKEN, 'Transport', 3000));
    await waitFor(() => expect(client.fetchBudgets).toHaveBeenCalledTimes(2));
  });

  test('editing an existing budget keeps its category and prefills the amount', async () => {
    await renderWithClient(<BudgetsSection token={TOKEN} />);
    await fireEvent.press(await screen.findByTestId('budget-row-Food'));

    expect(await screen.findByText('Food budget')).toBeTruthy();
    expect(screen.queryByTestId('budget-category-Food')).toBeNull();
    expect(screen.getByTestId('budget-amount-input').props.value).toBe('5000');

    await fireEvent.changeText(screen.getByTestId('budget-amount-input'), '6000');
    await fireEvent.press(screen.getByTestId('budget-save-button'));
    await waitFor(() => expect(client.setBudget).toHaveBeenCalledWith(TOKEN, 'Food', 6000));
  });

  test('does not save without a category or with a non positive amount', async () => {
    client.fetchBudgets.mockResolvedValue(listing([]));
    await renderWithClient(<BudgetsSection token={TOKEN} />);
    await screen.findByTestId('budgets-empty');

    await fireEvent.press(screen.getByTestId('budget-add-button'));
    await fireEvent.changeText(await screen.findByTestId('budget-amount-input'), '500');
    await fireEvent.press(screen.getByTestId('budget-save-button'));
    expect(await screen.findByText('Pick a category.')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('budget-category-Food'));
    await fireEvent.changeText(screen.getByTestId('budget-amount-input'), '0');
    await fireEvent.press(screen.getByTestId('budget-save-button'));
    expect(await screen.findByText('Enter an amount greater than 0.')).toBeTruthy();
    expect(client.setBudget).not.toHaveBeenCalled();
  });

  test('shows the API error and keeps the sheet open when saving fails', async () => {
    client.setBudget.mockRejectedValue(new Error('Network request failed'));
    await renderWithClient(<BudgetsSection token={TOKEN} />);
    await fireEvent.press(await screen.findByTestId('budget-row-Food'));
    await fireEvent.press(await screen.findByTestId('budget-save-button'));

    expect(await screen.findByText('Network request failed')).toBeTruthy();
    expect(screen.getByTestId('budget-save-button')).toBeTruthy();
  });

  test('refetches when a transaction changes elsewhere (refreshTrigger)', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { rerender } = await render(
      <QueryClientProvider client={qc}><BudgetsSection token={TOKEN} refreshTrigger={0} /></QueryClientProvider>
    );
    await screen.findByText('₹1,200 of ₹5,000');

    client.fetchBudgets.mockResolvedValue(listing([item({ spent: 1450, remaining: 3550, percent: 29 })]));
    await rerender(
      <QueryClientProvider client={qc}><BudgetsSection token={TOKEN} refreshTrigger={1} /></QueryClientProvider>
    );
    expect(await screen.findByText('₹1,450 of ₹5,000')).toBeTruthy();
  });

  test('Me screen renders the budgets card', async () => {
    client.fetchProfile.mockResolvedValue({ name: 'Sangeeth', email: 's@pappu.dev', language: 'en', voice_replies: true });
    await renderWithClient(<MeScreen token={TOKEN} />);
    expect(await screen.findByTestId('budgets-card')).toBeTruthy();
    expect(await screen.findByText('₹1,200 of ₹5,000')).toBeTruthy();
  });
});

describe('budgets API client', () => {
  const { fetchBudgets, setBudget } = jest.requireActual('../src/api/client');
  const originalFetch = global.fetch;

  afterAll(() => {
    global.fetch = originalFetch;
  });

  test('fetchBudgets sends GET /budgets with bearer auth', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: jest.fn().mockResolvedValue(listing([])) });
    await fetchBudgets(TOKEN);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/budgets$/),
      expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }) })
    );
  });

  test('setBudget sends PUT /budgets/{category} with the amount', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: jest.fn().mockResolvedValue(item()) });
    await setBudget(TOKEN, 'Food', 5000);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/budgets\/Food$/),
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ amount: 5000 }) })
    );
  });
});
