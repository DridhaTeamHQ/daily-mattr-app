import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { topicOf, BLUR_MAX } from '@/theme';
import { useTheme } from '@/lib/theme';
import { Txt, LIcon } from './ui';
import { PixCard } from './pixCard';
import { NAVBAR_CLEARANCE } from './navbar';
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
export function PixPage({
  a,
  height,
  topInset,
  commentCount,
}: {
  a: Article;
  height: number;
  topInset: number;
  commentCount: number;
}) {
  const { isDark } = useTheme();
  const { width: winW } = useWindowDimensions();
  const t = topicOf(a.topic);
  const src = a.imageUrl ? { uri: a.imageUrl } : artFor(a.topic);
  // leaves room for the eyebrow above and the publisher line below without
  // ever letting the card outgrow its own 4:5-ish proportions
  const cardH = Math.round(Math.min(winW * 1.24, Math.max(height * 0.62, 360)));

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

      <View style={[st.pixPage, { paddingTop: topInset, paddingBottom: NAVBAR_CLEARANCE }]}>
        <View style={st.eyebrow} pointerEvents="none">
          <LIcon name="images" size={13} color="rgba(255,255,255,0.7)" strokeWidth={2.2} />
          <Txt size={10.5} weight="bold" color="rgba(255,255,255,0.7)" ls={1.6}>
            PICTURE STORY
          </Txt>
        </View>
        <PixCard a={a} index={0} variant="page" height={cardH} commentCount={commentCount} />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  pixPage: { flex: 1, justifyContent: 'center' },
  eyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginBottom: 18,
  },
});
