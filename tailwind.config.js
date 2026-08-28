/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        flow: {
          bg: '#FAFAFA',
          card: '#FFFFFF',
          border: '#E5E7EB',
          text: '#1F2937',
          sub: '#6B7280',
          muted: '#9CA3AF',
          light: '#F3F4F6',
          primary: '#111827',
          accent: '#2563EB',
        }
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          '"Noto Sans"',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          'sans-serif',
        ],
      },
      animation: {
        'bubble-float': 'bubbleFloat 5s cubic-bezier(0.34, 1.56, 0.64, 1) infinite',
      },
      keyframes: {
        bubbleFloat: {
          '0%, 100%': { transform: 'translateY(0px) translateX(0px) scale(1, 1) rotate(0deg)' },
          '25%': { transform: 'translateY(-1.0px) translateX(0.0px) scale(1.0020, 0.9980) rotate(0deg)' },
          '50%': { transform: 'translateY(-2px) translateX(0px) scale(0.9980, 1.0020) rotate(-0deg)' },
          '75%': { transform: 'translateY(-0.6px) translateX(-0.0px) scale(1.0020, 0.9980) rotate(0deg)' },
        }
      }
    },
  },
  plugins: [],
}
