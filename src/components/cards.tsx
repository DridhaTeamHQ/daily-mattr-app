import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { soft } from '@/lib/haptics';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors, radius, shadow, topicOf } from '@/theme';
import { useTheme, glassCard } from '@/lib/theme';
import { StoryTitle, CardTitle, Txt, Press, BreakingBadge, EasedScrim, LIcon } from './ui';
import { type Article, timeAgo, isBreaking } from '@/lib/content';
import { useStore } from '@/lib/store';
import { trackImpression } from '@/lib/telemetry';
import { artFor } from '@/lib/topicArt';

const { width: W, height: H } = Dimensions.get('window');

/* ---------- Cinematic story card ---------- */

export function StoryCard({ a, index = 0 }: { a: Article; index?: number }) {
  const router = useRouter();
  const t = topicOf(a.topic);
  useEffect(() => trackImpression(a.id, a.topic), [a.id, a.topic]);

  return (
    <Animated.View entering={FadeInDown.delay(index * 100).springify().damping(30).stiffness(250).mass(0.9)}>
      <Press onPress={() => router.push(`/article/${a.id}`)} style={[s.story, shadow.hero]} scaleTo={0.985}>
        {a.imageUrl ? (
          <>
            <Image source={{ uri: a.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={a.id} transition={300} />
            {/* topic-color wash unifies random RSS photos */}
            <LinearGradient colors={[t.wash, 'rgba(0,0,0,0)']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 0.7 }} style={StyleSheet.absoluteFill} />
          </>
        ) : (
          <Image source={artFor(a.topic)} style={StyleSheet.absoluteFill} contentFit="cover" transition={220} />
        )}
        <EasedScrim variant="bottom" />
        <View style={s.storyTop}>
          {isBreaking(a) ? (
            <BreakingBadge />
          ) : (
            <View style={s.glassPill}>
              <Txt size={11.5} weight="semibold" color="#fff" ls={0.3}>
                {a.topic}
              </Txt>
            </View>
          )}
        </View>
        <View style={s.storyBottom}>
          <StoryTitle color="#fff" numberOfLines={4}>
            {a.title}
          </StoryTitle>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }}>
            <Txt size={13} weight="semibold" color="rgba(255,255,255,0.95)">
              {a.publisher}
            </Txt>
            <View style={s.metaDotLight} />
            <Txt size={13} weight="medium" color="rgba(255,255,255,0.65)">
              {timeAgo(a.publishedAt)}
            </Txt>
            <View style={s.metaDotLight} />
            <Txt size={13} weight="medium" color="rgba(255,255,255,0.65)">
              {a.readMins} min
            </Txt>
          </View>
        </View>
      </Press>
    </Animated.View>
  );
}

/* ---------- Compact top-story hero (medium, not full-bleed) ---------- */

export function TopStoryCard({ a }: { a: Article }) {
  const router = useRouter();
  const t = topicOf(a.topic);
  useEffect(() => trackImpression(a.id, a.topic), [a.id, a.topic]);

  return (
    <Animated.View entering={FadeInDown.springify().damping(30).stiffness(250).mass(0.9)}>
      <Press onPress={() => router.push(`/article/${a.id}`)} style={[s.topStory, shadow.lift]} scaleTo={0.985}>
        {a.imageUrl ? (
          <>
            <Image source={{ uri: a.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={a.id} transition={280} />
            <LinearGradient colors={[t.wash, 'rgba(0,0,0,0)']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 0.7 }} style={StyleSheet.absoluteFill} />
          </>
        ) : (
          <Image source={artFor(a.topic)} style={StyleSheet.absoluteFill} contentFit="cover" transition={220} />
        )}
        <EasedScrim variant="bottom" />
        <View style={s.storyTop}>
          {isBreaking(a) ? (
            <BreakingBadge />
          ) : (
            <View style={s.glassPill}>
              <Txt size={11} weight="semibold" color="#fff" ls={0.3}>
                {a.topic}
              </Txt>
            </View>
          )}
        </View>
        <View style={{ position: 'absolute', left: 18, right: 18, bottom: 16 }}>
          <Txt size={21} lh={26.5} weight="extrabold" color="#fff" ls={-0.5} numberOfLines={3}>
            {a.title}
          </Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 9 }}>
            <Txt size={12.5} weight="semibold" color="rgba(255,255,255,0.95)">
              {a.publisher}
            </Txt>
            <View style={s.metaDotLight} />
            <Txt size={12.5} weight="medium" color="rgba(255,255,255,0.65)">
              {timeAgo(a.publishedAt)}
            </Txt>
            <View style={s.metaDotLight} />
            <Txt size={12.5} weight="medium" color="rgba(255,255,255,0.65)">
              {a.readMins} min
            </Txt>
          </View>
        </View>
      </Press>
    </Animated.View>
  );
}

/* ---------- Borderless article row ---------- */

export function ArticleRow({
  a,
  showTopic = true,
  index = 0,
  divider = true,
  variant = 'plain',
}: {
  a: Article;
  showTopic?: boolean;
  index?: number;
  divider?: boolean;
  variant?: 'card' | 'plain';
}) {
  const router = useRouter();
  const { c, isDark } = useTheme();
  useEffect(() => trackImpression(a.id, a.topic), [a.id, a.topic]);

  if (variant === 'card') {
    return (
      <Animated.View entering={FadeInDown.delay(Math.min(index, 6) * 50).springify().damping(30).stiffness(250).mass(0.9)}>
        <Press onPress={() => router.push(`/article/${a.id}`)} style={[s.row, isDark ? null : shadow.soft, glassCard(c, isDark)]}>
          <View style={{ flex: 1, paddingRight: 16 }}>
            <CardTitle numberOfLines={2}>{a.title}</CardTitle>
            <Txt size={12} weight="medium" color={c.inkFaint} style={{ marginTop: 8 }}>
              {showTopic ? `${a.topic} · ` : ''}
              {timeAgo(a.publishedAt)} · {a.readMins} min
            </Txt>
          </View>
          <Image source={a.imageUrl ? { uri: a.imageUrl } : artFor(a.topic)} style={s.thumb} contentFit="cover" recyclingKey={a.id} transition={220} />
        </Press>
      </Animated.View>
    );
  }

  // plain: no box, hairline divider, quiet single-line meta — the calm default
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 6) * 50).springify().damping(30).stiffness(250).mass(0.9)}>
      <Press onPress={() => router.push(`/article/${a.id}`)} style={s.rowPlain}>
        <View style={{ flex: 1, paddingRight: 16 }}>
          <Txt size={16} lh={22} weight="bold" ls={-0.3} numberOfLines={3}>
            {a.title}
          </Txt>
          <Txt size={12} weight="medium" color={c.inkFaint} style={{ marginTop: 7 }}>
            {showTopic ? `${a.topic} · ` : ''}
            {timeAgo(a.publishedAt)} · {a.readMins} min
          </Txt>
        </View>
        <Image
          source={a.imageUrl ? { uri: a.imageUrl } : artFor(a.topic)}
          style={s.thumbPlain}
          contentFit="cover"
          recyclingKey={a.id}
          transition={220}
        />
      </Press>
      {divider ? <View style={[s.hairline, { backgroundColor: c.divider }]} /> : null}
    </Animated.View>
  );
}

/* ---------- Recommendation card with match score ---------- */

export function RecommendCard({ a, index = 0 }: { a: Article; index?: number }) {
  const router = useRouter();
  const { c, isDark } = useTheme();
  const t = topicOf(a.topic);
  const match = a.sim != null ? Math.round(Math.min(0.99, Math.max(0.5, a.sim)) * 100) : null;
  useEffect(() => trackImpression(a.id, a.topic), [a.id, a.topic]);

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 5) * 80).springify().damping(30).stiffness(250).mass(0.9)}>
      <Press onPress={() => router.push(`/article/${a.id}`)} style={[s.recCard, isDark ? null : shadow.soft, glassCard(c, isDark)]}>
        <View style={s.recImageWrap}>
          {a.imageUrl ? (
            <>
              <Image source={{ uri: a.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={a.id} transition={220} />
              <LinearGradient colors={[t.wash, 'rgba(0,0,0,0)']} style={StyleSheet.absoluteFill} />
            </>
          ) : (
            <Image source={artFor(a.topic)} style={StyleSheet.absoluteFill} contentFit="cover" transition={220} />
          )}
          {match != null ? (
            <View style={s.matchPill}>
              <LIcon name="sparkles" size={10} color="#fff" />
              <Txt size={10.5} weight="bold" color="#fff">
                {match}%
              </Txt>
            </View>
          ) : null}
        </View>
        <View style={{ padding: 16 }}>
          <CardTitle numberOfLines={2} style={{ fontSize: 15.5, lineHeight: 20.5 }}>
            {a.title}
          </CardTitle>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 9 }}>
            <Txt size={12} weight="semibold" color={colors.brand}>
              {a.topic}
            </Txt>
            <View style={s.metaDot} />
            <Txt size={12} weight="medium" color={colors.inkFaint}>
              {a.readMins} min
            </Txt>
          </View>
        </View>
      </Press>
    </Animated.View>
  );
}

/* ---------- Editorial numbered trending row ---------- */

export function TrendingRow({ a, rank }: { a: Article; rank: number }) {
  const router = useRouter();
  const { isDark } = useTheme();
  return (
    <Press onPress={() => router.push(`/article/${a.id}`)} style={s.trendRow}>
      <Txt size={34} weight="extrabold" color={isDark ? 'rgba(255,255,255,0.14)' : 'rgba(11,13,18,0.1)'} style={{ width: 52, letterSpacing: -1.5 }}>
        {String(rank).padStart(2, '0')}
      </Txt>
      <View style={{ flex: 1 }}>
        <CardTitle numberOfLines={2} style={{ fontSize: 16, lineHeight: 21 }}>
          {a.title}
        </CardTitle>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
          <Txt size={12} weight="semibold" color={colors.brand}>
            {a.topic}
          </Txt>
          <View style={s.metaDot} />
          <Txt size={12} weight="medium" color={colors.inkFaint}>
            {timeAgo(a.publishedAt)}
          </Txt>
        </View>
      </View>
    </Press>
  );
}

const s = StyleSheet.create({
  story: {
    width: W - 48,
    height: Math.min(H * 0.6, 540),
    marginHorizontal: 24,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.dark,
  },
  topStory: {
    width: W - 48,
    height: 224,
    marginHorizontal: 24,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.dark,
  },
  storyTop: {
    position: 'absolute',
    top: 18,
    left: 18,
    right: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  glassPill: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.pill,
    paddingHorizontal: 13,
    paddingVertical: 7,
    overflow: 'hidden',
  },
  storyBottom: { position: 'absolute', left: 22, right: 22, bottom: 22 },
  metaDotLight: { width: 3, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.45)', marginHorizontal: 9 },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.inkFaint, marginHorizontal: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  rowPlain: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 17,
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 24,
    marginRight: 24,
  },
  thumb: { width: 88, height: 88, borderRadius: 18 },
  thumbPlain: { width: 68, height: 68, borderRadius: 14 },
  recCard: {
    width: 258,
    borderRadius: radius.lg,
    marginRight: 16,
    overflow: 'hidden',
  },
  recImageWrap: { height: 136, backgroundColor: colors.bgSoft },
  matchPill: {
    position: 'absolute',
    left: 12,
    top: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(11,13,18,0.6)',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
});
