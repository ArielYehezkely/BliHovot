# Architecture

This document describes the technical architecture of BliHovot.

## Overview

```
┌──────────────────────────────────────────────────┐
│                  Client (PWA)                    │
│                                                  │
│  React 19 + TypeScript + Vite                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  Pages   │  │Components│  │  Stores  │       │
│  │ (Router) │  │  (UI)    │  │ (Zustand)│       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
│       └──────────────┼─────────────┘             │
│                      │                           │
│              ┌───────┴───────┐                   │
│              │   lib/api.ts  │                   │
│              │  (Supabase    │                   │
│              │   Client)     │                   │
│              └───────┬───────┘                   │
└──────────────────────┼───────────────────────────┘
                       │ HTTPS + WebSocket
┌──────────────────────┼───────────────────────────┐
│              Supabase Backend                    │
│                      │                           │
│  ┌───────────┐  ┌────┴────┐  ┌──────────┐       │
│  │   Auth    │  │ PostgREST│  │ Realtime │       │
│  │ (OAuth +  │  │  (API)   │  │(WebSocket│       │
│  │  Phone)   │  │          │  │  subs)   │       │
│  └───────────┘  └────┬─────┘  └────┬─────┘       │
│                      │             │             │
│              ┌───────┴─────────────┴──────┐      │
│              │      PostgreSQL            │      │
│              │  ┌──────────────────────┐  │      │
│              │  │ profiles             │  │      │
│              │  │ transactions (RLS)   │  │      │
│              │  │ notifications        │  │      │
│              │  │ triggers & functions │  │      │
│              │  └──────────────────────┘  │      │
│              └────────────────────────────┘      │
└──────────────────────────────────────────────────┘
```

## Data Flow

### Adding a Debt

```
User A clicks "I owe them" on User B's page
  → DebtForm collects amount, currency, description
  → api.addDebt(debtorId=A, creditorId=B, amount, currency, desc, createdBy=A)
  → Supabase INSERT into transactions
  → RLS check: type='debt' AND created_by=debtor_id ✓
  → DB trigger: notify_on_transaction()
    → INSERT into notifications (user_id=B, type='debt_added')
  → Realtime broadcasts to User B
    → User B's notification store updates
    → User B's contacts list refreshes
```

### Marking a Payment

```
User B clicks "Mark payment received" on User A's page
  → DebtForm collects amount, currency, description
  → api.markPayment(debtorId=A, creditorId=B, amount, currency, desc, createdBy=B)
  → Supabase INSERT into transactions (type='payment')
  → RLS check: type='payment' AND created_by=creditor_id ✓
  → DB trigger: notify_on_transaction()
    → INSERT into notifications (user_id=A, type='debt_reduced')
  → Realtime broadcasts to User A
```

### Net Balance Calculation

All net balances are computed client-side from the transaction ledger:

```
For each transaction between User A and User B:
  if type='debt':
    if debtor_id = currentUser → balance -= amount  (you owe more)
    if creditor_id = currentUser → balance += amount (they owe you more)
  if type='payment':
    if debtor_id = currentUser → balance += amount  (you owe less)
    if creditor_id = currentUser → balance -= amount (they owe you less)

Result: positive = they owe you, negative = you owe them
```

Balances are calculated per currency, so a user can owe someone in ILS and be owed by them in USD simultaneously.

## Security Model

### Authentication Flow

```
1. User clicks "Sign in with Google/Microsoft"
2. Supabase Auth redirects to OAuth provider
3. Provider authenticates → redirects back with token
4. Supabase creates session (JWT)
5. App checks for existing profile
   → If none: redirect to /onboarding
   → Phone OTP verification → create profile
6. All subsequent API calls include JWT in Authorization header
7. RLS policies use auth.uid() to enforce access control
```

### Row-Level Security (RLS)

Every database query goes through RLS policies. Key constraints:

| Action | Rule | Purpose |
|---|---|---|
| Add debt | `created_by = debtor_id` | Only add debts where YOU are the one who owes |
| Mark payment | `created_by = creditor_id` | Only the person OWED can confirm a payment |
| View transactions | `debtor_id = auth.uid() OR creditor_id = auth.uid()` | Only see your own transactions |
| Edit transactions | Blocked (no UPDATE/DELETE policies) | Append-only audit trail |
| Read profiles | Any authenticated user | Enable contact search |
| Update profile | `id = auth.uid()` | Only edit your own profile |

## State Management

The app uses three Zustand stores:

### `authStore`
- `session` — Supabase auth session (JWT, user object)
- `profile` — User's profile from the `profiles` table
- Synchronized with Supabase `onAuthStateChange` listener

### `contactsStore`
- `contacts` — List of `ContactUser` objects with computed net balances
- Loaded on Home page mount, refreshed on realtime transaction events

### `notificationStore`
- `notifications` — List of in-app notifications
- `unreadCount` — Badge count derived from unread notifications
- Updated in real-time via Supabase Realtime subscription

## Internationalization

- Two languages: English (`en`) and Hebrew (`he`)
- All UI strings go through `react-i18next`'s `t()` function
- Language detection order: localStorage → browser navigator
- Switching language:
  1. Updates `i18next` locale
  2. Changes `document.documentElement.dir` (LTR ↔ RTL)
  3. Changes `document.documentElement.lang`
  4. Saves preference to `profiles.language` in database

## PWA

- `vite-plugin-pwa` generates the service worker and manifest at build time
- Caching strategy:
  - **Static assets**: precached (CSS, JS, fonts)
  - **Supabase API calls**: NetworkFirst with 1-hour cache fallback
- Register type: `autoUpdate` — new versions are installed automatically
- Manifest includes app name, icons, theme color, standalone display mode
