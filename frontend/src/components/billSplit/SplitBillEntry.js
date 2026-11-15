import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Icon from '../ui/Icon';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { t } from '../../i18n/strings';

/**
 * The two labelled ways into "Split a bill" (approved 2026-11-16):
 * a card on Home under the people block, and a full-width button on the People tab.
 * Both open the same start sheet.
 */

export function SplitBillCard({ onPress, language = 'en', style }) {
  return (
    <TouchableOpacity
      testID="home-split-bill-card"
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={t('bill.start.title', language)}
      accessibilityHint={t('bill.entry.subtitle', language)}
    >
      <Card style={[styles.card, style]}>
        <View style={styles.iconTile}>
          <Icon name="file-text" size={22} />
        </View>
        <View style={styles.text}>
          <Text style={styles.title}>{t('bill.start.title', language)}</Text>
          <Text style={styles.subtitle}>{t('bill.entry.subtitle', language)}</Text>
        </View>
        <Icon name="chevron-right" size={22} color={colors.ink_muted} />
      </Card>
    </TouchableOpacity>
  );
}

export function SplitBillButton({ onPress, language = 'en', style }) {
  return (
    <Button
      testID="people-split-bill-button"
      title={t('bill.start.title', language)}
      variant="secondary"
      icon={<Icon name="file-text" size={20} />}
      onPress={onPress}
      style={style}
    />
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: radius.small,
    backgroundColor: colors.gold,
    borderWidth: 1,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1 },
  title: { ...typography.headline_h2, color: colors.ink },
  subtitle: { ...typography.caption_bold, color: colors.ink_muted, marginTop: 2 },
});
