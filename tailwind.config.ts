import type { Config } from 'tailwindcss';

/**
 * TailwindCSS configuration for the lottery presenter app.
 *
 * The content glob tells Tailwind where to look for class names. Since this
 * project uses the Next.js App Router, we include everything under the
 * `app` and `components` directories. The default theme is extended via the
 * `extend` property if needed, but here we rely on Tailwind's defaults.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
