import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, BackHandler, AccessibilityInfo, Share, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  interpolate,
  Easing,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
import { radius, shadow, spring, topicOf, duration } from '@/theme';
import { useTheme } from '@/lib/theme';
import { Txt, Press, LIcon, Hero } from './ui';
import { Image } from 'expo-image';
import { artFor } from '@/lib/celebrationArt';
import { useCelebration, closeCelebration, openCelebration, type CelebrationPhase } from '@/lib/celebration';
import { useEditionProgress, markCelebrated } from '@/lib/edition';
import { useNavVisibility } from '@/lib/navVisibility';
import { useMotionAllowed } from '@/lib/motion';
import { tick, soft, medium, success, commit } from '@/lib/haptics';
import { markQuizTaken, useProgress, useStreak } from '@/lib/progress';
import { buildQuiz, type Question } from '@/lib/quiz';
import { useQuery } from '@tanstack/react-query';
import { fetchArticlesWithModes, fetchQuizPool } from '@/lib/queries';
import { dayKey } from '@/lib/day';
import { useRouter } from 'expo-router';
import { recordQuiz, useXp, levelOf, hydrate as hydrateXp } from '@/lib/xp';
import { enterChrome, exitQuick } from '@/lib/transitions';

/* The caught-up moment, and the challenge it offers.

   Mounted once in the root layout so it can cover any tab. Everything here is
   drawn in code — no image assets — which keeps it theme-reactive, replayable
   from Profile, and honest under reduce-motion. */

const SHARDS = 18;
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** streak lengths that get a bigger moment than the day before */
const MILESTONES = [3, 7, 14, 30, 60, 100, 365];
const isMilestone = (n: number) => MILESTONES.includes(n);

/* Mounted once in the root layout. Builds the quiz from the stories actually
   read today, then renders the overlay. Both queries only run while the
   celebration is open, so nothing is fetched for a moment that never happens. */
export function CelebrationHost() {
  useEffect(() => {
    hydrateXp();
  }, []);
  const c = useCelebration();
  const progress = useProgress();
  const streak = useStreak();
  const ep = useEditionProgress();
  const today = progress.recent[dayKey()];
  const todayIds = today?.readIds ?? [];

  /* Fires once per edition. The guard is the persisted `celebratedAt`, not
     component state — the card that completes the edition is usually the one
     you swipe away from, so an effect living on that card would unmount
     before it ran, and a ref would forget across a restart. */
  useEffect(() => {
    if (!ep.complete || ep.celebrated) return;
    markCelebrated();
    const topics = today?.topics ?? {};
    const topTopic =
      Object.entries(topics).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    openCelebration({
      storiesRead: ep.read,
      editionSize: ep.total,
      minutes: Math.max(1, Math.round((today?.dwellMs ?? 0) / 60000)),
      topTopic,
      streak: streak.current,
      startPhase: 'caughtup',
    });
  }, [ep.complete, ep.celebrated, ep.read, ep.total, streak.current, today]);

  const { data } = useQuery({
    queryKey: ['quizSource', todayIds.join(',')],
    queryFn: async () => {
      const [read, pool] = await Promise.all([
        fetchArticlesWithModes(todayIds),
        fetchQuizPool(),
      ]);
      return { read, pool };
    },
    enabled: !!c && todayIds.length > 0,
    staleTime: 6 * 3600_000,
  });

  const questions = useMemo(
    () => (data ? buildQuiz(data.read, data.pool, 5) : []),
    [data],
  );

  return <CelebrationOverlay questions={questions} />;
}

export function CelebrationOverlay({ questions }: { questions: Question[] }) {
  const c = useCelebration();
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<CelebrationPhase>('caughtup');
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [gained, setGained] = useState(0);
  const nav = useNavVisibility();
  const open = useSharedValue(0);
  const burst = useSharedValue(0);
  /* The app's own motion setting, not a raw system read.

     This used to call AccessibilityInfo directly, which ignored the three-way
     preference in Settings ('system' | 'reduced' | 'full') and reported false
     on the first frame — so a reader who had turned motion off still got the
     confetti burst on the very celebration they opened. */
  const reduceMotion = !useMotionAllowed();

  useEffect(() => {
    if (c) {
      setPhase(c.startPhase);
      setAnswers([]);
      setMounted(true);
      nav.hide();
      open.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
      if (!reduceMotion) burst.value = withDelay(280, withTiming(1, { duration: 950 }));
      success();
    } else if (mounted) {
      /* Give the bar back first, unconditionally.

         It used to ride along inside the same 210ms timer that unmounts the
         overlay, and the cleanup cancelled that timer whenever `c` changed
         before it fired — closing one celebration straight into another. In
         that path nav.show() never ran, and the bar sat translated 150pt
         off-screen where nothing could tap it back. Restoring chrome is not
         something to schedule; only the unmount needs to wait for the fade. */
      nav.show();
      open.value = withTiming(0, { duration: 190 });
      // Cleared from JS rather than a worklet callback: a dropped callback
      // would leave the overlay mounted, invisible and swallowing every touch.
      const t = setTimeout(() => {
        setMounted(false);
        burst.value = 0;
      }, 210);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c]);

  // Android hardware back must close the overlay, not pop the route behind it
  useEffect(() => {
    if (!mounted) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeCelebration();
      return true;
    });
    return () => sub.remove();
  }, [mounted]);

  const shell = useAnimatedStyle(() => ({
    opacity: open.value,
    pointerEvents: open.value > 0.5 ? 'auto' : 'none',
  }));
  const card = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(open.value, [0, 1], [0.94, 1], Extrapolation.CLAMP) },
      { translateY: interpolate(open.value, [0, 1], [22, 0], Extrapolation.CLAMP) },
    ],
  }));

  if (!mounted || !c) return null;
  return <Shell c={c} phase={phase} setPhase={setPhase} answers={answers} setAnswers={setAnswers}
    gained={gained} setGained={setGained}
    questions={questions} shell={shell} card={card} burst={burst} reduceMotion={reduceMotion} />;
}

function Shell({
  c, phase, setPhase, answers, setAnswers, gained, setGained, questions, shell, card, burst, reduceMotion,
}: any) {
  const { c: col, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const score = answers.filter(Boolean).length;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, s.wrap, shell]} accessibilityViewIsModal>
      <LinearGradient colors={col.canvas} style={StyleSheet.absoluteFill} />
      {!reduceMotion ? <Confetti burst={burst} tint={col.brand} /> : null}

      <ScrollView
        bounces={false}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 28,
          paddingHorizontal: 26,
        }}
      >
        <Animated.View style={card}>
          {phase === 'caughtup' ? (
            <Animated.View key="c" entering={enterChrome()} exiting={exitQuick()}>
              <GlassHero kind="trophy" reduceMotion={reduceMotion} />
              <Txt display size={32} lh={37} weight="extrabold" ls={-1.1} style={{ marginTop: 22 }}>
                You&apos;re all caught up
              </Txt>
              <Txt size={14.5} weight="medium" color={col.inkSoft} style={{ marginTop: 8 }}>
                {c.storiesRead} of {c.editionSize} stories · about {c.minutes} min
                {c.topTopic ? ` · mostly ${c.topTopic}` : ''}
              </Txt>

              {/* A milestone day gets its own treatment — the glass flame and
                  brand-tinted panel — so 7 days doesn't look identical to 2. */}
              <View
                style={[
                  s.streakRow,
                  isMilestone(c.streak)
                    ? { backgroundColor: isDark ? 'rgba(57,121,255,0.18)' : '#E9F0FF' }
                    : { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : '#F1F5FC' },
                ]}
              >
                {isMilestone(c.streak) ? (
                  <Image source={artFor('streak-flame')} style={s.flame} contentFit="contain" />
                ) : (
                  <Txt size={22}>🔥</Txt>
                )}
                <View style={{ flex: 1 }}>
                  <Txt size={15.5} weight="extrabold">
                    {c.streak} day{c.streak === 1 ? '' : 's'} in a row
                  </Txt>
                  <Txt size={12} weight="medium" color={col.inkSoft}>
                    {isMilestone(c.streak)
                      ? `${c.streak} days straight — that's a habit now`
                      : 'Come back tomorrow to keep it'}
                  </Txt>
                </View>
              </View>

              {questions.length >= 3 ? (
                <Press
                  haptic={false}
                  scaleTo={0.97}
                  onPress={() => {
                    soft();
                    setPhase('quiz');
                  }}
                  style={[s.cta, { backgroundColor: col.brand }, shadow.tab]}
                >
                  <LIcon name="brain" size={17} color="#fff" strokeWidth={2.2} />
                  <Txt size={14.5} weight="bold" color="#fff">
                    Take today&apos;s challenge
                  </Txt>
                </Press>
              ) : null}

              <Press haptic={false} scaleTo={0.97} onPress={() => { tick(); closeCelebration(); }} style={s.ghost}>
                <Txt size={13.5} weight="semibold" color={col.inkSoft}>
                  Not now
                </Txt>
              </Press>
            </Animated.View>
          ) : phase === 'quiz' ? (
            <QuizDeck
              key="q"
              questions={questions}
              onDone={(res: boolean[], best: number) => {
                setAnswers(res);
                markQuizTaken();
                setGained(
                  recordQuiz({
                    correct: res.filter(Boolean).length,
                    total: res.length,
                    bestCombo: best,
                    perTopic: res.map((ok, n) => ({ topic: questions[n]?.topic ?? '', correct: ok })),
                  }),
                );
                if (res.every(Boolean)) commit(560);
                else soft();
                setPhase('result');
              }}
            />
          ) : (
            <Animated.View key="r" entering={enterChrome()}>
              <GlassHero kind={score === questions.length ? 'medal' : 'trophy'} reduceMotion={reduceMotion} />
              <Hero style={{ marginTop: 18 }}>
                {score}/{questions.length}
              </Hero>
              <Txt size={15} weight="medium" color={col.inkSoft} style={{ marginTop: 6 }}>
                {score === questions.length
                  ? 'Flawless. That all stuck.'
                  : score >= questions.length - 1
                    ? 'Sharp today.'
                    : score >= 2
                      ? 'Solid read.'
                      : 'Worth a second look tomorrow.'}
              </Txt>

              <LevelBar gained={gained} />

              <Press
                haptic={false}
                scaleTo={0.97}
                onPress={() => { tick(); closeCelebration(); }}
                style={[s.cta, { backgroundColor: col.brand, marginTop: 22 }, shadow.tab]}
              >
                <Txt size={14.5} weight="bold" color="#fff">
                  Done
                </Txt>
              </Press>
              <Press
                haptic={false}
                scaleTo={0.97}
                onPress={() => {
                  tick();
                  /* Text, not an image. A rendered score card needs
                     react-native-view-shot, which is not in Expo Go — so this
                     works today rather than waiting on a dev build. */
                  Share.share({
                    message:
                      `I scored ${score}/${questions.length} on today's Daily Mattr challenge` +
                      (c.streak > 0 ? ` — ${c.streak} day streak 🔥` : ''),
                  }).catch(() => {});
                }}
                style={s.ghost}
              >
                <Txt size={13.5} weight="semibold" color={col.inkSoft}>
                  Share your score
                </Txt>
              </Press>
            </Animated.View>
          )}
        </Animated.View>
      </ScrollView>
    </Animated.View>
  );
}

/* ---------- quiz ---------- */

function QuizDeck({
  questions,
  onDone,
}: {
  questions: Question[];
  onDone: (r: boolean[], bestCombo: number) => void;
}) {
  const { c } = useTheme();
  const router = useRouter();
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  // run of correct answers, and the best run this session
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const q = questions[i];

  // Both timers are tracked so unmounting mid-answer — dismissing the overlay,
  // or Android back — can't fire setState on a dead component or advance a
  // quiz that no longer exists.
  const timers = React.useRef<ReturnType<typeof setTimeout>[]>([]);
  React.useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    },
    [],
  );

  const choose = (idx: number) => {
    if (picked !== null) return;
    tick();
    setPicked(idx);
    const right = idx === q.answerIndex;
    const run = right ? combo + 1 : 0;
    setCombo(run);
    setBestCombo((b) => Math.max(b, run));

    /* Haptic escalates with the run, so a streak is something you can feel
       before you read it. ≥40ms after the tap or the rate gate in lib/haptics
       swallows the second pulse. */
    timers.current.push(
      setTimeout(() => {
        if (!right) medium();
        else if (run >= 4) commit(240);
        else if (run === 3) success();
        else soft();
      }, 90),
    );

    const next = [...results, right];
    setResults(next);
    // longer than before: the review needs time to be read, not just glimpsed
    timers.current.push(
      setTimeout(() => {
        if (i + 1 >= questions.length) onDone(next, Math.max(bestCombo, run));
        else {
          setI(i + 1);
          setPicked(null);
        }
      }, 2400),
    );
  };

  return (
    <Animated.View entering={enterChrome()}>
      <View style={s.progressRow}>
        {questions.map((_: Question, n: number) => (
          <View
            key={n}
            style={[
              s.seg,
              {
                backgroundColor:
                  n < results.length
                    ? results[n]
                      ? c.success
                      : c.danger
                    : n === i
                      ? c.brand
                      : c.divider,
              },
            ]}
          />
        ))}
      </View>
      <View style={s.metaRow}>
        <Txt size={11.5} weight="semibold" color={c.inkFaint} ls={1.4}>
          {`QUESTION ${i + 1} OF ${questions.length}`}
        </Txt>
        {combo >= 2 ? (
          <Animated.View key={combo} entering={enterChrome()} style={s.combo}>
            <Txt size={12}>🔥</Txt>
            <Txt size={12} weight="extrabold" color={c.brand}>
              {combo} in a row
            </Txt>
          </Animated.View>
        ) : null}
      </View>

      <Animated.View key={q.qid} entering={enterChrome()}>
        <View style={[s.pill, { backgroundColor: topicOf(q.topic).wash }]}>
          <Txt size={11} weight="bold" color={c.ink}>
            {q.topic}
          </Txt>
        </View>
        <Txt display size={20} lh={27} weight="bold" ls={-0.4} style={{ marginTop: 12 }}>
          {q.prompt}
        </Txt>

        <View style={{ marginTop: 18, gap: 14 }}>
          {q.options.map((o: string, idx: number) => {
            const isAnswer = idx === q.answerIndex;
            const state =
              picked === null ? 'idle' : isAnswer ? 'right' : idx === picked ? 'wrong' : 'dim';
            return <Option key={idx} label={o} letter={'ABCD'[idx]} state={state} onPress={() => choose(idx)} />;
          })}
        </View>

        {/* The review. This is what separates a quiz from trivia — it says why
            the answer is the answer and offers the story it came from. */}
        {picked !== null ? (
          <Animated.View entering={enterChrome()} style={s.review}>
            {q.because ? (
              <Txt size={13} lh={19} color={c.inkSoft}>
                {q.because}
              </Txt>
            ) : null}
            <Press
              haptic={false}
              scaleTo={0.97}
              onPress={() => {
                tick();
                closeCelebration();
                router.push(`/article/${q.articleId}`);
              }}
              style={s.reviewLink}
            >
              <Txt size={13} weight="bold" color={c.brand} numberOfLines={1} style={{ flex: 1 }}>
                Read the story
              </Txt>
              <LIcon name="chevron-right" size={15} color={c.brand} strokeWidth={2.4} />
            </Press>
          </Animated.View>
        ) : null}
      </Animated.View>
    </Animated.View>
  );
}

/* A button with a shelf under it that the face presses into.

   This is the detail that reads as "premium" more than any animation does:
   the face sits SHELF pixels above a darker slab, and on press it travels down
   onto it while the slab collapses — so the button behaves like a physical key
   instead of a rectangle that dims. Scale alone never sells that. */
const SHELF = 4;

function Option({
  label, letter, state, onPress,
}: { label: string; letter: string; state: 'idle' | 'right' | 'wrong' | 'dim'; onPress: () => void }) {
  const { c, isDark } = useTheme();
  const down = useSharedValue(0);

  // from the palette, never a literal: light and dark define different
  // success/danger, so a hard-coded hex breaks one of the two themes
  const tone = state === 'right' ? c.success : state === 'wrong' ? c.danger : null;
  const face = isDark ? 'rgba(255,255,255,0.07)' : '#FFFFFF';
  const edge = tone ?? (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(11,13,18,0.10)');
  const shelfTone = tone
    ? tone
    : isDark
      ? 'rgba(255,255,255,0.13)'
      : 'rgba(11,13,18,0.13)';

  const faceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: down.value * SHELF }],
  }));

  return (
    <View style={{ opacity: state === 'dim' ? 0.45 : 1 }}>
      {/* the slab the face lands on */}
      <View style={[s.shelf, { backgroundColor: shelfTone }]} />
      <AnimatedPressable
        onPressIn={() => {
          down.value = withTiming(1, { duration: 55 });
        }}
        onPressOut={() => {
          down.value = withTiming(0, { duration: 90 });
        }}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${letter}. ${label}${state === 'right' ? '. Correct' : state === 'wrong' ? '. Incorrect' : ''}`}
        style={[s.opt, { backgroundColor: tone ? `${tone}22` : face, borderColor: edge }, faceStyle]}
      >
        <View style={[s.letter, { backgroundColor: tone ?? (isDark ? 'rgba(255,255,255,0.1)' : '#EEF2F8') }]}>
          {tone ? (
            <LIcon name={state === 'right' ? 'check' : 'x'} size={13} color="#fff" strokeWidth={3.2} />
          ) : (
            <Txt size={12} weight="bold" color={c.inkSoft}>
              {letter}
            </Txt>
          )}
        </View>
        <Txt size={14.5} weight="semibold" style={{ flex: 1 }}>
          {label}
        </Txt>
      </AnimatedPressable>
    </View>
  );
}

/* Level, and the XP just earned filling toward the next one. This is the part
   that accumulates — without it every session resets to nothing and there is
   no reason to come back beyond the streak. */
function LevelBar({ gained }: { gained: number }) {
  const { c, isDark } = useTheme();
  const xp = useXp();
  const { level, into, span } = levelOf(xp.xp);
  const fill = useSharedValue(0);

  useEffect(() => {
    // start from where the bar sat BEFORE this quiz, then run up, so the
    // reward is something you watch arrive rather than something already there
    const before = Math.max(0, into - gained) / span;
    fill.value = before;
    fill.value = withDelay(420, withSpring(into / span, spring.gentle));
  }, [into, span, gained, fill]);

  // scaleX, not width — a percentage width in an animated style costs a Yoga
  // pass per frame, and this one runs while the quiz result is on screen
  const bar = useAnimatedStyle(() => ({
    transform: [{ scaleX: Math.min(1, Math.max(0, fill.value)) }],
  }));

  return (
    <View style={s.level}>
      <View style={s.levelRow}>
        <Txt size={12.5} weight="extrabold">
          Level {level}
        </Txt>
        {gained > 0 ? (
          <Animated.View entering={enterChrome().delay(duration.slow)}>
            <Txt size={12.5} weight="extrabold" color={c.brand}>
              +{gained} XP
            </Txt>
          </Animated.View>
        ) : null}
      </View>
      <View style={[s.track, { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(11,13,18,0.09)' }]}>
        <Animated.View style={[s.fill, { backgroundColor: c.brand }, bar]} />
      </View>
      <Txt size={11} weight="medium" color={c.inkFaint} style={{ marginTop: 6 }}>
        {span - into} XP to level {level + 1}
      </Txt>
    </View>
  );
}

/* ---------- coded celebration art ---------- */

/* Stands in for the generated glass object. Drawn rather than shipped so it
   works in both themes today; a Higgsfield-made glass cutout can replace the
   inner shape later without touching the motion. */
function GlassHero({ kind, reduceMotion }: { kind: 'trophy' | 'medal'; reduceMotion: boolean }) {
  const { c, isDark } = useTheme();
  const enter = useSharedValue(0);
  const float = useSharedValue(0);

  useEffect(() => {
    enter.value = withDelay(120, withSpring(1, spring.bouncy));
    if (!reduceMotion) {
      float.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      );
    }
  }, [enter, float, reduceMotion]);

  const a = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [
      { scale: interpolate(enter.value, [0, 1], [0.5, 1], Extrapolation.CLAMP) },
      { rotateZ: `${interpolate(enter.value, [0, 1], [-10, 0], Extrapolation.CLAMP)}deg` },
      { translateY: interpolate(float.value, [0, 1], [3, -5]) },
    ],
  }));

  return (
    <View style={{ alignItems: 'center' }}>
      {/* Glow behind, shadow only in light mode. On #0A0E17 a shadow is
          invisible, which is why the rest of the app already branches this way
          (see profile.tsx / cards.tsx). */}
      <View style={[s.glow, { backgroundColor: c.brand, opacity: isDark ? 0.2 : 0.11 }]} />
      <Animated.View style={[a, isDark ? null : shadow.hero]}>
        <Image
          source={artFor(kind === 'medal' ? 'quiz-medal' : 'caught-up')}
          style={s.heroArt}
          contentFit="contain"
          transition={220}
        />
      </Animated.View>
    </View>
  );
}

/* One shared value drives every shard — the discipline the HeartBurst in the
   reader already uses. A driver per particle is what makes confetti expensive. */
function Confetti({ burst, tint }: { burst: SharedValue<number>; tint: string }) {
  const shards = useMemo(
    () =>
      Array.from({ length: SHARDS }, (_, i) => ({
        angle: (i / SHARDS) * Math.PI * 2 + (i % 3) * 0.2,
        dist: 120 + (i % 5) * 46,
        size: 5 + (i % 3) * 3,
      })),
    [],
  );
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      {shards.map((sh, i) => (
        <Shard key={i} {...sh} burst={burst} tint={tint} index={i} />
      ))}
    </View>
  );
}

function Shard({
  angle, dist, size, burst, tint, index,
}: { angle: number; dist: number; size: number; burst: SharedValue<number>; tint: string; index: number }) {
  const a = useAnimatedStyle(() => {
    const p = burst.value;
    const d = dist * p;
    // gravity: shards arc rather than flying in a straight line
    return {
      opacity: interpolate(p, [0, 0.15, 0.75, 1], [0, 1, 1, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: Math.cos(angle) * d },
        { translateY: Math.sin(angle) * d + p * p * 220 },
        { rotateZ: `${p * (index % 2 ? 320 : -320)}deg` },
      ],
    };
  });
  const colors = ['#3979FF', '#9B6CFF', '#FF9A4D', '#2BD96A', tint];
  return (
    <Animated.View
      style={[
        { position: 'absolute', width: size, height: size * 2.2, borderRadius: 1.5, backgroundColor: colors[index % colors.length] },
        a,
      ]}
    />
  );
}

const s = StyleSheet.create({
  wrap: { zIndex: 50 },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderRadius: radius.lg,
    padding: 15,
    marginTop: 22,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    height: 50,
    borderRadius: radius.pill,
    marginTop: 22,
  },
  ghost: { alignItems: 'center', paddingVertical: 15, marginTop: 4 },
  glow: { position: 'absolute', width: 190, height: 190, borderRadius: 95, top: -22 },
  heroArt: { width: 132, height: 132 },
  progressRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  seg: { flex: 1, height: 4, borderRadius: 2 },
  pill: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 5 },
  opt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    minHeight: 58,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 15,
  },
  letter: { width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  shelf: {
    position: 'absolute',
    left: 0, right: 0, top: SHELF, bottom: -SHELF,
    borderRadius: radius.md,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  combo: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  review: { marginTop: 16 },
  reviewLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 9 },
  flame: { width: 36, height: 36 },
  level: { marginTop: 24 },
  levelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  // full width, scaled from the left edge — see the LevelBar note
  fill: { height: '100%', width: '100%', transformOrigin: 'left center', borderRadius: 4 },
});
