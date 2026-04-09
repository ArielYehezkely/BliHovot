-- ============================================
-- Migration: Add debt_requests table for pending debt claims
-- ============================================

-- 1. Create the debt_requests table
CREATE TABLE IF NOT EXISTS debt_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creditor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  debtor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'ILS',
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  CONSTRAINT different_request_parties CHECK (creditor_id != debtor_id)
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_debt_requests_creditor ON debt_requests(creditor_id);
CREATE INDEX IF NOT EXISTS idx_debt_requests_debtor ON debt_requests(debtor_id);
CREATE INDEX IF NOT EXISTS idx_debt_requests_status ON debt_requests(status) WHERE status = 'pending';

-- 3. RLS
ALTER TABLE debt_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own debt requests"
  ON debt_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = creditor_id OR auth.uid() = debtor_id);

CREATE POLICY "Creditors can create debt requests"
  ON debt_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = creditor_id);

CREATE POLICY "Debtors can update (approve/reject) their own debt requests"
  ON debt_requests FOR UPDATE
  TO authenticated
  USING (auth.uid() = debtor_id AND status = 'pending')
  WITH CHECK (auth.uid() = debtor_id AND status IN ('approved', 'rejected'));

-- 4. Update notification type constraint to include new types
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('debt_added', 'debt_reduced', 'debt_simplified', 'debt_request', 'debt_request_approved', 'debt_request_rejected'));

-- 5. Enable realtime for debt_requests
ALTER PUBLICATION supabase_realtime ADD TABLE debt_requests;
