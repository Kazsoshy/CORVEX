import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { requireIsoDate, optionalBranchClause } from '../lib/sqlSafety.js';

describe('sqlSafety', () => {
  it('accepts ISO calendar dates', () => {
    assert.equal(requireIsoDate('2026-11-18'), '2026-11-18');
  });

  it('rejects non-ISO date strings', () => {
    assert.throws(() => requireIsoDate("2026-11-18'; DROP TABLE users;--"), { statusCode: 400 });
    assert.throws(() => requireIsoDate('11/18/2026'), { statusCode: 400 });
    assert.throws(() => requireIsoDate(''), { statusCode: 400 });
  });

  it('builds optional branch clauses with bound params', () => {
    assert.deepEqual(optionalBranchClause('branch_id', null, 3), {
      sql: '',
      params: [],
      nextIndex: 3,
    });
    assert.deepEqual(optionalBranchClause('c.branch_id', 7, 3), {
      sql: ' AND c.branch_id = $3',
      params: [7],
      nextIndex: 4,
    });
  });
});
