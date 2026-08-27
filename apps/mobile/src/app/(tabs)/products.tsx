import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { EmptyState } from '@/ui/components/EmptyState';
import { Screen } from '@/ui/components/Screen';
import { createProductDetailsRoute } from '@/ui/products/product-details-presentation';
import {
  createProductListRequest,
  createProductListRowPresentation,
  getProductsContentKind,
  type ProductsState,
} from '@/ui/products/product-list-presentation';
import { useAppRuntime } from '@/ui/runtime/app-runtime-context';
import { colors, radii, spacing, typography } from '@/ui/theme/tokens';

export default function ProductsScreen() {
  const router = useRouter();
  const { inventory, persistence, productServices } = useAppRuntime();
  const requestIdRef = useRef(0);
  const [state, setState] = useState<ProductsState>({ status: 'loading' });

  const loadProducts = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (productServices === null) {
      setState({ status: 'ready', products: [] });
      return;
    }

    setState({ status: 'loading' });

    try {
      const products = await productServices.listProducts.execute(
        createProductListRequest(inventory.id),
      );

      if (requestIdRef.current === requestId) {
        setState({ status: 'ready', products });
      }
    } catch {
      if (requestIdRef.current === requestId) {
        setState({ status: 'error' });
      }
    }
  }, [inventory.id, productServices]);

  useFocusEffect(
    useCallback(() => {
      void loadProducts();

      return () => {
        requestIdRef.current += 1;
      };
    }, [loadProducts]),
  );

  const contentKind = getProductsContentKind(state);

  return (
    <Screen>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          Productos
        </Text>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel="Ajustar stock"
            accessibilityRole="button"
            onPress={() => router.push('/adjustment')}
            style={({ pressed }) => [
              styles.adjustAction,
              pressed && styles.adjustActionPressed,
            ]}
          >
            <Text style={styles.adjustActionText}>Ajustar stock</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Crear producto"
            accessibilityRole="button"
            onPress={() => router.push('/product/new')}
            style={({ pressed }) => [
              styles.addAction,
              pressed && styles.addActionPressed,
            ]}
          >
            <Text style={styles.addActionText}>+ Producto</Text>
          </Pressable>
        </View>
      </View>

      {persistence === 'web-preview' ? (
        <Text style={styles.previewText}>
          Vista previa web · La creación y persistencia están disponibles en iOS
          y Android.
        </Text>
      ) : null}

      {contentKind === 'loading' ? (
        <View style={styles.status}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.statusText}>Cargando productos…</Text>
        </View>
      ) : null}

      {contentKind === 'error' ? (
        <View style={styles.status}>
          <Text accessibilityLiveRegion="assertive" style={styles.errorText}>
            No pudimos cargar tus productos.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void loadProducts()}
            style={({ pressed }) => [
              styles.retryAction,
              pressed && styles.retryActionPressed,
            ]}
          >
            <Text style={styles.retryActionText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      {contentKind === 'empty' ? (
        <EmptyState
          message="Aún no tienes productos."
          supportingText="Crea el primero para comenzar a controlar tu stock."
        />
      ) : null}

      {state.status === 'ready' && state.products.length > 0 ? (
        <View accessibilityRole="list" style={styles.list}>
          {state.products.map((summary) => {
            const row = createProductListRowPresentation(
              summary,
              inventory.currency,
            );

            return (
              <Pressable
                accessibilityHint="Abre la información actual del producto"
                accessibilityLabel={`Abrir detalle de ${row.name}`}
                accessibilityRole="button"
                key={summary.product.id}
                onPress={() =>
                  router.push(createProductDetailsRoute(summary.product.id))
                }
                style={({ pressed }) => [
                  styles.productRow,
                  pressed && styles.productRowPressed,
                ]}
              >
                <View style={styles.productCopy}>
                  <Text style={styles.productName}>{row.name}</Text>
                  {row.variant ? (
                    <Text style={styles.productVariant}>{row.variant}</Text>
                  ) : null}
                  <Text
                    style={[
                      styles.stockText,
                      row.stockStatus === 'negative' &&
                        styles.negativeStockText,
                    ]}
                  >
                    {row.stockLabel}
                  </Text>
                </View>
                <View style={styles.rowTrailing}>
                  <Text style={styles.priceText}>{row.priceLabel}</Text>
                  <Text accessibilityElementsHidden style={styles.disclosure}>
                    ›
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  adjustAction: {
    alignItems: 'center',
    borderColor: colors.accent,
    borderRadius: radii.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  adjustActionPressed: {
    backgroundColor: colors.accentSoft,
  },
  adjustActionText: {
    color: colors.accent,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.bold,
  },
  addAction: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  addActionPressed: {
    backgroundColor: colors.accentPressed,
  },
  addActionText: {
    color: colors.onAccent,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  errorText: {
    color: colors.danger,
    fontSize: typography.size.body,
    textAlign: 'center',
  },
  header: {
    alignItems: 'flex-start',
    gap: spacing.md,
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
    paddingTop: spacing.sm,
  },
  headerActions: {
    alignItems: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  list: {
    gap: spacing.md,
  },
  negativeStockText: {
    color: colors.danger,
  },
  previewText: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
    lineHeight: 18,
  },
  priceText: {
    color: colors.text,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  productCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  productName: {
    color: colors.text,
    fontSize: typography.size.section,
    fontWeight: typography.weight.semibold,
  },
  productRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 96,
    padding: spacing.lg,
  },
  productRowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  productVariant: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
  },
  retryAction: {
    borderColor: colors.accent,
    borderRadius: radii.md,
    borderWidth: 1,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  retryActionPressed: {
    backgroundColor: colors.accentSoft,
  },
  retryActionText: {
    color: colors.accent,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  rowTrailing: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  disclosure: {
    color: colors.textSecondary,
    fontSize: typography.size.metric,
  },
  status: {
    alignItems: 'center',
    gap: spacing.md,
    justifyContent: 'center',
    minHeight: 180,
  },
  statusText: {
    color: colors.textSecondary,
    fontSize: typography.size.body,
  },
  stockText: {
    color: colors.textSecondary,
    fontSize: typography.size.body,
  },
  title: {
    color: colors.text,
    flexShrink: 1,
    fontSize: typography.size.display,
    fontWeight: typography.weight.bold,
    letterSpacing: -0.8,
  },
});
