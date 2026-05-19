/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: '#0d0e11',
        surface: '#13151a',
        surface2: '#1a1d24',
        accent: '#63b3ed',
        green: '#68d391',
        amber: '#f6ad55',
        red: '#fc8181',
        purple: '#b794f4',
        muted: '#7a8099',
        dim: '#4a5068',
      },
      fontFamily: {
        mono: ['IBM Plex Mono', 'monospace'],
        sans: ['IBM Plex Sans', 'sans-serif'],
      },
      borderColor: {
        DEFAULT: 'rgba(255,255,255,0.08)',
      },
    },
  },
  plugins: [],
}
