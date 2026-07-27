/* Celebration artwork, in the same glass language as the topic art.

   Mirrors lib/topicArt.ts deliberately: a static require map, because Metro
   resolves requires statically and a dynamic path simply would not bundle.

   These are alpha cutouts on no background, unlike assets/images/topics/*.webp
   which bake in their gradient. That is the difference that lets them sit on
   the light canvas and the dark one — the app paints the backdrop, the asset
   only contributes the object. */
export const celebrationArt = {
  'caught-up': require('../../assets/celebration/caught-up.webp'),
  'streak-flame': require('../../assets/celebration/streak-flame.webp'),
  'quiz-medal': require('../../assets/celebration/quiz-medal.webp'),
} as const;

export type CelebrationArtKind = keyof typeof celebrationArt;

export function artFor(kind: CelebrationArtKind): number {
  return celebrationArt[kind];
}
