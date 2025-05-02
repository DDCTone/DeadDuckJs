// @ts-check
import { defineConfig } from 'astro/config';
import tailwind from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://DeadDuckJs.github.io',
  base: '/DeadDuckJs',
  vite: {
    plugins: [tailwind()],
  },
});
