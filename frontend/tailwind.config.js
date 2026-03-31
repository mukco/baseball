/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base: '#07101F',
          surface: '#0D1A2D',
          elevated: '#142236',
          border: '#1C3050',
        },
        content: {
          primary: '#E8EDF5',
          secondary: '#7A90AF',
          muted: '#4A5A7A',
        },
        brand: {
          DEFAULT: '#2563EB',
          light: '#60A5FA',
        },
        stat: {
          elite: '#FF4500',
          great: '#F97316',
          avg: '#9CA3AF',
          below: '#60A5FA',
          poor: '#2563EB',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
