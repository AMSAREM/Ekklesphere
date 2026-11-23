import { useCallback, useSyncExternalStore } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

declare global {
  interface Window {
    __ekklesphereDeferredInstallPrompt?: BeforeInstallPromptEvent | null;
    __ekklesphereAppInstalled?: boolean;
  }
}

interface PWAInstallSnapshot {
  isInstallable: boolean;
  isInstalled: boolean;
  isInstalling: boolean;
  isIOS: boolean;
  isMacSafari: boolean;
  isFirefox: boolean;
  isAndroid: boolean;
  isInIframe: boolean;
}

const listeners = new Set<() => void>();
const promptWaiters = new Set<(event: BeforeInstallPromptEvent | null) => void>();

let storeInitialized = false;
let currentPrompt: BeforeInstallPromptEvent | null = null;
let currentInstalled = false;
let currentInstalling = false;

function detectIsInIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function detectDisplayStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.__ekklesphereAppInstalled) return true;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function detectBrowserEnvironment() {
  if (typeof navigator === 'undefined') {
    return {
      isIOS: false,
      isMacSafari: false,
      isFirefox: false,
      isAndroid: false,
    };
  }

  const ua = navigator.userAgent || '';
  const isIOS =
    (/ipad|iphone|ipod/i.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) &&
    !(window as unknown as { MSStream?: unknown }).MSStream;
  const isAndroid = /android/i.test(ua);
  const isFirefox = /firefox|fxios/i.test(ua);
  const isSafariEngine =
    /safari/i.test(ua) &&
    !/chrome|crios|crmo|edg|edga|edgios|opr|opera|brave|samsungbrowser|firefox|fxios/i.test(ua);
  const isMacSafari = isSafariEngine && !isIOS && /macintosh/i.test(ua);

  return { isIOS, isMacSafari, isFirefox, isAndroid };
}

const browserEnv = detectBrowserEnvironment();
const inIframeFlag = detectIsInIframe();

let cachedSnapshot: PWAInstallSnapshot = {
  isInstallable: false,
  isInstalled: false,
  isInstalling: false,
  isIOS: browserEnv.isIOS,
  isMacSafari: browserEnv.isMacSafari,
  isFirefox: browserEnv.isFirefox,
  isAndroid: browserEnv.isAndroid,
  isInIframe: inIframeFlag,
};

function rebuildSnapshot(): PWAInstallSnapshot {
  const nextInstallable = Boolean(currentPrompt) && !currentInstalled;
  if (
    cachedSnapshot.isInstallable === nextInstallable &&
    cachedSnapshot.isInstalled === currentInstalled &&
    cachedSnapshot.isInstalling === currentInstalling
  ) {
    return cachedSnapshot;
  }
  cachedSnapshot = {
    isInstallable: nextInstallable,
    isInstalled: currentInstalled,
    isInstalling: currentInstalling,
    isIOS: browserEnv.isIOS,
    isMacSafari: browserEnv.isMacSafari,
    isFirefox: browserEnv.isFirefox,
    isAndroid: browserEnv.isAndroid,
    isInIframe: inIframeFlag,
  };
  return cachedSnapshot;
}

function emitStoreChange() {
  rebuildSnapshot();
  listeners.forEach((listener) => listener());
}

function setDeferredPromptGlobal(promptEvent: BeforeInstallPromptEvent | null) {
  currentPrompt = promptEvent;
  if (typeof window !== 'undefined') {
    window.__ekklesphereDeferredInstallPrompt = promptEvent;
  }
  if (promptEvent && promptWaiters.size > 0) {
    const waiters = Array.from(promptWaiters);
    promptWaiters.clear();
    waiters.forEach((resolve) => resolve(promptEvent));
  }
  emitStoreChange();
}

function syncFromWindowEvents() {
  if (typeof window === 'undefined') return;
  if (window.__ekklesphereDeferredInstallPrompt && !currentPrompt) {
    currentPrompt = window.__ekklesphereDeferredInstallPrompt;
  }
  if (detectDisplayStandalone()) {
    currentInstalled = true;
    currentPrompt = null;
    window.__ekklesphereDeferredInstallPrompt = null;
  }
  emitStoreChange();
}

function ensureStoreInitialized() {
  if (storeInitialized || typeof window === 'undefined') return;
  storeInitialized = true;

  currentPrompt = window.__ekklesphereDeferredInstallPrompt || null;
  currentInstalled = detectDisplayStandalone();

  const standaloneQuery = window.matchMedia('(display-mode: standalone)');
  const overlayQuery = window.matchMedia('(display-mode: window-controls-overlay)');

  const handleBeforeInstallPrompt = (e: Event) => {
    e.preventDefault();
    const promptEvent = e as BeforeInstallPromptEvent;
    window.__ekklesphereAppInstalled = false;
    currentInstalled = false;
    setDeferredPromptGlobal(promptEvent);
  };

  const handleAppInstalled = () => {
    window.__ekklesphereAppInstalled = true;
    currentInstalled = true;
    setDeferredPromptGlobal(null);
  };

  const handleCustomSync = () => {
    syncFromWindowEvents();
  };

  const handleDisplayModeChange = () => {
    syncFromWindowEvents();
  };

  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  window.addEventListener('appinstalled', handleAppInstalled);
  window.addEventListener('ekklesphere:pwa-prompt-updated', handleCustomSync);
  standaloneQuery.addEventListener?.('change', handleDisplayModeChange);
  overlayQuery.addEventListener?.('change', handleDisplayModeChange);

  // Detect already-installed Chromium PWA even when launched in a standard browser tab
  const navWithRelated = navigator as Navigator & {
    getInstalledRelatedApps?: () => Promise<Array<{ platform?: string; url?: string; id?: string }>>;
  };
  if (typeof navWithRelated.getInstalledRelatedApps === 'function') {
    navWithRelated
      .getInstalledRelatedApps()
      .then((apps) => {
        if (Array.isArray(apps) && apps.length > 0) {
          currentInstalled = true;
          currentPrompt = null;
          emitStoreChange();
        }
      })
      .catch(() => {});
  }

  // Ensure service worker is registered right away so installability criteria settle immediately
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  }

  rebuildSnapshot();
}

function subscribe(listener: () => void): () => void {
  ensureStoreInitialized();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): PWAInstallSnapshot {
  ensureStoreInitialized();
  return cachedSnapshot;
}

const SERVER_SNAPSHOT: PWAInstallSnapshot = {
  isInstallable: false,
  isInstalled: false,
  isInstalling: false,
  isIOS: false,
  isMacSafari: false,
  isFirefox: false,
  isAndroid: false,
  isInIframe: false,
};

function getServerSnapshot(): PWAInstallSnapshot {
  return SERVER_SNAPSHOT;
}

async function waitForImminentInstallPrompt(
  timeoutMs = 1100
): Promise<BeforeInstallPromptEvent | null> {
  if (typeof window === 'undefined') return null;

  const existing = currentPrompt || window.__ekklesphereDeferredInstallPrompt;
  if (existing) return existing;

  // Only browsers that support beforeinstallprompt can fire it
  if (!('onbeforeinstallprompt' in window) || inIframeFlag) {
    return null;
  }

  if ('serviceWorker' in navigator) {
    try {
      await Promise.race([
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(() => navigator.serviceWorker.ready),
        new Promise((resolve) => setTimeout(resolve, 600)),
      ]);
    } catch {
      // ignore registration errors
    }
  }

  const afterSw = currentPrompt || window.__ekklesphereDeferredInstallPrompt;
  if (afterSw) return afterSw;

  return new Promise<BeforeInstallPromptEvent | null>((resolve) => {
    const timer = window.setTimeout(() => {
      promptWaiters.delete(onResolve);
      resolve(currentPrompt || window.__ekklesphereDeferredInstallPrompt || null);
    }, timeoutMs);

    const onResolve = (ev: BeforeInstallPromptEvent | null) => {
      window.clearTimeout(timer);
      resolve(ev);
    };

    promptWaiters.add(onResolve);
  });
}

export function usePWAInstall() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const promptInstall = useCallback(async (): Promise<{
    outcome: 'accepted' | 'dismissed' | 'unavailable';
  }> => {
    if (typeof window === 'undefined' || currentInstalled) {
      return { outcome: currentInstalled ? 'accepted' : 'unavailable' };
    }

    currentInstalling = true;
    emitStoreChange();

    try {
      let promptEvent = currentPrompt || window.__ekklesphereDeferredInstallPrompt || null;

      if (!promptEvent) {
        promptEvent = await waitForImminentInstallPrompt(1100);
      }

      if (!promptEvent) {
        return { outcome: 'unavailable' };
      }

      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;

      // Consume the single-use BeforeInstallPromptEvent after userChoice resolves
      window.__ekklesphereDeferredInstallPrompt = null;
      currentPrompt = null;

      if (choice.outcome === 'accepted') {
        window.__ekklesphereAppInstalled = true;
        currentInstalled = true;
      }

      emitStoreChange();
      return { outcome: choice.outcome };
    } catch {
      window.__ekklesphereDeferredInstallPrompt = null;
      currentPrompt = null;
      emitStoreChange();
      return { outcome: 'unavailable' };
    } finally {
      currentInstalling = false;
      emitStoreChange();
    }
  }, []);

  return {
    ...snapshot,
    promptInstall,
  };
}
