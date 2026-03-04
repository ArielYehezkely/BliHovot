# בלי חובות — BliHovot 💸

A fun, mobile-first PWA for tracking debts between friends. No more awkward conversations about who owes what!

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript)
![Supabase](https://img.shields.io/badge/Supabase-Backend-3FCF8E?logo=supabase)
![PWA](https://img.shields.io/badge/PWA-Installable-5A0FC8)

## Features

- **Google & Microsoft sign-in** — quick OAuth login
- **Phone number identity** — friends find you by phone number
- **Fair debt rules** — you can only add your own debts; only the person you owe can mark your payments
- **Auto net balance** — opposing debts are automatically netted (A owes B ₪100, B owes A ₪200 → B owes A ₪100)
- **Multi-currency** — ILS (₪), USD ($), EUR (€), GBP (£) per transaction
- **Bilingual** — full Hebrew (RTL) and English UI with one-click toggle
- **Real-time** — instant updates when someone adds a debt or marks a payment
- **In-app notifications** — get notified when debts are added or reduced
- **Installable PWA** — add to home screen, works offline
- **Fun & colorful** — coral, mint, lavender palette with playful animations

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- A [Supabase](https://supabase.com/) project

### 1. Clone & install

```bash
git clone <your-repo-url>
cd BliHovot
npm install
```

### 2. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com/dashboard)
2. Go to **SQL Editor** and run the contents of [`supabase/schema.sql`](supabase/schema.sql) — this creates all tables, indexes, RLS policies, and triggers
3. Go to **Authentication → Providers** and enable:
   - **Google** — add your OAuth client ID and secret
   - **Azure (Microsoft)** — add your Azure AD app credentials
4. Go to **Authentication → URL Configuration** and add your app URL to **Redirect URLs** (e.g., `http://localhost:5173` for local dev)

### 3. Configure environment

Copy the example env file and fill in your Supabase credentials:

```bash
cp .env.example .env
```

Edit `.env`:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

You can find these values in your Supabase project under **Settings → API**.

### 4. Run

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### 5. Build for production

```bash
npm run build
npm run preview    # preview the production build locally
```

## Project Structure

```
BliHovot/
├── public/                    # Static assets & PWA icons
│   └── favicon.svg
├── supabase/
│   └── schema.sql             # Database schema, RLS policies, triggers
├── src/
│   ├── main.tsx               # App entry point
│   ├── App.tsx                # Router, AuthGuard, Realtime subscriptions
│   ├── index.css              # Tailwind v4 theme (colors, fonts, globals)
│   ├── types.ts               # TypeScript types & currency helpers
│   ├── env.d.ts               # Vite env type declarations
│   ├── lib/
│   │   ├── supabase.ts        # Supabase client initialization
│   │   └── api.ts             # All API functions (auth, CRUD, realtime)
│   ├── stores/
│   │   ├── authStore.ts       # Auth session & profile state (Zustand)
│   │   ├── contactsStore.ts   # Contacts list state
│   │   └── notificationStore.ts # Notification state & unread count
│   ├── locales/
│   │   ├── i18n.ts            # i18next configuration
│   │   ├── en.json            # English translations
│   │   └── he.json            # Hebrew translations
│   ├── components/
│   │   ├── Avatar.tsx         # User avatar with initials fallback
│   │   ├── BalanceBadge.tsx   # Color-coded balance amount display
│   │   ├── BottomNav.tsx      # Bottom tab navigation
│   │   ├── ContactPicker.tsx  # Phone search + Contact Picker API
│   │   ├── DebtForm.tsx       # Add debt / mark payment modal form
│   │   ├── LanguageToggle.tsx # EN ↔ עב language switcher
│   │   └── Modal.tsx          # Animated bottom sheet modal
│   └── pages/
│       ├── LoginPage.tsx      # Google + Microsoft OAuth sign-in
│       ├── OnboardingPage.tsx # Phone verification + profile setup
│       ├── HomePage.tsx       # Dashboard: balances + contact list
│       ├── UserDetailPage.tsx # Debt history + add/reduce actions
│       ├── NotificationsPage.tsx # In-app notification list
│       └── SettingsPage.tsx   # Language, currency, sign-out
├── docs/
│   └── plan.md                # Detailed implementation plan
├── .env.example               # Environment variable template
├── vite.config.ts             # Vite + React + Tailwind + PWA config
├── tsconfig.json              # TypeScript config
└── package.json
```

## Database Schema

See [`supabase/schema.sql`](supabase/schema.sql) for the full SQL, including RLS policies and triggers.

### Tables

| Table | Purpose |
|---|---|
| `profiles` | User info: phone (E.164), display name, avatar, language, currency preference |
| `transactions` | Append-only ledger of debts and payments between users |
| `notifications` | In-app notifications (auto-created by DB trigger) |

### Key Security Rules (RLS)

| Rule | Enforced by |
|---|---|
| You can only add a debt **where you are the debtor** | `transactions` INSERT policy: `type = 'debt' → created_by = debtor_id` |
| Only the **creditor** can mark a payment | `transactions` INSERT policy: `type = 'payment' → created_by = creditor_id` |
| Transactions are **append-only** (no edit/delete) | No UPDATE/DELETE policies on `transactions` |
| Users only see **their own** transactions | SELECT policy: `debtor_id = auth.uid() OR creditor_id = auth.uid()` |
| Notifications auto-created on insert | `notify_on_transaction()` trigger function |

## Screens

### Login
OAuth sign-in with Google and Microsoft. Fun branded splash page.

### Onboarding
Three-step flow: enter phone number → verify OTP → set display name & default currency.

### Home
- **Summary card** — total "you owe" (coral) and "owed to you" (mint) across all contacts
- **Contact list** — sorted by largest debt, color-coded direction arrows
- **FAB** — floating "Add Debt" button opens contact picker

### User Detail
- Net balance between you and the other person
- **"I owe them"** button — adds a debt from you to them
- **"Mark payment received"** button — reduces their debt to you (only shown when they owe you)
- Full transaction history with date, description, amount, and who created it

### Notifications
List of debt-added and payment-marked events, with unread badges and mark-all-as-read.

### Settings
Language toggle (EN/עברית), default currency selector, sign-out.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript 5.8, Vite 6 |
| Styling | Tailwind CSS 4, Framer Motion |
| State | Zustand |
| Backend | Supabase (Auth, Database, Realtime) |
| i18n | react-i18next + i18next |
| PWA | vite-plugin-pwa (Workbox) |
| Icons | Lucide React |
| Phone parsing | libphonenumber-js |

## Design

- **Coral** `#FF6B6B` — debts you owe, primary accent
- **Mint** `#4ECDC4` — debts owed to you, positive actions
- **Lavender** `#C3ACD0` — secondary accent
- **Warm Yellow** `#FFE66D` — highlights, CTAs
- **Font** — [Rubik](https://fonts.google.com/specimen/Rubik) (supports Hebrew)
- Rounded corners (`2xl`/`3xl`), soft shadows, gradient buttons, micro-animations

## License

Private
