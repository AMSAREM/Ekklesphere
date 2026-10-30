// android-geofence/eventQueue.ts
// Offline-safe event queue for attendance geofence events
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const KEY = 'attendance_queue';
const API = process.env.EXPO_PUBLIC_API_URL 
  ? `${process.env.EXPO_PUBLIC_API_URL}/attendance/events`
  : 'https://api.yourapp.com/attendance/events';

export interface AttendancePayload {
  clientEventId: string;
  siteId: string;
  type: 'enter' | 'exit' | 'manual_in' | 'manual_out';
  source: 'geofence' | 'manual' | 'web';
  platform: 'android' | 'web';
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  isMock: boolean;
  deviceTime: string;
}

export async function enqueueEvent(evt: AttendancePayload) {
  const raw = await AsyncStorage.getItem(KEY);
  const q: AttendancePayload[] = raw ? JSON.parse(raw) : [];
  q.push(evt);
  await AsyncStorage.setItem(KEY, JSON.stringify(q));
}

export async function flushQueue(): Promise<{ sent: number; remaining: number }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { sent: 0, remaining: 0 }; // Not signed in: keep queued safely

  const raw = await AsyncStorage.getItem(KEY);
  const q: AttendancePayload[] = raw ? JSON.parse(raw) : [];
  if (q.length === 0) return { sent: 0, remaining: 0 };

  const remaining: AttendancePayload[] = [];
  let sentCount = 0;

  for (const evt of q) {
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(evt),
      });

      // Keep for retry on server errors and transient auth problems;
      // drop on success (200) or permanent client errors (400/404)
      if (res.status >= 500 || res.status === 401 || res.status === 429) {
        remaining.push(evt);
      } else {
        sentCount++;
      }
    } catch {
      // Network failure: retain in local storage
      remaining.push(evt);
    }
  }

  await AsyncStorage.setItem(KEY, JSON.stringify(remaining));
  return { sent: sentCount, remaining: remaining.length };
}
