import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
} from 'react-native';
import { colors, typography } from '../../theme/tokens';
import { useReduceMotion } from '../../utils/reduceMotion';
import { formatAmount } from './AmountText';

const TOTAL_HEIGHT = 160;
const HEADROOM_HEIGHT = 48;
const MAX_BAR_HEIGHT = 112;
const ZERO_STUB_HEIGHT = 6;

export default function SpendingChart({
  buckets = [],
  period = 'week',
  selectedBarIndex = null,
  onSelectBar = null,
  testID = 'spending-chart',
}) {
  const reduceMotion = useReduceMotion();
  const isTest = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';

  const [containerWidth, setContainerWidth] = useState(350);

  // Normalize buckets
  const normalizedBuckets = React.useMemo(() => {
    if (buckets && buckets.length > 0) return buckets;
    if (period === 'month') {
      return Array.from({ length: 30 }, (_, i) => ({
        date: `day-${i + 1}`,
        label: String(i + 1),
        amount: 0,
      }));
    }
    if (period === 'year') {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return months.map((m, i) => ({
        date: `m-${i + 1}`,
        label: m,
        amount: 0,
      }));
    }
    // Week default
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return days.map((d, i) => ({
      date: `d-${i + 1}`,
      label: d,
      amount: 0,
    }));
  }, [buckets, period]);

  const numBars = normalizedBuckets.length;
  const maxAmount = React.useMemo(() => {
    return Math.max(0, ...normalizedBuckets.map((b) => Number(b.amount || 0)));
  }, [normalizedBuckets]);

  // Find peak index
  const peakIndex = React.useMemo(() => {
    if (maxAmount <= 0) return -1;
    return normalizedBuckets.findIndex((b) => Number(b.amount || 0) === maxAmount);
  }, [normalizedBuckets, maxAmount]);

  // Internal selection state
  const isControlled = selectedBarIndex !== null && selectedBarIndex !== undefined;
  const [internalSelectedIndex, setInternalSelectedIndex] = useState(() => {
    if (isControlled) {
      return selectedBarIndex;
    }
    return peakIndex >= 0 ? peakIndex : 0;
  });

  const prevPeriodRef = useRef(period);
  useEffect(() => {
    if (isControlled) {
      setInternalSelectedIndex(selectedBarIndex);
    } else if (prevPeriodRef.current !== period) {
      prevPeriodRef.current = period;
      setInternalSelectedIndex(peakIndex >= 0 ? peakIndex : 0);
    }
  }, [isControlled, selectedBarIndex, period, peakIndex]);

  const activeIndex = internalSelectedIndex;
  const selectedBucket = activeIndex >= 0 && activeIndex < numBars ? normalizedBuckets[activeIndex] : null;

  // Staggered grow animations for bars
  const barAnimRefs = useRef([]);
  if (barAnimRefs.current.length !== numBars) {
    barAnimRefs.current = normalizedBuckets.map(() => new Animated.Value(isTest || reduceMotion ? 1 : 0));
  }

  useEffect(() => {
    if (isTest || reduceMotion) {
      barAnimRefs.current.forEach((anim) => anim.setValue(1));
      return;
    }

    // Reset and stagger
    barAnimRefs.current.forEach((anim) => anim.setValue(0));
    const animations = barAnimRefs.current.map((anim, index) => {
      return Animated.timing(anim, {
        toValue: 1,
        duration: 300,
        delay: index * 40,
        useNativeDriver: false,
      });
    });

    Animated.parallel(animations).start();
  }, [normalizedBuckets, period, isTest, reduceMotion]);

  // Tooltip pop animation
  const tooltipScale = useRef(new Animated.Value(isTest || reduceMotion ? 1 : 0.8)).current;
  const tooltipTranslateY = useRef(new Animated.Value(isTest || reduceMotion ? 0 : 4)).current;
  const tooltipOpacity = useRef(new Animated.Value(isTest || reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (activeIndex >= 0) {
      if (isTest || reduceMotion) {
        tooltipScale.setValue(1);
        tooltipTranslateY.setValue(0);
        if (reduceMotion && !isTest) {
          tooltipOpacity.setValue(0);
          Animated.timing(tooltipOpacity, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
          }).start();
        } else {
          tooltipOpacity.setValue(1);
        }
      } else {
        tooltipScale.setValue(0.8);
        tooltipTranslateY.setValue(4);
        tooltipOpacity.setValue(0);

        Animated.parallel([
          Animated.timing(tooltipScale, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.timing(tooltipTranslateY, {
            toValue: 0,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.timing(tooltipOpacity, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
          }),
        ]).start();
      }
    }
  }, [activeIndex, isTest, reduceMotion]);

  const handleBarPress = (index) => {
    setInternalSelectedIndex(index);
    if (onSelectBar) {
      onSelectBar(index, normalizedBuckets[index]);
    }
  };

  // Bar dimensions based on period & count
  const barWidth = React.useMemo(() => {
    if (numBars <= 7) return 24;
    if (numBars <= 14) return 14;
    return Math.max(5, Math.min(8, Math.floor((containerWidth - 32) / numBars - 2)));
  }, [numBars, containerWidth]);

  const barRadius = numBars > 14 ? 3 : 6;
  const stubRadius = numBars > 14 ? 2 : 4;

  // Exact bar layout and positioning (accounting for barsArea paddingHorizontal: 4)
  const innerBarsWidth = Math.max(0, containerWidth - 8);
  const columnWidth = numBars > 0 ? innerBarsWidth / numBars : 0;
  const selectedBarCenter = activeIndex >= 0 ? 4 + (activeIndex + 0.5) * columnWidth : 0;

  // Selected bar height & top edge
  const selectedAmt = selectedBucket ? Number(selectedBucket.amount || 0) : 0;
  let selectedBarHeight = ZERO_STUB_HEIGHT;
  if (selectedAmt > 0 && maxAmount > 0) {
    selectedBarHeight = Math.max(ZERO_STUB_HEIGHT, Math.round((selectedAmt / maxAmount) * MAX_BAR_HEIGHT));
  }
  const barTopY = HEADROOM_HEIGHT + (MAX_BAR_HEIGHT - selectedBarHeight);

  // Tooltip dimensions & vertical headroom placement
  const tooltipHeight = 26; // 20px pill + ~6px arrow
  const arrowGap = 4; // Gap between arrow tip and bar top edge
  const idealTop = barTopY - tooltipHeight - arrowGap;
  // Keep tooltip strictly inside headroom (top between 4 and 22 so it never overlaps any bar)
  const tooltipTop = Math.max(4, Math.min(HEADROOM_HEIGHT - tooltipHeight, idealTop));

  // Tooltip width estimate based on formatted amount length
  const tooltipText = selectedBucket ? `₹${formatAmount(selectedBucket.amount)}` : '';
  const estimatedTooltipWidth = Math.max(54, tooltipText.length * 9 + 20);
  const halfTooltipWidth = estimatedTooltipWidth / 2;

  // Clamp tooltip inside card inner padding (4px margin from card boundaries)
  const minCenter = halfTooltipWidth + 4;
  const maxCenter = Math.max(minCenter, containerWidth - halfTooltipWidth - 4);
  const clampedTooltipCenter = Math.max(minCenter, Math.min(maxCenter, selectedBarCenter));

  // Arrow offset relative to tooltip pill center: ensures arrow center equals selectedBarCenter
  const rawArrowOffset = selectedBarCenter - clampedTooltipCenter;
  const maxArrowOffset = Math.max(0, halfTooltipWidth - 4);
  const arrowOffset = Math.max(-maxArrowOffset, Math.min(maxArrowOffset, rawArrowOffset));

  return (
    <View
      testID={testID}
      style={styles.canvasContainer}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && Math.abs(w - containerWidth) > 2) {
          setContainerWidth(w);
        }
      }}
    >
      {/* Tooltip in headroom pointing at selected bar */}
      {selectedBucket && activeIndex >= 0 ? (
        <Animated.View
          testID="chart-tooltip"
          style={[
            styles.tooltipContainer,
            {
              left: clampedTooltipCenter,
              top: tooltipTop,
              opacity: tooltipOpacity,
              transform: [
                { translateX: -halfTooltipWidth },
                { translateY: tooltipTranslateY },
                { scale: tooltipScale },
              ],
            },
          ]}
        >
          <View testID="chart-tooltip-pill" style={styles.tooltipPill}>
            <Text
              testID="chart-tooltip-amount"
              style={styles.tooltipText}
              numberOfLines={1}
            >
              {tooltipText}
            </Text>
          </View>
          <View
            testID="chart-tooltip-arrow"
            style={[styles.tooltipArrow, { marginLeft: arrowOffset }]}
          />
        </Animated.View>
      ) : null}

      {/* Bars row (strictly at bottom of 160px canvas, height 112px) */}
      <View style={styles.barsArea}>
        {normalizedBuckets.map((bucket, index) => {
          const amt = Number(bucket.amount || 0);
          const isSelected = index === activeIndex;
          const isZero = amt === 0;

          // Target bar height (6px stub for 0, scaled 6-112px for positive)
          let targetHeight = ZERO_STUB_HEIGHT;
          if (!isZero && maxAmount > 0) {
            targetHeight = Math.max(ZERO_STUB_HEIGHT, Math.round((amt / maxAmount) * MAX_BAR_HEIGHT));
          }

          const animatedHeight = barAnimRefs.current[index]
            ? barAnimRefs.current[index].interpolate({
                inputRange: [0, 1],
                outputRange: [isZero ? ZERO_STUB_HEIGHT : ZERO_STUB_HEIGHT, targetHeight],
              })
            : targetHeight;

          return (
            <TouchableOpacity
              key={bucket.date || index}
              testID={`chart-bar-col-${index}`}
              activeOpacity={0.8}
              onPress={() => handleBarPress(index)}
              style={styles.barColumn}
            >
              <Animated.View
                testID={`chart-bar-${index}`}
                style={[
                  styles.barBase,
                  {
                    width: barWidth,
                    height: animatedHeight,
                    backgroundColor: isZero ? colors.border : colors.gold,
                    borderTopLeftRadius: isZero ? stubRadius : barRadius,
                    borderTopRightRadius: isZero ? stubRadius : barRadius,
                  },
                  isSelected && !isZero && {
                    borderTopWidth: 2,
                    borderLeftWidth: 2,
                    borderRightWidth: 2,
                    borderBottomWidth: 0,
                    borderColor: colors.ink,
                  },
                ]}
              />
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 1px bottom axis line */}
      <View style={styles.axisLine} />

      {/* Axis day/month labels */}
      <View style={styles.labelsRow}>
        {normalizedBuckets.map((bucket, index) => {
          const isSelected = index === activeIndex;

          // Month label milestone filter: only show days 1, 7, 14, 21, 28 (or last day)
          let labelText = bucket.label || '';
          if (numBars > 14) {
            const dayNum = parseInt(bucket.label, 10);
            const isMilestone = !isNaN(dayNum) && (dayNum === 1 || dayNum === 7 || dayNum === 14 || dayNum === 21 || dayNum === 28 || dayNum === numBars);
            if (!isMilestone && !isSelected) {
              labelText = '';
            }
          }

          return (
            <View key={`lbl-${bucket.date || index}`} style={styles.labelCol}>
              <Text
                testID={`chart-label-${index}`}
                style={[
                  styles.labelText,
                  isSelected ? styles.selectedLabelText : styles.unselectedLabelText,
                ]}
                numberOfLines={1}
              >
                {labelText}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  canvasContainer: {
    width: '100%',
    height: TOTAL_HEIGHT,
    position: 'relative',
    justifyContent: 'flex-end',
    paddingTop: HEADROOM_HEIGHT,
  },
  tooltipContainer: {
    position: 'absolute',
    zIndex: 20,
    alignItems: 'center',
  },
  tooltipPill: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tooltipText: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 13,
    lineHeight: 16,
    color: colors.ink,
    includeFontPadding: false,
  },
  tooltipArrow: {
    width: 8,
    height: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderColor: colors.border,
    transform: [{ rotate: '45deg' }],
    marginTop: -4,
  },
  barsArea: {
    width: '100%',
    height: MAX_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  barColumn: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  barBase: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  axisLine: {
    width: '100%',
    height: 1,
    backgroundColor: colors.border,
  },
  labelsRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingTop: 6,
    minHeight: 22,
  },
  labelCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelText: {
    fontSize: 13,
    fontFamily: 'Nunito_700Bold',
    fontWeight: '700',
    includeFontPadding: false,
    textAlign: 'center',
  },
  selectedLabelText: {
    color: colors.ink,
  },
  unselectedLabelText: {
    color: colors.ink_muted,
  },
});
