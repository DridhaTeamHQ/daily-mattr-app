import React from 'react';
// React Native primitives only — see the note below on why nothing of ours is
// imported here
import { View, Text, Pressable, ScrollView, StyleSheet, Platform } from 'react-native';
import { colors, radius } from '@/theme';

/* The last line of defence.

   Until now a render throw anywhere in the tree took the whole app down — a
   red box in development, a blank screen or a hard crash in a release build,
   with no way back short of killing the process. That is a poor trade for a
   news reader: one malformed row should cost the reader that screen, not the
   session.

   Deliberately a class component: `componentDidCatch` has no hooks equivalent,
   and this is the one place in the codebase that needs one.

   Also deliberately dependency-free — no useTheme, no Txt, no LIcon. This
   renders precisely when something below it has failed, and reaching for the
   design system here means a fault in the design system produces a boundary
   that itself throws. Raw View and Text, colours inlined from the tokens. */

type Props = { children: React.ReactNode; onReset?: () => void };
type State = { error: Error | null };

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // No crash reporter is wired up, so the console is the only sink there is.
    // Better than swallowing it: in Expo Go this reaches the Metro log.
    console.error('[AppErrorBoundary]', error?.message, info?.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={s.wrap}>
        <View style={s.mark}>
          <Text style={s.markText}>!</Text>
        </View>
        <Text style={s.title}>Something went wrong</Text>
        <Text style={s.body}>
          This screen hit an error. Your saved stories and reading history are safe.
        </Text>

        <Pressable onPress={this.reset} style={s.cta} accessibilityRole="button">
          <Text style={s.ctaText}>Try again</Text>
        </Pressable>

        {/* The message is the whole point of a boundary you can act on, but it
            is developer text — shown in development only, and scrollable
            because a stack does not fit on a phone. */}
        {__DEV__ ? (
          <ScrollView style={s.detail} contentContainerStyle={{ padding: 12 }}>
            <Text style={s.detailText}>
              {error.message}
              {'\n\n'}
              {error.stack}
            </Text>
          </ScrollView>
        ) : null}
      </View>
    );
  }
}

const s = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: colors.bg,
  },
  mark: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.brandSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: { fontSize: 26, fontWeight: '800', color: colors.brand },
  title: { fontSize: 18, fontWeight: '800', color: colors.ink, marginTop: 18 },
  body: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.inkSoft,
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 300,
  },
  cta: {
    marginTop: 22,
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  ctaText: { fontSize: 14.5, fontWeight: '700', color: '#fff' },
  detail: {
    marginTop: 26,
    maxHeight: 200,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(11,13,18,0.05)',
    borderRadius: radius.md,
  },
  detailText: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.inkSoft,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
});
