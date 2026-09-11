import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';

// Source-level copy checks follow the existing mobile tests without loading RN in Node.
const screens = [
  ['product/new.tsx', ['Precio de venta habitual']],
  ['product/edit/[id].tsx', ['Precio de venta habitual']],
  [
    'product/[id].tsx',
    [
      'Costo promedio actual',
      'Precio de venta habitual',
      'Ganancia estimada por unidad',
      'Margen estimado',
      'Recargo sobre costo (markup)',
    ],
  ],
  ['../ui/sales/SaleRows.tsx', ['Precio de venta por unidad']],
  ['purchase.tsx', ['Costo de compra por unidad', 'Costo promedio actual']],
  [
    'purchase/[id].tsx',
    [
      'Costo de compra por unidad',
      'Costo promedio antes',
      'Costo promedio después',
    ],
  ],
  [
    'sale/[id].tsx',
    [
      'Precio de venta por unidad',
      'Costo histórico por unidad',
      'Ganancia estimada',
    ],
  ],
] as const;

for (const [screen, labels] of screens) {
  test(`${screen} uses explicit pricing terminology`, () => {
    const source = readFileSync(
      new URL(`../src/app/${screen}`, import.meta.url),
      'utf8',
    );
    for (const label of labels)
      assert.ok(source.includes(label), `Missing ${label}`);
    assert.doesNotMatch(
      source,
      /Precio habitual|Precio unitario|Costo actual|Costo unitario|Ganancia aprox\.|Margen aprox\.|Markup aprox\./,
    );
  });
}

test('sale and purchase inputs use the same terminology for accessibility', () => {
  const sale = readFileSync(
    new URL('../src/ui/sales/SaleRows.tsx', import.meta.url),
    'utf8',
  );
  const purchase = readFileSync(
    new URL('../src/app/purchase.tsx', import.meta.url),
    'utf8',
  );
  const productField = readFileSync(
    new URL('../src/ui/products/ProductFormField.tsx', import.meta.url),
    'utf8',
  );
  assert.match(sale, /accessibilityLabel=\{`Precio de venta por unidad de/);
  assert.match(purchase, /accessibilityLabel="Costo de compra por unidad"/);
  assert.match(
    productField,
    /accessibilityLabel=\{label\.replace\(' \*', ''\)\}/,
  );
});
