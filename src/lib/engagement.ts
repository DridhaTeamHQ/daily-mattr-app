import { cms, isCmsId, bareCmsId } from './cms';
import { getDeviceId } from './telemetry';

/* Engagement on the desk's own content.
 *
 * The app's behavioural telemetry lives in DB A, and `app_events.article_id`
 * is a uuid with a foreign key into that project's `articles` table — so a CMS
 * id cannot go in it. Every like, share and save on a Pix or a Qix was being
 * dropped on the floor (see `pipelineIdOnly` in lib/telemetry), which is why
 * the Studio had no numbers to show for the work it publishes.
 *
 * This is the other half. Two RPCs in DB B, both security-definer, because the
 * reader is anonymous and anonymous clients do not get to write to tables
 * directly. See supabase/migrations/10_engagement.sql in the CMS repo.
 *
 * Everything here is fire-and-forget. A reader tapping a heart has already
 * seen it fill; if the write fails, the worst outcome is a number being one
 * lower on a dashboard, and that is not worth an error in front of them.
 */

export type Reaction = 'like' | 'dislike' | 'save';
export type ContentEvent = 'view' | 'share' | 'comment_open' | 'open_source';

/* No 'comment' here on purpose.
 *
 * It was briefly sent from the comments panel, which meant the desk's count
 * started at whenever a build shipped and drifted from the thread whenever one
 * was deleted. `app_comments` in DB A already holds the answer, and the Studio
 * reads it through `app_comment_counts` — one number, from the table that owns
 * it, including everything written before any of this existed.
 *
 * The kind is still accepted by the database (CMS migration 12), so nothing
 * breaks if an older build is still out there sending it. */

/* Reported once per reason rather than once per call, like lib/cms. A missing
   table — the migration not yet applied — would otherwise log on every tap. */
const warned = new Set<string>();
function warnOnce(reason: string, detail: string) {
  if (warned.has(reason)) return;
  warned.add(reason);
  console.warn(`[engagement] ${reason}: ${detail}`);
}

export type StatsSource = 'cms' | 'pipeline';
type Target = { id: string; source: StatsSource };

/* The RPCs take a uuid, so anything that isn't one would come back as a 400
   rather than being ignored. Pipeline ids are uuids from DB A; a malformed one
   means we built the id wrong somewhere, and dropping it here keeps that from
   turning into a warning on every tap. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* Both worlds count now.
 *
 * Engagement used to stop at CMS content, because `content_reactions` had a
 * foreign key into `content_items` and a NewsStudio id could not satisfy it —
 * so every like on a pipeline article was discarded right here. Migration 11
 * replaced that key with a `source` column, and the desk's guard moved to
 * `article_selections`: an article nobody approved still records nothing, it
 * just gets refused at the database rather than in this file. */
const target = (articleId: string): Target | null => {
  if (isCmsId(articleId)) {
    const id = bareCmsId(articleId);
    return UUID_RE.test(id) ? { id, source: 'cms' } : null;
  }
  return UUID_RE.test(articleId) ? { id: articleId, source: 'pipeline' } : null;
};

/**
 * Records a reaction, or removes it. `on` is the state the reader ended up in
 * rather than "flip it", so a retry lands on the same answer instead of
 * undoing itself.
 */
export async function react(articleId: string, kind: Reaction, on: boolean): Promise<void> {
  const t = target(articleId);
  if (!cms || !t) return;
  try {
    const { error } = await cms.rpc('app_react', {
      p_content: t.id,
      p_device: await getDeviceId(),
      p_kind: kind,
      p_on: on,
      p_source: t.source,
    });
    if (error) warnOnce('react unavailable', error.message);
  } catch (e) {
    warnOnce('react unreachable', String((e as Error)?.message ?? e));
  }
}

/** Records something that happened. Append-only; the same thing twice counts twice. */
export async function trackContent(articleId: string, kind: ContentEvent): Promise<void> {
  const t = target(articleId);
  if (!cms || !t) return;
  try {
    const { error } = await cms.rpc('app_track_content', {
      p_content: t.id,
      p_device: await getDeviceId(),
      p_kind: kind,
      p_source: t.source,
    });
    if (error) warnOnce('event unavailable', error.message);
  } catch (e) {
    warnOnce('event unreachable', String((e as Error)?.message ?? e));
  }
}

/* One view per item per session.
 *
 * A card the reader swipes back past is not a second view, and a deck that
 * keeps a window of pages mounted would otherwise report a view for cards
 * nobody stopped on. Matches how lib/telemetry treats impressions. */
const viewed = new Set<string>();
export function trackView(articleId: string): void {
  if (viewed.has(articleId)) return;
  viewed.add(articleId);
  void trackContent(articleId, 'view');
}
