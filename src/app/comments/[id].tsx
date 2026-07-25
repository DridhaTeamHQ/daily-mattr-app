import React, { useState } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { radius } from '@/theme';
import { useTheme } from '@/lib/theme';
import { Txt, Press, IconButton, LIcon, LogoLoader } from '@/components/ui';
import { fetchComments, addComment, nameFor, type Comment } from '@/lib/comments';
import { timeAgo } from '@/lib/content';
import { soft, tick } from '@/lib/haptics';

export default function Comments() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const [text, setText] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['comments', id],
    queryFn: () => fetchComments(id!),
    enabled: !!id,
  });

  const post = useMutation({
    mutationFn: (body: string) => addComment(id!, body),
    onSuccess: (created) => {
      setText('');
      soft();
      // drop it straight into the cache so the thread updates without a refetch
      qc.setQueryData<Comment[]>(['comments', id], (prev) => [created, ...(prev ?? [])]);
      qc.invalidateQueries({ queryKey: ['commentCount', id] });
    },
  });

  const send = () => {
    const body = text.trim();
    if (!body || post.isPending) return;
    post.mutate(body);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[s.bar, { paddingTop: insets.top + 8, borderBottomColor: c.divider }]}>
        <IconButton name="chevron-left" onPress={() => router.back()} />
        <Txt size={16.5} weight="bold" ls={-0.3} style={{ flex: 1 }}>
          Comments
        </Txt>
        {data?.length ? (
          <Txt size={13} weight="semibold" color={c.inkSoft}>
            {data.length}
          </Txt>
        ) : null}
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <LogoLoader />
        </View>
      ) : error ? (
        <View style={s.empty}>
          <LIcon name="cloud-off" size={28} color={c.inkFaint} />
          <Txt size={14.5} weight="semibold" color={c.inkSoft} style={{ marginTop: 12 }}>
            Couldn&apos;t load comments
          </Txt>
        </View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(x) => x.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingVertical: 12, flexGrow: 1 }}
          ListEmptyComponent={
            <View style={s.empty}>
              <LinearGradient colors={[c.brandLight, c.brand]} style={s.emptyIcon}>
                <LIcon name="message-circle" size={22} color="#fff" />
              </LinearGradient>
              <Txt size={15.5} weight="bold" style={{ marginTop: 16 }}>
                No comments yet
              </Txt>
              <Txt size={13} weight="medium" color={c.inkSoft} style={{ marginTop: 5, textAlign: 'center', maxWidth: 250 }}>
                Be the first to say something about this story.
              </Txt>
            </View>
          }
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 40).springify().damping(30).stiffness(250).mass(0.9)}>
              <View style={s.row}>
                <LinearGradient colors={[c.brandLight, c.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.avatar}>
                  <Txt size={12.5} weight="bold" color="#fff">
                    {nameFor(item.deviceId).slice(0, 1)}
                  </Txt>
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    <Txt size={13.5} weight="bold">
                      {nameFor(item.deviceId)}
                    </Txt>
                    <Txt size={11.5} weight="medium" color={c.inkFaint}>
                      {timeAgo(item.createdAt)}
                    </Txt>
                  </View>
                  <Txt size={14.5} lh={21} color={c.ink} style={{ marginTop: 4 }}>
                    {item.body}
                  </Txt>
                </View>
              </View>
            </Animated.View>
          )}
        />
      )}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[s.composer, { paddingBottom: Math.max(insets.bottom, 12), borderTopColor: c.divider }]}>
          <View style={[s.inputWrap, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF1F6' }]}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Add a comment…"
              placeholderTextColor={c.inkFaint}
              style={[s.input, { color: c.ink }]}
              multiline
              maxLength={600}
              onSubmitEditing={send}
            />
          </View>
          <Press
            haptic={false}
            onPress={() => {
              tick();
              send();
            }}
            scaleTo={0.9}
            style={[s.send, { backgroundColor: text.trim() ? c.brand : isDark ? 'rgba(255,255,255,0.1)' : '#E3E8F0' }]}
          >
            {post.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <LIcon name="arrow-up" size={18} color={text.trim() ? '#fff' : c.inkFaint} strokeWidth={2.4} />
            )}
          </Press>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { alignItems: 'center', justifyContent: 'center', flex: 1, paddingVertical: 60 },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputWrap: {
    flex: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxHeight: 120,
  },
  input: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    maxHeight: 100,
  },
  send: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
