import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Txt, Press, LIcon } from '@/components/ui';
import { useTheme } from '@/lib/theme';
import { useAccount } from '@/lib/account';
import { radius } from '@/theme';
import { tick, soft } from '@/lib/haptics';
import { enterContent, enterChrome, enterItem } from '@/lib/transitions';

/* Signing in, offered rather than demanded.
 *
 * The feed is behind nothing. This screen is reached from Profile, and every
 * path through it has a visible way out — a news app that asks who you are
 * before it shows you a headline has misunderstood what it is.
 *
 * Two steps, email then a six-digit code. Deliberately not a magic link: a link
 * has to come back through a deep link, which behaves differently in Expo Go,
 * in a dev build and in the store build. A code behaves the same everywhere and
 * never leaves the app.
 */

const CODE_LENGTH = 6;

export default function SignIn() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { c, isDark } = useTheme();
  const { requestCode, verifyCode, email: signedInAs } = useAccount();

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeRef = useRef<TextInput>(null);

  const emailLooksReal = useMemo(() => /^\S+@\S+\.\S+$/.test(email.trim()), [email]);

  const send = useCallback(async () => {
    if (!emailLooksReal || busy) return;
    setBusy(true);
    setError(null);
    try {
      await requestCode(email);
      soft();
      setStep('code');
      // A moment for the step to mount before it is asked to take focus.
      setTimeout(() => codeRef.current?.focus(), 120);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the code.');
    } finally {
      setBusy(false);
    }
  }, [email, emailLooksReal, busy, requestCode]);

  const verify = useCallback(
    async (value: string) => {
      if (value.length !== CODE_LENGTH || busy) return;
      setBusy(true);
      setError(null);
      try {
        await verifyCode(email, value);
        soft();
        router.back();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That code did not work.');
        setCode('');
      } finally {
        setBusy(false);
      }
    },
    [email, busy, verifyCode, router],
  );

  const field = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(11,13,18,0.045)';
  const line = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(11,13,18,0.08)';

  return (
    <View style={[s.root, { backgroundColor: c.bg }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[
            s.scroll,
            { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 28 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Always a way out, on every step. */}
          <Animated.View entering={enterChrome()} style={s.topRow}>
            <Press
              haptic={false}
              onPress={() => {
                tick();
                router.back();
              }}
              scaleTo={0.9}
              style={[s.close, { backgroundColor: field }]}
            >
              <LIcon name="x" size={16} color={c.ink} strokeWidth={2.4} />
            </Press>
          </Animated.View>

          <Animated.View entering={enterContent()} style={s.head}>
            <LinearGradient
              colors={[c.brandLight, c.brand]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.mark}
            >
              <Txt size={26} weight="extrabold" color="#fff" display>
                M
              </Txt>
            </LinearGradient>

            <Txt size={26} weight="extrabold" ls={-0.6} display style={{ marginTop: 20 }}>
              {step === 'email' ? 'Keep your reading' : 'Check your email'}
            </Txt>
            <Txt
              size={14.5}
              lh={21}
              color={c.inkSoft}
              style={{ marginTop: 8, textAlign: 'center' }}
            >
              {step === 'email'
                ? 'Your streak, saved stories and interests stay on this phone. Sign in and they follow you to the next one.'
                : `We sent a ${CODE_LENGTH}-digit code to ${email.trim()}.`}
            </Txt>
          </Animated.View>

          {step === 'email' ? (
            <Animated.View entering={enterItem(0)} style={s.form}>
              <TextInput
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  setError(null);
                }}
                placeholder="you@example.com"
                placeholderTextColor={c.inkFaint}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                returnKeyType="go"
                onSubmitEditing={send}
                editable={!busy}
                style={[s.input, { backgroundColor: field, borderColor: line, color: c.ink }]}
              />

              <Press
                haptic={false}
                onPress={send}
                scaleTo={0.98}
                style={[
                  s.cta,
                  { backgroundColor: emailLooksReal && !busy ? c.brand : field },
                ]}
              >
                {busy ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Txt
                    size={15}
                    weight="bold"
                    color={emailLooksReal ? '#fff' : c.inkFaint}
                  >
                    Email me a code
                  </Txt>
                )}
              </Press>
            </Animated.View>
          ) : (
            <Animated.View entering={enterItem(0)} style={s.form}>
              <TextInput
                ref={codeRef}
                value={code}
                onChangeText={(v) => {
                  const digits = v.replace(/\D/g, '').slice(0, CODE_LENGTH);
                  setCode(digits);
                  setError(null);
                  // Submits itself on the last digit — there is nothing else
                  // this screen could want at that point.
                  if (digits.length === CODE_LENGTH) verify(digits);
                }}
                placeholder="••••••"
                placeholderTextColor={c.inkFaint}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                editable={!busy}
                style={[
                  s.input,
                  s.code,
                  { backgroundColor: field, borderColor: line, color: c.ink },
                ]}
              />

              {busy ? (
                <View style={s.cta}>
                  <ActivityIndicator size="small" color={c.brand} />
                </View>
              ) : (
                <Press
                  haptic={false}
                  onPress={() => {
                    tick();
                    setStep('email');
                    setCode('');
                    setError(null);
                  }}
                  scaleTo={0.98}
                  style={s.ghost}
                >
                  <Txt size={13.5} weight="bold" color={c.inkSoft}>
                    Use a different email
                  </Txt>
                </Press>
              )}
            </Animated.View>
          )}

          {error ? (
            <Animated.View entering={enterChrome()} style={s.error}>
              <LIcon name="alert-circle" size={13} color={c.danger} strokeWidth={2.4} />
              <Txt size={12.5} weight="semibold" color={c.danger} style={{ flex: 1 }}>
                {error}
              </Txt>
            </Animated.View>
          ) : null}

          <View style={{ flex: 1 }} />

          <Animated.View entering={enterItem(1)} style={s.footer}>
            <Press
              haptic={false}
              onPress={() => {
                tick();
                router.back();
              }}
              scaleTo={0.97}
              style={s.notNow}
            >
              <Txt size={14} weight="bold" color={c.inkSoft}>
                {signedInAs ? 'Done' : 'Not now'}
              </Txt>
            </Press>
            <Txt
              size={11.5}
              lh={17}
              color={c.inkFaint}
              style={{ textAlign: 'center', marginTop: 12 }}
            >
              No password to remember. We only use your email to keep your
              reading in one place.
            </Txt>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 24 },
  topRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  close: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  head: { alignItems: 'center', marginTop: 28 },
  mark: {
    width: 62,
    height: 62,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 10px 28px rgba(57,121,255,0.42)',
  },
  form: { marginTop: 32, gap: 12 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 15.5,
    fontFamily: 'Inter_500Medium',
  },
  code: {
    textAlign: 'center',
    letterSpacing: 10,
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
  },
  cta: {
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghost: { height: 52, alignItems: 'center', justifyContent: 'center' },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 14,
    paddingHorizontal: 2,
  },
  footer: { marginTop: 32, alignItems: 'center' },
  notNow: { paddingVertical: 12, paddingHorizontal: 24 },
});
