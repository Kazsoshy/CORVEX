-- Backfill primary/secondary contacts and display codes for existing customers.
-- customer_id stays SERIAL (numeric PK); customer_code is the display label (C-001-2026).

UPDATE customers
SET customer_code = 'C-' || LPAD(customer_id::TEXT, 3, '0') || '-' || TO_CHAR(COALESCE(created_at, CURRENT_TIMESTAMP), 'YYYY')
WHERE customer_code IS NULL OR TRIM(customer_code) = '';

UPDATE customers
SET contact_person_relationship = CASE
  WHEN contact_person_fname = first_name AND contact_person_lname = last_name THEN 'Owner'
  ELSE 'Authorized Representative'
END
WHERE contact_person_relationship IS NULL OR TRIM(contact_person_relationship) = '';

UPDATE customers c
SET
  secondary_contact_fname = picks.fname,
  secondary_contact_lname = picks.lname,
  secondary_contact_phone = picks.phone,
  secondary_contact_relationship = picks.relationship
FROM (
  SELECT
    customer_id,
    (ARRAY['Marco', 'Elaine', 'Ryan', 'Bianca', 'Joseph', 'Hannah', 'Noel', 'Patricia'])[1 + (customer_id % 8)] AS fname,
    CASE
      WHEN last_name <> '' THEN last_name
      ELSE 'Santos'
    END AS lname,
    '+63 918 ' || LPAD((1000000 + customer_id * 37)::TEXT, 7, '0') AS phone,
    (ARRAY['Assistant Manager', 'Spouse', 'Operations Staff', 'Accountant', 'Relative', 'Store Supervisor', 'Partner', 'Clerk'])[1 + (customer_id % 8)] AS relationship
  FROM customers
) picks
WHERE c.customer_id = picks.customer_id
  AND (c.secondary_contact_fname IS NULL OR TRIM(c.secondary_contact_fname) = '')
  AND picks.fname IS DISTINCT FROM c.contact_person_fname;

-- If primary contact shares the picked first name, use an alternate secondary name.
UPDATE customers c
SET
  secondary_contact_fname = 'Andrea',
  secondary_contact_lname = COALESCE(NULLIF(TRIM(c.last_name), ''), 'Lopez'),
  secondary_contact_phone = '+63 918 ' || LPAD((2000000 + c.customer_id * 41)::TEXT, 7, '0'),
  secondary_contact_relationship = 'Assistant Manager'
WHERE (c.secondary_contact_fname IS NULL OR TRIM(c.secondary_contact_fname) = '')
   OR c.secondary_contact_fname = c.contact_person_fname;

CREATE OR REPLACE FUNCTION assign_customer_code_after_insert()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE customers
  SET customer_code = 'C-' || LPAD(NEW.customer_id::TEXT, 3, '0') || '-' || TO_CHAR(COALESCE(NEW.created_at, CURRENT_TIMESTAMP), 'YYYY')
  WHERE customer_id = NEW.customer_id
    AND (customer_code IS NULL OR TRIM(customer_code) = '');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_customers_assign_code ON customers;
CREATE TRIGGER trg_customers_assign_code
  AFTER INSERT ON customers
  FOR EACH ROW
  EXECUTE FUNCTION assign_customer_code_after_insert();

UPDATE customers c
SET territory_id = t.territory_id
FROM (
  SELECT DISTINCT ON (branch_id) territory_id, branch_id
  FROM territories
  ORDER BY branch_id, territory_id
) t
WHERE c.territory_id IS NULL
  AND c.branch_id = t.branch_id;
