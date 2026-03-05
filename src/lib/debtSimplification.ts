/**
 * Circular debt detection and simplification algorithm.
 *
 * Starts from the current user, follows outgoing debt edges ("who do I owe?"),
 * then continues from each of those users following *their* outgoing edges,
 * building a tree. If the traversal reaches back to the current user we have
 * found a cycle that can potentially be simplified.
 *
 * Example: A owes B 100, B owes C 50, C owes A 100
 *   → Net positions: A=0, B=+50, C=-50
 *   → Simplified: C owes B 50 (eliminates 2 debts)
 */
import type { Transaction } from '../types'

export interface DebtEdge {
  from: string
  to: string
  amount: number
  currency: string
}

export interface BalanceEdge {
  user_id: string
  other_user_id: string
  currency: string
  amount: number // negative = user owes other, positive = other owes user
}

export interface CircularDebtSuggestion {
  cycleUserIds: string[]
  currency: string
  currentDebts: DebtEdge[]
  suggestedDebts: DebtEdge[]
  eliminatedDebts: number
}

/**
 * Build a directed debt graph from transactions for a given currency.
 * Only considers users reachable from the current user.
 *
 * Returns netOwes where netOwes[A][B] > 0 means A currently owes B that amount.
 * Edges are normalized so only one direction per pair is positive.
 */
function buildDebtGraph(
  transactions: Transaction[],
  currency: string
): Map<string, Map<string, number>> {
  const netOwes = new Map<string, Map<string, number>>()

  const ensureUser = (uid: string) => {
    if (!netOwes.has(uid)) netOwes.set(uid, new Map())
  }

  for (const tx of transactions) {
    if (tx.currency !== currency) continue
    ensureUser(tx.debtor_id)
    ensureUser(tx.creditor_id)

    const fromMap = netOwes.get(tx.debtor_id)!
    const current = fromMap.get(tx.creditor_id) ?? 0

    if (tx.type === 'debt') {
      fromMap.set(tx.creditor_id, current + tx.amount)
    } else {
      fromMap.set(tx.creditor_id, current - tx.amount)
    }
  }

  // Normalize each pair so only one direction is positive
  const users = [...netOwes.keys()]
  for (let i = 0; i < users.length; i++) {
    for (let j = i + 1; j < users.length; j++) {
      const a = users[i]
      const b = users[j]
      const aToB = netOwes.get(a)?.get(b) ?? 0
      const bToA = netOwes.get(b)?.get(a) ?? 0
      const net = aToB - bToA
      if (net > 0) {
        netOwes.get(a)!.set(b, net)
        netOwes.get(b)!.set(a, 0)
      } else {
        netOwes.get(a)!.set(b, 0)
        netOwes.get(b)!.set(a, Math.abs(net))
      }
    }
  }

  return netOwes
}

/**
 * Starting from the current user, traverse outgoing debt edges (who does each
 * user owe?) and collect all simple cycles that lead back to the start.
 *
 * The traversal is a DFS tree rooted at currentUserId. We only follow edges
 * where netOwes[current][next] > 0. When we reach currentUserId again with
 * path length ≥ 3 we record the cycle.
 */
function findCyclesFromUser(
  netOwes: Map<string, Map<string, number>>,
  currentUserId: string
): string[][] {
  const cycles: string[][] = []

  function dfs(current: string, path: string[]): void {
    const edges = netOwes.get(current)
    if (!edges) return

    for (const [next, amount] of edges) {
      if (amount < 0.01) continue // no meaningful edge

      // Found a cycle back to start
      if (next === currentUserId && path.length >= 3) {
        cycles.push([...path])
        continue
      }

      // Only visit unvisited nodes (simple paths)
      if (!path.includes(next)) {
        path.push(next)
        dfs(next, path)
        path.pop()
      }
    }
  }

  dfs(currentUserId, [currentUserId])

  // Deduplicate cycles (same set of users in different rotations)
  const seen = new Set<string>()
  const unique: string[][] = []
  for (const cycle of cycles) {
    const key = normalizedCycleKey(cycle)
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(cycle)
    }
  }

  return unique
}

/**
 * Normalize a cycle for deduplication: rotate so lexicographically smallest
 * element is first, then join.
 */
function normalizedCycleKey(cycle: string[]): string {
  let minIdx = 0
  for (let i = 1; i < cycle.length; i++) {
    if (cycle[i] < cycle[minIdx]) minIdx = i
  }
  const rotated = [...cycle.slice(minIdx), ...cycle.slice(0, minIdx)]
  return rotated.join(',')
}

/**
 * Get the set of user-pairs that already have a transaction relationship.
 */
function getExistingRelationships(
  transactions: Transaction[],
  userIds: string[]
): Set<string> {
  const rels = new Set<string>()
  for (const tx of transactions) {
    if (userIds.includes(tx.debtor_id) && userIds.includes(tx.creditor_id)) {
      rels.add(`${tx.debtor_id}:${tx.creditor_id}`)
      rels.add(`${tx.creditor_id}:${tx.debtor_id}`)
    }
  }
  return rels
}

/**
 * Get the set of user-pairs that have a balance relationship.
 */
function getExistingRelationshipsFromBalances(
  balances: BalanceEdge[],
  userIds: string[]
): Set<string> {
  const rels = new Set<string>()
  for (const bal of balances) {
    if (userIds.includes(bal.user_id) && userIds.includes(bal.other_user_id)) {
      rels.add(`${bal.user_id}:${bal.other_user_id}`)
      rels.add(`${bal.other_user_id}:${bal.user_id}`)
    }
  }
  return rels
}

/**
 * Process discovered cycles into simplification suggestions.
 * Shared by both transaction-based and balance-based entry points.
 */
function processCycles(
  cycles: string[][],
  netOwes: Map<string, Map<string, number>>,
  relationships: Set<string>,
  currency: string
): CircularDebtSuggestion[] {
  const suggestions: CircularDebtSuggestion[] = []

  for (const cycle of cycles) {
    // Collect current debts along the cycle edges
    const currentDebts: DebtEdge[] = []
    for (let i = 0; i < cycle.length; i++) {
      const from = cycle[i]
      const to = cycle[(i + 1) % cycle.length]
      const amount = netOwes.get(from)?.get(to) ?? 0
      if (amount > 0.01) {
        currentDebts.push({ from, to, amount: Math.round(amount * 100) / 100, currency })
      }
    }

    if (currentDebts.length < 3) continue

    // Compute net position for each user within this cycle
    const netPositions = new Map<string, number>()
    for (const uid of cycle) netPositions.set(uid, 0)

    for (const debt of currentDebts) {
      netPositions.set(debt.from, (netPositions.get(debt.from) ?? 0) - debt.amount)
      netPositions.set(debt.to, (netPositions.get(debt.to) ?? 0) + debt.amount)
    }

    // Split into debtors (net < 0) and creditors (net > 0)
    const debtors: { id: string; amount: number }[] = []
    const creditors: { id: string; amount: number }[] = []
    for (const [uid, net] of netPositions) {
      if (net < -0.01) debtors.push({ id: uid, amount: Math.abs(net) })
      if (net > 0.01) creditors.push({ id: uid, amount: net })
    }

    // Propose simplified debts (only existing relationships)
    const suggestedDebts: DebtEdge[] = []
    let canSimplify = true

    const d = debtors.map((x) => ({ ...x }))
    const c = creditors.map((x) => ({ ...x }))

    while (d.length > 0 && c.length > 0) {
      const debtor = d[0]
      const creditor = c[0]

      if (!relationships.has(`${debtor.id}:${creditor.id}`)) {
        canSimplify = false
        break
      }

      const settleAmount = Math.min(debtor.amount, creditor.amount)
      suggestedDebts.push({
        from: debtor.id,
        to: creditor.id,
        amount: Math.round(settleAmount * 100) / 100,
        currency,
      })

      debtor.amount -= settleAmount
      creditor.amount -= settleAmount

      if (debtor.amount < 0.01) d.shift()
      if (creditor.amount < 0.01) c.shift()
    }

    if (!canSimplify) continue
    if (suggestedDebts.length >= currentDebts.length) continue

    suggestions.push({
      cycleUserIds: cycle,
      currency,
      currentDebts,
      suggestedDebts,
      eliminatedDebts: currentDebts.length - suggestedDebts.length,
    })
  }

  return suggestions
}

/**
 * Main entry point (transaction-based): find circular debt simplification suggestions.
 *
 * Algorithm:
 *   1. For each currency, build a directed debt graph from transactions.
 *   2. Starting from currentUserId, DFS along outgoing debt edges.
 *   3. When the traversal circles back to currentUserId → cycle found.
 *   4. Compute net positions within the cycle, propose simplified debts.
 *   5. Only keep suggestions that use existing relationships and reduce debt count.
 */
export function findCircularDebtSuggestions(
  transactions: Transaction[],
  _allUserIds: string[],
  currentUserId: string
): CircularDebtSuggestion[] {
  const suggestions: CircularDebtSuggestion[] = []
  const currencies = [...new Set(transactions.map((t) => t.currency))]

  for (const currency of currencies) {
    const netOwes = buildDebtGraph(transactions, currency)
    const cycles = findCyclesFromUser(netOwes, currentUserId)
    const relationships = getExistingRelationships(transactions, [...netOwes.keys()])
    suggestions.push(...processCycles(cycles, netOwes, relationships, currency))
  }

  return suggestions
}

/**
 * Build a directed debt graph directly from materialized balance rows.
 * netOwes[A][B] > 0 means A currently owes B that amount.
 * The balances table already stores both directions so no normalization needed.
 */
function buildDebtGraphFromBalances(
  balances: BalanceEdge[],
  currency: string
): Map<string, Map<string, number>> {
  const netOwes = new Map<string, Map<string, number>>()

  for (const bal of balances) {
    if (bal.currency !== currency) continue

    if (!netOwes.has(bal.user_id)) netOwes.set(bal.user_id, new Map())
    if (!netOwes.has(bal.other_user_id)) netOwes.set(bal.other_user_id, new Map())

    // Negative amount = user owes other
    if (bal.amount < -0.01) {
      netOwes.get(bal.user_id)!.set(bal.other_user_id, Math.abs(bal.amount))
    }
  }

  return netOwes
}

/**
 * Balance-based entry point: find circular debt suggestions using the
 * materialized balances table instead of scanning all transactions.
 *
 * The balances table already stores the net debt between each user pair,
 * so we skip the expensive transaction aggregation step entirely.
 */
export function findCircularDebtsFromBalances(
  balances: BalanceEdge[],
  currentUserId: string
): CircularDebtSuggestion[] {
  const suggestions: CircularDebtSuggestion[] = []
  const currencies = [...new Set(balances.map((b) => b.currency))]

  for (const currency of currencies) {
    const netOwes = buildDebtGraphFromBalances(balances, currency)
    const cycles = findCyclesFromUser(netOwes, currentUserId)
    const relationships = getExistingRelationshipsFromBalances(balances, [...netOwes.keys()])
    suggestions.push(...processCycles(cycles, netOwes, relationships, currency))
  }

  return suggestions
}
