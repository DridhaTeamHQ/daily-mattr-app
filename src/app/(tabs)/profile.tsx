import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { tick, soft } from '@/lib/haptics';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  FadeInDown,
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import { colors, radius, shadow, spring, topicOf, personalityOf } from '@/theme';
import { Txt, Press, SectionHeader, LIcon } from '@/components/ui';
import { ArticleRow } from '@/components/cards';
import { NAVBAR_CLEARANCE } from '@/components/navbar';
import { fetchByIds } from '@/lib/queries';
import { useStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';

const DAY = 86_400_000;

export default function Profile() {
  const { c, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { saved, savedTopics, history, topTopics, toggleSaved } = useStore();
  const [tab, setTab] = useState<'Saved' | 'History'>('Saved');

  const stats = useMemo(() => {
    const topics = new Set<string>();
    history.forEach((h) => topics.add(h.topic));
    saved.forEach((id) => savedTopics[id] && topics.add(savedTopics[id]));

    const days = new Set(history.map((h) => Math.floor(h.at / DAY)));
    let streak = 0;
    let d = Math.floor(Date.now() / DAY);
    while (days.has(d)) {
      streak++;
      d--;
    }

    const today = Math.floor(Date.now() / DAY);
    const week = Array.from({ length: 7 }, (_, i) => {
      const day = today - 6 + i;
      return history.filter((h) => Math.floor(h.at / DAY) === day).length;
    });

    return { topicCount: topics.size, streak, week };
  }, [history, saved, savedTopics]);

  const personality = personalityOf(topTopics[0] ?? null);
  const maxWeek = Math.max(...stats.week, 1);

  const ids = tab === 'Saved' ? saved : history.map((h) => h.id).slice(0, 30);
  const { data } = useQuery({
    queryKey: ['profileList', tab, ids.join(',')],
    queryFn: () => fetchByIds(ids),
    enabled: ids.length > 0,
  });

  const collections = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const id of saved) {
      const t = savedTopics[id] ?? 'Explained';
      counts[t] = (counts[t] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [saved, savedTopics]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: NAVBAR_CLEARANCE + 16 }}>
        {/* Rich gradient header with radial highlight */}
        <View style={{ overflow: 'hidden' }}>
          <LinearGradient
            colors={['#0B1428', '#132347', '#1E3A8A']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ paddingTop: insets.top + 12, paddingBottom: 70 }}
          >
            {/* radial glow accents */}
            <LinearGradient
              colors={['rgba(102,148,255,0.35)', 'rgba(102,148,255,0)']}
              style={s.glowTR}
            />
            <LinearGradient
              colors={['rgba(155,108,255,0.25)', 'rgba(155,108,255,0)']}
              style={s.glowBL}
            />
            <View style={{ alignItems: 'flex-end', paddingHorizontal: 18 }}>
              <Press onPress={() => router.push('/settings')} scaleTo={0.9} style={{ padding: 6 }}>
                <LIcon name="settings" size={19} color="rgba(255,255,255,0.75)" />
              </Press>
            </View>
            <Animated.View entering={FadeIn.duration(500)} style={s.headRow}>
              {/* gradient avatar ring */}
              <LinearGradient colors={['#6694FF', '#9B6CFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.avatarRing}>
                <View style={s.avatar}>
                  <Txt size={30} weight="extrabold" color="#fff">
                    D
                  </Txt>
                </View>
              </LinearGradient>
              <View style={{ marginLeft: 18, flex: 1 }}>
                <Txt size={25} weight="extrabold" color="#fff" ls={-0.6}>
                  Daily Reader
                </Txt>
                <LinearGradient
                  colors={['rgba(102,148,255,0.3)', 'rgba(155,108,255,0.22)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={s.personaPill}
                >
                  <LIcon name="sparkles" size={11} color="#C7D8FF" />
                  <Txt size={12} weight="semibold" color="#C7D8FF">
                    {personality}
                  </Txt>
                </LinearGradient>
              </View>
            </Animated.View>

            <View style={s.statsRow}>
              <Stat n={history.length} label="Articles Read" />
              <View style={s.statDiv} />
              <Stat n={stats.streak} label="Day Streak" suffix={stats.streak > 0 ? ' 🔥' : ''} />
              <View style={s.statDiv} />
              <Stat n={saved.length} label="Saved" />
              <View style={s.statDiv} />
              <Stat n={stats.topicCount} label="Topics" />
            </View>
          </LinearGradient>
        </View>

        {/* Overlapping sheet */}
        <View style={[s.sheet, { backgroundColor: c.bg }, isDark ? null : shadow.soft]}>
          {/* Weekly bars, animated */}
          <Animated.View entering={FadeInDown.delay(120).springify().damping(30).stiffness(250).mass(0.9)}>
            <LinearGradient colors={isDark ? ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.05)'] : ['#F7F9FD', '#EFF4FB']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.weekCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Txt size={15} weight="bold">
                  This week
                </Txt>
                <Txt size={12} weight="medium" color={c.inkSoft}>
                  {stats.week.reduce((a, b) => a + b, 0)} articles
                </Txt>
              </View>
              <View style={s.barsRow}>
                {stats.week.map((n, i) => (
                  <WeekBar key={i} n={n} max={maxWeek} index={i} isToday={i === 6} />
                ))}
              </View>
            </LinearGradient>
          </Animated.View>

          {/* Segmented */}
          <View style={[s.segmentWrap, { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : '#EEF1F6' }]}>
            {(['Saved', 'History'] as const).map((t) => (
              <Press
                key={t}
                haptic={false}
                onPress={() => {
                  tick();
                  setTab(t);
                }}
                style={[s.segment, tab === t ? { backgroundColor: isDark ? c.brand : '#0B0D12', boxShadow: '0 4px 14px rgba(11,13,18,0.25)' } : null]}
              >
                <Txt size={13.5} weight="semibold" color={tab === t ? '#fff' : c.inkSoft}>
                  {t}
                </Txt>
              </Press>
            ))}
          </View>

          {tab === 'Saved' && collections.length > 0 ? (
            <>
              <SectionHeader title="Collections" style={{ marginTop: 26, marginBottom: 12 }} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24 }}>
                {collections.map(([topic, count], i) => {
                  const meta = topicOf(topic);
                  return (
                    <Animated.View key={topic} entering={FadeInDown.delay(i * 70)}>
                      <LinearGradient colors={meta.pastel} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.collection}>
                        <View style={s.collectionWatermark}>
                          <LIcon name={meta.icon} size={64} color={meta.pastelInk} strokeWidth={1.4} />
                        </View>
                        <LIcon name={meta.icon} size={17} color={meta.pastelInk} strokeWidth={2} />
                        <Txt size={14} weight="bold" color={meta.pastelInk} style={{ marginTop: 10 }}>
                          {topic}
                        </Txt>
                        <Txt size={11.5} weight="medium" color={meta.pastelInk} style={{ opacity: 0.7 }}>
                          {count} article{count > 1 ? 's' : ''}
                        </Txt>
                      </LinearGradient>
                    </Animated.View>
                  );
                })}
              </ScrollView>
            </>
          ) : null}

          <View style={{ height: 12 }} />
          {ids.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 48 }}>
              <LinearGradient colors={['#EAF1FF', '#DCE8FF']} style={s.emptyIcon}>
                <LIcon name={tab === 'Saved' ? 'bookmark' : 'history'} size={24} color={c.brand} />
              </LinearGradient>
              <Txt size={15.5} weight="bold" style={{ marginTop: 16 }}>
                {tab === 'Saved' ? 'Nothing saved yet' : 'No reading history'}
              </Txt>
              <Txt size={13} weight="medium" color={c.inkSoft} style={{ marginTop: 5, textAlign: 'center', maxWidth: 240 }}>
                {tab === 'Saved' ? 'Tap the bookmark on any story to keep it here.' : 'Stories you read will appear here.'}
              </Txt>
            </View>
          ) : (
            (data ?? []).map((a, i) =>
              tab === 'Saved' ? (
                <SwipeToDelete key={a.id} onDelete={() => toggleSaved(a.id, a.topic)}>
                  <ArticleRow a={a} index={i} />
                </SwipeToDelete>
              ) : (
                <ArticleRow key={a.id} a={a} index={i} />
              ),
            )
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// Swipe right on a saved row → red trash panel slides in from the left;
// releasing past the threshold removes the article from Saved.
function SwipeToDelete({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
  return (
    <ReanimatedSwipeable
      friction={1.6}
      leftThreshold={72}
      overshootLeft={false}
      renderLeftActions={() => (
        <View style={sw.deletePanel}>
          <LIcon name="trash-2" size={20} color="#fff" />
          <Txt size={11.5} weight="semibold" color="#fff" style={{ marginTop: 4 }}>
            Remove
          </Txt>
        </View>
      )}
      onSwipeableWillOpen={(dir) => {
        if (dir === 'left') {
          soft();
          onDelete();
        }
      }}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

const sw = StyleSheet.create({
  deletePanel: {
    width: 96,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

function WeekBar({ n, max, index, isToday }: { n: number; max: number; index: number; isToday: boolean }) {
  const { c } = useTheme();
  const h = useSharedValue(0);
  useEffect(() => {
    h.value = withDelay(200 + index * 70, withSpring(Math.max(0.09, n / max), spring.gentle));
  }, [n, max, index, h]);
  const a = useAnimatedStyle(() => ({ height: `${h.value * 100}%` }));
  const label = new Date(Date.now() - (6 - index) * DAY).toLocaleDateString(undefined, { weekday: 'narrow' });
  return (
    <View style={{ alignItems: 'center', flex: 1, gap: 7 }}>
      <View style={ws.track}>
        <Animated.View style={[ws.fillWrap, a]}>
          <LinearGradient
            colors={isToday ? ['#6694FF', '#3979FF'] : n > 0 ? ['#C6D7FB', '#AEC7F9'] : ['#E8ECF3', '#E8ECF3']}
            style={{ flex: 1, borderRadius: 8 }}
          />
        </Animated.View>
      </View>
      <Txt size={10.5} weight={isToday ? 'bold' : 'medium'} color={isToday ? c.brand : c.inkFaint}>
        {label}
      </Txt>
    </View>
  );
}

const ws = StyleSheet.create({
  track: { width: 15, height: 66, justifyContent: 'flex-end' },
  fillWrap: { width: '100%', borderRadius: 8, overflow: 'hidden' },
});

function Stat({ n, label, suffix = '' }: { n: number; label: string; suffix?: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Txt size={22} weight="extrabold" color="#fff" ls={-0.5}>
        {n}
        {suffix}
      </Txt>
      <Txt size={10.5} weight="medium" color="rgba(255,255,255,0.5)" style={{ marginTop: 3 }}>
        {label}
      </Txt>
    </View>
  );
}

const s = StyleSheet.create({
  glowTR: {
    position: 'absolute',
    top: -100,
    right: -80,
    width: 320,
    height: 320,
    borderRadius: 160,
  },
  glowBL: {
    position: 'absolute',
    bottom: -120,
    left: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 26, marginTop: 2 },
  avatarRing: {
    width: 82,
    height: 82,
    borderRadius: 41,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 10px 30px rgba(102,148,255,0.4)',
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#182C55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  personaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 5,
    marginTop: 8,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 26,
    paddingHorizontal: 18,
  },
  statDiv: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.1)' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    marginTop: -38,
    paddingTop: 24,
    minHeight: 520,
  },
  weekCard: {
    marginHorizontal: 24,
    borderRadius: radius.lg,
    padding: 18,
  },
  barsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    height: 90,
    alignItems: 'flex-end',
  },
  segmentWrap: {
    flexDirection: 'row',
    backgroundColor: colors.bgSoft,
    borderRadius: radius.pill,
    marginHorizontal: 24,
    marginTop: 22,
    padding: 4,
  },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.pill },
  segmentActive: { backgroundColor: colors.ink, boxShadow: '0 4px 14px rgba(11,13,18,0.25)' },
  collection: {
    borderRadius: radius.lg,
    padding: 16,
    marginRight: 12,
    minWidth: 124,
    overflow: 'hidden',
  },
  collectionWatermark: {
    position: 'absolute',
    right: -14,
    bottom: -14,
    opacity: 0.09,
  },
  emptyIcon: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
