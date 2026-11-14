/**
 * Bill split: API client calls and error shape.
 */
import * as realClient from '../src/api/client';

describe('bill API client', () => {
  const originalFetch = global.fetch;
  const ok = (body) => ({ ok: true, status: 200, json: jest.fn().mockResolvedValue(body) });
  const fail = (status, body) => ({ ok: false, status, json: jest.fn().mockResolvedValue(body) });

  afterEach(() => { global.fetch = originalFetch; });

  test.each([
    ['fetchBill', ['b1'], 'GET', /\/bills\/b1$/, undefined],
    ['patchBill', ['b1', { total: 5 }], 'PATCH', /\/bills\/b1$/, { total: 5 }],
    ['assignBill', ['b1', 'mine', 'voice'], 'POST', /\/bills\/b1\/assign$/, { text: 'mine', input: 'voice' }],
    ['setBillItemPeople', ['b1', 'i1', ['me']], 'PUT', /\/bills\/b1\/items\/i1\/people$/, { people: ['me'] }],
    ['resolveBillPerson', ['b1', 'Rahool', true], 'POST', /\/bills\/b1\/people\/resolve$/,
      { name: 'Rahool', use_existing: true }],
    ['confirmBill', ['b1'], 'POST', /\/bills\/b1\/confirm$/, undefined],
    ['undoBill', ['b1'], 'POST', /\/bills\/b1\/undo$/, undefined],
    ['cancelBill', ['b1'], 'DELETE', /\/bills\/b1$/, undefined],
    ['fetchPayRequest', ['b1', 's1'], 'GET', /\/bills\/b1\/shares\/s1\/request$/, undefined],
    ['markBillSharePaid', ['b1', 's1'], 'POST', /\/bills\/b1\/shares\/s1\/paid$/, undefined],
    ['createManualBill', [{ total: 10, items: [] }], 'POST', /\/bills\/manual$/, { total: 10, items: [] }],
  ])('%s calls the right route', async (fn, args, method, url, body) => {
    global.fetch = jest.fn().mockResolvedValue(ok({ id: 'b1' }));
    await realClient[fn]('jwt', ...args);
    const [calledUrl, config] = global.fetch.mock.calls[0];
    expect(calledUrl).toMatch(url);
    expect(config.method).toBe(method);
    expect(config.headers.Authorization).toBe('Bearer jwt');
    expect(config.body ? JSON.parse(config.body) : undefined).toEqual(body);
  });

  test('assignBill defaults to typed input', async () => {
    global.fetch = jest.fn().mockResolvedValue(ok({}));
    await realClient.assignBill('jwt', 'b1', 'mine');
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).input).toBe('text');
  });

  test('uploadBill posts the photo as multipart with the token', async () => {
    global.fetch = jest.fn().mockResolvedValue(ok({ id: 'b1', status: 'draft' }));
    const result = await realClient.uploadBill('jwt', { uri: 'file:///bill.jpg', name: 'bill.jpg', type: 'image/jpeg' });
    const [url, config] = global.fetch.mock.calls[0];
    expect(url).toMatch(/\/bills$/);
    expect(config.method).toBe('POST');
    expect(config.headers.Authorization).toBe('Bearer jwt');
    expect(config.headers['Content-Type']).toBeUndefined(); // the boundary is set by the runtime
    expect(config.body).toBeInstanceOf(FormData);
    expect(result.status).toBe('draft');
  });

  test('a bills error carries its code and message', async () => {
    global.fetch = jest.fn().mockResolvedValue(fail(409, {
      detail: { message: 'The items and charges do not add up to the total.', code: 'does_not_add_up', detail: 60 },
    }));
    await expect(realClient.confirmBill('jwt', 'b1')).rejects.toMatchObject({
      message: 'The items and charges do not add up to the total.', code: 'does_not_add_up', detail: 60, status: 409,
    });
  });

  test('an upload error carries its code too', async () => {
    global.fetch = jest.fn().mockResolvedValue(fail(422, {
      detail: { message: 'That image could not be read.', code: 'unreadable', detail: null },
    }));
    await expect(realClient.uploadBill('jwt', { uri: 'file:///x.jpg' })).rejects.toMatchObject({
      code: 'unreadable', status: 422,
    });
  });

  test('plain string errors from older routes still work', () => {
    const error = realClient.buildApiError({ detail: 'Budget not found' }, 404, 'fallback');
    expect(error.message).toBe('Budget not found');
    expect(error.code).toBeUndefined();
    expect(realClient.buildApiError(null, 500, 'fallback').message).toBe('fallback');
    expect(realClient.buildApiError({ detail: [{ msg: 'field required' }] }, 422, 'fallback').message).toBe('fallback');
  });

  test('patchProfile sends the UPI ID only when given, and an empty string clears it', async () => {
    global.fetch = jest.fn().mockResolvedValue(ok({}));
    await realClient.patchProfile('jwt', { language: 'ml' });
    await realClient.patchProfile('jwt', { upi_id: '' });
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ language: 'ml' });
    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({ upi_id: '' });
  });
});
