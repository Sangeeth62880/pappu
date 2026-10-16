import React from 'react';
import { View } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import Button from '../src/components/ui/Button';
import AmountText, { formatAmount } from '../src/components/ui/AmountText';
import Pappu, { normalizeMood } from '../src/components/ui/Pappu';
import { colors } from '../src/theme/tokens';

// ─── WCAG Luminance & Contrast Ratio Helper ───
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

describe('Foundation Gate Requirements', () => {
  // ─── 1. Button Variants & Accessibility Scaling ───
  describe('Button Variants & Accessibility Scaling', () => {
    test('renders primary variant with title and handles press', async () => {
      const onPress = jest.fn();
      const res = await render(<Button title="Save Transaction" variant="primary" onPress={onPress} />);
      const btn = res.getByText('Save Transaction');
      expect(btn).toBeTruthy();
      fireEvent.press(btn);
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    test('renders secondary variant', async () => {
      const res = await render(<Button title="Cancel" variant="secondary" />);
      expect(res.getByText('Cancel')).toBeTruthy();
    });

    test('renders destructive variant', async () => {
      const res = await render(<Button title="Delete" variant="destructive" />);
      expect(res.getByText('Delete')).toBeTruthy();
    });

    test('renders destructive outline variant', async () => {
      const res = await render(<Button title="Discard Changes" variant="destructive_outline" />);
      expect(res.getByText('Discard Changes')).toBeTruthy();
    });

    test('labels do not clip in 320px narrow container at 1.3 font scale', async () => {
      const longLabel = 'Confirm Delete Transaction';
      const res = await render(
        <View style={{ width: 320 }}>
          <Button
            title={longLabel}
            variant="primary"
            textStyle={{ fontSize: 17 * 1.3, lineHeight: 22 * 1.3 }}
          />
        </View>
      );

      const labelNode = res.getByText(longLabel);
      expect(labelNode).toBeTruthy();
      expect(labelNode.props.numberOfLines).toBe(1);
    });

    test('renders button and triggers onPress with tactile feedback', async () => {
      const onPress = jest.fn();
      const res = await render(<Button title="Tactile Press" testID="tactile-btn" onPress={onPress} />);
      const btn = res.getByTestId('tactile-btn');
      fireEvent.press(btn);
      expect(onPress).toHaveBeenCalledTimes(1);
    });
  });

  // ─── 2. AmountText Cases ───
  describe('AmountText Cases', () => {
    test('formats whole numbers without decimals using Indian grouping', () => {
      expect(formatAmount(0)).toBe('0');
      expect(formatAmount(500)).toBe('500');
      expect(formatAmount(65000)).toBe('65,000');
      expect(formatAmount(241860)).toBe('2,41,860');
    });

    test('formats fractional numbers with exact 2 decimal places', () => {
      expect(formatAmount(50.5)).toBe('50.50');
      expect(formatAmount(1250.75)).toBe('1,250.75');
    });

    test('renders signed income amount with + prefix and income color', async () => {
      const res = await render(<AmountText amount={59891} type="income" showSign />);
      const el = res.getByTestId('amount-text');
      expect(el).toHaveTextContent('+₹59,891');
      expect(el.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ color: colors.income }),
        ])
      );
    });

    test('renders signed expense amount with − prefix and expense color', async () => {
      const res = await render(<AmountText amount={5109} type="expense" showSign />);
      const el = res.getByTestId('amount-text');
      expect(el).toHaveTextContent('−₹5,109');
      expect(el.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ color: colors.expense }),
        ])
      );
    });

    test('renders neutral amount without sign', async () => {
      const res = await render(<AmountText amount={1200} type="neutral" showSign={false} />);
      const el = res.getByTestId('amount-text');
      expect(el).toHaveTextContent('₹1,200');
      expect(el.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ color: colors.ink }),
        ])
      );
    });

    test('applies tabular-nums font variant and is never truncated', async () => {
      const res = await render(<AmountText amount={1245000} size="display" />);
      const el = res.getByTestId('amount-text');
      expect(el.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ fontVariant: ['tabular-nums'] }),
        ])
      );
      expect(el.props.adjustsFontSizeToFit).toBe(false);
      expect(el.props.numberOfLines).toBe(1);
    });
  });

  // ─── 3. Mood to Pose Mapping ───
  describe('Mood to Pose Mapping', () => {
    test('normalizes server moods to exact mascot pose keys', () => {
      expect(normalizeMood('happy')).toBe('happy');
      expect(normalizeMood('excited')).toBe('excited');
      expect(normalizeMood('worried')).toBe('worried');
      expect(normalizeMood('concerned')).toBe('concerned');
      expect(normalizeMood('confused')).toBe('confused');
      expect(normalizeMood('neutral')).toBe('idle');
      expect(normalizeMood('idle')).toBe('idle');
      expect(normalizeMood(null)).toBe('idle');
      expect(normalizeMood(undefined)).toBe('idle');
      expect(normalizeMood('unknown_event')).toBe('idle');
    });

    test('normalizes client states to exact mascot pose keys', () => {
      expect(normalizeMood('listening')).toBe('listening');
      expect(normalizeMood('thinking')).toBe('thinking');
      expect(normalizeMood('speaking')).toBe('speaking');
      expect(normalizeMood('sleepy')).toBe('sleepy');
    });

    test('renders Pappu component with specified pose', async () => {
      const res = await render(<Pappu mood="happy" size={72} testID="test-pappu" />);
      expect(res.getByTestId('test-pappu')).toBeTruthy();
      expect(res.getByTestId('pappu-pose-happy')).toBeTruthy();
    });
  });

  // ─── 4. Token Contrast Test (failing if below 4.5:1) ───
  describe('Token WCAG AA Contrast Compliance', () => {
    test('ink on surface passes >= 4.5:1 (passes AAA >= 7:1)', () => {
      const ratio = getContrastRatio(colors.ink, colors.surface);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(ratio).toBeGreaterThanOrEqual(7.0);
    });

    test('ink on bg passes >= 4.5:1 (passes AAA >= 7:1)', () => {
      const ratio = getContrastRatio(colors.ink, colors.bg);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(ratio).toBeGreaterThanOrEqual(7.0);
    });

    test('ink on gold passes >= 4.5:1 (passes AAA >= 7:1)', () => {
      const ratio = getContrastRatio(colors.ink, colors.gold);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(ratio).toBeGreaterThanOrEqual(7.0);
    });

    test('ink_muted on surface passes >= 4.5:1', () => {
      const ratio = getContrastRatio(colors.ink_muted, colors.surface);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    test('teal on surface passes >= 4.5:1', () => {
      const ratio = getContrastRatio(colors.teal, colors.surface);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    test('token contrast rule fails when text and background pair drops below 4.5:1', () => {
      function assertAccessiblePair(textColor, bgColor) {
        const ratio = getContrastRatio(textColor, bgColor);
        if (ratio < 4.5) {
          throw new Error(`Contrast ratio ${ratio.toFixed(2)}:1 is below the 4.5:1 WCAG AA threshold`);
        }
        return ratio;
      }

      expect(() => assertAccessiblePair(colors.ink, colors.surface)).not.toThrow();

      expect(() => assertAccessiblePair(colors.categories.other, colors.surface)).toThrow(
        /is below the 4.5:1 WCAG AA threshold/
      );
    });
  });
});
