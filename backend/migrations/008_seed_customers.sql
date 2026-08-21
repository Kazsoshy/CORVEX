-- ============================================================
-- CORVEX Database Seed Data — Customers (All Branches)
-- Migration: 008_seed_customers.sql
-- ============================================================

BEGIN;

INSERT INTO customers (branch_id, first_name, last_name, address, latitude, longitude,
                      contact_phone, contact_person_fname, contact_person_lname, contact_person_phone, status)
SELECT
  (SELECT id FROM branches WHERE name = 'Davao City Branch'),
  'Rosa', 'Imperial',
  '123 Rizal Street, Davao City',
  7.0731, 125.6128,
  '+63 917 111 2233',
  'Rosa', 'Imperial',
  '+63 917 111 2233',
  'Active'
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE first_name = 'Rosa' AND last_name = 'Imperial');

INSERT INTO customers (branch_id, first_name, last_name, address, latitude, longitude,
                      contact_phone, contact_person_fname, contact_person_lname, contact_person_phone, status)
SELECT
  (SELECT id FROM branches WHERE name = 'Davao City Branch'),
  'Danny', 'Cabrera',
  '45 C.M. Recto Ave, Davao City',
  7.0815, 125.6080,
  '+63 920 222 3344',
  'Danny', 'Cabrera',
  '+63 920 222 3344',
  'Active'
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE first_name = 'Danny' AND last_name = 'Cabrera');

INSERT INTO customers (branch_id, first_name, last_name, address, latitude, longitude,
                      contact_phone, contact_person_fname, contact_person_lname, contact_person_phone, status)
SELECT
  (SELECT id FROM branches WHERE name = 'Davao City Branch'),
  'Teresa', 'Ong',
  '78 San Pedro St, Davao City',
  7.0705, 125.6105,
  '+63 918 333 4455',
  'Teresa', 'Ong',
  '+63 918 333 4455',
  'Active'
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE first_name = 'Teresa' AND last_name = 'Ong');

INSERT INTO customers (branch_id, first_name, last_name, address, latitude, longitude,
                      contact_phone, contact_person_fname, contact_person_lname, contact_person_phone, status)
SELECT
  (SELECT id FROM branches WHERE name = 'Davao City Branch'),
  'Nestor', 'Chavez',
  '22 Quirino Ave, Davao City',
  7.0750, 125.6150,
  '+63 919 444 5566',
  'Nestor', 'Chavez',
  '+63 919 444 5566',
  'Inactive'
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE first_name = 'Nestor' AND last_name = 'Chavez');

INSERT INTO customers (branch_id, first_name, last_name, address, latitude, longitude,
                      contact_phone, contact_person_fname, contact_person_lname, contact_person_phone, status)
SELECT
  (SELECT id FROM branches WHERE name = 'General Santos Branch'),
  'Nina', 'Abad',
  '120 Pioneer Ave, General Santos City',
  6.1164, 125.1756,
  '+63 917 777 8899',
  'Nina', 'Abad',
  '+63 917 777 8899',
  'Active'
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE first_name = 'Nina' AND last_name = 'Abad');

INSERT INTO customers (branch_id, first_name, last_name, address, latitude, longitude,
                      contact_phone, contact_person_fname, contact_person_lname, contact_person_phone, status)
SELECT
  (SELECT id FROM branches WHERE name = 'General Santos Branch'),
  'Gabriel', 'Sison',
  '156 Magsaysay Ave, General Santos City',
  6.1200, 125.1800,
  '+63 920 888 9900',
  'Gabriel', 'Sison',
  '+63 920 888 9900',
  'Active'
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE first_name = 'Gabriel' AND last_name = 'Sison');

INSERT INTO customers (branch_id, first_name, last_name, address, latitude, longitude,
                      contact_phone, contact_person_fname, contact_person_lname, contact_person_phone, status)
SELECT
  (SELECT id FROM branches WHERE name = 'General Santos Branch'),
  'Elena', 'Pascual',
  '88 Santiago Blvd, General Santos City',
  6.1150, 125.1700,
  '+63 918 555 6677',
  'Elena', 'Pascual',
  '+63 918 555 6677',
  'Active'
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE first_name = 'Elena' AND last_name = 'Pascual');

INSERT INTO customers (branch_id, first_name, last_name, address, latitude, longitude,
                      contact_phone, contact_person_fname, contact_person_lname, contact_person_phone, status)
SELECT
  (SELECT id FROM branches WHERE name = 'Davao Oriental Branch'),
  'Karen', 'Yu',
  '88 Dahican Road, Mati City',
  6.9564, 126.2219,
  '+63 917 123 4567',
  'Karen', 'Yu',
  '+63 917 123 4567',
  'Active'
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE first_name = 'Karen' AND last_name = 'Yu');

INSERT INTO customers (branch_id, first_name, last_name, address, latitude, longitude,
                      contact_phone, contact_person_fname, contact_person_lname, contact_person_phone, status)
SELECT
  (SELECT id FROM branches WHERE name = 'Davao Oriental Branch'),
  'Cesar', 'Dominguez',
  '12 Rizal St, Mati City',
  6.9550, 126.2200,
  '+63 920 234 5678',
  'Cesar', 'Dominguez',
  '+63 920 234 5678',
  'Inactive'
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE first_name = 'Cesar' AND last_name = 'Dominguez');

INSERT INTO customers (branch_id, first_name, last_name, address, latitude, longitude,
                      contact_phone, contact_person_fname, contact_person_lname, contact_person_phone, status)
SELECT
  (SELECT id FROM branches WHERE name = 'Davao Oriental Branch'),
  'Ferdinand', 'Uy',
  '34 Poblacion St, Mati City',
  6.9570, 126.2230,
  '+63 919 456 7890',
  'Ferdinand', 'Uy',
  '+63 919 456 7890',
  'Active'
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE first_name = 'Ferdinand' AND last_name = 'Uy');

COMMIT;
