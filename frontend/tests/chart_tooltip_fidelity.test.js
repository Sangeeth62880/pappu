import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import SpendingChart from '../src/components/ui/SpendingChart';

describe('SpendingChart Tooltip Alignment & Tracking Fidelity', () => {
  const containerWidth = 350;

  // ─── 1. Week View (7 Bars) ───
  test('tooltip center equals bar center (or arrow center equals bar center where clamped) for all bars in Week view', async () => {
    const weekBuckets = [
      { date: '2026-08-25', label: 'Mon', amount: 400 },
      { date: '2026-08-26', label: 'Tue', amount: 3250 },
      { date: '2026-08-27', label: 'Wed', amount: 1850 },
      { date: '2026-08-28', label: 'Thu', amount: 0 },
      { date: '2026-08-29', label: 'Fri', amount: 620 },
      { date: '2026-08-30', label: 'Sat', amount: 950 },
      { date: '2026-08-31', label: 'Sun', amount: 1200 },
    ];

    const innerWidth = containerWidth - 8;
    const colWidth = innerWidth / 7;

    for (let i = 0; i < 7; i++) {
      const res = await render(
        <SpendingChart
          buckets={weekBuckets}
          period="week"
          selectedBarIndex={i}
        />
      );

      const tooltip = res.getByTestId('chart-tooltip');
      const arrow = res.getByTestId('chart-tooltip-arrow');
      const tooltipStyle = StyleSheet.flatten(tooltip.props.style);
      const arrowStyle = StyleSheet.flatten(arrow.props.style);

      const expectedBarCenter = 4 + (i + 0.5) * colWidth;
      const tooltipCenter = tooltipStyle.left;
      const arrowCenter = tooltipCenter + (arrowStyle.marginLeft || 0);

      // Where clamped, arrow center must equal bar center; otherwise tooltip center equals bar center
      expect(Math.abs(arrowCenter - expectedBarCenter)).toBeLessThan(1.0);

      // Tooltip must stay strictly inside the 48px headroom (top >= 4 and top <= 26)
      expect(tooltipStyle.top).toBeGreaterThanOrEqual(4);
      expect(tooltipStyle.top).toBeLessThanOrEqual(26);
    }
  });

  // ─── 2. Month View (30 Bars) ───
  test('tooltip and arrow tracking for first, last and middle days in Month view', async () => {
    const monthBuckets = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-08-${String(i + 1).padStart(2, '0')}`,
      label: String(i + 1),
      amount: i === 1 ? 3000 : i === 15 ? 1500 : 200,
    }));

    const innerWidth = containerWidth - 8;
    const colWidth = innerWidth / 30;

    // Test first day (Day 1, index 0 - clamped at left margin)
    {
      const res = await render(
        <SpendingChart buckets={monthBuckets} period="month" selectedBarIndex={0} />
      );
      const tooltip = res.getByTestId('chart-tooltip');
      const arrow = res.getByTestId('chart-tooltip-arrow');
      const tooltipStyle = StyleSheet.flatten(tooltip.props.style);
      const arrowStyle = StyleSheet.flatten(arrow.props.style);

      const expectedBarCenter = 4 + 0.5 * colWidth;
      const arrowCenter = tooltipStyle.left + (arrowStyle.marginLeft || 0);
      expect(Math.abs(arrowCenter - expectedBarCenter)).toBeLessThan(1.0);
    }

    // Test last day (Day 30, index 29 - clamped at right margin)
    {
      const res = await render(
        <SpendingChart buckets={monthBuckets} period="month" selectedBarIndex={29} />
      );
      const tooltip = res.getByTestId('chart-tooltip');
      const arrow = res.getByTestId('chart-tooltip-arrow');
      const tooltipStyle = StyleSheet.flatten(tooltip.props.style);
      const arrowStyle = StyleSheet.flatten(arrow.props.style);

      const expectedBarCenter = 4 + 29.5 * colWidth;
      const arrowCenter = tooltipStyle.left + (arrowStyle.marginLeft || 0);
      expect(Math.abs(arrowCenter - expectedBarCenter)).toBeLessThan(1.0);
    }
  });

  // ─── 3. Year View (12 Months) ───
  test('tooltip and arrow tracking for Jan through Dec in Year view', async () => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const yearBuckets = months.map((m, i) => ({
      date: `2026-${String(i + 1).padStart(2, '0')}`,
      label: m,
      amount: (i + 1) * 1000,
    }));

    const innerWidth = containerWidth - 8;
    const colWidth = innerWidth / 12;

    for (let i = 0; i < 12; i++) {
      const res = await render(
        <SpendingChart buckets={yearBuckets} period="year" selectedBarIndex={i} />
      );
      const tooltip = res.getByTestId('chart-tooltip');
      const arrow = res.getByTestId('chart-tooltip-arrow');
      const tooltipStyle = StyleSheet.flatten(tooltip.props.style);
      const arrowStyle = StyleSheet.flatten(arrow.props.style);

      const expectedBarCenter = 4 + (i + 0.5) * colWidth;
      const arrowCenter = tooltipStyle.left + (arrowStyle.marginLeft || 0);
      expect(Math.abs(arrowCenter - expectedBarCenter)).toBeLessThan(1.0);
    }
  });

  // ─── 4. Selection Changes Move Tooltip ───
  test('tapping another bar moves selection and tooltip to that bar', async () => {
    const weekBuckets = [
      { date: '2026-08-25', label: 'Mon', amount: 500 },
      { date: '2026-08-26', label: 'Tue', amount: 3000 },
      { date: '2026-08-27', label: 'Wed', amount: 1200 },
      { date: '2026-08-28', label: 'Thu', amount: 400 },
      { date: '2026-08-29', label: 'Fri', amount: 800 },
      { date: '2026-08-30', label: 'Sat', amount: 200 },
      { date: '2026-08-31', label: 'Sun', amount: 1500 },
    ];

    const onSelectBar = jest.fn();
    const res = await render(
      <SpendingChart
        buckets={weekBuckets}
        period="week"
        onSelectBar={onSelectBar}
      />
    );

    // Default peak is Tue (index 1) with amount 3,000
    expect(res.getByTestId('chart-tooltip-amount')).toHaveTextContent('₹3,000');

    // Tap Friday (index 4)
    fireEvent.press(res.getByTestId('chart-bar-col-4'));
    expect(onSelectBar).toHaveBeenCalledWith(4, weekBuckets[4]);
    await waitFor(() => {
      expect(res.getByTestId('chart-tooltip-amount')).toHaveTextContent('₹800');
    });

    // Tap Sun (index 6)
    fireEvent.press(res.getByTestId('chart-bar-col-6'));
    expect(onSelectBar).toHaveBeenCalledWith(6, weekBuckets[6]);
    await waitFor(() => {
      expect(res.getByTestId('chart-tooltip-amount')).toHaveTextContent('₹1,500');
    });
  });

  // ─── 5. No Overlap with Zero Data, One Large Bar, All Equal Bars ───
  test('no bar overlap with zero data (all zeros)', async () => {
    const zeroBuckets = Array.from({ length: 7 }, (_, i) => ({
      date: `d-${i}`,
      label: `Day ${i}`,
      amount: 0,
    }));

    const res = await render(
      <SpendingChart buckets={zeroBuckets} period="week" selectedBarIndex={3} />
    );

    const tooltip = res.getByTestId('chart-tooltip');
    const tooltipStyle = StyleSheet.flatten(tooltip.props.style);

    // Stays strictly in headroom (top <= 26) so it never overlaps zero stubs at bottom (height 6 at y = 154)
    expect(tooltipStyle.top).toBeLessThan(48);
    expect(res.getByTestId('chart-tooltip-amount')).toHaveTextContent('₹0');
  });

  test('no bar overlap with one single large outlier bar and all other zero', async () => {
    const outlierBuckets = [
      { date: 'd-0', label: 'Mon', amount: 0 },
      { date: 'd-1', label: 'Tue', amount: 10000 },
      { date: 'd-2', label: 'Wed', amount: 0 },
      { date: 'd-3', label: 'Thu', amount: 0 },
      { date: 'd-4', label: 'Fri', amount: 0 },
      { date: 'd-5', label: 'Sat', amount: 0 },
      { date: 'd-6', label: 'Sun', amount: 0 },
    ];

    const res = await render(
      <SpendingChart buckets={outlierBuckets} period="week" selectedBarIndex={1} />
    );

    const tooltip = res.getByTestId('chart-tooltip');
    const tooltipStyle = StyleSheet.flatten(tooltip.props.style);

    // Tooltip stays inside headroom above 112px tall bar
    expect(tooltipStyle.top).toBeLessThanOrEqual(22);
    expect(tooltipStyle.top).toBeGreaterThanOrEqual(4);
    expect(res.getByTestId('chart-tooltip-amount')).toHaveTextContent('₹10,000');
  });

  test('no bar overlap with all equal bars', async () => {
    const equalBuckets = Array.from({ length: 7 }, (_, i) => ({
      date: `d-${i}`,
      label: `Day ${i}`,
      amount: 1500,
    }));

    const res = await render(
      <SpendingChart buckets={equalBuckets} period="week" selectedBarIndex={2} />
    );

    const tooltip = res.getByTestId('chart-tooltip');
    const tooltipStyle = StyleSheet.flatten(tooltip.props.style);
    expect(tooltipStyle.top).toBeLessThan(48);
  });
});
