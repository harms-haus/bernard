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
        // CSS Variables for shadcn/ui components
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: 'var(--card)',
        'card-foreground': 'var(--card-foreground)',
        popover: 'var(--popover)',
        'popover-foreground': 'var(--popover-foreground)',
        primary: 'var(--primary)',
        'primary-foreground': 'var(--primary-foreground)',
        secondary: 'var(--secondary)',
        'secondary-foreground': 'var(--secondary-foreground)',
        muted: 'var(--muted)',
        'muted-foreground': 'var(--muted-foreground)',
        accent: 'var(--accent)',
        'accent-foreground': 'var(--accent-foreground)',
        destructive: 'var(--destructive)',
        'destructive-foreground': 'var(--destructive-foreground)',
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        // Status colors
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
      },
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
