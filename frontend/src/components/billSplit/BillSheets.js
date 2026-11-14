import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import BottomSheet from '../ui/BottomSheet';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Input from '../ui/Input';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { t } from '../../i18n/strings';
import { formatRupees } from './format';

const toNumber = (text) => {
  const value = parseFloat(String(text).replace(/[^0-9.]/g, ''));
  return Number.isFinite(value) ? value : 0;
};

/** Edit or add one bill line (review screen). `item` null means a new line. */
export function ItemEditSheet({ visible, item, onClose, onSave, onRemove, language = 'en' }) {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (!visible) return;
    setName(item?.name || '');
    setQuantity(item ? String(item.quantity) : '1');
    setAmount(item ? String(item.amount) : '');
  }, [visible, item]);

  const valid = name.trim().length > 0 && toNumber(amount) > 0 && toNumber(quantity) > 0;

  return (
    <BottomSheet visible={visible} onClose={onClose} testID="bill-item-sheet">
      <Text style={styles.title}>{t(item ? 'bill.edit.title' : 'bill.edit.addTitle', language)}</Text>
      <Input testID="bill-item-name" label={t('bill.edit.name', language)} value={name} onChangeText={setName}
        autoCapitalize="words" style={styles.field} />
      <View style={styles.pair}>
        <Input testID="bill-item-quantity" label={t('bill.edit.quantity', language)} value={quantity}
          onChangeText={setQuantity} keyboardType="decimal-pad" style={[styles.field, styles.half]} />
        <Input testID="bill-item-amount" label={t('bill.edit.amount', language)} value={amount}
          onChangeText={setAmount} keyboardType="decimal-pad" style={[styles.field, styles.half]} />
      </View>
      <Button
        testID="bill-item-save"
        title={t('bill.edit.save', language)}
        disabled={!valid}
        onPress={() => onSave({ name: name.trim(), quantity: toNumber(quantity), amount: toNumber(amount) })}
      />
      {item && onRemove ? (
        <Button testID="bill-item-remove" title={t('bill.edit.remove', language)} variant="destructive_outline"
          onPress={onRemove} style={styles.second} />
      ) : null}
    </BottomSheet>
  );
}

/** Edit tax, service charge, discount and total (review screen). */
export function ChargesSheet({ visible, bill, onClose, onSave, language = 'en' }) {
  const [values, setValues] = useState({ tax: '0', service_charge: '0', discount: '0', total: '0' });

  useEffect(() => {
    if (!visible || !bill) return;
    setValues({
      tax: String(bill.tax), service_charge: String(bill.service_charge),
      discount: String(bill.discount), total: String(bill.total),
    });
  }, [visible, bill]);

  const field = (key, labelKey) => (
    <Input
      testID={`bill-charge-${key}`}
      label={t(labelKey, language)}
      value={values[key]}
      onChangeText={(text) => setValues((prev) => ({ ...prev, [key]: text }))}
      keyboardType="decimal-pad"
      style={[styles.field, styles.half]}
    />
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} testID="bill-charges-sheet">
      <Text style={styles.title}>{t('bill.edit.chargesTitle', language)}</Text>
      <View style={styles.pair}>{field('tax', 'bill.review.tax')}{field('service_charge', 'bill.review.service')}</View>
      <View style={styles.pair}>{field('discount', 'bill.review.discount')}{field('total', 'bill.review.total')}</View>
      <Button
        testID="bill-charges-save"
        title={t('bill.edit.save', language)}
        disabled={toNumber(values.total) <= 0}
        onPress={() => onSave({
          tax: toNumber(values.tax), service_charge: toNumber(values.service_charge),
          discount: toNumber(values.discount), total: toNumber(values.total),
        })}
      />
    </BottomSheet>
  );
}

/** Choose who had one item by tapping names (assign screen). */
export function PeoplePickerSheet({ visible, item, people, onClose, onSave, language = 'en' }) {
  const [selected, setSelected] = useState([]);
  const [extra, setExtra] = useState([]);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (!visible) return;
    setSelected(item?.assigned_to || []);
    setExtra([]);
    setNewName('');
  }, [visible, item]);

  const names = ['me', ...people, ...extra.filter((n) => !people.includes(n))];
  const toggle = (name) =>
    setSelected((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
  const addName = () => {
    const name = newName.trim();
    if (!name) return;
    if (!names.some((n) => n.toLowerCase() === name.toLowerCase())) setExtra((prev) => [...prev, name]);
    setSelected((prev) => (prev.includes(name) ? prev : [...prev, name]));
    setNewName('');
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} testID="bill-people-sheet">
      <Text style={styles.title}>{t('bill.pick.title', language, { item: item?.name || '' })}</Text>
      <View style={styles.chips}>
        {names.map((name) => {
          const on = selected.includes(name);
          return (
            <TouchableOpacity
              key={name}
              testID={`bill-person-chip-${name}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              onPress={() => toggle(name)}
              activeOpacity={0.7}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>
                {name === 'me' ? t('bill.assign.you', language) : name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.pair}>
        <Input testID="bill-person-new" placeholder={t('bill.pick.addPerson', language)} value={newName}
          onChangeText={setNewName} autoCapitalize="words" onSubmitEditing={addName} style={[styles.field, styles.grow]} />
        <Button testID="bill-person-add" title="+" variant="secondary" onPress={addName} style={styles.addButton} />
      </View>
      <Button testID="bill-people-save" title={t('bill.pick.done', language)} onPress={() => onSave(selected)} />
    </BottomSheet>
  );
}

/**
 * Ask one friend to pay (screen 7). Shows the UPI QR for their share. Pappu never moves
 * money: the friend pays in their own UPI app and the user marks the share paid.
 * Without a saved UPI ID the sheet asks for it first.
 */
export function AskToPaySheet({
  visible, share, request, merchant, loading, needsUpiId, onSaveUpiId, onMarkPaid, onClose, onShowToast,
  language = 'en',
}) {
  const [upiId, setUpiId] = useState('');
  const [saving, setSaving] = useState(false);
  const [upiError, setUpiError] = useState(null);

  useEffect(() => {
    if (visible) {
      setUpiId('');
      setUpiError(null);
    }
  }, [visible]);

  const saveUpi = async () => {
    setSaving(true);
    setUpiError(null);
    try {
      await onSaveUpiId(upiId.trim());
    } catch (err) {
      setUpiError(err.message || t('bill.error.generic', language));
    } finally {
      setSaving(false);
    }
  };

  const shareRequest = async () => {
    try {
      await Share.share({ message: request.message });
    } catch (_) {
      // The share sheet was dismissed or is unavailable; nothing to report.
    }
  };
  const copyDetails = async () => {
    await Clipboard.setStringAsync(request.message);
    if (onShowToast) onShowToast(t('bill.ask.copied', language));
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} testID="bill-ask-sheet">
      <Text style={styles.title}>{t('bill.ask.title', language, { name: share?.name || '' })}</Text>

      {needsUpiId ? (
        <View>
          <Text style={styles.note}>{t('bill.ask.upiMissing', language)}</Text>
          <Input testID="bill-upi-input" label={t('bill.ask.upiLabel', language)} placeholder="name@bank"
            value={upiId} onChangeText={setUpiId} error={upiError} style={styles.field} />
          {upiError ? <Text testID="bill-upi-error" style={styles.error}>{upiError}</Text> : null}
          <Button testID="bill-upi-save" title={t('bill.ask.upiSave', language)} loading={saving}
            disabled={!upiId.trim()} onPress={saveUpi} />
        </View>
      ) : request ? (
        <View>
          <Card style={styles.qrCard}>
            <View testID="bill-ask-qr" accessibilityLabel={`UPI QR code for ${formatRupees(request.amount)}`}>
              <QRCode value={request.upi_link} size={168} color={colors.ink} backgroundColor={colors.surface} />
            </View>
            <Text style={styles.qrAmount}>{formatRupees(request.amount)}</Text>
            <Text style={styles.qrCaption}>
              {t('bill.ask.paysTo', language, { upi: request.upi_id, merchant: merchant || '' })}
            </Text>
          </Card>
          <Text style={styles.note}>{t('bill.ask.note', language, { name: share?.name || '' })}</Text>
          <Button testID="bill-ask-share" title={t('bill.ask.share', language)} onPress={shareRequest} />
          <View style={[styles.pair, styles.second]}>
            <Button testID="bill-ask-copy" title={t('bill.ask.copy', language)} variant="secondary"
              onPress={copyDetails} style={styles.half} />
            <Button testID="bill-ask-paid" title={t('bill.ask.markPaid', language)} variant="secondary"
              loading={loading} onPress={onMarkPaid} style={styles.half} />
          </View>
        </View>
      ) : (
        <Text testID="bill-ask-loading" style={styles.note}>…</Text>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.headline_h1, color: colors.ink, marginBottom: spacing.lg },
  field: { marginBottom: spacing.md },
  pair: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-end' },
  half: { flex: 1 },
  grow: { flex: 1 },
  second: { marginTop: spacing.md },
  addButton: { width: 56, marginBottom: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  chip: {
    height: 40, paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 2,
    borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.gold, borderColor: colors.ink, borderWidth: 1, borderBottomWidth: 3, borderBottomColor: colors.gold_edge },
  chipText: { ...typography.caption_bold, color: colors.ink_muted },
  chipTextOn: { color: colors.ink },
  qrCard: { alignItems: 'center', gap: spacing.sm },
  qrAmount: { ...typography.display_amount, color: colors.ink, fontVariant: ['tabular-nums'] },
  qrCaption: { ...typography.caption_bold, color: colors.ink_muted, textAlign: 'center' },
  note: { ...typography.caption_bold, color: colors.ink_muted, marginVertical: spacing.md },
  error: { ...typography.caption_bold, color: colors.expense, marginBottom: spacing.md },
});
