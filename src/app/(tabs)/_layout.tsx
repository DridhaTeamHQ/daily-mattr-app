import { Tabs } from 'expo-router';
import { GlassNavbar } from '@/components/navbar';

export default function TabLayout() {
  return (
    /* freezeOnBlur is doing a lot of work here. Without it, Home stays mounted
       AND keeps re-rendering while you're swiping cards in the reader — and
       Home holds ~60 expo-image instances and ~130 animated nodes once a few
       "More stories" pages are in. Every render Home does behind the reader is
       pure waste competing for the same frame budget. */
    <Tabs
      tabBar={(props) => <GlassNavbar {...props} />}
      screenOptions={{ headerShown: false, freezeOnBlur: true }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="reader" options={{ title: 'Articles' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
