import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import AuthScreen from '../src/screens/AuthScreen';
import * as supabaseApi from '../src/api/supabase';

jest.mock('../src/api/supabase');

describe('AuthScreen Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders email and password inputs and sign-in button by default', async () => {
    const onAuth = jest.fn();
    const { findByTestId, findByText } = await render(
      <AuthScreen onAuthenticated={onAuth} />
    );

    expect(await findByTestId('auth-email-input')).toBeTruthy();
    expect(await findByTestId('auth-password-input')).toBeTruthy();
    expect(await findByTestId('auth-submit-button')).toBeTruthy();
    expect(await findByText('Sign In to Pappu')).toBeTruthy();
  });

  test('validates empty inputs before submitting', async () => {
    const onAuth = jest.fn();
    const { findByTestId, findByText } = await render(
      <AuthScreen onAuthenticated={onAuth} />
    );

    const submitBtn = await findByTestId('auth-submit-button');
    fireEvent.press(submitBtn);

    expect(await findByText('Please enter both email and password.')).toBeTruthy();
    expect(supabaseApi.signIn).not.toHaveBeenCalled();
  });

  test('toggles to sign-up mode and shows full name input', async () => {
    const onAuth = jest.fn();
    const { findByTestId, findByText } = await render(
      <AuthScreen onAuthenticated={onAuth} />
    );

    const toggleBtn = await findByTestId('auth-toggle-mode');
    fireEvent.press(toggleBtn);

    expect(await findByText('Create an Account')).toBeTruthy();
    expect(await findByTestId('auth-name-input')).toBeTruthy();

    // Press back button to revert to sign-in mode
    const backBtn = await findByTestId('auth-back-button');
    fireEvent.press(backBtn);
    expect(await findByText('Sign In to Pappu')).toBeTruthy();
  });

  test('calls onBack prop when back button pressed in sign-in mode', async () => {
    const onAuth = jest.fn();
    const onBack = jest.fn();
    const { findByTestId } = await render(
      <AuthScreen onAuthenticated={onAuth} onBack={onBack} />
    );

    const backBtn = await findByTestId('auth-back-button');
    fireEvent.press(backBtn);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
