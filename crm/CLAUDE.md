# 3p-crm

## Overview

A CRM and customer dashboard for merchants using **3PSolutions** payment
processing. The product gives our payment-processing customers a clear,
real-time view of their money — how much they've collected, when their next
payout lands, and how their volume is trending over time.

The experience should feel like a polished, trustworthy fintech product:
clean, professional, and visually appealing.

## Goals

- Give merchants an at-a-glance financial dashboard.
- Surface the metrics that matter most for a payment-processing customer.
- Let users slice every metric by **daily, weekly, and monthly** ranges.
- Match the look and feel of [use3psolutions.com](https://use3psolutions.com).

## Design

Use strong visual design throughout — generous whitespace, clear typographic
hierarchy, smooth charts, and a modern fintech aesthetic. Prioritize clarity
and trust over decoration.

### Color Scheme

Derived from use3psolutions.com (a clean, professional fintech style). These
are the working values — **confirm/sample the exact hex codes against the live
site before finalizing**, since the site renders much of its styling from
embedded assets.

| Role             | Suggested value | Notes                                  |
| ---------------- | --------------- | -------------------------------------- |
| Primary / Brand  | `#0A2540`       | Deep navy blue (logo, headers)         |
| Primary accent   | `#1B6EF3`       | Blue call-to-action buttons / links    |
| Success / Accent | `#16A34A`       | Green (positive metrics, checkmarks)   |
| Background       | `#FFFFFF`       | Main surface                           |
| Surface / Card   | `#F6F8FB`       | Off-white card and section backgrounds |
| Text (primary)   | `#1A1F36`       | Charcoal body text                     |
| Text (muted)     | `#6B7280`       | Secondary / label text                 |
| Border / Divider | `#E5E9F0`       | Subtle separators                      |

### Typography

Modern sans-serif (system font stack or a clean web font such as Inter).
Establish a clear hierarchy: large bold numbers for key metrics, medium
headings for sections, and muted labels for context.

## Dashboard Metrics

Every metric supports a **time-range toggle: Daily · Weekly · Monthly**. The
selected range updates all metrics and charts on the dashboard.

### Primary metrics

- **Total Cash Collected** — total amount collected over the selected range,
  with comparison to the previous period (▲/▼ %).
- **Next Payout** — amount and expected date/time of the next scheduled payout.

### Additional metrics to include

- **Available Balance** — funds currently available.
- **Pending Balance** — funds processing / not yet settled.
- **Transaction Count** — number of payments in the selected range.
- **Average Transaction Value** — mean payment size.
- **Refunds / Chargebacks** — total and count, flagged when elevated.
- **Net Revenue** — collected minus refunds, chargebacks, and processing fees.
- **Processing Fees** — fees charged by 3PSolutions over the range.
- **Revenue Over Time** — trend chart (line/area) respecting the range toggle.
- **Recent Transactions** — table of latest payments (amount, customer,
  status, timestamp).
- **Payout History** — list of past payouts with status and dates.

## Conventions

### Current build (prototype)

The dashboard is a self-contained static app (no build step) because Node.js is
not installed on this machine — Python 3.11 is, so it's served with Python's
built-in HTTP server.

- `index.html` — page structure (sidebar, topbar, range toggle, cards, charts, tables)
- `assets/styles.css` — all styling and the brand palette (CSS custom properties at top)
- `assets/logo.png` — official 3PSolutions brand logo (640×640); used in the sidebar, login page, and favicon
- `assets/config.js` — set `SHEET_API_URL` to read live data from a Google Sheet
- `assets/data.js` — **fallback** sample data, used only when no Sheet is connected
- `assets/sheet.js` — fetches the Sheet (via Apps Script) and maps it to the dashboard shape
- `assets/app.js` — rendering, charts, the Daily/Weekly/Monthly toggle, and async data load
- `apps-script/Code.gs` — Google Apps Script: `doGet()` JSON endpoint + `setupSampleData()`
- Charts via Chart.js (loaded from CDN); fonts via Google Fonts (Inter)

### Data sync (Sheet → site)

The Google Sheet is the **source of truth**; the dashboard reads from it one-way
via a Google Apps Script Web App that serves each tab as JSON. No backend server
is required. Full walkthrough in [SHEETS_SETUP.md](SHEETS_SETUP.md). With no
Sheet connected, the site shows sample data and a "Sample data" badge.

### Architecture (local + Vercel)

The app runs locally on SQLite and on **Vercel** (serverless) with **Postgres** —
the same code, with the DB backend chosen automatically.

- `core.py` — **all** logic: DB layer (SQLite *or* Postgres via `DATABASE_URL`),
  schema/seed, auth, signed-cookie sessions, per-merchant data, and
  `dispatch_api()` which handles every `/api/*` route.
- `server.py` — **local dev** server: serves static files + routes `/api/*` to `core`.
- `api/index.py` — **Vercel** serverless function: routes `/api/*` to `core`.
- `vercel.json` — routes `/api/*` to the function, serves the rest as static (`cleanUrls`).
- `requirements.txt` — `psycopg` (Postgres driver, installed by Vercel only).
- Sessions are **stateless signed (HMAC) cookies** — no in-memory state, so they
  work across serverless invocations. `SESSION_SECRET` env var signs them.
- Static pages are public; access control is enforced at the API layer, and
  `app.js` redirects to `/login` when `/api/me` returns 401.

**Run locally (with login):**

```
python server.py            # http://localhost:8000  (uses SQLite at data/logins.db)
```

**Deploy:** see [DEPLOY.md](DEPLOY.md) (Neon Postgres + Vercel env vars). Set
`DATABASE_URL`, `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.

### Authentication & login database

Login is handled by `server.py` — a standard-library Python server (no installs)
that gates the dashboard behind a session and stores accounts in a SQLite
database at `data/logins.db`.

- Passwords: salted **PBKDF2-HMAC-SHA256** (200k rounds) — never stored in plaintext.
- Sessions: random token in an **HttpOnly** cookie; held in memory (reset on restart).
- Server-side gating: `/` and assets require a valid session; `/login` is public;
  `server.py` and `data/` are never served.
### Multi-tenant model (merchants + admins)

Every account has a **role** and (for merchants) a **merchant_id**:

- **merchant** — linked to one row in the `merchants` table; sees ONLY that
  merchant's data. Scope is enforced **server-side**: `/api/dashboard` ignores/
  rejects any other `merchant_id`.
- **admin** — `merchant_id` is null; can list every merchant and open any one.
  The dashboard shows an admin **Merchants** directory (sidebar → full page) and
  a **context bar** indicating which merchant is being viewed.
- Admins can **change a merchant's account status** (`active` / `paused` /
  `suspended`) via the status pill-select in the directory or the context bar →
  `POST /api/merchant/status` (admin-only, validates the status value).
- Admins can **delete a merchant** (trash icon in the directory → confirm modal)
  → `POST /api/merchant/delete` (admin-only). Cascades: removes the merchant, its
  login account, and any pending invites. CLI: `python server.py delmerchant <id>`.

Static assets are served with `Cache-Control: no-store` so HTML/CSS/JS changes
appear without a hard refresh. Asset includes also carry a `?v=` query for
explicit cache-busting.

**Tables:** `users(…, role, merchant_id)` and
`merchants(id, name, email, business_type, status, created_at)`.

**Data endpoints** (all session-gated, return 401/403 as JSON):
- `GET /api/me` → `{username, role, merchant_id, merchant_name}`
- `GET /api/dashboard?merchant_id=<id>` → full dashboard payload for one merchant
  (merchants may only fetch their own; admins may fetch any)
- `GET /api/merchants` → admin-only list with per-merchant summary stats
- `POST /api/login`, `POST /api/logout`

Per-merchant figures are **deterministic sample data** generated from the
merchant id in `gen_dashboard()` — this is the single function to replace with
real data-source calls (own DB / upstream API) when available.

**Accounts:**
- Admin — `3psolutionss@gmail.com` (the old default `admin@3psolutions.com` was removed).
  A fallback default admin is only re-seeded if the DB ever has **zero** admins.
- One **mock merchant** — `customer@demo.com` / `Customer2026!` ("Demo Merchant").

**Mock data is flat/round** for easy verification (obviously fake): `gen_dashboard`
returns a $100 average ticket → $10k/day, $70k/week, $300k/month collected, with
fees = collected × the merchant's fee %, refunds = 2%, balances/payouts in round
figures. Replace `gen_dashboard` with the real data source when available.

Sign-out is a **Log out** item in the sidebar Account section (any `.js-logout`
element triggers logout); there is no topbar logout button.

**Account management (CLI):**

```
python server.py adduser     <email> <password> [role] [merchant_id]
python server.py addmerchant <name> <email> <business_type>
python server.py setrole     <email> <admin|merchant>     # label an admin
python server.py setmerchant <email> <merchant_id>        # link user to merchant
python server.py passwd      <email> <new_password>
python server.py deluser     <email>                      # refuses to delete the last admin
python server.py listusers
python server.py listmerchants
```

**Change all seeded passwords before any real use.** This is prototype-grade
auth over plain HTTP; for production put it behind HTTPS and use DB-backed,
expiring sessions.

### Payout methods (merchant-configured)

Merchants set where their payouts go via the **Payout Methods** page (sidebar).
They can enable **one or both** destinations:

- **ACH bank transfer** — bank name + account number + 9-digit routing.
- **Crypto USDT (ERC-20)** — a `0x…` wallet address (validated `0x` + 40 hex).

If both are enabled, a **primary** destination is chosen. The configured
method(s) are stored on the `merchants` row (`ach_bank`, `ach_account`,
`ach_routing`, `usdt_address`, `payout_primary`) and **the dashboard's payout
history routes to them** (primary first); with none set, sample destinations are
used. Endpoints: `GET /api/payout-methods` and `POST /api/payout-methods`
(scoped — a merchant manages only its own; an admin may pass `merchant_id`).
Validation + "at least one method" enforced server-side. NOTE: account numbers
are stored in plaintext for the prototype — tokenize/encrypt before production.

### Invite-based onboarding

Accounts are **not** self-service — clients can only register through a
single-use invite issued by an admin.

- Admin → **Merchants** directory → **Invite a client**: pick an existing
  merchant or create a new one, enter the client email + expiry → server returns
  a single-use link (`/signup?token=…`). Pending invites are listed and can be
  copied or revoked.
- Client opens the link → `signup.html` validates the token via `GET /api/invite`
  and shows a password form (merchant + email are fixed by the invite) →
  `POST /api/signup` creates the account (role + merchant from the invite),
  marks the invite used, and logs them in.
- Invites are **single-use** (consumed on signup → 410 on reuse) and **expire**
  (default 7 days). Invite create/list/revoke endpoints are **admin-only**.
- The invite form also captures the **processing fee %** 3PSolutions charges that
  merchant. It's stored as `merchants.fee_percent` and **drives the dashboard's
  processing-fee and net-revenue figures** (`fees = collected × fee_percent`).
  Shown in the merchants directory (Fee column), the admin context bar, and the
  merchant's revenue breakdown ("Processing fees (X%)"). Default 2.9%, clamped 0–20%.

Tables: `invites(token, email, merchant_id, role, created_by, created_at,
expires_at, used_at, used_by)`. Endpoints: `POST /api/invites` (create, admin),
`GET /api/invites` (list, admin), `POST /api/invites/revoke` (admin),
`GET /api/invite?token=` (public validate), `POST /api/signup` (public redeem).

### Future direction

When Node.js is available, this can be migrated to React + Vite + Tailwind +
Recharts for a maintainable component-based codebase. The data layer
(`assets/data.js`) is intentionally isolated to make that swap clean.
