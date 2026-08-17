import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PlaceholderScreen } from '@/components/PlaceholderScreen';

export default function HomeScreen() {
  return (
    <PlaceholderScreen title="Inicio">
      <View style={styles.actions}>
        <Link href="/sale/new" asChild>
          <Pressable accessibilityRole="button" style={styles.action}>
            <Text style={styles.actionText}>+ Venta</Text>
          </Pressable>
        </Link>

        <Link href="/purchase/new" asChild>
          <Pressable accessibilityRole="button" style={styles.action}>
            <Text style={styles.actionText}>+ Compra</Text>
          </Pressable>
        </Link>
      </View>

      <Link href="/product/demo-product" style={styles.detailLink}>
        Abrir detalle de producto demo
      </Link>
    </PlaceholderScreen>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    backgroundColor: '#262626',
    borderRadius: 8,
    minWidth: 140,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  actionText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  actions: {
    gap: 12,
    width: '100%',
  },
  detailLink: {
    fontSize: 16,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});
