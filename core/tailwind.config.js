/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Status colors (consistent across modes via CSS variables)
        status: {
          online: {
            DEFAULT: '#22c55e',
            light: '#16a34a',
          },
          degraded: {
            DEFAULT: '#eab308',
            light: '#ca8a04',
          },
          offline: {
            DEFAULT: '#ef4444',
            light: '#dc2626',
          },
        },
        // Surface colors - adapts to dark/light mode via CSS variables
        surface: {
          DEFAULT: '#1e293b',   // slate-800 (dark mode default)
          light: '#ffffff',     // white (light mode default)
          hover: {
            DEFAULT: '#334155', // slate-700 (dark mode)
            light: '#f1f5f9',   // slate-100 (light mode)
          },
        },
        // Background colors
        background: {
          DEFAULT: '#020617',   // slate-950 (dark mode)
          light: '#f8fafc',     // slate-50 (light mode)
        },
      },
      // Custom border radius for consistency
      borderRadius: {
        card: '0.75rem',        // rounded-xl equivalent
      },
      // Custom box shadows
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
      },
    },
  },
  plugins: [],
}
