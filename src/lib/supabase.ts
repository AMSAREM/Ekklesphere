import { createClient } from '../../utils/supabase/client';

// Single browser client shared by auth, data and API helpers
export const supabase = createClient();

export async function getAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}
