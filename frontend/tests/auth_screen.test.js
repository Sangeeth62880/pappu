global.IS_REACT_ACT_ENVIRONMENT = true;
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import AuthScreen from '../src/screens/AuthScreen';
import * as supabaseApi from '../src/api/supabase';

jest.mock('../src/api/supabase');

describe('AuthScreen Component (Stitch Redesign)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders email, password inputs, wordmark, tagline, and sign-in button by default', async () => {
    const onAuth = jest.fn();
    const { getByTestId, getByText } = await render(
      <AuthScreen onAuthenticated={onAuth} />
    );

    expect(getByTestId('auth-app-title')).toBeTruthy();
    expect(getByText('Pappu')).toBeTruthy();
    expect(getByText('Just say it. Pappu keeps track.')).toBeTruthy();
    expect(getByTestId('auth-email-input')).toBeTruthy();
    expect(getByTestId('auth-password-input')).toBeTruthy();
    expect(getByTestId('auth-submit-button')).toBeTruthy();
    expect(getByText('Sign in')).toBeTruthy();
    expect(getByText('New here? ')).toBeTruthy();
    expect(getByText('Create account')).toBeTruthy();
  });

  test('validates empty inputs before submitting', async () => {
    const onAuth = jest.fn();
    const { getByTestId, getByText } = await render(
      <AuthScreen onAuthenticated={onAuth} />
    );

    const submitBtn = getByTestId('auth-submit-button');
    await fireEvent.press(submitBtn);

    await waitFor(() => {
      expect(getByText('Please enter both email and password.')).toBeTruthy();
    });
    expect(supabaseApi.signIn).not.toHaveBeenCalled();
  });

  test('signs in successfully with valid credentials', async () => {
    const onAuth = jest.fn();
    const mockSession = { access_token: 'valid-jwt', user: { email: 'test@pappu.dev' } };
    supabaseApi.signIn.mockResolvedValueOnce({ session: mockSession });

    const { getByTestId } = await render(
      <AuthScreen onAuthenticated={onAuth} />
    );

    const emailInput = getByTestId('auth-email-input');
    const passwordInput = getByTestId('auth-password-input');
    const submitBtn = getByTestId('auth-submit-button');

    await fireEvent.changeText(emailInput, 'test@pappu.dev');
    await fireEvent.changeText(passwordInput, 'secretpassword123');
    await fireEvent.press(submitBtn);

    await waitFor(() => {
      expect(supabaseApi.signIn).toHaveBeenCalledWith({
        email: 'test@pappu.dev',
        password: 'secretpassword123',
      });
      expect(onAuth).toHaveBeenCalledWith(mockSession);
    });
  });

  test('displays error and triggers wrong password state on auth failure', async () => {
    const onAuth = jest.fn();
    supabaseApi.signIn.mockRejectedValueOnce(new Error('Invalid login credentials'));

    const { getByTestId } = await render(
      <AuthScreen onAuthenticated={onAuth} />
    );

    const emailInput = getByTestId('auth-email-input');
    const passwordInput = getByTestId('auth-password-input');
    const submitBtn = getByTestId('auth-submit-button');

    await fireEvent.changeText(emailInput, 'wrong@pappu.dev');
    await fireEvent.changeText(passwordInput, 'wrongpassword');
    await fireEvent.press(submitBtn);

    await waitFor(() => {
      const errorBanner = getByTestId('auth-error');
      expect(errorBanner).toHaveTextContent('Invalid login credentials');
    });
    expect(onAuth).not.toHaveBeenCalled();
  });

  test('toggles to sign-up mode, shows name input, and signs up successfully', async () => {
    const onAuth = jest.fn();
    const mockSession = { access_token: 'new-user-jwt', user: { email: 'new@pappu.dev' } };
    supabaseApi.signUp.mockResolvedValueOnce({ session: mockSession });

    const { getByTestId, getByText } = await render(
      <AuthScreen onAuthenticated={onAuth} />
    );

    const toggleBtn = getByTestId('auth-toggle-mode');
    await fireEvent.press(toggleBtn);

    await waitFor(() => {
      expect(getByText('Create account')).toBeTruthy();
      expect(getByTestId('auth-name-input')).toBeTruthy();
      expect(getByText('Already have an account? ')).toBeTruthy();
    });

    const nameInput = getByTestId('auth-name-input');
    const emailInput = getByTestId('auth-email-input');
    const passwordInput = getByTestId('auth-password-input');
    const submitBtn = getByTestId('auth-submit-button');

    await fireEvent.changeText(nameInput, 'Sangeeth');
    await fireEvent.changeText(emailInput, 'new@pappu.dev');
    await fireEvent.changeText(passwordInput, 'validpass123');
    await fireEvent.press(submitBtn);

    await waitFor(() => {
      expect(supabaseApi.signUp).toHaveBeenCalledWith({
        email: 'new@pappu.dev',
        password: 'validpass123',
        name: 'Sangeeth',
        preferred_language: 'en',
      });
      expect(onAuth).toHaveBeenCalledWith(mockSession);
      expect(getByText('Create account')).toBeTruthy();
    });
  });

  test('visible back button reverts create account to sign in', async () => {
    const onAuth = jest.fn();
    const { getByTestId, getByText, queryByTestId } = await render(
      <AuthScreen onAuthenticated={onAuth} />
    );

    // Switch to Create account
    const toggleBtn = getByTestId('auth-toggle-mode');
    await fireEvent.press(toggleBtn);
    await waitFor(() => {
      expect(getByTestId('auth-name-input')).toBeTruthy();
    });

    // Visible back button to return to Sign in
    const backBtn = getByTestId('auth-back-button');
    await fireEvent.press(backBtn);

    await waitFor(() => {
      expect(getByText('Sign in')).toBeTruthy();
      expect(queryByTestId('auth-name-input')).toBeNull();
    });
  });

  test('calls onBack prop when back button pressed in sign-in mode', async () => {
    const onAuth = jest.fn();
    const onBack = jest.fn();
    const { getByTestId } = await render(
      <AuthScreen onAuthenticated={onAuth} onBack={onBack} />
    );

    const backBtn = getByTestId('auth-back-button');
    await fireEvent.press(backBtn);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
