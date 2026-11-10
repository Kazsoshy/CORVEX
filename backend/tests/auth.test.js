import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  issueSessionToken,
  readSessionToken,
  isUnscoped,
  UNSCOPED_ROLES,
  ROLE_SETS,
} from '../middleware/auth.js';

describe('CORVEX Auth & Session Management', () => {
  it('issues and validates a signed HMAC-SHA256 session token', () => {
    const token = issueSessionToken(42);
    assert.ok(typeof token === 'string');
    assert.ok(token.includes('.'));

    const session = readSessionToken(`Bearer ${token}`);
    assert.ok(session);
    assert.equal(session.userId, 42);
    assert.ok(session.iat > 0);
    assert.ok(session.la > 0);
  });

  it('rejects tampered or malformed tokens', () => {
    const token = issueSessionToken(42);
    const tampered = token.slice(0, -4) + 'abcd';

    assert.equal(readSessionToken(`Bearer ${tampered}`), null);
    assert.equal(readSessionToken('InvalidHeaderFormat'), null);
    assert.equal(readSessionToken('Bearer not-a-valid-token'), null);
  });

  it('detects idle session timeout after 15 minutes of inactivity', () => {
    const now = Date.now();
    // Simulate last activity 16 minutes ago (> 15min + 30s grace)
    const sixteenMinsAgo = now - 16 * 60 * 1000;
    const token = issueSessionToken(10, sixteenMinsAgo, sixteenMinsAgo);

    const session = readSessionToken(`Bearer ${token}`);
    assert.deepEqual(session, { error: 'idle' });
  });

  it('detects hard token expiration after 12 hours', () => {
    const now = Date.now();
    // Simulate token issued 13 hours ago (max TTL is 12h)
    const thirteenHoursAgo = now - 13 * 60 * 60 * 1000;
    const token = issueSessionToken(10, thirteenHoursAgo, now);

    const session = readSessionToken(`Bearer ${token}`);
    assert.deepEqual(session, { error: 'expired' });
  });

  it('correctly determines unscoped organizational roles', () => {
    assert.ok(UNSCOPED_ROLES.includes('operating_manager'));
    assert.ok(UNSCOPED_ROLES.includes('super_admin'));

    assert.equal(isUnscoped({ roleSlug: 'operating_manager' }), true);
    assert.equal(isUnscoped({ roleSlug: 'super_admin' }), true);
    assert.equal(isUnscoped({ roleSlug: 'branch_manager' }), false);
    assert.equal(isUnscoped({ roleSlug: 'collector' }), false);
    assert.equal(isUnscoped({ roleSlug: 'sales_staff' }), false);
    assert.equal(isUnscoped({ roleSlug: 'inventory_staff' }), false);
  });

  it('enforces branch-isolated and organization-scoped role sets', () => {
    assert.deepEqual(ROLE_SETS.org, ['super_admin', 'operating_manager']);
    assert.ok(ROLE_SETS.catalogRead.includes('branch_manager'));
    assert.ok(ROLE_SETS.catalogRead.includes('inventory_staff'));
    // Sales staff and collectors must not have catalogWrite permissions
    assert.ok(!ROLE_SETS.catalogWrite.includes('sales_staff'));
    assert.ok(!ROLE_SETS.catalogWrite.includes('collector'));
  });
});

