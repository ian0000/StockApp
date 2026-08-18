import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/ui/components/EmptyState';
import { Screen } from '@/ui/components/Screen';
import { Section } from '@/ui/components/Section';
import { colors, radii, spacing, typography } from '@/ui/theme/tokens';

const INITIAL_SUMMARY = Object.freeze({
  estimatedProfit: '$0.00',
  sales: '$0.00',
  units: '0',
});

interface MetricProps {
  readonly label: string;
  readonly value: string;
}

function Metric({ label, value }: MetricProps) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();

  return (
    <Screen>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          Mi Negocio
        </Text>
      </View>

      <Section title="Hoy">
        <View style={styles.summaryCard}>
          <Metric label="Ventas" value={INITIAL_SUMMARY.sales} />
          <View style={styles.metricDivider} />
          <Metric
            label="Ganancia estimada"
            value={INITIAL_SUMMARY.estimatedProfit}
          />
          <View style={styles.metricDivider} />
          <Metric label="Unidades" value={INITIAL_SUMMARY.units} />
        </View>
      </Section>

      <View style={styles.actions}>
        <Pressable
          accessibilityHint="Abre la pantalla de nueva venta"
          accessibilityLabel="Nueva venta"
          accessibilityRole="button"
          onPress={() => router.push('/sale')}
          style={({ pressed }) => [
            styles.action,
            styles.primaryAction,
            pressed && styles.primaryActionPressed,
          ]}
        >
          <Text style={styles.primaryActionText}>+ Venta</Text>
        </Pressable>

        <Pressable
          accessibilityHint="Abre la pantalla de nueva compra"
          accessibilityLabel="Nueva compra"
          accessibilityRole="button"
          onPress={() => router.push('/purchase')}
          style={({ pressed }) => [
            styles.action,
            styles.secondaryAction,
            pressed && styles.secondaryActionPressed,
          ]}
        >
          <Text style={styles.secondaryActionText}>+ Compra</Text>
        </Pressable>
      </View>

      <Section title="Stock bajo">
        <EmptyState
          message="Todo en orden por ahora"
          supportingText="Los productos con poco stock aparecerán aquí."
        />
      </Section>

      <Section title="RECIENTES" titleVariant="eyebrow">
        <EmptyState
          message="Aún no hay movimientos"
          supportingText="Tus ventas y compras recientes aparecerán aquí."
        />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    borderRadius: radii.md,
    flex: 1,
    justifyContent: 'center',
    minHeight: 56,
    minWidth: 136,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    width: '100%',
  },
  header: {
    paddingBottom: spacing.xs,
    paddingTop: spacing.sm,
  },
  metric: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 72,
  },
  metricDivider: {
    alignSelf: 'stretch',
    backgroundColor: colors.border,
    width: 1,
  },
  metricLabel: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
    lineHeight: 18,
  },
  metricValue: {
    color: colors.text,
    fontSize: typography.size.metric,
    fontWeight: typography.weight.bold,
    letterSpacing: -0.4,
  },
  primaryAction: {
    backgroundColor: colors.accent,
  },
  primaryActionPressed: {
    backgroundColor: colors.accentPressed,
  },
  primaryActionText: {
    color: colors.onAccent,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  secondaryAction: {
    backgroundColor: colors.surface,
    borderColor: colors.accent,
    borderWidth: 1,
  },
  secondaryActionPressed: {
    backgroundColor: colors.accentSoft,
  },
  secondaryActionText: {
    color: colors.accent,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: typography.size.display,
    fontWeight: typography.weight.bold,
    letterSpacing: -0.8,
  },
});
