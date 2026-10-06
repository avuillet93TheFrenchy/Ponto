import { isTauriRuntime } from '@tauri/index.js';

/**
 * Registers the app-shell service worker, only in the web build (`--mode web`),
 * outside Tauri and where the browser supports it. A failure never throws: the
 * app works the same without the service worker.
 * @returns {Promise<void>}
 */
export async function registerServiceWorker() {
  if (isTauriRuntime() || !('serviceWorker' in navigator) || import.meta.env.MODE !== 'web') {
    return;
  }
  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    watchForUpdates(registration);
  } catch {
    // Offline shell is a bonus; ignore registration failures.
  }
}

/**
 * Tells the user when a new version of the app is ready, and activates it on request.
 *
 * The service worker is built without `skipWaiting`, so a new version waits until every tab is
 * closed: an installed app on a phone would never get it. The banner (`#update`) lets the user
 * opt in; accepting asks the waiting worker to take over, then the page reloads once.
 *
 * @param {ServiceWorkerRegistration} registration
 * @param {() => void} [reload] Reloads the page (injectable for tests).
 * @returns {void}
 */
export function watchForUpdates(registration, reload = () => window.location.reload()) {
  const banner = document.getElementById('update');
  const container = navigator.serviceWorker;
  let accepted = false;

  // A first install has no controller yet: there is nothing to update from.
  const offerIfWaiting = () => {
    if (banner && registration.waiting && container.controller) {
      banner.hidden = false;
    }
  };

  document.getElementById('update-accept')?.addEventListener('click', () => {
    accepted = true;
    registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
  });
  document.getElementById('update-later')?.addEventListener('click', () => {
    if (banner) banner.hidden = true;
  });

  // Reload only for the tab that asked: another tab updating must not wipe an unsent text here.
  container.addEventListener('controllerchange', () => {
    if (!accepted) return;
    accepted = false;
    reload();
  });

  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed') offerIfWaiting();
    });
  });

  // A long-lived tab or installed app rarely navigates: look for a new version when it comes back.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      registration.update().catch(() => {
        // Offline or server unreachable: try again at the next return to the foreground.
      });
    }
  });

  offerIfWaiting();
}
