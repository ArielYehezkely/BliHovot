# Supabase Setup Guide

This guide walks you through setting up the Supabase backend for BliHovot.

## 1. Create a Supabase Project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click **New Project**
3. Choose an organization, enter a project name (e.g., `blihovot`), set a database password, and select a region close to your users

## 2. Run the Database Schema

1. In your Supabase project, go to **SQL Editor**
2. Click **New Query**
3. Copy and paste the entire contents of [`../supabase/schema.sql`](../supabase/schema.sql)
4. Click **Run**

This creates:

| Item | What it does |
|---|---|
| `profiles` table | Stores user info (phone, name, avatar, language, currency) |
| `transactions` table | Append-only ledger of debts and payments |
| `notifications` table | In-app notifications for debt/payment events |
| Indexes | Performance indexes on foreign keys and common queries |
| RLS policies | Row-level security enforcing all business rules |
| `notify_on_transaction()` | Trigger function that auto-creates notifications |
| Realtime | Enables real-time subscriptions on `transactions` and `notifications` |

## 3. Enable Authentication Providers

### Google OAuth

1. Go to **Authentication → Providers → Google**
2. Toggle **Enable**
3. Create OAuth credentials in [Google Cloud Console](https://console.cloud.google.com/apis/credentials):
   - Create an **OAuth 2.0 Client ID** (Web application)
   - Add authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
4. Copy the **Client ID** and **Client Secret** into Supabase

### Microsoft (Azure) OAuth

1. Go to **Authentication → Providers → Azure**
2. Toggle **Enable**
3. Create an app in [Azure Portal → App Registrations](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps):
   - Register a new application
   - Set redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
   - Create a client secret under **Certificates & secrets**
4. Copy the **Application (client) ID** and **Client Secret** into Supabase
5. Set the **Azure Tenant URL** (use `https://login.microsoftonline.com/common` for multi-tenant)

### Phone OTP (for onboarding)

1. Go to **Authentication → Providers → Phone**
2. Toggle **Enable Phone Provider**
3. Choose an SMS provider:
   - **Twilio** (recommended) — enter Account SID, Auth Token, and Messaging Service SID
   - **MessageBird** or **Vonage** — enter the respective API keys
4. The app sends an OTP code during onboarding to verify the user's phone number

## 4. Configure Redirect URLs

1. Go to **Authentication → URL Configuration**
2. Add your app URLs to **Redirect URLs**:
   - Local development: `http://localhost:5173`
   - Production: `https://your-domain.com`

## 5. Get API Keys

1. Go to **Settings → API**
2. Copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon / public key** → `VITE_SUPABASE_ANON_KEY`
3. Paste into your `.env` file

## 6. Enable Realtime

Realtime is enabled automatically by the schema SQL (`ALTER PUBLICATION supabase_realtime ADD TABLE ...`).

To verify:

1. Go to **Database → Replication**
2. Confirm that `transactions` and `notifications` tables are listed under the `supabase_realtime` publication

## 7. Verify RLS Policies

To confirm the security rules are in place:

1. Go to **Authentication → Policies**
2. Check that each table shows the correct policies:

### `profiles`
- ✅ SELECT: authenticated users can view all profiles
- ✅ INSERT: users can only insert their own profile (`auth.uid() = id`)
- ✅ UPDATE: users can only update their own profile (`auth.uid() = id`)

### `transactions`
- ✅ SELECT: users can see transactions where they are debtor or creditor
- ✅ INSERT: enforces debt rules:
  - `type = 'debt'` → `created_by` must equal `debtor_id` (can only add your own debt)
  - `type = 'payment'` → `created_by` must equal `creditor_id` (only creditor can mark payment)
- ❌ No UPDATE policy (blocked)
- ❌ No DELETE policy (blocked)

### `notifications`
- ✅ SELECT: users can only see their own notifications
- ✅ UPDATE: users can only update their own notifications (for marking as read)
- ✅ INSERT: allowed for authenticated users (trigger creates them automatically)

## Troubleshooting

### "User not found" when searching by phone
- Ensure phone numbers are stored in E.164 format (e.g., `+972501234567`)
- The app normalizes input using `libphonenumber-js` with Israel (`IL`) as default country

### OAuth redirect errors
- Double-check that your redirect URL matches exactly (including protocol and port)
- For local dev, use `http://localhost:5173` (not `127.0.0.1`)

### Realtime not working
- Verify the tables are added to the `supabase_realtime` publication
- Check that RLS is enabled and the user has SELECT access
- Ensure you're subscribing with an authenticated client (not anon)

### Phone OTP not sending
- Confirm your SMS provider (Twilio/MessageBird/Vonage) is configured correctly
- Check the Supabase Auth logs under **Authentication → Logs**
