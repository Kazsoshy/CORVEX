-- ============================================================
-- CORVEX — Migration 004: Fix Password Hash
-- The hash used in 002 and 003 was invalid (never matched any
-- password). This migration resets ALL users to the correct
-- bcrypt hash for: Corvex@2026
-- Scope: ALL users — safest blanket fix.
-- ============================================================
UPDATE users
SET password_hash = '$2b$12$B67sR9t9LbsT8ig/8RcpL.X0kll/Rta9tqJOJHC.9btNekutqMlRm',
    updated_at    = NOW();

-- Confirm
DO $$
DECLARE total INT;
BEGIN
    SELECT COUNT(*) INTO total FROM users;
    RAISE NOTICE 'Password hash fixed for % user(s). New password: Corvex@2026', total;
END $$;
