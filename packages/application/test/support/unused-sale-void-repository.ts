import type {
  PurchaseVoidRepository,
  SaleVoidRepository,
} from '../../src/index';

function unused(): never {
  throw new Error('VoidSale repository is not used by this test.');
}

export const unusedSaleVoidRepository: SaleVoidRepository = {
  async findSale() {
    return unused();
  },
  async listSaleItems() {
    return unused();
  },
  async listOriginalSaleMovements() {
    return unused();
  },
  async listReversals() {
    return unused();
  },
  async listProductMovementsAtOrAfter() {
    return unused();
  },
  async listInventoryStates() {
    return unused();
  },
  async saveReversal() {
    return unused();
  },
  async updateInventoryState() {
    return unused();
  },
  async updateSale() {
    return unused();
  },
};

export const unusedPurchaseVoidRepository: PurchaseVoidRepository = {
  async findPurchase() {
    return unused();
  },
  async listOriginalPurchaseMovements() {
    return unused();
  },
  async listReversals() {
    return unused();
  },
  async listProductMovementsAtOrAfter() {
    return unused();
  },
  async listInventoryStates() {
    return unused();
  },
  async saveReversal() {
    return unused();
  },
  async updateInventoryState() {
    return unused();
  },
  async updatePurchase() {
    return unused();
  },
};
