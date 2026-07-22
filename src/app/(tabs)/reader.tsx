import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Dimensions, Share, ScrollView as RNScrollView, LayoutChangeEvent, useWindowDimensions, Platform, Pressable } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { tick, soft } from '@/lib/haptics';
import * as WebBrowser from 'expo-web-browser';
import Animated, {
  FadeInDown,
  ZoomIn,
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  withSpring,
  Extrapolation,
  useAnimatedReaction,
  runOnJS,
  withTiming,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { colors, radius, spring, topicOf } from '@/theme';
import { Txt, Headline, Press, Shimmer, BreakingBadge, EasedScrim, LIcon, TopicBubble, CategoryTab } from '@/components/ui';
import { fetchReaderFeed } from '@/lib/queries';
import { type Article, timeAgo, isBreaking } from '@/lib/content';
import { useStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { useNavVisibility } from '@/lib/navVisibility';
import { track, createDwellTimer, flush as flushTelemetry } from '@/lib/telemetry';
import { artFor, topicArt } from '@/lib/topicArt';

const { width: W } = Dimensions.get('window');

type Mode = 'summary' | 'eli5' | 'tldr' | 'numbers' | 'deep';

const MODE_META: { key: Mode; label: string; icon: string }[] = [
  { key: 'summary', label: 'Summary', icon: 'sparkles' },
  { key: 'eli5', label: "I'm 5", icon: 'baby' },
  { key: 'tldr', label: '60-sec', icon: 'timer' },
  { key: 'numbers', label: 'Numbers', icon: 'chart-no-axes-column' },
  { key: 'deep', label: 'Deep dive', icon: 'telescope' },
];

const READER_TOPICS = Object.keys(topicArt);

export default function Reader() {
  const { c, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();

  // topic drawer
  const [topicFilter, setTopicFilter] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawer = useSharedValue(0);
  const openDrawer = (open: boolean) => {
    tick();
    if (open) {
      // always start from a clean bloom state
      setRevealTopic(undefined);
      reveal.value = 0;
    }
    setDrawerOpen(open);
    drawer.value = withSpring(open ? 1 : 0, spring.snappy);
  };
  const dialStyle = useAnimatedStyle(() => ({
    opacity: drawer.value,
    transform: [{ scale: interpolate(drawer.value, [0, 1], [1.06, 1]) }],
  }));

  // bubble bloom: tapped bubble expands + fades, revealing the deck
  const reveal = useSharedValue(0);
  const [revealTopic, setRevealTopic] = useState<string | null | undefined>(undefined);
  const endBloom = () => {
    setRevealTopic(undefined);
    reveal.value = 0;
    drawer.value = 0;
  };
  const bloomTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleDialSelect = (t: string | null) => {
    soft();
    setDrawerOpen(false); // stop capturing touches immediately
    setTopicFilter(t);
    setRevealTopic(t);
    reveal.value = 0;
    reveal.value = withTiming(1, { duration: 560, easing: Easing.bezier(0.3, 0, 0.2, 1) });
    // drive cleanup from JS — a dropped worklet callback would otherwise leave
    // reveal pinned at 1 and the dial permanently invisible
    if (bloomTimer.current) clearTimeout(bloomTimer.current);
    bloomTimer.current = setTimeout(endBloom, 580);
  };
  const backdropFade = useAnimatedStyle(() => ({ opacity: 1 - reveal.value }));
  const wheelFade = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - reveal.value * 2.2) }));
  const bubbleBloom = useAnimatedStyle(() => ({
    opacity: interpolate(reveal.value, [0, 0.55, 1], [1, 0.8, 0]),
    transform: [{ scale: interpolate(reveal.value, [0, 1], [1, 9]) }],
  }));
  const [measuredH, setMeasuredH] = useState(0);
  // Hidden tab screens can measure 0 on web; fall back to the window height.
  const pageH = measuredH > 100 ? measuredH : winH;
  const scrollY = useSharedValue(0);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['readerFeed', topicFilter],
    queryFn: () => fetchReaderFeed(40, topicFilter ? [topicFilter] : undefined),
    // keep the old deck on screen while the new topic loads — otherwise the
    // loading branch unmounts the dial mid-bloom and the tap looks ignored
    placeholderData: (prev: Article[] | undefined) => prev,
  });
  const [extra, setExtra] = useState<Article[]>([]);
  const loadingMore = useRef(false);
  const feedItems = useMemo(() => {
    const seenIds = new Set((data ?? []).map((a) => a.id));
    return [...(data ?? []), ...extra.filter((a) => !seenIds.has(a.id))];
  }, [data, extra]);

  const listRef = useRef<any>(null);
  React.useEffect(() => {
    setExtra([]);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [topicFilter]);

  const loadMore = useCallback(async () => {
    if (loadingMore.current) return;
    loadingMore.current = true;
    try {
      await flushTelemetry(); // impressions raise seen_count so the next batch differs
      const next = await fetchReaderFeed(40, topicFilter ? [topicFilter] : undefined);
      setExtra((prev) => {
        const have = new Set([...(data ?? []), ...prev].map((a) => a.id));
        return [...prev, ...next.filter((a) => !have.has(a.id))];
      });
    } catch {}
    loadingMore.current = false;
  }, [data]);

  const nav = useNavVisibility();
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  const topInset = insets.top;
  const renderPage = useCallback(
    ({ item, index }: { item: Article; index: number }) => (
      <PageShell index={index} pageH={pageH} scrollY={scrollY}>
        <ReaderCardMemo a={item} height={pageH} topInset={topInset} />
      </PageShell>
    ),
    // scrollY is a stable shared value ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageH, topInset],
  );

  const dwellRef = useRef<{ id: string; topic: string; words: number; timer: ReturnType<typeof createDwellTimer> } | null>(null);

  const closeDwell = useCallback(() => {
    const d = dwellRef.current;
    if (d) {
      const ms = d.timer.stop();
      if (ms > 500) {
        track({ article_id: d.id, event_type: 'dwell', dwell_ms: ms, words: d.words, topic: d.topic });
      }
      dwellRef.current = null;
    }
  }, []);

  const onViewable = useRef(({ viewableItems }: any) => {
    const first = viewableItems.find((v: any) => v.isViewable);
    if (!first) return;
    const a: Article = first.item;
    if (dwellRef.current?.id === a.id) return;
    closeDwell();
    tick();
    dwellRef.current = { id: a.id, topic: a.topic, words: a.wordCount, timer: createDwellTimer() };
  }).current;

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 20, gap: 18 }}>
        <Shimmer style={{ height: 340, marginHorizontal: 24, borderRadius: 22 }} />
        <Shimmer style={{ height: 28, marginHorizontal: 24, width: W * 0.7 }} />
        <Shimmer style={{ height: 16, marginHorizontal: 24 }} />
        <Shimmer style={{ height: 16, marginHorizontal: 24, width: W * 0.8 }} />
      </View>
    );
  }

  if (error || (data && data.length === 0)) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <LIcon name={error ? 'cloud-off' : 'layers'} size={34} color={c.inkFaint} />
        <Txt size={15} weight="bold" style={{ marginTop: 14 }}>
          {error ? "Couldn't load stories" : 'All caught up'}
        </Txt>
        <Txt size={13} weight="medium" color={c.inkSoft} style={{ marginTop: 6, textAlign: 'center' }}>
          {error ? String((error as Error).message ?? error) : 'Check back soon for fresh stories.'}
        </Txt>
        <Press onPress={() => refetch()} style={{ marginTop: 18, backgroundColor: c.brand, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 11 }}>
          <Txt size={13.5} weight="semibold" color="#fff">
            Try again
          </Txt>
        </Press>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }} onLayout={(e) => setMeasuredH(e.nativeEvent.layout.height)}>
      {pageH > 0 ? (
        <Animated.FlatList
          ref={listRef}
          data={feedItems}
          keyExtractor={(a: Article) => a.id}
          renderItem={renderPage}
          onScroll={onScroll}
          onScrollBeginDrag={() => nav.hide()}
          scrollEventThrottle={16}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          snapToInterval={pageH}
          decelerationRate="fast"
          disableIntervalMomentum
          getItemLayout={(_: any, i: number) => ({ length: pageH, offset: pageH * i, index: i })}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 75 }}
          onRefresh={() => {
            setExtra([]);
            refetch();
          }}
          refreshing={false}
          onEndReached={loadMore}
          onEndReachedThreshold={2}
          windowSize={5}
          initialNumToRender={3}
          maxToRenderPerBatch={3}
        />
      ) : null}

      {/* topics trigger */}
      <Press
        onPress={() => openDrawer(true)}
        scaleTo={0.88}
        style={[st.topicsBtn, { top: insets.top + 10 }]}
      >
        <LIcon name="layout-grid" size={17} color="#fff" strokeWidth={2.2} />
      </Press>
      {topicFilter ? (
        <View style={[st.filterTag, { top: insets.top + 58 }]}>
          <Txt size={11.5} weight="bold" color="#fff">
            {topicFilter}
          </Txt>
        </View>
      ) : null}

      {/* full-screen topic dial */}
      <Animated.View
        style={[StyleSheet.absoluteFill, dialStyle]}
        pointerEvents={drawerOpen ? 'auto' : 'none'}
      >
        <Animated.View style={[StyleSheet.absoluteFill, backdropFade]} pointerEvents={drawerOpen ? 'auto' : 'none'}>
          <Press onPress={() => openDrawer(false)} haptic={false} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(5,8,14,0.92)' }]}>
            <View />
          </Press>
        </Animated.View>
        <Animated.View
          style={[StyleSheet.absoluteFill, wheelFade]}
          pointerEvents={revealTopic === undefined ? 'box-none' : 'none'}
        >
          <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + 22, left: 0, right: 0, alignItems: 'center' }}>
            <Txt size={19} weight="extrabold" color="#fff" ls={-0.5}>
              Topics
            </Txt>
            <Txt size={12} weight="medium" color="rgba(255,255,255,0.45)" style={{ marginTop: 3 }}>
              drag to spin · tap to choose
            </Txt>
          </View>
          {/* fixed center ring the dial snaps into */}
          <View pointerEvents="none" style={st.centerRing} />
          <TopicWheel selected={topicFilter} onSelect={handleDialSelect} brand={c.brand} />
        </Animated.View>
        {/* the chosen bubble blooms over the screen, then dissolves */}
        {revealTopic !== undefined ? (
          <Animated.View pointerEvents="none" style={[st.bloomWrap, bubbleBloom]}>
            {revealTopic === null ? (
              <View style={[st.forYouBubble, { backgroundColor: c.brand }]}>
                <LIcon name="sparkles" size={22} color="#fff" strokeWidth={2.2} />
                <Txt size={12.5} weight="bold" color="#fff" style={{ marginTop: 4 }}>
                  For You
                </Txt>
              </View>
            ) : (
              <TopicBubble topic={revealTopic} size={92} />
            )}
          </Animated.View>
        ) : null}
      </Animated.View>
    </View>
  );
}

/* ---------- Full-screen topic dial ----------
   Big artwork bubbles centered over a dimmed backdrop; drag to spin with
   haptic detents — the centered bubble swells into the ring; tap to choose. */

const WHEEL_ROW = 108;
const WHEEL_ITEMS: (string | null)[] = [null, ...READER_TOPICS]; // null = For You

function TopicWheel({
  selected,
  onSelect,
  brand,
}: {
  selected: string | null;
  onSelect: (t: string | null) => void;
  brand: string;
}) {
  const wheelY = useSharedValue(0);
  const [wheelH, setWheelH] = useState(0);
  const scrollRef = useRef<any>(null);

  const onWheelScroll = useAnimatedScrollHandler((e) => {
    wheelY.value = e.contentOffset.y;
  });

  // haptic detent each time a new bubble crosses the ring
  useAnimatedReaction(
    () => Math.round(wheelY.value / WHEEL_ROW),
    (cur, prev) => {
      if (prev !== null && cur !== prev) runOnJS(tick)();
    },
  );

  const choose = (i: number, t: string | null) => {
    scrollRef.current?.scrollTo({ y: i * WHEEL_ROW, animated: false });
    onSelect(t);
  };

  const pad = Math.max((wheelH - WHEEL_ROW) / 2, 0);
  const startIndex = Math.max(
    WHEEL_ITEMS.findIndex((t) => t === selected),
    0,
  );

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      onLayout={(e) => setWheelH(e.nativeEvent.layout.height)}
    >
      {wheelH > 0 ? (
        <Animated.ScrollView
          ref={scrollRef}
          onScroll={onWheelScroll}
          scrollEventThrottle={16}
          snapToInterval={WHEEL_ROW}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          contentOffset={{ x: 0, y: startIndex * WHEEL_ROW }}
          contentContainerStyle={{ paddingTop: pad, paddingBottom: pad }}
        >
          {WHEEL_ITEMS.map((t, i) => (
            <WheelRow key={t ?? 'foryou'} index={i} wheelY={wheelY}>
              {t === null ? (
                <Press
                  haptic={false}
                  onPress={() => choose(i, t)}
                  scaleTo={0.94}
                  style={{ alignItems: 'center' }}
                >
                  <View style={[st.forYouBubble, { backgroundColor: brand }]}>
                    <LIcon name="sparkles" size={22} color="#fff" strokeWidth={2.2} />
                    <Txt size={12.5} weight="bold" color="#fff" style={{ marginTop: 4 }}>
                      For You
                    </Txt>
                  </View>
                </Press>
              ) : (
                <TopicBubble topic={t} size={92} selected={selected === t} onPress={() => choose(i, t)} />
              )}
            </WheelRow>
          ))}
        </Animated.ScrollView>
      ) : null}
    </View>
  );
}

function WheelRow({ index, wheelY, children }: { index: number; wheelY: SharedValue<number>; children: React.ReactNode }) {
  const a = useAnimatedStyle(() => {
    const d = index - wheelY.value / WHEEL_ROW;
    const ad = Math.abs(d);
    return {
      transform: [
        { scale: interpolate(ad, [0, 1, 2, 3.5], [1.24, 0.78, 0.58, 0.44], Extrapolation.CLAMP) },
        { translateY: d * -6 }, // rows gather slightly toward the center
      ],
      opacity: interpolate(ad, [0, 1, 2, 3], [1, 0.5, 0.24, 0.08], Extrapolation.CLAMP),
    };
  });
  return (
    <Animated.View style={[{ height: WHEEL_ROW, alignItems: 'center', justifyContent: 'center' }, a]}>
      {children}
    </Animated.View>
  );
}

const st = StyleSheet.create({
  bloomWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerRing: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -62,
    marginTop: -62,
    width: 124,
    height: 124,
    borderRadius: 62,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  forYouBubble: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 10px 30px rgba(57,121,255,0.45)',
  },
  topicsBtn: {
    position: 'absolute',
    right: 18,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(11,13,18,0.38)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterTag: {
    position: 'absolute',
    right: 18,
    backgroundColor: 'rgba(57,121,255,0.9)',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
})

/* Pages visibly hand off: leaving page scales to 0.94 and dims */
function PageShell({ index, pageH, scrollY, children }: { index: number; pageH: number; scrollY: SharedValue<number>; children: React.ReactNode }) {
  const a = useAnimatedStyle(() => {
    const pos = [(index - 1) * pageH, index * pageH, (index + 1) * pageH];
    return {
      transform: [{ scale: interpolate(scrollY.value, pos, [0.94, 1, 0.94], Extrapolation.CLAMP) }],
      opacity: interpolate(scrollY.value, pos, [0.55, 1, 0.55], Extrapolation.CLAMP),
    };
  });
  return <Animated.View style={[{ height: pageH }, a]}>{children}</Animated.View>;
}

const ReaderCardMemo = React.memo(ReaderCard, (p, n) => p.a.id === n.a.id && p.height === n.height && p.topInset === n.topInset);

function ReaderCard({ a, height, topInset }: { a: Article; height: number; topInset: number }) {
  const { c, isDark } = useTheme();
  const nav = useNavVisibility();
  const t = topicOf(a.topic);
  const { isSaved, toggleSaved, isLiked, toggleLiked, recordRead } = useStore();
  const [mode, setMode] = useState<Mode>('summary');
  const [burst, setBurst] = useState(0);
  const saved = isSaved(a.id);
  const liked = isLiked(a.id);

  const modes = useMemo(() => {
    const avail: Mode[] = ['summary'];
    if (a.modes?.eli5) avail.push('eli5');
    if (a.modes?.tldr?.length) avail.push('tldr');
    if (a.modes?.keyNumbers?.length) avail.push('numbers');
    if (a.modes?.deepDive) avail.push('deep');
    return MODE_META.filter((m) => avail.includes(m.key));
  }, [a.modes]);

  const switchMode = (m: Mode) => {
    setMode(m);
    recordRead(a.id, a.topic);
    track({ article_id: a.id, event_type: 'mode_switch', topic: a.topic, meta: { mode: m } });
  };

  const imgH = Math.max(height * 0.36, 240);

  const imgSource = a.imageUrl ? { uri: a.imageUrl } : artFor(a.topic);
  // ambient glass: the article's own image, heavily blurred, becomes the
  // card's backdrop so its palette bleeds through the whole surface
  const tint = isDark ? 'rgba(8,11,20,0.74)' : 'rgba(255,255,255,0.45)';
  // sharp image dissolves via a TRUE alpha mask — no bands, no seams
  const fadeH = imgH + 120;

  const sharpLayers = (
    <>
      <Image source={imgSource} style={{ width: '100%', height: fadeH }} contentFit="cover" recyclingKey={a.id} transition={280} />
      {a.imageUrl ? (
        <LinearGradient colors={[t.wash, 'rgba(0,0,0,0)']} style={StyleSheet.absoluteFill} />
      ) : null}
      <EasedScrim variant="top" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: imgH * 0.5 }} />
    </>
  );

  return (
    <Pressable onPress={() => nav.toggle()} style={{ height, backgroundColor: c.bg, overflow: 'hidden' }}>
      <Image
        source={imgSource}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        blurRadius={90}
        recyclingKey={a.id + '-ambient'}
        transition={300}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} />

      {Platform.OS === 'web' ? (
        // web fallback: translucent gradient melt (masked-view is native-only)
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: fadeH, overflow: 'hidden' }}>
          {sharpLayers}
          <LinearGradient
            colors={
              isDark
                ? (['rgba(10,14,23,0)', 'rgba(10,14,23,0.45)', 'rgba(10,14,23,0.72)', tint] as any)
                : (['rgba(255,255,255,0)', 'rgba(255,255,255,0.3)', 'rgba(255,255,255,0.45)', tint] as any)
            }
            locations={[0, 0.5, 0.75, 1]}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: fadeH * 0.62 }}
          />
        </View>
      ) : (
        <MaskedView
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: fadeH }}
          maskElement={
            <LinearGradient
              colors={['#000', '#000', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0)']}
              locations={[0, 0.55, 0.8, 1]}
              style={{ flex: 1 }}
            />
          }
        >
          {sharpLayers}
        </MaskedView>
      )}

      {/* pills live outside the fade so they stay crisp */}
      <View style={[s.cardTop, { top: topInset + 10 }]}>
        {isBreaking(a) ? (
          <BreakingBadge />
        ) : (
          <View style={s.glassPill}>
            <Txt size={11.5} weight="semibold" color="#fff" ls={0.3}>
              {a.topic}
            </Txt>
          </View>
        )}
        <View style={s.glassPill}>
          <Txt size={11.5} weight="medium" color="#fff">
            {timeAgo(a.publishedAt)}
          </Txt>
        </View>
      </View>

      {/* frosted sheet that FEATHERS into the image — no hard edge.
          The ambient backdrop beneath is already an image-blur, so the sheet
          itself only needs a feathered tint (web adds real backdrop blur). */}
      <View style={[s.sheet, { top: imgH - 40 }]}>
        {Platform.OS === 'web' ? (
          <BlurView intensity={26} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        ) : null}
        <LinearGradient
          colors={
            isDark
              ? (['rgba(12,17,29,0)', 'rgba(12,17,29,0.42)', 'rgba(12,17,29,0.6)', 'rgba(12,17,29,0.68)'] as any)
              : (['rgba(255,255,255,0)', 'rgba(255,255,255,0.3)', 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0.66)'] as any)
          }
          locations={[0, 0.14, 0.3, 0.52]}
          style={StyleSheet.absoluteFill}
        />

        <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 34 }}>
        <Headline numberOfLines={3} style={{ fontSize: 25, lineHeight: 31 }}>
          {a.title}
        </Headline>

        {/* mode switcher — editorial text tabs, no pills */}
        <RNScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, marginTop: 10 }}
        >
          {modes.map((m) => (
            <CategoryTab key={m.key} label={m.label} active={mode === m.key} onPress={() => switchMode(m.key)} />
          ))}
        </RNScrollView>

        <Animated.View key={mode} entering={FadeInDown.duration(300).springify().damping(30).stiffness(250).mass(0.9)} style={{ flex: 1, marginTop: 16 }}>
          <ModeContent a={a} mode={mode} />
        </Animated.View>

        {/* footer */}
        <View style={[s.footer, { paddingBottom: 26 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <LinearGradient colors={t.grad} style={s.pubDot} />
            <Txt size={13} weight="semibold" numberOfLines={1} style={{ flexShrink: 1 }}>
              {a.publisher}
            </Txt>
            <LIcon name="badge-check" size={14} color={c.brand} style={{ marginLeft: 5 }} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View>
              <Press
                haptic={false}
                scaleTo={0.9}
                onPress={() => {
                  soft();
                  if (!liked) setBurst((b) => b + 1);
                  toggleLiked(a.id, a.topic);
                }}
                style={[s.actionCircle, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(11,13,18,0.045)' }]}
              >
                <LIcon name="heart" size={18} color={liked ? c.breaking : c.ink} fill={liked ? c.breaking : 'none'} />
              </Press>
              {burst > 0 && liked ? <HeartBurst key={burst} /> : null}
            </View>
            <Press
              haptic={false}
              scaleTo={0.9}
              onPress={() => {
                soft();
                toggleSaved(a.id, a.topic);
              }}
              style={[s.actionCircle, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(11,13,18,0.045)' }, saved ? { backgroundColor: c.brand, boxShadow: '0 6px 18px rgba(57,121,255,0.4)' } : null]}
            >
              <LIcon name="bookmark" size={16} color={saved ? '#fff' : c.ink} fill={saved ? '#fff' : 'none'} />
            </Press>
            <Press
              haptic={false}
              scaleTo={0.9}
              onPress={() => {
                track({ article_id: a.id, event_type: 'share', topic: a.topic });
                Share.share({ message: `${a.title}\n\n${a.url}` });
              }}
              style={[s.actionCircle, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(11,13,18,0.045)' }]}
            >
              <LIcon name="share-2" size={16} color={c.ink} />
            </Press>
            <Press
              haptic={false}
              scaleTo={0.9}
              onPress={() => {
                track({ article_id: a.id, event_type: 'open_full', topic: a.topic });
                WebBrowser.openBrowserAsync(a.url);
              }}
              style={[s.actionCircle, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(11,13,18,0.045)' }]}
            >
              <LIcon name="external-link" size={16} color={c.ink} />
            </Press>
          </View>
        </View>
        </View>
      </View>
    </Pressable>
  );
}

function ModeContent({ a, mode }: { a: Article; mode: Mode }) {
  const { c, isDark } = useTheme();
  if (mode === 'tldr' && a.modes?.tldr) {
    return (
      <View style={{ gap: 13 }}>
        {a.modes.tldr.slice(0, 5).map((b, i) => (
          <Animated.View key={i} entering={FadeInDown.delay(i * 80)} style={{ flexDirection: 'row', gap: 11 }}>
            <LinearGradient colors={[c.brandLight, c.brand]} style={s.tldrNum}>
              <Txt size={11.5} weight="bold" color="#fff">
                {i + 1}
              </Txt>
            </LinearGradient>
            <Txt size={15.5} lh={23.5} color={c.ink} style={{ flex: 1 }}>
              {b}
            </Txt>
          </Animated.View>
        ))}
      </View>
    );
  }
  if (mode === 'numbers' && a.modes?.keyNumbers) {
    return (
      <View style={{ gap: 10 }}>
        {a.modes.keyNumbers.slice(0, 5).map((k, i) => {
          const m = k.match(/^([\d.,%₹$€]+[\w%]*)\s*[—–:-]?\s*(.*)$/);
          const big = m?.[1];
          const rest = m?.[2] || k;
          return (
            <Animated.View key={i} entering={ZoomIn.delay(i * 90).springify().damping(30).stiffness(250).mass(0.9)}>
              <LinearGradient
                colors={isDark ? ['rgba(77,136,255,0.14)', 'rgba(77,136,255,0.07)'] : ['#F3F7FF', '#EAF1FF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.numCard}
              >
                {big && big !== rest ? (
                  <Txt size={23} weight="extrabold" color={c.brand} ls={-0.6}>
                    {big}
                  </Txt>
                ) : null}
                <Txt size={13.5} lh={19.5} color={isDark ? "#9FB4D8" : "#41506B"} style={{ marginTop: big && big !== rest ? 3 : 0 }}>
                  {rest}
                </Txt>
              </LinearGradient>
            </Animated.View>
          );
        })}
      </View>
    );
  }

  const text = mode === 'eli5' ? a.modes?.eli5 ?? a.summary : mode === 'deep' ? a.modes?.deepDive ?? a.summary : a.summary;

  // Static — no inner scrolling inside the swipe deck. Long text clamps with
  // an ellipsis; the open-full action has the rest.
  return (
    <View style={{ flex: 1 }}>
      {mode === 'eli5' ? (
        <LinearGradient colors={['#FFE9C2', '#FFD9A3']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.eli5Tag}>
          <Txt size={10.5} weight="bold" color="#8A5A0B" ls={0.8}>
            EXPLAINED SIMPLY
          </Txt>
        </LinearGradient>
      ) : null}
      <Txt
        size={mode === 'deep' ? 15 : 16.5}
        lh={mode === 'deep' ? 24 : 28}
        color={isDark ? '#CBD5E3' : '#252B36'}
        numberOfLines={mode === 'deep' ? 12 : mode === 'eli5' ? 8 : 9}
      >
        {text}
      </Txt>
    </View>
  );
}

function HeartBurst() {
  return (
    <View pointerEvents="none" style={s.burstWrap}>
      {[...Array(6)].map((_, i) => {
        const angle = (i / 6) * Math.PI * 2;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              transform: [{ translateX: Math.cos(angle) * 24 }, { translateY: Math.sin(angle) * 24 }],
            }}
          >
            <Animated.View entering={ZoomIn.duration(340).springify().damping(9)} style={s.burstDot} />
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  cardTop: {
    position: 'absolute',
    left: 18,
    right: 66,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  glassPill: {
    backgroundColor: 'rgba(11,13,18,0.32)',
    borderRadius: radius.pill,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  tldrNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  numCard: {
    borderRadius: radius.md,
    paddingHorizontal: 17,
    paddingVertical: 13,
  },
  eli5Tag: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 5,
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  pubDot: { width: 9, height: 9, borderRadius: 5, marginRight: 8 },
  actionCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(11,13,18,0.045)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  burstWrap: {
    position: 'absolute',
    top: 11,
    left: 11,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  burstDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.breaking,
  },
});
