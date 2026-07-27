import React, { useMemo, useState } from 'react';
import { View, TextInput, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Animated from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { radius } from '@/theme';
import { useTheme } from '@/lib/theme';
import { Txt, Press, LIcon } from './ui';
import {
  fetchComments,
  addComment,
  toggleCommentLike,
  threadOf,
  nameFor,
  type Comment,
} from '@/lib/comments';
import { timeAgo } from '@/lib/content';
import { soft, tick } from '@/lib/haptics';
import { enterContent, enterItem, enterChrome } from '@/lib/transitions';

/* Takes the place of the summary when the comment button is tapped: the story
   text steps aside, the thread steps in, and the card never leaves the deck. */
export function CommentsPanel({ articleId, onClose }: { articleId: string; onClose: () => void }) {
  const { c, isDark } = useTheme();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);

  const key = ['comments', articleId];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => fetchComments(articleId) });

  const rows = useMemo(() => threadOf(data ?? []), [data]);

  const post = useMutation({
    mutationFn: (body: string) => addComment(articleId, body, replyTo?.id ?? null),
    onSuccess: (created) => {
      setText('');
      setReplyTo(null);
      soft();
      qc.setQueryData<Comment[]>(key, (prev) => [...(prev ?? []), created]);
      qc.invalidateQueries({ queryKey: ['commentCounts'] });
    },
  });

  const like = useMutation({
    mutationFn: (id: string) => toggleCommentLike(id),
    // flip it under the thumb; the server's number replaces it on return
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Comment[]>(key);
      qc.setQueryData<Comment[]>(key, (old) =>
        (old ?? []).map((x) =>
          x.id === id
            ? { ...x, likedByMe: !x.likedByMe, likeCount: x.likeCount + (x.likedByMe ? -1 : 1) }
            : x,
        ),
      );
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSuccess: (res, id) => {
      qc.setQueryData<Comment[]>(key, (old) =>
        (old ?? []).map((x) => (x.id === id ? { ...x, likedByMe: res.liked, likeCount: res.likeCount } : x)),
      );
    },
  });

  const send = () => {
    const body = text.trim();
    if (!body || post.isPending) return;
    post.mutate(body);
  };

  const line = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(11,13,18,0.08)';
  const field = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(11,13,18,0.05)';
  const total = data?.length ?? 0;

  return (
    <Animated.View entering={enterContent()} style={{ flex: 1 }}>
      <View style={[s.head, { borderBottomColor: line }]}>
        <Txt size={14} weight="bold" ls={-0.2}>
          Comments{total ? ` · ${total}` : ''}
        </Txt>
        <Press
          haptic={false}
          onPress={() => {
            tick();
            onClose();
          }}
          scaleTo={0.88}
          style={[s.close, { backgroundColor: field }]}
        >
          <LIcon name="x" size={14} color={c.ink} strokeWidth={2.4} />
        </Press>
      </View>

      {isLoading ? (
        <View style={s.centre}>
          <ActivityIndicator color={c.brand} />
        </View>
      ) : rows.length === 0 ? (
        <Animated.View entering={enterChrome()} style={s.centre}>
          <LIcon name="message-circle" size={22} color={c.inkFaint} />
          <Txt size={13.5} weight="semibold" color={c.inkSoft} style={{ marginTop: 8 }}>
            No comments yet
          </Txt>
          <Txt size={12} weight="medium" color={c.inkFaint} style={{ marginTop: 2 }}>
            Start the conversation.
          </Txt>
        </Animated.View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingVertical: 8 }}>
          {rows.map(({ comment: x, isReply }, i) => (
            <Animated.View
              key={x.id}
              entering={enterItem(i)}
              style={[s.row, isReply ? { paddingLeft: 34 } : null]}
            >
              <LinearGradient
                colors={[c.brandLight, c.brand]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[s.avatar, isReply ? s.avatarSmall : null]}
              >
                <Txt size={isReply ? 9.5 : 11} weight="bold" color="#fff">
                  {nameFor(x.deviceId).slice(0, 1)}
                </Txt>
              </LinearGradient>

              <View style={{ flex: 1 }}>
                <Txt size={isReply ? 13 : 13.5} lh={isReply ? 18.5 : 19} color={c.ink}>
                  <Txt size={isReply ? 13 : 13.5} weight="bold" color={c.ink}>
                    {nameFor(x.deviceId)}
                  </Txt>
                  {'  '}
                  {x.body}
                </Txt>
                <View style={s.metaRow}>
                  <Txt size={11} weight="medium" color={c.inkFaint}>
                    {timeAgo(x.createdAt)}
                  </Txt>
                  {x.likeCount > 0 ? (
                    <Txt size={11} weight="semibold" color={c.inkFaint}>
                      {x.likeCount} {x.likeCount === 1 ? 'like' : 'likes'}
                    </Txt>
                  ) : null}
                  <Press
                    haptic={false}
                    hitSlop={10}
                    onPress={() => {
                      tick();
                      // replying to a reply is fine — the server threads it
                      // under that reply's root, so nesting stays one deep
                      setReplyTo(x);
                    }}
                    scaleTo={0.94}
                    style={{ paddingVertical: 4 }}
                  >
                    <Txt size={11} weight="bold" color={c.inkSoft}>
                      Reply
                    </Txt>
                  </Press>
                </View>
              </View>

              <Press
                haptic={false}
                hitSlop={12}
                onPress={() => {
                  tick();
                  like.mutate(x.id);
                }}
                scaleTo={0.85}
                style={s.heart}
              >
                <LIcon
                  name="heart"
                  size={14}
                  color={x.likedByMe ? c.breaking : c.inkFaint}
                  fill={x.likedByMe ? c.breaking : 'none'}
                />
              </Press>
            </Animated.View>
          ))}
        </ScrollView>
      )}

      {replyTo ? (
        <Animated.View entering={enterChrome()} style={[s.replyBar, { backgroundColor: field }]}>
          <Txt size={11.5} weight="medium" color={c.inkSoft} numberOfLines={1} style={{ flex: 1 }}>
            Replying to <Txt size={11.5} weight="bold" color={c.ink}>{nameFor(replyTo.deviceId)}</Txt>
          </Txt>
          <Press haptic={false} onPress={() => setReplyTo(null)} scaleTo={0.88} style={{ padding: 3 }}>
            <LIcon name="x" size={13} color={c.inkSoft} strokeWidth={2.4} />
          </Press>
        </Animated.View>
      ) : null}

      <View style={[s.composer, { borderTopColor: line }]}>
        <View style={[s.field, { backgroundColor: field }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={replyTo ? `Reply to ${nameFor(replyTo.deviceId)}…` : 'Add a comment…'}
            placeholderTextColor={c.inkFaint}
            style={[s.input, { color: c.ink }]}
            maxLength={600}
            returnKeyType="send"
            onSubmitEditing={send}
          />
        </View>
        <Press haptic={false} onPress={send} scaleTo={0.9} style={[s.send, { backgroundColor: text.trim() ? c.brand : field }]}>
          {post.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <LIcon name="arrow-up" size={16} color={text.trim() ? '#fff' : c.inkFaint} strokeWidth={2.5} />
          )}
        </Press>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  close: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 10, paddingVertical: 7, alignItems: 'flex-start' },
  avatar: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  avatarSmall: { width: 21, height: 21, borderRadius: 11 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 3 },
  heart: { paddingTop: 2, paddingLeft: 8, paddingRight: 2, paddingBottom: 8 },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.sm,
    paddingHorizontal: 11,
    paddingVertical: 7,
    marginBottom: 8,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  field: { flex: 1, borderRadius: radius.pill, paddingHorizontal: 14, height: 38, justifyContent: 'center' },
  input: { fontSize: 14, fontFamily: 'Inter_400Regular', padding: 0 },
  send: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
