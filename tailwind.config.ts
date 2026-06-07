import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0d0d0f',
          card: '#16161a',
          hover: '#1e1e24',
        },
        border: {
          DEFAULT: '#2a2a35',
          light: '#3a3a48',
        },
        accent: {
          green: '#00d68f',
          red: '#ff4757',
          blue: '#4f8ef7',
          yellow: '#ffd700',
          purple: '#a855f7',
        },
        text: {
          primary: '#e8e8f0',
          muted: '#6b6b80',
          subtle: '#4a4a5a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-terminal': 'linear-gradient(135deg, #0d0d0f 0%, #13131a 50%, #0d0d0f 100%)',
        'gradient-card': 'linear-gradient(135deg, #16161a 0%, #1a1a22 100%)',
        'glow-green': 'radial-gradient(circle at center, rgba(0, 214, 143, 0.15) 0%, transparent 70%)',
        'glow-red': 'radial-gradient(circle at center, rgba(255, 71, 87, 0.15) 0%, transparent 70%)',
        'glow-blue': 'radial-gradient(circle at center, rgba(79, 142, 247, 0.15) 0%, transparent 70%)',
      },
      boxShadow: {
        'card': '0 4px 24px rgba(0, 0, 0, 0.4)',
        'card-hover': '0 8px 32px rgba(0, 0, 0, 0.6)',
        'green-glow': '0 0 20px rgba(0, 214, 143, 0.3)',
        'red-glow': '0 0 20px rgba(255, 71, 87, 0.3)',
        'blue-glow': '0 0 20px rgba(79, 142, 247, 0.3)',
        'inner-dark': 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
      },
      animation: {
        'pulse-green': 'pulse-green 2s ease-in-out infinite',
        'pulse-red': 'pulse-red 2s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'gradient-shift': 'gradient-shift 8s ease infinite',
        'ticker': 'ticker 30s linear infinite',
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-up': 'slide-up 0.4s ease-out',
      },
      keyframes: {
        'pulse-green': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(0, 214, 143, 0.4)' },
          '50%': { boxShadow: '0 0 0 8px rgba(0, 214, 143, 0)' },
        },
        'pulse-red': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(255, 71, 87, 0.4)' },
          '50%': { boxShadow: '0 0 0 8px rgba(255, 71, 87, 0)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'gradient-shift': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        'ticker': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
