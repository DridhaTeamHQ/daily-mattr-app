import { Stack, Redirect, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { persister, shouldPersist } from '@/lib/persist';
import { useFonts } from 'expo-font';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { StoreProvider } from '@/lib/store';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { NavVisibilityProvider } from '@/lib/navVisibility';
import { CelebrationHost } from '@/components/celebration';
import { ensureEdition, hydrateEdition } from '@/lib/edition';
import { registerPushToken, checkBreaking, addNotificationTapListener } from '@/lib/notifications';
import { flush } from '@/lib/telemetry';
import { ONBOARDED_KEY, setOnboardedFlag, subscribeOnboarded } from '@/lib/onboardingKey';
import { startNetworkWatch } from '@/lib/network';
import { AppErrorBoundary } from '@/components/errorBoundary';

SplashScreen.preventAutoHideAsync();

/* react-query's connectivity default is browser-shaped and never fires in
   React Native, so this has to run before the first query. Started at module
   scope rather than in an effect: a query mounted during the very first render
   would otherwise fetch under the stale assumption that it is online. */
startNetworkWatch();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60_000, retry: 1, gcTime: 24 * 3600_000 },
  },
});

export default function RootLayout() {
  const [loaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Outside every provider on purpose. A throw inside StoreProvider's
          hydration or ThemeProvider's first render is exactly the failure this
          catches, and a boundary nested under them could not. `onReset` clears
          the query cache so a retry is not handed back the same poisoned
          data that caused the throw. */}
      <AppErrorBoundary onReset={() => queryClient.clear()}>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister,
            maxAge: 24 * 3600_000,
            // only the queries behind the first screen; 'article' (raw_content)
            // and 'morePages' (unbounded infinite query) are what overflowed
            dehydrateOptions: { shouldDehydrateQuery: shouldPersist },
          }}
        >
          <StoreProvider>
            <ThemeProvider>
              <NavVisibilityProvider>
                <ThemedStack />
              </NavVisibilityProvider>
            </ThemeProvider>
          </StoreProvider>
        </PersistQueryClientProvider>
      </AppErrorBoundary>
    </GestureHandlerRootView>
  );
}

function ThemedStack() {
  const { c, isDark } = useTheme();
  const router = useRouter();
  const segments = useSegments();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const bootstrapped = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDED_KEY).then((v) => {
      const done = v === '1';
      setOnboardedFlag(done);
      setOnboarded(done);
    });
    // finishing onboarding flips the flag → gate opens immediately
    return subscribeOnboarded((v) => setOnboarded(v));
  }, []);

  // One-time bootstrap after onboarding: push registration + breaking poll.
  useEffect(() => {
    if (onboarded !== true || bootstrapped.current) return;
    bootstrapped.current = true;
    registerPushToken();
    checkBreaking().catch(() => {});

    // Never let this reject. An unhandled rejection during boot surfaces as a
    // red box in a dev build and takes the whole app down rather than just
    // leaving the edition unbuilt — and the edition is not load-bearing for
    // anything else on screen.
    hydrateEdition()
      .then(() => ensureEdition())
      .catch(() => {});

    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        checkBreaking().catch(() => {});
        // The critical rollover trigger: a phone left open overnight would
        // otherwise still be showing yesterday's edition. ensureEdition only
        // rebuilds when the local day has moved forward.
        ensureEdition().catch(() => {});
      } else flush();
    });

    // notification tap → deep link to the article
    const tapSub = addNotificationTapListener((id) => router.push(`/article/${id}`));

    return () => {
      sub.remove();
      tapSub.remove();
    };
  }, [onboarded, router]);

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {/* Declarative gate — safe during initial mount, unlike router.replace() */}
      {onboarded === false && segments[0] !== 'onboarding' ? <Redirect href="/onboarding" /> : null}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.bg },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        <Stack.Screen name="article/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="search" options={{ animation: 'fade_from_bottom' }} />
        <Stack.Screen name="notifications" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
      </Stack>
      {/* after <Stack> so it paints above the tab bar, which is absolutely
          positioned inside the tabs screen rather than in a portal */}
      <CelebrationHost />
    </>
  );
}
