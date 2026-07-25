import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Dimensions, Share, LayoutChangeEvent, useWindowDimensions, Platform, Pressable } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { tick, soft, save as saveHaptic, commit as commitHaptic } from '@/lib/haptics';
import * as WebBrowser from 'expo-web-browser';
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  withSpring,
  Extrapolation,
  useAnimatedReaction,
  runOnJS,
  withTiming,
  withSequence,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { colors, radius, spring, topicOf } from '@/theme';
import { Txt, Headline, Press, Shimmer, BreakingBadge, EasedScrim, LIcon, TopicBubble } from '@/components/ui';
import { fetchReaderFeed } from '@/lib/queries';
import { type Article, timeAgo, isBreaking } from '@/lib/content';
import { useStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { useNavVisibility } from '@/lib/navVisibility';
import { track, createDwellTimer, flush as flushTelemetry } from '@/lib/telemetry';
import { artFor, topicArt } from '@/lib/topicArt';

const { width: W } = Dimensions.get('window');

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

  // fractional index sitting at the dial's focus point
  const spin = useSharedValue(0);
  const spinFrom = useSharedValue(0);
  React.useEffect(() => {
    const i = WHEEL_ITEMS.findIndex((x) => x === topicFilter);
    spin.value = i < 0 ? 0 : i;
  }, [topicFilter, spin]);

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
    commitHaptic(560);
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
  // One continuous gesture: long-press summons the dial, the same unbroken
  // drag spins it, and lifting off commits whatever sits at the focus point.
  const openForHold = () => {
    setRevealTopic(undefined);
    reveal.value = 0;
    setDrawerOpen(true);
    drawer.value = withSpring(1, spring.snappy);
    soft();
  };
  const commitSpin = (idx: number) => {
    const n = WHEEL_ITEMS.length;
    handleDialSelect(WHEEL_ITEMS[(((idx % n) + n) % n)]);
  };
  const topicGesture = useMemo(() => {
    const hold = Gesture.Pan()
      .activateAfterLongPress(180)
      .onStart(() => {
        spinFrom.value = spin.value;
        runOnJS(openForHold)();
      })
      .onUpdate((e) => {
        spin.value = spinFrom.value - e.translationY / DRAG_PX;
      })
      .onEnd(() => {
        const landed = Math.round(spin.value);
        spin.value = withSpring(landed, spring.snappy); // settle onto the detent
        runOnJS(commitSpin)(landed);
      });
    const tap = Gesture.Tap().onEnd((_e, ok) => {
      if (ok) runOnJS(openDrawer)(true);
    });
    return Gesture.Exclusive(hold, tap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeDial = useCallback(() => openDrawer(false), []);

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

  const { recordRead } = useStore();
  const recordReadRef = useRef(recordRead);
  recordReadRef.current = recordRead;

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
    recordReadRef.current(a.id, a.topic); // the card the reader actually landed on
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

      {/* topics trigger — hold to summon the dial, keep dragging to spin it,
          release on a topic to open it. A plain tap still opens it to browse. */}
      <GestureDetector gesture={topicGesture}>
        <Animated.View style={[st.topicsBtn, { top: insets.top + 10 }]}>
          <LIcon name="layout-grid" size={17} color="#fff" strokeWidth={2.2} />
        </Animated.View>
      </GestureDetector>
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
              hold &amp; drag · or tap, spin and pick
            </Txt>
          </View>
          <TopicWheel
            selected={topicFilter}
            onSelect={handleDialSelect}
            onClose={closeDial}
            brand={c.brand}
            spin={spin}
          />
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

// The blend zone: how far the glass takes to melt from clear to readable.
// Long on purpose — a short ramp reads as an edge.
const FEATHER = 178;
const SHEET_LIGHT = 'rgba(255,255,255,0.62)';
const SHEET_DARK = 'rgba(12,17,29,0.58)';

const WHEEL_ROW = 108;
const WHEEL_ITEMS: (string | null)[] = [null, ...READER_TOPICS]; // null = For You

/* The dial is a half-circle hinged off the right edge: every topic is placed
   by its angle, so the focused one swings out toward the middle of the screen
   and the rest curve back toward the edge above and below it. Driven by one
   shared value the press-drag gesture writes to. */

const ARC_STEP = 0.42; // radians between neighbours
// An ellipse, not a circle: the vertical radius reaches the top and bottom
// edges of the screen while the horizontal one keeps the focused bubble
// roughly centred instead of shoving it off the left side.
const ARC_RX = W * 0.58;
const ARC_CX = W + 26; // centre sits just off the right edge, so only half shows
const ARC_EDGE = 1.62; // past this angle a bubble has left the visible arc
const BUBBLE = 86;
export const DRAG_PX = 74; // finger travel per topic

// Shortest way round the ring, so topics always fill the arc above AND below
// the focus instead of fanning off in one direction from the first item.
function arcAngle(index: number, spin: number): number {
  'worklet';
  const n = WHEEL_ITEMS.length;
  let d = (((index - spin) % n) + n) % n;
  if (d > n / 2) d -= n;
  return d * ARC_STEP;
}

function TopicWheel({
  selected,
  onSelect,
  onClose,
  brand,
  spin,
}: {
  selected: string | null;
  onSelect: (t: string | null) => void;
  onClose: () => void;
  brand: string;
  spin: SharedValue<number>;
}) {
  const { height: winH } = useWindowDimensions();
  const cy = winH / 2;
  const ry = winH * 0.54; // arc runs off the top and bottom edges

  // Once the dial is open by tap it still has to be spinnable — this drags the
  // wheel from any empty space, throws with the flick, and settles on a detent.
  // Tapping that same empty space dismisses.
  const dragFrom = useSharedValue(0);
  const browse = useMemo(() => {
    const drag = Gesture.Pan()
      .minDistance(6)
      .onStart(() => {
        dragFrom.value = spin.value;
      })
      .onUpdate((e) => {
        spin.value = dragFrom.value - e.translationY / DRAG_PX;
      })
      .onEnd((e) => {
        const thrown = spin.value - (e.velocityY / DRAG_PX) * 0.09;
        spin.value = withSpring(Math.round(thrown), spring.gentle);
      });
    const dismiss = Gesture.Tap().onEnd((_e, ok) => {
      if (ok) runOnJS(onClose)();
    });
    return Gesture.Exclusive(drag, dismiss);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  // a detent every time a new topic takes the focus point
  useAnimatedReaction(
    () => Math.round(spin.value),
    (cur, prev) => {
      if (prev !== null && cur !== prev) runOnJS(tick)();
    },
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* drag surface sits behind the bubbles so their taps still land */}
      <GestureDetector gesture={browse}>
        <View style={StyleSheet.absoluteFill} />
      </GestureDetector>
      {WHEEL_ITEMS.map((t, i) => (
        <ArcBubble key={t ?? 'foryou'} index={i} spin={spin} cy={cy} ry={ry}>
          {t === null ? (
            <Press
              haptic={false}
              onPress={() => {
                spin.value = i;
                onSelect(t);
              }}
              scaleTo={0.94}
              style={{ alignItems: 'center' }}
            >
              <View style={[st.forYouBubble, { backgroundColor: brand }]}>
                <LIcon name="sparkles" size={20} color="#fff" strokeWidth={2.2} />
                <Txt size={12} weight="bold" color="#fff" style={{ marginTop: 3 }}>
                  For You
                </Txt>
              </View>
            </Press>
          ) : (
            <TopicBubble
              topic={t}
              size={BUBBLE}
              selected={selected === t}
              onPress={() => {
                spin.value = i;
                onSelect(t);
              }}
            />
          )}
        </ArcBubble>
      ))}
    </View>
  );
}

// translate and scale live on separate views so the scale always pivots on the
// bubble's own centre rather than its translated origin
function ArcBubble({
  index,
  spin,
  cy,
  ry,
  children,
}: {
  index: number;
  spin: SharedValue<number>;
  cy: number;
  ry: number;
  children: React.ReactNode;
}) {
  const place = useAnimatedStyle(() => {
    const theta = arcAngle(index, spin.value);
    const ad = Math.abs(theta);
    return {
      opacity: interpolate(ad, [0, 0.42, 1.15, ARC_EDGE], [1, 0.66, 0.26, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: ARC_CX - ARC_RX * Math.cos(theta) - BUBBLE / 2 },
        { translateY: cy + ry * Math.sin(theta) - BUBBLE / 2 },
      ],
    };
  });
  const size = useAnimatedStyle(() => {
    const ad = Math.abs(arcAngle(index, spin.value));
    return { transform: [{ scale: interpolate(ad, [0, 0.42, 1.0, ARC_EDGE], [1.58, 0.98, 0.66, 0.48], Extrapolation.CLAMP) }] };
  });
  return (
    <Animated.View
      style={[{ position: 'absolute', left: 0, top: 0, width: BUBBLE, height: BUBBLE, alignItems: 'center', justifyContent: 'center' }, place]}
    >
      <Animated.View style={size}>{children}</Animated.View>
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
  const { isSaved, toggleSaved, isLiked, toggleLiked } = useStore();
  const [burst, setBurst] = useState(0);
  const [saveRing, setSaveRing] = useState(0);
  const saved = isSaved(a.id);
  const liked = isLiked(a.id);

  const heartPop = useSharedValue(0);
  React.useEffect(() => {
    if (!liked) return;
    heartPop.value = withSequence(
      withTiming(1, { duration: 120, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 240, easing: Easing.out(Easing.cubic) }),
    );
  }, [liked, heartPop]);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + heartPop.value * 0.34 }] }));

  const imgH = Math.max(height * 0.36, 240);

  // ramp occupies exactly FEATHER px of a sheet that runs to the bottom
  const { sheetStops, washStops } = useMemo(() => {
    const sheetH = Math.max(height - (imgH - FEATHER), FEATHER + 1);
    const f = FEATHER / sheetH;
    return {
      sheetStops: [0, f * 0.3, f * 0.55, f * 0.75, f * 0.9, f, 1] as [number, number, ...number[]],
      // stays fully clear across the photo and only picks up colour once the
      // glass has taken over — otherwise its top edge cuts a band across the image
      washStops: [0, f * 0.85, Math.min(f + 0.16, 0.94), 1] as [number, number, ...number[]],
    };
  }, [height, imgH]);

  const imgSource = a.imageUrl ? { uri: a.imageUrl } : artFor(a.topic);
  // ambient glass: the article's own image, heavily blurred, becomes the
  // card's backdrop so its palette bleeds through the whole surface
  const tint = isDark ? 'rgba(8,11,20,0.40)' : 'rgba(255,255,255,0.26)';
  // sharp image dissolves via a TRUE alpha mask — no bands, no seams
  const fadeH = imgH + 110;

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
              colors={['#000', '#000', 'rgba(0,0,0,0.62)', 'rgba(0,0,0,0.22)', 'rgba(0,0,0,0)']}
              locations={[0, 0.42, 0.66, 0.85, 1]}
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
      <View style={[s.sheet, { top: imgH - FEATHER }]}>
        {Platform.OS === 'web' ? (
          <BlurView intensity={26} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        ) : null}
        {/* A single gradient spanning the whole sheet — nothing is painted on
            top of it, so there is no edge anywhere. Stops are derived from
            FEATHER so the melt is the same pixel length on every screen, and
            eased (not linear) so it never bands. */}
        <LinearGradient
          colors={
            isDark
              ? ([
                  'rgba(12,17,29,0)',
                  'rgba(12,17,29,0.07)',
                  'rgba(12,17,29,0.19)',
                  'rgba(12,17,29,0.37)',
                  'rgba(12,17,29,0.50)',
                  SHEET_DARK,
                  SHEET_DARK,
                ] as any)
              : ([
                  'rgba(255,255,255,0)',
                  'rgba(255,255,255,0.07)',
                  'rgba(255,255,255,0.20)',
                  'rgba(255,255,255,0.40)',
                  'rgba(255,255,255,0.54)',
                  SHEET_LIGHT,
                  SHEET_LIGHT,
                ] as any)
          }
          locations={sheetStops}
          style={StyleSheet.absoluteFill}
        />
        {/* the photo's colour carries on down into the sheet instead of
            stopping dead at pure white */}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0)', t.wash, 'rgba(0,0,0,0)'] as any}
          locations={washStops}
          style={StyleSheet.absoluteFill}
        />

        <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: FEATHER + 22 }}>
        <Headline numberOfLines={4} style={{ fontSize: 24, lineHeight: 29, letterSpacing: -0.7 }}>
          {a.title}
        </Headline>

        <Animated.View
          entering={FadeInDown.duration(320).springify().damping(30).stiffness(250).mass(0.9)}
          style={{ flex: 1, marginTop: 22 }}
        >
          <SummaryBody a={a} />
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
                <Animated.View style={heartStyle}>
                  <LIcon name="heart" size={18} color={liked ? c.breaking : c.ink} fill={liked ? c.breaking : 'none'} />
                </Animated.View>
              </Press>
              {burst > 0 && liked ? <HeartBurst key={burst} /> : null}
            </View>
            <View>
              <Press
                haptic={false}
                scaleTo={0.9}
                onPress={() => {
                  if (!saved) {
                    saveHaptic();
                    setSaveRing((r) => r + 1);
                  } else {
                    tick();
                  }
                  toggleSaved(a.id, a.topic);
                }}
                style={[s.actionCircle, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(11,13,18,0.045)' }, saved ? { backgroundColor: c.brand, boxShadow: '0 6px 18px rgba(57,121,255,0.4)' } : null]}
              >
                <LIcon name="bookmark" size={16} color={saved ? '#fff' : c.ink} fill={saved ? '#fff' : 'none'} />
              </Press>
              {saveRing > 0 && saved ? <SaveRing key={saveRing} color={c.brand} /> : null}
            </View>
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

/* Reading type. Measure here is ~41 characters — mobile can't reach the 66ish
   print ideal, and on lines that short generous leading reads as disconnected
   rather than airy, so the ratio is ~1.55 instead of the 1.7 it was. Body stays
   on the UI face: at this size Inter is the most legible thing we have. */
function SummaryBody({ a }: { a: Article }) {
  const { c, isDark } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Txt
        size={17}
        lh={26.5}
        color={isDark ? '#DCE4F0' : '#1E242F'}
        numberOfLines={11}
      >
        {a.summary}
      </Txt>
    </View>
  );
}

function SaveRing({ color }: { color: string }) {
  const v = useSharedValue(0);
  React.useEffect(() => {
    v.value = withTiming(1, { duration: 480, easing: Easing.out(Easing.cubic) });
  }, [v]);
  const a = useAnimatedStyle(() => ({
    opacity: 1 - v.value,
    transform: [{ scale: 1 + v.value * 1.1 }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top: -2,
          left: -2,
          width: 46,
          height: 46,
          borderRadius: 23,
          borderWidth: 2,
          borderColor: color,
        },
        a,
      ]}
    />
  );
}

// One driver, no springs: particles fly out, shrink and fade in 520ms, then
// the whole thing is gone. Bouncy per-dot ZoomIn read as jitter.
function HeartBurst() {
  const v = useSharedValue(0);
  React.useEffect(() => {
    v.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) });
  }, [v]);

  const ring = useAnimatedStyle(() => ({
    opacity: (1 - v.value) * 0.9,
    transform: [{ scale: 0.4 + v.value * 1.5 }],
  }));

  return (
    <View pointerEvents="none" style={s.burstWrap}>
      <Animated.View style={[s.burstRing, ring]} />
      {[...Array(6)].map((_, i) => {
        const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
        return <BurstDot key={i} angle={angle} v={v} />;
      })}
    </View>
  );
}

function BurstDot({ angle, v }: { angle: number; v: SharedValue<number> }) {
  const a = useAnimatedStyle(() => {
    const d = 8 + v.value * 22;
    return {
      opacity: 1 - v.value,
      transform: [
        { translateX: Math.cos(angle) * d },
        { translateY: Math.sin(angle) * d },
        { scale: interpolate(v.value, [0, 0.35, 1], [0.2, 1, 0.15], Extrapolation.CLAMP) },
      ],
    };
  });
  return <Animated.View style={[s.burstDot, { position: 'absolute' }, a]} />;
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
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.breaking,
  },
  burstRing: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.breaking,
  },
});
