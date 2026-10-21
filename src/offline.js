// Development deliberately has no service worker. Production prepares only the
// Linea-owned asset manifest; failed caching does not prevent legal board use.
export async function registerOfflineReview() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register('/linea-sw.js', { updateViaCache: 'none' });
    await navigator.serviceWorker.ready;
    window.dispatchEvent(new CustomEvent('linea-offline-status', { detail: 'Saved reviews are ready to reopen offline in this browser.' }));
    const update = () => { if (registration.waiting) window.dispatchEvent(new CustomEvent('linea-offline-status', { detail: 'A Linea update is ready. Finish or pause your review, then close all Linea tabs to apply it.' })); };
    update(); registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', update));
  } catch {
    window.dispatchEvent(new CustomEvent('linea-offline-status', { detail: 'Offline assets could not be prepared. Local saves remain available while the app is open.' }));
  }
}
