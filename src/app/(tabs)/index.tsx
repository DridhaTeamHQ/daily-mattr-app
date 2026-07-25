import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import Animated, {
  FadeInDown,
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  interpolate,
  Extrapolation,
  runOnJS,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/lib/theme';
import { Txt, IconButton, PillTab, Shimmer, Press } from '@/components/ui';
import { CarouselCard, ArticleRow, CAROUSEL_STRIDE } from '@/components/cards';
import { PixCard } from '@/components/pixCard';
import { NAVBAR_CLEARANCE } from '@/components/navbar';
import { fetchFeed, fetchFeedPage, fetchForYou, fetchTrending, fetchBreaking, fetchPix } from '@/lib/queries';
import { getUnreadBreaking } from '@/lib/notifications';
import { useNavVisibility } from '@/lib/navVisibility';

const TABS: { label: string; topics?: string[] }[] = [
  { label: 'For You' },
  { label: 'Trending' },
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
  const router = useRouter();
  const { c, isDark, toggle } = useTheme();
  const nav = useNavVisibility();
  const scrollY = useSharedValue(0);
  const lastY = useSharedValue(0);
  const navShown = useSharedValue(1);
  const carouselX = useSharedValue(0);

  // Runs on the UI thread, and only crosses to JS when visibility actually
  // changes — the old handler called show()/hide() on every scroll event.
  const onScroll = useAnimatedScrollHandler((e) => {
    const y = e.contentOffset.y;
    scrollY.value = y;
    const dy = y - lastY.value;
    if (y < 60) {
      if (navShown.value !== 1) {
        navShown.value = 1;
        runOnJS(nav.show)();
      }
    } else if (dy > 14 && navShown.value !== 0) {
      navShown.value = 0;
      runOnJS(nav.hide)();
    } else if (dy < -14 && navShown.value !== 1) {
      navShown.value = 1;
      runOnJS(nav.show)();
    }
    lastY.value = y;
  });
  const onCarouselScroll = useAnimatedScrollHandler((e) => {
    carouselX.value = e.contentOffset.x;
  });

  // the masthead gives way to the stories as you go
  const headerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 84], [1, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(scrollY.value, [0, 130], [0, -22], Extrapolation.CLAMP) }],
  }));
  const [tab, setTab] = useState('For You');
  const dateLabel = useMemo(
    () => new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }),
    [],
  );

  const active = TABS.find((t) => t.label === tab)!;

  const forYou = useQuery({ queryKey: ['forYou'], queryFn: () => fetchForYou(60) });
  const trending = useQuery({
    queryKey: ['trending'],
    queryFn: () => fetchTrending(20),
    enabled: tab === 'Trending',
  });
  const topical = useQuery({
    queryKey: ['topical', tab],
    queryFn: () => fetchFeed({ topics: active.topics, limit: 30 }),
    enabled: !!active.topics,
  });
  const pix = useQuery({
    queryKey: ['pix', tab],
    queryFn: () => fetchPix(12, active.topics),
    staleTime: 300_000,
  });
  const unread = useQuery({ queryKey: ['breakingUnread'], queryFn: getUnreadBreaking, staleTime: 120_000 });
  const breakingTop = useQuery({ queryKey: ['breakingTop'], queryFn: () => fetchBreaking(1), staleTime: 120_000 });

  const feed = active.topics ? topical.data : tab === 'Trending' ? trending.data : forYou.data;
  const loading = active.topics ? topical.isLoading : tab === 'Trending' ? trending.isLoading : forYou.isLoading;

  // collapse syndicated duplicates (same story pushed by multiple feeds)
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 80);
  const deduped = useMemo(() => {
    const seen = new Set<string>();
    return (feed ?? []).filter((a) => {
      const k = norm(a.title);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [feed]);

  const carousel = deduped.slice(0, 6);

  // A Pix is a promotion, not an addition: a story that qualifies gets told as a
  // card instead of a row, so nothing appears twice. Carousel stories are left
  // alone — they are already the hero treatment.
  const pixPicks = useMemo(() => {
    const heroIds = new Set(deduped.slice(0, 6).map((a) => a.id));
    return (pix.data ?? []).filter((a) => !heroIds.has(a.id)).slice(0, 3);
  }, [pix.data, deduped]);

  const list = useMemo(() => {
    const promoted = new Set(pixPicks.map((a) => a.id));
    const promotedTitles = new Set(pixPicks.map((a) => norm(a.title)));
    return deduped
      .slice(6, 20)
      .filter((a) => !promoted.has(a.id) && !promotedTitles.has(norm(a.title)))
      .slice(0, 12); // Latest stays digestible — a page, not a firehose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deduped, pixPicks]);

  // one continuous list — older stories stream in via keyset pagination
  const morePages = useInfiniteQuery({
    queryKey: ['morePages', tab],
    queryFn: ({ pageParam }) => fetchFeedPage({ before: pageParam ?? list[list.length - 1]?.publishedAt ?? null, topics: active.topics, limit: 15 }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.length ? last[last.length - 1].publishedAt : undefined),
    enabled: false, // fetched only when the user taps "More stories"
  });
  const older = useMemo(() => {
    const shownIds = new Set(deduped.map((a) => a.id));
    const shownTitles = new Set(deduped.map((a) => norm(a.title)));
    const out: typeof deduped = [];
    for (const a of morePages.data?.pages.flat() ?? []) {
      const k = norm(a.title);
      if (shownIds.has(a.id) || shownTitles.has(k)) continue;
      shownTitles.add(k);
      out.push(a);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [morePages.data, deduped]);

  // a short page means the feed is exhausted — stop offering "More stories"
  const pages = morePages.data?.pages;
  const exhausted = !!pages && pages.length > 0 && pages[pages.length - 1].length < 15;

  const refetchAll = () => {
    forYou.refetch();
    if (tab === 'Trending') trending.refetch();
    if (active.topics) topical.refetch();
    breakingTop.refetch();
  };

  // slim breaking strip: only when there is a fresh cluster, and never
  // duplicating the hero
  const breaking = breakingTop.data?.[0];
  const showBreaking =
    !!breaking &&
    Date.now() - new Date(breaking.detectedAt).getTime() < 12 * 3600_000 &&
    !carousel.some((a) => a.id === breaking.id);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <LinearGradient colors={c.canvas} style={StyleSheet.absoluteFill} />
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: NAVBAR_CLEARANCE + 16 }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={false} tintColor={c.brand} onRefresh={refetchAll} />}
      >
        {/* quiet header */}
        <Animated.View entering={FadeIn.duration(400)} style={s.topBar}>
          <Image
            source={require('../../../assets/images/wordmark.svg')}
            style={{ width: 118, height: 22 }}
            contentFit="contain"
          />
          <View style={{ flexDirection: 'row' }}>
            <IconButton name={isDark ? 'sun' : 'moon'} size={17} onPress={toggle} />
            <IconButton
              name="bell"
              size={17}
              badge={(unread.data ?? 0) > 0}
              onPress={() => router.push('/notifications')}
            />
          </View>
        </Animated.View>

        {/* editorial header — a quiet dateline over one restrained line.
            The photography below is the hero, not the type. */}
        <Animated.View
          entering={FadeInDown.delay(40).springify().damping(30).stiffness(250).mass(0.9)}
          style={{ paddingHorizontal: 24, marginTop: 20 }}
        >
          <Animated.View style={headerStyle}>
            <Txt size={11} weight="semibold" color={c.inkSoft} ls={1.5} style={{ textTransform: 'uppercase' }}>
              {greeting()} · {dateLabel}
            </Txt>
            <Txt display size={28} lh={33} weight="extrabold" ls={-1.0} style={{ marginTop: 6 }}>
              What&apos;s new today?
            </Txt>
          </Animated.View>
        </Animated.View>

        {/* tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 18, paddingBottom: 4 }}
        >
          {TABS.map((t) => (
            <PillTab key={t.label} label={t.label} active={tab === t.label} onPress={() => setTab(t.label)} />
          ))}
        </ScrollView>

        {loading ? (
          <View style={{ marginTop: 16, gap: 2 }}>
            <Shimmer style={{ height: 250, marginHorizontal: 24, borderRadius: 22, marginBottom: 18 }} />
            {[0, 1, 2].map((i) => (
              <Shimmer key={i} style={{ height: 68, marginHorizontal: 24, marginBottom: 14 }} />
            ))}
          </View>
        ) : (
          <>
            {/* top stories carousel */}
            <View style={s.sectionRow}>
              <Txt size={17} weight="bold" ls={-0.4}>
                Top stories
              </Txt>
              <Press onPress={() => router.push('/reader')} scaleTo={0.94} style={{ paddingVertical: 4 }}>
                <Txt size={13} weight="semibold" color={c.brand}>
                  See All
                </Txt>
              </Press>
            </View>
            <Animated.ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={CAROUSEL_STRIDE}
              decelerationRate="fast"
              onScroll={onCarouselScroll}
              scrollEventThrottle={16}
              contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 6, paddingTop: 2 }}
            >
              {carousel.map((a, i) => (
                <CarouselCard key={a.id} a={a} index={i} scrollX={carouselX} />
              ))}
            </Animated.ScrollView>

            {/* one-line breaking strip */}
            {showBreaking ? (
              <Animated.View entering={FadeInDown.delay(80).springify().damping(30).stiffness(250).mass(0.9)}>
                <Press onPress={() => router.push(`/article/${breaking!.id}`)} style={s.breakingStrip}>
                  <PulseDot />
                  <Txt size={13.5} weight="semibold" numberOfLines={1} style={{ flex: 1 }}>
                    {breaking!.title}
                  </Txt>
                  <Txt size={11.5} weight="semibold" color={c.breaking} ls={0.6}>
                    LIVE
                  </Txt>
                </Press>
              </Animated.View>
            ) : null}

            {/* the feed — one ranked list */}
            <View style={[s.sectionRow, { marginTop: 26, marginBottom: 2 }]}>
              <Txt size={17} weight="bold" ls={-0.4}>
                Latest
              </Txt>
            </View>
            <View>
              {list.map((a, i) => (
                <React.Fragment key={a.id}>
                  <ArticleRow a={a} index={i} />
                  {i % 4 === 3 && pixPicks[(i - 3) / 4] ? (
                    <PixCard a={pixPicks[(i - 3) / 4]} index={i} />
                  ) : null}
                </React.Fragment>
              ))}
              {older.map((a, i) => (
                <ArticleRow key={a.id} a={a} index={i} divider={i < older.length - 1} />
              ))}
              {exhausted ? (
                <Animated.View entering={FadeIn.duration(300)} style={s.caughtUp}>
                  <Txt size={13.5} weight="semibold" color={c.inkFaint}>
                    That&apos;s everything for now
                  </Txt>
                </Animated.View>
              ) : (
                <Press
                  onPress={() => morePages.fetchNextPage()}
                  scaleTo={0.97}
                  style={[s.moreBtn, { borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(11,13,18,0.14)' }]}
                >
                  <Txt size={14} weight="semibold" color={c.inkSoft}>
                    {morePages.isFetchingNextPage ? 'Loading…' : 'More stories'}
                  </Txt>
                </Press>
              )}
            </View>
          </>
        )}
      </Animated.ScrollView>
    </View>
  );
}

function PulseDot() {
  const v = useSharedValue(1);
  useEffect(() => {
    v.value = withRepeat(withSequence(withTiming(0.4, { duration: 700 }), withTiming(1, { duration: 700 })), -1);
  }, [v]);
  const a = useAnimatedStyle(() => ({ opacity: v.value }));
  return <Animated.View style={[s.pulseDot, a]} />;
}

const s = StyleSheet.create({
  caughtUp: {
    alignItems: 'center',
    paddingVertical: 28,
    marginTop: 8,
  },
  moreBtn: {
    marginHorizontal: 24,
    marginTop: 20,
    height: 46,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginTop: 22,
    marginBottom: 12,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 24,
    paddingRight: 14,
  },
  breakingStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 24,
    marginTop: 16,
    paddingVertical: 4,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
  },
});
