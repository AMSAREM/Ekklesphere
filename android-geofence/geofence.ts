// android-geofence/geofence.ts
// Background Geofence Task registration and lifecycle management
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Crypto from 'expo-crypto';
import { enqueueEvent, flushQueue } from './eventQueue';

export const GEOFENCE_TASK = 'ATTENDANCE_GEOFENCE';

export interface SiteRecord {
  id: string;
  name?: string;
  lat: number;
  lng: number;
  radiusM: number;
}

// Module-level task definition (must be evaluated at startup before React renders)
TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }: any) => {
  if (error) {
    console.error('[GeofenceTask] Error received from OS:', error);
    return;
  }

  const { eventType, region } = data;

  // The geofence event is a hint; take a fresh high-accuracy fix as evidence
  let fix: Location.LocationObject | null = null;
  try {
    fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  } catch (err) {
    console.warn('[GeofenceTask] Could not obtain high-accuracy fix:', err);
  }

  await enqueueEvent({
    clientEventId: Crypto.randomUUID(), // Idempotency key for deduplication
    siteId: region.identifier,
    type: eventType === Location.GeofencingEventType.Enter ? 'enter' : 'exit',
    source: 'geofence',
    platform: 'android',
    lat: fix?.coords.latitude ?? null,
    lng: fix?.coords.longitude ?? null,
    accuracyM: fix?.coords.accuracy ?? null,
    isMock: fix?.mocked ?? false, // Populated automatically on Android
    deviceTime: new Date().toISOString(),
  });

  await flushQueue();
});

export async function requestPermissions(): Promise<boolean> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return false;

  // Background location is requested as a separate distinct step (required on Android 11+)
  const bg = await Location.requestBackgroundPermissionsAsync();
  return bg.status === 'granted';
}

export async function startGeofencing(sites: SiteRecord[]): Promise<void> {
  if (sites.length === 0) return;

  // Calling this again replaces registered regions.
  // Must run on every app launch to restore fences after device reboots.
  await Location.startGeofencingAsync(
    GEOFENCE_TASK,
    sites.map((s) => ({
      identifier: s.id,
      latitude: s.lat,
      longitude: s.lng,
      radius: Math.max(s.radiusM, 100), // Min 100m recommended for cellular/GPS stability
      notifyOnEnter: true,
      notifyOnExit: true,
    }))
  );
}

export async function stopGeofencing(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK);
  if (isRegistered) {
    await Location.stopGeofencingAsync(GEOFENCE_TASK);
  }
}
