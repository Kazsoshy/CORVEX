import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveStockStatus } from '../lib/branchInventoryStock.js';

describe('CORVEX Inventory Centralization Rules', () => {
  describe('deriveStockStatus', () => {
    it('returns "Out of Stock" when available stock is 0 or negative', () => {
      assert.equal(deriveStockStatus(0, 10), 'Out of Stock');
      assert.equal(deriveStockStatus(-5, 10), 'Out of Stock');
    });

    it('returns "Critical Stock" when stock is <= 30% of reorder level', () => {
      // Reorder level = 100. 30% = 30.
      assert.equal(deriveStockStatus(30, 100), 'Critical Stock');
      assert.equal(deriveStockStatus(15, 100), 'Critical Stock');
    });

    it('returns "Low Stock" when stock is <= reorder level but > 30%', () => {
      // Reorder level = 100. 31 to 100 is Low Stock.
      assert.equal(deriveStockStatus(50, 100), 'Low Stock');
      assert.equal(deriveStockStatus(100, 100), 'Low Stock');
    });

    it('returns "Sufficient" when stock is above reorder level', () => {
      assert.equal(deriveStockStatus(101, 100), 'Sufficient');
      assert.equal(deriveStockStatus(500, 100), 'Sufficient');
    });

    it('handles edge cases with missing or zero reorder levels gracefully', () => {
      assert.equal(deriveStockStatus(10, 0), 'Sufficient');
      assert.equal(deriveStockStatus(10, null), 'Sufficient');
      assert.equal(deriveStockStatus(0, 0), 'Out of Stock');
    });
  });
});

