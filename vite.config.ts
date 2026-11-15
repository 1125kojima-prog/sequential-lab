import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  // GitHub Pages では https://<ユーザー名>.github.io/sequential-lab/ に置く。npm run dev は / のまま。
  base: command === 'build' ? '/sequential-lab/' : '/',
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
}));
