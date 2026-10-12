import type { DashboardDto, HistoryEntryDto } from '@stock-app/contracts';
import { product, productId } from './product-fixtures.js';
export const readNow = Date.parse('2026-10-12T04:30:00Z');
export const historyEntries: HistoryEntryDto[] = [
  {
    type: 'SALE',
    id: '019e3000-0000-7000-8000-000000000050',
    status: 'VOIDED',
    totalAmount: '1234567',
    units: 2,
    effectiveAt: readNow,
    createdAt: readNow,
  },
  {
    type: 'PURCHASE',
    id: '019e3000-0000-7000-8000-000000000051',
    status: 'CONFIRMED',
    productId,
    productName: 'Agua actual',
    productVariant: '1 L',
    quantity: 3,
    unitCost: '0',
    totalAmount: '0',
    effectiveAt: readNow - 3_600_000,
    createdAt: readNow,
  },
  {
    type: 'ADJUSTMENT',
    id: '019e3000-0000-7000-8000-000000000052',
    productId,
    productName: 'Agua actual',
    productVariant: null,
    difference: -2,
    reason: 'DAMAGED',
    effectiveAt: readNow - 86_400_000,
    createdAt: readNow,
  },
];
export const emptyDashboard: DashboardDto = {
  fromInclusive: Date.parse('2026-10-11T05:00:00Z'),
  toExclusive: Date.parse('2026-10-12T05:00:00Z'),
  sales: { totalAmount: '0', estimatedProfit: '0', unitsSold: 0 },
  lowStock: [],
  topSelling: null,
  recent: [],
};
export const dashboard: DashboardDto = {
  ...emptyDashboard,
  sales: { totalAmount: '1234567', estimatedProfit: '-1234567', unitsSold: 7 },
  lowStock: [
    product,
    {
      ...product,
      product: {
        ...product.product,
        id: '019e3000-0000-7000-8000-000000000060',
        name: 'Pan',
        variant: null,
        minimumStock: null,
      },
      state: {
        ...product.state,
        productId: '019e3000-0000-7000-8000-000000000060',
        stock: 0,
      },
    },
  ],
  topSelling: { productId, name: 'Agua', variant: '1 L', unitsSold: 4 },
  recent: historyEntries,
};
