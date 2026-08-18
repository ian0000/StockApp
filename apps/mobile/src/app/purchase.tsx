import { StyleSheet, Text } from 'react-native';

import { Screen } from '@/ui/components/Screen';
import { colors, typography } from '@/ui/theme/tokens';

export default function NewPurchaseScreen() {
  return (
    <Screen edges={['bottom']}>
      <Text style={styles.message}>
        El formulario de compra se implementará en una siguiente etapa.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  message: {
    color: colors.textSecondary,
    fontSize: typography.size.body,
    lineHeight: 24,
    maxWidth: 440,
  },
});
