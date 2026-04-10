-- ============================================
-- Migration: Single canonical row per user-pair in balances
-- Enforces user_id < other_user_id so there is one source of truth.
-- Amount is from user_id's perspective:
--   positive = other_user_id owes user_id
--   negative = user_id owes other_user_id
-- ============================================

-- 1. Collapse duplicate rows: keep one canonical row per pair
--    For each (A, B) where A < B, merge rows (A,B) and (B,A)
--    into a single (A,B) summing amounts correctly.
DELETE FROM balances;

INSERT INTO balances (user_id, other_user_id, currency, amount, updated_at)
SELECT
  LEAST(t.debtor_id, t.creditor_id) AS user_id,
  GREATEST(t.debtor_id, t.creditor_id) AS other_user_id,
  t.currency,
  SUM(
    CASE
      -- From user_id (=LEAST)'s perspective:
      -- If LEAST is the creditor → positive (other owes me)
      -- If LEAST is the debtor   → negative (I owe other)
      WHEN t.type = 'debt' AND t.creditor_id = LEAST(t.debtor_id, t.creditor_id) THEN t.amount
      WHEN t.type = 'debt' AND t.debtor_id   = LEAST(t.debtor_id, t.creditor_id) THEN -t.amount
      WHEN t.type = 'payment' AND t.creditor_id = LEAST(t.debtor_id, t.creditor_id) THEN -t.amount
      WHEN t.type = 'payment' AND t.debtor_id   = LEAST(t.debtor_id, t.creditor_id) THEN t.amount
    END
  ) AS amount,
  NOW() AS updated_at
FROM transactions t
GROUP BY LEAST(t.debtor_id, t.creditor_id), GREATEST(t.debtor_id, t.creditor_id), t.currency;

-- 2. Add constraint: user_id must be the lexicographically smaller UUID
ALTER TABLE balances
  DROP CONSTRAINT IF EXISTS canonical_pair_order;

ALTER TABLE balances
  ADD CONSTRAINT canonical_pair_order CHECK (user_id < other_user_id);

-- 3. Replace the trigger function: write a single canonical row
CREATE OR REPLACE FUNCTION update_balances_on_transaction()
RETURNS TRIGGER AS $$
DECLARE
  delta NUMERIC;
  low_id UUID;
  high_id UUID;
  sign_factor NUMERIC;
BEGIN
  -- delta = how much more the creditor is owed after this transaction
  IF NEW.type = 'debt' THEN
    delta := NEW.amount;
  ELSE
    delta := -NEW.amount;
  END IF;

  -- Canonical ordering: low_id < high_id
  IF NEW.creditor_id < NEW.debtor_id THEN
    low_id := NEW.creditor_id;
    high_id := NEW.debtor_id;
    sign_factor := 1;   -- low_id is the creditor, so amount grows (positive = other owes me)
  ELSE
    low_id := NEW.debtor_id;
    high_id := NEW.creditor_id;
    sign_factor := -1;  -- low_id is the debtor, so amount shrinks (negative = I owe other)
  END IF;

  INSERT INTO balances (user_id, other_user_id, currency, amount, updated_at)
  VALUES (low_id, high_id, NEW.currency, sign_factor * delta, NOW())
  ON CONFLICT (user_id, other_user_id, currency)
  DO UPDATE SET amount = balances.amount + sign_factor * delta, updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Update RLS: allow SELECT when user is either side of the pair
DROP POLICY IF EXISTS "Users can view their own balances" ON balances;
CREATE POLICY "Users can view their own balances"
  ON balances FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = other_user_id);

-- 5. Replace get_group_balances RPC: return both directions so
--    callers see the same interface as before (directed edges).
CREATE OR REPLACE FUNCTION get_group_balances(p_user_ids UUID[])
RETURNS TABLE (
  user_id UUID,
  other_user_id UUID,
  currency TEXT,
  amount NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  -- Canonical direction
  SELECT b.user_id, b.other_user_id, b.currency, b.amount
  FROM balances b
  WHERE b.user_id = ANY(p_user_ids)
    AND b.other_user_id = ANY(p_user_ids)
  UNION ALL
  -- Reverse direction (flipped sign)
  SELECT b.other_user_id, b.user_id, b.currency, -b.amount
  FROM balances b
  WHERE b.user_id = ANY(p_user_ids)
    AND b.other_user_id = ANY(p_user_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
