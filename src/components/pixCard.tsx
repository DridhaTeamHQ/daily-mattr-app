import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Share, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { radius, topicOf, BLUR_MAX } from '@/theme';
import { useTheme } from '@/lib/theme';
import { Txt, Press, LIcon, EasedScrim, BreakingBadge } from './ui';
import { CommentsPanel } from './commentsPanel';
import { type Article, timeAgo, isBreaking } from '@/lib/content';
import { useIsSaved, useIsLiked, useIsDisliked, storeActions } from '@/lib/store';
import { track, trackImpression } from '@/lib/telemetry';
import { trackContent, trackView } from '@/lib/engagement';
import { artFor } from '@/lib/topicArt';
import { highlightRuns } from '@/lib/highlight';
import { pixStyleFor, HEADLINE_SIZE, type PixStyle } from '@/lib/pixStyles';
import { pixPoints } from '@/lib/feed';
import { tick, soft, save as saveHaptic } from '@/lib/haptics';
import { enterChrome } from '@/lib/transitions';
import { ImagePeek } from './imagePeek';

const GUTTER = 24;

/* A story told as two slides: the photo carrying the headline, then the same
   photo standing back so the three key points can be read. The look is drawn
   from a preset chosen by article id, so the feed varies without the layout
   logic multiplying.

   Two placements. In a list it is a card among rows, so it keeps its gutters
   and its own entrance. On a page of its own — the Pix slot in the mixed
   reader deck — it is the whole subject, so the footer flips to light type and
   the card sits on the ambient backdrop the page provides (see PixPage in
   app/(tabs)/reader.tsx). The old version sat on the raw canvas, which meant a
   dark object stranded in the middle of a blank white sheet. */
function PixCardBase({
  a,
  index = 0,
  variant = 'list',
  height,
  commentCount = 0,
}: {
  a: Article;
  index?: number;
  variant?: 'list' | 'page';
  /** overrides the card height; the page placement has a whole screen to fill */
  height?: number;
  commentCount?: number;
}) {
  const { c, isDark } = useTheme();
  const router = useRouter();
  const { width: winW } = useWindowDimensions();
  // On a page the card starts at the very top of the screen, so its chrome has
  // to clear the status bar itself — nothing above it is doing that.
  const insets = useSafeAreaInsets();
  // per-card boolean subscriptions rather than the whole store — same reason
  // as ReaderCard; a Pix deck keeps several of these mounted at once
  const { toggleSaved, toggleLiked, toggleDisliked } = storeActions();

  const [page, setPage] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const [peeking, setPeeking] = useState(false);

  const style = useMemo(() => pixStyleFor(a.id), [a.id]);
  const runs = useMemo(() => highlightRuns(a.title), [a.title]);
  // the same function the feed's Pix gate uses, so a story promoted into a
  // Pix slot always has something to put on the second slide
  const bullets = useMemo(() => pixPoints(a), [a]);
  const t = topicOf(a.topic);
  const onPage = variant === 'page';

  React.useEffect(() => {
    trackImpression(a.id, a.topic);
    trackView(a.id);
  }, [a.id, a.topic]);

  // In the deck the card IS the page: edge to edge, no gutter, no rounding.
  // Inset on a page reads as a card stranded on a backdrop; full bleed reads
  // as a format. In the Home list it stays a card among rows.
  const W = onPage ? winW : winW - GUTTER * 2;
  const H = height ?? Math.round(Math.min(winW * 1.28, 520));

  const onScroll = useCallback(
    (e: any) => {
      const p = Math.round(e.nativeEvent.contentOffset.x / W);
      if (p !== page) setPage(p);
    },
    [W, page],
  );

  const liked = useIsLiked(a.id);
  const disliked = useIsDisliked(a.id);
  const saved = useIsSaved(a.id);

  return (
    /* No entering animation, in either placement.

       Both the Home feed and the reader deck are virtualized, so this card
       mounts when it is paged in — mid-scroll — not at first paint. A card
       that slides up as you scroll past it is movement the finger did not
       ask for. See the note on ArticleRow in components/cards.tsx. */
    <Animated.View style={{ marginBottom: onPage ? 0 : 26 }}>
      <View
        style={[
          s.card,
          { width: W, height: H, backgroundColor: isDark ? '#0C111D' : '#0E1524' },
          onPage
            ? { marginHorizontal: 0, borderRadius: 0 }
            : { marginHorizontal: GUTTER },
        ]}
      >
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          decelerationRate="fast"
          style={{ flex: 1 }}
        >
          <SlideOne
            a={a}
            style={style}
            runs={runs}
            W={W}
            H={H}
            topicGrad={t.grad}
            wash={t.wash}
            onPage={onPage}
            peeking={peeking}
            setPeeking={setPeeking}
          />
          <SlideTwo a={a} style={style} bullets={bullets} W={W} H={H} wash={t.wash} />
        </ScrollView>

        {/* chrome sits above both slides — one line, no lozenges, matching
            the deck's cards */}
        <View style={[s.top, { top: (onPage ? insets.top : 0) + 14 }]} pointerEvents="none">
          {isBreaking(a) ? (
            <BreakingBadge />
          ) : (
            <View style={s.tagRow}>
              <LinearGradient colors={t.grad} style={s.tagDot} />
              <Txt size={11} weight="bold" color="#fff" ls={0.2} style={s.tagInk}>
                {a.topic}
              </Txt>
              <Txt size={11} weight="medium" color="rgba(255,255,255,0.62)" style={s.tagInk}>
                ·
              </Txt>
              <Txt size={11} weight="medium" color="rgba(255,255,255,0.82)" style={s.tagInk}>
                {timeAgo(a.publishedAt)}
              </Txt>
            </View>
          )}
        </View>

        <View style={[s.dots, onPage ? { bottom: 50 } : null]} pointerEvents="none">
          {[0, 1].map((i) => (
            <View
              key={i}
              style={[
                s.dot,
                page === i
                  ? { width: 16, backgroundColor: '#fff' }
                  : { backgroundColor: 'rgba(255,255,255,0.4)' },
              ]}
            />
          ))}
        </View>

        <View style={[s.actions, onPage ? { bottom: 72 } : null]}>
          <PixAction
            icon="thumbs-up"
            label="Like"
            active={liked}
            activeColor={c.brand}
            onPress={() => {
              soft();
              toggleLiked(a.id, a.topic);
            }}
          />
          <PixAction
            icon="thumbs-down"
            label="Dislike"
            active={disliked}
            activeColor="#FF9F45"
            onPress={() => {
              soft();
              toggleDisliked(a.id, a.topic);
            }}
          />
          <PixAction
            icon="message-circle"
            label={commentCount > 0 ? `Comments, ${commentCount}` : 'Comment'}
            badge={commentCount}
            badgeColor={c.brand}
            active={showComments}
            activeColor={c.brand}
            onPress={() => {
              tick();
              setShowComments((v) => !v);
            }}
          />
          <PixAction
            icon="bookmark"
            label="Save"
            active={saved}
            activeColor={c.brand}
            onPress={() => {
              if (saved) tick();
              else saveHaptic();
              toggleSaved(a.id, a.topic);
            }}
          />
          <PixAction
            icon="share-2"
            label="Share"
            onPress={() => {
              tick();
              track({ article_id: a.id, event_type: 'share', topic: a.topic });
              void trackContent(a.id, 'share');
              Share.share({ message: `${a.title}\n\n${a.url}` });
            }}
          />
        </View>

        {/* comments take the whole card rather than squeezing into a slide */}
        {showComments ? (
          <Animated.View entering={enterChrome()} style={[StyleSheet.absoluteFill, s.commentsWrap, { backgroundColor: isDark ? 'rgba(10,14,23,0.97)' : 'rgba(255,255,255,0.97)' }]}>
            <CommentsPanel articleId={a.id} onClose={() => setShowComments(false)} />
          </Animated.View>
        ) : null}
      </View>

      <Press
        haptic={false}
        onPress={() => {
          tick();
          track({ article_id: a.id, event_type: 'open_full', topic: a.topic });
          router.push(`/article/${a.id}`);
        }}
        scaleTo={0.97}
        accessibilityRole="button"
        accessibilityLabel={`Read the full story from ${a.publisher}`}
        style={[
          s.footer,
          onPage
            ? { position: 'absolute', left: 22, right: 22, bottom: 16, marginHorizontal: 0, marginTop: 0 }
            : { marginHorizontal: GUTTER },
        ]}
      >
        <Txt size={12.5} weight="semibold" color={onPage ? 'rgba(255,255,255,0.92)' : c.inkSoft}>
          {a.publisher} · Read full story
        </Txt>
        <LIcon
          name="chevron-right"
          size={14}
          color={onPage ? 'rgba(255,255,255,0.92)' : c.inkSoft}
          strokeWidth={2.4}
        />
      </Press>
    </Animated.View>
  );
}

/* Memoised: a feed cell must not re-render because the list array was rebuilt.
   See the note on ArticleRow in components/cards.tsx. */
export const PixCard = React.memo(PixCardBase);

/* Glass circle with a hairline ring, and a pop when it lights.

   No visible labels here, unlike the reel's rail. This row sits inside a
   composed photo layout with a headline and page dots already competing for
   the lower third, and five captions would turn a designed slide into a
   toolbar. The label is the accessibility name instead.

   The pop is what makes the tap feel like it did something — a fill colour
   appearing with no motion reads as a repaint rather than a response. */
function PixAction({
  icon,
  label,
  active,
  activeColor,
  badge = 0,
  badgeColor,
  onPress,
}: {
  icon: string;
  /** accessibility name; not drawn */
  label: string;
  active?: boolean;
  activeColor?: string;
  /** drawn as a count chip when > 0 */
  badge?: number;
  badgeColor?: string;
  onPress: () => void;
}) {
  const pop = useSharedValue(0);
  useEffect(() => {
    if (!active) return;
    pop.value = withSequence(
      withTiming(1, { duration: 130, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 240, easing: Easing.out(Easing.cubic) }),
    );
  }, [active, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pop.value * 0.3 }] }));

  const lit = !!(active && activeColor);
  return (
    <Press
      haptic={false}
      hitSlop={6}
      onPress={onPress}
      scaleTo={0.86}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
    >
      <Animated.View
        style={[
          s.action,
          lit ? { backgroundColor: activeColor, borderColor: activeColor } : null,
          popStyle,
        ]}
      >
        <LIcon name={icon} size={17} color="#fff" fill={lit ? '#fff' : 'none'} strokeWidth={2} />
      </Animated.View>
      {badge > 0 ? (
        <View style={[s.badge, { backgroundColor: badgeColor }]}>
          <Txt size={9.5} weight="bold" color="#fff">
            {badge > 99 ? '99+' : badge}
          </Txt>
        </View>
      ) : null}
    </Press>
  );
}

/* ---------- slide 1: the photo carries the headline ---------- */

function SlideOne({
  a,
  style,
  runs,
  W,
  H,
  topicGrad,
  wash,
  onPage,
  peeking,
  setPeeking,
}: {
  a: Article;
  style: PixStyle;
  runs: { text: string; hit: boolean }[];
  W: number;
  H: number;
  topicGrad: [string, string];
  wash: string;
  onPage?: boolean;
  peeking: boolean;
  setPeeking: (v: boolean) => void;
}) {
  const { c } = useTheme();
  const src = a.imageUrl ? { uri: a.imageUrl } : artFor(a.topic);
  const type = HEADLINE_SIZE[style.size];

  // how much of the slide the photo occupies
  /* 0.58 was tuned for the 480pt list card. On a full page that leaves a panel
     nearly 350pt deep with the headline pinned to the bottom of it, and the
     empty middle is the blank space the design reads as. The photo takes more
     of a page, and the story starts immediately beneath it instead of being
     pushed to the floor. */
  const insetRatio = onPage ? 0.66 : 0.58;
  const photoH =
    style.frame === 'bleed' ? H : style.frame === 'inset' ? Math.round(H * insetRatio) : Math.round(H * 0.4);

  const place =
    style.anchor === 'top'
      ? { top: 62 }
      : style.anchor === 'centre'
        ? { top: 0, bottom: 0, justifyContent: 'center' as const }
        : onPage
          ? { top: photoH + 24 } // hangs off the photo, not off the floor
          : { bottom: 78 };

  return (
    <View style={{ width: W, height: H }}>
      {/* hold the photograph to see the whole frame, uncropped. Pressable
          rather than a gesture recogniser, so all three surfaces detect the
          hold the same way — see the note in imagePeek.tsx. */}
      <ImagePeek source={src} caption={a.title} held={peeking} />
      <Pressable
        onLongPress={() => setPeeking(true)}
        onPressOut={() => setPeeking(false)}
        delayLongPress={240}
        style={{ height: photoH, overflow: 'hidden' }}
      >
        <Image source={src} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={a.id} transition={260} />
        {style.scrim === 'duotone' ? (
          <LinearGradient colors={[topicGrad[0] + 'cc', topicGrad[1] + 'e6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        ) : style.scrim === 'topic' ? (
          <LinearGradient colors={[wash, 'rgba(0,0,0,0)']} style={StyleSheet.absoluteFill} />
        ) : null}
        {/* the melt: always long, never a hard edge */}
        <EasedScrim variant="bottom" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: Math.round(photoH * 0.72) }} />
        {style.anchor === 'top' ? (
          <EasedScrim variant="top" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: Math.round(photoH * 0.5) }} />
        ) : null}
      </Pressable>

      <View
        style={[
          s.copy,
          place,
          style.align === 'centre' ? { alignItems: 'center' } : null,
        ]}
        pointerEvents="none"
      >
        <Txt
          display
          size={type.size}
          lh={type.lh}
          weight="extrabold"
          ls={-0.7}
          color="#fff"
          numberOfLines={4}
          style={style.align === 'centre' ? { textAlign: 'center' } : null}
        >
          {runs.map((r, i) =>
            r.hit && style.accent !== 'none' ? (
              <Txt
                key={i}
                display
                size={type.size}
                lh={type.lh}
                weight="extrabold"
                ls={-0.7}
                color="#fff"
                style={
                  style.accent === 'fill'
                    ? { backgroundColor: c.brand }
                    : style.accent === 'underline'
                      ? { textDecorationLine: 'underline', textDecorationColor: c.brand }
                      : { color: c.brandLight }
                }
              >
                {r.text}
              </Txt>
            ) : (
              <Txt key={i} display size={type.size} lh={type.lh} weight="extrabold" ls={-0.7} color="#fff">
                {r.text}
              </Txt>
            ),
          )}
        </Txt>
        {style.accent === 'bar' ? <View style={[s.bar, { backgroundColor: c.brand }]} /> : null}
      </View>
    </View>
  );
}

/* ---------- slide 2: the photo stands back, the points speak ---------- */

function SlideTwo({
  a,
  style,
  bullets,
  W,
  H,
  wash,
}: {
  a: Article;
  style: PixStyle;
  bullets: string[];
  W: number;
  H: number;
  wash: string;
}) {
  const { c } = useTheme();
  const src = a.imageUrl ? { uri: a.imageUrl } : artFor(a.topic);

  return (
    <View style={{ width: W, height: H }}>
      {style.back === 'canvas' ? (
        <LinearGradient colors={['#101827', '#070B12']} style={StyleSheet.absoluteFill} />
      ) : (
        <>
          <Image
            source={src}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            // 40 was past the point where Android's blur stops improving and
            // only gets more expensive — each radius produces its own
            // full-size bitmap, on top of the sharp copy slide one holds
            blurRadius={style.back === 'dim' ? BLUR_MAX : 12}
            recyclingKey={a.id + '-b'}
            transition={200}
          />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: style.back === 'dim' ? 'rgba(8,11,20,0.78)' : 'rgba(8,11,20,0.6)' }]} />
        </>
      )}
      {style.back === 'band' ? (
        <View style={{ height: Math.round(H * 0.26), overflow: 'hidden' }}>
          <Image source={src} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
          <EasedScrim variant="bottom" style={StyleSheet.absoluteFill} />
        </View>
      ) : null}
      <LinearGradient colors={[wash, 'rgba(0,0,0,0)']} style={StyleSheet.absoluteFill} />

      <View style={[s.points, style.back === 'band' ? { paddingTop: 14 } : null]}>
        {bullets.map((b, i) => (
          /* These used to stagger in. They never actually played — the card
             mounts while slide one is showing, so by the time you swipe here
             the animation has long finished, and the only thing it cost was
             three more animated nodes per card in a virtualized deck. */
          <View key={i} style={s.point}>
            {style.marker === 'numeral' ? (
              <Txt display size={12} weight="extrabold" color={c.brandLight} style={{ width: 22, marginTop: 2 }}>
                {String(i + 1).padStart(2, '0')}
              </Txt>
            ) : style.marker === 'rule' ? (
              <View style={[s.rule, { backgroundColor: c.brand }]} />
            ) : (
              <View style={[s.dotMark, { backgroundColor: c.brand }]} />
            )}
            {/* A tl;dr bullet is one short line; a sentence lifted from the
                summary can run long, and three long ones would push past the
                slide. Clipping is the honest failure here — the headline on
                slide one already carries the story. */}
            <Txt size={14} lh={21} color="rgba(255,255,255,0.94)" style={{ flex: 1 }} numberOfLines={5}>
              {b}
            </Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  // only on a page of its own, where the card has to read as an object sitting
  // on the backdrop rather than a hole cut into it
  lift: { boxShadow: '0 20px 48px rgba(0,0,0,0.45)' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 12, alignSelf: 'flex-start' },
  top: {
    position: 'absolute',
    left: 20,
    right: 66, // clears the dial button on a page
    flexDirection: 'row',
    alignItems: 'center',
  },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  tagDot: { width: 7, height: 7, borderRadius: 4 },
  tagInk: {
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  copy: {
    position: 'absolute',
    left: 20,
    right: 20,
  },
  bar: { width: 34, height: 3, borderRadius: 2, marginTop: 12 },
  points: {
    position: 'absolute',
    left: 22,
    right: 22,
    top: 74,
    bottom: 74,
    justifyContent: 'center',
    gap: 16,
  },
  point: { flexDirection: 'row', gap: 11, alignItems: 'flex-start' },
  dotMark: { width: 7, height: 7, borderRadius: 4, marginTop: 7 },
  rule: { width: 14, height: 2, borderRadius: 1, marginTop: 10 },
  dots: {
    position: 'absolute',
    bottom: 18,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  dot: { width: 5, height: 5, borderRadius: 3 },
  actions: {
    position: 'absolute',
    bottom: 34,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  action: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11,13,18,0.44)',
    // the ring is what stops five dark circles reading as smudges on a dark
    // photograph — it catches the image behind and gives each one an edge
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.26)',
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -4,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentsWrap: { padding: 16, borderRadius: radius.lg },
});
