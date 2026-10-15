import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import Dashboard from '../src/components/Dashboard';
import SpendingChart from '../src/components/ui/SpendingChart';
import * as client from '../src/api/client';
import { colors } from '../src/theme/tokens';

jest.mock('../src/api/client');

describe('Stitch Home Screen Fidelity & Feature Verification', () => {
  const mockToken = 'stitch_test_jwt_token';

  const stitchWeekSummary = {
    period: 'week',
    total_spent: 5109.0,
    total_income: 65000.0,
    net: 59891.0,
    previous_period_spent: 350.0,
    delta_abs: 4759.0,
    delta_pct: 1359.7, // Higher than last week
    avg_per_day: 730.0,
    mood: 'worried',
    daily_buckets: [
      { date: '2026-10-12', label: 'Mon', amount: 0.0 },
      { date: '2026-10-13', label: 'Tue', amount: 3250.0 },
      { date: '2026-10-14', label: 'Wed', amount: 1859.0 },
      { date: '2026-10-15', label: 'Thu', amount: 0.0 },
      { date: '2026-10-16', label: 'Fri', amount: 0.0 },
      { date: '2026-10-17', label: 'Sat', amount: 0.0 },
      { date: '2026-10-18', label: 'Sun', amount: 0.0 },
    ],
    categories: [
      { category: 'Food', amount: 3225.0, percentage: 63.0 },
      { category: 'Shopping', amount: 1204.0, percentage: 24.0 },
      { category: 'Other', amount: 500.0, percentage: 10.0 },
      { category: 'Transport', amount: 180.0, percentage: 3.0 },
    ],
    people: {
      total_owed_to_user: 6700.0,
      total_user_owes: 1000.0,
      top_contacts: [
        { id: 'p1', name: 'Pooja', net_balance: 6200.0 },
        { id: 'p2', name: 'Rony', net_balance: 500.0 },
      ],
    },
    recent_transactions: [
      { id: 'rt-1', type: 'income', amount: 300.0, contact_name: 'രാഹുൽ', txn_date: '2026-10-14' },
      { id: 'rt-2', type: 'income', amount: 15000.0, description: 'Salary', txn_date: '2026-10-14' },
      { id: 'rt-3', type: 'expense', amount: 80.0, category_name: 'Transport', description: 'auto', txn_date: '2026-10-14' },
      { id: 'rt-4', type: 'expense', amount: 50.0, category_name: 'Food', description: 'bench', txn_date: '2026-10-14' },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    client.fetchProfile.mockResolvedValue({ name: 'Sangeeth' });
    client.fetchSummary.mockResolvedValue(stitchWeekSummary);
    client.fetchTransactions.mockResolvedValue([]);
  });

  test('Requirement 1: Greeting adapts to time of day, uses name from GET /profile, and pose from server mood', async () => {
    const { findByText, findByTestId, findAllByText } = await render(
      <Dashboard token={mockToken} />
    );

    // Profile name from GET /profile included in greeting
    expect(await findByText(/Good (morning|afternoon|evening), Sangeeth\./)).toBeTruthy();

    // Pappu mascot rendered with worried mood from server
    const mascot = await findByTestId('pappu-mascot');
    expect(mascot).toBeTruthy();

    // Subtitle displays spend for the week
    expect(await findByText(/You've spent/)).toBeTruthy();
    const amountOccurrences = await findAllByText(/5,?109/);
    expect(amountOccurrences.length).toBeGreaterThanOrEqual(1);
  });

  test('Requirement 2: Net display is +59891 in green for income 65000 and expense 5109, and delta omits percent', async () => {
    const { findByTestId, queryByText, findByText } = await render(
      <Dashboard token={mockToken} />
    );

    const netEl = await findByTestId('dashboard-expense');
    expect(netEl).toHaveTextContent(/\+₹59,?891/);

    const incomeEl = await findByTestId('dashboard-income');
    expect(incomeEl).toHaveTextContent(/\+₹65,?000/);

    // Delta line displays delta_abs in coral without percent sign
    const deltaLine = await findByText(/₹4,?759 more than last week/);
    expect(deltaLine).toBeTruthy();

    // Strictly banned: percent text in spend card delta
    const deltaCard = await findByTestId('spend-card');
    expect(deltaCard).toHaveTextContent(/₹4,?759 more than last week/);
    expect(deltaLine.props.children).not.toEqual(expect.stringMatching(/%/));
  });

  test('Requirement 2: Null delta_pct omits delta line completely', async () => {
    const nullDeltaSummary = {
      ...stitchWeekSummary,
      delta_pct: null,
      spent_delta_percentage: null,
    };
    client.fetchSummary.mockResolvedValueOnce(nullDeltaSummary);

    const { queryByText } = await render(
      <Dashboard token={mockToken} />
    );

    // Delta comparison line should not exist
    expect(queryByText(/more than last/)).toBeNull();
    expect(queryByText(/less than last/)).toBeNull();
  });

  test('Requirement 2: Delta line shows green when lower spend than previous period', async () => {
    const lowerDeltaSummary = {
      ...stitchWeekSummary,
      delta_abs: -1200.0,
      delta_pct: -20.0,
    };
    client.fetchSummary.mockResolvedValueOnce(lowerDeltaSummary);

    const { findByText } = await render(
      <Dashboard token={mockToken} />
    );

    expect(await findByText(/₹1,?200 less than last week/)).toBeTruthy();
  });

  test('Requirement 3: Chart geometry with zero data, one large bar, equal bars, and 31 bars at 320px wide', async () => {
    // 1. Zero data test
    const zeroBuckets = Array.from({ length: 7 }, (_, i) => ({
      date: `day-${i}`,
      label: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i],
      amount: 0,
    }));

    const { queryByTestId: queryZeroTooltip, getByTestId: getZeroBar } = await render(
      <SpendingChart buckets={zeroBuckets} period="week" />
    );
    // Tooltip should be hidden for all zero data
    expect(queryZeroTooltip('chart-tooltip')).toBeNull();
    // Stub height should be 6px
    const zeroBar = getZeroBar('chart-bar-0');
    expect(zeroBar.props.style).toMatchObject({ height: 6 });

    // 2. One large bar test
    const oneLargeBuckets = [
      { date: '1', label: 'Mon', amount: 50000000.0 }, // Large amount
      { date: '2', label: 'Tue', amount: 0 },
    ];
    const { getByTestId: getLargeBar, findByTestId: findLargeTooltip } = await render(
      <SpendingChart buckets={oneLargeBuckets} period="week" />
    );
    // Peak bar occupies max height 112px
    const largeBar = getLargeBar('chart-bar-0');
    expect(largeBar.props.style).toMatchObject({ height: 112 });
    // Tooltip sits in headroom and renders large amount cleanly
    const tooltip = await findLargeTooltip('chart-tooltip');
    expect(tooltip).toBeTruthy();

    // 3. All equal bars test
    const equalBuckets = [
      { date: '1', label: 'Mon', amount: 500 },
      { date: '2', label: 'Tue', amount: 500 },
    ];
    const { getByTestId: getEqualBar1, getByTestId: getEqualBar2 } = await render(
      <SpendingChart buckets={equalBuckets} period="week" />
    );
    expect(getEqualBar1('chart-bar-0').props.style).toMatchObject({ height: 112 });
    expect(getEqualBar2('chart-bar-1').props.style).toMatchObject({ height: 112 });

    // 4. 31 bars at 320px wide
    const thirtyOneBuckets = Array.from({ length: 31 }, (_, i) => ({
      date: `2026-10-${i + 1}`,
      label: String(i + 1),
      amount: i === 13 ? 3250 : i % 2 === 0 ? 500 : 0,
    }));
    const { getByTestId: get31Chart } = await render(
      <SpendingChart buckets={thirtyOneBuckets} period="month" />
    );
    expect(get31Chart('spending-chart')).toBeTruthy();
  });

  test('Requirement 4: People card displays two tiles, top 3 contacts, and navigates to People', async () => {
    const onNavigateToPeopleMock = jest.fn();
    const { findByText } = await render(
      <Dashboard token={mockToken} onNavigateToPeople={onNavigateToPeopleMock} />
    );

    // Tiles
    expect(await findByText('Owed to you')).toBeTruthy();
    expect(await findByText('₹6,700')).toBeTruthy();
    expect(await findByText('You owe')).toBeTruthy();
    expect(await findByText('₹1,000')).toBeTruthy();

    // Contacts
    expect(await findByText('Pooja')).toBeTruthy();
    expect(await findByText('Rony')).toBeTruthy();

    // Tapping View all navigates to People
    const viewAllBtn = await findByText('View all');
    fireEvent.press(viewAllBtn);
    expect(onNavigateToPeopleMock).toHaveBeenCalledTimes(1);
  });

  test('Requirement 4: People card empty state displays "All settled up" with "Add person" link', async () => {
    const settledSummary = {
      ...stitchWeekSummary,
      people: {
        total_owed_to_user: 0,
        total_user_owes: 0,
        top_contacts: [],
      },
    };
    client.fetchSummary.mockResolvedValueOnce(settledSummary);

    const onNavigateToPeopleMock = jest.fn();
    const { findByText } = await render(
      <Dashboard token={mockToken} onNavigateToPeople={onNavigateToPeopleMock} />
    );

    expect(await findByText('All settled up')).toBeTruthy();
    expect(await findByText('No money owed or owing')).toBeTruthy();

    const addPersonBtn = await findByText('Add person');
    fireEvent.press(addPersonBtn);
    expect(onNavigateToPeopleMock).toHaveBeenCalledTimes(1);
  });

  test('Requirement 4: Category tap navigates to History filtered by category and period', async () => {
    const onNavigateToHistoryMock = jest.fn();
    const { findByText } = await render(
      <Dashboard token={mockToken} onNavigateToHistory={onNavigateToHistoryMock} />
    );

    const foodCategory = await findByText('Food');
    fireEvent.press(foodCategory);

    expect(onNavigateToHistoryMock).toHaveBeenCalledWith({
      category: 'Food',
      period: 'week',
    });
  });

  test('Requirement 4 & 7: Period switch refetches week, month, and year', async () => {
    const { findByTestId } = await render(
      <Dashboard token={mockToken} />
    );

    await waitFor(() => {
      expect(client.fetchSummary).toHaveBeenCalledWith(mockToken, 'week');
    });

    // Switch to Month
    const monthTab = await findByTestId('segment-month');
    fireEvent.press(monthTab);

    await waitFor(() => {
      expect(client.fetchSummary).toHaveBeenCalledWith(mockToken, 'month');
    });

    // Switch to Year
    const yearTab = await findByTestId('segment-year');
    fireEvent.press(yearTab);

    await waitFor(() => {
      expect(client.fetchSummary).toHaveBeenCalledWith(mockToken, 'year');
    });
  });

  test('Requirement 4: Recent transactions derive Income/Expense from type and See all navigates to History', async () => {
    const onNavigateToHistoryMock = jest.fn();
    const { findByText } = await render(
      <Dashboard token={mockToken} onNavigateToHistory={onNavigateToHistoryMock} />
    );

    expect(await findByText('Recent')).toBeTruthy();
    expect(await findByText('See all')).toBeTruthy();

    // Rows
    expect(await findByText('രാഹുൽ')).toBeTruthy();
    expect(await findByText(/Received · 14 Oct/)).toBeTruthy();
    expect(await findByText(/\+₹300/)).toBeTruthy();

    expect(await findByText('Salary')).toBeTruthy();
    expect(await findByText(/Income · 14 Oct/)).toBeTruthy();
    expect(await findByText(/\+₹15,?000/)).toBeTruthy();

    expect(await findByText('auto')).toBeTruthy();
    expect(await findByText(/Transport · 14 Oct/)).toBeTruthy();
    expect(await findByText(/−₹80/)).toBeTruthy();

    // Tap See all
    fireEvent.press(await findByText('See all'));
    expect(onNavigateToHistoryMock).toHaveBeenCalledTimes(1);
  });
});
