import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Screen } from '@/ui/components/Screen';
import { Section } from '@/ui/components/Section';
import {
  createPurchaseDetailsPresentation,
  createPurchaseDetailsRequest,
  createPurchaseVoidSubmissionGate,
  getPurchaseDetailsContentKind,
  getPurchaseVoidErrorPresentation,
  getPurchaseVoidResultPresentation,
  isPurchaseVoidActionVisible,
  normalizePurchaseIdParam,
  type PurchaseVoidFeedbackPresentation,
  type PurchaseDetailsState,
} from '@/ui/purchases/purchase-details-presentation';
import { useAppRuntime } from '@/ui/runtime/app-runtime-context';
import { colors, radii, spacing, typography } from '@/ui/theme/tokens';

export default function PurchaseDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const purchaseId = normalizePurchaseIdParam(params.id);
  const { inventory, persistence, purchaseServices } = useAppRuntime();
  const requestIdRef = useRef(0);
  const voidSubmissionGateRef = useRef(createPurchaseVoidSubmissionGate());
  const [state, setState] = useState<PurchaseDetailsState>({
    status: 'loading',
  });
  const [voidConfirmationVisible, setVoidConfirmationVisible] = useState(false);
  const [voidFeedback, setVoidFeedback] =
    useState<PurchaseVoidFeedbackPresentation | null>(null);
  const [isVoiding, setIsVoiding] = useState(false);

  const loadDetails = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (purchaseServices === null || purchaseId === null) {
      setState({ status: 'ready', details: null });
      return;
    }

    setState({ status: 'loading' });

    try {
      const details = await purchaseServices.getPurchaseDetails.execute(
        createPurchaseDetailsRequest(inventory.id, purchaseId),
      );

      if (requestIdRef.current === requestId) {
        setState({ status: 'ready', details });
      }
    } catch {
      if (requestIdRef.current === requestId) {
        setState({ status: 'error' });
      }
    }
  }, [inventory.id, purchaseId, purchaseServices]);

  useFocusEffect(
    useCallback(() => {
      setVoidConfirmationVisible(false);
      setVoidFeedback(null);
      void loadDetails();

      return () => {
        requestIdRef.current += 1;
      };
    }, [loadDetails]),
  );

  async function handleVoidPurchase() {
    if (
      purchaseServices === null ||
      purchaseId === null ||
      !voidSubmissionGateRef.current.tryStart()
    ) {
      return;
    }

    setVoidFeedback(null);
    setIsVoiding(true);

    try {
      const result = await purchaseServices.voidPurchase.execute({
        inventoryId: inventory.id,
        purchaseId,
      });
      const feedback = getPurchaseVoidResultPresentation(result);

      setVoidConfirmationVisible(false);
      setVoidFeedback(feedback);

      if (feedback.shouldRefresh) {
        await loadDetails();
      }
    } catch (error) {
      const feedback = getPurchaseVoidErrorPresentation(error);

      setVoidConfirmationVisible(false);

      if (feedback.kind === 'not-found') {
        setVoidFeedback(null);
        await loadDetails();
      } else {
        setVoidFeedback(feedback);
      }
    } finally {
      voidSubmissionGateRef.current.finish();
      setIsVoiding(false);
    }
  }

  const contentKind = getPurchaseDetailsContentKind(state);
  const presentation =
    state.status === 'ready' && state.details !== null
      ? createPurchaseDetailsPresentation(state.details, inventory.currency)
      : null;
  const purchaseStatus =
    state.status === 'ready' && state.details !== null
      ? state.details.status
      : null;
  const showVoidAction =
    presentation !== null &&
    purchaseStatus !== null &&
    purchaseServices !== null &&
    isPurchaseVoidActionVisible(purchaseStatus, persistence);

  return (
    <Screen edges={['bottom']}>
      {persistence === 'web-preview' ? (
        <Text style={styles.previewText}>
          Vista previa web · Los detalles persistidos están disponibles en iOS y
          Android.
        </Text>
      ) : null}

      {contentKind === 'loading' ? (
        <View accessibilityLiveRegion="polite" style={styles.status}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.statusText}>Cargando compra…</Text>
        </View>
      ) : null}

      {contentKind === 'not-found' ? (
        <StatusMessage
          message="Compra no disponible"
          supportingText="No pudimos encontrar esta compra en tu inventario."
          onBack={() => router.back()}
        />
      ) : null}

      {contentKind === 'error' ? (
        <StatusMessage
          message="No pudimos cargar la compra"
          supportingText="Inténtalo nuevamente. Tus datos no fueron modificados."
          onBack={() => router.back()}
          onRetry={() => void loadDetails()}
        />
      ) : null}

      {presentation !== null ? (
        <View accessibilityLiveRegion="polite" style={styles.content}>
          <View style={styles.header}>
            <View style={styles.titleLine}>
              <Text accessibilityRole="header" style={styles.title}>
                Compra
              </Text>
              <Text
                style={[
                  styles.statusBadge,
                  presentation.isVoided && styles.voidedBadge,
                ]}
              >
                {presentation.statusLabel}
              </Text>
            </View>
            <Text style={styles.date}>{presentation.dateLabel}</Text>
          </View>

          <Section title="Producto" titleVariant="eyebrow">
            <View accessibilityRole="summary" style={styles.card}>
              <Text style={styles.productName}>{presentation.productName}</Text>
              {presentation.productVariant !== null ? (
                <Text style={styles.secondaryText}>
                  {presentation.productVariant}
                </Text>
              ) : null}
            </View>
          </Section>

          <Section title="Compra" titleVariant="eyebrow">
            <View style={styles.card}>
              <DetailRow label="Cantidad" value={presentation.quantityLabel} />
              <View style={styles.divider} />
              <DetailRow
                label="Costo unitario"
                value={presentation.unitCostLabel}
              />
              <View style={styles.divider} />
              <DetailRow
                emphasized
                label="Total"
                value={presentation.totalAmountLabel}
              />
            </View>
          </Section>

          <Section title="Inventario histórico" titleVariant="eyebrow">
            <View style={styles.card}>
              <DetailRow
                label="Stock antes → después"
                value={presentation.stockTransitionLabel}
              />
              <View style={styles.divider} />
              <DetailRow
                label="Costo promedio anterior"
                value={presentation.averageCostBeforeLabel}
              />
              <View style={styles.divider} />
              <DetailRow
                label="Costo promedio posterior"
                value={presentation.averageCostAfterLabel}
              />
            </View>
          </Section>

          {presentation.notes !== null ? (
            <Section title="Notas" titleVariant="eyebrow">
              <View style={styles.card}>
                <Text style={styles.notes}>{presentation.notes}</Text>
              </View>
            </Section>
          ) : null}

          {showVoidAction || voidFeedback !== null ? (
            <Section title="Anulación" titleVariant="eyebrow">
              {showVoidAction ? (
                <Pressable
                  accessibilityLabel={
                    isVoiding ? 'Anulando compra' : 'Anular compra'
                  }
                  accessibilityRole="button"
                  accessibilityState={{ busy: isVoiding, disabled: isVoiding }}
                  disabled={isVoiding}
                  onPress={() => {
                    setVoidFeedback(null);
                    setVoidConfirmationVisible(true);
                  }}
                  style={({ pressed }) => [
                    styles.voidAction,
                    pressed && styles.voidActionPressed,
                    isVoiding && styles.disabledAction,
                  ]}
                >
                  <Text style={styles.voidActionText}>
                    {isVoiding ? 'Anulando…' : 'Anular compra'}
                  </Text>
                </Pressable>
              ) : null}

              {voidConfirmationVisible && showVoidAction ? (
                <View
                  accessibilityLiveRegion="polite"
                  style={styles.voidConfirmation}
                >
                  <Text style={styles.voidConfirmationTitle}>
                    ¿Anular esta compra?
                  </Text>
                  <Text style={styles.voidConfirmationText}>
                    Si la operación todavía puede anularse, el stock y el costo
                    del producto volverán al estado que tenían antes de esta
                    compra. La compra no se borrará y seguirá apareciendo en tu
                    historial como anulada.
                  </Text>
                  <View style={styles.confirmationActions}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={isVoiding}
                      onPress={() => setVoidConfirmationVisible(false)}
                      style={({ pressed }) => [
                        styles.cancelAction,
                        pressed && styles.cancelActionPressed,
                      ]}
                    >
                      <Text style={styles.cancelActionText}>Cancelar</Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={
                        isVoiding
                          ? 'Anulando compra'
                          : 'Confirmar anular compra'
                      }
                      accessibilityRole="button"
                      accessibilityState={{
                        busy: isVoiding,
                        disabled: isVoiding,
                      }}
                      disabled={isVoiding}
                      onPress={() => void handleVoidPurchase()}
                      style={({ pressed }) => [
                        styles.confirmVoidAction,
                        pressed && styles.confirmVoidActionPressed,
                        isVoiding && styles.disabledAction,
                      ]}
                    >
                      {isVoiding ? (
                        <ActivityIndicator color={colors.onAccent} />
                      ) : (
                        <Text style={styles.confirmVoidActionText}>
                          Anular compra
                        </Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              ) : null}

              {voidFeedback !== null ? (
                <View
                  accessibilityLiveRegion={
                    voidFeedback.kind === 'technical-error'
                      ? 'assertive'
                      : 'polite'
                  }
                  style={styles.voidFeedback}
                >
                  <Text style={styles.voidFeedbackTitle}>
                    {voidFeedback.title}
                  </Text>
                  <Text style={styles.voidFeedbackText}>
                    {voidFeedback.message}
                  </Text>
                  <View style={styles.feedbackActions}>
                    {voidFeedback.canRetry ? (
                      <Pressable
                        accessibilityRole="button"
                        disabled={isVoiding}
                        onPress={() => void handleVoidPurchase()}
                        style={({ pressed }) => [
                          styles.retryAction,
                          pressed && styles.retryActionPressed,
                          isVoiding && styles.disabledAction,
                        ]}
                      >
                        <Text style={styles.retryActionText}>Reintentar</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      disabled={isVoiding}
                      onPress={() => setVoidFeedback(null)}
                      style={({ pressed }) => [
                        styles.cancelAction,
                        pressed && styles.cancelActionPressed,
                      ]}
                    >
                      <Text style={styles.cancelActionText}>Cerrar</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </Section>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

interface DetailRowProps {
  readonly emphasized?: boolean;
  readonly label: string;
  readonly value: string;
}

function DetailRow({ emphasized = false, label, value }: DetailRowProps) {
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, emphasized && styles.emphasizedText]}>
        {label}
      </Text>
      <Text style={[styles.detailValue, emphasized && styles.emphasizedValue]}>
        {value}
      </Text>
    </View>
  );
}

interface StatusMessageProps {
  readonly message: string;
  readonly supportingText: string;
  readonly onBack: () => void;
  readonly onRetry?: () => void;
}

function StatusMessage({
  message,
  supportingText,
  onBack,
  onRetry,
}: StatusMessageProps) {
  return (
    <View style={styles.status}>
      <Text accessibilityRole="header" style={styles.statusTitle}>
        {message}
      </Text>
      <Text accessibilityLiveRegion="assertive" style={styles.statusText}>
        {supportingText}
      </Text>
      <View style={styles.statusActions}>
        {onRetry ? (
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            style={({ pressed }) => [
              styles.retryAction,
              pressed && styles.retryActionPressed,
            ]}
          >
            <Text style={styles.retryActionText}>Reintentar</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [
            styles.backAction,
            pressed && styles.backActionPressed,
          ]}
        >
          <Text style={styles.backActionText}>Volver</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backAction: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backActionPressed: { backgroundColor: colors.surfaceMuted },
  backActionText: {
    color: colors.text,
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
  },
  cancelAction: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  cancelActionPressed: { backgroundColor: colors.surfaceMuted },
  cancelActionText: {
    color: colors.text,
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  content: { gap: spacing.xl },
  confirmationActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  confirmVoidAction: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderRadius: radii.md,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  confirmVoidActionPressed: { opacity: 0.82 },
  confirmVoidActionText: {
    color: colors.onAccent,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  date: { color: colors.textSecondary, fontSize: typography.size.body },
  detailLabel: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: typography.size.caption,
    lineHeight: 18,
  },
  detailRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    minHeight: 36,
  },
  detailValue: {
    color: colors.text,
    flexShrink: 1,
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
    textAlign: 'right',
  },
  divider: {
    backgroundColor: colors.border,
    height: StyleSheet.hairlineWidth,
  },
  disabledAction: { opacity: 0.58 },
  emphasizedText: {
    color: colors.text,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  emphasizedValue: {
    fontSize: typography.size.metric,
    fontWeight: typography.weight.bold,
  },
  feedbackActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  header: { gap: spacing.sm },
  notes: { color: colors.text, fontSize: typography.size.body, lineHeight: 24 },
  previewText: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
    lineHeight: 18,
  },
  productName: {
    color: colors.text,
    fontSize: typography.size.section,
    fontWeight: typography.weight.bold,
  },
  retryAction: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  retryActionPressed: { backgroundColor: colors.accentPressed },
  retryActionText: {
    color: colors.onAccent,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  secondaryText: {
    color: colors.textSecondary,
    fontSize: typography.size.caption,
  },
  status: {
    alignItems: 'center',
    gap: spacing.md,
    justifyContent: 'center',
    minHeight: 240,
  },
  statusActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  statusBadge: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.sm,
    color: colors.accent,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.bold,
    overflow: 'hidden',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
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
  title: {
    color: colors.text,
    fontSize: typography.size.display,
    fontWeight: typography.weight.bold,
    letterSpacing: -0.8,
  },
  titleLine: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  voidedBadge: { backgroundColor: colors.surfaceMuted, color: colors.danger },
  voidAction: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderColor: colors.danger,
    borderRadius: radii.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  voidActionPressed: { backgroundColor: colors.surfaceMuted },
  voidActionText: {
    color: colors.danger,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  voidConfirmation: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.lg,
  },
  voidConfirmationText: {
    color: colors.textSecondary,
    fontSize: typography.size.body,
    lineHeight: 24,
  },
  voidConfirmationTitle: {
    color: colors.text,
    fontSize: typography.size.section,
    fontWeight: typography.weight.bold,
  },
  voidFeedback: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.lg,
  },
  voidFeedbackText: {
    color: colors.textSecondary,
    fontSize: typography.size.body,
    lineHeight: 24,
  },
  voidFeedbackTitle: {
    color: colors.text,
    fontSize: typography.size.section,
    fontWeight: typography.weight.bold,
  },
});
