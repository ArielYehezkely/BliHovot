# Circular Debt Simplification

## Feature Overview

The **Smart Suggestions** page (`/advanced`) detects circular debts among the current user and their contacts and proposes simplified settlements that reduce the total number of debts without creating any new relationships between users.

### When Is It Available?

A suggestion appears only when **all** of the following are true:

1. Three or more users form a directed cycle of debts in the same currency (e.g. A→B→C→A).
2. The current user is part of the cycle.
3. The simplified result uses **fewer** debt edges than the current state.
4. Every debt in the proposed simplification is between a pair of users who **already** have a transaction history — no new debts between strangers.

---

## Algorithm

The algorithm is implemented in `src/lib/debtSimplification.ts` and consists of four stages. The key design choice is that we **do not build a graph for all users** — instead we start from the current user, follow their outgoing debt edges, and build a tree that stops when it circles back.

### Stage 1 — Build Debt Graph From Transactions

**Function:** `buildDebtGraph(transactions, currency)`

For a given currency, iterate over all transactions and accumulate what each user owes every other user. Only users that actually appear in transactions are added to the graph — no pre-populated user list needed.

```
for each transaction (in this currency):
  ensure debtor and creditor exist in graph
  if type == 'debt':   netOwes[debtor][creditor] += amount
  if type == 'payment': netOwes[debtor][creditor] -= amount
```

Then **normalize** each pair so only one direction is positive:

```
for each pair (A, B) in the graph:
  net = netOwes[A][B] - netOwes[B][A]
  if net > 0:  A owes B |net|,  B owes A = 0
  else:        B owes A |net|,  A owes B = 0
```

**Output:** A directed graph where edge weight `netOwes[A][B] > 0` means "A currently owes B that amount in this currency."

### Stage 2 — Traverse From Current User (Rooted DFS)

**Function:** `findCyclesFromUser(netOwes, currentUserId)`

Instead of searching from every user, we start a single DFS rooted at `currentUserId` and follow only outgoing debt edges ("who does each user owe?"):

```
DFS(current = currentUserId, path = [currentUserId])
  for each (next, amount) in netOwes[current]:
    if amount < 0.01: skip  (no meaningful debt)

    if next == currentUserId and path.length >= 3:
      → cycle found! record path
    else if next not in path:
      → push next, recurse, pop (continue building the tree)
```

The traversal naturally builds a **tree of debts** rooted at the current user. Branches are pruned when:
- There is no outgoing edge with a meaningful amount.
- A node was already visited on the current path (avoid loops within a branch).
- The path circles back to the current user (cycle found — record and stop that branch).

**Deduplication:** Cycles are normalized by rotating the lexicographically smallest user ID to the front, then compared as strings. This ensures `[A,B,C]` and `[B,C,A]` are treated as the same cycle.

### Stage 3 — Compute Net Positions Within a Cycle

For each detected cycle, compute each user's **net position** — the sum of what flows in minus what flows out along the cycle edges only:

```
Example: A→B: 100, B→C: 50, C→A: 100

Net positions:
  A = -100 (owes B) + 100 (from C) =   0
  B = +100 (from A) -  50 (owes C) = +50  (creditor)
  C =  +50 (from B) - 100 (owes A) = -50  (debtor)
```

Users with net < 0 are **debtors**; users with net > 0 are **creditors**; users with net ≈ 0 are fully offset and drop out.

### Stage 4 — Propose Simplified Debts

Match debtors to creditors greedily:

```
while debtors and creditors remain:
  take first debtor D and first creditor C
  settle_amount = min(D.amount, C.amount)
  if relationship(D, C) does not exist → abort (no new relationships)
  add suggested debt: D → C for settle_amount
  reduce both by settle_amount; remove if exhausted
```

**Constraint check:** If any proposed debt would be between users who have no existing transaction history, the entire suggestion is discarded.

**Improvement check:** If the number of suggested debts ≥ the number of current debts, there is no simplification benefit and the suggestion is discarded.

---

## Worked Example

### Initial State

| From  | To    | Amount | Currency |
|-------|-------|--------|----------|
| Alice | Dev   | 130    | ILS      |
| Dev   | Carol | 85     | ILS      |
| Carol | Alice | 100    | ILS      |

This forms the cycle: **Alice → Dev → Carol → Alice**.

### Net Positions

| User  | Outflow | Inflow | Net   | Role     |
|-------|---------|--------|-------|----------|
| Alice | 130     | 100    | −30   | Debtor   |
| Dev   | 85      | 130    | +45   | Creditor |
| Carol | 100     | 85     | −15   | Debtor   |

### Simplified Result

| From  | To  | Amount | Currency |
|-------|-----|--------|----------|
| Alice | Dev | 30     | ILS      |
| Carol | Dev | 15     | ILS      |

**Result:** 3 debts → 2 debts (1 eliminated). All pairs already had existing relationships.

---

## Applying a Suggestion (UI Flow)

When the user taps **Apply Simplification**:

1. For each **current debt** in the cycle, a `payment` transaction is created to zero it out.
2. For each **suggested debt**, a new `debt` transaction is created.
3. The contacts list is refreshed to reflect updated balances.

This preserves full transaction history — the original debts are not deleted, they are settled via payments and replaced with new, simpler debts.

---

## Constraints & Design Decisions

| Constraint | Reason |
|---|---|
| No new relationships | Users should not suddenly see debts from/to people they've never interacted with. |
| Per-currency analysis | Debts in different currencies are not mixed or converted. |
| Current user must be in cycle | Only show suggestions relevant to the logged-in user. |
| Minimum 3 edges | A "cycle" of 2 is just a mutual debt, handled differently. |
| Greedy matching | Simple and predictable; optimal matching is not required for small groups. |

---

## Files

| File | Purpose |
|---|---|
| `src/lib/debtSimplification.ts` | Core algorithm (cycle detection, net positions, simplification) |
| `src/pages/AdvancedPage.tsx` | UI — Smart Suggestions page |
| `src/lib/api.ts` | Barrel export for `getGroupTransactions` |
| `src/lib/mockApi.ts` | Mock implementation of `getGroupTransactions` |
| `src/lib/api.real.ts` | Supabase implementation of `getGroupTransactions` |
| `src/lib/mockData.ts` | Seed data with a circular debt scenario |
| `src/locales/en.json` / `he.json` | Translations (`advanced.*` keys) |
| `src/components/BottomNav.tsx` | Navigation tab (Lightbulb icon) |
| `src/App.tsx` | Route registration (`/advanced`) |
