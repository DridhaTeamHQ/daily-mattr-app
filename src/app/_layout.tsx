import { Stack, Redirect, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
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
import { registerPushToken, checkBreaking, addNotificationTapListener } from '@/lib/notifications';
import { flush } from '@/lib/telemetry';
import { ONBOARDED_KEY, setOnboardedFlag, subscribeOnboarded } from '@/lib/onboardingKey';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60_000, retry: 1, gcTime: 24 * 3600_000 },
  },
});

// Warm start: cached feed renders instantly on cold open.
const persister = createAsyncStoragePersister({ storage: AsyncStorage, throttleTime: 2000 });

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
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: 24 * 3600_000 }}>
        <StoreProvider>
          <ThemeProvider>
            <NavVisibilityProvider>
              <ThemedStack />
            </NavVisibilityProvider>
          </ThemeProvider>
        </StoreProvider>
      </PersistQueryClientProvider>
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

    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') checkBreaking().catch(() => {});
      else flush();
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
    </>
  );
}
