import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

// Nicola Cafe — static (SSG) build
export default defineConfig({
  base: '/nicola-cafe/',
  output: 'static',
  site: 'https://nicola-cafe.netlify.app',
  integrations: [tailwind({ applyBaseStyles: false })],
  build: { inlineStylesheets: 'auto' },
  compressHTML: true,
});