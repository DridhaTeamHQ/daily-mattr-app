import React, { useEffect, useState } from 'react';
import { View, TextInput, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { colors, font, radius, topicOf } from '@/theme';
import { useTheme } from '@/lib/theme';
import { Txt, Press, IconButton, LIcon } from '@/components/ui';
import { ArticleRow } from '@/components/cards';
import { searchArticles, fetchTrending } from '@/lib/queries';

const SUGGESTIONS = ['AI', 'Elections', 'Markets', 'Startups', 'Cricket', 'Space', 'EV'];

export default function Search() {
  const { c, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 320);
    return () => clearTimeout(t);
  }, [text]);

  const { data, isFetching } = useQuery({
    queryKey: ['search', q],
    queryFn: () => searchArticles(q),
    enabled: q.length >= 2,
  });

  const trending = useQuery({ queryKey: ['trending'], queryFn: () => fetchTrending(6) });

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 8 }}>
      <Animated.View entering={FadeIn.duration(300)} style={s.bar}>
        <IconButton name="chevron-left" onPress={() => router.back()} />
        <View style={[s.inputWrap, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF1F6' }]}>
          <LIcon name="search" size={17} color={c.inkFaint} />
          <TextInput
            autoFocus
            value={text}
            onChangeText={setText}
            placeholder="Search stories, topics…"
            placeholderTextColor={c.inkFaint}
            style={[s.input, { color: c.ink }]}
            returnKeyType="search"
          />
          {isFetching ? <ActivityIndicator size="small" color={c.brand} /> : null}
        </View>
      </Animated.View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 16, paddingBottom: 24 }}>
        {q.length < 2 ? (
          <>
            <Txt size={13} weight="semibold" color={c.inkSoft} ls={0.4} style={{ paddingHorizontal: 20, textTransform: 'uppercase' }}>
              Trending searches
            </Txt>
            <View style={s.chipsWrap}>
              {SUGGESTIONS.map((sugg, i) => (
                <Animated.View key={sugg} entering={FadeInDown.delay(i * 50)}>
                  <Press onPress={() => setText(sugg)} scaleTo={0.94} style={[s.suggChip, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF1F6' }]}>
                    <LIcon name="trending-up" size={13} color={c.brand} />
                    <Txt size={13} weight="semibold" color={c.ink}>
                      {sugg}
                    </Txt>
                  </Press>
                </Animated.View>
              ))}
            </View>
            <Txt size={13} weight="semibold" color={c.inkSoft} ls={0.4} style={{ paddingHorizontal: 20, marginTop: 26, marginBottom: 6, textTransform: 'uppercase' }}>
              Popular right now
            </Txt>
            {(trending.data ?? []).map((a, i) => (
              <ArticleRow key={a.id} a={a} index={i} />
            ))}
          </>
        ) : !isFetching && (data ?? []).length === 0 ? (
          <View style={{ alignItems: 'center', marginTop: 70 }}>
            <LIcon name="search" size={30} color={c.inkFaint} />
            <Txt size={14.5} weight="medium" color={c.inkSoft} style={{ marginTop: 12 }}>
              No stories found for “{q}”.
            </Txt>
          </View>
        ) : (
          (data ?? []).map((a, i) => <ArticleRow key={a.id} a={a} index={i} />)
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSoft,
    borderRadius: radius.pill,
    
    
    paddingHorizontal: 14,
    height: 46,
    marginRight: 8,
  },
  input: {
    flex: 1,
    marginLeft: 8,
    fontFamily: font.regular,
    fontSize: 15,
    color: colors.ink,
    paddingVertical: 0,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 20,
    marginTop: 12,
  },
  suggChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.bgSoft,
    
    
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    height: 38,
  },
});
