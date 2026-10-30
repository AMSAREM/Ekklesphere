// src/services/syncService.ts - Offline Reconciliation Engine
// Follows strict single-source-of-truth guidelines:
// 1. Supabase is the primary write path for all operations when connected.
// 2. Writes are awaited and errors are surfaced to the UI immediately.
// 3. Offline storage is used ONLY when genuinely disconnected (no network).
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
  school_id: string;
  timestamp: string;
}

const OFFLINE_STORAGE_KEY = 'schoolsphere_offline_reconciliation_queue_v1';
const READ_CACHE_PREFIX = 'schoolsphere_read_cache_v1_';

export function isDeviceOnline(): boolean {
  if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
    return navigator.onLine;
  }
  return true;
}

/**
 * Executes a write through Supabase as the single source of truth.
 * Throws immediately if an error occurs while online so the UI can display it.
 * Only queues if genuinely disconnected from the network.
 */
export async function executeWriteOperation<T = any>(
  table: string,
  operation: 'insert' | 'update' | 'delete',
  payload: any,
  schoolId: string
): Promise<{ success: boolean; data?: T; offlineQueued?: boolean }> {
  const online = isDeviceOnline();

  // If online, execute immediately on Supabase and await result
  if (online && supabaseClient) {
    let query;
    if (operation === 'insert') {
      query = supabaseClient.from(table).insert({ ...payload, school_id: schoolId }).select().single();
    } else if (operation === 'update') {
      const { id, ...updates } = payload;
      query = supabaseClient.from(table).update(updates).eq('id', id).eq('school_id', schoolId).select().single();
    } else if (operation === 'delete') {
      query = supabaseClient.from(table).delete().eq('id', payload.id).eq('school_id', schoolId);
    } else {
      throw new Error(`Unsupported operation: ${operation}`);
    }

    const { data, error } = await query;
    if (error) {
      // Step 3 Requirement: Surface errors immediately to UI, do not queue silently!
      throw new Error(`Supabase write failed for table '${table}': ${error.message}`);
    }

    // Update read-through cache for offline recovery
    updateReadThroughCache(table, data);
    return { success: true, data: data as T };
  }

  // Device is genuinely offline: queue for reconciliation upon reconnection
  if (!online) {
    const queue = getPendingMutations();
    const mutation: OfflineMutation = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      table,
      operation,
      payload,
      school_id: schoolId,
      timestamp: new Date().toISOString(),
    };
    queue.push(mutation);
    savePendingMutations(queue);
    return { success: true, offlineQueued: true };
  }

  throw new Error('Supabase client is unconfigured and cannot perform writes.');
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

/**
 * Reconciles offline mutations once network connectivity is restored.
 */
export async function reconcileOfflineMutations(): Promise<{ reconciled: number; failed: number }> {
  if (!isDeviceOnline() || !supabaseClient) {
    return { reconciled: 0, failed: 0 };
  }

  const queue = getPendingMutations();
  if (queue.length === 0) return { reconciled: 0, failed: 0 };

  const remaining: OfflineMutation[] = [];
  let reconciled = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      if (item.operation === 'insert') {
        const { error } = await supabaseClient.from(item.table).insert({ ...item.payload, school_id: item.school_id });
        if (error) throw error;
      } else if (item.operation === 'update') {
        const { id, ...updates } = item.payload;
        const { error } = await supabaseClient.from(item.table).update(updates).eq('id', id).eq('school_id', item.school_id);
        if (error) throw error;
      } else if (item.operation === 'delete') {
        const { error } = await supabaseClient.from(item.table).delete().eq('id', item.payload.id).eq('school_id', item.school_id);
        if (error) throw error;
      }
      reconciled++;
    } catch (err) {
      console.error(`Failed to reconcile offline mutation for ${item.table}:`, err);
      failed++;
      remaining.push(item);
    }
  }

  savePendingMutations(remaining);
  return { reconciled, failed };
}

/**
 * Read-through offline cache helper.
 */
function updateReadThroughCache(table: string, data: any): void {
  try {
    if (typeof localStorage !== 'undefined' && data) {
      const key = `${READ_CACHE_PREFIX}${table}`;
      const existing = localStorage.getItem(key);
      const list = existing ? JSON.parse(existing) : [];
      const updated = Array.isArray(data) ? [...data] : [data, ...list.filter((x: any) => x.id !== data.id)].slice(0, 100);
      localStorage.setItem(key, JSON.stringify(updated));
    }
  } catch {
    // Read-through cache failure is non-fatal
  }
}

export function getReadThroughCache<T = any>(table: string): T[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const key = `${READ_CACHE_PREFIX}${table}`;
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : [];
    }
  } catch {
    // Ignore cache error
  }
  return [];
}
