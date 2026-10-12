import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type { ProductReadDto } from '@stock-app/contracts';
import { validate as validUuid } from 'uuid';
import { useSessionView } from '../auth/context.js';
import { useOnline } from '../products/context.js';
import {
  productScope,
  productsKey,
  productErrorMessage,
  type ProductScope,
} from '../products/controller.js';
import { productListOptions } from '../products/queries.js';
import { uniqueProducts } from '../products/client.js';
import { formatMoney } from '../products/input.js';
import {
  useAdjustments,
  useAdjustmentMutation,
} from '../adjustments/context.js';
import {
  adjustmentPreview,
  differenceFor,
  initialAdjustmentForm,
  reasonOptions,
  reasonLabel,
  signedDifference,
  AdjustmentInputError,
} from '../adjustments/input.js';
export function NewAdjustmentPage() {
  const controller = useAdjustments(),
    session = useSessionView(),
    scope = useMemo(
      () =>
        session.kind === 'BUSINESS_ACTIVE_ENABLED'
          ? productScope(controller.session)
          : null,
      [controller, session],
    );
  return scope && session.kind === 'BUSINESS_ACTIVE_ENABLED' ? (
    <NewAdjustment
      key={`${scope.generation}/${scope.businessId}/${scope.inventoryId}`}
      scope={scope}
    />
  ) : null;
}
function NewAdjustment({ scope }: { scope: ProductScope }) {
  const controller = useAdjustments(),
    view = useAdjustmentMutation(),
    online = useOnline(),
    queries = useQueryClient(),
    location = useLocation();
  const [form, setForm] = useState(() => controller.savedDraft(scope).form),
    [selected, setSelected] = useState<ProductReadDto | null>(
      () => controller.savedDraft(scope).selected,
    );
  const [input, setInput] = useState(''),
    [search, setSearch] = useState(''),
    [barcode, setBarcode] = useState(''),
    [selectionMessage, setSelectionMessage] = useState(''),
    [lookingUp, setLookingUp] = useState(false),
    [submitted, setSubmitted] = useState(false);
  const mounted = useRef(true),
    selectionVersion = useRef(0),
    errorRef = useRef<HTMLParagraphElement>(null);
  const productId = new URLSearchParams(location.search).get('productId');
  const list = useInfiniteQuery(
    productListOptions(controller.products.client, scope, search),
  );
  const locked =
    lookingUp ||
    ['PREPARING', 'SENDING', 'UNCERTAIN', 'CHECKING', 'ACCEPTED'].includes(
      view.kind,
    );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (list.error) controller.session.handleBusinessError(list.error);
  }, [controller, list.error]);
  useEffect(() => {
    if (view.refreshed !== undefined) setSelected(view.refreshed);
    if (view.field) errorRef.current?.focus();
  }, [view.refreshed, view.field]);
  useEffect(() => {
    if (!productId || controller.savedDraft(scope).form.productId) return;
    if (!validUuid(productId)) {
      setSelectionMessage('Producto no disponible.');
      return;
    }
    const request = new AbortController();
    const version = selectionVersion.current;
    void controller.products.client
      .detail(scope.inventoryId, productId, request.signal)
      .then((read) => {
        if (
          request.signal.aborted ||
          !mounted.current ||
          version !== selectionVersion.current
        )
          return;
        if (read) {
          const next = initialAdjustmentForm(read);
          setSelected(read);
          setForm(next);
          controller.saveDraft(scope, next, read);
        } else setSelectionMessage('Producto no disponible.');
      })
      .catch((error) => {
        if (!request.signal.aborted) {
          controller.session.handleBusinessError(error);
          setSelectionMessage(productErrorMessage(error));
        }
      });
    return () => request.abort();
  }, [controller, scope, productId]);
  const previousKind = useRef(view.kind);
  useEffect(() => {
    if (view.kind === 'READY' && previousKind.current === 'ACCEPTED') {
      setForm(initialAdjustmentForm());
      setSelected(null);
      setSubmitted(false);
    }
    previousKind.current = view.kind;
  }, [view.kind]);
  function select(read: ProductReadDto) {
    if (locked) return;
    selectionVersion.current++;
    const next = initialAdjustmentForm(read);
    setForm(next);
    setSelected(read);
    controller.saveDraft(scope, next, read);
    setSelectionMessage('Producto seleccionado.');
    setSubmitted(false);
  }
  function change(next: typeof form) {
    setForm(next);
    controller.saveDraft(scope, next, selected);
  }
  async function lookup() {
    const code = barcode.trim();
    if (!code || !online || locked || lookingUp) return;
    setLookingUp(true);
    const version = ++selectionVersion.current;
    try {
      const read = await queries.fetchQuery({
        queryKey: productsKey(scope, 'barcode', code),
        staleTime: 0,
        queryFn: ({ signal }) =>
          controller.products.client.barcode(scope.inventoryId, code, signal),
      });
      const current = productScope(controller.session);
      if (
        !mounted.current ||
        version !== selectionVersion.current ||
        !current ||
        current.generation !== scope.generation ||
        current.inventoryId !== scope.inventoryId
      )
        return;
      if (read) {
        select(read);
        setBarcode('');
      } else setSelectionMessage('Producto no encontrado.');
    } catch (error) {
      controller.session.handleBusinessError(error);
      if (mounted.current) setSelectionMessage(productErrorMessage(error));
    } finally {
      if (mounted.current) setLookingUp(false);
    }
  }
  let difference: number | null = null,
    fieldError: AdjustmentInputError | null = null;
  if (selected) {
    try {
      difference = differenceFor(form, selected).difference;
      adjustmentPreview(form, selected);
    } catch (error) {
      if (error instanceof AdjustmentInputError) fieldError = error;
    }
  }
  if (view.kind === 'ACCEPTED' && view.result) {
    const { adjustment: a, state: s } = view.result;
    return (
      <section>
        <h1>Stock actualizado</h1>
        <p role="status">{view.message}</p>
        {!view.recovered && (
          <>
            <p>
              Producto: {selected?.product.name}
              {selected?.product.variant && ` · ${selected.product.variant}`}
            </p>
            <dl>
              <dt>Stock antes → después</dt>
              <dd>
                {a.stockBefore} → {a.actualStock}
              </dd>
              <dt>Diferencia</dt>
              <dd>{signedDifference(a.difference)}</dd>
              <dt>Motivo</dt>
              <dd>{reasonLabel(a.reason)}</dd>
              {a.difference > 0 && (
                <>
                  <dt>Costo aplicado</dt>
                  <dd>
                    {formatMoney(a.unitCost)} {scope.currency}
                  </dd>
                </>
              )}
              <dt>Costo promedio posterior</dt>
              <dd>
                {s.unitCost === null
                  ? 'No disponible'
                  : `${formatMoney(s.unitCost)} ${scope.currency}`}
              </dd>
            </dl>
            <Link to={`/products/${a.productId}`}>Ver producto</Link>
          </>
        )}
        <button type="button" onClick={() => controller.acknowledge()}>
          Ajustar otro producto
        </button>
        <Link to="/products">Volver a productos</Link>
      </section>
    );
  }
  return (
    <section>
      <h1>Ajustar stock</h1>
      {!online && (
        <p role="status">
          Sin conexión. Los datos pueden estar desactualizados. Necesitas
          conexión para registrar el ajuste.
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (online) setSearch(input.trim());
        }}
      >
        <label>
          Buscar productos
          <input
            value={input}
            disabled={locked}
            onChange={(event) => setInput(event.currentTarget.value)}
          />
        </label>
        <button type="submit" disabled={!online || locked}>
          Buscar
        </button>
      </form>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void lookup();
        }}
      >
        <label>
          Código de barras
          <input
            value={barcode}
            disabled={locked || lookingUp}
            onChange={(event) => setBarcode(event.currentTarget.value)}
          />
        </label>
        <button type="submit" disabled={!online || locked || lookingUp}>
          Seleccionar por código
        </button>
      </form>
      <p role="status">{selectionMessage}</p>
      {list.isPending && <p role="status">Cargando productos…</p>}
      {list.error && (
        <p role="alert">
          {productErrorMessage(list.error)}{' '}
          <button
            type="button"
            disabled={!online}
            onClick={() => void list.refetch()}
          >
            Reintentar consulta
          </button>
        </p>
      )}
      {list.data && (
        <ul className="product-list">
          {uniqueProducts(list.data.pages).map((read) => (
            <li className="product-card" key={read.product.id}>
              <div>
                <strong>{read.product.name}</strong>
                {read.product.variant && ` · ${read.product.variant}`}
                <p>Stock: {read.state.stock}</p>
                {read.product.barcode && <p>Código: {read.product.barcode}</p>}
              </div>
              <button
                type="button"
                disabled={locked}
                onClick={() => select(read)}
              >
                Seleccionar
              </button>
            </li>
          ))}
        </ul>
      )}
      {list.hasNextPage && (
        <button
          type="button"
          disabled={!online || locked || list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          Cargar más
        </button>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(true);
          if (fieldError) {
            errorRef.current?.focus();
            return;
          }
          void controller.prepare(form);
        }}
      >
        <fieldset disabled={locked}>
          <legend>Conteo físico</legend>
          <p>
            Producto:{' '}
            {selected
              ? `${selected.product.name}${selected.product.variant ? ` · ${selected.product.variant}` : ''}`
              : 'Selecciona un producto.'}
          </p>
          {selected && (
            <>
              <p>Stock registrado: {selected.state.stock}</p>
              <p>
                Costo promedio actual:{' '}
                {selected.state.unitCost === null
                  ? 'No disponible'
                  : `${formatMoney(selected.state.unitCost)} ${scope.currency}`}
              </p>
              {selected.product.barcode && (
                <p>Código: {selected.product.barcode}</p>
              )}
            </>
          )}
          <label htmlFor="adjustment-actualStock">
            ¿Cuántas tienes realmente?
          </label>
          <input
            id="adjustment-actualStock"
            inputMode="numeric"
            value={form.actualStock}
            onChange={(event) =>
              change({ ...form, actualStock: event.currentTarget.value })
            }
            aria-invalid={submitted && fieldError?.field === 'actualStock'}
            aria-describedby="adjustment-form-error"
          />
          <p role="status" aria-live="polite">
            Diferencia:{' '}
            {difference === null
              ? 'Ingresa el conteo físico.'
              : signedDifference(difference)}
          </p>
          {view.observedStock !== undefined && (
            <p>
              Stock anterior observado: {view.observedStock}. Stock actualizado:{' '}
              {selected?.state.stock}. Tu conteo físico: {form.actualStock}.
            </p>
          )}
          {difference === 0 && (
            <p role="status">
              El stock registrado ya coincide con el conteo físico.
            </p>
          )}
          <label htmlFor="adjustment-reason">Motivo</label>
          <select
            id="adjustment-reason"
            value={
              reasonOptions(difference).some((r) => r.value === form.reason)
                ? form.reason
                : ''
            }
            onChange={(event) => {
              const reason = reasonOptions(difference).find(
                (r) => r.value === event.currentTarget.value,
              )?.value;
              if (reason) change({ ...form, reason });
            }}
            aria-invalid={submitted && fieldError?.field === 'reason'}
            aria-describedby="adjustment-form-error"
          >
            <option value="" disabled>
              Elige un motivo válido
            </option>
            {reasonOptions(difference).map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          {difference !== null && difference > 0 && (
            <fieldset>
              <legend>Costo de las unidades encontradas</legend>
              <label>
                <input
                  type="radio"
                  name="adjustment-cost-mode"
                  checked={
                    form.costMode === 'USE_CURRENT_COST' &&
                    selected?.state.unitCost !== null
                  }
                  disabled={selected?.state.unitCost === null}
                  onChange={() =>
                    change({ ...form, costMode: 'USE_CURRENT_COST' })
                  }
                />
                Usar costo promedio actual{' '}
                {selected?.state.unitCost != null &&
                  `${formatMoney(selected.state.unitCost)} ${scope.currency}`}
              </label>
              <label>
                <input
                  type="radio"
                  name="adjustment-cost-mode"
                  checked={form.costMode === 'CUSTOM_COST'}
                  onChange={() => change({ ...form, costMode: 'CUSTOM_COST' })}
                />
                Otro costo por unidad
              </label>
              {selected?.state.unitCost === null && (
                <p>
                  Indica el costo de las unidades encontradas; este producto aún
                  no tiene costo conocido.
                </p>
              )}
              {form.costMode === 'CUSTOM_COST' && (
                <>
                  <label htmlFor="adjustment-customUnitCost">
                    Costo por unidad ({scope.currency})
                  </label>
                  <input
                    id="adjustment-customUnitCost"
                    inputMode="decimal"
                    value={form.customUnitCost}
                    onChange={(event) =>
                      change({
                        ...form,
                        customUnitCost: event.currentTarget.value,
                      })
                    }
                    aria-invalid={
                      submitted && fieldError?.field === 'customUnitCost'
                    }
                    aria-describedby="adjustment-form-error"
                  />
                </>
              )}
            </fieldset>
          )}
          {difference !== null && difference < 0 && (
            <p>
              El costo promedio vigente de las unidades restantes no cambia.
            </p>
          )}
          <p
            ref={errorRef}
            tabIndex={-1}
            id="adjustment-form-error"
            role={submitted && fieldError ? 'alert' : undefined}
          >
            {submitted && fieldError?.message}
          </p>
          <button
            type="submit"
            disabled={!online || locked || !selected || difference === 0}
          >
            Revisar conteo
          </button>
        </fieldset>
      </form>
      {view.review && (
        <section aria-label="Confirmar conteo">
          <h2>Revisa el conteo</h2>
          <p>{view.review.read.product.name}</p>
          <p>Stock registrado: {view.review.read.state.stock}</p>
          <p>Conteo físico: {view.review.preview.actualStock}</p>
          <p>Diferencia: {signedDifference(view.review.preview.difference)}</p>
          <p>Motivo: {reasonLabel(view.review.form.reason)}</p>
          {view.review.preview.difference > 0 && (
            <p>
              Costo aceptado:{' '}
              {view.review.preview.unitCost === null
                ? 'No disponible'
                : formatMoney(view.review.preview.unitCost)}{' '}
              {scope.currency}
            </p>
          )}
          <button
            type="button"
            disabled={!online || locked}
            onClick={() => void controller.confirm()}
          >
            Confirmar ajuste
          </button>
        </section>
      )}
      <section aria-label="Estado del ajuste">
        <p role="status" aria-live="polite">
          {view.message}
        </p>
        {view.kind === 'UNCERTAIN' && (
          <>
            {view.canRetry && (
              <button
                type="button"
                disabled={!online}
                onClick={() => void controller.retry()}
              >
                Reintentar el mismo ajuste
              </button>
            )}
            <button
              type="button"
              disabled={!online}
              onClick={() => void controller.check()}
            >
              Comprobar nuevamente
            </button>
            <button type="button" onClick={() => controller.discard()}>
              Descartar y empezar otro ajuste
            </button>
          </>
        )}
      </section>
    </section>
  );
}
