import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { tick, soft } from '@/lib/haptics';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
} from 'react-native-reanimated';

const ROW_COLLAPSE = reflow();
import { colors, radius, shadow, spring, topicOf, personalityOf } from '@/theme';
import { Txt, Press, SectionHeader, LIcon, ProgressRing } from '@/components/ui';
import { ArticleRow } from '@/components/cards';
import { NAVBAR_CLEARANCE } from '@/components/navbar';
import { fetchByIds } from '@/lib/queries';
import { UNCLASSIFIED } from '@/lib/categories';
import { useStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { useProgress, useStreak, weekCounts } from '@/lib/progress';
import { lastNDays, startOfLocalDay, dayKey } from '@/lib/day';
import { useEditionProgress } from '@/lib/edition';
import { openCelebration } from '@/lib/celebration';
import { useXp, levelOf, weakestTopics } from '@/lib/xp';
import { artFor as celebrationArtFor } from '@/lib/celebrationArt';
import { enterItem, enterScreen, exitBase, reflow } from '@/lib/transitions';

/* The profile is the only screen that is about the reader rather than the
   news, so it is where everything the app quietly records has to become
   visible. Three things were being tracked and never shown: the level and XP
   earned in the challenge, quiz accuracy, and which topics the reader is
   weakest on. All three now have a home here — see KnowledgeCard.

   Every animation on this screen is transform or opacity only. The week bars
   in particular used to spring a percentage `height`, which is a layout
   property: seven of them meant seven Yoga passes per frame for the length of
   the entrance. They now translate inside a clipped track. */

export default function Profile() {
  const { c, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { saved, savedTopics, history, topTopics, toggleSaved } = useStore();
  const [tab, setTab] = useState<'Saved' | 'History'>('Saved');

  // Streak and the week bars come from lib/progress, which keys days on the
  // *local* calendar and stores one record per day. The version that used to
  // live here bucketed with Math.floor(at / 86400000) — that is UTC, so in IST
  // the day rolled over at 05:30 — and it derived from `history`, which is
  // capped at 200 entries, so a heavy reader's older days fell off the end and
  // the streak silently reset itself.
  const progress = useProgress();
  const ep = useEditionProgress();
  const todayRec = progress.recent[dayKey()];
  const streak = useStreak();
  const xp = useXp();
  const week = useMemo(() => weekCounts(progress), [progress]);
  const lvl = levelOf(xp.xp);

  // "Topics" is gone from the stat row: it counted distinct topics touched,
  // which only ever went up and told the reader nothing they could act on.
  // Accuracy replaced it — it moves in both directions and it is earned.
  const personality = personalityOf(topTopics[0] ?? null);
  const maxWeek = Math.max(...week, 1);
  const accuracy = xp.lifetimeAsked > 0 ? Math.round((xp.lifetimeCorrect / xp.lifetimeAsked) * 100) : null;

  const ids = tab === 'Saved' ? saved : history.map((h) => h.id).slice(0, 30);
  const { data } = useQuery({
    queryKey: ['profileList', tab, ids.join(',')],
    queryFn: () => fetchByIds(ids),
    enabled: ids.length > 0,
    placeholderData: (prev) => prev,
  });

  // saved rows react to the live store, so a swipe-delete vanishes instantly
  const rows = tab === 'Saved' ? (data ?? []).filter((a) => saved.includes(a.id)) : data ?? [];

  const collections = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const id of saved) {
      const t = savedTopics[id] || UNCLASSIFIED;
      counts[t] = (counts[t] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [saved, savedTopics]);

  const openChallenge = () => {
    soft();
    openCelebration({
      storiesRead: ep.read,
      editionSize: ep.total,
      minutes: Math.max(1, Math.round((todayRec?.dwellMs ?? 0) / 60000)),
      topTopic: topTopics[0] ?? null,
      streak: streak.current,
      startPhase: ep.complete ? 'quiz' : 'caughtup',
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: NAVBAR_CLEARANCE + 16 }}>
        <View style={{ overflow: 'hidden' }}>
          <LinearGradient
            // derived from the palette rather than three hardcoded navies —
            // this was the one surface in the app that ignored the theme
            colors={isDark ? ['#070B14', '#0D1730', '#16295C'] : ['#0B1428', '#16264D', c.brandDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ paddingTop: insets.top + 12, paddingBottom: 74 }}
          >
            <LinearGradient colors={['rgba(102,148,255,0.35)', 'rgba(102,148,255,0)']} style={s.glowTR} />
            <LinearGradient colors={['rgba(155,108,255,0.25)', 'rgba(155,108,255,0)']} style={s.glowBL} />

            <View style={s.headerBar}>
              {streak.atRisk ? (
                <View style={s.riskPill}>
                  <LIcon name="triangle-alert" size={11} color="#FFD8A8" strokeWidth={2.4} />
                  <Txt size={11} weight="bold" color="#FFD8A8">
                    Streak at risk
                  </Txt>
                </View>
              ) : (
                <View />
              )}
              <Press onPress={() => router.push('/settings')} scaleTo={0.9} style={{ padding: 6 }}>
                <LIcon name="settings" size={19} color="rgba(255,255,255,0.75)" />
              </Press>
            </View>

            <Animated.View entering={enterScreen()} style={s.headRow}>
              {/* The avatar carries the level. It was a decorative letter in a
                  gradient ring; the ring is now the reader's progress through
                  the current level, so the biggest thing on the screen is
                  also the thing that changes. */}
              <View>
                <ProgressRing size={84} stroke={4} value={lvl.into / lvl.span} color="#8FB4FF" track="rgba(255,255,255,0.16)">
                  <View style={s.avatar}>
                    <Txt size={29} weight="extrabold" color="#fff">
                      D
                    </Txt>
                  </View>
                </ProgressRing>
                <View style={[s.levelBadge, { backgroundColor: c.brand }]}>
                  <Txt size={11.5} weight="extrabold" color="#fff">
                    {lvl.level}
                  </Txt>
                </View>
              </View>

              <View style={{ marginLeft: 18, flex: 1 }}>
                <Txt size={24} weight="extrabold" color="#fff" ls={-0.6}>
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
                <Txt size={11.5} weight="medium" color="rgba(255,255,255,0.5)" style={{ marginTop: 9 }}>
                  {lvl.span - lvl.into} XP to level {lvl.level + 1}
                </Txt>
              </View>
            </Animated.View>

            <View style={s.statsRow}>
              <Stat n={streak.current} label="Day streak" flame={streak.current > 0} />
              <View style={s.statDiv} />
              <Stat n={history.length} label="Read" />
              <View style={s.statDiv} />
              <Stat n={saved.length} label="Saved" />
              <View style={s.statDiv} />
              <Stat n={accuracy} label="Accuracy" suffix="%" />
            </View>
          </LinearGradient>
        </View>

        {/* Overlapping sheet */}
        <View style={[s.sheet, { backgroundColor: c.bg }, isDark ? null : shadow.soft]}>
          {/* Today — the edition, and the way back into the challenge once the
              caught-up moment has been dismissed */}
          <Animated.View entering={enterItem(0)}>
            <Press
              haptic={false}
              scaleTo={0.98}
              onPress={openChallenge}
              accessibilityRole="button"
              style={[s.card, cardTint(isDark), { flexDirection: 'row', alignItems: 'center', gap: 15 }]}
            >
              <ProgressRing
                size={50}
                stroke={4}
                value={ep.total ? ep.read / ep.total : 0}
                color={ep.complete ? c.success : c.brand}
                track={isDark ? 'rgba(255,255,255,0.12)' : 'rgba(11,13,18,0.09)'}
              >
                {ep.complete ? (
                  <LIcon name="check" size={20} color={c.success} strokeWidth={3} />
                ) : (
                  <Txt size={12} weight="extrabold" color={c.brand}>
                    {ep.total ? `${ep.read}/${ep.total}` : '—'}
                  </Txt>
                )}
              </ProgressRing>
              <View style={{ flex: 1 }}>
                <Txt size={15} weight="bold">
                  {ep.complete ? "Today's challenge" : "Today's edition"}
                </Txt>
                <Txt size={12} weight="medium" color={c.inkSoft} style={{ marginTop: 3 }}>
                  {ep.complete
                    ? 'You finished — test what stuck'
                    : ep.total
                      ? `${ep.total - ep.read} left to read`
                      : 'Building your edition'}
                </Txt>
              </View>
              <LIcon name="chevron-right" size={18} color={c.inkFaint} />
            </Press>
          </Animated.View>

          {/* This week */}
          <Animated.View entering={enterItem(1)}>
            <View style={[s.card, cardTint(isDark), { marginTop: 14 }]}>
              <View style={s.cardHead}>
                <Txt size={15} weight="bold">
                  This week
                </Txt>
                <Txt size={12} weight="medium" color={c.inkSoft}>
                  {week.reduce((a, b) => a + b, 0)} articles
                </Txt>
              </View>
              <View style={s.barsRow}>
                {week.map((n, i) => (
                  <WeekBar key={i} n={n} max={maxWeek} index={i} isToday={i === 6} />
                ))}
              </View>
            </View>
          </Animated.View>

          {/* What you know */}
          <Animated.View entering={enterItem(2)}>
            <KnowledgeCard xp={xp} accuracy={accuracy} onStart={openChallenge} />
          </Animated.View>

          {/* Segmented */}
          <View style={[s.segmentWrap, { backgroundColor: c.bgSoft }]}>
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
                {collections.map(([topic, count]) => {
                  const meta = topicOf(topic);
                  return (
                    <LinearGradient key={topic} colors={meta.pastel} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.collection}>
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
                  );
                })}
              </ScrollView>
            </>
          ) : null}

          <View style={{ height: 12 }} />
          {ids.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 48 }}>
              {/* was a hardcoded pale blue — a bright disc floating on the
                  dark canvas, and the last light-only surface in the app */}
              <LinearGradient
                colors={isDark ? ['rgba(77,136,255,0.22)', 'rgba(77,136,255,0.10)'] : ['#EAF1FF', '#DCE8FF']}
                style={s.emptyIcon}
              >
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
            rows.map((a, i) =>
              tab === 'Saved' ? (
                <Animated.View key={a.id} layout={ROW_COLLAPSE} exiting={exitBase()}>
                  <SwipeToDelete onDelete={() => toggleSaved(a.id, a.topic)}>
                    {/* animate: this list is a plain map inside a ScrollView, not
                        a virtualized one, so the entrance plays once per mount
                        rather than on every scroll — see components/cards.tsx */}
                    <ArticleRow a={a} index={i} animate />
                  </SwipeToDelete>
                </Animated.View>
              ) : (
                <ArticleRow key={a.id} a={a} index={i} animate />
              ),
            )
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/* ---------- What you know ----------

   Quiz accuracy and the topics the reader gets wrong most often. Both come
   from lib/xp, which has been recording them since the challenge shipped with
   nowhere to show them. `weakestTopics` needs three answers in a topic before
   it will name it — below that the percentage is noise, and telling someone
   they are bad at Business off one wrong answer is worse than saying nothing. */
function KnowledgeCard({
  xp,
  accuracy,
  onStart,
}: {
  xp: ReturnType<typeof useXp>;
  accuracy: number | null;
  onStart: () => void;
}) {
  const { c, isDark } = useTheme();
  const weak = useMemo(() => weakestTopics(xp).slice(0, 3), [xp]);

  if (xp.lifetimeAsked === 0) {
    return (
      <Press
        haptic={false}
        scaleTo={0.98}
        onPress={onStart}
        accessibilityRole="button"
        style={[s.card, cardTint(isDark), { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 14 }]}
      >
        <Image source={celebrationArtFor('quiz-medal')} style={s.medal} contentFit="contain" />
        <View style={{ flex: 1 }}>
          <Txt size={15} weight="bold">
            What you know
          </Txt>
          <Txt size={12} weight="medium" color={c.inkSoft} style={{ marginTop: 3 }}>
            Take a challenge and this fills in
          </Txt>
        </View>
        <LIcon name="chevron-right" size={18} color={c.inkFaint} />
      </Press>
    );
  }

  return (
    <View style={[s.card, cardTint(isDark), { marginTop: 14 }]}>
      <View style={s.cardHead}>
        <Txt size={15} weight="bold">
          What you know
        </Txt>
        <Txt size={12} weight="medium" color={c.inkSoft}>
          {xp.lifetimeAsked} question{xp.lifetimeAsked === 1 ? '' : 's'}
        </Txt>
      </View>

      <View style={s.knowRow}>
        <ProgressRing
          size={62}
          stroke={5}
          value={(accuracy ?? 0) / 100}
          color={(accuracy ?? 0) >= 70 ? c.success : (accuracy ?? 0) >= 40 ? c.warning : c.danger}
          track={isDark ? 'rgba(255,255,255,0.12)' : 'rgba(11,13,18,0.09)'}
        >
          <Txt size={15} weight="extrabold">
            {accuracy}
            <Txt size={9.5} weight="bold" color={c.inkFaint}>
              %
            </Txt>
          </Txt>
        </ProgressRing>

        <View style={{ flex: 1, gap: 9 }}>
          <MiniStat icon="target" label="Right" value={`${xp.lifetimeCorrect}`} />
          <MiniStat icon="flame" label="Best run" value={`${xp.bestCombo}`} />
          <MiniStat icon="zap" label="Total XP" value={`${xp.xp}`} />
        </View>
      </View>

      {weak.length > 0 ? (
        <View style={s.weakWrap}>
          <Txt size={11} weight="bold" color={c.inkFaint} ls={1.1}>
            WORTH REVISITING
          </Txt>
          <View style={s.weakRow}>
            {weak.map((w) => {
              const meta = topicOf(w.topic);
              return (
                <View key={w.topic} style={[s.weakChip, { backgroundColor: meta.pastel[0] }]}>
                  <LIcon name={meta.icon} size={12} color={meta.pastelInk} strokeWidth={2.2} />
                  <Txt size={11.5} weight="bold" color={meta.pastelInk}>
                    {w.topic}
                  </Txt>
                  <Txt size={11} weight="semibold" color={meta.pastelInk} style={{ opacity: 0.65 }}>
                    {Math.round(w.pct * 100)}%
                  </Txt>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function MiniStat({ icon, label, value }: { icon: string; label: string; value: string }) {
  const { c } = useTheme();
  return (
    <View style={s.miniStat}>
      <LIcon name={icon} size={13} color={c.inkFaint} strokeWidth={2.2} />
      <Txt size={12.5} weight="medium" color={c.inkSoft} style={{ flex: 1 }}>
        {label}
      </Txt>
      <Txt size={13} weight="extrabold">
        {value}
      </Txt>
    </View>
  );
}

// Swipe right on a saved row → red trash panel slides in from the left;
// releasing past the threshold removes the article from Saved.
function SwipeToDelete({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
  return (
    <ReanimatedSwipeable
      friction={1.3}
      leftThreshold={56}
      overshootLeft={false}
      onSwipeableOpenStartDrag={(dir) => {
        if (dir === 'left') tick();
      }}
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

const TRACK_H = 66;

/* translateY inside a clipped track, not an animated `height`.

   A percentage height in useAnimatedStyle is a layout property: Reanimated has
   to run a Yoga pass on the UI thread every frame it changes, and there are
   seven of these springing at once with staggered delays. The bar is now laid
   out once at full height and slid down out of view; the track clips it. Same
   picture, no layout. */
function WeekBar({ n, max, index, isToday }: { n: number; max: number; index: number; isToday: boolean }) {
  const { c, isDark } = useTheme();
  const y = useSharedValue(TRACK_H);
  useEffect(() => {
    const frac = Math.max(0.09, n / max);
    y.value = withDelay(180 + index * 60, withSpring(TRACK_H * (1 - frac), spring.gentle));
  }, [n, max, index, y]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  // via the local-calendar helper rather than Date.now() - n * 86400000: the
  // fixed-millisecond version drifts by an hour across a DST boundary and can
  // label two adjacent bars with the same weekday
  const label = new Date(startOfLocalDay(lastNDays(7)[index])).toLocaleDateString(undefined, {
    weekday: 'narrow',
  });
  return (
    <View style={{ alignItems: 'center', flex: 1, gap: 7 }}>
      <View style={[ws.track, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(11,13,18,0.04)' }]}>
        <Animated.View style={[ws.fill, a]}>
          <LinearGradient
            colors={
              isToday
                ? ['#6694FF', '#3979FF']
                : n > 0
                  ? isDark
                    ? ['rgba(140,175,255,0.55)', 'rgba(110,150,240,0.45)']
                    : ['#C6D7FB', '#AEC7F9']
                  : ['rgba(0,0,0,0)', 'rgba(0,0,0,0)']
            }
            style={{ flex: 1 }}
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
  track: { width: 15, height: TRACK_H, borderRadius: 8, overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, right: 0, height: TRACK_H },
});

function Stat({
  n,
  label,
  suffix = '',
  flame = false,
}: {
  n: number | null;
  label: string;
  suffix?: string;
  flame?: boolean;
}) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <View style={s.statValue}>
        <Txt size={21} weight="extrabold" color="#fff" ls={-0.5}>
          {n === null ? '—' : n}
          {n === null ? '' : suffix}
        </Txt>
        {/* the generated glass flame, not the emoji — the emoji rendered as a
            different glyph on every device and never matched the celebration */}
        {flame ? <Image source={celebrationArtFor('streak-flame')} style={s.flame} contentFit="contain" /> : null}
      </View>
      <Txt size={10.5} weight="medium" color="rgba(255,255,255,0.5)" style={{ marginTop: 3 }}>
        {label}
      </Txt>
    </View>
  );
}

/** one definition for the three sheet cards, instead of the same fill pasted three times */
const cardTint = (isDark: boolean) => ({
  backgroundColor: isDark ? 'rgba(255,255,255,0.055)' : '#FFFFFF',
  borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
  borderColor: 'rgba(255,255,255,0.08)',
});

const s = StyleSheet.create({
  glowTR: { position: 'absolute', top: -100, right: -80, width: 320, height: 320, borderRadius: 160 },
  glowBL: { position: 'absolute', bottom: -120, left: -100, width: 300, height: 300, borderRadius: 150 },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    minHeight: 32,
  },
  riskPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(245,158,11,0.18)',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginLeft: 8,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 26, marginTop: 4 },
  avatar: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: '#182C55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelBadge: {
    position: 'absolute',
    right: -2,
    bottom: 2,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0F1B36',
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
  statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 26, paddingHorizontal: 16 },
  statValue: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  flame: { width: 17, height: 17 },
  medal: { width: 44, height: 44 },
  statDiv: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.1)' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    marginTop: -38,
    paddingTop: 24,
    minHeight: 520,
  },
  card: {
    marginHorizontal: 24,
    borderRadius: radius.lg,
    padding: 18,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  barsRow: { flexDirection: 'row', gap: 8, marginTop: 16, alignItems: 'flex-end' },
  knowRow: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 16 },
  miniStat: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  weakWrap: { marginTop: 18, gap: 9 },
  weakRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  weakChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
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
  collection: {
    borderRadius: radius.lg,
    padding: 16,
    marginRight: 12,
    minWidth: 124,
    overflow: 'hidden',
  },
  collectionWatermark: { position: 'absolute', right: -14, bottom: -14, opacity: 0.09 },
  emptyIcon: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
