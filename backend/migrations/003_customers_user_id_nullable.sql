BEGIN;

-- Drop the NOT NULL constraint on user_id in the customers table
ALTER TABLE customers ALTER COLUMN user_id DROP NOT NULL;

COMMIT;
