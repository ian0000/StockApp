import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import type { CommandEnvelopeV1 } from '@stock-app/contracts';
import { authFixture } from '../auth/helpers.js';
import { id } from '../postgres/helpers.js';
import { createDatabase } from '../../src/infrastructure/postgres/client.js';
import {
  createCommandExecutor,
  type CloudInventoryContext,
} from '../../src/infrastructure/postgres/command-executor.js';
import { commandFingerprint } from '../../src/commands/fingerprint.js';
import {
  resolveAuthenticatedUser,
  resolveCloudInventory,
} from '../../src/ownership/context.js';
import { bootstrapEmptyInventory } from '../../src/ownership/bootstrap.js';
import { registerBackupRoutes } from '../../src/backup/routes.js';
import { executeProductCommand } from '../../src/products/execute.js';
import { executeSaleCommand } from '../../src/sales/execute.js';
import { executePurchaseCommand } from '../../src/purchases/execute.js';
import { executeAdjustmentCommand } from '../../src/adjustments/execute.js';
import { executeVoidSaleCommand } from '../../src/void-sales/execute.js';
import { executeVoidPurchaseCommand } from '../../src/void-purchases/execute.js';
import {
  createCommand,
  updateCommand,
  archiveCommand,
} from '../products/helpers.js';
import { saleCommand } from '../sales/helpers.js';
import { purchaseCommand } from '../purchases/helpers.js';
import { adjustmentCommand } from '../adjustments/helpers.js';
import { voidCommand } from '../void-sales/helpers.js';
import { voidPurchaseCommand } from '../void-purchases/helpers.js';
import type { BackupDataV1 } from '@stock-app/application';
import { createPostgresBackupReader } from '../../src/backup/snapshot.js';

export async function backupFixture(
  t: TestContext,
  onSnapshot?: (snapshot: BackupDataV1) => Promise<BackupDataV1>,
) {
  let now = Date.now(),
    rateTime = now;
  const f = await authFixture(t, {}, () => rateTime),
    db = createDatabase(f.pool);
  registerBackupRoutes(
    f.app,
    f.runtime.auth,
    db,
    () => now,
    (database, userId, cloud) => {
      const reader = createPostgresBackupReader(database, userId, cloud);
      return {
        async readSnapshot(inventoryId) {
          const snapshot = await reader.readSnapshot(inventoryId);
          return onSnapshot ? onSnapshot(snapshot) : snapshot;
        },
      };
    },
  );
  const execute = createCommandExecutor(db);
  async function identity(label: string) {
    rateTime += 3600001;
    const email = `backup-${label}@example.test`;
    await f.signup(email);
    await f.verify(email);
    const login = await f.signin(email);
    const authenticated = await resolveAuthenticatedUser(f.runtime.auth, {
      cookie: login.cookie,
    });
    now = Date.now();
    return { ...login, email, authenticated };
  }
  async function owner(label: string) {
    const own = await identity(label);
    const dataset = await bootstrapEmptyInventory(
      db,
      own.authenticated.user.id,
      {
        inventoryName: `BACKUP_INVENTORY_${label}_PRIVATE_Q7X9`,
        currency: 'USD',
        reportingTimeZone: 'UTC',
      },
    );
    await f.pool.query(
      'UPDATE businesses SET cloud_access_enabled=true WHERE id=$1',
      [dataset.business.id],
    );
    const context = await resolveCloudInventory(
      db,
      own.authenticated,
      dataset.inventory.id,
    );
    return { ...own, context };
  }
  async function run(scope: CloudInventoryContext, command: CommandEnvelopeV1) {
    const receipt = await execute({
      context: scope,
      command,
      payloadHash: commandFingerprint(scope.inventory.id, command),
      requestId: 'api09-fixture-request',
      execute: (tx, inventory) => {
        switch (command.commandKind) {
          case 'PRODUCT_CREATE':
          case 'PRODUCT_UPDATE':
          case 'PRODUCT_ARCHIVE':
            return executeProductCommand(tx, inventory.id, command);
          case 'SALE_REGISTER':
            return executeSaleCommand(tx, inventory.id, command);
          case 'PURCHASE_REGISTER':
            return executePurchaseCommand(tx, inventory.id, command);
          case 'STOCK_ADJUST':
            return executeAdjustmentCommand(tx, inventory.id, command);
          case 'SALE_VOID':
            return executeVoidSaleCommand(tx, inventory.id, command);
          case 'PURCHASE_VOID':
            return executeVoidPurchaseCommand(tx, inventory.id, command);
        }
      },
    });
    assert.equal(receipt.status, 'ACCEPTED');
    return receipt;
  }
  async function state(scope: CloudInventoryContext, productId: string) {
    const { rows } = await f.pool.query<{
      stock: string;
      unit_cost_units: string | null;
      last_movement_id: string | null;
      state_revision: string;
    }>(
      'SELECT stock,unit_cost_units,last_movement_id,state_revision FROM inventory_states WHERE inventory_id=$1 AND product_id=$2',
      [scope.inventory.id, productId],
    );
    assert.ok(rows[0]);
    return {
      expectedStateRevision: rows[0].state_revision,
      expectedState: {
        stock: Number(rows[0].stock),
        unitCost: rows[0].unit_cost_units,
        lastMovementId: rows[0].last_movement_id,
      },
    };
  }
  async function history(scope: CloudInventoryContext, label: string) {
    let eventAt = 0;
    async function runEvent(command: CommandEnvelopeV1) {
      eventAt += 1000;
      command.occurredAt = eventAt;
      if ('createdAt' in command.payload) command.payload.createdAt = eventAt;
      return run(scope, command);
    }
    const zero = createCommand({
      name: `BACKUP_PRODUCT_${label}_PRIVATE_Q7X9`,
      initialStock: 10,
      initialUnitCost: '0',
      initialMovementId: id(),
      regularSalePrice: '1000000',
    });
    await runEvent(zero);
    const purchase = purchaseCommand(
      zero.payload.productId,
      2,
      '12000000',
      await state(scope, zero.payload.productId),
    );
    purchase.payload.notes = `BACKUP_PURCHASE_${label}_PRIVATE_Q7X9`;
    await runEvent(purchase);
    const voidPurchase = voidPurchaseCommand(
      purchase.payload.purchaseId,
      await state(scope, zero.payload.productId),
    );
    await runEvent(voidPurchase);
    const sale = saleCommand(
      [
        {
          productId: zero.payload.productId,
          quantity: 2,
          price: '1000000',
          cost: '0',
          estimatedCost: '0',
          estimatedProfit: '2000000',
        },
      ],
      `BACKUP_SALE_${label}_PRIVATE_Q7X9`,
    );
    await runEvent(sale);
    const voidSale = voidCommand(sale.payload.saleId, [
      {
        productId: zero.payload.productId,
        ...(await state(scope, zero.payload.productId)),
      },
    ]);
    await runEvent(voidSale);
    for (const actual of [8, 9])
      await runEvent(
        adjustmentCommand(
          zero.payload.productId,
          actual,
          actual === 8 ? null : 'USE_CURRENT_COST',
          null,
          await state(scope, zero.payload.productId),
        ),
      );
    const unknown = createCommand({
      name: `BACKUP_UNKNOWN_${label}_PRIVATE_Q7X9`,
    });
    await runEvent(unknown);
    await runEvent(
      saleCommand([
        {
          productId: unknown.payload.productId,
          quantity: 2,
          price: '1000000',
          cost: null,
          estimatedCost: null,
          estimatedProfit: null,
        },
      ]),
    );
    const archived = createCommand({
      name: `BACKUP_ARCHIVED_${label}_PRIVATE_Q7X9`,
    });
    await runEvent(archived);
    await runEvent(
      updateCommand(archived.payload.productId, '0', {
        name: archived.payload.name,
      }),
    );
    await runEvent(archiveCommand(archived.payload.productId, '1'));
    return { zero, unknown, archived, purchase, sale };
  }
  return {
    ...f,
    db,
    owner,
    identity,
    run,
    state,
    history,
    clock: () => now,
    setClock: (value: number) => {
      now = value;
    },
    advanceRate: () => {
      rateTime += 60001;
    },
  };
}
