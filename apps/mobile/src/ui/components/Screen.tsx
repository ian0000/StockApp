import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  SafeAreaView,
  type SafeAreaViewProps,
} from 'react-native-safe-area-context';

import { colors, spacing } from '../theme/tokens';

type ScreenProps = PropsWithChildren<{
  readonly edges?: SafeAreaViewProps['edges'];
}>;

export function Screen({ children, edges = ['top'] }: ScreenProps) {
  return (
    <SafeAreaView edges={edges} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    alignSelf: 'center',
    gap: spacing.xl,
    maxWidth: 720,
    width: '100%',
  },
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: spacing.xxxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
});
