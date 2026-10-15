import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { colors, radius, spacing, typography, buttonEdgeColors } from '../theme/tokens';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';
import Chip from '../components/ui/Chip';
import SegmentedControl from '../components/ui/SegmentedControl';
import ListRow from '../components/ui/ListRow';
import Avatar from '../components/ui/Avatar';
import AmountText from '../components/ui/AmountText';
import Icon from '../components/ui/Icon';
import BottomSheet from '../components/ui/BottomSheet';
import Dialog from '../components/ui/Dialog';
import Toast from '../components/ui/Toast';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import Pappu, { PappuLogo, PappuWordmark } from '../components/ui/Pappu';
import MascotDevToggle from '../components/ui/MascotDevToggle';

const ALL_MOODS = [
  'idle',
  'listening',
  'thinking',
  'speaking',
  'happy',
  'excited',
  'worried',
  'concerned',
  'confused',
  'sleepy',
];

export default function StyleguideScreen({ onBack }) {
  const [activeTab, setActiveTab] = useState('week');
  const [selectedChip, setSelectedChip] = useState('all');
  const [inputValue, setInputValue] = useState('');
  const [inputError, setInputError] = useState('');
  const [sheetVisible, setSheetVisible] = useState(false);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        testID="styleguide-screen"
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <PappuLogo size={36} />
            <View style={styles.headerTitleBox}>
              <PappuWordmark size={22} />
              <Text style={styles.headerSubtitle}>Mascot Design System</Text>
            </View>
          </View>
          {onBack ? (
            <TouchableOpacity onPress={onBack} style={styles.backBtn}>
              <Icon name="arrow-left" size={20} color={colors.ink} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* 1. Color Palette Tokens */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Color Tokens (Strictly Flat)</Text>
          <View style={styles.swatchGrid}>
            {[
              { name: 'bg', hex: colors.bg, border: colors.border },
              { name: 'surface', hex: colors.surface, border: colors.border },
              { name: 'border', hex: colors.border },
              { name: 'gold', hex: colors.gold },
              { name: 'gold_edge', hex: colors.gold_edge },
              { name: 'ink', hex: colors.ink },
              { name: 'ink_muted', hex: colors.ink_muted },
              { name: 'income', hex: colors.income },
              { name: 'expense', hex: colors.expense },
              { name: 'expense_edge', hex: colors.expense_edge },
              { name: 'teal', hex: colors.teal },
            ].map((c) => (
              <View key={c.name} style={styles.swatchItem}>
                <View
                  style={[
                    styles.swatch,
                    {
                      backgroundColor: c.hex,
                      borderColor: c.border || c.hex,
                      borderWidth: c.border ? 2 : 0,
                    },
                  ]}
                />
                <Text style={styles.swatchLabel}>{c.name}</Text>
                <Text style={styles.swatchHex}>{c.hex}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 2. Typography & Malayalam Line Heights */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Typography & Malayalam Verification</Text>
          <Card style={styles.cardSection}>
            <Text style={[typography.display_amount, { color: colors.ink }]}>
              Display 32: ₹2,41,860
            </Text>
            <Text style={[typography.headline_h1, { color: colors.ink, marginTop: 8 }]}>
              Headline H1 24: ചായ 20 രൂപ
            </Text>
            <Text style={[typography.headline_h2, { color: colors.ink, marginTop: 8 }]}>
              Headline H2 18: Daily Spending
            </Text>
            <Text style={[typography.body_main, { color: colors.ink, marginTop: 8 }]}>
              Body Main 15: പൂജയ്ക്ക് 500 കൊടുത്തു (Sent 500 to Pooja)
            </Text>
            <Text style={[typography.body_secondary, { color: colors.ink_muted, marginTop: 4 }]}>
              Body Secondary 14: Yesterday at 8:45 PM
            </Text>
            <Text style={[typography.caption_bold, { color: colors.ink_muted, marginTop: 4 }]}>
              Caption Bold 13: +₹1,250 vs last week
            </Text>
          </Card>
        </View>

        {/* 3. Button Variants (4px tactile edge) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Tactile Buttons (4px Edge, 80ms Press)</Text>
          <View style={styles.buttonStack}>
            <Button
              title="Primary Action (Gold)"
              variant="primary"
              onPress={() => {}}
            />
            <Button
              title="Secondary Action (White)"
              variant="secondary"
              onPress={() => {}}
            />
            <Button
              title="Destructive Action"
              variant="destructive"
              onPress={() => {}}
            />
            <Button
              title="Destructive Outline"
              variant="destructive_outline"
              onPress={() => {}}
            />
            <View style={styles.buttonRow}>
              <View style={styles.flex1}>
                <Button title="Dialog (48px)" size="dialog" variant="secondary" />
              </View>
              <View style={styles.flex1}>
                <Button title="Loading" loading variant="primary" />
              </View>
            </View>
          </View>
        </View>

        {/* 4. Form Input */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4. Form Input (Gold Focus Border)</Text>
          <Input
            label="Contact Name"
            placeholder="Enter friend or vendor name"
            value={inputValue}
            onChangeText={setInputValue}
          />
          <Input
            label="Amount with Error State"
            placeholder="₹0"
            value="abc"
            error="Please enter a valid numeric amount"
            onChangeText={() => {}}
          />
        </View>

        {/* 5. Chips & Segmented Controls */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>5. Chips & Segmented Controls</Text>
          <SegmentedControl
            segments={[
              { key: 'week', label: 'Week' },
              { key: 'month', label: 'Month' },
              { key: 'year', label: 'Year' },
            ]}
            selectedKey={activeTab}
            onSelect={setActiveTab}
          />
          <View style={styles.chipRow}>
            {['All', 'Expenses', 'Income', 'People'].map((k) => (
              <Chip
                key={k}
                label={k}
                selected={selectedChip === k.toLowerCase()}
                onPress={() => setSelectedChip(k.toLowerCase())}
                count={k === 'People' ? 4 : null}
              />
            ))}
          </View>
        </View>

        {/* 6. ListRow & Avatars */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>6. ListRow & Avatars</Text>
          <Card padding="none">
            <ListRow
              leading={<Avatar name="Pooja Sharma" />}
              title="Pooja Sharma"
              subtitle="Owes you • 2 txns"
              trailing={<AmountText amount={1500} type="income" showSign />}
            />
            <ListRow
              leading={<Avatar name="Supermarket" />}
              title="Supermarket Groceries"
              subtitle="Shopping • Today, 11:20 AM"
              trailing={<AmountText amount={840} type="expense" showSign />}
            />
            <ListRow
              leading={<Avatar name="Rahul" />}
              title="Rahul Nair"
              subtitle="You owe • Settled"
              trailing={<AmountText amount={0} type="neutral" />}
              showDivider={false}
            />
          </Card>
        </View>

        {/* 7. AmountText Cases */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>7. AmountText (Tabular, Signed)</Text>
          <Card>
            <View style={styles.amountShowcase}>
              <View style={styles.amountRowItem}>
                <Text style={styles.labelMuted}>Income (+₹):</Text>
                <AmountText amount={59891} type="income" showSign size="xl" />
              </View>
              <View style={styles.amountRowItem}>
                <Text style={styles.labelMuted}>Expense (−₹):</Text>
                <AmountText amount={5109} type="expense" showSign size="xl" />
              </View>
              <View style={styles.amountRowItem}>
                <Text style={styles.labelMuted}>Decimals:</Text>
                <AmountText amount={1250.75} type="neutral" size="lg" />
              </View>
              <View style={styles.amountRowItem}>
                <Text style={styles.labelMuted}>Display size:</Text>
                <AmountText amount={241860} size="display" />
              </View>
            </View>
          </Card>
        </View>

        {/* 8. Skeletons (Flat Blocks of Border Color) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>8. Skeleton Placeholders (Flat Blocks)</Text>
          <Card>
            <Skeleton width={140} height={18} style={{ marginBottom: 12 }} />
            <Skeleton width={200} height={32} style={{ marginBottom: 12 }} />
            <Skeleton width="100%" height={14} />
          </Card>
        </View>

        {/* 9. Modals & Notifications */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>9. Modals (Dialog, Sheet, Toast)</Text>
          <View style={styles.buttonStack}>
            <Button
              title="Open Delete Dialog"
              variant="destructive"
              onPress={() => setDialogVisible(true)}
            />
            <Button
              title="Open Bottom Sheet"
              variant="secondary"
              onPress={() => setSheetVisible(true)}
            />
            <Button
              title="Show Undo Toast"
              variant="primary"
              onPress={() => setToastVisible(true)}
            />
          </View>
        </View>

        {/* 10. EmptyState with Sleepy Mascot */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>10. Empty State</Text>
          <Card padding="none">
            <EmptyState
              mascotMood="sleepy"
              title="Nothing here yet"
              description="Tap the coin or hold to record an expense."
              actionTitle="Add Transaction"
              onActionPress={() => {}}
            />
          </Card>
        </View>

        {/* 11. All 10 Pappu Mascot Moods */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>11. Mascot: 10 Static Poses (Crossfade & Blink)</Text>
          <View style={styles.mascotGrid}>
            {ALL_MOODS.map((mood) => (
              <View key={mood} style={styles.mascotCell}>
                <Pappu mood={mood} size={80} />
                <Text style={styles.mascotCaption}>{mood}</Text>
              </View>
            ))}
          </View>
          <View style={{ marginTop: 16 }}>
            <MascotDevToggle />
          </View>
        </View>

        {/* Modals rendered conditionally */}
        <Dialog
          visible={dialogVisible}
          onClose={() => setDialogVisible(false)}
          title="Delete Transaction?"
          description="Are you sure you want to delete this expense? This cannot be undone."
          confirmTitle="Delete"
          confirmVariant="destructive"
          onConfirm={() => setDialogVisible(false)}
        />

        <BottomSheet
          visible={sheetVisible}
          onClose={() => setSheetVisible(false)}
        >
          <Text style={[typography.headline_h1, { color: colors.ink, marginBottom: 8 }]}>
            Bottom Sheet Title
          </Text>
          <Text style={[typography.body_main, { color: colors.ink_muted, marginBottom: 20 }]}>
            This sheet uses flat dim scrim with zero ambient blur.
          </Text>
          <Button
            title="Done"
            variant="primary"
            onPress={() => setSheetVisible(false)}
          />
        </BottomSheet>

        <Toast
          visible={toastVisible}
          message="Transaction deleted"
          actionText="Undo"
          onAction={() => setToastVisible(false)}
          onDismiss={() => setToastVisible(false)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    padding: spacing.lg,
    paddingBottom: 120,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitleBox: {
    marginLeft: spacing.sm,
  },
  headerSubtitle: {
    fontSize: 12,
    fontFamily: 'Nunito_600SemiBold',
    color: colors.ink_muted,
  },
  backBtn: {
    padding: 8,
  },
  section: {
    marginBottom: spacing['2xl'],
  },
  sectionTitle: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  cardSection: {
    padding: spacing.lg,
  },
  swatchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  swatchItem: {
    width: 68,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  swatch: {
    width: 48,
    height: 48,
    borderRadius: radius.card,
    marginBottom: 4,
  },
  swatchLabel: {
    fontSize: 10,
    fontFamily: 'Nunito_600SemiBold',
    color: colors.ink,
    textAlign: 'center',
  },
  swatchHex: {
    fontSize: 9,
    fontFamily: 'Nunito_600SemiBold',
    color: colors.ink_muted,
    textAlign: 'center',
  },
  buttonStack: {
    gap: spacing.md,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flex1: {
    flex: 1,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.md,
  },
  amountShowcase: {
    gap: spacing.md,
  },
  amountRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  labelMuted: {
    fontSize: 14,
    fontFamily: 'Nunito_600SemiBold',
    color: colors.ink_muted,
  },
  mascotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  mascotCell: {
    width: '30%',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.card,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  mascotCaption: {
    marginTop: 6,
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 12,
    color: colors.ink,
    textTransform: 'capitalize',
  },
});
