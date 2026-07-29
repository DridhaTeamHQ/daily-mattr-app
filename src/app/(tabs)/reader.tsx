import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Dimensions, useWindowDimensions, AppState } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { tick, soft, commit as commitHaptic } from '@/lib/haptics';
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  withSpring,
  runOnJS,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { spring } from '@/theme';
import { Txt, Press, Shimmer, LIcon, TopicBubble } from '@/components/ui';
import { fetchReaderFeed, fetchPix, fetchQix, LIVE_QUERY } from '@/lib/queries';
import { fetchCommentCounts } from '@/lib/comments';
import { invalidateSelections } from '@/lib/cms';
import { PixCard } from '@/components/pixCard';
import { ReelCard } from '@/components/reelCard';
import { PixPage } from '@/components/pixPage';
import { PageShell } from '@/components/pageShell';
import { ReaderCardMemo } from '@/components/readerCard';
import {
  TopicWheel,
  FormatBubble,
  PIX_FILTER,
  VIDEO_FILTER,
  isFormatFilter,
  WHEEL_ITEMS,
  DRAG_PX,
} from '@/components/topicDial';
import { setActiveCard } from '@/lib/activeCard';
import { composeFeed, kindOf } from '@/lib/feed';
import { NAVBAR_CLEARANCE } from '@/components/navbar';
import { type Article } from '@/lib/content';
import { storeActions } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { useNavVisibility } from '@/lib/navVisibility';
import { track, createDwellTimer } from '@/lib/telemetry';
import { bandOf } from '@/lib/timeBands';
import { noteRead } from '@/lib/progress';
import { useIsOnline } from '@/lib/network';

/* The Articles deck.

   This file used to be 1600 lines: the deck, the topic dial, the reader card,
   the Pix page and the page shell all in one scroll. Those four now live in
   components/ — topicDial, readerCard, pixPage, pageShell — and nothing here
   changed in the move. What is left is the screen: the query, the pagination
   cursor, the recency banding, and which of the three card kinds each row
   gets. */

const { width: W } = Dimensions.get('window');

// Module-level constants so their identity never changes between renders —
// FlatList treats a new viewabilityConfig or renderItem as a reason to redo
// work, and these are the two easiest ones to leak a fresh object into.
const EMPTY_COUNTS: Record<string, number> = {};
const VIEWABILITY = { itemVisiblePercentThreshold: 75 };
const keyExtractor = (a: Article) => a.id;
/** foreground dwell before a card counts toward the streak */
const QUALIFY_MS = 3000;

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

  // Mount the dial while it's open, and keep it alive through the close fade
  // and the 580ms bloom so neither animation is cut off mid-flight.
  const [dialMounted, setDialMounted] = useState(false);
  useEffect(() => {
    if (drawerOpen || revealTopic !== undefined) {
      setDialMounted(true);
      return;
    }
    const t = setTimeout(() => setDialMounted(false), 650);
    return () => clearTimeout(t);
  }, [drawerOpen, revealTopic]);

  const backdropFade = useAnimatedStyle(() => ({ opacity: 1 - reveal.value }));
  const wheelFade = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - reveal.value * 2.2) }));
  const bubbleBloom = useAnimatedStyle(() => ({
    opacity: interpolate(reveal.value, [0, 0.55, 1], [1, 0.8, 0]),
    transform: [{ scale: interpolate(reveal.value, [0, 1], [1, 9]) }],
  }));
  const online = useIsOnline();
  const [measuredH, setMeasuredH] = useState(0);
  // Hidden tab screens can measure 0 on web; fall back to the window height.
  const pageH = measuredH > 100 ? measuredH : winH;
  const scrollY = useSharedValue(0);
  /* One query, three sources. Pix and Video are formats and come from the CMS
     wholesale; anything else is the approved article set, optionally narrowed
     to a topic. */
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['readerFeed', topicFilter],
    queryFn: () =>
      topicFilter === PIX_FILTER
        ? fetchPix()
        : topicFilter === VIDEO_FILTER
          ? fetchQix()
          : fetchReaderFeed(topicFilter ? [topicFilter] : undefined),
    // keep the old deck on screen while the new topic loads — otherwise the
    // loading branch unmounts the dial mid-bloom and the tap looks ignored
    placeholderData: (prev: Article[] | undefined) => prev,
    ...LIVE_QUERY,
  });

  /* Pagination is gone, and its absence is the point.
     The deck used to page endlessly through the scraped corpus with a keyset
     cursor. The app's content is now what the desk published — a set small
     enough to arrive in one response and finite by design. There is no next
     page to ask for, so nothing asks. */
  const feedItems = data ?? [];

  const commentCounts = useQuery({
    queryKey: ['commentCounts', feedItems.map((a) => a.id).join(',')],
    queryFn: () => fetchCommentCounts(feedItems.map((a) => a.id)),
    enabled: feedItems.length > 0,
    staleTime: 60_000,
  });

  const listRef = useRef<any>(null);
  React.useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [topicFilter]);

  const nav = useNavVisibility();
  // Hiding the nav moved into the scroll handler itself: it used to be an
  // onScrollBeginDrag JS callback, so every drag round-tripped to the JS
  // thread mid-gesture. nav.hide() is a worklet and no-ops when the bar is
  // already hidden, so this costs nothing per drag.
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
    onBeginDrag: () => {
      // runOnJS: nav.hide is a plain JS function, not a worklet — see
      // lib/navVisibility.tsx. It self-guards, so repeat drags cost nothing.
      runOnJS(nav.hide)();
    },
  });

  // One pinned `now` for banding, refreshed on foreground — never Date.now()
  // during render, which would let a card near a boundary change band between
  // frames and move the marker around mid-swipe.
  const [bandNow, setBandNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setBandNow(Date.now());
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') tick();
    });
    const iv = setInterval(tick, 5 * 60_000);
    return () => {
      sub.remove();
      clearInterval(iv);
    };
  }, []);

  /* index -> label, set only where the band changes. Index 0 is skipped: the
     top of the deck is by definition the freshest, and a marker there reads as
     a header rather than a transition.

     Serialised into a string key so the 5-minute `bandNow` tick only produces
     a new object when a card has ACTUALLY crossed a boundary. Previously every
     tick minted a fresh object, which changed renderPage's identity, which made
     FlatList re-render all three mounted full-screen cards for nothing. */
  const bandKey = useMemo(() => {
    const parts: string[] = [];
    let prev: string | null = null;
    feedItems.forEach((a, i) => {
      const b = bandOf(a.publishedAt, bandNow);
      if (prev !== null && b.id !== prev) parts.push(`${i}:${b.label}`);
      prev = b.id;
    });
    return parts.join('|');
  }, [feedItems, bandNow]);

  const bandStarts = useMemo(() => {
    const out: Record<number, string> = {};
    if (!bandKey) return out;
    for (const part of bandKey.split('|')) {
      const at = part.indexOf(':');
      out[Number(part.slice(0, at))] = part.slice(at + 1);
    }
    return out;
  }, [bandKey]);

  const topInset = insets.top;
  // Stable identity. `commentCounts.data ?? {}` minted a fresh object on every
  // render while the counts query was still in flight, which changed
  // renderPage's identity, which made FlatList re-render every mounted card —
  // full-screen cards with two images and a mask each. That was the stutter.
  const counts = commentCounts.data ?? EMPTY_COUNTS;
  // Pix is a format, not a topic, so its category is a different kind of deck:
  // the boxed photo-story cards scrolling freely, exactly as designed, rather
  // than the full-screen snapping reader every other topic uses.
  const isPix = topicFilter === PIX_FILTER;

  /* For You is the mixed deck: three articles, a picture story, three
     articles, a video, repeating. composeFeed decides that running order — and
     only the order. What each card *is* comes from the desk (see lib/feed's
     kindOf), so a topic deck showing a picture story shows it as one rather
     than flattening it into a headline. */
  const isMixed = topicFilter === null;
  const pages = useMemo(
    () => (isMixed ? composeFeed(feedItems).map((f) => f.article) : feedItems),
    [isMixed, feedItems],
  );

  const renderPage = useCallback(
    ({ item, index }: { item: Article; index: number }) => {
      if (isPix) return <PixCard a={item} index={index} />;

      /* A format card still occupies one full page so the snap interval and
         getItemLayout stay exactly one screen tall — the deck's paging maths
         depends on every row being pageH, and a shorter card would break the
         snap for everything after it. */
      const kind = kindOf(item);
      if (kind === 'motion') {
        return (
          <PageShell index={index} pageH={pageH} scrollY={scrollY}>
            <ReelCard
              a={item}
              height={pageH}
              topInset={topInset}
              commentCount={counts[item.id] ?? 0}
            />
          </PageShell>
        );
      }
      if (kind === 'pix') {
        return (
          <PageShell index={index} pageH={pageH} scrollY={scrollY}>
            <PixPage a={item} height={pageH} commentCount={counts[item.id] ?? 0} />
          </PageShell>
        );
      }

      return (
        <PageShell index={index} pageH={pageH} scrollY={scrollY}>
          <ReaderCardMemo
            a={item}
            height={pageH}
            topInset={topInset}
            commentCount={counts[item.id] ?? 0}
            bandStart={bandStarts[index]}
          />
        </PageShell>
      );
    },
    // scrollY is a stable shared value ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isPix, pageH, topInset, counts, bandStarts],
  );

  const getItemLayout = useCallback(
    (_: any, i: number) => ({ length: pageH, offset: pageH * i, index: i }),
    [pageH],
  );

  // storeActions() reads the live actions without subscribing, so the Reader
  // screen no longer re-renders when history changes on every swipe.
  const recordReadRef = useRef((id: string, topic: string) =>
    storeActions().recordRead(id, topic),
  );

  const dwellRef = useRef<{ id: string; topic: string; words: number; timer: ReturnType<typeof createDwellTimer> } | null>(null);

  const closeDwell = useCallback(() => {
    const d = dwellRef.current;
    if (d) {
      const ms = d.timer.stop();
      if (ms > 500) {
        track({ article_id: d.id, event_type: 'dwell', dwell_ms: ms, words: d.words, topic: d.topic });
      }
      // The streak counts *qualified* reads only. onViewable fires at 75%
      // visibility, so a fast fling marks three or four cards viewable inside
      // a second — counting those would let anyone build a streak by flicking.
      // The dwell clock is foreground-only, so backgrounding mid-card doesn't
      // accrue either.
      if (ms >= QUALIFY_MS) noteRead(d.id, d.topic, ms);
      dwellRef.current = null;
    }
  }, []);

  // read inside the stable onViewable callback below, which FlatList captures
  // once and will not accept a new identity for
  const isPixRef = useRef(isPix);
  isPixRef.current = isPix;

  const onViewable = useRef(({ viewableItems }: any) => {
    const first = viewableItems.find((v: any) => v.isViewable);
    if (!first) return;
    const a: Article = first.item;
    if (dwellRef.current?.id === a.id) return;
    // a video card plays only while it is the card on screen (lib/activeCard)
    setActiveCard(a.id);
    closeDwell();
    // the tick marks a page landing. The Pix deck scrolls freely — cards drift
    // past rather than snapping — so a haptic per card would just be a rattle.
    if (!isPixRef.current) tick();
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
    /* Three different situations, and they used to share one message.

       "Couldn't load stories" followed by a raw fetch error reads as the app
       being broken, when nine times out of ten the phone is simply on a train.
       Now that onlineManager is wired to NetInfo (lib/network.ts) the app can
       tell the difference and say which one it is. */
    const offline = !!error && !online;
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <LIcon name={offline ? 'wifi-off' : error ? 'cloud-off' : 'layers'} size={34} color={c.inkFaint} />
        <Txt size={15} weight="bold" style={{ marginTop: 14 }}>
          {offline ? "You're offline" : error ? "Couldn't load stories" : 'All caught up'}
        </Txt>
        <Txt size={13} weight="medium" color={c.inkSoft} style={{ marginTop: 6, textAlign: 'center' }}>
          {offline
            ? 'Stories will load again as soon as you reconnect.'
            : error
              ? String((error as Error).message ?? error)
              : 'Check back soon for fresh stories.'}
        </Txt>
        {/* Retrying while offline just fails again. react-query refetches on
            its own the moment the connection returns, so the honest thing here
            is to say so rather than offer a button that cannot work. */}
        {!offline ? (
          <Press onPress={() => refetch()} style={{ marginTop: 18, backgroundColor: c.brand, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 11 }}>
            <Txt size={13.5} weight="semibold" color="#fff">
              Try again
            </Txt>
          </Press>
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }} onLayout={(e) => setMeasuredH(e.nativeEvent.layout.height)}>
      {/* Snapping: `pagingEnabled` is deliberately absent. RN documents
          snapToInterval as overriding it, and setting both had the two native
          snapping paths fighting each other on Android. snapToInterval is the
          configurable one, and it's what disableIntervalMomentum (one card per
          swipe, so dwell tracking stays honest) hangs off.

          Windowing: each card is a full screen carrying two images — one
          blurred as the ambient backdrop — plus a mask and four gradients, so
          the window is kept tight. The old 5/3/3 kept up to five of those
          alive at once and the render cost showed up as dropped frames on
          every swipe. */}
      {pageH > 0 ? (
        <Animated.FlatList
          ref={listRef}
          data={pages}
          keyExtractor={keyExtractor}
          renderItem={renderPage}
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          {...(isPix
            ? {
                // free vertical scroll: Pix cards have their own height, so
                // there is no page to snap to and getItemLayout's fixed-height
                // assumption would be wrong
                contentContainerStyle: {
                  // clears the floating topics button and the "Pix" filter tag,
                  // which sit at insets.top + 10 and + 58 and would otherwise
                  // overlap the first card
                  paddingTop: insets.top + 96,
                  paddingBottom: NAVBAR_CLEARANCE + 20,
                },
              }
            : {
                snapToInterval: pageH,
                snapToAlignment: 'start' as const,
                decelerationRate: 'fast' as const,
                disableIntervalMomentum: true,
                getItemLayout,
              })}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={VIEWABILITY}
          onRefresh={() => {
            invalidateSelections();
            refetch();
          }}
          refreshing={false}
          // a reader card is a whole screen, a Pix card about two-thirds of
          // one — so the Pix deck needs a few more in hand to fill the
          // viewport and keep a fling ahead of the renderer
          windowSize={isPix ? 5 : 3}
          initialNumToRender={isPix ? 3 : 2}
          maxToRenderPerBatch={isPix ? 3 : 2}
          updateCellsBatchingPeriod={60}
        />
      ) : null}

      {/* topics trigger — hold to summon the dial, keep dragging to spin it,
          release on a topic to open it. A plain tap still opens it to browse. */}
      <GestureDetector gesture={topicGesture}>
        <Animated.View style={[st.topicsBtn, { top: insets.top + 10 }]}>
          <LIcon name="layout-grid" size={17} color="#fff" strokeWidth={2.2} />
        </Animated.View>
      </GestureDetector>
      {/* Which deck you are in — for topics only.

          A format filter labelled itself over cards that already announce what
          they are: a "Video" badge floating above a playing video, a "Pix" one
          over a picture story. It stacked under the topics button and turned
          that corner into three things to read. A topic is worth naming
          because nothing else on the card is the deck's name; a format is
          not. */}
      {topicFilter && !isFormatFilter(topicFilter) ? (
        <View style={[st.filterTag, { top: insets.top + 58 }]}>
          <Txt size={11.5} weight="bold" color="#fff">
            {topicFilter}
          </Txt>
        </View>
      ) : null}

      {/* Full-screen topic dial — mounted only while it's in use.

          It used to render unconditionally, with `drawerOpen` toggling nothing
          but opacity and pointerEvents. That left 13 TopicBubbles (each a
          decoded bundled image) and 30 animated nodes resident on the Articles
          tab at all times, competing with the card deck for every frame. It
          stays mounted through the close fade and the bloom, then unmounts. */}
      {dialMounted ? (
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
            {/* the dial's own bubble, not a second copy of it — the bloom's
                whole job is to look like the thing that was just tapped */}
            {revealTopic === null ? (
              <FormatBubble kind="foryou" brand={c.brand} />
            ) : isFormatFilter(revealTopic) ? (
              <FormatBubble kind={revealTopic === PIX_FILTER ? 'pix' : 'video'} brand={c.brand} />
            ) : (
              <TopicBubble topic={revealTopic} size={92} />
            )}
          </Animated.View>
        ) : null}
      </Animated.View>
      ) : null}
    </View>
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
});
