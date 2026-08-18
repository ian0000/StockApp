import type { PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../theme/tokens';

type SectionProps = PropsWithChildren<{
  readonly title: string;
  readonly titleVariant?: 'heading' | 'eyebrow';
}>;

export function Section({
  children,
  title,
  titleVariant = 'heading',
}: SectionProps) {
  return (
    <View style={styles.section}>
      <Text
        accessibilityRole="header"
        style={
          titleVariant === 'eyebrow' ? styles.eyebrowTitle : styles.headingTitle
        }
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrowTitle: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.bold,
    letterSpacing: 1.1,
  },
  headingTitle: {
    color: colors.text,
    fontSize: typography.size.section,
    fontWeight: typography.weight.bold,
  },
  section: {
    gap: spacing.md,
  },
});
