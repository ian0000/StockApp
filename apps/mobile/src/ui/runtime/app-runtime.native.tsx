import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MultipleInventoriesNotSupportedError } from '@stock-app/application';
import type { Inventory } from '@stock-app/domain';

import { createAppServices, type AppServices } from '@/composition';
import { FirstRunSetup } from '@/ui/components/FirstRunSetup';
import { colors, radii, spacing, typography } from '@/ui/theme/tokens';

import { AppRuntimeContext } from './app-runtime-context';

type RuntimeState =
  | { readonly status: 'loading' }
  | { readonly status: 'setup'; readonly services: AppServices }
  | {
      readonly status: 'ready';
      readonly inventory: Inventory;
      readonly services: AppServices;
    }
  | { readonly status: 'error'; readonly message: string };

function initializationErrorMessage(error: unknown): string {
  if (error instanceof MultipleInventoriesNotSupportedError) {
    return 'Encontramos más de un inventario. Esta versión todavía admite uno activo.';
  }

  return 'No pudimos preparar tu inventario. Tus datos no fueron modificados.';
}

export function AppRuntimeProvider({ children }: PropsWithChildren) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<RuntimeState>({ status: 'loading' });
  const servicesRef = useRef<AppServices | null>(null);

  useEffect(() => {
    let isCurrentAttempt = true;

    async function initialize() {
      setState({ status: 'loading' });

      try {
        const services = servicesRef.current ?? (await createAppServices());
        servicesRef.current = services;
        const inventory = await services.getCurrentInventory.execute();

        if (!isCurrentAttempt) {
          return;
        }

        setState(
          inventory === null
            ? { status: 'setup', services }
            : { status: 'ready', inventory, services },
        );
      } catch (error) {
        if (isCurrentAttempt) {
          setState({
            status: 'error',
            message: initializationErrorMessage(error),
          });
        }
      }
    }

    void initialize();

    return () => {
      isCurrentAttempt = false;
    };
  }, [attempt]);

  if (state.status === 'loading') {
    return (
      <RuntimeStatusScreen>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text accessibilityRole="header" style={styles.statusTitle}>
          StockApp
        </Text>
        <Text style={styles.statusText}>Preparando tu inventario…</Text>
      </RuntimeStatusScreen>
    );
  }

  if (state.status === 'error') {
    return (
      <RuntimeStatusScreen>
        <Text accessibilityRole="header" style={styles.statusTitle}>
          No pudimos iniciar
        </Text>
        <Text accessibilityLiveRegion="assertive" style={styles.statusText}>
          {state.message}
        </Text>
        <Pressable
          accessibilityLabel="Reintentar preparación del inventario"
          accessibilityRole="button"
          onPress={() => setAttempt((current) => current + 1)}
          style={({ pressed }) => [
            styles.retryAction,
            pressed && styles.retryActionPressed,
          ]}
        >
          <Text style={styles.retryActionText}>Reintentar</Text>
        </Pressable>
      </RuntimeStatusScreen>
    );
  }

  if (state.status === 'setup') {
    return (
      <FirstRunSetup
        createInventory={state.services.createInventory}
        onCreated={(inventory) =>
          setState({ status: 'ready', inventory, services: state.services })
        }
      />
    );
  }

  return (
    <AppRuntimeContext.Provider
      value={{
        inventory: state.inventory,
        persistence: 'sqlite',
        productServices: {
          createProduct: state.services.createProduct,
          listProducts: state.services.listProducts,
        },
        purchaseServices: {
          registerPurchase: state.services.registerPurchase,
        },
        saleServices: {
          getSalesSummary: state.services.getSalesSummary,
          registerSale: state.services.registerSale,
        },
      }}
    >
      {children}
    </AppRuntimeContext.Provider>
  );
}

function RuntimeStatusScreen({ children }: PropsWithChildren) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.statusContent}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  retryAction: {
    alignItems: 'center',
    borderColor: colors.accent,
    borderRadius: radii.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.xl,
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
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  statusContent: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  statusText: {
    color: colors.textSecondary,
    fontSize: typography.size.body,
    lineHeight: 24,
    maxWidth: 420,
    textAlign: 'center',
  },
  statusTitle: {
    color: colors.text,
    fontSize: typography.size.metric,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
  },
});
