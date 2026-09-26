/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#070707',
        ink2: '#0e0e0d',
        ink3: '#141413',
        bone: '#f1f1ef',
        cream: '#e6e2da',
        amber: {
          DEFAULT: '#e0a24a',
          light: '#f2c879',
          deep: '#b97e2c',
        },
        espresso: '#2a1a12',
        clay: '#c9784a',
      },
      fontFamily: {
        display: ['Syne', 'Space Grotesk', 'system-ui', 'sans-serif'],
        body: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        mono2: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        script: ['"Instrument Serif"', 'Georgia', 'serif'],
        ar: ['"Noto Kufi Arabic"', 'Space Grotesk', 'sans-serif'],
      },
      maxWidth: {
        shell: '1400px',
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translate3d(0,0,0)' },
          '100%': { transform: 'translate3d(-50%,0,0)' },
        },
        spinSlow: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        blip: {
          '0%,100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '.35', transform: 'scale(.75)' },
        },
        floaty: {
          '0%,100%': { transform: 'translate3d(0,0,0)' },
          '50%': { transform: 'translate3d(0,-14px,0)' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translate3d(0,26px,0)' },
          '100%': { opacity: '1', transform: 'none' },
        },
      },
      animation: {
        marquee: 'marquee 34s linear infinite',
        spinSlow: 'spinSlow 26s linear infinite',
        blip: 'blip 1.8s ease-in-out infinite',
        floaty: 'floaty 7s ease-in-out infinite',
        fadeUp: 'fadeUp .9s cubic-bezier(.2,.7,.2,1) both',
      },
    },
  },
  plugins: [],
};