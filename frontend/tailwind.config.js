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
        bg: '#FFF8E7',
        surface: '#FFFFFF',
        border: '#F0E4C8',
        gold: '#FFC83D',
        goldEdge: '#D99A00',
        ink: '#1F2937',
        inkMuted: '#6B7280',
        income: '#1F8A5B',
        expense: '#E5484D',
        expenseEdge: '#B4232A',
        teal: '#0E7C86',
        dimOverlay: 'rgba(31, 41, 55, 0.40)',
        categoryFood: '#F97316',
        categoryShopping: '#0E7C86',
        categoryTransport: '#38BDF8',
        categoryPeople: '#8B5CF6',
        categoryOther: '#9CA3AF',
      },
      fontFamily: {
        baloo: ['Baloo Chettan 2', 'sans-serif'],
        nunito: ['Nunito', 'sans-serif'],
        malayalam: ['Noto Sans Malayalam', 'sans-serif'],
      },
      borderRadius: {
        pill: '999px',
        card: '20px',
        button: '16px',
        input: '16px',
        small: '12px',
        screen: '40px',
      },
    },
  },
  plugins: [],
};
