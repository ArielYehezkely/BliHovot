-- Add 'debt_simplified' to the notification type check constraint
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('debt_added', 'debt_reduced', 'debt_simplified'));
