import React, { useEffect } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated from 'react-native-reanimated';
import { radius, topicOf } from '@/theme';
import { useTheme, glassCard } from '@/lib/theme';
import { Txt, Press, IconButton, BreakingBadge, LIcon } from '@/components/ui';
import { checkBreaking, markBreakingSeen } from '@/lib/notifications';
import { artFor } from '@/lib/topicArt';
import { timeAgo } from '@/lib/content';
import { enterItem, enterChrome } from '@/lib/transitions';

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { c, isDark } = useTheme();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['breaking'],
    queryFn: checkBreaking,
    staleTime: 60_000,
  });

  // opening the screen clears the unread badge
  useEffect(() => {
    markBreakingSeen().then(() => qc.invalidateQueries({ queryKey: ['breakingUnread'] }));
  }, [qc]);

  const items = data?.items ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <LinearGradient colors={c.canvas} style={StyleSheet.absoluteFill} />
      <View style={[s.bar, { paddingTop: insets.top + 8 }]}>
        <IconButton name="chevron-left" onPress={() => router.back()} />
        <Txt size={17.5} weight="extrabold" ls={-0.4}>
          Breaking
        </Txt>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 8, paddingBottom: 32 }}>
        {isLoading ? null : items.length === 0 ? (
          <Animated.View entering={enterChrome()} style={{ alignItems: 'center', marginTop: 120 }}>
            <LIcon name="bell-off" size={30} color={c.inkFaint} />
            <Txt size={15} weight="bold" style={{ marginTop: 14 }}>
              All quiet for now
            </Txt>
            <Txt size={13} weight="medium" color={c.inkSoft} style={{ marginTop: 5, textAlign: 'center', maxWidth: 250 }}>
              When several outlets converge on one story, it lands here.
            </Txt>
          </Animated.View>
        ) : (
          items.map((b, i) => (
            <Animated.View key={b.id} entering={enterItem(i)}>
              <Press onPress={() => router.push(`/article/${b.id}`)} style={[s.row, glassCard(c, isDark)]}>
                <View style={{ flex: 1, paddingRight: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <BreakingBadge />
                    <Txt size={11.5} weight="medium" color={c.inkFaint}>
                      {b.sourceCount} outlets · {timeAgo(b.detectedAt)}
                    </Txt>
                  </View>
                  <Txt size={15.5} lh={21} weight="bold" numberOfLines={3} style={{ marginTop: 9 }}>
                    {b.title}
                  </Txt>
                </View>
                <Image
                  source={b.imageUrl ? { uri: b.imageUrl } : artFor(b.topic)}
                  style={s.thumb}
                  contentFit="cover"
                  transition={200}
                />
              </Press>
            </Animated.View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    padding: 14,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  thumb: { width: 76, height: 76, borderRadius: 16 },
});
