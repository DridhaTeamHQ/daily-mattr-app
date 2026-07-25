import { supabase } from './supabase';
import { getDeviceId } from './telemetry';

export type Comment = {
  id: string;
  deviceId: string;
  body: string;
  createdAt: string;
};

type Row = { id: string; device_id: string; body: string; created_at: string };

const shape = (r: Row): Comment => ({
  id: r.id,
  deviceId: r.device_id,
  body: r.body,
  createdAt: r.created_at,
});

export async function fetchComments(articleId: string, limit = 50): Promise<Comment[]> {
  const { data, error } = await supabase.rpc('app_comments_for', {
    p_article: articleId,
    p_limit: limit,
  });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(shape);
}

export async function addComment(articleId: string, body: string): Promise<Comment> {
  const device = await getDeviceId();
  const { data, error } = await supabase.rpc('app_add_comment', {
    p_device: device,
    p_article: articleId,
    p_body: body,
  });
  if (error) throw error;
  const row = (data as Row[])?.[0];
  if (!row) throw new Error('Comment was not saved');
  return shape(row);
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
