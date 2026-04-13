export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('./sw.js');
    } catch (error) {
      // Keep registration failures non-blocking for normal app usage.
      console.warn('Service worker registration failed:', error);
    }
  }, { once: true });
}
