import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import BottomSheet from '../ui/BottomSheet';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import Pappu from '../ui/Pappu';
import { colors, spacing, typography } from '../../theme/tokens';
import { t } from '../../i18n/strings';

/**
 * "Split a bill" start sheet (design/stitch/bill_split.html, screen 1).
 * Opened from the receipt button in the People header.
 */
export default function BillStartSheet({ visible, onClose, onPick, language = 'en', error = null }) {
  return (
    <BottomSheet visible={visible} onClose={onClose} testID="bill-start-sheet">
      <Text style={styles.title}>{t('bill.start.title', language)}</Text>
      <View style={styles.introRow}>
        <Pappu mood="neutral" size={56} autoSleepy={false} testID="bill-start-mascot" />
        <Text style={styles.intro}>{t('bill.start.intro', language)}</Text>
      </View>
      {error ? (
        <Text testID="bill-start-error" style={styles.error}>{error}</Text>
      ) : null}
      <Button
        testID="bill-start-camera"
        title={t('bill.start.camera', language)}
        icon={<Icon name="camera" size={20} />}
        onPress={() => onPick('camera')}
      />
      <Button
        testID="bill-start-gallery"
        title={t('bill.start.gallery', language)}
        variant="secondary"
        icon={<Icon name="image" size={20} />}
        onPress={() => onPick('gallery')}
        style={styles.second}
      />
      <Text style={styles.hint}>{t('bill.start.hint', language)}</Text>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.headline_h1, color: colors.ink, marginBottom: spacing.lg },
  introRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  intro: { ...typography.body_main, color: colors.ink, flex: 1 },
  second: { marginTop: spacing.md },
  hint: { ...typography.caption_bold, color: colors.ink_muted, textAlign: 'center', marginTop: spacing.lg },
  error: { ...typography.caption_bold, color: colors.expense, marginBottom: spacing.md },
});
