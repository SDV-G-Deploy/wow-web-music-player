import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const androidAppDir = resolve(import.meta.dirname, '..');
const repoRoot = resolve(androidAppDir, '..');
const distDir = resolve(repoRoot, 'dist');
const webDir = resolve(androidAppDir, 'www');

console.log('[android-app] Building web app...');
execSync('npm run build', {
  cwd: repoRoot,
  stdio: 'inherit',
});

if (!existsSync(distDir)) {
  throw new Error(`Web build output not found: ${distDir}`);
}

rmSync(webDir, { recursive: true, force: true });
mkdirSync(webDir, { recursive: true });
cpSync(distDir, webDir, { recursive: true });

console.log('[android-app] Copied dist/ -> android-app/www');
