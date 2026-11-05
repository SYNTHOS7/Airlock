/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        // ── Airlock Dynamic Palette ──────────────────────────────
        primary:   { DEFAULT: '#4A90E2', light: '#6aaef5', dark: '#2d6fbe' },  // blue
        teal:      { DEFAULT: '#50E3C2', light: '#7aedda', dark: '#28c9a6' },  // success / ALLOW
        orange:    { DEFAULT: '#F5A623', light: '#f8be5e', dark: '#d4870a' },  // warning / APPROVAL
        pink:      { DEFAULT: '#E94E77', light: '#f07898', dark: '#c82f58' },  // danger / DENY
        violet:    { DEFAULT: '#9013FE', light: '#ae4ffe', dark: '#6c00cc' },  // PAUSE_REVIEW
        gold:      { DEFAULT: '#F8E71C', light: '#fbf07a', dark: '#d4c400' },  // accent badge
        // ── Neutrals ─────────────────────────────────────────────
        ink: {
          50:  '#FFFFFF',
          100: '#D1D1D1',
          200: '#B7B7B7',
          400: '#4A4A4A',
          600: '#2a2a2a',
          800: '#141414',
          900: '#0a0a0a',
        },
        // ── Surface layers ────────────────────────────────────────
        surface: {
          0:   '#07090f',
          1:   '#0e1117',
          2:   '#151b26',
          3:   '#1c2333',
          4:   '#232b3e',
        },
      },
      fontFamily: {
        mono: ['Cascadia Code', 'Fira Code', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'glow-primary': '0 0 20px rgba(74,144,226,0.4)',
        'glow-teal':    '0 0 16px rgba(80,227,194,0.35)',
        'glow-orange':  '0 0 16px rgba(245,166,35,0.35)',
        'glow-pink':    '0 0 16px rgba(233,78,119,0.35)',
        'glow-violet':  '0 0 16px rgba(144,19,254,0.35)',
      },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(135deg, #4A90E2 0%, #9013FE 100%)',
        'gradient-teal':  'linear-gradient(135deg, #50E3C2 0%, #4A90E2 100%)',
      },
    },
  },
  plugins: [],
};
