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
        // ── Neural Mesh Palette ──────────────────────────────────
        primary:   { DEFAULT: '#4F46E5', light: '#6366F1', dark: '#3730A3' },  // Electric Indigo (primary actions/nav)
        indigo:    { DEFAULT: '#4F46E5', light: '#6366F1', dark: '#3730A3' },  // Electric Indigo
        teal:      { DEFAULT: '#06B6D4', light: '#22D3EE', dark: '#0891B2' },  // Cyber Cyan (success / ALLOW / verified)
        cyan:      { DEFAULT: '#06B6D4', light: '#22D3EE', dark: '#0891B2' },  // Cyber Cyan
        pink:      { DEFAULT: '#D946EF', light: '#E879F9', dark: '#C026D3' },  // Neon Magenta (AI & elevated risk / DENY)
        magenta:   { DEFAULT: '#D946EF', light: '#E879F9', dark: '#C026D3' },  // Neon Magenta
        violet:    { DEFAULT: '#D946EF', light: '#E879F9', dark: '#C026D3' },  // Neon Magenta (PAUSE_REVIEW)
        spark:     { DEFAULT: '#A5F3FC', light: '#CFFAFE', dark: '#67E8F9' },  // Highlight Spark (focus rings / highlights)
        orange:    { DEFAULT: '#F59E0B', light: '#FBBF24', dark: '#D97706' },  // Amber (warning / APPROVAL)
        gold:      { DEFAULT: '#F59E0B', light: '#FBBF24', dark: '#D97706' },  // Accent badge
        // ── Neutrals ─────────────────────────────────────────────
        ink: {
          50:  '#FFFFFF',
          100: '#E2E8F0',
          200: '#94A3B8',
          400: '#475569',
          600: '#334155',
          800: '#1E293B',
          900: '#0F172A',
        },
        // ── Surface layers (Void Base) ────────────────────────────
        surface: {
          0:   '#05050A',
          1:   '#0A0A12',
          2:   '#121220',
          3:   '#1A1A2E',
          4:   '#22223C',
        },
      },
      fontFamily: {
        mono: ['Cascadia Code', 'Fira Code', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'glow-primary': '0 0 20px rgba(79,70,229,0.35)',
        'glow-teal':    '0 0 16px rgba(6,182,212,0.35)',
        'glow-cyan':    '0 0 16px rgba(6,182,212,0.35)',
        'glow-orange':  '0 0 16px rgba(245,158,11,0.35)',
        'glow-pink':    '0 0 16px rgba(217,70,239,0.35)',
        'glow-violet':  '0 0 16px rgba(217,70,239,0.35)',
        'glow-spark':   '0 0 12px rgba(165,243,252,0.4)',
      },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(135deg, #4F46E5 0%, #D946EF 100%)',
        'gradient-teal':  'linear-gradient(135deg, #06B6D4 0%, #4F46E5 100%)',
      },
    },
  },
  plugins: [],
};
