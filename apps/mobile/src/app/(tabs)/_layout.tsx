import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: 'Inicio' }} />
      <Tabs.Screen name="products" options={{ title: 'Productos' }} />
      <Tabs.Screen name="history" options={{ title: 'Historial' }} />
      <Tabs.Screen name="more" options={{ title: 'Más' }} />
    </Tabs>
  );
}
