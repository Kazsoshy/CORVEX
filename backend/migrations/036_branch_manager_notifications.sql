-- Branch manager inbox seeds (idempotent)
BEGIN;

INSERT INTO notifications (user_id, title, message, status, category, created_at)
SELECT u.id, v.title, v.message, v.status, v.category, v.created_at
FROM users u
JOIN roles r ON r.role_id = u.role_id
CROSS JOIN (
  VALUES
    ('CI pending review', 'New credit investigation submissions are waiting in your queue.', 'Unread', 'CI', NOW() - INTERVAL '2 hours'),
    ('Low stock alert', 'Branch inventory has SKUs below reorder point.', 'Unread', 'Inventory', NOW() - INTERVAL '4 hours'),
    ('Route compliance', 'One or more collector routes need follow-up today.', 'Read', 'Route', NOW() - INTERVAL '1 day')
) AS v(title, message, status, category, created_at)
WHERE r.slug = 'branch_manager' AND u.status = 'Active'
  AND NOT EXISTS (
    SELECT 1 FROM notifications n WHERE n.user_id = u.id AND n.title = v.title
  );

COMMIT;
