import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const repo = process.env.GITHUB_REPOSITORY?.split('/')[1] || 'wow-web-music-player';

const resolveBase = () => {
  const explicit = process.env.VITE_BASE_PATH?.trim();
  if (explicit) return explicit;

  return process.env.NODE_ENV === 'production' ? `/${repo}/` : '/';
};

export default defineConfig({
  plugins: [react()],
  base: resolveBase(),
});
