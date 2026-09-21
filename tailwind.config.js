/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        sidebar: 'var(--sidebar-bg)',
        navy: {
          DEFAULT: 'var(--navy)',
          72: 'var(--navy-72)',
          84: 'var(--navy-84)',
          60: 'var(--navy-60)',
          18: 'var(--navy-18)',
          16: 'var(--navy-16)',
          12: 'var(--navy-12)',
          10: 'var(--navy-10)',
          '08': 'var(--navy-08)',
          '06': 'var(--navy-06)',
          '04': 'var(--navy-04)',
          '02': 'var(--navy-02)',
        },
        ink: 'var(--ink)',
        blue: {
          DEFAULT: 'var(--blue)',
          dark: 'var(--blue-dark)',
          light: 'var(--blue-light)',
          28: 'var(--blue-28)',
          18: 'var(--blue-18)',
          10: 'var(--blue-10)',
          '08': 'var(--blue-08)',
          30: 'var(--blue-30)',
        },
        sky: {
          DEFAULT: 'var(--sky)',
          16: 'var(--sky-16)',
          '08': 'var(--sky-08)',
        },
        cyan: 'var(--cyan)',
        mint: {
          DEFAULT: 'var(--mint)',
          98: 'var(--mint-98)',
          95: 'var(--mint-95)',
          92: 'var(--mint-92)',
          90: 'var(--mint-90)',
          88: 'var(--mint-88)',
          85: 'var(--mint-85)',
          74: 'var(--mint-74)',
          72: 'var(--mint-72)',
          62: 'var(--mint-62)',
          58: 'var(--mint-58)',
          48: 'var(--mint-48)',
          14: 'var(--mint-14)',
          '08': 'var(--mint-08)',
          '06': 'var(--mint-06)',
        },
        surface: {
          DEFAULT: 'var(--surface)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          soft: 'var(--accent-soft)',
        },
        green: {
          DEFAULT: 'var(--green)',
          soft: 'var(--green-soft)',
        },
        amber: {
          DEFAULT: 'var(--amber)',
          soft: 'var(--amber-soft)',
        },
        red: {
          DEFAULT: 'var(--red)',
          soft: 'var(--red-soft)',
        },
      },
      borderRadius: {
        'sm': 'var(--radius-sm)',
        'md': 'var(--radius-md)',
        'lg': 'var(--radius-lg)',
        'xl': 'var(--radius-xl)',
      },
      boxShadow: {
        'soft': 'var(--shadow-soft)',
        'card': 'var(--shadow-card)',
        'pop': 'var(--shadow-pop)',
      }
    },
  },
  plugins: [],
}
