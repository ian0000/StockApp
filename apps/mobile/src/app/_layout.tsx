import { Stack } from 'expo-router';

import { colors, typography } from '@/ui/theme/tokens';
import { AppRuntimeProvider } from '@/ui/runtime/app-runtime';

export default function RootLayout() {
  return (
    <AppRuntimeProvider>
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
    </AppRuntimeProvider>
  );
}
