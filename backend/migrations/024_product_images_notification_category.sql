-- Product images + notification categories (warehouse / collector UI)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS image_url VARCHAR(500);

UPDATE products
SET image_url = COALESCE(
  image_url,
  'https://placehold.co/80x80/e2e8f0/475569?text=' || REPLACE(SUBSTRING(name FROM 1 FOR 2), ' ', '+')
)
WHERE image_url IS NULL OR TRIM(image_url) = '';

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS category VARCHAR(50);

UPDATE notifications
SET category = COALESCE(NULLIF(TRIM(category), ''), 'General')
WHERE category IS NULL OR TRIM(category) = '';

-- Seed warehouse notifications for inventory staff (once per user if none exist)
INSERT INTO notifications (user_id, title, message, status, category, created_at)
SELECT
  u.id,
  v.title,
  v.message,
  v.status,
  v.category,
  v.created_at
FROM users u
JOIN roles r ON r.role_id = u.role_id
CROSS JOIN (
  VALUES
    ('Critical stock alert', 'Queen Size Bed Frame at Davao City Branch is critically low (4 units).', 'Unread', 'Critical', NOW() - INTERVAL '2 hours'),
    ('Low stock alert', '6-Seater Dining Table Set below reorder point at Davao City Branch.', 'Unread', 'Low Stock', NOW() - INTERVAL '3 hours'),
    ('Transfer approval required', 'Transfer TRF-2026-0001 pending approval.', 'Unread', 'Transfers', NOW() - INTERVAL '5 hours'),
    ('Restock confirmed', 'Restock delivery recorded for Sofa Set 3-Seater (10 units).', 'Read', 'Restocks', NOW() - INTERVAL '2 days'),
    ('Forecast stockout warning', 'Ergonomic Office Chair predicted stockout — reorder recommended.', 'Read', 'Forecast', NOW() - INTERVAL '1 day')
) AS v(title, message, status, category, created_at)
WHERE r.slug = 'inventory_staff'
  AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.user_id = u.id);
