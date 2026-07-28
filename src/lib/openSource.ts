import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { track } from './telemetry';
import type { Article } from './content';

/* Opening a publisher's page, without it being able to crash the app.
 *
 * `openBrowserAsync` REJECTS rather than returning a result when Android has no
 * activity able to handle the intent — a device with no browser installed, some
 * emulators, and a work profile that blocks it. Nothing was awaiting it, so the
 * rejection surfaced as `Uncaught (in promise)` and repeated on every tap.
 *
 * There is also a second, quieter case now that the CMS is connected: a CMS
 * item whose `source_links` is empty maps to an empty url. Handing "" to the
 * browser fails in exactly the same way, so the guard has to run before the
 * call rather than inside the catch.
 */

const OPENABLE = /^https?:\/\/\S+$/i;

/** Whether this story has somewhere to send the reader at all. */
export function hasSource(a: Pick<Article, 'url'>): boolean {
  return OPENABLE.test((a.url ?? '').trim());
}

/**
 * Opens the publisher's page in the in-app browser, falling back to the system
 * handler, and giving up quietly if neither exists. Safe to call unawaited.
 */
export async function openSource(a: Pick<Article, 'id' | 'url' | 'topic'>): Promise<void> {
  const url = (a.url ?? '').trim();
  if (!OPENABLE.test(url)) return;

  track({ article_id: a.id, event_type: 'open_full', topic: a.topic });

  try {
    await WebBrowser.openBrowserAsync(url);
  } catch {
    // No in-app browser activity. The system handler is a different intent and
    // often still resolves, so it is worth one attempt before giving up.
    try {
      await Linking.openURL(url);
    } catch {
      // Nothing on this device can open a link. Failing silently is right:
      // there is no action the reader could take to fix it.
    }
  }
}
