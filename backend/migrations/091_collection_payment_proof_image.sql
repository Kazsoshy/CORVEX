-- 091_collection_payment_proof_image.sql
-- Optional GCash / collection payment proof photo (data URL or image text),
-- same storage pattern as customer id_photo. Used by Spot Cash GCash Log Sale.

ALTER TABLE collection_payment
  ADD COLUMN IF NOT EXISTS payment_proof_image TEXT;
