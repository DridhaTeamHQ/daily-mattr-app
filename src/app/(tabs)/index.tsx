import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl, AppState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import Animated, {
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
import { radius, duration } from '@/theme';
import { Txt, IconButton, PillTab, Shimmer, Press, LIcon, ProgressRing } from '@/components/ui';
import { useEditionProgress } from '@/lib/edition';
import { useProgress, useStreak } from '@/lib/progress';
import { dayKey } from '@/lib/day';
import { openCelebration } from '@/lib/celebration';
import { soft } from '@/lib/haptics';
import { useStore } from '@/lib/store';
import { ArticleRow } from '@/components/cards';
import { NAVBAR_CLEARANCE } from '@/components/navbar';
import { TimeBandHeader } from '@/components/timeBand';
import { groupByBand, type Band } from '@/lib/timeBands';
import { composeFeed, type FeedItem } from '@/lib/feed';
import { PixCard } from '@/components/pixCard';
import { MotionCard } from '@/components/motionCard';
import { fetchForYou, LIVE_QUERY } from '@/lib/queries';
import { CATEGORY_NAMES } from '@/lib/categories';
import { setActiveCard } from '@/lib/activeCard';
import { invalidateSelections } from '@/lib/cms';
import { pruneEdition } from '@/lib/edition';
import { getUnreadBreaking } from '@/lib/notifications';
import { useNavVisibility } from '@/lib/navVisibility';
import { useIsOnline } from '@/lib/network';
import { enterContent, enterChrome, enterScreen } from '@/lib/transitions';

/* Home is one feed now.
 *
 * It used to be three: a "Trending" tab ordered by the pipeline's rank score, a
 * "Top stories" carousel of six ordered by its prominence score, and topic tabs
 * that each ran their own query over the corpus. All three answered the same
 * question — which of the scraped thousands should lead — and none of them was
 * an editorial answer.
 *
 * The desk decides now. `is_featured` leads, approval order follows, and the
 * topic tabs narrow that one list rather than fetching a different one. */
/* One tab per category the desk actually publishes into, in its order.
   The list was hand-written and had drifted: a "Health" tab for a category the
   CMS does not have, a "Tech" tab under a different name than the desk uses,
   and Business quietly folding in "Markets & Startups". */
const TABS: { label: string; topic?: string }[] = [
  { label: 'For You' },
  ...CATEGORY_NAMES.map((name) => ({ label: name, topic: name })),
];

/* One flat array feeds the list: band headers and feed items share it so they
   scroll together and virtualize together. */
type FeedRow =
  | { t: 'band'; key: string; band: Band; first: boolean }
  | { t: 'item'; key: string; item: FeedItem; index: number; divider: boolean };

const rowKey = (r: FeedRow) => r.key;

/* Module-level, both of them: FlatList treats a new viewabilityConfig or a new
   callback identity as a reason to tear down and redo its bookkeeping, and it
   throws outright if either changes after mount. */
const VIEWABILITY = { itemVisiblePercentThreshold: 60 };

/** Marks the most-visible card active, which is what lets a video play. */
const onViewable = ({ viewableItems }: { viewableItems: { item: FeedRow; isViewable: boolean }[] }) => {
  const first = viewableItems.find((v) => v.isViewable && v.item?.t === 'item');
  if (first && first.item.t === 'item') setActiveCard(first.item.item.article.id);
};

/* Module-level so its identity never changes — FlatList treats a new
   renderItem as a reason to re-render every mounted cell. */
function renderRow({ item: r }: { item: FeedRow }) {
  if (r.t === 'band') return <TimeBandHeader band={r.band} first={r.first} />;
  const a = r.item.article;
  if (r.item.kind === 'pix') return <PixCard a={a} index={r.index} />;
  if (r.item.kind === 'motion') return <MotionCard a={a} index={r.index} />;
  return <ArticleRow a={a} index={r.index} divider={r.divider} />;
}

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
  const { c, isDark } = useTheme();
  const nav = useNavVisibility();
  const scrollY = useSharedValue(0);
  const lastY = useSharedValue(0);

  // navShown latches the last state we asked for, so runOnJS fires only when
  // visibility actually changes — a handful of times per scroll, not on every
  // frame. nav.show/hide are plain JS functions (see lib/navVisibility.tsx:
  // worklets reached through a Context could not be serialised to the UI
  // thread on device) and they write to a shared value, so crossing to JS here
  // costs a function call and re-renders nothing.
  const navShown = useSharedValue(1);
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

  const forYou = useQuery({ queryKey: ['forYou'], queryFn: fetchForYou, ...LIVE_QUERY });

  /* Today's edition is pinned, so a story the desk takes down would otherwise
     stay in it until midnight. Pruned here because this is where the live set
     is already in hand — no extra request to find out what is still published. */
  useEffect(() => {
    if (forYou.data?.length) pruneEdition(new Set(forYou.data.map((a) => a.id)));
  }, [forYou.data]);
  const unread = useQuery({ queryKey: ['breakingUnread'], queryFn: getUnreadBreaking, staleTime: 120_000 });

  const loading = forYou.isLoading;
  /* Home had no failure path at all: a query that errored simply rendered an
     empty list under the header, with nothing to say why and no way to retry.
     Silence is the worst of the options — it reads as "there is no news". */
  const failed = forYou.isError;
  const refetchFeed = () => forYou.refetch();
  const online = useIsOnline();

  /* One list, narrowed by tab. The topic tabs used to run their own query; they
     now filter what is already live, because there is nothing else to fetch. */
  const feed = useMemo(() => {
    const all = forYou.data ?? [];
    // every story already carries one of the eight — the fold happens when the
    // row is mapped (lib/categories), so this is a plain equality test
    return active.topic ? all.filter((a) => a.topic === active.topic) : all;
  }, [forYou.data, active.topic]);

  // collapse syndicated duplicates (same story pushed by multiple feeds)
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 80);
  const deduped = useMemo(() => {
    const seen = new Set<string>();
    return feed.filter((a) => {
      const k = norm(a.title);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [feed]);

  /* Everything, in the desk's order.

     There used to be a slice here: the first six went to a carousel and the
     next twelve to the list. That split existed because the feed was thousands
     of rows deep and something had to be chosen for the top. A finite,
     hand-picked feed doesn't need choosing from — the lead story is simply the
     one the desk flagged, and it leads the same list everything else is in. */
  const list = deduped;

  // Bands are computed against one pinned `now`, refreshed on foreground and
  // every 5 minutes — never Date.now() inside the render. A story sitting near
  // a boundary would otherwise flip bands between renders and the list would
  // reorder under the reader's thumb mid-scroll.
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

  /* Compose FIRST, then band.

     Doing it the other way round — composing inside each band group — restarts
     the cycle at every header, and since a band run is often only two or three
     stories, slot 3 is never reached and no Pix or video card ever appears.
     One cycle runs across the whole feed and the bands are laid over the top.

     Note what is *not* here any more: a recency sort before composing. Home
     used to re-sort the feed by timestamp, which was right when the order
     arriving was a personalization score and wrong now that it is the desk's
     running order — sorting would have thrown that away and pushed the featured
     lead into the middle of the list.

     Flattened into one array so the whole thing goes through a single
     FlatList. */
  const rows = useMemo(() => {
    const composed = composeFeed(list);
    const groups = groupByBand(composed, (f) => f.article.publishedAt, bandNow);

    const out: FeedRow[] = [];
    groups.forEach((g, gi) => {
      out.push({ t: 'band', key: `b:${g.band.id}:${gi}`, band: g.band, first: gi === 0 });
      g.items.forEach((item, i) => {
        out.push({
          t: 'item',
          key: item.key,
          item,
          // only the first band staggers its entrance; a running index across
          // groups would leave later rows waiting on a visibly broken delay
          index: gi === 0 ? i : 0,
          // a divider under a full-bleed card would draw across nothing
          divider: item.kind === 'row' && i < g.items.length - 1,
        });
      });
    });
    return out;
  }, [list, bandNow]);

  // pulling down must re-read, not re-serve: the selections cache is dropped
  // first so the refresh cannot be answered from it
  const refetchAll = () => {
    invalidateSelections();
    return forYou.refetch();
  };

  /* Everything above the feed becomes the list header. It's memoised because
     FlatList re-renders its header whenever the element identity changes, and
     this one contains the carousel — six cards with their own images and
     animated styles. */
  const header = useMemo(
    () => (
      <>
        {/* quiet header */}
        <Animated.View entering={enterScreen()} style={s.topBar}>
          <Image
            source={require('../../../assets/images/wordmark.svg')}
            style={{ width: 118, height: 22 }}
            contentFit="contain"
          />
          {/* The theme toggle used to sit here. It is a preference, it already
              has a switch in Settings, and it was taking one of only two slots
              on the app's most valuable row — spent on something a reader
              changes once. Settings takes its place. */}
          <View style={{ flexDirection: 'row' }}>
            <IconButton
              name="bell"
              size={17}
              badge={(unread.data ?? 0) > 0}
              onPress={() => router.push('/notifications')}
            />
            <IconButton name="settings" size={17} onPress={() => router.push('/settings')} />
          </View>
        </Animated.View>

        {/* editorial header — a quiet dateline over one restrained line.
            The photography below is the hero, not the type. */}
        <Animated.View
          entering={enterContent()}
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

        {/* The daily edition, on the screen people actually land on.

            The edition and the streak are the app's habit loop, and they lived
            only on Profile — the tab visited least, and the one you have to go
            looking for. A reader who never opens Profile had no idea there was
            a finite set of stories for today, or that they were most of the way
            through it. Outside the header's scroll fade on purpose: it is the
            one thing here that should not disappear as you scroll. */}
        <EditionStrip />

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

        {/* Query results are persisted to AsyncStorage, so a failed refresh
            usually still has the last good feed underneath it. The strip says
            what happened without taking the stories away; the full state only
            appears when there is genuinely nothing to show. */}
        {failed && deduped.length > 0 ? <FeedNotice online={online} onRetry={refetchFeed} /> : null}

        {loading ? (
          <View style={{ marginTop: 16, gap: 2 }}>
            <Shimmer style={{ height: 250, marginHorizontal: 24, borderRadius: 22, marginBottom: 18 }} />
            {[0, 1, 2].map((i) => (
              <Shimmer key={i} style={{ height: 68, marginHorizontal: 24, marginBottom: 14 }} />
            ))}
          </View>
        ) : failed && deduped.length === 0 ? (
          <FeedEmpty online={online} onRetry={refetchFeed} />
        ) : (
          /* The section heading, and nothing above it.

             A "Top stories" carousel used to sit here, then a breaking strip.
             Both were ways of picking a lead out of a feed too large to read,
             and both picked it by score. The lead is an editorial choice now
             and it is simply the first row. */
          <View style={[s.sectionRow, { marginTop: 20, marginBottom: 2 }]}>
            <Txt size={17} weight="bold" ls={-0.4}>
              {active.topic ?? 'Today'}
            </Txt>
            <Press onPress={() => router.push('/reader')} scaleTo={0.94} style={{ paddingVertical: 4 }}>
              <Txt size={13} weight="semibold" color={c.brand}>
                Open deck
              </Txt>
            </Press>
          </View>
        )}
      </>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loading, tab, isDark, unread.data, dateLabel, failed, online, deduped.length],
  );

  /* The end of the feed is the end of the feed.

     There was a "More stories" button here that paged deeper into the scraped
     corpus. There is no deeper: the reader has reached the end of what the desk
     published today, which is a finished feeling rather than a limitation, and
     saying so is better than a button that returns nothing. */
  const footer =
    deduped.length > 0 ? (
      <Animated.View entering={enterChrome()} style={s.caughtUp}>
        <Txt size={13.5} weight="semibold" color={c.inkFaint}>
          That&apos;s everything for now
        </Txt>
      </Animated.View>
    ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <LinearGradient colors={c.canvas} style={StyleSheet.absoluteFill} />
      <Animated.FlatList
        data={rows}
        keyExtractor={rowKey}
        renderItem={renderRow}
        /* Which card is on screen, so a video card can play and the rest stay
           paused. The deck has had this since video landed; Home never did,
           which is why a clip in the feed sat on its poster forever — the one
           surface most people scroll was the one surface that never told a
           card it was visible. */
        onViewableItemsChanged={onViewable}
        viewabilityConfig={VIEWABILITY}
        ListHeaderComponent={header}
        ListFooterComponent={loading ? null : footer}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: NAVBAR_CLEARANCE + 16 }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={false} tintColor={c.brand} onRefresh={refetchAll} />}
        /* Windowing, sized for what these rows actually contain.

           `removeClippedSubviews` is gone. React Native documents it as "may
           have bugs (missing content)", and the specific bug that matters here
           is that it detaches native views while Reanimated is still animating
           them — every Pix card, motion card and article row in this list has
           an Animated.View at its root, and the motion cards hold a repeating
           Ken Burns loop that never stops. Detaching a view out from under a
           running animation is a native fault, not a caught JS error, which
           matches a hard crash while scrolling. windowSize already bounds what
           stays mounted, so this prop was buying very little.

           windowSize 7 -> 5 and initialNumToRender 10 -> 5 for the same
           reason: a row here is not a line of text. A Pix card decodes two
           full-bleed images plus a blurred copy, and ten of those rendered
           synchronously on mount is what the "slow to update" warning was
           reporting. */
        windowSize={5}
        initialNumToRender={5}
        maxToRenderPerBatch={4}
        updateCellsBatchingPeriod={60}
      />
    </View>
  );
}

/* Today's edition, as one line.

   Deliberately a strip and not a card: Home's job is the news, and a big
   progress panel above the fold would put the app's own scorekeeping ahead of
   the stories. It states where you are, and it opens the challenge once the
   edition is finished — which is the only moment it has something to offer
   beyond information.

   Hidden entirely until the edition has been built. A ring reading "0 of 0" on
   a cold start is worse than nothing there. */
function EditionStrip() {
  const { c, isDark } = useTheme();
  const ep = useEditionProgress();
  const streak = useStreak();
  const progress = useProgress();
  const topTopics = useStore().topTopics;
  const todayRec = progress.recent[dayKey()];

  if (!ep.total) return null;

  const open = () => {
    soft();
    openCelebration({
      storiesRead: ep.read,
      editionSize: ep.total,
      minutes: Math.max(1, Math.round((todayRec?.dwellMs ?? 0) / 60000)),
      topTopic: topTopics[0] ?? null,
      streak: streak.current,
      startPhase: 'quiz',
    });
  };

  const body = (
    <>
      <ProgressRing
        size={34}
        stroke={3}
        value={ep.read / ep.total}
        color={ep.complete ? c.success : c.brand}
        track={isDark ? 'rgba(255,255,255,0.14)' : 'rgba(11,13,18,0.10)'}
      >
        {ep.complete ? <LIcon name="check" size={14} color={c.success} strokeWidth={3} /> : null}
      </ProgressRing>
      <View style={{ flex: 1 }}>
        <Txt size={13.5} weight="bold">
          {ep.complete ? "You're all caught up" : `${ep.read} of ${ep.total} read today`}
        </Txt>
        <Txt size={11.5} weight="medium" color={c.inkFaint} style={{ marginTop: 1 }}>
          {ep.complete
            ? 'Take the challenge to test what stuck'
            : `${ep.total - ep.read} stories left in today's edition`}
        </Txt>
      </View>
      {streak.current > 0 ? (
        <View style={s.streakChip}>
          <LIcon name="flame" size={12} color={c.brand} strokeWidth={2.4} />
          <Txt size={12} weight="extrabold" color={c.brand}>
            {streak.current}
          </Txt>
        </View>
      ) : null}
      {ep.complete ? <LIcon name="chevron-right" size={16} color={c.inkFaint} /> : null}
    </>
  );

  const style = [s.edition, { backgroundColor: isDark ? 'rgba(255,255,255,0.055)' : '#FFFFFF' }];

  // Only pressable once there is something to press for — an unfinished
  // edition has no quiz behind it, and a button that opens nothing is worse
  // than a line of text.
  return ep.complete ? (
    <Press onPress={open} scaleTo={0.985} accessibilityRole="button" style={style}>
      {body}
    </Press>
  ) : (
    <View accessible accessibilityLabel={`${ep.read} of ${ep.total} stories read today`} style={style}>
      {body}
    </View>
  );
}

/* A refresh failed but there is still a feed on screen — say so quietly and
   stay out of the way. Being offline is not an error the reader caused, and
   the stories under this strip are still perfectly readable. */
function FeedNotice({ online, onRetry }: { online: boolean; onRetry: () => void }) {
  const { c, isDark } = useTheme();
  return (
    <View style={[s.notice, { backgroundColor: c.bgSoft }]}>
      <LIcon name={online ? 'cloud-off' : 'wifi-off'} size={14} color={c.inkFaint} strokeWidth={2.2} />
      <Txt size={12.5} weight="medium" color={c.inkSoft} numberOfLines={1} style={{ flex: 1 }}>
        {online ? "Couldn't refresh — showing saved stories" : 'Offline — showing saved stories'}
      </Txt>
      {/* Retrying while offline just fails again; react-query refetches by
          itself the moment the connection returns. */}
      {online ? (
        <Press onPress={onRetry} scaleTo={0.94} hitSlop={8} style={{ paddingVertical: 2 }}>
          <Txt size={12.5} weight="bold" color={c.brand}>
            Retry
          </Txt>
        </Press>
      ) : null}
    </View>
  );
}

/** Nothing cached and nothing fetched — the only case where Home has to give up. */
function FeedEmpty({ online, onRetry }: { online: boolean; onRetry: () => void }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 56, paddingHorizontal: 32 }}>
      <LIcon name={online ? 'cloud-off' : 'wifi-off'} size={32} color={c.inkFaint} />
      <Txt size={15} weight="bold" style={{ marginTop: 14 }}>
        {online ? "Couldn't load stories" : "You're offline"}
      </Txt>
      <Txt size={13} weight="medium" color={c.inkSoft} style={{ marginTop: 6, textAlign: 'center' }}>
        {online
          ? 'Something went wrong reaching the newsroom.'
          : 'Stories will load again as soon as you reconnect.'}
      </Txt>
      {online ? (
        <Press
          onPress={onRetry}
          scaleTo={0.96}
          style={{ marginTop: 18, backgroundColor: c.brand, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 11 }}
        >
          <Txt size={13.5} weight="semibold" color="#fff">
            Try again
          </Txt>
        </Press>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  edition: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 24,
    marginTop: 16,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  streakChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(57,121,255,0.12)',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginHorizontal: 24,
    marginTop: 14,
    borderRadius: radius.md,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  caughtUp: {
    alignItems: 'center',
    paddingVertical: 28,
    marginTop: 8,
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
});
