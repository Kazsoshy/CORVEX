-- CORVEX-DESTRUCTIVE-AUTHORIZED: additive FK columns only (ON DELETE SET NULL); no table/data DROP
-- 086_branch_transfer_staffing.sql
-- Purpose: Receiving BM proposes receiving Sales Agent + Collector on confirm;
--          OM approve applies them to the customer. Extends customer_branch_transfers only.
-- Scope: Capstone customer cross-branch transfer (field portal / RBAC).
-- Safety: Additive columns only. No DROP TABLE / TRUNCATE / mass DELETE.

ALTER TABLE customer_branch_transfers
  ADD COLUMN IF NOT EXISTS proposed_assigned_sales_agent_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS proposed_account_manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
