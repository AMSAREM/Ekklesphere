import { useState, useEffect, useCallback } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

declare global {
  interface Window {
    __ekklesphereDeferredInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() =>
    typeof window !== 'undefined' ? window.__ekklesphereDeferredInstallPrompt || null : null
  );
  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true
    );
  });

  const isIOS =
    typeof navigator !== 'undefined' &&
    (/ipad|iphone|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) &&
    !(window as unknown as { MSStream?: unknown }).MSStream;

  const isInIframe = (() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const standaloneQuery = window.matchMedia('(display-mode: standalone)');
    const syncInstalledState = () => {
      const standalone =
        standaloneQuery.matches ||
        (window.navigator as { standalone?: boolean }).standalone === true;
      setIsInstalled(standalone);
      if (standalone) {
        window.__ekklesphereDeferredInstallPrompt = null;
        setDeferredPrompt(null);
      }
    };

    syncInstalledState();

    // Sync any prompt captured before React mounted
    if (window.__ekklesphereDeferredInstallPrompt) {
      setDeferredPrompt(window.__ekklesphereDeferredInstallPrompt);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      window.__ekklesphereDeferredInstallPrompt = promptEvent;
      setDeferredPrompt(promptEvent);
    };

    const handleAppInstalled = () => {
      window.__ekklesphereDeferredInstallPrompt = null;
      setDeferredPrompt(null);
      setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    standaloneQuery.addEventListener?.('change', syncInstalledState);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      standaloneQuery.removeEventListener?.('change', syncInstalledState);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<{
    outcome: 'accepted' | 'dismissed' | 'unavailable';
  }> => {
    const promptEvent =
      deferredPrompt ||
      (typeof window !== 'undefined' ? window.__ekklesphereDeferredInstallPrompt : null);

    if (!promptEvent) {
      return { outcome: 'unavailable' };
    }

    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;

    window.__ekklesphereDeferredInstallPrompt = null;
    setDeferredPrompt(null);
    if (choice.outcome === 'accepted') {
      setIsInstalled(true);
    }
    return { outcome: choice.outcome };
  }, [deferredPrompt]);

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    isInIframe,
    promptInstall,
  };
}
