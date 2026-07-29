import { supabase } from './supabase';
import { cms, isCmsId, bareCmsId, CMS_PREFIX } from './cms';
import { getDeviceId } from './telemetry';

export type Comment = {
  id: string;
  parentId: string | null;
  deviceId: string;
  body: string;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
  replyCount: number;
};

type Row = {
  id: string;
  parent_id: string | null;
  device_id: string;
  body: string;
  created_at: string;
  like_count: number;
  liked_by_me: boolean;
  reply_count: number;
};

const shape = (r: Row): Comment => ({
  id: r.id,
  parentId: r.parent_id,
  deviceId: r.device_id,
  body: r.body,
  createdAt: r.created_at,
  likeCount: Number(r.like_count ?? 0),
  likedByMe: !!r.liked_by_me,
  replyCount: Number(r.reply_count ?? 0),
});

/* Every story has a thread now; which database holds it depends on who made
   the story.
 *
 * `app_comments` in DB A is keyed to the pipeline's own articles table, so a
 * CMS id could never go in it. This used to be handled by refusing: the panel
 * showed "No comments yet", which is an invitation, and then `addComment`
 * threw and the comment was gone. After the cutover most of the feed is CMS
 * content, so most comments went nowhere at all.
 *
 * CMS migration 13 is the other half — same row shape, same argument order, so
 * both sides map through `shape` and differ only in which client and which
 * function name. See supabase/migrations/13_content_comments.sql. */
/** Where a story's thread lives. Null when the CMS project isn't configured. */
function routeFor(articleId: string) {
  if (!isCmsId(articleId)) {
    return { db: supabase, id: articleId, cms: false as const };
  }
  return cms ? { db: cms, id: bareCmsId(articleId), cms: true as const } : null;
}

export async function fetchComments(articleId: string, limit = 120): Promise<Comment[]> {
  const r = routeFor(articleId);
  if (!r) return [];
  const device = await getDeviceId();
  const { data, error } = r.cms
    ? await r.db.rpc('app_content_comments_for', {
        p_content: r.id,
        p_device: device,
        p_limit: limit,
      })
    : await r.db.rpc('app_comments_for', {
        p_article: r.id,
        p_device: device,
        p_limit: limit,
      });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(shape);
}

export async function addComment(
  articleId: string,
  body: string,
  parentId?: string | null,
): Promise<Comment> {
  const r = routeFor(articleId);
  if (!r) throw new Error('Comments are unavailable right now');
  const device = await getDeviceId();
  const { data, error } = r.cms
    ? await r.db.rpc('app_add_content_comment', {
        p_device: device,
        p_content: r.id,
        p_body: body,
        p_parent: parentId ?? null,
      })
    : await r.db.rpc('app_add_comment', {
        p_device: device,
        p_article: r.id,
        p_body: body,
        p_parent: parentId ?? null,
      });
  if (error) throw error;
  const row = (data as Row[])?.[0];
  if (!row) throw new Error('Comment was not saved');
  return shape(row);
}

/* Takes the story as well as the comment.
 *
 * A comment id is a uuid from one of two projects and does not say which, so
 * liking one needs the story it hangs off to know where to send the toggle. */
export async function toggleCommentLike(
  commentId: string,
  articleId: string,
): Promise<{ liked: boolean; likeCount: number }> {
  const r = routeFor(articleId);
  if (!r) throw new Error('Comments are unavailable right now');
  const device = await getDeviceId();
  const { data, error } = await r.db.rpc(
    r.cms ? 'app_toggle_content_comment_like' : 'app_toggle_comment_like',
    { p_device: device, p_comment: commentId },
  );
  if (error) throw error;
  const row = (data as { liked: boolean; like_count: number }[])?.[0];
  return { liked: !!row?.liked, likeCount: Number(row?.like_count ?? 0) };
}

/* Counts for a mixed list, which is what a feed always is.
 *
 * Split by origin, asked of both projects at once, and keyed back to the ids
 * the caller passed — the CMS side answers in bare uuids, so the prefix goes
 * back on before returning or the feed looks up a key that isn't there. */
export async function fetchCommentCounts(ids: string[]): Promise<Record<string, number>> {
  const pipeline = ids.filter((id) => !isCmsId(id));
  const cmsIds = ids.filter(isCmsId);
  const out: Record<string, number> = {};

  const [a, b] = await Promise.all([
    pipeline.length
      ? supabase.rpc('app_comment_counts', { p_ids: pipeline })
      : Promise.resolve({ data: [], error: null }),
    cms && cmsIds.length
      ? cms.rpc('app_content_comment_counts', { p_ids: cmsIds.map(bareCmsId) })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (a.error) throw a.error;
  for (const r of (a.data ?? []) as { article_id: string; n: number }[]) {
    out[r.article_id] = Number(r.n);
  }

  /* A CMS outage should not take the pipeline's counts down with it — the
     thread still opens, it just shows no badge until the next refetch. */
  if (b.error) {
    console.warn('[comments] cms counts unavailable:', b.error.message);
  } else {
    for (const r of (b.data ?? []) as { content_id: string; n: number }[]) {
      out[CMS_PREFIX + r.content_id] = Number(r.n);
    }
  }

  return out;
}

/* Roots first, each followed by its own replies oldest-first — the shape the
   list actually renders, worked out once here rather than per frame. */
export function threadOf(all: Comment[]): { comment: Comment; isReply: boolean }[] {
  const roots = all.filter((c) => !c.parentId);
  const repliesBy = new Map<string, Comment[]>();
  for (const c of all) {
    if (!c.parentId) continue;
    const list = repliesBy.get(c.parentId) ?? [];
    list.push(c);
    repliesBy.set(c.parentId, list);
  }
  const out: { comment: Comment; isReply: boolean }[] = [];
  // newest conversation at the top, replies underneath in the order written
  for (const r of roots.slice().reverse()) {
    out.push({ comment: r, isReply: false });
    for (const rep of repliesBy.get(r.id) ?? []) out.push({ comment: rep, isReply: true });
  }
  return out;
}

// Stable, friendly label for an anonymous device — no accounts in this app, but
// a thread reads badly when everyone is "Anonymous".
const ADJECTIVES = ['Quiet', 'Curious', 'Sharp', 'Calm', 'Bright', 'Steady', 'Keen', 'Swift'];
const NOUNS = ['Reader', 'Owl', 'Falcon', 'Otter', 'Heron', 'Fox', 'Crane', 'Lark'];

export function nameFor(deviceId: string): string {
  let h = 0;
  for (let i = 0; i < deviceId.length; i++) h = (h * 31 + deviceId.charCodeAt(i)) >>> 0;
  // >>> not >>: a signed shift turns any hash past 2^31 negative, which indexes
  // off the front of the array and yields "Curious undefined"
  return `${ADJECTIVES[h % ADJECTIVES.length]} ${NOUNS[(h >>> 5) % NOUNS.length]}`;
}
