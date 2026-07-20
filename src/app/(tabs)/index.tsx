import React, { useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { shadow } from '@/theme';
import { useTheme } from '@/lib/theme';
import { Txt, Overline, IconButton, CategoryTab, SectionHeader, Shimmer } from '@/components/ui';
import { TopStoryCard, ArticleRow, RecommendCard, TrendingRow } from '@/components/cards';
import { NAVBAR_CLEARANCE } from '@/components/navbar';
import { fetchFeed, fetchForYou, fetchTrending, fetchByIds } from '@/lib/queries';
import { useStore } from '@/lib/store';

const CHIPS: { label: string; icon?: string; topics?: string[] }[] = [
  { label: 'For You', icon: 'sparkles' },
  { label: 'Trending', icon: 'flame' },
  { label: 'Tech', topics: ['Tech & AI'] },
  { label: 'Politics', topics: ['Politics'] },
  { label: 'Business', topics: ['Business', 'Markets & Startups'] },
  { label: 'World', topics: ['World'] },
  { label: 'India', topics: ['India'] },
  { label: 'Sports', topics: ['Sports'] },
  { label: 'Health', topics: ['Health & Wellness'] },
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

export default function Home() {
  const insets = useSafeAreaInsets();
  const { c, isDark, toggle } = useTheme();
  const { topTopics, history } = useStore();
  const [chip, setChip] = useState('For You');

  const active = CHIPS.find((ch) => ch.label === chip)!;

  const forYou = useQuery({ queryKey: ['forYou'], queryFn: () => fetchForYou(60) });
  const trending = useQuery({ queryKey: ['trending'], queryFn: () => fetchTrending(8) });
  const topical = useQuery({
    queryKey: ['topical', chip],
    queryFn: () => fetchFeed({ topics: active.topics, limit: 30 }),
    enabled: !!active.topics,
  });

  const continueIds = useMemo(() => history.slice(0, 6).map((h) => h.id), [history]);
  const continueReading = useQuery({
    queryKey: ['continue', continueIds.join(',')],
    queryFn: () => fetchByIds(continueIds),
    enabled: continueIds.length > 0,
  });

  const feed = active.topics ? topical.data : chip === 'Trending' ? trending.data : forYou.data;
  const loading = active.topics ? topical.isLoading : chip === 'Trending' ? trending.isLoading : forYou.isLoading;

  const hero = (feed ?? [])[0];
  const carousel = (feed ?? []).slice(1, 8);
  const becauseYou = (forYou.data ?? []).filter((a) => a.sim != null && a.sim > 0.5).slice(3, 11);
  const quickReads = (feed ?? []).slice(8, 14);
  const more = (feed ?? []).slice(14, 24);

  const refetchAll = () => {
    forYou.refetch();
    trending.refetch();
    if (active.topics) topical.refetch();
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <LinearGradient colors={c.canvas} style={StyleSheet.absoluteFill} />
      {isDark ? (
        // faint brand glow at the very top of the dark canvas
        <LinearGradient
          colors={['rgba(77,136,255,0.14)', 'rgba(77,136,255,0)']}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 260 }}
        />
      ) : null}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: NAVBAR_CLEARANCE + 16 }}
        refreshControl={<RefreshControl refreshing={false} tintColor={c.brand} onRefresh={refetchAll} />}
      >
        {/* Top bar: toggle · centered wordmark · bell */}
        <Animated.View entering={FadeIn.duration(400)} style={s.topBar}>
          <IconButton name={isDark ? 'sun' : 'moon'} size={18} onPress={toggle} />
          <Image
            source={require('../../../assets/images/wordmark.svg')}
            style={s.wordmark}
            contentFit="contain"
          />
          <IconButton name="bell" size={18} badge onPress={() => {}} />
        </Animated.View>

        {/* Compact greeting */}
        <Animated.View entering={FadeInDown.delay(50).springify().damping(30).stiffness(250).mass(0.9)} style={{ paddingHorizontal: 20, marginTop: 18 }}>
          <Overline color={c.inkFaint}>
            {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          </Overline>
          <Txt size={28} lh={33} weight="extrabold" ls={-0.9} style={{ marginTop: 4 }}>
            {greeting()}.
          </Txt>
        </Animated.View>

        {/* Editorial category tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 2 }}
        >
          {CHIPS.map((ch) => (
            <CategoryTab key={ch.label} label={ch.label} active={chip === ch.label} onPress={() => setChip(ch.label)} />
          ))}
        </ScrollView>

        {loading ? (
          <View style={{ marginTop: 16, gap: 16 }}>
            <Shimmer style={{ height: 250, marginHorizontal: 20, borderRadius: 22 }} />
            <Shimmer style={{ height: 180, marginHorizontal: 20, borderRadius: 18 }} />
          </View>
        ) : (
          <>
            {/* Top story — one medium card */}
            {hero ? (
              <View style={{ marginTop: 16 }}>
                <TopStoryCard a={hero} />
              </View>
            ) : null}

            {/* Story carousel instead of stacked giants */}
            {carousel.length > 0 ? (
              <>
                <SectionHeader title="Top Stories" style={{ marginTop: 30 }} />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  snapToInterval={274}
                  decelerationRate="fast"
                  contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
                >
                  {carousel.map((a, i) => (
                    <RecommendCard key={a.id} a={a} index={i} />
                  ))}
                </ScrollView>
              </>
            ) : null}

            {/* Trending — editorial numbered list */}
            <SectionHeader title="Trending Now" style={{ marginTop: 34 }} />
            <View>
              {(trending.data ?? []).slice(0, 4).map((a, i) => (
                <TrendingRow key={a.id} a={a} rank={i + 1} />
              ))}
            </View>

            {/* Continue Reading */}
            {continueReading.data?.length ? (
              <>
                <SectionHeader title="Continue Reading" style={{ marginTop: 34 }} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}>
                  {continueReading.data.map((a, i) => (
                    <RecommendCard key={a.id} a={a} index={i} />
                  ))}
                </ScrollView>
              </>
            ) : null}

            {/* Because you read X */}
            {becauseYou.length > 0 ? (
              <>
                <SectionHeader
                  title={topTopics.length ? `Because you read ${topTopics[0]}` : 'Recommended for You'}
                  style={{ marginTop: 34 }}
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}>
                  {becauseYou.map((a, i) => (
                    <RecommendCard key={a.id} a={a} index={i} />
                  ))}
                </ScrollView>
              </>
            ) : null}

            {/* Quick reads */}
            {quickReads.length > 0 ? (
              <>
                <SectionHeader title="Quick Reads" style={{ marginTop: 34 }} />
                <View>
                  {quickReads.map((a, i) => (
                    <ArticleRow key={a.id} a={a} index={i} />
                  ))}
                </View>
              </>
            ) : null}

            {more.length > 0 ? (
              <>
                <SectionHeader title="More stories" style={{ marginTop: 26 }} />
                {more.map((a, i) => (
                  <ArticleRow key={a.id} a={a} index={i} />
                ))}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  wordmark: {
    flex: 1,
    height: 26,
    marginHorizontal: 12,
  },
});
