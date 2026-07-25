import { supabase } from './supabase';
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

export async function fetchComments(articleId: string, limit = 120): Promise<Comment[]> {
  const device = await getDeviceId();
  const { data, error } = await supabase.rpc('app_comments_for', {
    p_article: articleId,
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
  const device = await getDeviceId();
  const { data, error } = await supabase.rpc('app_add_comment', {
    p_device: device,
    p_article: articleId,
    p_body: body,
    p_parent: parentId ?? null,
  });
  if (error) throw error;
  const row = (data as Row[])?.[0];
  if (!row) throw new Error('Comment was not saved');
  return shape(row);
}

export async function toggleCommentLike(
  commentId: string,
): Promise<{ liked: boolean; likeCount: number }> {
  const device = await getDeviceId();
  const { data, error } = await supabase.rpc('app_toggle_comment_like', {
    p_device: device,
    p_comment: commentId,
  });
  if (error) throw error;
  const row = (data as { liked: boolean; like_count: number }[])?.[0];
  return { liked: !!row?.liked, likeCount: Number(row?.like_count ?? 0) };
}

export async function fetchCommentCounts(ids: string[]): Promise<Record<string, number>> {
  if (!ids.length) return {};
  const { data, error } = await supabase.rpc('app_comment_counts', { p_ids: ids });
  if (error) throw error;
  const out: Record<string, number> = {};
  for (const r of (data ?? []) as { article_id: string; n: number }[]) {
    out[r.article_id] = Number(r.n);
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
