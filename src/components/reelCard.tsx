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
import { useVideoPlayer, VideoView } from 'expo-video';
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
import { useIsActiveCard } from '@/lib/activeCard';
import { playbackFor, clipLength } from '@/lib/media';
import { YoutubeEmbed } from './youtubeEmbed';
import { openSource } from '@/lib/openSource';
import { tick, soft, save as saveHaptic } from '@/lib/haptics';
import { enterChrome } from '@/lib/transitions';

/* The full-screen slot in the mixed deck — Reels/TikTok shape.

   This card used to be a *simulated* video: the story's own photograph on a
   nine-second Ken Burns loop under a playhead that swept regardless, because
   the pipeline had no video and stock footage under a real headline reads as
   filler in a news product.

   The CMS publishes actual clips (Qix), so the card plays them. What it will
   not do is fake the difference. Four states, and each looks like what it is:

     file    — a clip the video player can open. Plays muted and looping, and
               the playhead reflects where the clip actually is.
     youtube — a Short. Not a file, so no player can open it; YouTube's own
               player runs inside the card instead (see youtubeEmbed), cropped
               to fill the frame rather than letterboxed into it.
     link    — something else entirely. The cover holds still under a play
               button that hands the reader out to it.
     none    — no usable media. A photograph, treated as one.

   Cost: the animation drivers are transforms only, composited off the main
   thread with no layout pass, so a card that is mounted but scrolled past is
   close to free — and its player is paused, see lib/activeCard. */

const DURATION = 9000;
/** how often the playhead reads the clip's real position */
const TICK_MS = 250;
/** everything sits above the floating navbar */
const FLOOR = NAVBAR_CLEARANCE;

function ReelCardBase({
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

  /* What this card actually has to show. */
  const pb = useMemo(() => playbackFor(a.mediaUrl), [a.mediaUrl]);
  const length = clipLength(a.durationSec);
  const isVideo = pb.kind === 'file';
  /* A YouTube video whose owner disabled embedding loads its player and then
     refuses, which used to leave a still with no explanation and no way on.
     When the player says so, the card stops pretending and turns into the
     link it always had underneath. */
  const [ytRefused, setYtRefused] = useState(false);
  useEffect(() => setYtRefused(false), [a.id]);
  const isYoutube = pb.kind === 'youtube' && !ytRefused;
  // anything that moves — used to decide whether the still's Ken Burns pan and
  // the topic wash belong on this card at all
  const isMoving = isVideo || isYoutube;

  /* Where the play button sends the reader: a link we never claimed to play,
     or a YouTube video that turned us down. Null when the card plays it here,
     which is also when there is no button. */
  const handOff =
    pb.kind === 'link' ? pb.url : ytRefused && pb.kind === 'youtube' ? pb.url : null;

  /* Only the card the reader is on plays. Everything else in the deck's window
     is mounted, paused, and silent. */
  const onScreen = useIsActiveCard(a.id);

  /* Sound on. This is the full-screen card — the reader chose to be here, and
     a news clip without its audio is half a story.

     The small card in the Home feed stays silent, and deliberately: that is a
     list being scrolled past, where sound is an ambush rather than an answer.
     The speaker toggles it either way. */
  const [muted, setMuted] = useState(false);

  const player = useVideoPlayer(isVideo ? pb.url : null, (p) => {
    p.loop = true;
    /* Starts muted whatever the state above says, then follows it in the
       effect below. A native player will happily begin unmuted, but the
       YouTube embed is a browser and browsers refuse to autoplay audible
       video — it has to start silent and be unmuted once it is running.
       Doing the same on both keeps one code path and one behaviour. */
    p.muted = true;
  });

  useEffect(() => {
    if (!isVideo) return;
    try {
      // `|| !onScreen`: a card the deck keeps mounted either side of the
      // visible one is paused, but it must not be holding an audible session
      // ready to blurt the instant it is scrolled to.
      player.muted = muted || !onScreen;
    } catch {}
  }, [isVideo, muted, onScreen, player]);

  useEffect(() => {
    if (!isVideo) return;
    try {
      if (onScreen) player.play();
      else player.pause();
    } catch {
      // the player can be released mid-swipe as the deck recycles the page;
      // there is nothing to recover, and nothing worth reporting
    }
  }, [isVideo, onScreen, player]);

  // Ken Burns. Reversing, so it breathes rather than snapping back to the top
  // of the loop every nine seconds. Only for stills — a clip has its own motion
  // and panning it as well would be two things moving at once.
  const ken = useSharedValue(0);
  // The playhead. Separate driver because it must NOT reverse — a progress
  // line that runs backwards reads as a scrub, not playback.
  const play = useSharedValue(0);
  useEffect(() => {
    if (isMoving) return;
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
  }, [ken, motion, isMoving]);

  /* The playhead, for a clip, is the clip's own position.

     The old card swept this line on a fixed nine-second timer whatever was
     underneath it. Over a real video that would be a lie the reader can check:
     the line finishing while the clip is halfway through. Polled rather than
     driven by an event, because `timeUpdate` fires far more often than a
     progress line needs and every one of those crossings costs a bridge hop. */
  useEffect(() => {
    if (!isVideo || !onScreen) {
      play.value = 0;
      return;
    }
    const id = setInterval(() => {
      try {
        const total = player.duration || Number(a.durationSec) || 0;
        if (total > 0) {
          play.value = withTiming(Math.min(1, player.currentTime / total), {
            duration: TICK_MS,
            easing: Easing.linear,
          });
        }
      } catch {
        // released mid-poll; the next mount starts a fresh interval
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [isVideo, onScreen, player, play, a.durationSec]);

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

  /* The still under everything.
     A YouTube card usually has no cover — lib/cms nulls one that points at the
     YouTube page — so topic artwork would stand in for a video whose real
     frame is one request away. Prefer YouTube's own; artFor remains the honest
     stand-in when there is nothing at all. */
  const src = a.imageUrl
    ? { uri: a.imageUrl }
    : pb.kind === 'youtube'
      ? { uri: `https://i.ytimg.com/vi/${pb.videoId}/hqdefault.jpg` }
      : artFor(a.topic);
  const mark = publisherMark(a.url);

  return (
    <View style={[st.page, { height }]}>
      {/* --- media, and the only thing the tap recogniser covers --- */}
      <GestureDetector gesture={taps}>
        <View style={StyleSheet.absoluteFill}>
          {isVideo ? (
            <VideoView
              player={player}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              // the deck owns the gesture and the chrome; the player provides
              // neither, so nothing of its own competes with the card
              nativeControls={false}
              allowsPictureInPicture={false}
            />
          ) : isYoutube ? (
            <YoutubeEmbed
              videoId={pb.videoId}
              poster={a.imageUrl}
              muted={muted}
              // mounted only while this is the card on screen, so the deck
              // never holds several webviews each running a player
              playing={onScreen}
              onRefused={() => setYtRefused(true)}
            />
          ) : (
            <Animated.View style={[StyleSheet.absoluteFill, kenStyle]}>
              <Image
                source={src}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                recyclingKey={a.id + '-reel'}
                transition={340}
              />
            </Animated.View>
          )}
          {/* the topic's own colour washes the frame so two reels in a row
              don't read as the same slot twice */}
          <LinearGradient colors={[t.wash, 'rgba(0,0,0,0)']} style={StyleSheet.absoluteFill} />
          <EasedScrim variant="top" style={[st.scrimTop, { height: topInset + 150 }]} />
          <EasedScrim variant="bottom" style={st.scrimBottom} />
        </View>
      </GestureDetector>

      {/* the double-tap heart, over the media and under the chrome */}
      {burst > 0 ? <TapHeart key={burst} color={c.breaking} /> : null}

      {/* --- the clip lives elsewhere: hand it over rather than fake it ---

          A YouTube Short is a page. Embedding it would mean shipping a webview
          to render someone else's player inside ours, ads and all; opening it
          is both more honest and better for the reader. */}
      {handOff ? (
        <View style={st.playWrap} pointerEvents="box-none">
          <Press
            haptic={false}
            scaleTo={0.9}
            onPress={() => {
              tick();
              void openSource({ id: a.id, url: handOff, topic: a.topic });
            }}
            accessibilityRole="button"
            accessibilityLabel={`Play ${a.title}`}
            style={st.playBtn}
          >
            <LIcon name="play" size={26} color="#fff" strokeWidth={2.6} />
          </Press>
        </View>
      ) : null}

      {/* --- playhead. Only over a clip that is genuinely playing: a progress
              line above a still photograph is a claim the card can't back. --- */}
      {isVideo && motion ? (
        <View style={[st.track, { top: topInset + 6 }]}>
          <Animated.View style={[st.fill, { width: winW }, playStyle]} />
        </View>
      ) : null}

      {/* --- top row: what this is, and one control ---

          There were four things fighting for this strip: a topic chip with a
          play glyph in it, a duration pill, a round mute button, and the
          deck's own topics button — and the middle two were laid out on top of
          each other, the row ending at right:66 and the button starting there.

          Two objects now. The topic on the left says what the story is; the
          sound toggle on the right carries the duration inside it, because
          they describe the same thing and a reader reaching for one is not
          reaching past the other. The play glyph is gone: a card that is
          visibly playing does not need a badge saying so. */}
      <View style={[st.top, { top: topInset + 18 }]} pointerEvents="box-none">
        {isBreaking(a) ? (
          <BreakingBadge />
        ) : (
          <View style={st.pill} pointerEvents="none">
            <Txt size={11.5} weight="semibold" color="#fff" ls={0.3}>
              {a.topic}
            </Txt>
          </View>
        )}

        {isMoving ? (
          <Press
            haptic={false}
            hitSlop={12}
            scaleTo={0.9}
            onPress={() => {
              tick();
              setMuted((m) => !m);
            }}
            accessibilityRole="button"
            accessibilityLabel={muted ? 'Turn sound on' : 'Turn sound off'}
            style={st.soundPill}
          >
            <LIcon
              name={muted ? 'volume-off' : 'volume-2'}
              size={13}
              color="#fff"
              strokeWidth={2.3}
            />
            {length ? (
              <Txt size={11.5} weight="medium" color="#fff">
                {length}
              </Txt>
            ) : null}
          </Press>
        ) : (
          <View style={st.pill} pointerEvents="none">
            <Txt size={11.5} weight="medium" color="#fff">
              {timeAgo(a.publishedAt)}
            </Txt>
          </View>
        )}
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

/* Memoised: the deck keeps a window of pages mounted either side of the
   visible one. Without this, a state change on the screen re-renders all of
   them — and each holds a player or a full-bleed image. */
export const ReelCard = React.memo(ReelCardBase);

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
  /* Centred on the media, not on the page: the caption and rail occupy the
     lower third, and a play button sitting behind them reads as unpressable
     even where it isn't. */
  /* Reads as a chip like the topic opposite it, not a floating button — the
     hairline is what marks it as the one thing here you can press. */
  soundPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(11,13,18,0.46)',
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  playWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: 74,
    height: 74,
    borderRadius: 37,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11,13,18,0.44)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
    // nudged so the optical centre of a triangle lands on the true centre
    paddingLeft: 4,
  },
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
