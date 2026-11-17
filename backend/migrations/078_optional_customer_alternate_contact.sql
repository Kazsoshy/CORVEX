-- Alternate contacts are optional for customer registration.
-- Credit review may request supporting contact information based on policy,
-- but cash-only registration must not require a separate contact.
ALTER TABLE customers
  ALTER COLUMN contact_person_fname DROP NOT NULL,
  ALTER COLUMN contact_person_lname DROP NOT NULL,
  ALTER COLUMN contact_person_phone DROP NOT NULL;
