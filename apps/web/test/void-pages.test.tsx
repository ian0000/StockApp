import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { VoidPanel } from '../src/voids/panel.js';
import { operation, type VoidKind } from '../src/voids/input.js';
import { voidReview, voidFixture, voidResult } from './void-fixtures.js';
import { json } from './product-fixtures.js';
const kinds: VoidKind[] = ['SALE_VOID', 'PURCHASE_VOID'];
for (const kind of kinds)
  for (const mode of ['eligible', 'subsequent', 'mismatch', 'voided'])
    test(`${kind} detail action presentation ${mode} does not expose internals or partial void`, (t) => {
      const read = voidReview(kind, null, kind === 'SALE_VOID');
      if (mode === 'subsequent')
        read.detail.voidEligibility = {
          eligible: false,
          reason: 'SUBSEQUENT_OR_AMBIGUOUS_MOVEMENT',
        };
      if (mode === 'mismatch')
        read.detail.voidEligibility = {
          eligible: false,
          reason: 'CURRENT_STATE_MISMATCH',
        };
      if (mode === 'voided') {
        operation(read).status = 'VOIDED';
        read.detail.voidEligibility = { eligible: false, reason: null };
      }
      const f = voidFixture(kind, async () => json({}));
      t.after(f.dispose);
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <VoidPanel read={read} currency="EUR" controller={f.voids} />
        </MemoryRouter>,
      );
      assert.equal(
        html.includes(
          kind === 'SALE_VOID' ? '>Anular venta<' : '>Anular compra<',
        ),
        mode === 'eligible',
      );
      if (mode === 'subsequent') assert.match(html, /movimientos posteriores/);
      if (mode === 'mismatch') assert.match(html, /estado actual.*no coincide/);
      if (mode === 'voided')
        assert.match(
          html,
          kind === 'SALE_VOID' ? /Venta anulada/ : /Compra anulada/,
        );
      assert.doesNotMatch(
        html,
        /stateRevision|lastMovementId|SQL|Anular línea|Deshacer|Undo|Anular ajuste/,
      );
    });
for (const kind of kinds)
  test(`${kind} confirmation has clear meaning, explicit cancel/confirm and no reason/timer`, async (t) => {
    const read = voidReview(kind, null, kind === 'SALE_VOID');
    const f = voidFixture(kind, async (input) =>
      String(input).endsWith('/state')
        ? json(read.states.find((s) => String(input).includes(s.productId)))
        : json(read.detail),
    );
    t.after(f.dispose);
    await f.controller.refresh();
    await f.voids.prepare(operation(read).id);
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <VoidPanel read={read} currency="EUR" controller={f.voids} />
      </MemoryRouter>,
    );
    assert.match(
      html,
      kind === 'SALE_VOID' ? /¿Anular esta venta\?/ : /¿Anular esta compra\?/,
    );
    assert.match(html, /restaurarán los efectos de inventario/);
    assert.match(html, /no se elimina/);
    assert.match(html, /Cancelar/);
    assert.match(html, /Confirmar anulación/);
    assert.match(html, /EUR/);
    assert.doesNotMatch(
      html,
      /<input|<select|Undo|Deshacer|seconds|temporizador/,
    );
    if (kind === 'SALE_VOID')
      assert.match(html, /venta completa con todos sus productos/);
  });
for (const kind of kinds)
  test(`${kind} accepted response removes active void CTA even before a detail refetch mounts`, async (t) => {
    const read = voidReview(kind);
    const f = voidFixture(kind, async (input, options) =>
      String(input).endsWith('/csrf')
        ? json({ token: 'csrf' })
        : String(input).endsWith('/state')
          ? json(read.states[0])
          : String(input).endsWith('/void')
            ? json(voidResult(JSON.parse(String(options?.body)), read))
            : json(read.detail),
    );
    t.after(f.dispose);
    await f.controller.refresh();
    await f.voids.prepare(operation(read).id);
    await f.voids.confirm();
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <VoidPanel read={read} currency="EUR" controller={f.voids} />
      </MemoryRouter>,
    );
    assert.match(
      html,
      kind === 'SALE_VOID' ? /Venta anulada/ : /Compra anulada/,
    );
    assert.doesNotMatch(
      html,
      />Anular venta<|>Anular compra<|Confirmar anulación/,
    );
  });
