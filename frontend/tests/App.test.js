import React from 'react';
import { render } from '@testing-library/react-native';
import App from '../App';

describe('App placeholder screen rendering', () => {
  it('renders without throwing error and displays app name', async () => {
    const { getByText } = await render(<App />);
    expect(getByText('Pappu')).toBeTruthy();
    expect(getByText('Bilingual voice-first financial assistant')).toBeTruthy();
  });
});
