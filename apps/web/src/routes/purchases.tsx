import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { ProductReadDto } from '@stock-app/contracts';
import { useSessionView } from '../auth/context.js';
import { useOnline } from '../products/context.js';
import {
  productScope,
  productsKey,
  productErrorMessage,
  type ProductScope,
} from '../products/controller.js';
import {
  productListOptions,
  productDetailOptions,
} from '../products/queries.js';
import { uniqueProducts } from '../products/client.js';
import { formatMoney } from '../products/input.js';
import { usePurchases, usePurchaseMutation } from '../purchases/context.js';
import {
  initialPurchaseForm,
  purchaseTotal,
  PurchaseInputError,
} from '../purchases/input.js';
import { purchaseDetailOptions } from '../purchases/queries.js';
import { purchaseErrorMessage } from '../purchases/controller.js';
import {
  PurchaseConfirmation,
  PurchaseFacts,
} from './purchase-confirmation.js';
export function PendingPurchaseStatus() {
  const controller = usePurchases(),
    view = usePurchaseMutation(),
    online = useOnline();
  return (
    <section aria-label="Estado de la compra">
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
              Reintentar
            </button>
          )}
          <button
            type="button"
            disabled={!online}
            onClick={() => void controller.check()}
          >
            Comprobar estado
          </button>
          <button type="button" onClick={() => controller.discard()}>
            Descartar y empezar otra compra
          </button>
        </>
      )}
      {view.kind === 'ACCEPTED' && !view.confirmation && view.purchaseId && (
        <>
          <Link to={`/purchases/${view.purchaseId}`}>
            Ver compra registrada
          </Link>
          <button type="button" onClick={() => controller.leaveConfirmation()}>
            Crear una compra nueva
          </button>
        </>
      )}
    </section>
  );
}
export function NewPurchasePage() {
  const controller = usePurchases(),
    session = useSessionView(),
    scope = productScope(controller.session);
  return scope &&
    session.kind === 'BUSINESS_ACTIVE_ENABLED' &&
    session.me.inventory ? (
    <NewPurchase
      key={`${scope.generation}/${scope.inventoryId}`}
      scope={scope}
      timeZone={session.me.inventory.reportingTimeZone}
    />
  ) : null;
}
function NewPurchase({
  scope,
  timeZone,
}: {
  scope: ProductScope;
  timeZone: string;
}) {
  const controller = usePurchases(),
    view = usePurchaseMutation(),
    online = useOnline(),
    queries = useQueryClient(),
    location = useLocation();
  const [form, setForm] = useState(() => controller.savedDraft(scope).form),
    [selected, setSelected] = useState<ProductReadDto | null>(
      () => controller.savedDraft(scope).selected,
    ),
    [input, setInput] = useState(''),
    [search, setSearch] = useState(''),
    [barcode, setBarcode] = useState(''),
    [selectionMessage, setSelectionMessage] = useState(''),
    [lookingUp, setLookingUp] = useState(false),
    [submitted, setSubmitted] = useState(false);
  const mounted = useRef(true),
    preselect =
      typeof location.state?.productId === 'string'
        ? location.state.productId
        : null;
  const list = useInfiniteQuery(
      productListOptions(controller.products.client, scope, search),
    ),
    locked = [
      'PREPARING',
      'SENDING',
      'UNCERTAIN',
      'CHECKING',
      'ACCEPTED',
    ].includes(view.kind);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, [controller]);
  useEffect(() => {
    if (list.error) controller.session.handleBusinessError(list.error);
  }, [controller, list.error]);
  useEffect(() => {
    if (view.refreshed !== undefined) {
      setSelected(view.refreshed);
      controller.saveDraft(
        scope,
        controller.savedDraft(scope).form,
        view.refreshed,
      );
      if (view.refreshed === null)
        setSelectionMessage('Producto no disponible.');
    }
  }, [view.refreshed, controller, scope]);
  useEffect(() => {
    if (!preselect) return;
    const request = new AbortController();
    void controller.products.client
      .detail(scope.inventoryId, preselect, request.signal)
      .then((read) => {
        if (request.signal.aborted || !mounted.current) return;
        if (read) {
          setSelected(read);
          const saved = controller.savedDraft(scope).form;
          const next =
            saved.productId === read.product.id
              ? saved
              : { ...initialPurchaseForm(), productId: read.product.id };
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
  }, [controller, scope, preselect]);
  const previousKind = useRef(view.kind);
  useEffect(() => {
    if (view.kind === 'READY' && previousKind.current !== 'READY') {
      setForm(initialPurchaseForm());
      setSelected(null);
      setSubmitted(false);
    }
    previousKind.current = view.kind;
  }, [view.kind]);
  function select(read: ProductReadDto) {
    setSelected(read);
    setForm({ ...initialPurchaseForm(), productId: read.product.id });
    controller.saveDraft(
      scope,
      { ...initialPurchaseForm(), productId: read.product.id },
      read,
    );
    setSelectionMessage('Producto seleccionado.');
    setSubmitted(false);
  }
  function changeForm(next: typeof form) {
    setForm(next);
    controller.saveDraft(scope, next, selected);
  }
  async function lookup() {
    const code = barcode.trim();
    if (!code || !online || locked || lookingUp) return;
    setLookingUp(true);
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
  let total: string | null = null,
    fieldError: PurchaseInputError | null = null;
  try {
    total = formatMoney(String(purchaseTotal(form).scaledUnits));
  } catch (error) {
    if (error instanceof PurchaseInputError) fieldError = error;
  }
  if (view.kind === 'ACCEPTED' && view.confirmation)
    return (
      <PurchaseConfirmation currency={scope.currency} timeZone={timeZone} />
    );
  return (
    <section>
      <h1>Nueva compra</h1>
      {!online && (
        <p role="status">
          Sin conexión. Los datos pueden estar desactualizados. Necesitas
          conexión para registrar la compra.
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
              <p>
                Precio habitual: {formatMoney(read.product.regularSalePrice)}{' '}
                {scope.currency}
              </p>
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
          disabled={!online || list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          Cargar más
        </button>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(true);
          void controller.prepare(form);
        }}
      >
        <fieldset disabled={locked}>
          <legend>Datos de la compra</legend>
          <p>
            Producto:{' '}
            {selected
              ? `${selected.product.name}${selected.product.variant ? ` · ${selected.product.variant}` : ''}`
              : form.productId
                ? 'Producto no disponible.'
                : 'Selecciona un producto.'}
          </p>
          <label htmlFor="purchase-quantity">Cantidad</label>
          <input
            id="purchase-quantity"
            inputMode="numeric"
            value={form.quantity}
            onChange={(event) =>
              changeForm({ ...form, quantity: event.currentTarget.value })
            }
            aria-describedby="purchase-form-error"
            aria-invalid={submitted && fieldError?.field === 'quantity'}
          />
          <label htmlFor="purchase-unit-cost">
            Costo de compra por unidad ({scope.currency})
          </label>
          <input
            id="purchase-unit-cost"
            inputMode="decimal"
            value={form.unitCost}
            onChange={(event) =>
              changeForm({ ...form, unitCost: event.currentTarget.value })
            }
            aria-describedby="purchase-form-error"
            aria-invalid={
              form.unitCost !== '' && fieldError?.field === 'unitCost'
            }
          />
          <p id="purchase-form-error" role="alert">
            {(submitted || form.unitCost !== '') && fieldError?.message}
          </p>
          <p role="status">
            Total de compra:{' '}
            {total === null ? 'No disponible' : `${total} ${scope.currency}`}
          </p>
          <button
            type="submit"
            disabled={!online || !selected || total === null}
          >
            Registrar compra
          </button>
        </fieldset>
      </form>
      <PendingPurchaseStatus />
    </section>
  );
}
export function PurchaseDetailPage() {
  const controller = usePurchases(),
    session = useSessionView(),
    scope = productScope(controller.session),
    { id = '' } = useParams();
  return scope &&
    session.kind === 'BUSINESS_ACTIVE_ENABLED' &&
    session.me.inventory ? (
    <LoadedPurchase
      key={`${scope.generation}/${scope.inventoryId}/${id}`}
      scope={scope}
      id={id}
      timeZone={session.me.inventory.reportingTimeZone}
    />
  ) : null;
}
function LoadedPurchase({
  scope,
  id,
  timeZone,
}: {
  scope: ProductScope;
  id: string;
  timeZone: string;
}) {
  const controller = usePurchases(),
    online = useOnline(),
    query = useQuery(purchaseDetailOptions(controller.client, scope, id));
  useEffect(() => {
    if (query.error) controller.session.handleBusinessError(query.error);
  }, [controller, query.error]);
  return (
    <>
      {!online && (
        <p role="status">
          Sin conexión. Los datos pueden estar desactualizados.
        </p>
      )}
      {query.isPending ? (
        <p role="status">Cargando compra…</p>
      ) : query.error ? (
        <p role="alert">
          {purchaseErrorMessage(query.error)}{' '}
          <button
            type="button"
            disabled={!online}
            onClick={() => void query.refetch()}
          >
            Reintentar consulta
          </button>
        </p>
      ) : !query.data ? (
        <p role="status">Compra no disponible.</p>
      ) : (
        <>
          <PurchaseProductName
            scope={scope}
            id={query.data.purchase.productId}
          />
          <PurchaseFacts
            purchase={query.data.purchase}
            currency={scope.currency}
            timeZone={timeZone}
          />
        </>
      )}
      <Link to="/purchases/new">Nueva compra</Link>
      <Link to="/products">Volver a productos</Link>
    </>
  );
}
function PurchaseProductName({
  scope,
  id,
}: {
  scope: ProductScope;
  id: string;
}) {
  const controller = usePurchases(),
    product = useQuery(
      productDetailOptions(controller.products.client, scope, id),
    );
  useEffect(() => {
    if (product.error) controller.session.handleBusinessError(product.error);
  }, [controller, product.error]);
  return (
    <p>
      Producto (nombre actual):{' '}
      {product.data
        ? `${product.data.product.name}${product.data.product.variant ? ` · ${product.data.product.variant}` : ''}`
        : product.isPending
          ? 'Consultando…'
          : 'Producto no disponible'}
    </p>
  );
}
