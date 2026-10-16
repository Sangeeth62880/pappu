import React from 'react';
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import CustomTabBar from '../src/components/ui/CustomTabBar';
import * as safeAreaContext from 'react-native-safe-area-context';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: jest.fn(),
}));

describe('CustomTabBar Safe Area Inset & Bottom Edge Alignment', () => {
  const mockNavigation = { navigate: jest.fn() };
  const mockState = {
    index: 0,
    routes: [
      { name: 'Home' },
      { name: 'History' },
      { name: 'People' },
      { name: 'Me' },
    ],
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  const testCases = [
    { insetBottom: 0,  desc: 'zero bottom inset (Android 3-button navigation / desktop)' },
    { insetBottom: 20, desc: '20pt bottom inset (Android gesture navigation / legacy iPhone)' },
    { insetBottom: 34, desc: '34pt bottom inset (modern iPhone with home indicator)' },
  ];

  testCases.forEach(({ insetBottom, desc }) => {
    test(`tab bar bottom edge equals screen bottom (bottom: 0) and height is 64 + inset (${desc})`, async () => {
      safeAreaContext.useSafeAreaInsets.mockReturnValue({
        top: 47,
        left: 0,
        right: 0,
        bottom: insetBottom,
      });

      const res = await render(
        <CustomTabBar
          state={mockState}
          navigation={mockNavigation}
          initialTooltipVisible={false}
        />
      );

      const container = res.getByTestId('tab-bar-container');
      const background = res.getByTestId('tab-bar-background');
      const containerStyle = StyleSheet.flatten(container.props.style);
      const bgStyle = StyleSheet.flatten(background.props.style);

      // 1. Container sits directly at screen bottom
      expect(containerStyle.position).toBe('absolute');
      expect(containerStyle.bottom).toBe(0);
      expect(containerStyle.left).toBe(0);
      expect(containerStyle.right).toBe(0);

      // 2. Bar height is exactly 64 + insets.bottom
      const expectedHeight = 64 + insetBottom;
      expect(containerStyle.height).toBe(expectedHeight);
      expect(bgStyle.height).toBe(expectedHeight);

      // 3. Bottom inset is applied as padding inside the bar, not outside
      expect(bgStyle.paddingBottom).toBe(insetBottom);

      // 4. White background extends to physical bottom edge
      expect(bgStyle.backgroundColor).toBe('#FFFFFF');

      // 5. Center coin maintains position relative to top of the bar (-24px)
      const coinTouchable = res.getByTestId('tab-assistant');
      // coinTouchable -> Animated.View -> coinTactileWrapper -> coinButtonContainer
      const coinButtonContainer = coinTouchable.parent.parent.parent;
      const coinContainerStyle = StyleSheet.flatten(coinButtonContainer.props.style);
      expect(coinContainerStyle.top).toBe(-24);
    });
  });
});
