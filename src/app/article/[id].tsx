import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Share, Dimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { soft, tick, save as saveHaptic } from '@/lib/haptics';
import * as Speech from 'expo-speech';
import * as WebBrowser from 'expo-web-browser';
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  withTiming,
  Easing,
  Extrapolation,
  FadeInDown,
} from 'react-native-reanimated';
import { colors, radius, shadow, topicOf } from '@/theme';
import { Headline, Txt, BodyText, Press, IconButton, EasedScrim, LIcon, LogoLoader } from '@/components/ui';
import { RecommendCard } from '@/components/cards';
import { fetchArticle, fetchRelated } from '@/lib/queries';
import { timeAgo } from '@/lib/content';
import { useStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { track, createDwellTimer } from '@/lib/telemetry';
import { artFor } from '@/lib/topicArt';

const { width: W } = Dimensions.get('window');
const HERO_H = 400;

export default function ArticleScreen() {
  const { c, isDark } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { recordRead, isSaved, toggleSaved, isLiked, toggleLiked } = useStore();
  const [speaking, setSpeaking] = useState(false);
  const readCompleteSent = useRef(false);

  const scrollY = useSharedValue(0);
  const progress = useSharedValue(0);
  const mountZoom = useSharedValue(1.1);

  const { data: a, isLoading } = useQuery({
    queryKey: ['article', id],
    queryFn: () => fetchArticle(id!),
    enabled: !!id,
  });

  const { data: related } = useQuery({
    queryKey: ['related', id],
    queryFn: () => fetchRelated(a!, 6),
    enabled: !!a,
  });

  useEffect(() => {
    mountZoom.value = withTiming(1, { duration: 700, easing: Easing.bezier(0.16, 1, 0.3, 1) });
  }, [mountZoom]);

  useEffect(() => {
    if (!a) return;
    recordRead(a.id, a.topic);
    const timer = createDwellTimer();
    return () => {
      const ms = timer.stop();
      if (ms > 500) {
        track({ article_id: a.id, event_type: 'dwell', dwell_ms: ms, words: a.wordCount, topic: a.topic });
      }
      Speech.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a?.id]);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
    const max = e.contentSize.height - e.layoutMeasurement.height;
    progress.value = max > 0 ? Math.min(1, e.contentOffset.y / max) : 0;
  });

  useEffect(() => {
    const iv = setInterval(() => {
      if (a && !readCompleteSent.current && progress.value > 0.85) {
        readCompleteSent.current = true;
        track({ article_id: a.id, event_type: 'read_complete', topic: a.topic });
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [a, progress]);

  const heroStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(scrollY.value, [-HERO_H, 0, HERO_H], [-HERO_H / 2, 0, HERO_H * 0.42], Extrapolation.CLAMP) },
      { scale: interpolate(scrollY.value, [-HERO_H, 0], [1.6, 1], Extrapolation.CLAMP) * mountZoom.value },
    ],
  }));

  const progressStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  const paragraphs = useMemo(() => {
    if (!a) return [];
    const src = a.modes?.deepDive && a.modes.deepDive.length > a.summary.length ? a.modes.deepDive : (a.body ?? a.summary);
    return src
      .split(/\n+/)
      .flatMap((p) => (p.length > 700 ? p.match(/.{1,600}(?:\s|$)/g) ?? [p] : [p]))
      .map((p) => p.trim())
      .filter((p) => p.length > 40)
      .slice(0, 10);
  }, [a]);

  const pullQuote = useMemo(() => a?.modes?.tldr?.[0] ?? null, [a]);

  if (isLoading || !a) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
        <LogoLoader />
      </View>
    );
  }

  const t = topicOf(a.topic);
  const saved = isSaved(a.id);
  const liked = isLiked(a.id);

  const toggleSpeech = () => {
    if (speaking) {
      Speech.stop();
      setSpeaking(false);
    } else {
      setSpeaking(true);
      Speech.speak(`${a.title}. ${a.summary}`, {
        onDone: () => setSpeaking(false),
        onStopped: () => setSpeaking(false),
      });
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* thin reading progress */}
      <View style={[s.progressTrack, { top: insets.top }]}>
        <Animated.View style={[s.progressFill, progressStyle]} />
      </View>

      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 44 }}>
        {/* parallax + mount-zoom hero */}
        <View style={{ height: HERO_H, overflow: 'hidden' }}>
          <Animated.View style={[StyleSheet.absoluteFill, heroStyle]}>
            {a.imageUrl ? (
              <>
                <Image source={{ uri: a.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={260} />
                <LinearGradient colors={[t.wash, 'rgba(0,0,0,0)']} style={StyleSheet.absoluteFill} />
              </>
            ) : (
              <Image source={artFor(a.topic)} style={StyleSheet.absoluteFill} contentFit="cover" transition={220} />
            )}
          </Animated.View>
          <EasedScrim variant="top" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: HERO_H * 0.45 }} />
          <EasedScrim variant="toWhite" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: HERO_H * 0.5 }} />
        </View>

        {/* headline block */}
        <Animated.View entering={FadeInDown.duration(450).springify().damping(30).stiffness(250).mass(0.9)} style={{ paddingHorizontal: 24, marginTop: -92 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            <LinearGradient colors={[c.brandLight, c.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.topicChip}>
              <Txt size={11.5} weight="semibold" color="#fff" ls={0.3}>
                {a.topic}
              </Txt>
            </LinearGradient>
            {a.factLabel ? <LIcon name="shield-check" size={16} color={c.brand} /> : null}
          </View>
          <Headline style={{ marginTop: 14 }}>{a.title}</Headline>

          <View style={s.metaRow}>
            <LinearGradient colors={t.grad} style={s.pubAvatar}>
              <Txt size={13.5} weight="bold" color="#fff">
                {a.publisher.slice(0, 1)}
              </Txt>
            </LinearGradient>
            <View style={{ flex: 1, marginLeft: 11 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Txt size={13.5} weight="semibold">
                  {a.publisher}
                </Txt>
                <LIcon name="badge-check" size={13.5} color={c.brand} />
              </View>
              <Txt size={12} weight="medium" color={c.inkFaint} style={{ marginTop: 2 }}>
                {timeAgo(a.publishedAt)} · {a.readMins} min read
              </Txt>
            </View>
            <Press haptic={false} onPress={toggleSpeech} style={[s.listenBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF1F6' }, speaking ? { backgroundColor: c.brand } : null]}>
              <LIcon name={speaking ? 'square' : 'headphones'} size={14} color={speaking ? '#fff' : c.ink} />
              <Txt size={13} weight="semibold" color={speaking ? '#fff' : c.ink}>
                {speaking ? 'Stop' : 'Listen'}
              </Txt>
            </Press>
          </View>
        </Animated.View>

        {/* AI summary — glowing card */}
        <Animated.View entering={FadeInDown.delay(140).springify().damping(30).stiffness(250).mass(0.9)} style={[s.aiCard, shadow.glowBrand]}>
          <LinearGradient colors={isDark ? ['rgba(255,255,255,0.09)', 'rgba(77,136,255,0.08)'] : ['#FFFFFF', '#F5F9FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.aiInner}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <LinearGradient colors={[c.brandLight, c.brand]} style={s.aiIcon}>
                <LIcon name="sparkles" size={12} color="#fff" />
              </LinearGradient>
              <Txt size={13.5} weight="bold">
                AI Summary
              </Txt>
            </View>
            <Txt size={15} lh={25} color={isDark ? "#C4CEDD" : "#3A4150"} style={{ marginTop: 10 }}>
              {a.summary}
            </Txt>
            {a.modes?.keyNumbers?.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                {a.modes.keyNumbers.slice(0, 3).map((k, i) => (
                  <View key={i} style={s.numPill}>
                    <Txt size={12} weight="semibold" color={c.brand} numberOfLines={1} style={{ maxWidth: W * 0.68 }}>
                      {k.length > 46 ? k.slice(0, 44) + '…' : k}
                    </Txt>
                  </View>
                ))}
              </View>
            ) : null}
          </LinearGradient>
        </Animated.View>

        {/* body */}
        <View style={{ paddingHorizontal: 24, marginTop: 30 }}>
          {paragraphs.map((p, i) => (
            <React.Fragment key={i}>
              {i === 1 && pullQuote ? (
                <View style={s.quoteBlock}>
                  <LinearGradient colors={[c.brandLight, c.brand]} style={s.quoteBar} />
                  <Txt size={42} weight="extrabold" color={c.brand} style={{ lineHeight: 46, marginBottom: -16 }}>
                    “
                  </Txt>
                  <Txt size={20} lh={30} weight="semibold" color={c.ink} ls={-0.4}>
                    {pullQuote}
                  </Txt>
                </View>
              ) : null}
              <BodyText style={{ marginTop: i === 0 ? 0 : 20 }}>
                {i === 0 ? (
                  <>
                    <Txt size={46} weight="extrabold" color={c.brand} style={{ lineHeight: 48 }}>
                      {p.slice(0, 1)}
                    </Txt>
                    {p.slice(1)}
                  </>
                ) : (
                  p
                )}
              </BodyText>
            </React.Fragment>
          ))}

          <Press
            onPress={() => {
              track({ article_id: a.id, event_type: 'open_full', topic: a.topic });
              WebBrowser.openBrowserAsync(a.url);
            }}
            style={{ marginTop: 32 }}
          >
            <LinearGradient
              colors={[c.brandLight, c.brand]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[s.sourceBtn, shadow.glowBrand]}
            >
              <Txt size={14.5} weight="semibold" color="#fff">
                Read full story at {a.publisher}
              </Txt>
              <LIcon name="arrow-right" size={16} color="#fff" />
            </LinearGradient>
          </Press>
        </View>

        {/* related */}
        {related?.length ? (
          <>
            <View style={{ paddingHorizontal: 24, marginTop: 44, marginBottom: 16 }}>
              <Txt size={21} weight="bold" ls={-0.5}>
                More on this
              </Txt>
            </View>
            <Animated.ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 8 }}>
              {related.map((r, i) => (
                <RecommendCard key={r.id} a={r} index={i} />
              ))}
            </Animated.ScrollView>
          </>
        ) : null}
      </Animated.ScrollView>

      {/* floating controls */}
      <View style={[s.topControls, { top: insets.top + 10 }]}>
        <IconButton name="chevron-left" color="#fff" bg="rgba(11,13,18,0.38)" onPress={() => router.back()} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <IconButton
            name="heart"
            color={liked ? '#FF6B6B' : '#fff'}
            bg="rgba(11,13,18,0.38)"
            onPress={() => {
              soft();
              toggleLiked(a.id, a.topic);
            }}
          />
          <IconButton
            name="share-2"
            color="#fff"
            bg="rgba(11,13,18,0.38)"
            onPress={() => {
              track({ article_id: a.id, event_type: 'share', topic: a.topic });
              Share.share({ message: `${a.title}\n\n${a.url}` });
            }}
          />
          <IconButton
            name="bookmark"
            color="#fff"
            bg={saved ? c.brand : 'rgba(11,13,18,0.38)'}
            onPress={() => {
              if (!saved) saveHaptic();
              else tick();
              toggleSaved(a.id, a.topic);
            }}
          />
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    zIndex: 20,
    backgroundColor: 'transparent',
  },
  progressFill: {
    height: 3,
    backgroundColor: colors.brand,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
    boxShadow: '0 1px 8px rgba(57,121,255,0.5)',
  },
  topControls: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  topicChip: {
    borderRadius: radius.pill,
    paddingHorizontal: 13,
    paddingVertical: 6,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
  pubAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.bgSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 15,
    height: 38,
  },
  aiCard: {
    marginHorizontal: 24,
    marginTop: 24,
    borderRadius: radius.lg,
  },
  aiInner: {
    borderRadius: radius.lg,
    padding: 18,
  },
  aiIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numPill: {
    backgroundColor: 'rgba(57,121,255,0.09)',
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  quoteBlock: { marginVertical: 26, paddingLeft: 20 },
  quoteBar: {
    position: 'absolute',
    left: 0,
    top: 10,
    bottom: 4,
    width: 3.5,
    borderRadius: 2,
  },
  sourceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.md,
    height: 52,
  },
});
