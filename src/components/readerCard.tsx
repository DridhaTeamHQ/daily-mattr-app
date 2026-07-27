import React, { useMemo, useState } from 'react';
import { View, StyleSheet, Share, Platform, Pressable } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { colors, radius, shadow, spring, topicOf, BLUR_MAX } from '@/theme';
import { Txt, Press, BreakingBadge, EasedScrim, LIcon } from './ui';
import { CommentsPanel } from './commentsPanel';
import { SpokenText } from './spokenText';
import {
  toggleSpeech,
  stop as stopSpeech,
  speakingId,
  useIsSpeaking,
  useSpokenStart,
  useSpokenLength,
} from '@/lib/speech';
import { type Article, timeAgo, isBreaking } from '@/lib/content';
import { useIsSaved, useIsLiked, storeActions } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { useNavVisibility } from '@/lib/navVisibility';
import { track } from '@/lib/telemetry';
import { artFor } from '@/lib/topicArt';
import { publisherMark } from '@/lib/publisherLogo';
import { tick, soft, save as saveHaptic } from '@/lib/haptics';
import { enterChrome, reflow } from '@/lib/transitions';

/* The full-screen reader card, lifted out of app/(tabs)/reader.tsx.

   That file had grown to 1600 lines holding the deck, the topic dial, this
   card and the page shell — four separable concerns in one scroll. Nothing
   here changed in the move. */

// The blend zone: how far the glass takes to melt from clear to readable.
// Long on purpose — a short ramp reads as an edge.
const FEATHER = 178;
const SHEET_LIGHT = 'rgba(255,255,255,0.62)';
const SHEET_DARK = 'rgba(12,17,29,0.58)';

// eases the headline up when comments take the card over
const CONTENT_SHIFT = reflow();

export const ReaderCardMemo = React.memo(
  ReaderCard,
  (p, n) =>
    p.a.id === n.a.id &&
    p.height === n.height &&
    p.topInset === n.topInset &&
    p.commentCount === n.commentCount &&
    p.bandStart === n.bandStart,
);

function ReaderCard({
  a,
  height,
  topInset,
  commentCount = 0,
  bandStart,
}: {
  a: Article;
  height: number;
  topInset: number;
  commentCount?: number;
  /** set only on the first card of a recency band */
  bandStart?: string;
}) {
  const { c, isDark } = useTheme();
  const nav = useNavVisibility();

  // Pull the card rightward to open the publisher's own page. activeOffsetX
  // keeps it from stealing the vertical paging gesture, and failOffsetY bails
  // the moment the drag is really a scroll.
  const openSource = () => {
    track({ article_id: a.id, event_type: 'open_full', topic: a.topic });
    WebBrowser.openBrowserAsync(a.url);
  };
  const drag = useSharedValue(0);
  const swipeToSource = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX(18)
        .failOffsetY([-14, 14])
        .onUpdate((e) => {
          drag.value = Math.max(0, Math.min(e.translationX, 130));
        })
        .onEnd((e) => {
          if (e.translationX > 96) runOnJS(openSource)();
          drag.value = withSpring(0, spring.snappy);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [a.id, a.url],
  );
  const dragStyle = useAnimatedStyle(() => ({ transform: [{ translateX: drag.value * 0.5 }] }));
  const hintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(drag.value, [0, 40, 96], [0, 0.5, 1], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(drag.value, [0, 96], [0.8, 1], Extrapolation.CLAMP) }],
  }));
  const t = topicOf(a.topic);
  /* Two boolean subscriptions instead of the whole context. This is the
     change that stops every mounted card re-rendering on every swipe — see
     the comment block in lib/store.tsx. */
  const saved = useIsSaved(a.id);
  const liked = useIsLiked(a.id);
  const { toggleSaved, toggleLiked } = storeActions();
  const [burst, setBurst] = useState(0);
  const [saveRing, setSaveRing] = useState(0);
  const [showComments, setShowComments] = useState(false);
  // latches once comments have been opened on this card — see the summary's
  // entering prop below
  const [usedComments, setUsedComments] = useState(false);


  // Listen. One string is spoken — headline, then summary — so the two blocks
  // below map the synthesiser's character index back into their own text using
  // SUMMARY_AT as the seam.
  const spokenText = useMemo(() => `${a.title}. ${a.summary}`, [a.title, a.summary]);
  // only a boolean here: the per-word index is read by the leaf components, so
  // a word changing repaints the text and not this whole card
  const listening = useIsSpeaking(a.id);

  // scrolling a card away unmounts it — don't leave its audio talking to nobody
  React.useEffect(
    () => () => {
      if (speakingId() === a.id) stopSpeech();
    },
    [a.id],
  );

  // One definition for the action buttons instead of the same fill pasted into
  // each of the five. The hairline ring is what stops them reading as flat grey
  // blobs on the frosted sheet — it catches the sheet behind them and gives the
  // circle an edge, and the lit state carries the same brand glow everywhere
  // rather than only on save.
  const rest = {
    backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(11,13,18,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(11,13,18,0.07)',
  };
  const on = { backgroundColor: c.brand, borderColor: c.brand, ...shadow.tab };

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
    <GestureDetector gesture={swipeToSource}>
      <Animated.View style={[{ height, backgroundColor: c.bg, overflow: 'hidden' }, dragStyle]}>
        {/* revealed as the card is pulled across */}
        <Animated.View pointerEvents="none" style={[s.sourceHint, { top: height / 2 - 26 }, hintStyle]}>
          <View style={[s.sourceHintCircle, { backgroundColor: c.brand }]}>
            <LIcon name="external-link" size={19} color="#fff" strokeWidth={2.2} />
          </View>
          <Txt size={10.5} weight="bold" color={c.ink} style={{ marginTop: 6 }}>
            Source
          </Txt>
        </Animated.View>
    <Pressable onPress={() => nav.toggle()} style={{ flex: 1 }}>
      <Image
        source={imgSource}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        /* 90 was a decode-time convolution over a full-screen bitmap, running
           twice per swipe as cards enter the window — Android blurs are tuned
           for radii around 25 and degrade sharply past that. At this size,
           behind the tint overlay below, 28 is visually indistinguishable and
           costs a fraction. */
        blurRadius={BLUR_MAX}
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

      {/* Marks where the deck crosses into an older band. Only on the first
          card of each run — every card already carries timeAgo, so labelling
          all of them would just say the same thing twice. Absolutely
          positioned rather than a list row: the deck's snapToInterval and
          getItemLayout both assume every row is exactly pageH tall. */}
      {bandStart ? (
        <View pointerEvents="none" style={[s.bandMark, { top: topInset + 48 }]}>
          <View style={s.bandChip}>
            <Txt size={9.5} weight="bold" color="rgba(255,255,255,0.8)" ls={1.4}>
              {bandStart.toUpperCase()}
            </Txt>
          </View>
        </View>
      ) : null}

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

        {/* Comments need room, so the headline climbs the card and gives up
            lines; the panel is flex:1 and inherits everything that frees up,
            while the sheet and footer stay exactly where they were. */}
        <Animated.View
          layout={CONTENT_SHIFT}
          style={{ flex: 1, paddingHorizontal: 26, paddingTop: showComments ? topInset + 44 : FEATHER + 22 }}
        >
        <SpokenHeadline a={a} compact={showComments} />

        <View style={{ flex: 1, marginTop: 22 }}>
          {showComments ? (
            <CommentsPanel articleId={a.id} onClose={() => setShowComments(false)} />
          ) : (
            /* Animates only after this card's comments have been opened once.

               It used to be an unconditional FadeInDown, which meant every
               card the deck paged in slid its summary up from below while the
               page itself was still moving — the text appeared to lag behind
               the photo it belongs to, on every single swipe. The entrance
               exists for the crossfade back from the comments panel, so it is
               now scoped to exactly that: a freshly mounted card paints its
               summary immediately, with nothing in flight. */
            <Animated.View
              entering={usedComments ? enterChrome() : undefined}
              style={{ flex: 1 }}
            >
              <SummaryBody a={a} />
            </Animated.View>
          )}
        </View>

        {/* footer */}
        <View style={[s.footer, { paddingBottom: 26 }]}>
          {/* the verified tick is gone: it sat next to the masthead asserting
              something the app never actually checks, and once the logo
              replaced the name it was the only thing crowding the row */}
          <PublisherMark a={a} grad={t.grad} />
          <View style={s.actions}>
            <Press
              haptic={false}
              scaleTo={0.9}
              hitSlop={6}
              onPress={() => {
                soft();
                toggleSpeech(a.id, spokenText);
              }}
              style={[s.actionCircle, rest, listening ? on : null]}
            >
              <LIcon
                name={listening ? 'square' : 'headphones'}
                size={17}
                color={listening ? '#fff' : c.ink}
                fill={listening ? '#fff' : 'none'}
              />
            </Press>
            <View>
              <Press
                haptic={false}
                scaleTo={0.9}
                hitSlop={6}
                onPress={() => {
                  soft();
                  if (!liked) setBurst((b) => b + 1);
                  toggleLiked(a.id, a.topic);
                }}
                style={[s.actionCircle, rest]}
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
                hitSlop={6}
                onPress={() => {
                  if (!saved) {
                    saveHaptic();
                    setSaveRing((r) => r + 1);
                  } else {
                    tick();
                  }
                  toggleSaved(a.id, a.topic);
                }}
                style={[s.actionCircle, rest, saved ? on : null]}
              >
                <LIcon name="bookmark" size={17} color={saved ? '#fff' : c.ink} fill={saved ? '#fff' : 'none'} />
              </Press>
              {saveRing > 0 && saved ? <SaveRing key={saveRing} color={c.brand} /> : null}
            </View>
            <Press
              haptic={false}
              scaleTo={0.9}
              hitSlop={6}
              onPress={() => {
                track({ article_id: a.id, event_type: 'share', topic: a.topic });
                Share.share({ message: `${a.title}\n\n${a.url}` });
              }}
              style={[s.actionCircle, rest]}
            >
              <LIcon name="share-2" size={17} color={c.ink} />
            </Press>
            <Press
              haptic={false}
              scaleTo={0.9}
              hitSlop={6}
              onPress={() => {
                tick();
                setUsedComments(true);
                setShowComments((v) => !v);
              }}
              style={[s.actionCircle, rest, showComments ? on : null]}
            >
              <LIcon
                name="message-circle"
                size={17}
                color={showComments ? '#fff' : c.ink}
                fill={showComments ? '#fff' : 'none'}
              />
              {commentCount > 0 ? (
                <View style={[s.countBadge, { backgroundColor: c.brand }]}>
                  <Txt size={9.5} weight="bold" color="#fff">
                    {commentCount > 99 ? '99+' : commentCount}
                  </Txt>
                </View>
              ) : null}
            </Press>
          </View>
        </View>
        </Animated.View>
      </View>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

/* Reading type. Ragged right, which is what news apps actually do — justifying
   a phone-width column trades an even edge for uneven word spacing, and the rag
   also gives the eye a landmark to find its place again after glancing away.
   Hyphenation and the highQuality break strategy stay: they tighten the rag by
   letting long words split and by weighing the whole paragraph rather than
   greedily filling one line at a time. */
function SummaryBody({ a }: { a: Article }) {
  const { isDark } = useTheme();
  // Subscribed here rather than in ReaderCard on purpose: the index changes
  // several times a second while listening, and this leaf is the only thing
  // that has to repaint for it. Reading it one level up would re-render the
  // card's images, mask and gradients on every spoken word.
  const start = useSpokenStart(a.id);
  const length = useSpokenLength(a.id);
  const rel = start >= SUMMARY_AT(a) ? start - SUMMARY_AT(a) : -1;

  return (
    <View style={{ flex: 1 }}>
      <SpokenText
        text={a.summary}
        start={rel}
        length={length}
        progress={start >= 0}
        size={16.5}
        lh={26}
        color={isDark ? '#DCE4F0' : '#1E242F'}
        numberOfLines={11}
        android_hyphenationFrequency="full"
        textBreakStrategy="highQuality"
      />
    </View>
  );
}

// where the summary starts inside the spoken "<title>. <summary>"
const SUMMARY_AT = (a: Article) => a.title.length + 2;

/* The masthead, as its own mark. The name used to sit here as text and there
   was never room for it — "Hindustan Times India" arrived as "Hindustan T…" —
   whereas the logo is recognised at a glance and costs 22pt flat.

   Publishers with no bundled mark keep the old dot-and-name treatment rather
   than showing nothing, so an unrecognised feed degrades instead of vanishing.
   The name stays on both paths as the accessibility label. */
function PublisherMark({ a, grad }: { a: Article; grad: [string, string] }) {
  const { isDark } = useTheme();
  const mark = publisherMark(a.url);

  if (!mark) {
    return (
      <>
        <LinearGradient colors={grad} style={s.pubDot} />
        <Txt size={13} weight="semibold" numberOfLines={1} style={{ flexShrink: 1 }}>
          {a.publisher}
        </Txt>
      </>
    );
  }

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={a.publisher}
      style={[s.markBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.94)' : '#FFFFFF' }]}
    >
      {/* every mark is square, so cover and contain agree — no letterboxing,
          and transparent marks sit on the box's own light backing */}
      <Image source={mark} style={{ width: '100%', height: '100%' }} contentFit="cover" />
    </View>
  );
}

function SpokenHeadline({ a, compact }: { a: Article; compact: boolean }) {
  const start = useSpokenStart(a.id);
  const length = useSpokenLength(a.id);
  // the voice reads the headline first; once it crosses the seam the headline
  // is done and hands the highlight over to the summary
  const rel = start >= 0 && start < a.title.length ? start : -1;

  return (
    <SpokenText
      text={a.title}
      start={rel}
      length={length}
      display
      weight="bold"
      size={compact ? 19 : 24}
      lh={compact ? 24 : 29}
      ls={-0.7}
      numberOfLines={compact ? 2 : 4}
    />
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
  sourceHint: {
    position: 'absolute',
    left: 18,
    alignItems: 'center',
    zIndex: 5,
  },
  sourceHintCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 24px rgba(57,121,255,0.45)',
  },
  countBadge: {
    position: 'absolute',
    top: -2,
    right: -3,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTop: {
    position: 'absolute',
    left: 22,
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
  pageDim: { backgroundColor: '#000' },
  bandMark: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  bandChip: {
    backgroundColor: 'rgba(11,13,18,0.42)',
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 4,
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
  markBox: {
    // 22pt: the smallest of the bundled marks is 57px, which still covers this
    // at the 2.75x–3x densities these phones actually run at
    width: 22,
    height: 22,
    borderRadius: 6,
    overflow: 'hidden',
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  actionCircle: {
    // Back to 42 now the masthead is a 22pt mark rather than a name that
    // needed half the row. Five at 42 with 9pt gaps is 246pt, which clears the
    // narrowest phone this runs on (308pt of content width at 360dp).
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  burstWrap: {
    // centres the 20pt burst box on the 42pt action circle
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
