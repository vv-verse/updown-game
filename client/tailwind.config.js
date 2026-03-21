/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Bebas Neue"', 'cursive'],
        mono:    ['"JetBrains Mono"', 'monospace'],
        body:    ['"DM Sans"', 'sans-serif'],
      },
      colors: {
        ink:    '#0a0a0f',
        paper:  '#f5f0e8',
        acid:   '#c8ff00',
        neon:   '#00ffcc',
        danger: '#ff3366',
        warn:   '#ffaa00',
      },
      animation: {
        'pulse-fast': 'pulse 0.8s cubic-bezier(0.4,0,0.6,1) infinite',
        'slide-up':   'slideUp 0.4s ease-out',
        'pop':        'pop 0.3s cubic-bezier(0.34,1.56,0.64,1)',
        'shake':      'shake 0.4s ease-out',
        'glow':       'glow 2s ease-in-out infinite',
      },
      keyframes: {
        slideUp: {
          '0%':   { transform: 'translateY(20px)', opacity: 0 },
          '100%': { transform: 'translateY(0)',    opacity: 1 },
        },
        pop: {
          '0%':   { transform: 'scale(0.8)', opacity: 0 },
          '100%': { transform: 'scale(1)',   opacity: 1 },
        },
        shake: {
          '0%,100%': { transform: 'translateX(0)' },
          '25%':     { transform: 'translateX(-8px)' },
          '75%':     { transform: 'translateX(8px)' },
        },
        glow: {
          '0%,100%': { boxShadow: '0 0 10px #c8ff0066' },
          '50%':     { boxShadow: '0 0 30px #c8ff00cc, 0 0 60px #c8ff0044' },
        },
      },
    },
  },
  plugins: [],
};
