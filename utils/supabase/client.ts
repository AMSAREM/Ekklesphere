import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl =
  (typeof process !== "undefined" && (process.env?.NEXT_PUBLIC_SUPABASE_URL || process.env?.SUPABASE_URL)) ||
  (typeof import.meta !== "undefined" && (import.meta as { env?: Record<string, string> }).env?.VITE_SUPABASE_URL) ||
  "";

const supabaseKey =
  (typeof process !== "undefined" &&
    (process.env?.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env?.SUPABASE_ANON_KEY)) ||
  (typeof import.meta !== "undefined" && (import.meta as { env?: Record<string, string> }).env?.VITE_SUPABASE_ANON_KEY) ||
  "";

export const createClient = () => {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase URL and public anon key environment variables are required.");
  }
  return createBrowserClient(supabaseUrl, supabaseKey);
};
