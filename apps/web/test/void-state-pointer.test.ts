import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contractSchemas, createSchemaValidator } from '@stock-app/contracts';
import { buildVoid, type VoidKind } from '../src/voids/input.js';
import { coherentVoid } from '../src/voids/client.js';
import { voidReview, voidResult } from './void-fixtures.js';
import { inventoryId, operationId } from './product-fixtures.js';
for (const kind of ['SALE_VOID', 'PURCHASE_VOID'] as VoidKind[])
  for (const pointer of [null, operationId])
    test(`${kind} exact current pointer ${pointer} does not invent an original Movement ID`, () => {
      const review = voidReview(kind),
        originalMovementId = review.states[0]!.lastMovementId!;
      review.states[0]!.lastMovementId = pointer;
      const command = buildVoid(review),
        result = voidResult(command, review);
      // Original ledger links come from the server, not from interpreting the current pointer.
      result.reversals[0]!.sourceId = originalMovementId;
      result.reversals[0]!.reversalOfMovementId = originalMovementId;
      createSchemaValidator(
        kind === 'SALE_VOID'
          ? contractSchemas.VoidSaleResult
          : contractSchemas.VoidPurchaseResult,
      )(result);
      assert.equal(coherentVoid(result, inventoryId, command, review), true);
      assert.equal(
        command.commandKind === 'SALE_VOID'
          ? command.preconditions.states[0]!.expectedState.lastMovementId
          : command.preconditions.expectedState.lastMovementId,
        pointer,
      );
    });
for (const kind of ['SALE_VOID', 'PURCHASE_VOID'] as VoidKind[])
  test(`${kind} a reversal cannot link to itself as the original ledger movement`, () => {
    const review = voidReview(kind),
      command = buildVoid(review),
      result = voidResult(command, review);
    result.reversals[0]!.sourceId = result.reversals[0]!.id;
    result.reversals[0]!.reversalOfMovementId = result.reversals[0]!.id;
    assert.equal(coherentVoid(result, inventoryId, command, review), false);
  });
