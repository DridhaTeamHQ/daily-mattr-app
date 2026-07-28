import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Overline, Txt } from './ui';
import { useTheme } from '@/lib/theme';
import type { Band } from '@/lib/timeBands';

/* A divider, not a chapter heading.

   Deliberately not SectionHeader — that renders `Section` at 23pt bold, which
   is the weight "Top stories" and "Latest" carry. A time band sits *under*
   those, so it uses Overline (11pt, uppercase, ls 1.4) and leans on the
   hairline rule to read as structure rather than as a stray caption. */
function TimeBandHeaderBase({
  band,
  count,
  first,
}: {
  band: Band;
  count?: number;
  first?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View
      accessibilityRole="header"
      style={[s.row, { marginTop: first ? 14 : 26 }]}
    >
      <Overline color={c.inkFaint}>{band.label}</Overline>
      <View style={[s.rule, { backgroundColor: c.divider }]} />
      {count ? (
        <Txt size={11} weight="medium" color={c.inkFaint}>
          {count}
        </Txt>
      ) : null}
    </View>
  );
}

/* Memoised: a feed cell must not re-render because the list array was rebuilt.
   See the note on ArticleRow in components/cards.tsx. */
export const TimeBandHeader = React.memo(TimeBandHeaderBase);

const s = StyleSheet.create({
  row: {
    paddingHorizontal: 24,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  // fills the width the label doesn't use — this is what makes an 11pt label
  // read as a section break instead of a floating caption
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
});
