import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { Query } from '@tanstack/react-query';

/* Warm-start cache, bounded.

   On Android AsyncStorage is SQLite, and SQLite reads through a CursorWindow
   with a hard 2MB limit **per row**. The persister writes the whole react-query
   cache as a single row, so once the app had been used for a while the row
   outgrew the window and every cold start failed with:

     Row too big to fit into CursorWindow requiredPos=0, totalRows=1

   react-query caught that and threw the cache away, so the app still worked —
   but the warm start it exists for never happened again, and the error was
   logged on every launch.

   Two things were filling it, and neither belongs in a warm-start cache:

     'article'    selects raw_content — 5KB of body text per story, kept for
                  24h for *every* article ever opened
     'morePages'  an infinite query; each "More stories" tap appends another
                  page to one entry, with no bound at all

   Neither makes the first screen paint faster: opening an article always
   fetches fresh, and nobody cold-starts onto page 7 of the feed. */

/* What is worth restoring: the queries behind the first screen a reader sees.
   Everything else refetches on demand, which is what it did anyway — the
   persisted copy was only ever costing space. */
const PERSISTED = new Set(['forYou', 'readerFeed', 'topical', 'trending', 'breakingTop']);

export function shouldPersist(query: Query): boolean {
  return query.state.status === 'success' && PERSISTED.has(String(query.queryKey[0]));
}

/* Well under SQLite's 2MB so there is room for the row's own overhead and for
   a feed that runs long. The allowlist above should keep the real figure near
   200-400KB; this is the backstop for the day someone adds a key to it without
   thinking about size. */
const MAX_CHARS = 1_200_000;

/* A new key, so the oversized row already sitting on every existing install is
   never read — reading it is the thing that throws. It is deleted below by
   name instead, which needs no read. */
const KEY = 'dailymattr.rq.v3';
const LEGACY_KEYS = ['REACT_QUERY_OFFLINE_CACHE', 'dailymattr.rq.v2'];

/* Refuse to write a row that cannot be read back.

   The check lives in `serialize` rather than wrapping `persistClient` for a
   reason: react-query calls persistClient on every cache change — several
   times a second while a feed is paging in — whereas serialize runs inside the
   throttle, so the cache is measured when it is actually written and not once
   per query update. Wrapping persistClient meant a 200KB+ JSON.stringify on
   the JS thread mid-scroll, which is precisely the kind of cost the rest of
   this work has been removing.

   Over budget it writes an empty cache instead of a truncated one. Restoring
   nothing is a cold start, which is correct and quiet; restoring half a cache
   is a feed with holes in it. */
export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: KEY,
  throttleTime: 2000,
  serialize: (client) => {
    const json = JSON.stringify(client);
    if (json.length <= MAX_CHARS) return json;
    return JSON.stringify({ ...client, clientState: { ...client.clientState, queries: [], mutations: [] } });
  },
});

/* Drop superseded caches.

   Runs here rather than being exported for app/_layout.tsx to call: this file
   owns the keys, so the cleanup belongs beside them, and a module-scope call in
   the router's root layout re-executes on every Fast Refresh — which is how
   this surfaced as `ReferenceError: Property 'dropLegacyCache' doesn't exist`
   the first time a hot update landed before the new module was registered.

   Deleting by name needs no read, so it cannot hit the CursorWindow error that
   reading an oversized row does.

   v3 is a deliberate break, not a bug fix: the content source changed, so a
   device holding a warm cache of pipeline-only stories would show them for a
   day before they aged out — including any story the desk has since corrected
   or never approved. Dropping the cache means the first launch after this
   update reads the feed fresh from the current source. */
LEGACY_KEYS.forEach((k) => {
  AsyncStorage.removeItem(k).catch(() => {});
});
