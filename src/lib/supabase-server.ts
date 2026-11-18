import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "./env";

let cachedClient: SupabaseClient | null = null;
let cachedEndpoint = "";

/**
 * Cliente Supabase exclusivamente server-side (service_role sobre rede Docker interna).
 * Desabilita cache HTTP do Next.js para refletir alterações de disponibilidade em tempo real.
 */
export function getSupabaseAdmin(): SupabaseClient {
  const env = getServerEnv();
  if (cachedClient && cachedEndpoint === env.supabaseUrl) {
    return cachedClient;
  }

  cachedEndpoint = env.supabaseUrl;
  cachedClient = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: "no-store",
        }),
    },
  });

  return cachedClient;
}
