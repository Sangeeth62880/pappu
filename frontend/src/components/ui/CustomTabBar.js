import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { useReduceMotion } from '../../utils/reduceMotion';
import CoinButton from './CoinButton';

const LEFT_TABS = [
  { key: 'Home',    testID: 'tab-dashboard', label: 'Home',    icon: 'home' },
  { key: 'History', testID: 'tab-history',   label: 'History', icon: 'clock' },
];

const RIGHT_TABS = [
  { key: 'People', testID: 'tab-people', label: 'People', icon: 'users' },
  { key: 'Me',     testID: 'tab-me',     label: 'Me',     icon: 'user' },
];

function TabSlot({ tab, isActive, onPress }) {
  const reduceMotion = useReduceMotion();
  const bounceAnim = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    if (!reduceMotion && !isActive) {
      Animated.sequence([
        Animated.timing(bounceAnim, {
          toValue: 1.15,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.timing(bounceAnim, {
          toValue: 1.0,
          duration: 130,
          useNativeDriver: true,
        }),
      ]).start();
    }
    onPress();
  };

  return (
    <TouchableOpacity
      testID={tab.testID}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={tab.label}
      onPress={handlePress}
      style={styles.tabSlot}
      activeOpacity={0.8}
    >
      <Animated.View style={{ transform: [{ scale: bounceAnim }] }}>
        <Feather
          name={tab.icon}
          size={24}
          color={isActive ? colors.ink : colors.ink_muted}
        />
      </Animated.View>
      <Text
        style={[
          styles.tabLabel,
          isActive ? styles.tabLabelActive : styles.tabLabelInactive,
        ]}
        numberOfLines={1}
      >
        {tab.label}
      </Text>
      {/* 6px circular gold dot under label for active tab */}
      <View
        style={[
          styles.activeDot,
          isActive ? styles.activeDotVisible : styles.activeDotHidden,
        ]}
      />
    </TouchableOpacity>
  );
}

/**
 * Custom Tab Bar strictly adhering to Stitch specification.
 * Height: 64px content area + insets.bottom padding, white surface, 2px solid border #F0E4C8 top border.
 * 5 slots: Home, History, [center raised coin button], People, Me.
 * Active tab shows ink icon and label with 6px gold dot underneath.
 * Inactive tabs show ink_muted.
 * Center 72px coin raised 24px above bar.
 */
export default function CustomTabBar({
  state,
  navigation,
  rootNavigation,
  onOpenAssistant,
  initialTooltipVisible = null,
}) {
  const insets = useSafeAreaInsets();
  const bottomInset = insets?.bottom || 0;
  const barHeight = 64 + bottomInset;

  const currentTabName = state.routes[state.index]?.name;

  const handleOpenAssistant = (data) => {
    if (onOpenAssistant) {
      onOpenAssistant(data);
    } else if (rootNavigation) {
      rootNavigation.navigate('Assistant', data);
    } else {
      navigation.navigate('Assistant', data);
    }
  };

  return (
    <View
      testID="tab-bar-container"
      style={[styles.tabBarContainer, { height: barHeight }]}
      pointerEvents="box-none"
    >
      <View
        testID="tab-bar-background"
        style={[
          styles.tabBarBackground,
          {
            height: barHeight,
            paddingBottom: bottomInset,
          },
        ]}
      >
        {/* Slot 1: Home */}
        <TabSlot
          tab={LEFT_TABS[0]}
          isActive={currentTabName === 'Home'}
          onPress={() => navigation.navigate('Home')}
        />

        {/* Slot 2: History */}
        <TabSlot
          tab={LEFT_TABS[1]}
          isActive={currentTabName === 'History'}
          onPress={() => navigation.navigate('History')}
        />

        {/* Slot 3: Center Coin Button (Raised 72px) */}
        <View style={styles.centerCoinSlot}>
          <CoinButton
            testID="tab-assistant"
            onOpenAssistant={handleOpenAssistant}
            initialTooltipVisible={initialTooltipVisible}
          />
        </View>

        {/* Slot 4: People */}
        <TabSlot
          tab={RIGHT_TABS[0]}
          isActive={currentTabName === 'People'}
          onPress={() => navigation.navigate('People')}
        />

        {/* Slot 5: Me */}
        <TabSlot
          tab={RIGHT_TABS[1]}
          isActive={currentTabName === 'Me'}
          onPress={() => navigation.navigate('Me')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 40,
  },
  tabBarBackground: {
    width: '100%',
    backgroundColor: colors.surface,
    borderTopWidth: 2,
    borderTopColor: colors.border,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  tabSlot: {
    flex: 1,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
  },
  tabLabel: {
    fontFamily: typography.fonts.display,
    fontWeight: '700',
    fontSize: 13,
    lineHeight: 16,
    marginTop: 2,
  },
  tabLabelActive: {
    color: colors.ink,
  },
  tabLabelInactive: {
    color: colors.ink_muted,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 3,
  },
  activeDotVisible: {
    backgroundColor: colors.gold,
  },
  activeDotHidden: {
    backgroundColor: 'transparent',
  },
  centerCoinSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    height: 64,
  },
});
