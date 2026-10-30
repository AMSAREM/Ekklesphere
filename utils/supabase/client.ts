import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl =
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_SUPABASE_URL) ||
  (typeof import.meta !== "undefined" && (import.meta as { env?: Record<string, string> }).env?.VITE_SUPABASE_URL) ||
  "https://sdijgiznzxvlklorvcvi.supabase.co";

const supabaseKey =
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ||
  (typeof import.meta !== "undefined" && (import.meta as { env?: Record<string, string> }).env?.VITE_SUPABASE_ANON_KEY) ||
  "sb_publishable_IOTky2JHZSEzrvWHrOP5mw_ZD2nMpfC";

export const createClient = () =>
  createBrowserClient(
    supabaseUrl!,
    supabaseKey!,
  );
