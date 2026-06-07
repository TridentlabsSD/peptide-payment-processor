# Deploying to Vercel

The app is structured to run on **Vercel** (serverless) with a **Neon Postgres**
database. The same code runs locally on SQLite, so you can develop without any
cloud setup.

## How it's wired

| Piece | Local dev | Vercel (production) |
| --- | --- | --- |
| Static pages/assets (`index.html`, `assets/`, `login.html`, `signup.html`) | served by `server.py` | served by Vercel's CDN |
| API (`/api/*`) | `server.py` → `core.dispatch_api` | `api/index.py` (serverless) → `core.dispatch_api` |
| Database | SQLite file `data/logins.db` | **Postgres** via `DATABASE_URL` |
| Sessions | signed HMAC cookie | signed HMAC cookie (same) |

All real logic lives in **`core.py`** (shared by both entry points). The DB
backend is chosen automatically: if `DATABASE_URL` is set → Postgres, else SQLite.

## One-time setup

### 1. Create the database (Neon)
- In the Vercel dashboard: **Storage → Create Database → Postgres (Neon)**, or
  sign up at [neon.tech](https://neon.tech) and create a project.
- Connect it to your Vercel project. This sets the `DATABASE_URL` (and/or
  `POSTGRES_URL`) environment variable automatically.

### 2. Set environment variables (Project → Settings → Environment Variables)
| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | ✅ (auto-set by Neon) | Postgres connection string |
| `SESSION_SECRET` | ✅ | Long random string used to sign session cookies. Generate one: `python -c "import secrets;print(secrets.token_hex(32))"` |
| `ADMIN_EMAIL` | recommended | Your admin login (e.g. `3psolutionss@gmail.com`) — seeded on first run |
| `ADMIN_PASSWORD` | recommended | Initial admin password (change after first login) |
| `SEED_DEMO` | optional | Set to `1` to also seed the demo merchant; omit for a clean production DB |
| `WEBHOOK_SECRET` | for the provider webhook | Shared secret the provider sends as `X-Webhook-Secret` (see [WEBHOOK.md](WEBHOOK.md)). Generate with `python -c "import secrets;print(secrets.token_hex(24))"` |
| `RESEND_API_KEY` | for email | API key from [resend.com](https://resend.com) (enables invite + reset emails) |
| `EMAIL_FROM` | for email | Verified sender, e.g. `3PSolutions <noreply@yourdomain.com>` |
| `APP_URL` | recommended with email | Your production URL (e.g. `https://yourapp.vercel.app`) so links in emails point to the right place |

> `VERCEL` is set by the platform automatically and switches cookies to
> `Secure` (HTTPS-only).

### 3. Deploy
- Push the repo to GitHub and **Import** it in Vercel (or run `vercel` / `vercel --prod` with the CLI).
- Vercel installs `requirements.txt` (`psycopg`) and builds `api/index.py`.
- On first request, the tables are created and your admin account is seeded.

### 4. First login
- Visit your domain → you'll be redirected to `/login`.
- Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`, then **change the password**
  and start inviting merchants.

## Email (Resend) — invites & password resets

Email is sent via [Resend](https://resend.com) over HTTPS (no extra dependency).
It's **optional**: with no key set, invites still produce a copyable link and the
app works — it just doesn't auto-send.

1. Create a **Resend** account → **Add a domain** and verify it (add the DNS
   records they show). For a quick test you can use Resend's onboarding domain
   and send only to your own address.
2. Create an **API key**.
3. Set env vars in Vercel: `RESEND_API_KEY`, `EMAIL_FROM`
   (e.g. `3PSolutions <noreply@yourdomain.com>`), and `APP_URL` (your prod URL).

Once set:
- **Invites** are emailed automatically to the client (the admin still sees the
  link to copy as a backup).
- **Forgot password** (`/forgot`) emails a single-use, 1-hour reset link
  (`/reset?token=…`). The endpoint never reveals whether an email is registered.

## Verifying a deployment

Hit **`/api/health`** — it returns `{ "db": "postgres" | "sqlite", "email": true|false }`
so you can confirm the database backend and whether email is configured.

## What changed for Vercel (vs. the local prototype)
- The persistent Python server became a **serverless function** (`api/index.py`).
- SQLite → **Postgres** (no persistent disk on Vercel). `core.py` speaks both.
- In-memory sessions → **stateless signed cookies** (work across invocations).
- Static pages are public; the gate is the API layer + a client-side redirect to
  `/login` when `/api/me` returns 401 (no data is exposed by the public shell).
- `vercel.json` routes `/api/*` to the function and serves everything else as static.

## Still to do before real money/data
- **Encrypt the stored bank account / routing numbers** (currently plaintext) —
  PII/PCI. Consider field-level encryption or a tokenization provider.
- Review Neon backups/retention and rotate `SESSION_SECRET` procedures.

## Troubleshooting
- **`ModuleNotFoundError: core`** on Vercel → confirm `vercel.json` has
  `functions["api/index.py"].includeFiles = "core.py"`. If it persists, copy
  `core.py` into `api/` and change the import in `api/index.py` to `import core`
  (drop the `sys.path` line).
- **Everything 401s** → `SESSION_SECRET` differs between deploys or isn't set;
  set a stable value in project env vars.
- **DB errors on first hit** → verify `DATABASE_URL` is present in the
  environment the deployment uses (Production vs Preview).
