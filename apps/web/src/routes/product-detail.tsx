import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { ProductReadDto } from '@stock-app/contracts';
import { useSessionView } from '../auth/context.js';
import {
  useOnline,
  useProducts,
  useProductMutation,
} from '../products/context.js';
import {
  productScope,
  productErrorMessage,
  type ProductScope,
} from '../products/controller.js';
import { productDetailOptions } from '../products/queries.js';
import { formatMoney } from '../products/input.js';
import {
  initialEditDraft,
  editField,
  rebaseDraft,
  formatPercentage,
  metadataFields,
  type MetadataField,
} from '../products/edit.js';
import { PendingProductStatus } from './products.js';

export const ARCHIVE_WARNING =
  'El producto dejará de aparecer en búsquedas y nuevas operaciones. Las ventas, compras y movimientos anteriores se conservarán.';
export function ProductUnavailable() {
  return (
    <section>
      <p role="status">Producto no disponible.</p>
      <Link to="/products">Volver a productos</Link>
    </section>
  );
}
export function ProductFacts({
  item,
  currency,
}: {
  item: ProductReadDto;
  currency: string;
}) {
  return (
    <section className="product-detail" aria-label="Detalle de producto">
      <h1>{item.product.name}</h1>
      <dl>
        <dt>Variante</dt>
        <dd>{item.product.variant ?? 'No disponible'}</dd>
        <dt>Código de barras</dt>
        <dd>{item.product.barcode ?? 'No disponible'}</dd>
        <dt>Stock actual</dt>
        <dd>{item.state.stock}</dd>
        <dt>Costo promedio</dt>
        <dd>
          {formatMoney(item.state.unitCost)}
          {item.state.unitCost !== null && ` ${currency}`}
        </dd>
        <dt>Precio habitual</dt>
        <dd>
          {formatMoney(item.product.regularSalePrice)} {currency}
        </dd>
        <dt>Stock mínimo</dt>
        <dd>{item.product.minimumStock ?? 'No disponible'}</dd>
        <dt>Stock bajo</dt>
        <dd>{item.isLowStock ? 'Sí' : 'No'}</dd>
        <dt>Margen</dt>
        <dd>{formatPercentage(item.margin)}</dd>
        <dt>Markup</dt>
        <dd>{formatPercentage(item.markup)}</dd>
      </dl>
    </section>
  );
}
export function ArchiveConfirmation({
  disabled,
  cancel,
  confirm,
}: {
  disabled: boolean;
  cancel: () => void;
  confirm: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <section aria-labelledby="archive-heading">
      <h2 id="archive-heading" tabIndex={-1} ref={heading}>
        Confirmar archivo
      </h2>
      <p>{ARCHIVE_WARNING}</p>
      <button type="button" disabled={disabled} onClick={cancel}>
        Cancelar
      </button>
      <button type="button" disabled={disabled} onClick={confirm}>
        Confirmar archivo
      </button>
    </section>
  );
}
function ProductRoute({ edit }: { edit: boolean }) {
  const controller = useProducts();
  useSessionView();
  const scope = productScope(controller.session),
    { id = '' } = useParams();
  if (!scope) return null;
  return (
    <LoadedProduct
      key={`${scope.generation}/${scope.inventoryId}/${id}/${edit}`}
      scope={scope}
      id={id}
      edit={edit}
    />
  );
}
export function ProductDetailPage() {
  return <ProductRoute edit={false} />;
}
export function EditProductPage() {
  return <ProductRoute edit />;
}
function LoadedProduct({
  scope,
  id,
  edit,
}: {
  scope: ProductScope;
  id: string;
  edit: boolean;
}) {
  const controller = useProducts(),
    view = useProductMutation(),
    navigate = useNavigate();
  const query = useQuery({
    ...productDetailOptions(controller.client, scope, id),
    enabled: !(
      view.commandKind === 'PRODUCT_ARCHIVE' &&
      ['SENDING', 'CHECKING', 'ACCEPTED'].includes(view.kind)
    ),
  });
  useEffect(() => {
    if (query.error) controller.session.handleBusinessError(query.error);
  }, [query.error, controller]);
  useEffect(() => {
    if (view.kind !== 'ACCEPTED' || view.commandKind === 'PRODUCT_CREATE')
      return;
    // Recovery identifies the Product from the validated receipt, without storing a route or payload.
    if (
      view.commandKind === 'PRODUCT_ARCHIVE' ||
      view.productId?.toLowerCase() === id.toLowerCase()
    ) {
      controller.acknowledge();
      void navigate(
        view.commandKind === 'PRODUCT_ARCHIVE'
          ? '/products'
          : `/products/${id}`,
        { replace: true, state: { productMessage: view.message } },
      );
    }
  }, [view, controller, id, navigate]);
  if (query.isPending)
    return (
      <section>
        <h1>{edit ? 'Editar producto' : 'Detalle de producto'}</h1>
        <p role="status">Cargando producto…</p>
        <PendingProductStatus />
      </section>
    );
  if (query.error)
    return (
      <section>
        <p role="alert">{productErrorMessage(query.error)}</p>
        <button type="button" onClick={() => void query.refetch()}>
          Reintentar consulta
        </button>
        <PendingProductStatus />
      </section>
    );
  if (!query.data)
    return (
      <>
        <ProductUnavailable />
        <PendingProductStatus />
      </>
    );
  return edit ? (
    <EditProduct item={query.data} />
  ) : (
    <ProductDetail item={query.data} currency={scope.currency} />
  );
}
function ProductDetail({
  item,
  currency,
}: {
  item: ProductReadDto;
  currency: string;
}) {
  const controller = useProducts(),
    view = useProductMutation(),
    online = useOnline(),
    location = useLocation();
  const [confirming, setConfirming] = useState(false);
  const ownConflict =
    view.kind === 'CONFLICT' &&
    view.productId?.toLowerCase() === item.product.id.toLowerCase();
  const archiveButton = useRef<HTMLButtonElement>(null);
  const blocked = ['SENDING', 'CHECKING', 'UNCERTAIN', 'ACCEPTED'].includes(
    view.kind,
  );
  useEffect(() => {
    if (view.kind === 'CONFLICT') {
      setConfirming(false);
      archiveButton.current?.focus();
    }
  }, [view.kind]);
  const message =
    location.state && typeof location.state.productMessage === 'string'
      ? location.state.productMessage
      : '';
  return (
    <>
      <ProductFacts item={item} currency={currency} />
      {message && <p role="status">{message}</p>}
      <nav aria-label="Acciones del producto">
        <Link to={`/products/${item.product.id}/edit`}>Editar producto</Link>
        <Link to="/purchases/new" state={{ productId: item.product.id }}>
          Registrar compra
        </Link>
        <Link
          to={`/adjustments/new?productId=${encodeURIComponent(item.product.id)}`}
        >
          Ajustar stock
        </Link>
        <Link to="/products">Volver a productos</Link>
      </nav>
      {view.kind === 'CONFLICT' && <p role="alert">{view.message}</p>}
      {view.kind === 'CONFLICT' && !ownConflict && <ConflictProductLink />}
      {ownConflict && view.latest === undefined && (
        <button
          type="button"
          disabled={!online}
          onClick={() => void controller.reviewConflict()}
        >
          Reintentar consulta
        </button>
      )}
      <button
        type="button"
        ref={archiveButton}
        disabled={
          blocked ||
          !online ||
          (view.kind === 'CONFLICT' && (!ownConflict || !view.latest))
        }
        onClick={() => {
          controller.resolveConflict();
          setConfirming(true);
        }}
      >
        Archivar producto
      </button>
      {confirming && (
        <ArchiveConfirmation
          disabled={blocked || !online}
          cancel={() => {
            setConfirming(false);
            archiveButton.current?.focus();
          }}
          confirm={() => void controller.archive(item.product)}
        />
      )}
      {!online && <p role="status">Necesitas conexión para guardar cambios.</p>}
      <PendingProductStatus />
    </>
  );
}
const fieldLabels: Record<MetadataField, string> = {
  name: 'Nombre',
  variant: 'Variante',
  barcode: 'Código de barras',
  regularSalePrice: 'Precio habitual',
  minimumStock: 'Stock mínimo',
};
function ConflictProductLink() {
  const view = useProductMutation();
  return view.productId ? (
    <p>
      <Link
        to={`/products/${view.productId}${view.commandKind === 'PRODUCT_UPDATE' ? '/edit' : ''}`}
      >
        Revisar el producto del cambio pendiente
      </Link>
    </p>
  ) : null;
}
function EditProduct({ item }: { item: ProductReadDto }) {
  const controller = useProducts(),
    view = useProductMutation(),
    online = useOnline();
  const [draft, setDraft] = useState(() => initialEditDraft(item.product));
  const ownConflict =
    view.kind === 'CONFLICT' &&
    view.productId?.toLowerCase() === item.product.id.toLowerCase();
  const form = useRef<HTMLFormElement>(null);
  const blocked = [
    'SENDING',
    'CHECKING',
    'UNCERTAIN',
    'ACCEPTED',
    'CONFLICT',
  ].includes(view.kind);
  useEffect(() => {
    if (view.kind === 'ERROR' && view.field)
      form.current
        ?.querySelector<HTMLInputElement>(`[name="${view.field}"]`)
        ?.focus();
  }, [view]);
  // Refetches never overwrite the local draft; only the explicit conflict actions replace originals.
  return (
    <section>
      <h1>Editar producto</h1>
      {view.kind === 'CONFLICT' && !ownConflict && (
        <section role="alert">
          <p>{view.message}</p>
          <ConflictProductLink />
        </section>
      )}
      {ownConflict && (
        <section role="alert">
          <p>{view.message}</p>
          <p>
            Existe una versión más reciente. Revisa tus cambios antes de volver
            a guardar.
          </p>
          {view.latest === undefined && (
            <button
              type="button"
              disabled={!online}
              onClick={() => void controller.reviewConflict()}
            >
              Reintentar consulta
            </button>
          )}
          <button
            type="button"
            disabled={!view.latest}
            onClick={() => {
              if (view.latest) {
                setDraft(rebaseDraft(draft, view.latest.product));
                controller.resolveConflict();
              }
            }}
          >
            Revisar con la versión actual
          </button>
          <button
            type="button"
            disabled={!view.latest}
            onClick={() => {
              if (view.latest) {
                setDraft(initialEditDraft(view.latest.product));
                controller.resolveConflict();
              }
            }}
          >
            Descartar mis cambios
          </button>
        </section>
      )}
      <form
        ref={form}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!blocked) void controller.update(draft);
        }}
      >
        <fieldset disabled={blocked}>
          <legend>Datos del producto</legend>
          {metadataFields.map((field) => (
            <label key={field}>
              {fieldLabels[field]}
              <input
                name={field}
                value={draft.text[field]}
                required={field === 'name' || field === 'regularSalePrice'}
                inputMode={
                  field === 'regularSalePrice'
                    ? 'decimal'
                    : field === 'minimumStock'
                      ? 'numeric'
                      : 'text'
                }
                aria-describedby="product-message"
                aria-invalid={view.kind === 'ERROR' && view.field === field}
                onChange={(event) =>
                  setDraft(editField(draft, field, event.currentTarget.value))
                }
              />
            </label>
          ))}
        </fieldset>
        <button type="submit" disabled={blocked || !online}>
          {view.kind === 'SENDING' ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </form>
      {!online && <p role="status">Necesitas conexión para guardar cambios.</p>}
      <PendingProductStatus />
      <Link to={`/products/${item.product.id}`}>Volver al producto</Link>
    </section>
  );
}
