import { createClient } from '@supabase/supabase-js';

// Read-only access. The anon key is a public client key gated by RLS
// (articles are readable only when status is approved/sent). Both values come
// from .env — see .env.example. Expo inlines EXPO_PUBLIC_* at build time, so
// changes need a cache-clearing restart: npx expo start -c
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env, fill them in, then restart with `npx expo start -c`.',
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
