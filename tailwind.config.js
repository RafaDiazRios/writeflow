/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        serif: ['Iowan Old Style', 'Georgia', 'Cambria', 'serif'],
        mono: ['Cascadia Code', 'Consolas', 'monospace'],
      },
      colors: {
        ink: {
          50: '#f6f6f5', 100: '#e7e7e4', 200: '#d1d0cb', 300: '#b0aea6',
          400: '#8b887e', 500: '#706d64', 600: '#59564f', 700: '#484641',
          800: '#3c3a36', 900: '#25231f', 950: '#171613',
        },
        accent: {
          50: '#f4f6fb', 100: '#e7ecf7', 200: '#cbd8ee', 300: '#9db8de',
          400: '#6892ca', 500: '#4573b4', 600: '#345a97', 700: '#2b487a',
          800: '#283e66', 900: '#263656', 950: '#192339',
        },
      },
      keyframes: {
        'fade-in': { '0%': { opacity: '0', transform: 'translateY(4px)' }, '100%': { opacity: '1', transform: 'none' } },
      },
      animation: { 'fade-in': 'fade-in .18s ease-out' },
    },
  },
  plugins: [],
}
