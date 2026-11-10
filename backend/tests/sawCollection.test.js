import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SAW_WEIGHTS,
  haversineKm,
  daysOverdueFromDueDate,
  dedupeEarliestDue,
  computeSawScores,
  runSawPipeline,
} from '../lib/sawCollection.js';

describe('CORVEX SAW Collection Decision Engine', () => {
  it('enforces exact academic weights: 40% balance, 30% overdue days, 30% distance', () => {
    assert.equal(SAW_WEIGHTS.balance, 0.4);
    assert.equal(SAW_WEIGHTS.daysOverdue, 0.3);
    assert.equal(SAW_WEIGHTS.distance, 0.3);
  });

  describe('haversineKm', () => {
    it('returns 0 when coordinates are identical', () => {
      const d = haversineKm(7.0731, 125.6128, 7.0731, 125.6128);
      assert.equal(Math.round(d), 0);
    });

    it('calculates realistic distance between Davao City and General Santos City (~116-118 km)', () => {
      // Davao City: ~7.0731, 125.6128; GenSan: ~6.1164, 125.1716
      const distance = haversineKm(7.0731, 125.6128, 6.1164, 125.1716);
      assert.ok(distance > 110 && distance < 125, `Expected ~117km, got ${distance}`);
    });
  });

  describe('daysOverdueFromDueDate', () => {
    it('calculates overdue days correctly when past due', () => {
      const asOf = '2026-11-08';
      const due = '2026-11-01';
      assert.equal(daysOverdueFromDueDate(asOf, due), 7);
    });

    it('returns 0 if invoice is not yet due', () => {
      const asOf = '2026-11-08';
      const due = '2026-11-20';
      assert.equal(daysOverdueFromDueDate(asOf, due), 0);
    });

    it('returns 0 when due_date is null or undefined', () => {
      assert.equal(daysOverdueFromDueDate('2026-11-08', null), 0);
    });
  });

  describe('dedupeEarliestDue', () => {
    it('keeps the invoice with earliest due date for each customer', () => {
      const rows = [
        { customer_id: 1, invoice_id: 101, due_date: '2026-11-05' },
        { customer_id: 1, invoice_id: 102, due_date: '2026-10-15' }, // earlier
        { customer_id: 2, invoice_id: 201, due_date: '2026-11-01' },
      ];
      const deduped = dedupeEarliestDue(rows);
      assert.equal(deduped.length, 2);
      const cust1 = deduped.find((r) => r.customer_id === 1);
      assert.equal(cust1.invoice_id, 102);
      assert.equal(cust1.due_date, '2026-10-15');
    });
  });

  describe('computeSawScores', () => {
    it('returns empty array when given empty rows', () => {
      assert.deepEqual(computeSawScores([]), []);
    });

    it('correctly scores, normalizes and ranks candidate customers', () => {
      // Customer A: high balance (10,000 max), low overdue (10), medium distance (5km)
      // Customer B: low balance (2,000), high overdue (100 max), closest distance (1km min)
      const testRows = [
        { customer_id: 10, outstanding_balance: 10000, days_overdue: 10, distance_km: 5 },
        { customer_id: 20, outstanding_balance: 2000, days_overdue: 100, distance_km: 1 },
      ];

      const scored = computeSawScores(testRows);
      assert.equal(scored.length, 2);

      // Verify cohort maxima and minima
      assert.equal(scored[0].cohort_max_balance, 10000);
      assert.equal(scored[0].cohort_max_days, 100);
      assert.equal(scored[0].cohort_min_distance, 1);

      // Verify ranks are 1 and 2
      assert.equal(scored[0].rank, 1);
      assert.equal(scored[1].rank, 2);

      // Verify score for Customer 20:
      // balance_norm = 2000/10000 = 0.2
      // days_norm = 100/100 = 1.0
      // distance_norm = 1/1 = 1.0 (cost criterion: min / actual)
      // score = 0.4*0.2 + 0.3*1.0 + 0.3*1.0 = 0.08 + 0.30 + 0.30 = 0.68
      const rowB = scored.find((r) => r.customer_id === 20);
      assert.equal(rowB.balance_norm, 0.2);
      assert.equal(rowB.days_norm, 1);
      assert.equal(rowB.distance_norm, 1);
      assert.equal(rowB.score, 0.68);

      // Verify score for Customer 10:
      // balance_norm = 10000/10000 = 1.0
      // days_norm = 10/100 = 0.1
      // distance_norm = 1/5 = 0.2
      // score = 0.4*1.0 + 0.3*0.1 + 0.3*0.2 = 0.40 + 0.03 + 0.06 = 0.49
      const rowA = scored.find((r) => r.customer_id === 10);
      assert.equal(rowA.balance_norm, 1);
      assert.equal(rowA.days_norm, 0.1);
      assert.equal(rowA.distance_norm, 0.2);
      assert.equal(rowA.score, 0.49);

      // Customer 20 must be rank 1 (0.68 > 0.49)
      assert.equal(rowB.rank, 1);
      assert.equal(rowA.rank, 2);
    });
  });

  describe('runSawPipeline', () => {
    it('executes the full end-to-end pipeline with eligible data', () => {
      const branchLat = 7.0731;
      const branchLon = 125.6128;
      const rows = [
        {
          customer_id: 1,
          customer_name: 'Store Alpha',
          status: 'Active',
          outstanding_balance: 5000,
          due_date: '2026-10-01',
          branch_lat: branchLat,
          branch_lon: branchLon,
          cust_lat: 7.0800,
          cust_lon: 125.6200,
        },
        {
          customer_id: 2,
          customer_name: 'Store Beta',
          status: 'Active',
          outstanding_balance: 15000,
          due_date: '2026-10-20',
          branch_lat: branchLat,
          branch_lon: branchLon,
          cust_lat: 7.1000,
          cust_lon: 125.6300,
        },
      ];

      const results = runSawPipeline(rows, { asOfDate: '2026-11-08' });
      assert.equal(results.length, 2);
      assert.ok(results[0].rank === 1 && results[1].rank === 2);
      assert.ok(results[0].score >= results[1].score);
      assert.ok(results[0].distance_km > 0);
    });
  });
});

