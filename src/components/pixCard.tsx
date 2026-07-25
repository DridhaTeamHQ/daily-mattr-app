import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, Share, ScrollView, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { radius, topicOf } from '@/theme';
import { useTheme } from '@/lib/theme';
import { Txt, Press, LIcon, EasedScrim, BreakingBadge } from './ui';
import { CommentsPanel } from './commentsPanel';
import { type Article, timeAgo, isBreaking } from '@/lib/content';
import { useStore } from '@/lib/store';
import { track, trackImpression } from '@/lib/telemetry';
import { artFor } from '@/lib/topicArt';
import { highlightRuns } from '@/lib/highlight';
import { pixStyleFor, HEADLINE_SIZE, type PixStyle } from '@/lib/pixStyles';

const GUTTER = 24;

/* A story told as two slides: the photo carrying the headline, then the same
   photo standing back so the three key points can be read. The look is drawn
   from a preset chosen by article id, so the feed varies without the layout
   logic multiplying. */
export function PixCard({ a, index = 0 }: { a: Article; index?: number }) {
  const { c, isDark } = useTheme();
  const router = useRouter();
  const { width: winW } = useWindowDimensions();
  const { isSaved, toggleSaved, isLiked, toggleLiked, isDisliked, toggleDisliked } = useStore();

  const [page, setPage] = useState(0);
  const [showComments, setShowComments] = useState(false);

  const style = useMemo(() => pixStyleFor(a.id), [a.id]);
  const runs = useMemo(() => highlightRuns(a.title), [a.title]);
  const bullets = useMemo(() => (a.modes?.tldr ?? []).slice(0, 3), [a.modes]);
  const t = topicOf(a.topic);

  React.useEffect(() => trackImpression(a.id, a.topic), [a.id, a.topic]);

  const W = winW - GUTTER * 2;
  const H = Math.round(Math.min(winW * 1.28, 520));

  const onScroll = useCallback(
    (e: any) => {
      const p = Math.round(e.nativeEvent.contentOffset.x / W);
      if (p !== page) setPage(p);
    },
    [W, page],
  );

  const liked = isLiked(a.id);
  const disliked = isDisliked(a.id);
  const saved = isSaved(a.id);

  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 4) * 60).springify().damping(30).stiffness(250).mass(0.9)}
      style={{ marginBottom: 26 }}
    >
      <View style={[s.card, { width: W, height: H, marginHorizontal: GUTTER, backgroundColor: isDark ? '#0C111D' : '#0E1524' }]}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={32}
          style={{ flex: 1 }}
        >
          <SlideOne a={a} style={style} runs={runs} W={W} H={H} topicGrad={t.grad} wash={t.wash} />
          <SlideTwo a={a} style={style} bullets={bullets} W={W} H={H} wash={t.wash} />
        </ScrollView>

        {/* chrome sits above both slides */}
        <View style={s.top} pointerEvents="box-none">
          {isBreaking(a) ? (
            <BreakingBadge />
          ) : (
            <View style={s.pill}>
              <Txt size={11} weight="semibold" color="#fff" ls={0.3}>
                {a.topic}
              </Txt>
            </View>
          )}
          <View style={s.pill}>
            <Txt size={11} weight="medium" color="#fff">
              {timeAgo(a.publishedAt)}
            </Txt>
          </View>
        </View>

        <View style={s.dots} pointerEvents="none">
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

        <View style={s.actions}>
          <PixAction
            icon="thumbs-up"
            active={liked}
            activeColor={c.brand}
            onPress={() => toggleLiked(a.id, a.topic)}
          />
          <PixAction
            icon="thumbs-down"
            active={disliked}
            activeColor="#FF6B6B"
            onPress={() => toggleDisliked(a.id, a.topic)}
          />
          <PixAction
            icon="message-circle"
            active={showComments}
            activeColor={c.brand}
            onPress={() => setShowComments((v) => !v)}
          />
          <PixAction
            icon="bookmark"
            active={saved}
            activeColor={c.brand}
            onPress={() => toggleSaved(a.id, a.topic)}
          />
          <PixAction
            icon="share-2"
            onPress={() => {
              track({ article_id: a.id, event_type: 'share', topic: a.topic });
              Share.share({ message: `${a.title}\n\n${a.url}` });
            }}
          />
        </View>

        {/* comments take the whole card rather than squeezing into a slide */}
        {showComments ? (
          <Animated.View entering={FadeIn.duration(200)} style={[StyleSheet.absoluteFill, s.commentsWrap, { backgroundColor: isDark ? 'rgba(10,14,23,0.97)' : 'rgba(255,255,255,0.97)' }]}>
            <CommentsPanel articleId={a.id} onClose={() => setShowComments(false)} />
          </Animated.View>
        ) : null}
      </View>

      <Press
        onPress={() => router.push(`/article/${a.id}`)}
        scaleTo={0.97}
        style={{ marginHorizontal: GUTTER, marginTop: 10, alignSelf: 'flex-start' }}
      >
        <Txt size={12.5} weight="semibold" color={c.inkSoft}>
          {a.publisher} · Read full story
        </Txt>
      </Press>
    </Animated.View>
  );
}

function PixAction({
  icon,
  active,
  activeColor,
  onPress,
}: {
  icon: string;
  active?: boolean;
  activeColor?: string;
  onPress: () => void;
}) {
  return (
    <Press haptic hitSlop={8} onPress={onPress} scaleTo={0.86} style={s.action}>
      <LIcon
        name={icon}
        size={17}
        color={active && activeColor ? activeColor : 'rgba(255,255,255,0.92)'}
        fill={active && activeColor ? activeColor : 'none'}
        strokeWidth={2}
      />
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
}: {
  a: Article;
  style: PixStyle;
  runs: { text: string; hit: boolean }[];
  W: number;
  H: number;
  topicGrad: [string, string];
  wash: string;
}) {
  const { c } = useTheme();
  const src = a.imageUrl ? { uri: a.imageUrl } : artFor(a.topic);
  const type = HEADLINE_SIZE[style.size];

  // how much of the slide the photo occupies
  const photoH = style.frame === 'bleed' ? H : style.frame === 'inset' ? Math.round(H * 0.58) : Math.round(H * 0.4);

  const place =
    style.anchor === 'top'
      ? { top: 62 }
      : style.anchor === 'centre'
        ? { top: 0, bottom: 0, justifyContent: 'center' as const }
        : { bottom: 78 };

  return (
    <View style={{ width: W, height: H }}>
      <View style={{ height: photoH, overflow: 'hidden' }}>
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
      </View>

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
            blurRadius={style.back === 'dim' ? 40 : 12}
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
          <Animated.View key={i} entering={FadeInDown.delay(i * 70).duration(320)} style={s.point}>
            {style.marker === 'numeral' ? (
              <Txt display size={12} weight="extrabold" color={c.brandLight} style={{ width: 22, marginTop: 2 }}>
                {String(i + 1).padStart(2, '0')}
              </Txt>
            ) : style.marker === 'rule' ? (
              <View style={[s.rule, { backgroundColor: c.brand }]} />
            ) : (
              <View style={[s.dotMark, { backgroundColor: c.brand }]} />
            )}
            <Txt size={14} lh={21} color="rgba(255,255,255,0.94)" style={{ flex: 1 }}>
              {b}
            </Txt>
          </Animated.View>
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
  top: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pill: {
    backgroundColor: 'rgba(11,13,18,0.42)',
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 5,
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
    gap: 6,
  },
  action: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11,13,18,0.44)',
  },
  commentsWrap: { padding: 16, borderRadius: radius.lg },
});
