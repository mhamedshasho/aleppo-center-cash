import { createClient } from "@supabase/supabase-js";

const configuredSupabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const configuredSupabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

// The publishable key is intentionally safe for client-side applications.
// Keeping these fallbacks makes the standalone Android build use the same
// Supabase project as the Vercel deployment even when CI has no Vercel env vars.
const supabaseUrl =
  configuredSupabaseUrl || "https://xjiugcycrmthmaclvcwx.supabase.co";
const supabasePublishableKey =
  configuredSupabasePublishableKey ||
  "sb_publishable_23JDaxeRSNMUBU8M4PnUZQ_cByij5q9";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      realtime: {
        params: { eventsPerSecond: 10 },
      },
    })
  : null;

export async function getSupabaseSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function signInWithPassword(email: string, password: string) {
  if (!supabase) throw new Error("Supabase غير مهيأ بعد");
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUpWithPassword(email: string, password: string) {
  if (!supabase) throw new Error("Supabase غير مهيأ بعد");
  return supabase.auth.signUp({ email, password });
}

export async function signOutSupabase() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
