import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="sale/new" options={{ title: 'Nueva venta' }} />
      <Stack.Screen name="purchase/new" options={{ title: 'Nueva compra' }} />
      <Stack.Screen
        name="product/[id]"
        options={{ title: 'Detalle de producto' }}
      />
    </Stack>
  );
}
