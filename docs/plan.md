# BliHovot (בלי חובות) — Implementation Plan

## Overview

A mobile-first PWA for tracking debts between friends. Built with **React + Vite**, **Supabase** backend (auth, database, realtime, edge functions), supporting **Google/Microsoft login**, phone-number identity, **bilingual UI** (Hebrew RTL / English), **multi-currency** debts, and **push + in-app notifications**.

### Core Rules

1. A user can only add a debt **from themselves** to someone else — only the creditor can reduce it
2. A user can reduce **others' debt to them** — debtors cannot reduce their own debt
3. Net balance is auto-calculated: if User A owes ₪100 to User B, and User B owes ₪200 to User A, the result is User B owes User A ₪100

---

## Steps

### 1. Project Scaffolding

- Initialize a **React + TypeScript** project via Vite in workspace root
- Install core dependencies:
  - `react-router-dom` — routing
  - `@supabase/supabase-js` — Supabase client
  - `react-i18next`, `i18next`, `i18next-browser-languagedetector` — i18n
- Install styling:
  - `tailwindcss`, `@tailwindcss/vite` — utility CSS
  - `shadcn/ui` — polished component primitives
- Install PWA tooling:
  - `vite-plugin-pwa` — auto-generates service worker + manifest
- Install state management:
  - `zustand` — lightweight global state (auth user, language, notifications)
- Install utilities:
  - `libphonenumber-js` — phone number parsing/normalization to E.164
  - `framer-motion` — page transitions and micro-animations
- Configure Tailwind with soft, fun color palette and `rtl:` variant support

### 2. PWA Configuration

- Configure `vite-plugin-pwa` with app manifest:
  - Name: "בלי חובות / BliHovot"
  - Icons, theme color, background color
  - `display: standalone`
- Service worker caching:
  - Network-first for API calls
  - Cache-first for static assets
- Custom "Add to Home Screen" install prompt banner

### 3. Internationalization (i18n)

- Create translation files: `src/locales/he.json` and `src/locales/en.json`
- Configure `react-i18next` with browser language detection + manual toggle
- All UI strings use `t()` function — no hardcoded text
- RTL/LTR direction switches automatically based on selected language via `dir` attribute

### 4. Supabase Project Setup

- Create Supabase project (manual step in Supabase dashboard)
- Enable **Google OAuth** and **Microsoft OAuth** providers in Auth settings
- Configure redirect URLs for the PWA domain
- Store config in `.env`:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

### 5. Database Schema

#### Table: `profiles`

| Column             | Type        | Notes                           |
| ------------------ | ----------- | ------------------------------- |
| `id`               | uuid (PK)   | References `auth.users.id`      |
| `phone_number`     | text (unique) | Primary identity, E.164 format |
| `display_name`     | text        | From OAuth profile              |
| `avatar_url`       | text        | From OAuth profile              |
| `language`         | text        | `'he'` or `'en'`               |
| `preferred_currency` | text      | Default currency code           |
| `push_subscription` | jsonb      | Web Push subscription object    |
| `created_at`       | timestamptz |                                 |

#### Table: `transactions`

| Column        | Type                  | Notes                              |
| ------------- | --------------------- | ---------------------------------- |
| `id`          | uuid (PK)             |                                    |
| `debtor_id`   | uuid (FK → profiles)  | Who owes                           |
| `creditor_id` | uuid (FK → profiles)  | Who is owed                        |
| `amount`      | numeric               | Always positive                    |
| `currency`    | text                  | Currency code (ILS, USD, EUR, etc.) |
| `description` | text                  | User-provided note                 |
| `type`        | text                  | `'debt'` or `'payment'`           |
| `created_by`  | uuid (FK → profiles)  | Who created this entry             |
| `created_at`  | timestamptz           |                                    |

#### Table: `notifications`

| Column       | Type                  | Notes                                    |
| ------------ | --------------------- | ---------------------------------------- |
| `id`         | uuid (PK)             |                                          |
| `user_id`    | uuid (FK → profiles)  | Recipient                                |
| `type`       | text                  | `'debt_added'` or `'debt_reduced'`       |
| `data`       | jsonb                 | Context (amount, currency, from_user, etc.) |
| `read`       | boolean               | Default `false`                          |
| `created_at` | timestamptz           |                                          |

#### View: `net_balances` (computed)

- Aggregates all transactions between each pair of users per currency
- Calculates: `SUM(debts A→B) - SUM(payments A→B)` vs reverse direction
- Returns net direction and amount per currency per user pair

### 6. Row-Level Security (RLS) Policies

- **`profiles`**:
  - SELECT: any authenticated user can read any profile
  - UPDATE: users can only update their own row
- **`transactions` INSERT**:
  - If `type = 'debt'`: `created_by` must equal `debtor_id` (you can only add debt for yourself)
  - If `type = 'payment'`: `created_by` must equal `creditor_id` (only the person owed can mark payment)
- **`transactions` SELECT**: user can see rows where they are `debtor_id` or `creditor_id`
- **`transactions`**: No UPDATE or DELETE (append-only ledger)
- **`notifications`**: users can only read and update their own notifications

### 7. Supabase Edge Functions

- **`on-transaction-insert`** (database trigger): When a transaction is inserted, create a notification record for the other party and send a web push notification
- **`send-push`**: Utility function that sends Web Push notifications using stored subscription from `profiles.push_subscription`

### 8. Auth Flow

1. **Login screen**: Branded splash with Google and Microsoft sign-in buttons
2. After OAuth callback → check if user has a `profiles` record
3. If **no profile** → **Onboarding screen**: Collect phone number, verify via Supabase Phone Auth (OTP SMS), save profile
4. If **profile exists** → navigate to Home
5. Session managed by Supabase client; `zustand` store mirrors auth state
6. Automatic token refresh via Supabase client

### 9. App Routing & Screens

| Route         | Screen       | Description                            |
| ------------- | ------------ | -------------------------------------- |
| `/`           | Login        | OAuth sign-in                          |
| `/onboarding` | Onboarding   | Phone number registration              |
| `/home`       | Home         | Dashboard with net balances            |
| `/user/:id`   | User Detail  | Debt history with a specific person    |
| `/settings`   | Settings     | Language, currency, notifications      |

### 10. Home Screen

- **Header**: App logo, notification bell (with unread badge), settings gear, language toggle
- **Summary card**: Total net debt across all contacts, split by:
  - "You owe" (coral tint)
  - "Owed to you" (mint tint)
  - Displayed in user's preferred currency
- **Contact list**: Sorted by largest debt first; each card shows:
  - Avatar + name
  - Net amount with direction indicator (arrow icon + color: coral = you owe, mint = they owe you)
  - Currency badge
  - Tap → navigates to `/user/:id`
- **FAB (Floating Action Button)**: "Add Debt" — opens contact picker or manual phone entry, then debt form
- **Empty state**: Fun illustration + "No debts yet! You're all settled 🎉"

### 11. User Detail Screen

- **Header**: Back button, contact avatar + name, net balance prominently displayed
- **Net balance card**: Large number with direction text ("You owe them ₪100" or "They owe you ₪100"), color-coded
- **Action buttons**:
  - "I owe them" → opens debt form (adds debt from current user to this person)
  - "Mark payment received" → opens reduction form (only visible if the other person owes the current user)
- **Transaction history**: Chronological list of all transactions between the two users
  - Each entry: date, type icon (debt ↗ / payment ↘), amount, currency, description, who created it
  - Color-coded: debts in coral, payments in mint
- **Debt/payment form modal**: Amount input with currency selector, description text field, submit button

### 12. Notifications System

- **In-app**: Bell icon in header → dropdown/sheet showing notification list; mark as read on tap
- **Push notifications**:
  - Request permission on first login
  - Store Web Push subscription in `profiles.push_subscription`
  - Edge function sends push on new transactions
  - Notification click opens relevant user detail screen

### 13. Contact Picker & Phone Matching

- Use the [Contact Picker API](https://developer.mozilla.org/en-US/docs/Web/API/Contact_Picker_API) (Chrome Android) to select phone contacts
- Fallback: manual phone number input with country code selector
- When a contact is selected:
  - Normalize phone number to E.164 via `libphonenumber-js`
  - Search `profiles` table for matching phone number
  - If found → create/view debt relationship
  - If not found → show message that the person is not on the app yet

### 14. Realtime Updates

- Subscribe to Supabase Realtime on `transactions` table filtered by current user
- New transactions update zustand store and re-render affected components instantly
- Subscribe to `notifications` table for real-time notification badge updates

### 15. Design System & Styling

- **Color palette** (soft pastels with vibrant accents):
  - Primary / "You owe": Coral `#FF6B6B`
  - Secondary / "Owed to you": Mint `#4ECDC4`
  - Accent / CTAs: Warm Yellow `#FFE66D`
  - Background: Off-white `#F7F7F7` / Dark mode: Charcoal `#2C2C2C`
  - Surface: White / Dark mode: Dark gray
  - Secondary accent: Lavender `#C3ACD0`
- **Typography**: Rounded, friendly font — `Rubik` (has Hebrew support)
- **Components**: Rounded corners (xl/2xl), soft shadows, subtle gradients, playful micro-animations
- **Icons**: Lucide (line style, rounded)
- **Motion**: Framer Motion for page transitions and card animations

### 16. Offline Support

- Service worker caches app shell and static assets
- IndexedDB stores recent transactions for offline viewing
- Stretch goal: queued mutations — store pending transactions locally and sync when back online

---

## Verification

1. **Auth flow**: Sign in with Google → redirected → prompted for phone → OTP verified → lands on Home
2. **Debt creation**: Add debt to contact → appears in both users' feeds in real-time
3. **Payment recording**: Creditor reduces debt → net balance updates for both users
4. **Net calculation**: Create opposing debts → verify net balance auto-calculates correctly
5. **Notifications**: Adding a debt triggers both in-app and push notification for the other user
6. **PWA**: Install on Android/iOS → works from home screen → offline shell loads
7. **RTL**: Switch to Hebrew → layout mirrors correctly
8. **RLS**: Attempt to create a debt as someone else → blocked; attempt to reduce own debt → blocked
9. Run `npm run build` — no TypeScript errors, Lighthouse PWA score ≥ 90

## Key Decisions

- **Append-only ledger** for transactions (no edit/delete) — ensures audit trail and simpler RLS
- **Single `transactions` table** with `type` field rather than separate tables — simpler queries and net calculation
- **E.164 phone format** as universal identity key — reliable cross-device matching
- **Contact Picker API with fallback** — best UX on supported devices, manual entry elsewhere
- **Supabase Realtime** for live updates instead of polling — instant UX
- **Edge Functions** for push notifications — keeps secrets server-side