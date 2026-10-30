// src/services/syncService.ts - Ekklesphere Offline Reconciliation Engine for Church Portals
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';

export const supabaseClient = SUPABASE_URL && SUPABASE_ANON_KEY 
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

export interface OfflineMutation {
  id: string;
  table: string;
  operation: 'insert' | 'update' | 'delete';
  payload: any;
  tenant_id: string;
  timestamp: string;
}

const OFFLINE_STORAGE_KEY = 'ekklesphere_offline_queue_v1';

export function isDeviceOnline(): boolean {
  if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
    return navigator.onLine;
  }
  return true;
}

export function getPendingMutations(): OfflineMutation[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(OFFLINE_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    }
  } catch (err) {
    console.warn('Could not read offline queue:', err);
  }
  return [];
}

export function savePendingMutations(queue: OfflineMutation[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(queue));
    }
  } catch (err) {
    console.warn('Could not save offline queue:', err);
  }
}
