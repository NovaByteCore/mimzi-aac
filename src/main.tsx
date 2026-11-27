import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { MimziProvider } from './state/MimziStore';
import { CrashScreen } from './components/CrashScreen';
import { beginStart, rememberError } from './lib/safeStart';
import './styles.css';

beginStart();
window.addEventListener('error', (e) => rememberError(`error: ${e.message}`));
window.addEventListener('unhandledrejection', (e) => rememberError(`promise: ${String((e.reason as Error)?.message ?? e.reason)}`));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CrashScreen>
      <MimziProvider>
        <App />
      </MimziProvider>
    </CrashScreen>
  </StrictMode>,
);

// Offline support: only in production builds (the dev server changes files constantly).
// The Android app already has every file inside the APK, so it skips the service worker.
const inAndroidApp = Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
const isBoardPreview = new URLSearchParams(location.search).has('preview');
if (import.meta.env?.PROD && 'serviceWorker' in navigator && !inAndroidApp && !isBoardPreview) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((err) => {
      console.warn('Mimzi offline support could not start:', err);
    });
  });
}
