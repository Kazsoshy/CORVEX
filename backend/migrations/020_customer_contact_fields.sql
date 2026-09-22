-- Sales Agent customer module: optional public code, contact relationships, secondary contact

ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_code VARCHAR(30) UNIQUE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_person_relationship VARCHAR(80);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS secondary_contact_fname VARCHAR(100);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS secondary_contact_lname VARCHAR(100);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS secondary_contact_phone VARCHAR(30);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS secondary_contact_relationship VARCHAR(80);

UPDATE customers
SET customer_code = 'C-' || LPAD(customer_id::TEXT, 3, '0') || '-' || TO_CHAR(created_at, 'YYYY')
WHERE customer_code IS NULL;
