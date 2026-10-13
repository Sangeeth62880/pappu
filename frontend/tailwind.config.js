/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        canvas: '#F8FAFC',
        surface: {
          DEFAULT: '#FFFFFF',
          subtle: '#F1F5F9',
        },
        border: {
          DEFAULT: '#E2E8F0',
          subtle: '#F1F5F9',
        },
        text: {
          primary: '#0F172A',
          secondary: '#475569',
          tertiary: '#64748B',
          muted: '#94A3B8',
          inverse: '#FFFFFF',
        },
        brand: {
          DEFAULT: '#2563EB',
          dark: '#1D4ED8',
          darker: '#1E40AF',
          tint: '#EFF6FF',
          tintBorder: '#BFDBFE',
        },
        semantic: {
          income: '#15803D',
          'income-fill': '#22C55E',
          'income-bg': '#DCFCE7',
          expense: '#DC2626',
          'expense-fill': '#EF4444',
          'expense-bg': '#FEE2E2',
          neutral: '#475569',
          'neutral-bg': '#F1F5F9',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        malayalam: ['Noto Sans Malayalam', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '20px',
        '3xl': '24px',
      },
    },
  },
  plugins: [],
};
