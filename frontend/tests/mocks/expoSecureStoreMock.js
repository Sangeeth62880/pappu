const store = new Map();

module.exports = {
  getItemAsync: jest.fn(async (key) => store.get(key) ?? null),
  setItemAsync: jest.fn(async (key, value) => {
    store.set(key, String(value));
  }),
  deleteItemAsync: jest.fn(async (key) => {
    store.delete(key);
  }),
  isAvailableAsync: jest.fn(async () => true),
  __store: store,
  __reset: () => store.clear(),
};
