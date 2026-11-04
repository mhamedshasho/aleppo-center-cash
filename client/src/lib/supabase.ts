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

const nativeFetch = globalThis.fetch.bind(globalThis);
const mutationCooldownMs = 3000;
const pendingMutations = new Map<string, Promise<Response>>();
const recentMutations = new Map<string, { expiresAt: number; response: Response }>();

async function guardedSupabaseFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const body = init?.body;
  if (
    !requestUrl.includes("/rest/v1/") ||
    !["POST", "PATCH", "PUT", "DELETE"].includes(method) ||
    typeof body !== "string" ||
    body.length > 16000
  ) {
    return nativeFetch(input, init);
  }

  const authorization = new Headers(init?.headers).get("Authorization") ?? "";
  const key = method + ":" + requestUrl + ":" + authorization + ":" + body;
  const now = Date.now();

  for (const [cachedKey, cached] of recentMutations) {
    if (cached.expiresAt <= now) recentMutations.delete(cachedKey);
  }

  const cached = recentMutations.get(key);
  if (cached && cached.expiresAt > now) return cached.response.clone();

  const pending = pendingMutations.get(key);
  if (pending) return (await pending).clone();

  const request = nativeFetch(input, init).then((response) => {
    if (response.ok) {
      if (recentMutations.size >= 100) {
        const oldestKey = recentMutations.keys().next().value;
        if (oldestKey) recentMutations.delete(oldestKey);
      }
      recentMutations.set(key, {
        expiresAt: Date.now() + mutationCooldownMs,
        response: response.clone(),
      });
    }
    return response;
  }).finally(() => {
    pendingMutations.delete(key);
  });

  pendingMutations.set(key, request);
  return request;
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      global: { fetch: guardedSupabaseFetch },
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
