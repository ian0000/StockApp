import { Stack } from 'expo-router';

import { colors, typography } from '@/ui/theme/tokens';

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: colors.background },
        headerBackTitle: 'Atrás',
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: {
          fontSize: typography.size.body,
          fontWeight: typography.weight.semibold,
        },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="sale" options={{ title: 'Nueva venta' }} />
      <Stack.Screen name="purchase" options={{ title: 'Nueva compra' }} />
    </Stack>
  );
}
