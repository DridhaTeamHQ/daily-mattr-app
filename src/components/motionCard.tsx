import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { radius, topicOf } from '@/theme';
import { useTheme } from '@/lib/theme';
import { Txt, Press, EasedScrim, LIcon } from './ui';
import { type Article, timeAgo } from '@/lib/content';
import { trackImpression } from '@/lib/telemetry';
import { artFor } from '@/lib/topicArt';
import { useMotionAllowed } from '@/lib/motion';

/* The motion slot in the feed.

   This is the story's own photograph on a slow push-in, not stock video. The
   articles table has no video column and Supabase is read-only, so a real clip
   here could only ever be unrelated footage sitting beside a real headline —
   which reads as filler in a news product. A photograph that moves gives the
   slot its own presence while every pixel on screen still belongs to the story
   it links to.

   One shared value, transform only. Ken Burns is a scale plus a drift, both
   of which the compositor handles without a layout pass, so a card that is
   mounted but scrolled past costs effectively nothing. */

const DURATION = 9000;

function MotionCardBase({
  a,
  index = 0,
  height = 260,
}: {
  a: Article;
  index?: number;
  /** taller in the full-screen reader deck than in the Home list */
  height?: number;
}) {
  const { c, isDark } = useTheme();
  const router = useRouter();
  const t = topicOf(a.topic);
  const p = useSharedValue(0);

  useEffect(() => trackImpression(a.id, a.topic), [a.id, a.topic]);

  // with Reduce Motion on this is simply a photograph — see lib/motion.ts
  const motion = useMotionAllowed();
  useEffect(() => {
    if (!motion) {
      p.value = 0.35;
      return;
    }
    p.value = withRepeat(
      withTiming(1, { duration: DURATION, easing: Easing.inOut(Easing.quad) }),
      -1,
      true, // reverse, so it breathes instead of snapping back
    );
  }, [p, motion]);

  const ken = useAnimatedStyle(() => ({
    transform: [
      { scale: 1 + p.value * 0.14 },
      { translateX: p.value * -14 },
      { translateY: p.value * -10 },
    ],
  }));

  return (
    <Press
      haptic={false}
      scaleTo={0.985}
      onPress={() => router.push(`/article/${a.id}`)}
      accessibilityRole="button"
      accessibilityLabel={a.title}
      style={[s.wrap, isDark ? null : s.lift]}
    >
      <View style={[s.clip, { height }]}>
        {/* overflow:hidden lives on the parent so the scaling image is cropped
            rather than pushing the card's own bounds around */}
        <Animated.View style={[StyleSheet.absoluteFill, ken]}>
          <Image
            source={a.imageUrl ? { uri: a.imageUrl } : artFor(a.topic)}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            recyclingKey={a.id}
            transition={320}
          />
        </Animated.View>

        <EasedScrim variant="bottom" style={s.scrim} />

        <View style={s.top}>
          <View style={s.pill}>
            <Txt size={11} weight="semibold" color="#fff" ls={0.3}>
              {a.topic}
            </Txt>
          </View>
          <View style={s.pill}>
            <Txt size={11} weight="medium" color="#fff">
              {timeAgo(a.publishedAt)}
            </Txt>
          </View>
        </View>

        <View style={s.copy}>
          <Txt display size={21} lh={27} weight="extrabold" ls={-0.6} color="#fff" numberOfLines={3}>
            {a.title}
          </Txt>
          <View style={s.meta}>
            <LIcon name="circle-play" size={13} color="rgba(255,255,255,0.85)" strokeWidth={2.2} />
            <Txt size={11.5} weight="semibold" color="rgba(255,255,255,0.85)">
              {a.publisher} · {a.readMins} min read
            </Txt>
          </View>
        </View>
      </View>
    </Press>
  );
}

/* Memoised: a feed cell must not re-render because the list array was rebuilt.
   See the note on ArticleRow in components/cards.tsx. */
export const MotionCard = React.memo(MotionCardBase);

const s = StyleSheet.create({
  wrap: { marginHorizontal: 24, marginTop: 8, marginBottom: 22 },
  lift: { boxShadow: '0 14px 34px rgba(10,20,40,0.16)' },
  clip: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#0E1524',
  },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 190 },
  top: {
    position: 'absolute',
    top: 13,
    left: 13,
    right: 13,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pill: {
    backgroundColor: 'rgba(11,13,18,0.42)',
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  copy: { position: 'absolute', left: 18, right: 18, bottom: 16 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 9 },
});
