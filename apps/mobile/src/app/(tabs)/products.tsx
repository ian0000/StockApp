import { StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/ui/components/EmptyState';
import { Screen } from '@/ui/components/Screen';
import { colors, spacing, typography } from '@/ui/theme/tokens';

export default function ProductsScreen() {
  return (
    <Screen>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          Productos
        </Text>
      </View>
      <EmptyState message="Aún no tienes productos registrados." />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingBottom: spacing.sm,
    paddingTop: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: typography.size.display,
    fontWeight: typography.weight.bold,
    letterSpacing: -0.8,
  },
});
