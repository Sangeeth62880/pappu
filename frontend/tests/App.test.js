import React from 'react';
import { render } from '@testing-library/react-native';
import App from '../App';
import * as supabaseApi from '../src/api/supabase';

jest.mock('../src/api/supabase');

describe('App root screen rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    supabaseApi.getSession.mockResolvedValue(null);
    supabaseApi.supabase = {
      auth: {
        onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
      },
    };
  });

  it('renders without throwing error and displays app name and auth screen', async () => {
    const { findByText } = await render(<App />);
    expect(await findByText('Pappu')).toBeTruthy();
    expect(await findByText('Bilingual Voice-First Financial Assistant')).toBeTruthy();
    expect(await findByText('Sign In to Pappu')).toBeTruthy();
  });
});
