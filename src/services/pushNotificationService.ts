// src/services/pushNotificationService.ts - Web Push Notifications & Service Worker Integration for Ekklesphere

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: {
    url?: string;
    type?: 'arrival_checkin' | 'service_reminder' | 'absence_alert' | 'pastoral_care' | 'announcement';
    personId?: string;
    serviceId?: string;
    [key: string]: unknown;
  };
  actions?: Array<{ action: string; title: string }>;
}

export interface PushDeviceSubscription {
  id: string;
  endpoint: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
  personId?: string;
  personName?: string;
  userAgent?: string;
  subscribedAt: string;
  tenantId?: string;
}

class PushNotificationService {
  private swRegistration: ServiceWorkerRegistration | null = null;
  private isRegistering: boolean = false;

  public isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'Notification' in window
    );
  }

  public getPermissionStatus(): NotificationPermission | 'unsupported' {
    if (!this.isSupported()) return 'unsupported';
    return Notification.permission;
  }

  /**
   * Register the Service Worker in public/sw.js
   */
  public async registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (!this.isSupported()) return null;
    if (this.swRegistration) return this.swRegistration;
    if (this.isRegistering) {
      // wait a moment if concurrent
      await new Promise((resolve) => setTimeout(resolve, 300));
      return this.swRegistration;
    }

    this.isRegistering = true;
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      this.swRegistration = reg;
      console.log('[PushService] Service worker registered successfully with scope:', reg.scope);
      return reg;
    } catch (err) {
      console.warn('[PushService] Service worker registration failed:', err);
      return null;
    } finally {
      this.isRegistering = false;
    }
  }

  /**
   * Request user permission for notifications
   */
  public async requestPermission(): Promise<NotificationPermission | 'unsupported'> {
    if (!this.isSupported()) return 'unsupported';
    try {
      const permission = await Notification.requestPermission();
      console.log('[PushService] Notification permission result:', permission);

      if (permission === 'granted') {
        await this.registerServiceWorker();
      }
      return permission;
    } catch (err) {
      console.warn('[PushService] Request permission error:', err);
      return Notification.permission;
    }
  }

  /**
   * Subscribe device to Push Notifications and notify backend
   */
  public async subscribeToPush(personId?: string, personName?: string, tenantId?: string): Promise<boolean> {
    if (!this.isSupported()) return false;

    try {
      let reg = this.swRegistration;
      if (!reg) {
        reg = await this.registerServiceWorker();
      }
      if (!reg) return false;

      // Check existing subscription
      let sub: PushSubscription | null = null;
      if ('pushManager' in reg) {
        try {
          sub = await reg.pushManager.getSubscription();
          if (!sub) {
            // Subscribe with userVisibleOnly
            // Note: ApplicationServerKey can be supplied via VAPID if configured
            sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
            }).catch(() => null);
          }
        } catch {
          // PushManager subscribe might fail without VAPID keys, handled below
        }
      }

      const subscriptionId = sub ? sub.endpoint : `web-client-${personId || 'anon'}-${Date.now()}`;
      const payload: PushDeviceSubscription = {
        id: subscriptionId,
        endpoint: sub ? sub.endpoint : `local://browser-${navigator.userAgent.slice(0, 30)}`,
        keys: sub ? {
          p256dh: sub.toJSON().keys?.p256dh,
          auth: sub.toJSON().keys?.auth,
        } : undefined,
        personId: personId || undefined,
        personName: personName || undefined,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        subscribedAt: new Date().toISOString(),
        tenantId: tenantId || 'e0000000-0000-0000-0000-000000000001',
      };

      // Persist in localStorage for quick client retrieval
      try {
        localStorage.setItem('ekklesphere_push_sub', JSON.stringify(payload));
      } catch {}

      // Inform Express backend
      await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch((err) => console.warn('[PushService] Server subscription sync warning:', err));

      return true;
    } catch (err) {
      console.warn('[PushService] Push subscription failed:', err);
      return false;
    }
  }

  /**
   * Display a local or system push notification directly
   */
  public async showLocalNotification(payload: PushNotificationPayload): Promise<boolean> {
    if (!this.isSupported()) return false;
    if (Notification.permission !== 'granted') {
      const perm = await this.requestPermission();
      if (perm !== 'granted') return false;
    }

    try {
      const reg = await this.registerServiceWorker();
      const options: NotificationOptions & { vibrate?: number[] } = {
        body: payload.body,
        icon: payload.icon || '/icon.svg',
        badge: payload.badge || '/icon.svg',
        tag: payload.tag || `ekklesphere-${Date.now()}`,
        data: payload.data || { url: '/' },
        vibrate: [200, 100, 200],
      };

      if (reg && 'showNotification' in reg) {
        await reg.showNotification(payload.title, options as NotificationOptions);
        return true;
      } else {
        // Fallback for environments where service worker registration isn't active
        new Notification(payload.title, options);
        return true;
      }
    } catch (err) {
      console.warn('[PushService] Show notification error:', err);
      return false;
    }
  }

  /**
   * Standard Ekklesphere Trigger 1: Arrival Detected
   * Section 3.3 & 6.2: "Welcome, [Name]. You are checked in for [Service Name]."
   */
  public async notifyArrivalCheckin(
    memberName: string,
    serviceName: string,
    method: string = 'geofence'
  ): Promise<boolean> {
    const firstName = memberName.split(' ')[0] || 'Member';
    const methodDescription =
      method === 'geofence'
        ? 'Confirmed via campus sanctuary radar'
        : method === 'posted_qr'
        ? 'Confirmed via entrance QR scan'
        : method === 'usher'
        ? 'Confirmed by Door Usher'
        : 'Confirmed present';

    return this.showLocalNotification({
      title: `Welcome, ${firstName}!`,
      body: `You are checked in for ${serviceName}. ${methodDescription}.`,
      icon: '/icon.svg',
      tag: 'arrival-checkin',
      data: {
        type: 'arrival_checkin',
        url: '/',
      },
    });
  }

  /**
   * Standard Ekklesphere Trigger 2: 24 Hours Before Service Reminder
   */
  public async notifyServiceReminder(serviceName: string, startsAt: string): Promise<boolean> {
    return this.showLocalNotification({
      title: `Upcoming Service Reminder`,
      body: `${serviceName} starts at ${startsAt}. We look forward to fellowship with you!`,
      icon: '/icon.svg',
      tag: 'service-reminder',
      data: {
        type: 'service_reminder',
        url: '/',
      },
    });
  }

  /**
   * Standard Ekklesphere Trigger 3: Missed Consecutive Services Alert
   */
  public async notifyAbsenceAlert(leaderName: string, absentMemberName: string, missedCount: number): Promise<boolean> {
    return this.showLocalNotification({
      title: `Pastoral Care Alert`,
      body: `${absentMemberName} has missed ${missedCount} consecutive services. A follow-up task has been logged for your care team.`,
      icon: '/icon.svg',
      tag: 'absence-alert',
      data: {
        type: 'absence_alert',
        url: '/',
      },
    });
  }

  /**
   * Dispatch a notification via server backend
   */
  public async dispatchServerPush(
    title: string,
    body: string,
    personId?: string,
    topic?: string
  ): Promise<{ success: boolean; subscribersCount?: number }> {
    try {
      const res = await fetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, personId, topic }),
      });
      return await res.json();
    } catch (err) {
      console.warn('[PushService] Server push request failed, falling back to local:', err);
      const localOk = await this.showLocalNotification({ title, body });
      return { success: localOk, subscribersCount: 1 };
    }
  }
}

export const pushNotificationService = new PushNotificationService();
