import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Share, Dimensions, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { soft, tick, save as saveHaptic } from '@/lib/haptics';
import {
  useIsSpeaking,
  toggleSpeech as toggleSpeechFor,
  stop as stopSpeech,
  speakingId,
} from '@/lib/speech';
import * as WebBrowser from 'expo-web-browser';
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  withTiming,
  Easing,
  Extrapolation,
} from 'react-native-reanimated';
import { colors, radius, shadow, topicOf, duration } from '@/theme';
import { Headline, Txt, BodyText, Press, IconButton, EasedScrim, LIcon, LogoLoader } from '@/components/ui';
import { RecommendCard } from '@/components/cards';
import { fetchArticle, fetchRelated } from '@/lib/queries';
import { timeAgo, hasAiSummary } from '@/lib/content';
import { pullQuoteFrom } from '@/lib/sentences';
import { factBadge, type FactTone } from '@/lib/factLabel';
import { useStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { track, createDwellTimer } from '@/lib/telemetry';
import { artFor } from '@/lib/topicArt';
import { ImagePeek } from '@/components/imagePeek';
import { enterContent } from '@/lib/transitions';

const { width: W } = Dimensions.get('window');
const HERO_H = 400;

export default function ArticleScreen() {
  const { c, isDark } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { recordRead, isSaved, toggleSaved, isLiked, toggleLiked } = useStore();
  const speaking = useIsSpeaking(id);
  const [peeking, setPeeking] = useState(false);
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
      // only silence our own audio: leaving this screen should not stop a
      // reader card that was already playing when we arrived
      if (speakingId() === a.id) stopSpeech();
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

  /* scaleX, not width.

     A percentage width inside useAnimatedStyle is a layout property, so
     Reanimated has to run a Yoga pass on the UI thread for every frame it
     changes — and this one is driven by the scroll handler, so that was a
     layout pass per scroll frame for the whole article. scaleX is a pure
     compositor transform: the same bar, none of the cost. The fill is laid
     out full width once and anchored left by transformOrigin. */
  const progressStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.value }] }));

  /* Which text the body is made of matters to the pull quote below, so the two
     are derived together rather than each guessing. `bodyIsSummary` is the
     case where the row has no scraped article text and no deep dive — the
     paragraphs the reader sees are the summary they just read in the card
     above. */
  const { paragraphs, bodyIsSummary } = useMemo(() => {
    if (!a) return { paragraphs: [] as string[], bodyIsSummary: false };
    const deep = a.modes?.deepDive && a.modes.deepDive.length > a.summary.length ? a.modes.deepDive : null;
    const src = deep ?? a.body ?? a.summary;
    return {
      paragraphs: src
        .split(/\n+/)
        .flatMap((p) => (p.length > 700 ? p.match(/.{1,600}(?:\s|$)/g) ?? [p] : [p]))
        .map((p) => p.trim())
        .filter((p) => p.length > 40)
        .slice(0, 10),
      bodyIsSummary: !deep && !a.body,
    };
  }, [a]);

  /* The pull quote is the one thing breaking up a column of body text, and it
     used to be `modes.tldr[0]` — null for the ~88% of rows the summariser has
     not reached, so almost every article was a flat wall.

     Suppressed when the body is the summary. A quote lifted from the summary
     and set three lines below the summary is not a pull quote, it is the same
     sentence twice. Short summaries dodged this by accident (one paragraph
     means the `i === 1` slot never comes round) but one over 700 characters
     gets chunked into two, and then it would have shown. */
  const pullQuote = useMemo(
    () => (bodyIsSummary ? null : pullQuoteFrom(a?.modes?.tldr, a?.summary)),
    [a, bodyIsSummary],
  );
  const byAi = !!a && hasAiSummary(a);

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

  // routed through lib/speech so this screen and a reader card can't both
  // believe they are playing — Speech.stop() is global, so whoever starts
  // second silences the first, and only a shared owner tells the first
  const toggleSpeech = () => toggleSpeechFor(a.id, `${a.title}. ${a.summary}`);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* thin reading progress */}
      <View style={[s.progressTrack, { top: insets.top }]}>
        <Animated.View style={[s.progressFill, progressStyle]} />
      </View>

      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 44 }}>
        {/* parallax + mount-zoom hero. Holding it lifts the whole frame — the
            hero is cropped hard to 400pt and scaled on mount, so what is on
            screen is a long way from the photograph as filed.

            The hold is detected by a Pressable rather than a gesture
            recogniser. Same reason as the reader card: this is the mechanism
            that reliably wins a long press inside a scroll view, so all three
            surfaces now use it and behave identically. */}
        <ImagePeek
          source={a.imageUrl ? { uri: a.imageUrl } : artFor(a.topic)}
          caption={a.title}
          held={peeking}
        />
        <Pressable
          onLongPress={() => setPeeking(true)}
          onPressOut={() => setPeeking(false)}
          delayLongPress={240}
          style={{ height: HERO_H, overflow: 'hidden' }}
        >
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
        </Pressable>

        {/* headline block */}
        <Animated.View entering={enterContent()} style={{ paddingHorizontal: 24, marginTop: -92 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            <LinearGradient colors={[c.brandLight, c.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.topicChip}>
              <Txt size={11.5} weight="semibold" color="#fff" ls={0.3}>
                {a.topic}
              </Txt>
            </LinearGradient>
            <FactChip label={a.factLabel} />
          </View>
          <Headline style={{ marginTop: 14 }}>{a.title}</Headline>

          <View style={s.metaRow}>
            <LinearGradient colors={t.grad} style={s.pubAvatar}>
              <Txt size={13.5} weight="bold" color="#fff">
                {a.publisher.slice(0, 1)}
              </Txt>
            </LinearGradient>
            <View style={{ flex: 1, marginLeft: 11 }}>
              {/* the blue tick is gone: it asserted a verification the app
                  never performs, and the fact-check chip above the headline is
                  the one badge here that is actually backed by data */}
              <Txt size={13.5} weight="semibold">
                {a.publisher}
              </Txt>
              <Txt size={12} weight="medium" color={c.inkFaint} style={{ marginTop: 2 }}>
                {timeAgo(a.publishedAt)} · {a.readMins} min read
              </Txt>
            </View>
            <Press haptic={false} onPress={toggleSpeech} style={[s.listenBtn, { backgroundColor: c.bgSoft }, speaking ? { backgroundColor: c.brand } : null]}>
              <LIcon name={speaking ? 'square' : 'headphones'} size={14} color={speaking ? '#fff' : c.ink} />
              <Txt size={13} weight="semibold" color={speaking ? '#fff' : c.ink}>
                {speaking ? 'Stop' : 'Listen'}
              </Txt>
            </Press>
          </View>
        </Animated.View>

        {/* The summary card, labelled by provenance.

            This said "AI Summary" over a sparkles mark for every article. On
            live data only about one row in eight has been through the
            summariser (`versions` is null for the rest), so seven times out of
            eight the app was crediting an AI with the publisher's own RSS
            blurb. The card is the same shape either way — the text really is
            the summary — but the mark, the heading and the attribution now
            tell the truth, and the AI badge means something again when it
            does appear. */}
        <Animated.View entering={enterContent().delay(duration.instant)} style={[s.aiCard, byAi ? shadow.glowBrand : null]}>
          <LinearGradient
            colors={
              isDark
                ? byAi
                  ? ['rgba(255,255,255,0.09)', 'rgba(77,136,255,0.08)']
                  : ['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.04)']
                : byAi
                  ? ['#FFFFFF', '#F5F9FF']
                  : ['#FFFFFF', '#F6F8FB']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.aiInner}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              {byAi ? (
                <LinearGradient colors={[c.brandLight, c.brand]} style={s.aiIcon}>
                  <LIcon name="sparkles" size={12} color="#fff" />
                </LinearGradient>
              ) : (
                <View style={[s.aiIcon, { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : '#E7ECF4' }]}>
                  <LIcon name="align-left" size={12} color={c.inkSoft} strokeWidth={2.4} />
                </View>
              )}
              <Txt size={13.5} weight="bold">
                {byAi ? 'AI Summary' : 'In brief'}
              </Txt>
              {!byAi ? (
                <Txt size={11.5} weight="medium" color={c.inkFaint} numberOfLines={1} style={{ flexShrink: 1 }}>
                  · from {a.publisher}
                </Txt>
              ) : null}
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

/* The fact-check verdict as a chip you can actually read.

   Tinted rather than solid so it sits beside the topic chip without competing
   with it — the topic is what the story is, this is a footnote about how far
   it has been checked. `unknown` deliberately gets no colour at all: an
   unverified story should look like an absence of evidence, not a warning. */
function FactChip({ label }: { label: string | null }) {
  const { c, isDark } = useTheme();
  const badge = factBadge(label);
  if (!badge) return null;

  const tint: Record<FactTone, string> = {
    good: c.success,
    ok: c.brand,
    warn: c.warning,
    unknown: c.inkFaint,
  };
  const ink = tint[badge.tone];

  return (
    <View
      accessible
      accessibilityLabel={`Fact check: ${badge.label}`}
      style={[
        s.factChip,
        { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(11,13,18,0.04)' },
      ]}
    >
      <LIcon name={badge.icon} size={12.5} color={ink} strokeWidth={2.3} />
      <Txt size={11.5} weight="semibold" color={ink}>
        {badge.label}
      </Txt>
    </View>
  );
}

const s = StyleSheet.create({
  factChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    zIndex: 20,
    backgroundColor: 'transparent',
  },
  progressFill: {
    // full width, then scaled from the left edge — see progressStyle
    width: '100%',
    transformOrigin: 'left center',
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
