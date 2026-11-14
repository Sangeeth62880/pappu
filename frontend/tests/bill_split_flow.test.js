global.IS_REACT_ACT_ENVIRONMENT = true;
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react-native';
import { Share } from 'react-native';
import BillSplitFlow from '../src/components/billSplit/BillSplitFlow';
import BillStartSheet from '../src/components/billSplit/BillStartSheet';
import AppHeader from '../src/components/ui/AppHeader';
import * as client from '../src/api/client';
import { formatRupees, lineDetail, billLanguage } from '../src/components/billSplit/format';

jest.mock('../src/api/client');
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }));
jest.mock('react-native-qrcode-svg', () => {
  const { Text } = require('react-native');
  return ({ value }) => <Text testID="qr-value">{value}</Text>;
});
jest.mock('../src/components/MicButton', () => {
  const { TouchableOpacity, Text } = require('react-native');
  return ({ onTranscribed }) => (
    <TouchableOpacity testID="bill-mic" onPress={() => onTranscribed('njanum Rahulum Anuvum')}>
      <Text>mic</Text>
    </TouchableOpacity>
  );
});
jest.mock('../src/utils/billPicker', () => ({ pickBillImage: jest.fn() }));

const IMAGE = { uri: 'file:///bill.jpg', name: 'bill.jpg', type: 'image/jpeg', file: null };
const NAMES = ['Chicken Biriyani', 'Beef Fry', 'Porotta', 'Fish Curry Meals', 'Lime Soda', 'Falooda'];
const AMOUNTS = [560, 320, 120, 280, 180, 160];
const QTY = [2, 1, 6, 1, 3, 1];
const ALL = ['me', 'Rahul', 'Anu', 'Pooja'];
const ASSIGNED = [['me', 'Rahul'], ALL, ALL, ['Anu'], ['me', 'Rahul', 'Anu'], ['Pooja']];

function makeBill(overrides = {}) {
  const assigned = overrides.assigned || NAMES.map(() => []);
  const items = NAMES.map((name, i) => ({
    id: `item-${i + 1}`, position: i + 1, name, quantity: QTY[i], amount: AMOUNTS[i], needs_check: false,
    assigned_to: assigned[i],
  }));
  const unassigned = items.filter((i) => i.assigned_to.length === 0).map((i) => i.position);
  return {
    id: 'bill-1', status: 'draft', merchant: 'Paragon Restaurant', bill_date: '2026-11-14',
    tax: 81, service_charge: 81, discount: 0, total: 1782, items, items_total: 1620, difference: 0,
    adds_up: true, people: [], unassigned, ambiguous_people: [], question: null, ready: false, shares: null,
    your_share: 0, friends_total: 0, language_code: 'en-IN',
    ...overrides,
  };
}

const PEOPLE = ['Rahul', 'Anu', 'Pooja'].map((name) => ({ name, contact_id: null, status: 'new', candidate_name: null }));
const SHARES = [
  { id: null, name: 'You', is_self: true, contact_id: null, is_new: false, amount: 495, paid: false,
    items: ['Chicken Biriyani', 'Beef Fry', 'Porotta', 'Lime Soda'] },
  { id: null, name: 'Rahul', is_self: false, contact_id: null, is_new: true, amount: 495, paid: false,
    items: ['Chicken Biriyani', 'Beef Fry', 'Porotta', 'Lime Soda'] },
  { id: null, name: 'Anu', is_self: false, contact_id: null, is_new: true, amount: 495, paid: false,
    items: ['Fish Curry Meals', 'Beef Fry', 'Porotta', 'Lime Soda'] },
  { id: null, name: 'Pooja', is_self: false, contact_id: null, is_new: true, amount: 297, paid: false,
    items: ['Falooda', 'Beef Fry', 'Porotta'] },
];

const draft = () => makeBill();
const partly = () => makeBill({
  assigned: ASSIGNED.map((a, i) => (i === 4 ? [] : a)), people: PEOPLE,
  question: { item: 5, item_id: 'item-5', text: 'Who had the Lime Soda?' }, understood: true,
});
const ready = () => makeBill({
  assigned: ASSIGNED, people: PEOPLE, ready: true, shares: SHARES, your_share: 495, friends_total: 1287,
  understood: true,
});
const saved = (extra = {}) => makeBill({
  assigned: ASSIGNED, people: PEOPLE, status: 'confirmed',
  shares: SHARES.map((s, i) => ({ ...s, id: `share-${i}`, is_new: false })), your_share: 495, friends_total: 1287,
  ...extra,
});

const onClose = jest.fn();
const onMutated = jest.fn();
const onShowToast = jest.fn();

async function renderFlow(props = {}) {
  return await render(
    <BillSplitFlow token="jwt" image={IMAGE} onClose={onClose} onMutated={onMutated} onShowToast={onShowToast}
      {...props} />,
  );
}

async function toReview(bill = draft()) {
  client.uploadBill.mockResolvedValueOnce(bill);
  await renderFlow();
  await waitFor(() => expect(screen.getByTestId('bill-review')).toBeTruthy());
}
async function toAssign(bill = draft()) {
  await toReview(bill);
  await fireEvent.press(screen.getByTestId('bill-review-next'));
  await waitFor(() => expect(screen.getByTestId('bill-assign')).toBeTruthy());
}
async function say(text, result) {
  client.assignBill.mockResolvedValueOnce(result);
  await fireEvent.changeText(screen.getByTestId('bill-assign-input'), text);
  await fireEvent.press(screen.getByTestId('bill-assign-send'));
  await waitFor(() => expect(client.assignBill).toHaveBeenCalled());
}
async function toPreview() {
  await toAssign();
  await say('everything', ready());
  await waitFor(() => expect(screen.getByTestId('bill-assign-next')).toBeTruthy());
  await fireEvent.press(screen.getByTestId('bill-assign-next'));
  await waitFor(() => expect(screen.getByTestId('bill-preview')).toBeTruthy());
}
async function toSaved(result = saved()) {
  await toPreview();
  client.confirmBill.mockResolvedValueOnce(result);
  await fireEvent.press(screen.getByTestId('bill-preview-save'));
  await waitFor(() => expect(screen.getByTestId('bill-saved')).toBeTruthy());
}

beforeEach(() => {
  jest.clearAllMocks();
  client.cancelBill.mockResolvedValue(null);
});
afterEach(cleanup);

describe('reading the bill', () => {
  test('shows the reading state while the photo is uploaded, then the review', async () => {
    let resolveUpload;
    client.uploadBill.mockReturnValueOnce(new Promise((resolve) => { resolveUpload = resolve; }));
    await renderFlow();
    expect(screen.getByTestId('bill-reading')).toBeTruthy();
    expect(screen.getByText('Reading your bill')).toBeTruthy();
    expect(client.uploadBill).toHaveBeenCalledWith('jwt', IMAGE);

    await act(async () => resolveUpload(draft()));
    expect(screen.getByTestId('bill-review')).toBeTruthy();
    expect(screen.getByText('1 of 3')).toBeTruthy();
  });

  test.each([
    ['unreadable', 'I could not read that bill. Try another photo.'],
    ['ocr_unavailable', 'Bill reading is not available right now. Try again in a bit.'],
    [undefined, 'Something went wrong. Try again.'],
  ])('a %s failure explains itself and offers another photo', async (code, message) => {
    client.uploadBill.mockRejectedValueOnce(Object.assign(new Error('x'), { code }));
    await renderFlow();
    await waitFor(() => expect(screen.getByTestId('bill-failed')).toBeTruthy());
    expect(screen.getByTestId('bill-failed-text').props.children).toBe(message);
    expect(screen.getByTestId('bill-retake-camera')).toBeTruthy();
    expect(screen.getByTestId('bill-retake-gallery')).toBeTruthy();
  });

  test('retaking reads the new photo', async () => {
    const pickImage = jest.fn().mockResolvedValue({ ...IMAGE, uri: 'file:///second.jpg' });
    client.uploadBill.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'unreadable' }));
    client.uploadBill.mockResolvedValueOnce(draft());
    await renderFlow({ pickImage });
    await waitFor(() => expect(screen.getByTestId('bill-failed')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('bill-retake-gallery'));
    await waitFor(() => expect(screen.getByTestId('bill-review')).toBeTruthy());
    expect(pickImage).toHaveBeenCalledWith('gallery');
    expect(client.uploadBill.mock.calls[1][1].uri).toBe('file:///second.jpg');
  });

  test('cancelling while reading closes the flow', async () => {
    client.uploadBill.mockReturnValueOnce(new Promise(() => {}));
    await renderFlow();
    await fireEvent.press(screen.getByTestId('bill-cancel'));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('check the bill', () => {
  test('lists every line, the charges and the total when the bill adds up', async () => {
    await toReview();
    expect(screen.getByText('Paragon Restaurant')).toBeTruthy();
    expect(screen.getByText('2026-11-14 · 6 items')).toBeTruthy();
    NAMES.forEach((name) => expect(screen.getByText(name)).toBeTruthy());
    expect(screen.getByText('2 × ₹280')).toBeTruthy();
    expect(screen.getByTestId('bill-total').props.children).toBe('₹1,782');
    expect(screen.getByTestId('bill-adds-up')).toBeTruthy();
    expect(screen.queryByTestId('bill-mismatch-banner')).toBeNull();
    expect(screen.getByTestId('bill-review-next').props.accessibilityState?.disabled).not.toBe(true);
  });

  test('a bill that does not add up is blocked and says by how much', async () => {
    const bill = draft();
    bill.items[4] = { ...bill.items[4], quantity: 2, amount: 120, needs_check: true };
    await toReview({ ...bill, adds_up: false, difference: 60 });

    expect(screen.getByTestId('bill-mismatch-banner')).toBeTruthy();
    expect(screen.getByText(/₹60 less than the bill total/)).toBeTruthy();
    expect(screen.getByTestId('bill-difference').props.children).toBe('₹60');
    expect(screen.getByText('2 × ₹60 · hard to read, please check')).toBeTruthy();
    expect(screen.getByText('I will not guess. The split stays locked until this adds up.')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('bill-review-next'));
    expect(screen.queryByTestId('bill-assign')).toBeNull();
    expect(screen.getByTestId('bill-review')).toBeTruthy();
  });

  test('editing a line sends the whole item list and unblocks the bill', async () => {
    const bill = draft();
    bill.items[4] = { ...bill.items[4], quantity: 2, amount: 120, needs_check: true };
    await toReview({ ...bill, adds_up: false, difference: 60 });
    client.patchBill.mockResolvedValueOnce(draft());

    await fireEvent.press(screen.getByTestId('bill-item-5'));
    await fireEvent.changeText(screen.getByTestId('bill-item-quantity'), '3');
    await fireEvent.changeText(screen.getByTestId('bill-item-amount'), '180');
    await fireEvent.press(screen.getByTestId('bill-item-save'));

    await waitFor(() => expect(client.patchBill).toHaveBeenCalled());
    const [, billId, patch] = client.patchBill.mock.calls[0];
    expect(billId).toBe('bill-1');
    expect(patch.items).toHaveLength(6);
    expect(patch.items[4]).toEqual({ id: 'item-5', name: 'Lime Soda', quantity: 3, amount: 180 });
    await waitFor(() => expect(screen.getByTestId('bill-adds-up')).toBeTruthy());
  });

  test('adding and removing lines', async () => {
    await toReview();
    client.patchBill.mockResolvedValue(draft());

    await fireEvent.press(screen.getByTestId('bill-add-item'));
    await fireEvent.changeText(screen.getByTestId('bill-item-name'), 'Tea');
    await fireEvent.changeText(screen.getByTestId('bill-item-amount'), '20');
    await fireEvent.press(screen.getByTestId('bill-item-save'));
    await waitFor(() => expect(client.patchBill).toHaveBeenCalledTimes(1));
    expect(client.patchBill.mock.calls[0][2].items[6]).toEqual({ name: 'Tea', quantity: 1, amount: 20 });

    await fireEvent.press(screen.getByTestId('bill-item-6'));
    await fireEvent.press(screen.getByTestId('bill-item-remove'));
    await waitFor(() => expect(client.patchBill).toHaveBeenCalledTimes(2));
    expect(client.patchBill.mock.calls[1][2].items.map((i) => i.name)).not.toContain('Falooda');
  });

  test('charges and total can be corrected', async () => {
    await toReview();
    client.patchBill.mockResolvedValueOnce(draft());
    await fireEvent.press(screen.getByTestId('bill-totals'));
    await fireEvent.changeText(screen.getByTestId('bill-charge-discount'), '50');
    await fireEvent.changeText(screen.getByTestId('bill-charge-total'), '1732');
    await fireEvent.press(screen.getByTestId('bill-charges-save'));
    await waitFor(() => expect(client.patchBill).toHaveBeenCalledWith('jwt', 'bill-1',
      { tax: 81, service_charge: 81, discount: 50, total: 1732 }));
  });

  test('backing out of the review cancels the draft', async () => {
    await toReview();
    await fireEvent.press(screen.getByTestId('bill-back'));
    expect(client.cancelBill).toHaveBeenCalledWith('jwt', 'bill-1');
    expect(onClose).toHaveBeenCalled();
  });
});

describe('who had what', () => {
  test('typed text is sent to the planner and the one item left is asked about', async () => {
    await toAssign();
    expect(screen.getByText('2 of 3')).toBeTruthy();
    expect(screen.getByTestId('bill-question').props.children).toBe('Tell me who had what, or tap an item to choose.');

    await say('Biriyani njanum Rahulum', partly());
    expect(client.assignBill).toHaveBeenCalledWith('jwt', 'bill-1', 'Biriyani njanum Rahulum', 'text');
    await waitFor(() => expect(screen.getByTestId('bill-question').props.children).toBe('Who had the Lime Soda?'));
    expect(screen.getByTestId('bill-said')).toBeTruthy();
    expect(screen.getByText('Nobody yet. Tap to choose')).toBeTruthy();
    expect(screen.getAllByText('Rahul').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('bill-assign-next')).toBeNull();
    expect(client.confirmBill).not.toHaveBeenCalled();
  });

  test('a spoken answer goes through the same call marked as voice', async () => {
    await toAssign(partly());
    client.assignBill.mockResolvedValueOnce(ready());
    await fireEvent.press(screen.getByTestId('bill-mic'));
    await waitFor(() => expect(client.assignBill).toHaveBeenCalledWith('jwt', 'bill-1', 'njanum Rahulum Anuvum', 'voice'));
    await waitFor(() => expect(screen.getByTestId('bill-assign-next')).toBeTruthy());
  });

  test('says so when the planner understood nothing', async () => {
    await toAssign(partly());
    await say('hmm', { ...partly(), understood: false });
    await waitFor(() => expect(screen.getByTestId('bill-notice').props.children)
      .toBe('I did not catch who had that. Say it again, or tap the item.'));
  });

  test('a planner error is shown and nothing else changes', async () => {
    await toAssign(partly());
    client.assignBill.mockRejectedValueOnce(Object.assign(new Error('I could not work that out.'), { code: 'planner_failed' }));
    await fireEvent.changeText(screen.getByTestId('bill-assign-input'), 'asdf');
    await fireEvent.press(screen.getByTestId('bill-assign-send'));
    await waitFor(() => expect(screen.getByTestId('bill-notice').props.children).toBe('I could not work that out.'));
    expect(screen.getByText('Nobody yet. Tap to choose')).toBeTruthy();
  });

  test('tapping an item assigns it without the planner', async () => {
    await toAssign(partly());
    client.setBillItemPeople.mockResolvedValueOnce(ready());
    await fireEvent.press(screen.getByTestId('bill-assign-item-5'));
    await fireEvent.press(screen.getByTestId('bill-person-chip-me'));
    await fireEvent.press(screen.getByTestId('bill-person-chip-Anu'));
    await fireEvent.changeText(screen.getByTestId('bill-person-new'), 'Deepak');
    await fireEvent.press(screen.getByTestId('bill-person-add'));
    await fireEvent.press(screen.getByTestId('bill-people-save'));
    await waitFor(() => expect(client.setBillItemPeople).toHaveBeenCalledWith(
      'jwt', 'bill-1', 'item-5', ['me', 'Anu', 'Deepak']));
    expect(client.assignBill).not.toHaveBeenCalled();
  });

  test('a close name match asks which person and sends the answer', async () => {
    const bill = partly();
    bill.people = [{ name: 'Rahool', contact_id: null, status: 'ambiguous', candidate_name: 'Rahul' }, ...PEOPLE.slice(1)];
    bill.ambiguous_people = ['Rahool'];
    await toAssign(bill);
    expect(screen.getByText('Is Rahool the same person as Rahul?')).toBeTruthy();
    client.resolveBillPerson.mockResolvedValueOnce(partly());
    await fireEvent.press(screen.getByTestId('bill-same-yes-Rahool'));
    await waitFor(() => expect(client.resolveBillPerson).toHaveBeenCalledWith('jwt', 'bill-1', 'Rahool', true));
    await waitFor(() => expect(screen.queryByTestId('bill-ambiguous-Rahool')).toBeNull());
  });

  test('Malayalam replies switch the screen strings', async () => {
    await toAssign();
    await say('ബിരിയാണി ഞാനും രാഹുലും', {
      ...partly(), language_code: 'ml-IN',
      question: { item: 5, item_id: 'item-5', text: 'Lime Soda ആരാണ് കഴിച്ചത്?' },
    });
    await waitFor(() => expect(screen.getByTestId('bill-question').props.children).toBe('Lime Soda ആരാണ് കഴിച്ചത്?'));
    expect(screen.getByTestId('bill-title').props.children).toBe('ആര് എന്ത് കഴിച്ചു?');
  });
});

describe('preview and save', () => {
  test('shows each share and saves nothing until Save split', async () => {
    await toPreview();
    expect(screen.getByText('3 of 3')).toBeTruthy();
    expect(screen.getByTestId('bill-preview-total').props.children).toBe('₹1,782');
    ['You', 'Rahul', 'Anu', 'Pooja'].forEach((name) => expect(screen.getByTestId(`bill-share-${name}`)).toBeTruthy());
    expect(screen.getByText('−₹495')).toBeTruthy();
    expect(screen.getByText('+₹297')).toBeTruthy();
    expect(screen.getByText('₹1,287')).toBeTruthy();
    expect(screen.getByText('Falooda, Beef Fry, Porotta')).toBeTruthy();
    expect(screen.getAllByText('New')).toHaveLength(3);
    expect(client.confirmBill).not.toHaveBeenCalled();
    expect(onMutated).not.toHaveBeenCalled();
  });

  test('Change goes back to assigning without saving', async () => {
    await toPreview();
    await fireEvent.press(screen.getByTestId('bill-preview-change'));
    expect(screen.getByTestId('bill-assign')).toBeTruthy();
    expect(client.confirmBill).not.toHaveBeenCalled();
  });

  test('Save split is the one call that confirms, and the saved screen follows', async () => {
    await toSaved();
    expect(client.confirmBill).toHaveBeenCalledTimes(1);
    expect(client.confirmBill).toHaveBeenCalledWith('jwt', 'bill-1');
    expect(onMutated).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('bill-saved-total').props.children.join('')).toBe('+₹1,287');
    expect(screen.getByText('Your ₹495 is in Food.')).toBeTruthy();
    ['Rahul', 'Anu', 'Pooja'].forEach((name) => expect(screen.getByTestId(`bill-ask-${name}`)).toBeTruthy());
  });

  test('a refused save keeps the preview and shows why', async () => {
    await toPreview();
    client.confirmBill.mockRejectedValueOnce(Object.assign(new Error('Some items are not assigned to anyone.'),
      { code: 'unassigned_items' }));
    await fireEvent.press(screen.getByTestId('bill-preview-save'));
    await waitFor(() => expect(screen.getByTestId('bill-notice').props.children)
      .toBe('Some items are not assigned to anyone.'));
    expect(screen.getByTestId('bill-preview')).toBeTruthy();
    expect(onMutated).not.toHaveBeenCalled();
  });

  test('a budget alert from the save is shown on the saved screen', async () => {
    await toSaved(saved({ budget_alert: { alert: 'near', category: 'Food', percent: 99, spent: 495, budget: 500 } }));
    expect(screen.getByTestId('bill-budget-alert').props.children).toBe('99% of your Food budget used');
  });

  test('leaving after saving does not cancel anything', async () => {
    await toSaved();
    await fireEvent.press(screen.getByTestId('bill-done'));
    expect(onClose).toHaveBeenCalled();
    expect(client.cancelBill).not.toHaveBeenCalled();
  });

  test('undo reverts the split and closes', async () => {
    await toSaved();
    client.undoBill.mockResolvedValueOnce({ ...saved(), status: 'undone' });
    await fireEvent.press(screen.getByTestId('bill-undo'));
    await waitFor(() => expect(client.undoBill).toHaveBeenCalledWith('jwt', 'bill-1'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onShowToast).toHaveBeenCalledWith('Split undone.');
    expect(onMutated).toHaveBeenCalledTimes(2);
  });
});

describe('ask to pay', () => {
  const REQUEST = {
    share_id: 'share-1', name: 'Rahul', amount: 495, upi_id: 'me@upi', paid: false,
    upi_link: 'upi://pay?pa=me@upi&pn=Me&am=495.00&cu=INR&tn=Paragon%20Restaurant',
    message: 'Hi Rahul, your share of Paragon Restaurant is ₹495. You can pay me on UPI at me@upi, or scan the QR code.',
  };

  test('shows the UPI QR for that share and shares the message', async () => {
    await toSaved();
    client.fetchPayRequest.mockResolvedValueOnce(REQUEST);
    const shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({});
    await fireEvent.press(screen.getByTestId('bill-ask-Rahul'));
    await waitFor(() => expect(screen.getByTestId('qr-value').props.children).toBe(REQUEST.upi_link));
    expect(client.fetchPayRequest).toHaveBeenCalledWith('jwt', 'bill-1', 'share-1');
    expect(screen.getByText('Ask Rahul to pay')).toBeTruthy();
    expect(screen.getByText('Pays to me@upi · Paragon Restaurant')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('bill-ask-share'));
    await waitFor(() => expect(shareSpy).toHaveBeenCalledWith({ message: REQUEST.message }));

    await fireEvent.press(screen.getByTestId('bill-ask-copy'));
    await waitFor(() => expect(require('expo-clipboard').setStringAsync).toHaveBeenCalledWith(REQUEST.message));
    await waitFor(() => expect(onShowToast).toHaveBeenCalledWith('Copied.'));
    shareSpy.mockRestore();
  });

  test('asks for the UPI ID first when there is none, then shows the request', async () => {
    await toSaved();
    client.fetchPayRequest.mockRejectedValueOnce(Object.assign(new Error('Add your UPI ID'), { code: 'upi_id_missing' }));
    await fireEvent.press(screen.getByTestId('bill-ask-Rahul'));
    await waitFor(() => expect(screen.getByTestId('bill-upi-input')).toBeTruthy());
    expect(screen.queryByTestId('qr-value')).toBeNull();

    client.patchProfile.mockResolvedValueOnce({ upi_id: 'me@upi' });
    client.fetchPayRequest.mockResolvedValueOnce(REQUEST);
    await fireEvent.changeText(screen.getByTestId('bill-upi-input'), ' me@upi ');
    await fireEvent.press(screen.getByTestId('bill-upi-save'));
    await waitFor(() => expect(client.patchProfile).toHaveBeenCalledWith('jwt', { upi_id: 'me@upi' }));
    await waitFor(() => expect(screen.getByTestId('qr-value')).toBeTruthy());
  });

  test('an invalid UPI ID shows the server message and no QR', async () => {
    await toSaved();
    client.fetchPayRequest.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'upi_id_missing' }));
    await fireEvent.press(screen.getByTestId('bill-ask-Rahul'));
    await waitFor(() => expect(screen.getByTestId('bill-upi-input')).toBeTruthy());
    client.patchProfile.mockRejectedValueOnce(new Error('That does not look like a UPI ID. It should look like name@bank.'));
    await fireEvent.changeText(screen.getByTestId('bill-upi-input'), 'nope');
    await fireEvent.press(screen.getByTestId('bill-upi-save'));
    await waitFor(() => expect(screen.getByTestId('bill-upi-error')).toBeTruthy());
    expect(screen.queryByTestId('qr-value')).toBeNull();
  });

  test('mark paid records the repayment and shows the share as paid', async () => {
    await toSaved();
    client.fetchPayRequest.mockResolvedValueOnce(REQUEST);
    await fireEvent.press(screen.getByTestId('bill-ask-Rahul'));
    await waitFor(() => expect(screen.getByTestId('bill-ask-paid')).toBeTruthy());

    const paid = saved();
    paid.shares[1].paid = true;
    client.markBillSharePaid.mockResolvedValueOnce(paid);
    await fireEvent.press(screen.getByTestId('bill-ask-paid'));
    await waitFor(() => expect(client.markBillSharePaid).toHaveBeenCalledWith('jwt', 'bill-1', 'share-1'));
    await waitFor(() => expect(screen.getByText('₹495 · paid')).toBeTruthy());
    expect(screen.queryByTestId('bill-ask-Rahul')).toBeNull();
    expect(onMutated).toHaveBeenCalledTimes(2);
  });
});

describe('start sheet and header', () => {
  test('start sheet offers the camera and the gallery', async () => {
    const onPick = jest.fn();
    await render(<BillStartSheet visible onClose={jest.fn()} onPick={onPick} />);
    expect(screen.getByText('Split a bill')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('bill-start-camera'));
    await fireEvent.press(screen.getByTestId('bill-start-gallery'));
    expect(onPick.mock.calls).toEqual([['camera'], ['gallery']]);
  });

  test('start sheet shows a permission problem and speaks Malayalam', async () => {
    await render(<BillStartSheet visible onClose={jest.fn()} onPick={jest.fn()} language="ml"
      error="ബിൽ വായിക്കാൻ പപ്പുവിന് ക്യാമറ അല്ലെങ്കിൽ ഫോട്ടോ അനുമതി വേണം." />);
    expect(screen.getByText('ബിൽ പങ്കിടാം')).toBeTruthy();
    expect(screen.getByTestId('bill-start-error')).toBeTruthy();
  });

  test('the People header has the split a bill button next to add person', async () => {
    const onSplitBillPress = jest.fn();
    await render(<AppHeader screen="people" onAddPersonPress={jest.fn()} onSplitBillPress={onSplitBillPress} />);
    await fireEvent.press(screen.getByTestId('header-split-bill-button'));
    expect(onSplitBillPress).toHaveBeenCalled();
    expect(screen.getByTestId('header-add-person-button')).toBeTruthy();
  });

  test('other tabs do not get the button', async () => {
    await render(<AppHeader screen="history" onSplitBillPress={jest.fn()} />);
    expect(screen.queryByTestId('header-split-bill-button')).toBeNull();
  });
});

describe('format helpers', () => {
  test('rupees use Indian grouping and show paise only when present', () => {
    expect(formatRupees(1782)).toBe('₹1,782');
    expect(formatRupees(123456)).toBe('₹1,23,456');
    expect(formatRupees(50.5)).toBe('₹50.50');
    expect(formatRupees(0)).toBe('₹0');
  });

  test('line detail and bill language', () => {
    expect(lineDetail({ quantity: 6, amount: 120 })).toBe('6 × ₹20');
    expect(lineDetail({ quantity: 1, amount: 280 })).toBe('1 × ₹280');
    expect(billLanguage({ language_code: 'ml-IN' })).toBe('ml');
    expect(billLanguage({ language_code: 'en-IN' }, 'ml')).toBe('en');
    expect(billLanguage(null, 'ml')).toBe('ml');
  });
});
