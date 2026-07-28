import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { topicOf, BLUR_MAX } from '@/theme';
import { useTheme } from '@/lib/theme';
import { PixCard } from './pixCard';
import { artFor } from '@/lib/topicArt';
import type { Article } from '@/lib/content';

/* The Pix slot's page.

   The card used to sit on the raw canvas — a dark, deliberately composed
   object stranded in the middle of a blank white sheet, with the format's
   whole visual argument undercut by the vacuum around it. The page now takes
   its palette from the same photograph the card is built on: the image again,
   heavily blurred, under a veil dark enough that the card reads as an object
   lit from behind rather than a hole cut into the screen.

   Deliberately dark in BOTH themes. The card itself is a dark surface, so a
   light page would have to fight it, and the tonal jump on the way in is what
   tells you the deck has changed format — the same job an interstitial does. */
function PixPageBase({
  a,
  height,
  commentCount,
}: {
  a: Article;
  height: number;
  commentCount: number;
}) {
  const { isDark } = useTheme();
  const { width: winW } = useWindowDimensions();
  const t = topicOf(a.topic);
  const src = a.imageUrl ? { uri: a.imageUrl } : artFor(a.topic);
  // the card fills the page now; the deck's own chrome is the only inset

  return (
    <View style={{ height, overflow: 'hidden', backgroundColor: '#080B12' }}>
      {/* 28, not 90 — see the note on ReaderCard's ambient layer; Android's
          blur degrades sharply past ~25 and this one sits under a veil anyway */}
      <Image
        source={src}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        blurRadius={BLUR_MAX}
        recyclingKey={a.id + '-pixbg'}
        transition={320}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: isDark ? 'rgba(6,9,16,0.76)' : 'rgba(7,10,18,0.62)' },
        ]}
      />
      <LinearGradient colors={[t.wash, 'rgba(0,0,0,0)']} style={StyleSheet.absoluteFill} />

      <View style={st.pixPage}>
        <PixCard a={a} index={0} variant="page" height={height} commentCount={commentCount} />
      </View>

      {/* No format label. Full bleed, a photograph filling two thirds of the
          screen and page dots — the format announces itself. The caption was a
          fourth thing competing for the top strip with the topic pill, the
          timestamp and the dial button, which is the clutter. */}
    </View>
  );
}

/* Memoised: the deck keeps a window of pages mounted either side of the
   visible one. Without this, a state change on the screen re-renders all of
   them — and each holds a player or a full-bleed image. */
export const PixPage = React.memo(PixPageBase);

const st = StyleSheet.create({
  pixPage: { flex: 1 },
});
