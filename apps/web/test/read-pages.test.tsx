import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { DashboardFacts } from '../src/routes/home.js';
import { HistoryRow, HistoryList, ReadStatus } from '../src/routes/history.js';
import {
  dashboard,
  emptyDashboard,
  historyEntries,
  readNow,
} from './read-fixtures.js';
import { ApiClientError } from '../src/api/client.js';
const render = (element: React.ReactNode) =>
  renderToStaticMarkup(<MemoryRouter>{element}</MemoryRouter>);
const facts = (value = dashboard) =>
  render(
    <DashboardFacts data={value} currency="EUR" timeZone="America/Guayaquil" />,
  );
test('daily summary renders exact amount, signed profit and units as separate metrics', () => {
  const html = facts();
  assert.match(html, /Ventas de hoy/);
  assert.match(html, /1\.23 EUR/);
  assert.match(html, /-1\.23 EUR/);
  assert.match(html, /Unidades vendidas<\/dt><dd>7/);
  assert.ok(!html.includes('número de ventas'));
  assert.ok(!html.includes('Porcentaje'));
});
test('unknown profit is an em dash and explanation, never a known partial zero', () => {
  const html = facts({
    ...dashboard,
    sales: { ...dashboard.sales, estimatedProfit: null },
  });
  assert.match(html, /Ganancia estimada<\/dt><dd>—/);
  assert.match(html, /una o más ventas tienen un costo desconocido/);
  assert.ok(!html.includes('Ganancia estimada</dt><dd>0.00'));
});
test('known zero profit is explicit money without unknown explanation', () => {
  const html = facts({
    ...dashboard,
    sales: { ...dashboard.sales, estimatedProfit: '0' },
  });
  assert.match(html, /Ganancia estimada<\/dt><dd>0\.00 EUR/);
  assert.ok(!html.includes('costo desconocido'));
});
test('empty day keeps zero totals and calm low/top/recent empty states', () => {
  const html = facts(emptyDashboard);
  for (const value of [
    '0.00 EUR',
    'Aún no hay ventas confirmadas hoy',
    'No hay productos con stock bajo',
    'Todavía no hay un producto más vendido',
    'Aún no hay operaciones registradas',
  ])
    assert.ok(html.includes(value));
  assert.ok(!html.includes('Agua'));
  assert.ok(!html.includes('costo desconocido'));
});
test('low preview uses supplied eligibility and preserves negative stock/minimum null versus zero', () => {
  const html = facts();
  assert.match(html, /Stock: -2/);
  assert.match(html, /Stock mínimo: 0/);
  assert.equal((html.match(/Stock mínimo:/g) ?? []).length, 1);
  assert.match(html, /href="\/products"/);
  assert.ok(!html.includes('?filter'));
  assert.ok(!html.includes('urgente'));
});
test('top selling displays server Product/variant and units without ranking', () => {
  const html = facts();
  assert.ok(html.includes('Agua'));
  assert.ok(html.includes('1 L'));
  assert.ok(html.includes('4 unidades vendidas'));
});
test('recent list is commercial and links to the unified History', () => {
  const html = facts();
  assert.match(html, /href="\/history"/);
  for (const value of ['Venta anulada', 'Compra', 'Ajuste'])
    assert.ok(html.includes(value));
  assert.ok(!html.includes('REVERSAL'));
  assert.ok(!html.includes('INITIAL_STOCK'));
});
for (const currency of ['USD', 'EUR', 'JPY'])
  test(`Inventory currency ${currency} is shown without hardcoded dollars`, () => {
    const html = render(
      <DashboardFacts
        data={dashboard}
        currency={currency}
        timeZone="Europe/Madrid"
      />,
    );
    assert.ok(html.includes(`1.23 ${currency}`));
    assert.ok(!html.includes('$'));
  });
for (const status of ['CONFIRMED', 'VOIDED'] as const)
  test(`Sale ${status} row preserves amount/units/time and detail navigation`, () => {
    const entry = {
      ...historyEntries[0]!,
      type: 'SALE' as const,
      status,
      totalAmount: '1234567',
      units: 2,
    };
    const html = render(
      <HistoryRow entry={entry} currency="EUR" timeZone="America/Guayaquil" />,
    );
    assert.ok(html.includes(status === 'VOIDED' ? 'Venta anulada' : 'Venta'));
    assert.ok(html.includes('1.23 EUR'));
    assert.ok(html.includes('2 unidades'));
    assert.ok(html.includes(`/sales/${entry.id}`));
    assert.ok(html.includes('23:30'));
    assert.ok(!html.includes('Anular'));
  });
for (const status of ['CONFIRMED', 'VOIDED'] as const)
  test(`Purchase ${status} displays current metadata and financial snapshot, no void action`, () => {
    const entry = historyEntries[1]!;
    assert.equal(entry.type, 'PURCHASE');
    if (entry.type !== 'PURCHASE') throw new Error('fixture');
    const html = render(
      <HistoryRow
        entry={{ ...entry, status }}
        currency="EUR"
        timeZone="America/Guayaquil"
      />,
    );
    for (const value of [
      'Agua actual',
      '1 L',
      '3 unidades',
      'Costo por unidad: 0.00 EUR',
      'Total: 0.00 EUR',
      `/purchases/${entry.id}`,
    ])
      assert.ok(html.includes(value));
    assert.ok(html.includes(status === 'VOIDED' ? 'Compra anulada' : 'Compra'));
    assert.ok(!html.includes('Anular'));
  });
for (const [reason, label] of [
  ['COUNT_CORRECTION', 'Conteo incorrecto'],
  ['DAMAGED', 'Dañado'],
  ['LOST', 'Perdido'],
  ['INTERNAL_USE', 'Consumo interno'],
  ['OTHER', 'Otro'],
] as const)
  test(`Adjustment ${reason} reason matches WEB-07 without financial total/status/detail`, () => {
    const entry = historyEntries[2]!;
    if (entry.type !== 'ADJUSTMENT') throw new Error('fixture');
    const html = render(
      <HistoryRow
        entry={{ ...entry, reason }}
        currency="EUR"
        timeZone="America/Guayaquil"
      />,
    );
    assert.ok(html.includes(label));
    assert.ok(html.includes('Diferencia: -2'));
    for (const absent of [
      'Total:',
      'Costo',
      'EUR',
      'Estado:',
      '/adjustments/',
      'Anular',
      'Undo',
    ])
      assert.ok(!html.includes(absent));
  });
test('positive Adjustment displays explicit plus', () => {
  const entry = historyEntries[2]!;
  if (entry.type !== 'ADJUSTMENT') throw new Error('fixture');
  assert.ok(
    render(
      <HistoryRow
        entry={{ ...entry, difference: 3 }}
        currency="EUR"
        timeZone="Europe/Madrid"
      />,
    ).includes('Diferencia: +3'),
  );
});
test('date grouping displays Today/Yesterday/local date without reordering server entries', () => {
  const html = render(
    <HistoryList
      entries={historyEntries}
      currency="EUR"
      timeZone="America/Guayaquil"
      now={readNow}
    />,
  );
  assert.ok(html.includes('Hoy'));
  assert.ok(html.includes('Ayer'));
  assert.ok(html.indexOf('Venta anulada') < html.indexOf('Compra'));
  assert.ok(html.indexOf('Compra') < html.indexOf('Ajuste'));
});
test('user metadata is escaped as text, not executable HTML', () => {
  const entry = historyEntries[1]!;
  if (entry.type !== 'PURCHASE') throw new Error('fixture');
  const html = render(
    <HistoryRow
      entry={{ ...entry, productName: '<script>private</script>' }}
      currency="EUR"
      timeZone="Europe/Madrid"
    />,
  );
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
});
for (const status of [400, 401, 403, 404, 429, 500])
  test(`read error ${status} sanitizes raw internal response and exposes retry`, () => {
    const error = new ApiClientError('HTTP', status, {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'SQL password=private',
        requestId: 'private-id',
      },
    });
    const html = render(
      <ReadStatus
        error={error}
        pending={false}
        fetching={false}
        hasData={true}
        online={true}
        retry={() => {}}
      />,
    );
    assert.ok(html.includes('role="alert"'));
    assert.ok(html.includes('Reintentar consulta'));
    assert.ok(!html.includes('SQL'));
    assert.ok(!html.includes('private-id'));
    assert.ok(html.includes('desactualizados'));
  });
test('loading and offline states remain readable; offline retry is disabled', () => {
  assert.ok(
    render(
      <ReadStatus
        error={null}
        pending={true}
        fetching={true}
        hasData={false}
        online={true}
        retry={() => {}}
      />,
    ).includes('Cargando datos'),
  );
  const html = render(
    <ReadStatus
      error={new Error('raw')}
      pending={false}
      fetching={false}
      hasData={true}
      online={false}
      retry={() => {}}
    />,
  );
  assert.ok(html.includes('Sin conexión'));
  assert.ok(html.includes('disabled=""'));
  assert.ok(!html.includes('raw'));
});
