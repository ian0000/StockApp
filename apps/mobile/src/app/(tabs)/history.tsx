import { StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/ui/components/EmptyState';
import { Screen } from '@/ui/components/Screen';
import { colors, spacing, typography } from '@/ui/theme/tokens';

export default function HistoryScreen() {
  return (
    <Screen>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          Historial
        </Text>
      </View>
      <EmptyState message="Tus movimientos aparecerán aquí." />
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
