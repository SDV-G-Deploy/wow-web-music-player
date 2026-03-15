import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

const LOG_KEY = 'wwmp-last-crash';

const persistCrash = (error: unknown, extra?: string | null) => {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const payload = {
    at: new Date().toISOString(),
    message,
    extra: extra ?? '',
  };

  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(payload));
  } catch {
    // ignore localStorage issues
  }

  console.error('[WWMP] Fatal UI crash', payload);
};

export const installGlobalCrashLogging = () => {
  window.addEventListener('error', (event) => {
    persistCrash(event.error ?? event.message, event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined);
  });

  window.addEventListener('unhandledrejection', (event) => {
    persistCrash(event.reason, 'unhandledrejection');
  });
};

class CrashGuard extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    persistCrash(error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main style={{ padding: '24px', fontFamily: 'system-ui, sans-serif', color: '#fff', background: '#120f28', minHeight: '100vh' }}>
          <h1 style={{ marginTop: 0 }}>App failed to start</h1>
          <p>Что-то пошло не так. Перезапусти приложение.</p>
          <p style={{ opacity: 0.8, fontSize: '0.95rem' }}>
            Если проблема повторяется: открой DevTools/Logcat и проверь сообщения с префиксом <code>[WWMP]</code>.
          </p>
        </main>
      );
    }

    return this.props.children;
  }
}

export default CrashGuard;
