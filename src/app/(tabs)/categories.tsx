import React, { useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { colors, radius, shadow, topicOf } from '@/theme';
import { useTheme } from '@/lib/theme';
import { Hero, Txt, Press, SectionHeader, Shimmer, EasedScrim, LIcon } from '@/components/ui';
import { ArticleRow, TrendingRow } from '@/components/cards';
import { NAVBAR_CLEARANCE } from '@/components/navbar';
import { fetchTopicStats, fetchTrending, fetchFeed } from '@/lib/queries';
import { compact } from '@/lib/content';

const W = Dimensions.get('window').width;
const TILE_W = (W - 60) / 2;
const TILE_BIG_W = W - 48;

// Bundled editorial artwork (generated brand art, no network fetch)
const FEATURED: { topic: string; label: string; desc: string; art: any; big?: boolean }[] = [
  { topic: 'Tech & AI', label: 'Artificial Intelligence', desc: 'Machines learning to think', art: require('../../../assets/images/topics/tech-ai.webp'), big: true },
  { topic: 'Business', label: 'Business & Finance', desc: 'Markets, money, momentum', art: require('../../../assets/images/topics/business.webp') },
  { topic: 'World', label: 'World News', desc: 'The globe, in short', art: require('../../../assets/images/topics/world.webp') },
  { topic: 'Politics', label: 'Politics', desc: 'Power and policy', art: require('../../../assets/images/topics/politics.webp') },
  { topic: 'Science', label: 'Science & Space', desc: 'Beyond the horizon', art: require('../../../assets/images/topics/science.webp') },
];

export default function Categories() {
  const { c, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [active, setActive] = useState<string | null>(null);

  const stats = useQuery({ queryKey: ['topicStats'], queryFn: fetchTopicStats });
  const trending = useQuery({ queryKey: ['trendingTop'], queryFn: () => fetchTrending(5) });
  const filtered = useQuery({
    queryKey: ['catFeed', active],
    queryFn: () => fetchFeed({ topics: active ? [active] : undefined, limit: 15 }),
    enabled: !!active,
  });

  const allTopics = useMemo(
    () => Object.entries(stats.data ?? {}).sort((a, b) => b[1] - a[1]),
    [stats.data],
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: NAVBAR_CLEARANCE + 16 }}
      >
        <Animated.View entering={FadeIn.duration(400)} style={{ paddingHorizontal: 24 }}>
          <Hero>Explore</Hero>
          <Txt size={15} weight="medium" color={c.inkSoft} style={{ marginTop: 6 }}>
            Discover what matters to you.
          </Txt>
        </Animated.View>

        {active ? (
          <>
            <View style={s.activeHeader}>
              <Press onPress={() => setActive(null)} scaleTo={0.9} style={[s.backBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF1F6' }]}>
                <LIcon name="arrow-left" size={18} color={c.ink} />
              </Press>
              <Hero style={{ fontSize: 28, lineHeight: 34 }}>{active}</Hero>
            </View>
            {filtered.isLoading ? (
              <View style={{ gap: 14, paddingHorizontal: 24, marginTop: 10 }}>
                <Shimmer style={{ height: 88 }} />
                <Shimmer style={{ height: 88 }} />
              </View>
            ) : (
              (filtered.data ?? []).map((a, i) => <ArticleRow key={a.id} a={a} showTopic={false} index={i} />)
            )}
          </>
        ) : (
          <>
            {/* Featured — magazine layout */}
            <SectionHeader title="Featured Topics" style={{ marginTop: 24 }} />
            <View style={s.grid}>
              {FEATURED.map((f, i) => {
                const count = stats.data?.[f.topic] ?? 0;
                const w = f.big ? TILE_BIG_W : TILE_W;
                const h = f.big ? 190 : 156;
                return (
                  <Animated.View key={f.topic} entering={FadeInDown.delay(i * 90).springify().damping(30).stiffness(250).mass(0.9)}>
                    <Press onPress={() => setActive(f.topic)} style={[s.tile, { width: w, height: h }, shadow.lift]}>
                      <Image source={f.art} style={StyleSheet.absoluteFill} contentFit="cover" transition={240} />
                      <EasedScrim variant="bottom" />
                      <View style={{ position: 'absolute', left: 16, right: 16, bottom: 14 }}>
                        <Txt size={f.big ? 24 : 16.5} weight="extrabold" color="#fff" ls={-0.5}>
                          {f.label}
                        </Txt>
                        <Txt size={11.5} weight="medium" color="rgba(255,255,255,0.72)" style={{ marginTop: 3 }}>
                          {f.desc} · {compact(count)} articles
                        </Txt>
                      </View>
                    </Press>
                  </Animated.View>
                );
              })}
            </View>

            {/* All topics — pastel gradient chips */}
            <SectionHeader title="All Topics" />
            <View style={s.chipsWrap}>
              {allTopics.map(([topic, count], i) => {
                const meta = topicOf(topic);
                return (
                  <Animated.View key={topic} entering={FadeInDown.delay(Math.min(i, 8) * 45)}>
                    <Press onPress={() => setActive(topic)} scaleTo={0.95}>
                      <LinearGradient
                        colors={meta.pastel}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={s.topicChip}
                      >
                        <LIcon name={meta.icon} size={14} color={meta.pastelInk} strokeWidth={2} />
                        <Txt size={13} weight="semibold" color={meta.pastelInk}>
                          {topic}
                        </Txt>
                        <Txt size={11} weight="medium" color={meta.pastelInk} style={{ opacity: 0.55 }}>
                          {count}
                        </Txt>
                      </LinearGradient>
                    </Press>
                  </Animated.View>
                );
              })}
            </View>

            <SectionHeader title="Trending Today" />
            {(trending.data ?? []).map((a, i) => (
              <TrendingRow key={a.id} a={a} rank={i + 1} />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 24,
    height: 50,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.75)',
  },
  searchTint: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(248,250,252,0.55)' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 24,
    gap: 12,
  },
  tile: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.dark },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 24,
    gap: 9,
  },
  topicChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    height: 38,
  },
  activeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    marginTop: 22,
    marginBottom: 8,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.bgSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
