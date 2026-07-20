import { Tabs } from 'expo-router';
import { GlassNavbar } from '@/components/navbar';

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <GlassNavbar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="categories" options={{ title: 'Categories' }} />
      <Tabs.Screen name="reader" options={{ title: 'Articles' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
