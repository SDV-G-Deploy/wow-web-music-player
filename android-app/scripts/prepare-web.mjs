import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const androidAppDir = resolve(import.meta.dirname, '..');
const repoRoot = resolve(androidAppDir, '..');
const distDir = resolve(repoRoot, 'dist');
const webDir = resolve(androidAppDir, 'www');

console.log('[android-app] Building web app (relative asset base for Capacitor)...');
execSync('npm run build', {
  cwd: repoRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_BASE_PATH: './',
  },
});

if (!existsSync(distDir)) {
  throw new Error(`Web build output not found: ${distDir}`);
}

const builtIndexPath = resolve(distDir, 'index.html');
const builtIndex = readFileSync(builtIndexPath, 'utf8');

if (!builtIndex.includes('./assets/')) {
  throw new Error(
    `Capacitor build validation failed: ${builtIndexPath} does not use relative ./assets/ paths. ` +
      'This would cause Android white screen due to unresolved absolute URLs.',
  );
}

rmSync(webDir, { recursive: true, force: true });
mkdirSync(webDir, { recursive: true });
cpSync(distDir, webDir, { recursive: true });

console.log('[android-app] Copied dist/ -> android-app/www');
