/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink:        '#0a160b',
        forest: {
          dark:    '#0d1f0d',
          DEFAULT: '#16321a',
          light:   '#234d27',
          ln:      '#2d5a2d',
          accent:  '#4a7c4a',
          bright:  '#5a9a5a',
        },
        bark:    '#6b4226',
        leaf: {
          DEFAULT: '#8bc34a',
          soft:    '#a7d36a',
        },
        mist: {
          DEFAULT: '#e9f4e1',
          dim:     '#c5d8bd',
        },
        paper: {
          DEFAULT: '#f3f5ee',
          2:       '#e8ede0',
          line:    '#d7dece',
        },
        cir: {
          DEFAULT: '#d96b96',
          deep:    '#b24a78',
        },
      },
      fontFamily: {
        display: ['Spectral', 'Georgia', 'serif'],
        sans:    ['Hanken Grotesk', 'system-ui', 'sans-serif'],
        mono:    ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      animation: {
        fadeIn:   'fadeIn 0.6s ease-in-out',
        fadeUp:   'fadeUp 0.7s ease-out',
        pulse:    'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        shimmer:  'shimmer 2.4s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:  { '0%': { opacity: '0' },                              '100%': { opacity: '1' } },
        fadeUp:  { '0%': { opacity: '0', transform: 'translateY(18px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        shimmer: { '0%,100%': { opacity: '0.7' }, '50%': { opacity: '1' } },
      },
      borderRadius: {
        pill: '999px',
      },
    },
  },
  plugins: [],
}
