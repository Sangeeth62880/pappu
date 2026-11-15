import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Icon from '../ui/Icon';
import Pappu from '../ui/Pappu';
import Skeleton from '../ui/Skeleton';
import MicButton from '../MicButton';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { isMalayalamText, t } from '../../i18n/strings';
import {
  assignBill, cancelBill, confirmBill, fetchPayRequest, markBillSharePaid, patchBill, patchProfile,
  resolveBillPerson, setBillItemPeople, undoBill, uploadBill,
} from '../../api/client';
import { pickBillImage } from '../../utils/billPicker';
import { AskToPaySheet, ChargesSheet, ItemEditSheet, PeoplePickerSheet } from './BillSheets';
import { billLanguage, formatRupees, lineDetail, plainAmount } from './format';

/**
 * Bill split flow (design/stitch/bill_split.html, screens 2 to 7; PROJECT_SPEC.md §5b).
 *
 * reading → review → assign → preview → saved. Nothing is written to the user's
 * transactions until "Save split" on the preview calls confirmBill.
 */
export default function BillSplitFlow({
  token,
  image,
  language = 'en',
  onClose,
  onMutated,
  onShowToast,
  pickImage = pickBillImage,
}) {
  const [step, setStep] = useState('reading');
  const [bill, setBill] = useState(null);
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [said, setSaid] = useState(null);
  const [draftText, setDraftText] = useState('');
  const [editingItem, setEditingItem] = useState(undefined); // undefined closed, null new, item edit
  const [chargesOpen, setChargesOpen] = useState(false);
  const [pickingItem, setPickingItem] = useState(null);
  const [askShare, setAskShare] = useState(null);
  const [payRequest, setPayRequest] = useState(null);
  const [needsUpiId, setNeedsUpiId] = useState(false);
  const [budgetAlert, setBudgetAlert] = useState(null);
  const alive = useRef(true);

  const lang = billLanguage(bill, language);
  const tr = (key, vars) => t(key, lang, vars);

  useEffect(() => () => { alive.current = false; }, []);

  // ── Reading ──
  const readImage = useCallback(async (picked) => {
    setStep('reading');
    setFailure(null);
    try {
      const result = await uploadBill(token, picked.file || picked);
      if (!alive.current) return;
      setBill(result);
      setStep('review');
    } catch (err) {
      if (!alive.current) return;
      setFailure(err.code === 'ocr_unavailable' ? 'bill.reading.unavailable'
        : err.code === 'unreadable' || err.code === 'unsupported_image' || err.code === 'image_too_large'
          ? 'bill.reading.failed'
          : 'bill.error.generic');
      setStep('failed');
    }
  }, [token]);

  useEffect(() => {
    if (image) readImage(image);
    else setStep('failed');
    // Runs once for the image the flow was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retake = async (source) => {
    try {
      const picked = await pickImage(source);
      if (picked) {
        if (bill?.status === 'draft') cancelBill(token, bill.id).catch(() => {});
        setBill(null);
        readImage(picked);
      }
    } catch (err) {
      setNotice(err.code === 'permission' ? tr('bill.start.permission') : tr('bill.error.generic'));
    }
  };

  // ── Shared call wrapper: one request at a time, errors shown inline ──
  const run = async (call, onDone) => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await call();
      if (!alive.current) return;
      if (onDone) onDone(result);
    } catch (err) {
      if (alive.current) setNotice(err.message || tr('bill.error.generic'));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const closeFlow = useCallback(() => {
    if (bill?.status === 'draft') cancelBill(token, bill.id).catch(() => {});
    onClose();
  }, [bill, token, onClose]);

  const goBack = useCallback(() => {
    if (step === 'assign') setStep('review');
    else if (step === 'preview') setStep('assign');
    else if (step === 'saved') onClose();
    else closeFlow();
    return true;
  }, [step, closeFlow, onClose]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', goBack);
    return () => sub.remove();
  }, [goBack]);

  // ── Review edits ──
  const saveItem = (values) => {
    const items = bill.items.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, amount: i.amount }));
    if (editingItem) {
      const index = bill.items.findIndex((i) => i.id === editingItem.id);
      items[index] = { id: editingItem.id, ...values };
    } else {
      items.push(values);
    }
    setEditingItem(undefined);
    run(() => patchBill(token, bill.id, { items }), setBill);
  };
  const removeItem = () => {
    const items = bill.items
      .filter((i) => i.id !== editingItem.id)
      .map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, amount: i.amount }));
    setEditingItem(undefined);
    run(() => patchBill(token, bill.id, { items }), setBill);
  };
  const saveCharges = (values) => {
    setChargesOpen(false);
    run(() => patchBill(token, bill.id, values), setBill);
  };

  // ── Assign ──
  const sendAssignment = (text, input = 'text') => {
    const trimmed = (text || '').trim();
    if (!trimmed) return;
    setSaid(trimmed);
    setDraftText('');
    run(() => assignBill(token, bill.id, trimmed, input), (result) => {
      setBill(result);
      if (result.understood === false) setNotice(t('bill.assign.notUnderstood', billLanguage(result, language)));
    });
  };
  const savePeople = (people) => {
    const item = pickingItem;
    setPickingItem(null);
    run(() => setBillItemPeople(token, bill.id, item.id, people), setBill);
  };
  const answerPerson = (name, useExisting) =>
    run(() => resolveBillPerson(token, bill.id, name, useExisting), setBill);

  // ── Confirm, undo, pay requests ──
  const saveSplit = () =>
    run(() => confirmBill(token, bill.id), (result) => {
      setBill(result);
      setBudgetAlert(result.budget_alert || null);
      setStep('saved');
      if (onMutated) onMutated();
    });
  const undoSplit = () =>
    run(() => undoBill(token, bill.id), () => {
      if (onMutated) onMutated();
      if (onShowToast) onShowToast(tr('bill.saved.undone'));
      onClose();
    });

  const loadPayRequest = async (share) => {
    setPayRequest(null);
    setNeedsUpiId(false);
    try {
      const result = await fetchPayRequest(token, bill.id, share.id);
      if (alive.current) setPayRequest(result);
    } catch (err) {
      if (!alive.current) return;
      if (err.code === 'upi_id_missing') setNeedsUpiId(true);
      else {
        setAskShare(null);
        setNotice(err.message || tr('bill.error.generic'));
      }
    }
  };
  const openAsk = (share) => {
    setAskShare(share);
    loadPayRequest(share);
  };
  const saveUpiId = async (upiId) => {
    await patchProfile(token, { upi_id: upiId });
    await loadPayRequest(askShare);
  };
  const markPaid = () =>
    run(() => markBillSharePaid(token, bill.id, askShare.id), (result) => {
      setBill(result);
      setAskShare(null);
      if (onMutated) onMutated();
    });

  // ── Pieces ──
  const header = (title, stepNumber, { close = false } = {}) => (
    <View style={styles.header}>
      {!close ? (
        <TouchableOpacity testID="bill-back" onPress={goBack} style={styles.roundButton} activeOpacity={0.7}
          accessibilityRole="button" accessibilityLabel="Back">
          <Icon name="chevron-left" size={20} />
        </TouchableOpacity>
      ) : null}
      <Txt variant="h1" style={styles.headerTitle} testID="bill-title">{title}</Txt>
      {stepNumber ? <Txt variant="caption" style={styles.muted}>{tr('bill.step', { n: stepNumber })}</Txt> : null}
      {close ? (
        <TouchableOpacity testID="bill-close" onPress={onClose} style={styles.roundButton} activeOpacity={0.7}
          accessibilityRole="button" accessibilityLabel="Close">
          <Icon name="x" size={20} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
  const noticeLine = notice ? <Txt variant="caption" testID="bill-notice" style={styles.notice}>{notice}</Txt> : null;

  // ── Screens ──
  let body = null;

  if (step === 'reading') {
    body = (
      <>
        {header(tr('bill.start.title'), 1)}
        <View style={styles.centered} testID="bill-reading">
          <Pappu state="thinking" size={96} autoSleepy={false} />
          <Txt variant="h1" style={styles.readingTitle}>{tr('bill.reading.title')}</Txt>
          <Txt variant="caption" style={[styles.muted, styles.readingBody]}>{tr('bill.reading.body')}</Txt>
          <Card style={styles.skeletonCard} padding="none">
            {[0.62, 0.48, 0.7].map((width, index) => (
              <View key={width} style={[styles.row, index > 0 && styles.rowDivider]}>
                <Skeleton width={`${width * 100}%`} height={14} style={styles.skeletonGrow} />
              </View>
            ))}
          </Card>
        </View>
        <View style={styles.footer}>
          <Button testID="bill-cancel" title={tr('bill.cancel')} variant="secondary" onPress={closeFlow} />
        </View>
      </>
    );
  } else if (step === 'failed') {
    body = (
      <>
        {header(tr('bill.start.title'))}
        <View style={styles.centered} testID="bill-failed">
          <Pappu mood="confused" size={96} autoSleepy={false} />
          <Txt variant="body" style={styles.failedText} testID="bill-failed-text">
            {tr(failure || 'bill.reading.failed')}
          </Txt>
          {noticeLine}
        </View>
        <View style={styles.footer}>
          <Button testID="bill-retake-camera" title={tr('bill.start.camera')} onPress={() => retake('camera')} />
          <Button testID="bill-retake-gallery" title={tr('bill.start.gallery')} variant="secondary"
            onPress={() => retake('gallery')} />
        </View>
      </>
    );
  } else if (step === 'review' && bill) {
    const less = bill.difference > 0;
    body = (
      <>
        {header(tr('bill.review.title'), 1)}
        <ScrollView contentContainerStyle={styles.scroll} testID="bill-review">
          {!bill.adds_up ? (
            <View style={styles.warnBanner} testID="bill-mismatch-banner">
              <Icon name="alert-triangle" size={20} color={colors.warning} />
              <Txt variant="caption" style={styles.warnText}>
                {tr(less ? 'bill.review.less' : 'bill.review.more', { amount: plainAmount(Math.abs(bill.difference)) })}
              </Txt>
            </View>
          ) : (
            <View style={styles.titleRow}>
              <View style={styles.grow}>
                <Txt variant="h2">{bill.merchant || tr('bill.start.title')}</Txt>
                <Txt variant="caption" style={styles.muted}>
                  {bill.bill_date} · {tr('bill.review.itemCount', { n: bill.items.length })}
                </Txt>
              </View>
              <TouchableOpacity testID="bill-retake" onPress={() => retake('camera')} accessibilityRole="button">
                <Txt variant="caption" style={styles.link}>{tr('bill.retake')}</Txt>
              </TouchableOpacity>
            </View>
          )}

          <Card padding="none">
            {bill.items.map((item, index) => (
              <TouchableOpacity
                key={item.id}
                testID={`bill-item-${item.position}`}
                onPress={() => setEditingItem(item)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${item.name}`}
                style={[styles.row, styles.rowTight, index > 0 && styles.rowDivider, item.needs_check && styles.rowWarn]}
              >
                <View style={styles.grow}>
                  <Txt variant="title">{item.name}</Txt>
                  <Txt variant="caption" style={item.needs_check ? styles.warnDetail : styles.muted}>
                    {lineDetail(item)}{item.needs_check ? ` · ${tr('bill.review.needsCheck')}` : ''}
                  </Txt>
                </View>
                <Text style={styles.amount}>{formatRupees(item.amount)}</Text>
                <Icon name="edit-2" size={18} color={colors.ink_muted} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity testID="bill-add-item" onPress={() => setEditingItem(null)}
              style={[styles.row, styles.rowTight, styles.rowDivider, styles.rowCentered]} accessibilityRole="button">
              <Txt variant="caption" style={styles.link}>{tr('bill.review.add')}</Txt>
            </TouchableOpacity>
          </Card>

          <TouchableOpacity testID="bill-totals" onPress={() => setChargesOpen(true)} activeOpacity={0.7}
            accessibilityRole="button" accessibilityLabel="Edit charges and total">
            <Card style={styles.totals}>
              {bill.adds_up ? (
                <>
                  <SummaryLine label={tr('bill.review.items')} value={formatRupees(bill.items_total)} />
                  {bill.tax > 0 ? <SummaryLine label={tr('bill.review.tax')} value={formatRupees(bill.tax)} /> : null}
                  {bill.service_charge > 0 ? (
                    <SummaryLine label={tr('bill.review.service')} value={formatRupees(bill.service_charge)} />
                  ) : null}
                  {bill.discount > 0 ? (
                    <SummaryLine label={tr('bill.review.discount')} value={`−${formatRupees(bill.discount)}`} />
                  ) : null}
                  <View style={styles.totalLine}>
                    <Txt variant="h2">{tr('bill.review.total')}</Txt>
                    <Text style={styles.totalAmount} testID="bill-total">{formatRupees(bill.total)}</Text>
                  </View>
                  <View style={styles.okLine} testID="bill-adds-up">
                    <Icon name="check" size={16} color={colors.income} />
                    <Txt variant="caption" style={styles.okText}>{tr('bill.review.addsUp')}</Txt>
                  </View>
                </>
              ) : (
                <>
                  <SummaryLine label={tr('bill.review.itemsAndCharges')}
                    value={formatRupees(bill.total - bill.difference)} />
                  <SummaryLine label={tr('bill.review.totalOnBill')} value={formatRupees(bill.total)} />
                  <View style={styles.totalLine}>
                    <Txt variant="h2">{tr('bill.review.difference')}</Txt>
                    <Text style={[styles.totalAmount, styles.expense]} testID="bill-difference">
                      {formatRupees(Math.abs(bill.difference))}
                    </Text>
                  </View>
                </>
              )}
            </Card>
          </TouchableOpacity>

          {!bill.adds_up ? (
            <View style={styles.mascotNote}>
              <Pappu mood="confused" size={48} autoSleepy={false} />
              <Txt variant="caption" style={[styles.muted, styles.grow]}>{tr('bill.review.noGuess')}</Txt>
            </View>
          ) : null}
          {noticeLine}
        </ScrollView>
        <View style={styles.footer}>
          <Button testID="bill-review-next" title={tr('bill.review.next')} disabled={!bill.adds_up || busy}
            onPress={() => { setNotice(null); setStep('assign'); }} />
        </View>
      </>
    );
  } else if (step === 'assign' && bill) {
    const ambiguous = bill.people.filter((p) => p.status === 'ambiguous');
    const prompt = bill.question?.text || (bill.ready ? null : tr('bill.assign.intro'));
    body = (
      <>
        {header(tr('bill.assign.title'), 2)}
        <ScrollView contentContainerStyle={styles.scroll} testID="bill-assign" keyboardShouldPersistTaps="handled">
          {said ? (
            <View style={styles.saidBubble} testID="bill-said">
              <Txt variant="caption" style={styles.saidText}>{said}</Txt>
            </View>
          ) : null}

          <Card padding="none">
            {bill.items.map((item, index) => {
              const empty = item.assigned_to.length === 0;
              return (
                <TouchableOpacity
                  key={item.id}
                  testID={`bill-assign-item-${item.position}`}
                  onPress={() => setPickingItem(item)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Choose who had ${item.name}`}
                  style={[styles.row, index > 0 && styles.rowDivider, empty && styles.rowWarn]}
                >
                  <View style={styles.grow}>
                    <Txt variant="title">{item.name}</Txt>
                    {empty ? (
                      <Txt variant="caption" style={styles.warnDetail}>{tr('bill.assign.nobody')}</Txt>
                    ) : (
                      <View style={styles.who}>
                        {item.assigned_to.map((name) => (
                          <View key={name} style={[styles.whoChip, name === 'me' && styles.whoChipYou]}>
                            <Txt variant="chip">{name === 'me' ? tr('bill.assign.you') : name}</Txt>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                  <Text style={styles.amount}>{formatRupees(item.amount)}</Text>
                </TouchableOpacity>
              );
            })}
          </Card>

          {ambiguous.map((person) => (
            <Card key={person.name} style={styles.personCard} testID={`bill-ambiguous-${person.name}`}>
              <Txt variant="title">
                {tr('bill.assign.samePerson', { spoken: person.name, existing: person.candidate_name })}
              </Txt>
              <View style={styles.pair}>
                <Button testID={`bill-same-yes-${person.name}`} title={tr('bill.assign.sameYes')} size="sm"
                  onPress={() => answerPerson(person.name, true)} style={styles.grow} />
                <Button testID={`bill-same-no-${person.name}`} title={tr('bill.assign.sameNo')} size="sm"
                  variant="secondary" onPress={() => answerPerson(person.name, false)} style={styles.grow} />
              </View>
            </Card>
          ))}

          {prompt ? (
            <View style={styles.promptRow}>
              <Pappu state={busy ? 'thinking' : 'listening'} size={52} autoSleepy={false} />
              <View style={styles.promptBubble}>
                <Txt variant="title" testID="bill-question">{prompt}</Txt>
              </View>
            </View>
          ) : null}
          {noticeLine}
        </ScrollView>

        <View style={styles.footer}>
          {bill.ready ? (
            <Button testID="bill-assign-next" title={tr('bill.assign.next')} disabled={busy}
              onPress={() => { setNotice(null); setStep('preview'); }} />
          ) : null}
          <View style={styles.composer}>
            <TextInput
              testID="bill-assign-input"
              value={draftText}
              onChangeText={setDraftText}
              placeholder={tr('bill.assign.placeholder')}
              placeholderTextColor={colors.ink_muted}
              onSubmitEditing={() => sendAssignment(draftText)}
              returnKeyType="send"
              editable={!busy}
              style={styles.composerInput}
            />
            {draftText.trim() ? (
              <TouchableOpacity testID="bill-assign-send" onPress={() => sendAssignment(draftText)} disabled={busy}
                style={[styles.roundButton, styles.sendButton]} accessibilityRole="button"
                accessibilityLabel={tr('bill.assign.send')}>
                <Icon name="arrow-up" size={20} />
              </TouchableOpacity>
            ) : (
              <MicButton token={token} isCoinStyle size={56} disabled={busy}
                languageCode={lang === 'ml' ? 'ml-IN' : null}
                onTranscribed={(text) => sendAssignment(text, 'voice')} />
            )}
          </View>
        </View>
      </>
    );
  } else if (step === 'preview' && bill) {
    body = (
      <>
        {header(tr('bill.preview.title'), 3)}
        <ScrollView contentContainerStyle={styles.scroll} testID="bill-preview">
          <Card style={styles.heroCard}>
            <View style={styles.grow}>
              <Txt variant="caption" style={styles.muted}>
                {tr('bill.preview.youPaid', { merchant: bill.merchant || tr('bill.start.title') })}
              </Txt>
              <Text style={styles.heroAmount} testID="bill-preview-total">{formatRupees(bill.total)}</Text>
            </View>
            <Pappu mood="happy" size={60} autoSleepy={false} />
          </Card>

          <Card padding="none">
            {(bill.shares || []).map((share, index) => (
              <View key={share.name} testID={`bill-share-${share.name}`} style={[styles.row, index > 0 && styles.rowDivider]}>
                <View style={[styles.avatar, share.is_self && styles.avatarYou]}>
                  <Text style={styles.avatarText}>{share.name.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={styles.grow}>
                  <View style={styles.nameRow}>
                    <Txt variant="title">{share.is_self ? tr('bill.assign.you') : share.name}</Txt>
                    {share.is_self ? <View style={[styles.tag, styles.tagFood]}><Txt variant="chip">Food</Txt></View> : null}
                    {share.is_new ? (
                      <View style={[styles.tag, styles.tagNew]}><Txt variant="chip">{tr('bill.preview.new')}</Txt></View>
                    ) : null}
                  </View>
                  <Txt variant="caption" style={styles.muted}>{share.items.join(', ')}</Txt>
                </View>
                <Text style={[styles.amount, share.is_self ? styles.expense : styles.income]}>
                  {share.is_self ? '−' : '+'}{formatRupees(share.amount)}
                </Text>
              </View>
            ))}
          </Card>

          <Card style={styles.totals}>
            <SummaryLine label={tr('bill.preview.yourShare')} value={formatRupees(bill.your_share)} strong />
            <SummaryLine label={tr('bill.preview.friendsOwe')} value={formatRupees(bill.friends_total)} strong
              valueStyle={styles.income} />
          </Card>
          <Txt variant="caption" style={styles.muted}>{tr('bill.preview.note', { total: plainAmount(bill.total) })}</Txt>
          {noticeLine}
        </ScrollView>
        <View style={[styles.footer, styles.footerRow]}>
          <Button testID="bill-preview-change" title={tr('bill.preview.change')} variant="secondary"
            onPress={() => setStep('assign')} style={styles.grow} />
          <Button testID="bill-preview-save" title={tr('bill.preview.save')} loading={busy} onPress={saveSplit}
            style={styles.grow} />
        </View>
      </>
    );
  } else if (step === 'saved' && bill) {
    const friends = (bill.shares || []).filter((s) => !s.is_self);
    const alertText = !budgetAlert ? null
      : budgetAlert.alert === 'over'
        ? tr('overlay.budgetOver', {
          cat: budgetAlert.category, spent: formatRupees(budgetAlert.spent), budget: formatRupees(budgetAlert.budget),
        })
        : tr('overlay.budgetNear', { cat: budgetAlert.category, pct: budgetAlert.percent });
    body = (
      <>
        {header(tr('bill.saved.title'), null, { close: true })}
        <ScrollView contentContainerStyle={styles.scroll} testID="bill-saved">
          <View style={styles.savedHero}>
            <Pappu mood={budgetAlert?.alert === 'over' ? 'concerned' : 'excited'} size={92} autoSleepy={false} />
            <Txt variant="caption" style={[styles.muted, styles.savedLabel]}>{tr('bill.preview.friendsOwe')}</Txt>
            <Text style={[styles.heroAmount, styles.income]} testID="bill-saved-total">
              +{formatRupees(bill.friends_total)}
            </Text>
            {bill.your_share > 0 ? (
              <Txt variant="caption" style={styles.muted}>
                {tr('bill.saved.yourShare', { amount: plainAmount(bill.your_share) })}
              </Txt>
            ) : null}
            {alertText ? <Txt variant="caption" testID="bill-budget-alert" style={styles.warnDetail}>{alertText}</Txt> : null}
          </View>

          <Card padding="none">
            {friends.map((share, index) => (
              <View key={share.id} testID={`bill-saved-share-${share.name}`} style={[styles.row, index > 0 && styles.rowDivider]}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{share.name.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={styles.grow}>
                  <Txt variant="title">{share.name}</Txt>
                  <Txt variant="caption" style={share.paid ? styles.okText : styles.muted}>
                    {formatRupees(share.amount)}{share.paid ? ` · ${tr('bill.saved.paid')}` : ''}
                  </Txt>
                </View>
                {share.paid ? (
                  <Icon name="check" size={20} color={colors.income} />
                ) : (
                  <Button testID={`bill-ask-${share.name}`} title={tr('bill.saved.ask')} size="sm"
                    onPress={() => openAsk(share)} style={styles.askButton} />
                )}
              </View>
            ))}
          </Card>

          <TouchableOpacity testID="bill-undo" onPress={undoSplit} disabled={busy} style={styles.rowCentered}
            accessibilityRole="button">
            <Txt variant="caption" style={styles.link}>{tr('bill.saved.undo')}</Txt>
          </TouchableOpacity>
          {noticeLine}
        </ScrollView>
        <View style={styles.footer}>
          <Button testID="bill-done" title={tr('bill.saved.done')} variant="secondary" onPress={onClose} />
        </View>
      </>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right', 'bottom']} testID="bill-split-flow">
      {body}
      <ItemEditSheet visible={editingItem !== undefined} item={editingItem || null} language={lang}
        onClose={() => setEditingItem(undefined)} onSave={saveItem}
        onRemove={bill && bill.items.length > 1 ? removeItem : null} />
      <ChargesSheet visible={chargesOpen} bill={bill} language={lang} onClose={() => setChargesOpen(false)}
        onSave={saveCharges} />
      <PeoplePickerSheet visible={!!pickingItem} item={pickingItem} language={lang}
        people={(bill?.people || []).map((p) => p.name)} onClose={() => setPickingItem(null)} onSave={savePeople} />
      <AskToPaySheet visible={!!askShare} share={askShare} request={payRequest} merchant={bill?.merchant}
        needsUpiId={needsUpiId} loading={busy} language={lang} onSaveUpiId={saveUpiId} onMarkPaid={markPaid}
        onClose={() => setAskShare(null)} onShowToast={onShowToast} />
    </SafeAreaView>
  );
}

/** Text that switches to the Malayalam font and taller line height when it needs to. */
function Txt({ variant = 'body', style, children, ...props }) {
  const text = Array.isArray(children) ? children.join('') : children;
  const malayalam = isMalayalamText(text);
  const base = {
    h1: malayalam ? typography.malayalam_h1 : typography.headline_h1,
    h2: malayalam ? typography.malayalam_h2 : typography.headline_h2,
    title: malayalam ? typography.malayalam_body : { ...typography.body_main, fontFamily: 'Nunito_700Bold', fontWeight: '700' },
    body: malayalam ? typography.malayalam_body : typography.body_main,
    caption: malayalam ? typography.malayalam_caption : typography.caption_bold,
    chip: malayalam ? { ...typography.malayalam_caption, fontSize: 12 } : { ...typography.caption_bold, fontSize: 12, lineHeight: 16 },
  }[variant];
  return <Text style={[{ color: colors.ink }, base, style]} {...props}>{children}</Text>;
}

function SummaryLine({ label, value, strong = false, valueStyle }) {
  return (
    <View style={styles.summaryLine}>
      <Txt variant="caption" style={styles.muted}>{label}</Txt>
      <Text style={[styles.summaryValue, strong && styles.summaryStrong, valueStyle]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Button draws its face absolutely, so a button inside a row needs a width of its own.
  askButton: { width: 132 },
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    height: 56, paddingHorizontal: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
  },
  headerTitle: { flex: 1 },
  roundButton: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 2,
    borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  sendButton: { backgroundColor: colors.gold, borderColor: colors.ink, borderWidth: 1, borderBottomWidth: 3, borderBottomColor: colors.gold_edge, width: 52, height: 52, borderRadius: 26 },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.md },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing['2xl'], gap: spacing.md },
  footerRow: { flexDirection: 'row' },
  centered: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing['3xl'], gap: spacing.sm },
  readingTitle: { marginTop: spacing.md },
  readingBody: { textAlign: 'center', maxWidth: 250 },
  failedText: { textAlign: 'center', marginTop: spacing.md },
  skeletonCard: { alignSelf: 'stretch', marginTop: spacing.lg },
  skeletonGrow: { flexGrow: 0 },
  muted: { color: colors.ink_muted },
  link: { color: colors.teal },
  income: { color: colors.income },
  expense: { color: colors.expense },
  grow: { flex: 1, minWidth: 0 },
  pair: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  rowTight: { paddingVertical: spacing.sm },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  rowWarn: { backgroundColor: colors.warningBg },
  rowCentered: { justifyContent: 'center', alignItems: 'center', paddingVertical: spacing.sm },
  amount: { ...typography.body_amount, color: colors.ink, fontVariant: ['tabular-nums'] },
  totals: { gap: 6 },
  summaryLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryValue: { ...typography.caption_bold, color: colors.ink_muted, fontVariant: ['tabular-nums'] },
  summaryStrong: { color: colors.ink },
  totalLine: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: 2,
  },
  totalAmount: { ...typography.headline_h1, fontFamily: typography.display_amount.fontFamily, color: colors.ink, fontVariant: ['tabular-nums'] },
  okLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  okText: { color: colors.income },
  warnBanner: {
    flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', padding: spacing.md, borderRadius: radius.button,
    backgroundColor: colors.warningBg, borderWidth: 2, borderColor: colors.warningBorder,
  },
  warnText: { flex: 1, color: colors.ink },
  warnDetail: { color: colors.warning },
  mascotNote: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  notice: { color: colors.expense },
  saidBubble: {
    alignSelf: 'flex-end', maxWidth: '88%', backgroundColor: colors.gold, borderWidth: 1, borderColor: colors.ink,
    borderRadius: radius.card, borderBottomRightRadius: 4, paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  saidText: { color: colors.ink },
  who: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  whoChip: {
    paddingHorizontal: spacing.sm, height: 22, justifyContent: 'center', borderRadius: radius.pill,
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
  },
  whoChipYou: { backgroundColor: colors.gold, borderColor: colors.gold_edge },
  personCard: { gap: spacing.xs },
  promptRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  promptBubble: {
    flexShrink: 1, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border,
    borderRadius: radius.card, borderBottomLeftRadius: 4, paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  composer: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  composerInput: {
    flex: 1, height: 52, borderRadius: radius.input, borderWidth: 2, borderColor: colors.border,
    backgroundColor: colors.surface, paddingHorizontal: spacing.lg, color: colors.ink, ...typography.body_main,
  },
  heroCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroAmount: { ...typography.display_amount, color: colors.ink, fontVariant: ['tabular-nums'] },
  avatar: {
    width: 40, height: 40, borderRadius: radius.small, backgroundColor: colors.bg, borderWidth: 2,
    borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  avatarYou: { backgroundColor: colors.gold, borderColor: colors.ink, borderWidth: 1 },
  avatarText: { ...typography.body_amount, color: colors.ink },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tag: { paddingHorizontal: spacing.sm, height: 20, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1 },
  tagFood: { backgroundColor: colors.bg, borderColor: colors.categories.food },
  tagNew: { backgroundColor: colors.bg, borderColor: colors.categories.people },
  savedHero: { alignItems: 'center', gap: 4, paddingVertical: spacing.sm },
  savedLabel: { marginTop: spacing.sm },
});
