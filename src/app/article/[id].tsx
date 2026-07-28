import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import Animated from 'react-native-reanimated';
import { useTheme } from '@/lib/theme';
import { Txt, Press, LIcon, LogoLoader } from '@/components/ui';
import { ReaderCardMemo } from '@/components/readerCard';
import { PixPage } from '@/components/pixPage';
import { ReelCard } from '@/components/reelCard';
import { setActiveCard } from '@/lib/activeCard';
import { fetchArticle } from '@/lib/queries';
import { fetchCommentCounts } from '@/lib/comments';
import { useStore } from '@/lib/store';
import { track, createDwellTimer } from '@/lib/telemetry';
import { noteRead } from '@/lib/progress';
import { enterScreen } from '@/lib/transitions';

/* One story, as the card it was published as.
 *
 * This was a long-read page: parallax hero, an AI summary panel, then the body
 * set with a drop cap and a pull quote. There is no long read to set. A pipeline
 * story carries a summary, and a CMS article is capped at 300 characters by the
 * editor — so the page rendered the same paragraph twice, once in the summary
 * panel and again as the "body" with a drop cap on it.
 *
 * A tapped story now opens as what it actually is, given the whole screen: a
 * picture story opens as one, a clip plays, an article reads. The reading
 * modes, listen, comments and the image peek all come with it, because they
 * live on the cards rather than on this page.
 */
export default function ArticleScreen() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const { recordRead } = useStore();
  const readCounted = useRef(false);

  const { data: a, isLoading } = useQuery({
    queryKey: ['article', id],
    queryFn: () => fetchArticle(id!),
    enabled: !!id,
  });

  const counts = useQuery({
    queryKey: ['commentCounts', id],
    queryFn: () => fetchCommentCounts([id!]),
    enabled: !!id,
    staleTime: 60_000,
  });

  /* Dwell, history and the daily streak.

     The deck records these from its viewability callback; a pushed route has no
     equivalent, so it owns them for as long as it is mounted. */
  useEffect(() => {
    if (!a) return;
    recordRead(a.id, a.topic);
    // this is the only card on screen, so a clip on it is the one that plays
    setActiveCard(a.id);
    const timer = createDwellTimer();
    return () => {
      const ms = timer.stop();
      if (ms > 500) {
        track({ article_id: a.id, event_type: 'dwell', dwell_ms: ms, words: a.wordCount, topic: a.topic });
        // the same qualifying dwell the deck uses, so a story read here counts
        // toward the streak exactly as one read by swiping does
        if (ms >= 3000 && !readCounted.current) {
          readCounted.current = true;
          void noteRead(a.id, a.topic, ms);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a?.id]);

  if (isLoading) {
    return (
      <View style={[s.centre, { backgroundColor: c.bg }]}>
        <LogoLoader />
      </View>
    );
  }

  if (!a) {
    return (
      <View style={[s.centre, { backgroundColor: c.bg, padding: 32 }]}>
        <LIcon name="file-question" size={30} color={c.inkFaint} />
        <Txt size={15} weight="bold" style={{ marginTop: 14 }}>
          Story not found
        </Txt>
        <Txt size={13} weight="medium" color={c.inkSoft} style={{ marginTop: 6, textAlign: 'center' }}>
          It may have been removed since you opened it.
        </Txt>
        <Press
          onPress={() => router.back()}
          style={{ marginTop: 18, backgroundColor: c.brand, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 11 }}
        >
          <Txt size={13.5} weight="semibold" color="#fff">
            Go back
          </Txt>
        </Press>
      </View>
    );
  }

  const commentCount = counts.data?.[a.id] ?? 0;

  return (
    <Animated.View entering={enterScreen()} style={{ flex: 1, backgroundColor: c.bg }}>
      {a.format === 'pix' ? (
        <PixPage a={a} height={winH} commentCount={commentCount} />
      ) : a.format === 'qix' ? (
        <ReelCard a={a} height={winH} topInset={insets.top} commentCount={commentCount} />
      ) : (
        <ReaderCardMemo a={a} height={winH} topInset={insets.top} commentCount={commentCount} />
      )}

      {/* The deck is reached by swiping and needs no back affordance; a pushed
          route does. It sits opposite the card's own topic line rather than
          over it. */}
      <Press
        onPress={() => router.back()}
        scaleTo={0.9}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={[s.back, { top: insets.top + 8 }]}
      >
        <LIcon name="chevron-left" size={20} color="#fff" strokeWidth={2.4} />
      </Press>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  back: {
    position: 'absolute',
    right: 18,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11,13,18,0.42)',
  },
});
