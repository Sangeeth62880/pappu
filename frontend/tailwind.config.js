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
        'ink-navy': {
          DEFAULT: '#161B2E',
          light: '#1E2540',
          lighter: '#2A3356',
          muted: '#3A4268',
        },
        'bone': {
          DEFAULT: '#F4EFE1',
          dark: '#E8E0CC',
          darker: '#D4C9AE',
          muted: '#C8BFA8',
        },
        'warm-brass': {
          DEFAULT: '#C9A227',
          light: '#D4B44A',
          dark: '#A8861F',
          muted: '#8A6F1A',
        },
        'banana-leaf': {
          DEFAULT: '#4B7B5A',
          light: '#5E9470',
          dark: '#3A6246',
        },
        'clay-rust': {
          DEFAULT: '#B5502E',
          light: '#C96A48',
          dark: '#963F22',
        },
      },
      fontFamily: {
        serif: ['Libre Baskerville', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        malayalam: ['Noto Sans Malayalam', 'sans-serif'],
      },
      keyframes: {
        balanceReveal: {
          '0%': { opacity: '0', transform: 'scale(0.95) translateY(4px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
      },
      animation: {
        'balance-reveal': 'balanceReveal 400ms ease-out forwards',
      },
    },
  },
  plugins: [],
}
