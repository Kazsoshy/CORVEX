-- ============================================================
-- CORVEX Database Reset Script
-- This script drops the existing database and recreates it
-- with the new schema and seed data
-- ============================================================

-- Drop existing database
DROP DATABASE IF EXISTS corvex;

-- Create new database
CREATE DATABASE corvex;

-- Connect to the new database
\c corvex

-- Run the initial schema
\i backend/migrations/001_initial_schema.sql

-- Run the seed data
\i backend/migrations/002_seed_data.sql

-- Display completion message
SELECT 'Database reset completed successfully!' AS status;
