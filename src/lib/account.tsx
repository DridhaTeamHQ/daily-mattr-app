import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { getDeviceId } from './telemetry';

/* Optional reader accounts.
 *
 * The app opens straight into the feed and always will — signing in is offered,
 * never required, and nothing behind it is gated. What an account buys is
 * continuity: a reader who reinstalls, or picks up a second phone, keeps the
 * history and streak they had.
 *
 * Its own Supabase client, deliberately. `lib/cms` reads content anonymously
 * and should keep doing so whatever happens here — a session leaking into that
 * client would change which RLS policies answer its queries, which is a lot of
 * blast radius for a feature nobody is required to use.
 *
 * Engagement, comments and push tokens stay keyed by device id. Signing in
 * *links* the device rather than re-keying anything, so a reader who has been
 * anonymous for months does not lose what they did — see `app_link_device` in
 * CMS migration 16.
 */

const URL = process.env.EXPO_PUBLIC_CMS_URL;
const KEY = process.env.EXPO_PUBLIC_CMS_ANON_KEY;

/** The AsyncStorage documents that make up "what this reader has done". */
const SYNCED_KEYS = [
  'dailymattr.local.v1',
  'dailymattr.progress.v1',
  'dailymattr.xp.v1',
  'dailymattr.topics.v1',
] as const;

export const auth: SupabaseClient | null =
  URL && KEY
    ? createClient(URL, KEY, {
        auth: {
          storage: AsyncStorage,
          persistSession: true,
          autoRefreshToken: true,
          // No URL to read a session out of — this is not a browser.
          detectSessionInUrl: false,
        },
      })
    : null;

export type ReaderAccount = {
  /** Null while signed out, which is the ordinary state. */
  email: string | null;
  userId: string | null;
  /** False until the stored session has been read back. */
  ready: boolean;
  /** Sends a six-digit code. */
  requestCode: (email: string) => Promise<void>;
  /** Exchanges the code for a session, then claims this device. */
  verifyCode: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<ReaderAccount>({
  email: null,
  userId: null,
  ready: true,
  requestCode: async () => {},
  verifyCode: async () => {},
  signOut: async () => {},
});

/* What this device has done, as one document.
 *
 * Read straight from AsyncStorage rather than from the store, so syncing does
 * not need the store to grow a serialisation API it has no other use for. The
 * store reads these same keys when it mounts, which is why a pull is followed
 * by a restart prompt rather than a live swap — rewriting them underneath a
 * running store would leave the two disagreeing until something happened to
 * re-read them. */
async function localSnapshot(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const pairs = await AsyncStorage.multiGet([...SYNCED_KEYS]);
  for (const [k, v] of pairs) {
    if (!v) continue;
    try {
      out[k] = JSON.parse(v);
    } catch {
      /* a corrupt document is not worth failing a sign-in over */
    }
  }
  return out;
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!auth);

  useEffect(() => {
    if (!auth) return;
    let alive = true;
    auth.auth
      .getSession()
      .then(({ data }) => {
        if (alive) setSession(data.session);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setReady(true);
      });

    const { data: sub } = auth.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  /* Claims the device and pushes what it has done.
     Best-effort on purpose: a reader who is signed in but whose sync failed is
     in a strictly better position than one who was refused a sign-in over it. */
  const claim = useCallback(async () => {
    if (!auth) return;
    try {
      const device = await getDeviceId();
      await auth.rpc('app_link_device', { p_device: device });

      const { data: remote } = await auth
        .from('reader_state')
        .select('payload')
        .maybeSingle();

      const local = await localSnapshot();
      const merged = { ...((remote?.payload as Record<string, unknown>) ?? {}), ...local };

      const { data: me } = await auth.auth.getUser();
      if (!me.user) return;
      await auth
        .from('reader_state')
        .upsert({ user_id: me.user.id, payload: merged, updated_at: new Date().toISOString() });
    } catch (e) {
      console.warn('[account] sync:', e instanceof Error ? e.message : e);
    }
  }, []);

  const value = useMemo<ReaderAccount>(
    () => ({
      email: session?.user?.email ?? null,
      userId: session?.user?.id ?? null,
      ready,
      requestCode: async (email: string) => {
        if (!auth) throw new Error('Accounts are unavailable right now.');
        const { error } = await auth.auth.signInWithOtp({
          email: email.trim().toLowerCase(),
          // A code, not a magic link: a link has to come back to the app
          // through a deep link, and a six-digit code works the same on every
          // build, including Expo Go.
          options: { shouldCreateUser: true },
        });
        if (error) throw new Error(error.message);
      },
      verifyCode: async (email: string, code: string) => {
        if (!auth) throw new Error('Accounts are unavailable right now.');
        const { error } = await auth.auth.verifyOtp({
          email: email.trim().toLowerCase(),
          token: code.trim(),
          type: 'email',
        });
        if (error) throw new Error(error.message);
        await claim();
      },
      signOut: async () => {
        if (!auth) return;
        /* Local data is deliberately left alone. Signing out is not "forget
           me" — the reader keeps reading on this device, and their library
           should still be there when they do. */
        await auth.auth.signOut();
      },
    }),
    [session, ready, claim],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAccount = (): ReaderAccount => useContext(Ctx);
