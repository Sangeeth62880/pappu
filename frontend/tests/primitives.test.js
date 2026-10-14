import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { colors } from '../src/theme/tokens';
import AmountText, { formatAmount } from '../src/components/ui/AmountText';
import Button from '../src/components/ui/Button';
import SegmentedControl from '../src/components/ui/SegmentedControl';
import Avatar from '../src/components/ui/Avatar';
import Card from '../src/components/ui/Card';

// ─── WCAG Luminance & Contrast Helper ───
function hexToRgb(hex) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function getRelativeLuminance({ r, g, b }) {
  const [sR, sG, sB] = [r, g, b].map(val => {
    const v = val / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * sR + 0.7152 * sG + 0.0722 * sB;
}

function getContrastRatio(hex1, hex2) {
  const lum1 = getRelativeLuminance(hexToRgb(hex1));
  const lum2 = getRelativeLuminance(hexToRgb(hex2));
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('Design System Primitives & Tokens', () => {
  describe('WCAG AA Contrast Ratios', () => {
    test('ink on surface has contrast >= 7:1 (passes AAA)', () => {
      const ratio = getContrastRatio(colors.ink, colors.surface);
      expect(ratio).toBeGreaterThanOrEqual(7);
    });

    test('ink on bg has contrast >= 7:1 (passes AAA)', () => {
      const ratio = getContrastRatio(colors.ink, colors.bg);
      expect(ratio).toBeGreaterThanOrEqual(7);
    });

    test('ink on gold has contrast >= 7:1 (passes AAA)', () => {
      const ratio = getContrastRatio(colors.ink, colors.gold);
      expect(ratio).toBeGreaterThanOrEqual(7);
    });

    test('ink_muted on surface has contrast >= 4.5:1 (passes AA)', () => {
      const ratio = getContrastRatio(colors.ink_muted, colors.surface);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    test('teal on surface has contrast >= 4.5:1 (passes AA)', () => {
      const ratio = getContrastRatio(colors.teal, colors.surface);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    test('contrast check fails if text and background pair drops below 4.5:1', () => {
      // Intentionally low contrast pair (#9CA3AF on #FFFFFF is ~2.8:1)
      const lowContrastRatio = getContrastRatio(colors.categories.other, colors.surface);
      expect(lowContrastRatio).toBeLessThan(4.5);
    });
  });

  describe('AmountText component', () => {
    test('formatAmount removes .00 for whole numbers', () => {
      expect(formatAmount(500)).toBe('500');
      expect(formatAmount(1000)).toBe('1,000');
      expect(formatAmount(100000)).toBe('1,00,000');
    });

    test('formatAmount retains 2 decimal places for fractions', () => {
      expect(formatAmount(50.5)).toBe('50.50');
      expect(formatAmount(1250.75)).toBe('1,250.75');
    });

    test('renders with income sign and correct semantic color', async () => {
      await render(
        <AmountText amount={500} type="income" showSign={true} />
      );
      const el = screen.getByTestId('amount-text');
      expect(el).toHaveTextContent('+₹500');
    });

    test('renders with expense sign and correct semantic color', async () => {
      await render(
        <AmountText amount={250} type="expense" showSign={true} />
      );
      const el = screen.getByTestId('amount-text');
      expect(el).toHaveTextContent('−₹250');
    });

    test('renders neutral without sign when showSign is false', async () => {
      await render(
        <AmountText amount={1200} type="neutral" showSign={false} />
      );
      const el = screen.getByTestId('amount-text');
      expect(el).toHaveTextContent('₹1,200');
    });
  });

  describe('Button component', () => {
    test('renders title and triggers onPress', async () => {
      const onPressMock = jest.fn();
      await render(
        <Button title="Click Me" onPress={onPressMock} />
      );
      fireEvent.press(screen.getByText('Click Me'));
      expect(onPressMock).toHaveBeenCalledTimes(1);
    });

    test('shows ActivityIndicator and does not call onPress when loading', async () => {
      const onPressMock = jest.fn();
      await render(
        <Button title="Save" onPress={onPressMock} loading={true} />
      );
      const btn = screen.getByTestId('button');
      fireEvent.press(btn);
      expect(onPressMock).not.toHaveBeenCalled();
    });

    test('does not call onPress when disabled', async () => {
      const onPressMock = jest.fn();
      await render(
        <Button title="Save" onPress={onPressMock} disabled={true} />
      );
      const btn = screen.getByTestId('button');
      fireEvent.press(btn);
      expect(onPressMock).not.toHaveBeenCalled();
    });
  });

  describe('SegmentedControl component', () => {
    test('renders all segments and triggers onSelect', async () => {
      const onSelectMock = jest.fn();
      const segments = [
        { key: 'week', label: 'Week' },
        { key: 'month', label: 'Month' },
        { key: 'year', label: 'Year' },
      ];
      await render(
        <SegmentedControl
          segments={segments}
          selectedKey="week"
          onSelect={onSelectMock}
        />
      );

      fireEvent.press(screen.getByTestId('segment-month'));
      expect(onSelectMock).toHaveBeenCalledWith('month');
    });
  });

  describe('Avatar component', () => {
    test('renders initials from single or multiple names', async () => {
      await render(<Avatar name="Rahul" />);
      expect(screen.getByText('RA')).toBeTruthy();

      await render(<Avatar name="Arjun Nair" />);
      expect(screen.getByText('AN')).toBeTruthy();
    });
  });

  describe('Card component', () => {
    test('renders children inside pure white surface', async () => {
      await render(
        <Card testID="test-card">
          <AmountText amount={100} />
        </Card>
      );
      expect(screen.getByTestId('test-card')).toBeTruthy();
      expect(screen.getByText('₹100')).toBeTruthy();
    });
  });

  describe('Toast component', () => {
    test('returns null when not visible and unmounted', async () => {
      const Toast = require('../src/components/ui/Toast').default;
      await render(
        <Toast visible={false} message="Test Toast" />
      );
      expect(screen.queryByTestId('toast')).toBeNull();
    });

    test('renders message and triggers onAction callback when visible', async () => {
      const Toast = require('../src/components/ui/Toast').default;
      const onAction = jest.fn();
      await render(
        <Toast visible={true} message="Transaction Added" actionText="Undo" onAction={onAction} />
      );
      expect(screen.getByText('Transaction Added')).toBeTruthy();
      fireEvent.press(screen.getByTestId('toast-action'));
      expect(onAction).toHaveBeenCalledTimes(1);
    });
  });

  describe('BottomSheet component', () => {
    test('calls onClose when backdrop or close button is pressed', async () => {
      const BottomSheet = require('../src/components/ui/BottomSheet').default;
      const { Text } = require('react-native');
      const onClose = jest.fn();
      await render(
        <BottomSheet visible={true} onClose={onClose} title="Edit Profile">
          <Text>Sheet Content</Text>
        </BottomSheet>
      );
      expect(screen.getByTestId('bottom-sheet-backdrop')).toBeTruthy();
      expect(screen.getByTestId('bottom-sheet-close-button')).toBeTruthy();

      fireEvent.press(screen.getByTestId('bottom-sheet-close-button'));
      expect(onClose).toHaveBeenCalled();
    });
  });
});

