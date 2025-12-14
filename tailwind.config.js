/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        mining: {
          bg: '#0B1215',
          surface: '#111C20',
          blue: '#1D9BF0',
          green: '#2ECC71',
          yellow: '#F2C94C',
          red: '#EB5757',
          text: '#E6F1F3',
          'text-secondary': '#8CA5AD',
          border: '#1E2C33',
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
