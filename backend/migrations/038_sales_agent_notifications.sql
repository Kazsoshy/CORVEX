-- Sales agent inbox seeds (Davao City focus, idempotent)
BEGIN;

INSERT INTO notifications (user_id, title, message, status, category, created_at)
SELECT u.id, v.title, v.message, v.status, v.category, v.created_at
FROM users u
CROSS JOIN (
  VALUES
    ('Schedule update', 'You have sales visits scheduled for today in Davao City.', 'Unread', 'Schedule', NOW() - INTERVAL '1 hour'),
    ('Purchase request', 'A customer submitted a new purchase request for review.', 'Unread', 'Sales', NOW() - INTERVAL '3 hours'),
    ('Low stock', 'A catalog SKU at your branch is below reorder point.', 'Unread', 'Stock', NOW() - INTERVAL '5 hours'),
    ('CI update', 'A credit investigation you submitted is pending branch approval.', 'Read', 'CI', NOW() - INTERVAL '1 day')
) AS v(title, message, status, category, created_at)
WHERE LOWER(u.email) = 'jane.s@corvex.ph'
  AND NOT EXISTS (
    SELECT 1 FROM notifications n WHERE n.user_id = u.id AND n.title = v.title
  );

COMMIT;
