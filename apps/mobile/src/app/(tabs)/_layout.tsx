import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { colors, spacing, typography } from '@/ui/theme/tokens';

interface TabMarkerProps {
  readonly color: string;
  readonly focused: boolean;
}

function TabMarker({ color, focused }: TabMarkerProps) {
  return (
    <View
      style={[
        styles.marker,
        { backgroundColor: color },
        focused && styles.markerFocused,
      ]}
    />
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarIcon: ({ color, focused }) => (
          <TabMarker color={color} focused={focused} />
        ),
        tabBarItemStyle: {
          minHeight: 48,
          paddingVertical: spacing.xs,
        },
        tabBarLabelStyle: {
          fontSize: typography.size.caption,
          fontWeight: typography.weight.semibold,
        },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 68,
          paddingBottom: spacing.xs,
          paddingTop: spacing.xs,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Inicio' }} />
      <Tabs.Screen name="products" options={{ title: 'Productos' }} />
      <Tabs.Screen name="history" options={{ title: 'Historial' }} />
      <Tabs.Screen name="more" options={{ title: 'Más' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  marker: {
    borderRadius: 4,
    height: 7,
    opacity: 0.55,
    width: 7,
  },
  markerFocused: {
    opacity: 1,
    width: 18,
  },
});
