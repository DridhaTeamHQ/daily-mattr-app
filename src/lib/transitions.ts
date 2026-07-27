import { FadeIn, FadeInDown, FadeOut, LinearTransition, ZoomIn } from 'react-native-reanimated';
import { duration, stagger, STAGGER_CAP } from '@/theme';

/* One motion vocabulary.

   Before this, `.springify().damping(30).stiffness(250).mass(0.9)` was pasted
   at roughly twenty call sites and the durations beside it had drifted across
   eleven different values. Nothing was wrong in isolation; together they read
   as slightly-off, because two things opening next to each other moved at
   different speeds for no reason a reader could perceive as intentional.

   Direction has one rule: **content rises, chrome fades.**

   Reanimated's FadeInDown starts at translateY 25 and animates to 0 — the name
   describes where it comes from, not where it goes — so it lifts into place.
   That is right for something arriving in a list you are reading downward.
   Chrome (overlays, panels, backdrops) does not travel: it is already where it
   belongs and only needs to appear, so it fades. Movement then means "this is
   new content", and stillness means "this was always here", which is a
   distinction worth being able to make without thinking about it.

   Everything here is a getter rather than a shared constant. A Reanimated
   builder is mutable — `.delay()` mutates and returns the same instance — so a
   module-level constant reused at two call sites would have the second one's
   delay applied to both. */

/** Content arriving in place: a card, a row, a section. Rises as it fades. */
export const enterContent = () =>
  FadeInDown.duration(duration.base).springify().damping(30).stiffness(250).mass(0.9);

/** The nth sibling in a list. Capped so a long list does not crawl in. */
export const enterItem = (index: number, gap: number = stagger.tight) =>
  FadeInDown.delay(Math.min(index, STAGGER_CAP) * gap)
    .duration(duration.base)
    .springify()
    .damping(30)
    .stiffness(250)
    .mass(0.9);

/** Chrome: overlays, panels, backdrops. Appears without travelling. */
export const enterChrome = () => FadeIn.duration(duration.quick);

/** A whole screen or sheet taking over. */
export const enterScreen = () => FadeIn.duration(duration.base);

/** Leaving. Always quicker than arriving — waiting on an exit feels broken. */
export const exitQuick = () => FadeOut.duration(duration.instant);
export const exitBase = () => FadeOut.duration(duration.quick);

/** A reward landing: the one place a bounce is earned. */
export const enterReward = () => ZoomIn.springify().damping(18).stiffness(260);

/** Rows reflowing — a deletion collapsing, a panel taking the space. */
export const reflow = () => LinearTransition.springify().damping(30).stiffness(260).mass(0.8);
