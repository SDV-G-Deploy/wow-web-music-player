import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import CrashGuard, { installGlobalCrashLogging } from './CrashGuard.tsx';

installGlobalCrashLogging();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CrashGuard>
      <App />
    </CrashGuard>
  </StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`;
    void navigator.serviceWorker.register(swUrl).catch((error) => {
      console.warn('[WWMP] Service Worker registration failed', error);
    });
  });
}
