import { getViteConfig } from 'astro/config';

// getViteConfig loads Astro's Vite plugins so `astro:env/*` and image imports resolve inside tests.
export default getViteConfig({
  test: {
    include: ['src/**/*.test.ts', 'supabase/**/*.test.ts'],
    environment: 'node',
  },
});
