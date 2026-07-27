import React, { useCallback, useEffect, useState } from 'react';
import { View, TextInput, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import Animated from 'react-native-reanimated';
import { colors, font, radius, topicOf } from '@/theme';
import { useTheme } from '@/lib/theme';
import { Txt, Press, IconButton, LIcon } from '@/components/ui';
import { ArticleRow } from '@/components/cards';
import { searchSemantic, fetchTrending } from '@/lib/queries';
import { enterItem, enterChrome } from '@/lib/transitions';

const SUGGESTIONS = ['AI', 'Elections', 'Markets', 'Startups', 'Cricket', 'Space', 'EV'];
const RECENT_KEY = 'dailymattr.recent.v1';
const RECENT_MAX = 6;

export default function Search() {
  const { c, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 320);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY).then((v) => {
      if (v) {
        try {
          setRecent(JSON.parse(v));
        } catch {}
      }
    });
  }, []);

  // remember a term once it actually returned something worth keeping
  const remember = useCallback((term: string) => {
    const clean = term.trim();
    if (clean.length < 2) return;
    setRecent((prev) => {
      const next = [clean, ...prev.filter((r) => r.toLowerCase() !== clean.toLowerCase())].slice(0, RECENT_MAX);
      AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearRecent = () => {
    setRecent([]);
    AsyncStorage.removeItem(RECENT_KEY);
  };

  const { data: sr, isFetching } = useQuery({
    queryKey: ['search', q],
    queryFn: () => searchSemantic(q),
    enabled: q.length >= 2,
  });
  const data = sr?.results;

  useEffect(() => {
    if (q.length >= 2 && !isFetching && (data ?? []).length > 0) remember(q);
  }, [q, isFetching, data, remember]);

  const trending = useQuery({ queryKey: ['trending'], queryFn: () => fetchTrending(6) });

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 8 }}>
      <Animated.View entering={enterChrome()} style={s.bar}>
        <IconButton name="chevron-left" onPress={() => router.back()} />
        <View style={[s.inputWrap, { backgroundColor: c.bgSoft }]}>
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
          {isFetching ? (
            <ActivityIndicator size="small" color={c.brand} />
          ) : text.length > 0 ? (
            <Press onPress={() => setText('')} scaleTo={0.85} style={{ padding: 4 }}>
              <LIcon name="x" size={16} color={c.inkFaint} />
            </Press>
          ) : null}
        </View>
      </Animated.View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 16, paddingBottom: 24 }}>
        {q.length < 2 ? (
          <>
            {recent.length > 0 ? (
              <>
                <View style={s.sectionRow}>
                  <Txt size={13} weight="semibold" color={c.inkSoft} ls={0.4} style={{ textTransform: 'uppercase' }}>
                    Recent
                  </Txt>
                  <Press onPress={clearRecent} scaleTo={0.94} style={{ padding: 4 }}>
                    <Txt size={12.5} weight="semibold" color={c.brand}>
                      Clear
                    </Txt>
                  </Press>
                </View>
                {recent.map((r, i) => (
                  <Animated.View key={r} entering={enterItem(i)}>
                    <Press onPress={() => setText(r)} style={s.recentRow}>
                      <LIcon name="clock" size={15} color={c.inkFaint} />
                      <Txt size={14.5} weight="medium" color={c.ink} numberOfLines={1} style={{ flex: 1 }}>
                        {r}
                      </Txt>
                      <LIcon name="arrow-up-left" size={15} color={c.inkFaint} />
                    </Press>
                  </Animated.View>
                ))}
              </>
            ) : null}
            <Txt
              size={13}
              weight="semibold"
              color={c.inkSoft}
              ls={0.4}
              style={{ paddingHorizontal: 20, marginTop: recent.length ? 26 : 0, textTransform: 'uppercase' }}
            >
              Trending searches
            </Txt>
            <View style={s.chipsWrap}>
              {SUGGESTIONS.map((sugg, i) => (
                <Animated.View key={sugg} entering={enterItem(i)}>
                  <Press onPress={() => setText(sugg)} scaleTo={0.94} style={[s.suggChip, { backgroundColor: c.bgSoft }]}>
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
              <ArticleRow key={a.id} a={a} index={i} animate />
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
          (data ?? []).map((a, i) => <ArticleRow key={a.id} a={a} index={i} animate />)
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
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
