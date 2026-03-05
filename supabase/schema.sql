-- ============================================
-- BliHovot Database Schema
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL DEFAULT 'User',
  avatar_url TEXT,
  language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'he')),
  preferred_currency TEXT NOT NULL DEFAULT 'ILS',
  push_subscription JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Transactions table (append-only ledger)
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debtor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  creditor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'ILS',
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL CHECK (type IN ('debt', 'payment')),
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Ensure debtor and creditor are different people
  CONSTRAINT different_parties CHECK (debtor_id != creditor_id)
);

-- 3. Balances table (materialized net balances, updated by trigger)
CREATE TABLE IF NOT EXISTS balances (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  other_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  currency TEXT NOT NULL DEFAULT 'ILS',
  amount NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, other_user_id, currency),
  CONSTRAINT different_balance_parties CHECK (user_id != other_user_id)
);

-- 4. Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('debt_added', 'debt_reduced', 'debt_simplified')),
  data JSONB NOT NULL DEFAULT '{}',
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- Indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_transactions_debtor ON transactions(debtor_id);
CREATE INDEX IF NOT EXISTS idx_transactions_creditor ON transactions(creditor_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_balances_user ON balances(user_id);
CREATE INDEX IF NOT EXISTS idx_balances_other ON balances(other_user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id) WHERE read = FALSE;
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles(phone_number);

-- ============================================
-- Row Level Security (RLS)
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Profiles: anyone can read, only own profile can be updated
CREATE POLICY "Profiles are viewable by authenticated users"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Transactions: viewable by either party
CREATE POLICY "Users can view their own transactions"
  ON transactions FOR SELECT
  TO authenticated
  USING (
    auth.uid() = debtor_id OR auth.uid() = creditor_id
  );

-- Transactions INSERT: enforced creation rules
-- Rule 1: For debts, you can only add yourself as the debtor (created_by = debtor_id)
-- Rule 2: For payments, you can only mark payment if you're the creditor (created_by = creditor_id)
CREATE POLICY "Users can create valid transactions"
  ON transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND (
      (type = 'debt' AND created_by = debtor_id)
      OR
      (type = 'payment' AND created_by = creditor_id)
    )
  );

-- Transactions: No UPDATE or DELETE (append-only)
-- (No policies created for UPDATE/DELETE means they're blocked by default with RLS enabled)

-- Balances: users can read their own rows, trigger handles writes
CREATE POLICY "Users can view their own balances"
  ON balances FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Notifications: users can only see their own
CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Notifications: system inserts (via trigger/function) need service role
-- We allow authenticated insert for now; in production, use a trigger
CREATE POLICY "System can insert notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================
-- Trigger: auto-create notification on transaction insert
-- ============================================

CREATE OR REPLACE FUNCTION notify_on_transaction()
RETURNS TRIGGER AS $$
DECLARE
  other_user_id UUID;
  creator_name TEXT;
  notif_type TEXT;
BEGIN
  -- Determine the other party and notification type
  IF NEW.type = 'debt' THEN
    other_user_id := NEW.creditor_id;
    notif_type := 'debt_added';
  ELSE
    other_user_id := NEW.debtor_id;
    notif_type := 'debt_reduced';
  END IF;

  -- Get creator's name
  SELECT display_name INTO creator_name
  FROM profiles
  WHERE id = NEW.created_by;

  -- Insert notification
  INSERT INTO notifications (user_id, type, data)
  VALUES (
    other_user_id,
    notif_type,
    jsonb_build_object(
      'amount', NEW.amount,
      'currency', NEW.currency,
      'from_user_id', NEW.created_by,
      'from_user_name', COALESCE(creator_name, 'User'),
      'description', NEW.description
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_transaction_insert
  AFTER INSERT ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_transaction();

-- ============================================
-- Trigger: update balances table on transaction insert
-- ============================================

CREATE OR REPLACE FUNCTION update_balances_on_transaction()
RETURNS TRIGGER AS $$
DECLARE
  delta NUMERIC;
BEGIN
  -- For debt: debtor owes creditor → negative for debtor, positive for creditor
  -- For payment: reduces debt → positive for debtor, negative for creditor
  IF NEW.type = 'debt' THEN
    delta := NEW.amount;
  ELSE
    delta := -NEW.amount;
  END IF;

  -- Update debtor's view: debtor → creditor (negative = user owes other)
  INSERT INTO balances (user_id, other_user_id, currency, amount, updated_at)
  VALUES (NEW.debtor_id, NEW.creditor_id, NEW.currency, -delta, NOW())
  ON CONFLICT (user_id, other_user_id, currency)
  DO UPDATE SET amount = balances.amount - delta, updated_at = NOW();

  -- Update creditor's view: creditor → debtor (positive = other owes user)
  INSERT INTO balances (user_id, other_user_id, currency, amount, updated_at)
  VALUES (NEW.creditor_id, NEW.debtor_id, NEW.currency, delta, NOW())
  ON CONFLICT (user_id, other_user_id, currency)
  DO UPDATE SET amount = balances.amount + delta, updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_transaction_update_balances
  AFTER INSERT ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_balances_on_transaction();

-- ============================================
-- RPC: get group balances for cycle detection
-- ============================================

CREATE OR REPLACE FUNCTION get_group_balances(p_user_ids UUID[])
RETURNS TABLE (
  user_id UUID,
  other_user_id UUID,
  currency TEXT,
  amount NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT b.user_id, b.other_user_id, b.currency, b.amount
  FROM balances b
  WHERE b.user_id = ANY(p_user_ids)
    AND b.other_user_id = ANY(p_user_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Enable Realtime
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
