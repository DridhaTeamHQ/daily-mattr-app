import React, { useState } from 'react';
import { View, TextInput, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { radius } from '@/theme';
import { useTheme } from '@/lib/theme';
import { Txt, Press, LIcon } from './ui';
import { fetchComments, addComment, nameFor, type Comment } from '@/lib/comments';
import { timeAgo } from '@/lib/content';
import { soft, tick } from '@/lib/haptics';

/* Takes the place of the summary when the comment button is tapped: the story
   text steps aside, the thread steps in, and the card never leaves the deck. */
export function CommentsPanel({ articleId, onClose }: { articleId: string; onClose: () => void }) {
  const { c, isDark } = useTheme();
  const qc = useQueryClient();
  const [text, setText] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['comments', articleId],
    queryFn: () => fetchComments(articleId),
  });

  const post = useMutation({
    mutationFn: (body: string) => addComment(articleId, body),
    onSuccess: (created) => {
      setText('');
      soft();
      qc.setQueryData<Comment[]>(['comments', articleId], (prev) => [created, ...(prev ?? [])]);
      qc.invalidateQueries({ queryKey: ['commentCounts'] });
    },
  });

  const send = () => {
    const body = text.trim();
    if (!body || post.isPending) return;
    post.mutate(body);
  };

  const line = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(11,13,18,0.08)';
  const field = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(11,13,18,0.05)';

  return (
    <Animated.View entering={FadeInDown.duration(260).springify().damping(30).stiffness(260).mass(0.8)} style={{ flex: 1 }}>
      <View style={[s.head, { borderBottomColor: line }]}>
        <Txt size={14} weight="bold" ls={-0.2}>
          Comments{data?.length ? ` · ${data.length}` : ''}
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
      ) : (data ?? []).length === 0 ? (
        <Animated.View entering={FadeIn.duration(240)} style={s.centre}>
          <LIcon name="message-circle" size={22} color={c.inkFaint} />
          <Txt size={13.5} weight="semibold" color={c.inkSoft} style={{ marginTop: 8 }}>
            No comments yet
          </Txt>
          <Txt size={12} weight="medium" color={c.inkFaint} style={{ marginTop: 2 }}>
            Start the conversation.
          </Txt>
        </Animated.View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingVertical: 10 }}
        >
          {(data ?? []).map((item, i) => (
            <Animated.View
              key={item.id}
              entering={FadeInDown.delay(Math.min(i, 6) * 35).springify().damping(30).stiffness(250).mass(0.9)}
              style={s.row}
            >
              <LinearGradient colors={[c.brandLight, c.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.avatar}>
                <Txt size={11} weight="bold" color="#fff">
                  {nameFor(item.deviceId).slice(0, 1)}
                </Txt>
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Txt size={13.5} lh={19} color={c.ink}>
                  <Txt size={13.5} weight="bold" color={c.ink}>
                    {nameFor(item.deviceId)}
                  </Txt>
                  {'  '}
                  {item.body}
                </Txt>
                <Txt size={11} weight="medium" color={c.inkFaint} style={{ marginTop: 3 }}>
                  {timeAgo(item.createdAt)}
                </Txt>
              </View>
            </Animated.View>
          ))}
        </ScrollView>
      )}

      <View style={[s.composer, { borderTopColor: line }]}>
        <View style={[s.field, { backgroundColor: field }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Add a comment…"
            placeholderTextColor={c.inkFaint}
            style={[s.input, { color: c.ink }]}
            maxLength={600}
            returnKeyType="send"
            onSubmitEditing={send}
          />
        </View>
        <Press
          haptic={false}
          onPress={send}
          scaleTo={0.9}
          style={[s.send, { backgroundColor: text.trim() ? c.brand : field }]}
        >
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
  close: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 10, paddingVertical: 7 },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  field: {
    flex: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    height: 38,
    justifyContent: 'center',
  },
  input: { fontSize: 14, fontFamily: 'Inter_400Regular', padding: 0 },
  send: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
