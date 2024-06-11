/* eslint-disable */
module.exports = {
  purge: ['./src/**/*.{js,jsx,ts,tsx}'],
  darkMode: false,
  theme: {
    extend: {
      colors: {
        transparent: 'transparent',
        current: 'currentColor',
        green: {
          50: '#f0fdf4',
          100: '#dcfce7',
          900: '#22543d',
        },
        black: '#000000',
        white: '#ffffff',
        gray: {
          50: '#fafafa',
          100: '#f3f4f6',
          900: '#111827',
        },
        primary: {
          light: '#6ee7b7',
          DEFAULT: '#38b2ac',
          dark: '#0d9488',
        },
        secondary: {
          light: '#d6bcfa',
          DEFAULT: '#a78bfa',
          dark: '#6a4f9e',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        serif: ['Georgia', 'serif'],
      },
      fontSize: {
        xxs: '0.60rem',
        xs: '0.75rem',
        sm: '0.875rem',
        base: '1rem',
        lg: '1.125rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
        '3xl': '1.875rem',
        '4xl': '2.25rem',
        '5xl': '3rem',
        '6xl': '4rem',
        '7xl': '5rem',
      },
      spacing: {
        px: '1px',
        0: '0',
        1: '0.25rem',
        2: '0.5rem',
        3: '0.75rem',
        4: '1rem',
        5: '1.25rem',
        6: '1.5rem',
        8: '2rem',
        10: '2.5rem',
      },
      transformOrigin: {
        'top-left': 'top left',
      },
    },
  },
  variants: {
    extend: {},
  },
  plugins: [],
};
