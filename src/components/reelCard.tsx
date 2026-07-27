import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Share, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { radius, topicOf } from '@/theme';
import { useTheme } from '@/lib/theme';
import { Txt, Press, LIcon, EasedScrim, BreakingBadge } from './ui';
import { CommentsPanel } from './commentsPanel';
import { NAVBAR_CLEARANCE } from './navbar';
import { type Article, timeAgo, isBreaking } from '@/lib/content';
import { useIsSaved, useIsLiked, useIsDisliked, storeActions } from '@/lib/store';
import { track, trackImpression } from '@/lib/telemetry';
import { artFor } from '@/lib/topicArt';
import { publisherMark } from '@/lib/publisherLogo';
import { useNavVisibility } from '@/lib/navVisibility';
import { useMotionAllowed } from '@/lib/motion';
import { tick, soft, save as saveHaptic } from '@/lib/haptics';
import { enterChrome } from '@/lib/transitions';

/* The full-screen slot in the mixed deck — Reels/TikTok shape.

   What plays is the story's own photograph on a slow push-in, not stock
   footage. The articles table has no video column and Supabase is read-only,
   so a real clip could only ever be unrelated footage sitting under a real
   headline, which reads as filler in a news product. Every pixel here belongs
   to the story it links to, and the loop plus the sweeping progress line give
   the slot the cadence of a video without pretending to be one.

   Cost: two shared values, both driving transforms only. Transforms are
   composited off the main thread and never trigger a layout pass, so a reel
   that is mounted but scrolled past is close to free. */

const DURATION = 9000;
/** everything sits above the floating navbar */
const FLOOR = NAVBAR_CLEARANCE;

export function ReelCard({
  a,
  height,
  topInset,
  commentCount = 0,
}: {
  a: Article;
  height: number;
  topInset: number;
  commentCount?: number;
}) {
  const { c } = useTheme();
  const router = useRouter();
  const nav = useNavVisibility();
  const { width: winW } = useWindowDimensions();
  const t = topicOf(a.topic);

  const liked = useIsLiked(a.id);
  const disliked = useIsDisliked(a.id);
  const saved = useIsSaved(a.id);
  const { toggleLiked, toggleDisliked, toggleSaved } = storeActions();

  const [showComments, setShowComments] = useState(false);
  const [burst, setBurst] = useState(0);

  useEffect(() => trackImpression(a.id, a.topic), [a.id, a.topic]);

  /* Reduce Motion turns this card into a photograph.

     A nine-second Ken Burns loop that never stops, under a playhead sweeping
     the top edge, is continuous large-area movement filling the whole screen —
     the single most likely thing in this app to make someone with vestibular
     sensitivity feel unwell. With motion off the image holds still and the
     playhead is not drawn at all, because a progress bar that never progresses
     is a lie about what the card is doing. */
  const motion = useMotionAllowed();

  // Ken Burns. Reversing, so it breathes rather than snapping back to the top
  // of the loop every nine seconds.
  const ken = useSharedValue(0);
  // The playhead. Separate driver because it must NOT reverse — a progress
  // line that runs backwards reads as a scrub, not playback.
  const play = useSharedValue(0);
  useEffect(() => {
    if (!motion) {
      // a fixed point in the pan, so the crop still looks composed rather than
      // parked at the extreme of a range it never travels
      ken.value = 0.35;
      return;
    }
    ken.value = withRepeat(
      withTiming(1, { duration: DURATION, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    play.value = withRepeat(withTiming(1, { duration: DURATION, easing: Easing.linear }), -1, false);
  }, [ken, play, motion]);

  const kenStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: 1.06 + ken.value * 0.12 },
      { translateX: ken.value * -16 },
      { translateY: ken.value * -12 },
    ],
  }));
  // grows from the left inside an overflow-hidden track, so it is a translate
  // rather than a width animation — no layout pass per frame
  const playStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -winW * (1 - play.value) }],
  }));

  /* Double-tap to like is the gesture people already have in their hands from
     Instagram, and it is the reason the media layer is its own GestureDetector
     rather than the whole card: the action rail sits outside it, so tapping a
     button never has to lose a race with the tap recogniser. */
  const likeFromTap = () => {
    if (liked) {
      // already liked — replay the heart rather than un-liking, which is what
      // every double-tap-to-like surface does. Un-liking is the rail's job.
      setBurst((b) => b + 1);
      soft();
      return;
    }
    soft();
    setBurst((b) => b + 1);
    toggleLiked(a.id, a.topic);
  };
  const toggleChrome = () => nav.toggle();

  const taps = useMemo(() => {
    const double = Gesture.Tap()
      .numberOfTaps(2)
      .maxDelay(220)
      .onEnd((_e, ok) => {
        if (ok) runOnJS(likeFromTap)();
      });
    const single = Gesture.Tap()
      .maxDuration(260)
      .onEnd((_e, ok) => {
        if (ok) runOnJS(toggleChrome)();
      });
    return Gesture.Exclusive(double, single);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.id, liked]);

  const src = a.imageUrl ? { uri: a.imageUrl } : artFor(a.topic);
  const mark = publisherMark(a.url);

  return (
    <View style={[st.page, { height }]}>
      {/* --- media, and the only thing the tap recogniser covers --- */}
      <GestureDetector gesture={taps}>
        <View style={StyleSheet.absoluteFill}>
          <Animated.View style={[StyleSheet.absoluteFill, kenStyle]}>
            <Image
              source={src}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              recyclingKey={a.id + '-reel'}
              transition={340}
            />
          </Animated.View>
          {/* the topic's own colour washes the frame so two reels in a row
              don't read as the same slot twice */}
          <LinearGradient colors={[t.wash, 'rgba(0,0,0,0)']} style={StyleSheet.absoluteFill} />
          <EasedScrim variant="top" style={[st.scrimTop, { height: topInset + 150 }]} />
          <EasedScrim variant="bottom" style={st.scrimBottom} />
        </View>
      </GestureDetector>

      {/* the double-tap heart, over the media and under the chrome */}
      {burst > 0 ? <TapHeart key={burst} color={c.breaking} /> : null}

      {/* --- playhead, only when there is something to play --- */}
      {motion ? (
        <View style={[st.track, { top: topInset + 6 }]}>
          <Animated.View style={[st.fill, { width: winW }, playStyle]} />
        </View>
      ) : null}

      {/* --- top pills. right:66 clears the floating topics button --- */}
      <View style={[st.top, { top: topInset + 18 }]} pointerEvents="none">
        {isBreaking(a) ? (
          <BreakingBadge />
        ) : (
          <View style={st.pill}>
            <LIcon name="circle-play" size={12} color="#fff" strokeWidth={2.4} />
            <Txt size={11.5} weight="semibold" color="#fff" ls={0.3}>
              {a.topic}
            </Txt>
          </View>
        )}
        <View style={st.pill}>
          <Txt size={11.5} weight="medium" color="#fff">
            {timeAgo(a.publishedAt)}
          </Txt>
        </View>
      </View>

      {/* --- action rail --- */}
      <View style={[st.rail, { bottom: FLOOR + 6 }]}>
        <RailButton
          icon="heart"
          label="Like"
          active={liked}
          activeColor={c.breaking}
          onPress={() => {
            soft();
            if (!liked) setBurst((b) => b + 1);
            toggleLiked(a.id, a.topic);
          }}
        />
        <RailButton
          icon="thumbs-down"
          label="Dislike"
          active={disliked}
          activeColor="#FF9F45"
          onPress={() => {
            soft();
            toggleDisliked(a.id, a.topic);
          }}
        />
        <RailButton
          icon="message-circle"
          label={commentCount > 0 ? (commentCount > 99 ? '99+' : String(commentCount)) : 'Comment'}
          active={showComments}
          activeColor={c.brand}
          onPress={() => {
            tick();
            setShowComments(true);
          }}
        />
        <RailButton
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
        <RailButton
          icon="share-2"
          label="Share"
          onPress={() => {
            tick();
            track({ article_id: a.id, event_type: 'share', topic: a.topic });
            Share.share({ message: `${a.title}\n\n${a.url}` });
          }}
        />
      </View>

      {/* --- caption. right:88 clears the rail --- */}
      <View style={[st.caption, { bottom: FLOOR - 4 }]} pointerEvents="box-none">
        <Press
          haptic={false}
          scaleTo={0.985}
          onPress={() => {
            track({ article_id: a.id, event_type: 'open_full', topic: a.topic });
            router.push(`/article/${a.id}`);
          }}
          accessibilityRole="button"
          accessibilityLabel={a.title}
        >
          <View style={st.byline}>
            {mark ? (
              <View style={st.markBox}>
                <Image source={mark} style={st.markImg} contentFit="cover" />
              </View>
            ) : (
              <LinearGradient colors={t.grad} style={st.pubDot} />
            )}
            <Txt size={12.5} weight="bold" color="#fff" numberOfLines={1} style={st.pubName}>
              {a.publisher}
            </Txt>
          </View>

          <Txt display size={22} lh={28} weight="extrabold" ls={-0.6} color="#fff" numberOfLines={3}>
            {a.title}
          </Txt>

          <View style={st.readRow}>
            <Txt size={12} weight="semibold" color="rgba(255,255,255,0.9)">
              Read full story
            </Txt>
            <LIcon name="chevron-right" size={14} color="rgba(255,255,255,0.9)" strokeWidth={2.4} />
          </View>
        </Press>
      </View>

      {/* comments take the whole reel — a sheet inside a full-bleed frame would
          leave the headline half-covered and neither readable */}
      {showComments ? (
        <Animated.View
          entering={enterChrome()}
          style={[StyleSheet.absoluteFill, st.comments, { paddingTop: topInset + 16, paddingBottom: FLOOR - 24 }]}
        >
          <CommentsPanel articleId={a.id} onClose={() => setShowComments(false)} />
        </Animated.View>
      ) : null}
    </View>
  );
}

/* One rail button: glass circle, word underneath. The label is not decoration
   — without it a column of five outlined glyphs over a photograph is genuinely
   ambiguous, and the two that matter most here (dislike, save) are the two
   whose icons carry the least meaning on their own. */
function RailButton({
  icon,
  label,
  active,
  activeColor,
  onPress,
}: {
  icon: string;
  label: string;
  active?: boolean;
  activeColor?: string;
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
      hitSlop={8}
      scaleTo={0.88}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      style={st.railItem}
    >
      <Animated.View
        style={[
          st.railCircle,
          lit ? { backgroundColor: activeColor, borderColor: activeColor } : null,
          popStyle,
        ]}
      >
        <LIcon
          name={icon}
          size={21}
          color="#fff"
          fill={lit ? '#fff' : 'none'}
          strokeWidth={2}
        />
      </Animated.View>
      <Txt size={10.5} weight="bold" color="rgba(255,255,255,0.92)" style={st.railLabel} numberOfLines={1}>
        {label}
      </Txt>
    </Press>
  );
}

/* The double-tap heart. One driver, no spring: it swells, holds for a beat and
   is gone in 700ms. A bouncy version of this reads as a glitch at reel scale. */
function TapHeart({ color }: { color: string }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
  }, [v]);
  const a = useAnimatedStyle(() => ({
    opacity: interpolate(v.value, [0, 0.12, 0.62, 1], [0, 1, 1, 0], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(v.value, [0, 0.16, 0.5, 1], [0.3, 1.18, 1, 1.5], Extrapolation.CLAMP) },
      { rotate: '-8deg' },
    ],
  }));
  return (
    <View pointerEvents="none" style={st.heartWrap}>
      <Animated.View style={a}>
        <LIcon name="heart" size={116} color={color} fill={color} strokeWidth={0} />
      </Animated.View>
    </View>
  );
}

const st = StyleSheet.create({
  page: { overflow: 'hidden', backgroundColor: '#05070C' },
  scrimTop: { position: 'absolute', left: 0, right: 0, top: 0 },
  scrimBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 340 },
  track: {
    position: 'absolute',
    left: 18,
    right: 18,
    height: 2.5,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  fill: { height: 2.5, backgroundColor: 'rgba(255,255,255,0.92)' },
  top: {
    position: 'absolute',
    left: 20,
    right: 66,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(11,13,18,0.38)',
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  rail: { position: 'absolute', right: 12, alignItems: 'center', gap: 15 },
  railItem: { width: 58, alignItems: 'center' },
  railCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11,13,18,0.42)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  railLabel: { marginTop: 5 },
  caption: { position: 'absolute', left: 20, right: 88 },
  byline: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  markBox: { width: 22, height: 22, borderRadius: 6, overflow: 'hidden', backgroundColor: '#fff' },
  markImg: { width: '100%', height: '100%' },
  pubDot: { width: 9, height: 9, borderRadius: 5 },
  pubName: { flexShrink: 1 },
  readRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 12 },
  heartWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  comments: { backgroundColor: 'rgba(6,9,16,0.96)', paddingHorizontal: 16 },
});
