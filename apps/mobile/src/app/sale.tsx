import { StyleSheet, Text } from 'react-native';

import { Screen } from '@/ui/components/Screen';
import { colors, typography } from '@/ui/theme/tokens';

export default function NewSaleScreen() {
  return (
    <Screen edges={['bottom']}>
      <Text style={styles.message}>
        La búsqueda y el carrito se implementarán en la siguiente etapa.
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
