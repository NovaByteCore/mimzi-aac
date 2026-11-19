import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { MimziProvider } from './state/MimziStore';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MimziProvider>
      <App />
    </MimziProvider>
  </StrictMode>,
);

// Offline support: only in production builds (the dev server changes files constantly).
// The Android app already has every file inside the APK, so it skips the service worker.
const inAndroidApp = Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
if (import.meta.env?.PROD && 'serviceWorker' in navigator && !inAndroidApp) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((err) => {
      console.warn('Mimzi offline support could not start:', err);
    });
  });
}
