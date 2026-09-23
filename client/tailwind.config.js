/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0B1012',
          900: '#0F1417',
          800: '#141B1F',
          700: '#1B2328',
          600: '#232C32',
          500: '#2E393F',
          400: '#48565D',
        },
        mist: {
          100: '#EDF2F3',
          200: '#C9D3D6',
          300: '#8A9AA3',
          400: '#647178',
        },
        signal: {
          DEFAULT: '#C6FF5E',
          dim: '#9BD64A',
          soft: 'rgba(198, 255, 94, 0.14)',
        },
        wire: {
          blue: '#6FA8FF',
          amber: '#F5B04D',
          rose: '#FF8181',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        body: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 20px 50px -20px rgba(0,0,0,0.6)',
        node: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 8px 24px -12px rgba(0,0,0,0.55)',
      },
      keyframes: {
        pulseDot: {
          '0%, 100%': { opacity: 0.35, transform: 'scale(0.85)' },
          '50%': { opacity: 1, transform: 'scale(1)' },
        },
        traceIn: {
          from: { strokeDashoffset: 1 },
          to: { strokeDashoffset: 0 },
        },
      },
      animation: {
        pulseDot: 'pulseDot 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
