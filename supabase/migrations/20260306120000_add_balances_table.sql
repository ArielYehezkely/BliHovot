-- ============================================
-- Migration: Add materialized balances table
-- ============================================

-- 1. Create the balances table
CREATE TABLE IF NOT EXISTS balances (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  other_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  currency TEXT NOT NULL DEFAULT 'ILS',
  amount NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, other_user_id, currency),
  CONSTRAINT different_balance_parties CHECK (user_id != other_user_id)
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_balances_user ON balances(user_id);
CREATE INDEX IF NOT EXISTS idx_balances_other ON balances(other_user_id);

-- 3. RLS
ALTER TABLE balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own balances" ON balances;
CREATE POLICY "Users can view their own balances"
  ON balances FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 4. Trigger: update balances on every transaction insert
CREATE OR REPLACE FUNCTION update_balances_on_transaction()
RETURNS TRIGGER AS $$
DECLARE
  delta NUMERIC;
BEGIN
  IF NEW.type = 'debt' THEN
    delta := NEW.amount;
  ELSE
    delta := -NEW.amount;
  END IF;

  -- Debtor's view: negative = user owes other
  INSERT INTO balances (user_id, other_user_id, currency, amount, updated_at)
  VALUES (NEW.debtor_id, NEW.creditor_id, NEW.currency, -delta, NOW())
  ON CONFLICT (user_id, other_user_id, currency)
  DO UPDATE SET amount = balances.amount - delta, updated_at = NOW();

  -- Creditor's view: positive = other owes user
  INSERT INTO balances (user_id, other_user_id, currency, amount, updated_at)
  VALUES (NEW.creditor_id, NEW.debtor_id, NEW.currency, delta, NOW())
  ON CONFLICT (user_id, other_user_id, currency)
  DO UPDATE SET amount = balances.amount + delta, updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_transaction_update_balances ON transactions;
CREATE TRIGGER on_transaction_update_balances
  AFTER INSERT ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_balances_on_transaction();

-- 5. Backfill: populate balances from existing transactions
INSERT INTO balances (user_id, other_user_id, currency, amount, updated_at)
SELECT
  debtor_id AS user_id,
  creditor_id AS other_user_id,
  currency,
  -SUM(CASE WHEN type = 'debt' THEN amount ELSE -amount END) AS amount,
  NOW() AS updated_at
FROM transactions
GROUP BY debtor_id, creditor_id, currency
ON CONFLICT (user_id, other_user_id, currency)
DO UPDATE SET amount = EXCLUDED.amount, updated_at = NOW();

INSERT INTO balances (user_id, other_user_id, currency, amount, updated_at)
SELECT
  creditor_id AS user_id,
  debtor_id AS other_user_id,
  currency,
  SUM(CASE WHEN type = 'debt' THEN amount ELSE -amount END) AS amount,
  NOW() AS updated_at
FROM transactions
GROUP BY creditor_id, debtor_id, currency
ON CONFLICT (user_id, other_user_id, currency)
DO UPDATE SET amount = EXCLUDED.amount, updated_at = NOW();

-- 6. RPC: get group balances for cycle detection (bypasses RLS)
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
