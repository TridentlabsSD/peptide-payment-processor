#!/usr/bin/env python3
"""
3PSolutions Merchant Dashboard — shared core (DB, auth, data, API dispatch).

Runs in two places:
  - Local dev: server.py imports this and serves it with a normal HTTP server.
  - Vercel:    api/index.py imports this from a serverless function.

Database backend is chosen automatically:
  - If DATABASE_URL / POSTGRES_URL is set  -> PostgreSQL (psycopg)  [production / Vercel]
  - Otherwise                              -> SQLite file           [local dev]

Sessions are stateless: a signed (HMAC) cookie, so they work across serverless
invocations with no shared memory. Set SESSION_SECRET in production.
"""

import os
import json
import time
import hmac
import base64
import hashlib
import secrets
import random
import re
import sqlite3
import urllib.request
from http import cookies
from urllib.parse import parse_qs

# --------------------------- configuration --------------------------------
ROOT = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(ROOT, "data", "logins.db")
DATABASE_URL = os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL")
IS_PG = bool(DATABASE_URL)

SESSION_TTL = 60 * 60 * 8          # 8 hours
PBKDF2_ROUNDS = 200_000
SESSION_SECRET = os.environ.get("SESSION_SECRET") or "dev-insecure-3psolutions-secret-change-me"
ON_VERCEL = bool(os.environ.get("VERCEL"))
SECURE_COOKIES = ON_VERCEL          # HTTPS-only cookies in production

# Default admin (seeded on first run). Configure in production via env.
DEFAULT_ADMIN = (
    os.environ.get("ADMIN_EMAIL", "admin@3psolutions.com"),
    os.environ.get("ADMIN_PASSWORD", "changeme123"),
)
# Seed the demo merchants locally (SQLite) or when SEED_DEMO=1 — never by default in prod.
SEED_DEMO = (not IS_PG) or os.environ.get("SEED_DEMO") == "1"

# (name, login_email, password, business_type, status, created_at, fee_percent)
# A single mock merchant with flat, round figures (see gen_dashboard / FLAT).
MERCHANT_SEED = [
    ("Demo Merchant", "customer@demo.com", "Customer2026!", "Online retail", "active", "2026-01-01", 3.0),
]

if IS_PG:
    import psycopg
    from psycopg.rows import dict_row
    INTEGRITY_ERRORS = (psycopg.errors.UniqueViolation, psycopg.IntegrityError, sqlite3.IntegrityError)
else:
    INTEGRITY_ERRORS = (sqlite3.IntegrityError,)


# ----------------------------- database -----------------------------------
class Conn:
    """Thin wrapper so the same SQL (with ? placeholders) runs on both backends."""

    def __init__(self):
        if IS_PG:
            self.raw = psycopg.connect(DATABASE_URL, row_factory=dict_row)
        else:
            os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
            self.raw = sqlite3.connect(DB_PATH)
            self.raw.row_factory = sqlite3.Row
        self.is_pg = IS_PG

    def execute(self, sql, params=()):
        cur = self.raw.cursor()
        cur.execute(sql.replace("?", "%s") if self.is_pg else sql, params)
        return cur

    def commit(self):
        self.raw.commit()

    def close(self):
        try:
            self.raw.close()
        except Exception:
            pass


def get_db():
    return Conn()


def insert_id(conn, sql, params):
    """INSERT and return the new row id on both backends."""
    if conn.is_pg:
        return conn.execute(sql + " RETURNING id", params).fetchone()["id"]
    return conn.execute(sql, params).lastrowid


def _columns(conn, table):
    return [r["name"] for r in conn.execute("PRAGMA table_info(%s)" % table).fetchall()]


def init_db():
    conn = get_db()
    pk = "SERIAL PRIMARY KEY" if IS_PG else "INTEGER PRIMARY KEY AUTOINCREMENT"
    conn.execute(
        "CREATE TABLE IF NOT EXISTS users ("
        "id %s, username TEXT UNIQUE NOT NULL, pw_hash TEXT NOT NULL, pw_salt TEXT NOT NULL, "
        "role TEXT NOT NULL DEFAULT 'merchant', merchant_id INTEGER, "
        "created_at INTEGER NOT NULL, last_login INTEGER)" % pk
    )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS merchants ("
        "id %s, name TEXT NOT NULL, email TEXT, business_type TEXT, "
        "status TEXT NOT NULL DEFAULT 'active', fee_percent REAL NOT NULL DEFAULT 2.9, "
        "ach_bank TEXT, ach_account TEXT, ach_routing TEXT, usdt_address TEXT, payout_primary TEXT, "
        "created_at TEXT)" % pk
    )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS invites ("
        "id %s, token TEXT UNIQUE NOT NULL, email TEXT NOT NULL, merchant_id INTEGER, "
        "role TEXT NOT NULL DEFAULT 'merchant', created_by TEXT, created_at INTEGER NOT NULL, "
        "expires_at INTEGER, used_at INTEGER, used_by TEXT)" % pk
    )
    conn.commit()

    # SQLite-only migrations for databases created by older versions.
    if not IS_PG:
        if "merchant_id" not in _columns(conn, "users"):
            conn.execute("ALTER TABLE users ADD COLUMN merchant_id INTEGER")
        if "fee_percent" not in _columns(conn, "merchants"):
            conn.execute("ALTER TABLE merchants ADD COLUMN fee_percent REAL NOT NULL DEFAULT 2.9")
            conn.execute("UPDATE merchants SET fee_percent = ROUND(2.4 + (id % 5) * 0.3, 2)")
        for col in ("ach_bank", "ach_account", "ach_routing", "usdt_address", "payout_primary"):
            if col not in _columns(conn, "merchants"):
                conn.execute("ALTER TABLE merchants ADD COLUMN %s TEXT" % col)
        conn.commit()

    # Agency role support — add columns idempotently on both backends.
    if IS_PG:
        conn.execute("ALTER TABLE merchants ADD COLUMN IF NOT EXISTS agency_id INTEGER")
        conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS commission_percent REAL")
        conn.execute("ALTER TABLE invites ADD COLUMN IF NOT EXISTS commission_percent REAL")
    else:
        if "agency_id" not in _columns(conn, "merchants"):
            conn.execute("ALTER TABLE merchants ADD COLUMN agency_id INTEGER")
        if "commission_percent" not in _columns(conn, "users"):
            conn.execute("ALTER TABLE users ADD COLUMN commission_percent REAL")
        if "commission_percent" not in _columns(conn, "invites"):
            conn.execute("ALTER TABLE invites ADD COLUMN commission_percent REAL")
    conn.commit()

    # Ensure an admin account exists.
    if conn.execute("SELECT COUNT(*) AS n FROM users WHERE role='admin'").fetchone()["n"] == 0:
        if conn.execute("SELECT 1 AS x FROM users WHERE username=?", (DEFAULT_ADMIN[0].lower(),)).fetchone():
            conn.execute("UPDATE users SET role='admin', merchant_id=NULL WHERE username=?", (DEFAULT_ADMIN[0].lower(),))
            conn.commit()
        else:
            _insert_user(conn, DEFAULT_ADMIN[0], DEFAULT_ADMIN[1], "admin", None)
        print("  Admin account ensured: %s" % DEFAULT_ADMIN[0])

    # Seed demo merchants (local / opt-in only).
    if SEED_DEMO and conn.execute("SELECT COUNT(*) AS n FROM merchants").fetchone()["n"] == 0:
        for (name, email, password, btype, status, created, fee) in MERCHANT_SEED:
            mid = insert_id(
                conn,
                "INSERT INTO merchants (name, email, business_type, status, created_at, fee_percent) VALUES (?,?,?,?,?,?)",
                (name, email, btype, status, created, fee),
            )
            if not conn.execute("SELECT 1 AS x FROM users WHERE username=?", (email.lower(),)).fetchone():
                _insert_user(conn, email, password, "merchant", mid)
        conn.commit()
        print("  Seeded %d demo merchants (password: demo1234)." % len(MERCHANT_SEED))
    conn.close()


_INITED = False


def ensure_init():
    global _INITED
    if not _INITED:
        init_db()
        _INITED = True


# ----------------------------- auth helpers -------------------------------
def _hash_pw(password, salt_hex):
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), PBKDF2_ROUNDS).hex()


def _insert_user(conn, username, password, role="merchant", merchant_id=None):
    salt = secrets.token_hex(16)
    conn.execute(
        "INSERT INTO users (username, pw_hash, pw_salt, role, merchant_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (username.strip().lower(), _hash_pw(password, salt), salt, role, merchant_id, int(time.time())),
    )
    conn.commit()


def verify_user(username, password):
    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE username = ?", (username.strip().lower(),)).fetchone()
    if row is None:
        conn.close()
        return None
    ok = hmac.compare_digest(_hash_pw(password, row["pw_salt"]), row["pw_hash"])
    if ok:
        conn.execute("UPDATE users SET last_login = ? WHERE id = ?", (int(time.time()), row["id"]))
        conn.commit()
    conn.close()
    return row["username"] if ok else None


def get_user_row(username):
    if not username:
        return None
    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    conn.close()
    return dict(row) if row else None


def get_user_by_id(uid):
    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    conn.close()
    return dict(row) if row else None


def get_merchant(mid):
    conn = get_db()
    row = conn.execute("SELECT * FROM merchants WHERE id = ?", (mid,)).fetchone()
    conn.close()
    return dict(row) if row else None


def all_merchants():
    conn = get_db()
    rows = conn.execute("SELECT * FROM merchants ORDER BY name").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def merchants_for_agency(agency_user_id):
    """Merchants in this agency's downline (merchants.agency_id == the agency user's id)."""
    conn = get_db()
    rows = conn.execute("SELECT * FROM merchants WHERE agency_id = ? ORDER BY name", (agency_user_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def list_agencies():
    """All agency accounts with their downline count (admin view)."""
    conn = get_db()
    rows = [dict(r) for r in conn.execute(
        "SELECT id, username, commission_percent FROM users WHERE role='agency' ORDER BY username").fetchall()]
    for r in rows:
        r["merchant_count"] = conn.execute(
            "SELECT COUNT(*) AS n FROM merchants WHERE agency_id=?", (r["id"],)).fetchone()["n"]
    conn.close()
    return rows


# ----------------------------- sessions (signed cookie) -------------------
def make_session_cookie(username):
    payload = base64.urlsafe_b64encode(
        json.dumps({"u": username, "exp": int(time.time()) + SESSION_TTL}).encode()
    ).decode().rstrip("=")
    sig = hmac.new(SESSION_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return _cookie("session", payload + "." + sig, SESSION_TTL)


def clear_session_cookie():
    return _cookie("session", "", 0)


def _cookie(name, value, max_age):
    parts = ["%s=%s" % (name, value), "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=%d" % max_age]
    if SECURE_COOKIES:
        parts.append("Secure")
    return "; ".join(parts)


def session_user_from_cookie(cookie_header):
    jar = cookies.SimpleCookie(cookie_header or "")
    if "session" not in jar:
        return None
    token = jar["session"].value
    try:
        payload, sig = token.rsplit(".", 1)
        expected = hmac.new(SESSION_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        data = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        if data.get("exp", 0) < time.time():
            return None
        return data.get("u")
    except Exception:
        return None


# ----------------------------- email --------------------------------------
RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
EMAIL_FROM = os.environ.get("EMAIL_FROM")          # e.g. "3PSolutions <noreply@yourdomain.com>"
SUPPORT_TELEGRAM = "https://t.me/use3psolutions"


def email_configured():
    return bool(RESEND_API_KEY and EMAIL_FROM)


def send_email(to, subject, html):
    """Send via Resend's HTTPS API (no extra deps). No-ops if not configured."""
    if not email_configured():
        print("[email] not configured (set RESEND_API_KEY + EMAIL_FROM) — skipped sending to %s" % to)
        return False
    data = json.dumps({"from": EMAIL_FROM, "to": [to], "subject": subject, "html": html}).encode("utf-8")
    req = urllib.request.Request(
        "https://api.resend.com/emails", data=data, method="POST",
        headers={"Authorization": "Bearer " + RESEND_API_KEY, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return 200 <= resp.status < 300
    except Exception as e:
        print("[email] send to %s failed: %s" % (to, e))
        return False


def base_url(headers):
    env = os.environ.get("APP_URL")
    if env:
        return env.rstrip("/")
    host = headers.get("Host", "localhost")
    scheme = "https" if ON_VERCEL else "http"
    return "%s://%s" % (scheme, host)


def _email_layout(title, body_html, button_label=None, button_url=None):
    btn = ""
    if button_url:
        btn = ('<a href="%s" style="display:inline-block;background:#0A2540;color:#fff;'
               'text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;'
               'font-family:Arial,sans-serif;font-size:14px">%s</a>' % (button_url, button_label or "Open"))
    return (
        '<div style="font-family:Arial,Helvetica,sans-serif;background:#f4f6fb;padding:28px">'
        '<div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e5e9f0;'
        'border-radius:16px;padding:28px">'
        '<div style="font-weight:800;font-size:16px;color:#0A2540;margin-bottom:14px">3PSolutions</div>'
        '<h2 style="margin:0 0 12px;font-size:20px;color:#1A1F36">%s</h2>'
        '<div style="color:#4a5568;font-size:14px;line-height:1.6">%s</div>'
        '<div style="margin:22px 0">%s</div>'
        '<div style="color:#9aa3b2;font-size:12px;border-top:1px solid #e5e9f0;padding-top:14px">'
        'Need help? Message us on Telegram: <a href="%s" style="color:#1B6EF3">@use3psolutions</a>'
        '</div></div></div>'
    ) % (title, body_html, btn, SUPPORT_TELEGRAM)


def send_invite_email(to, link, merchant_name):
    who = (" for <b>%s</b>" % merchant_name) if merchant_name else ""
    body = ("You've been invited to the 3PSolutions merchant dashboard%s. "
            "Click below to set your password and activate your account. "
            "This is a single-use link." % who)
    return send_email(to, "You're invited to your 3PSolutions dashboard",
                      _email_layout("Activate your account", body, "Activate account", link))


def send_reset_email(to, link):
    body = ("We received a request to reset your 3PSolutions password. "
            "Click below to choose a new one. This link expires in 1 hour. "
            "If you didn't request this, you can ignore this email.")
    return send_email(to, "Reset your 3PSolutions password",
                      _email_layout("Reset your password", body, "Reset password", link))


# ------------------------- password reset tokens --------------------------
# Stateless, single-use (bound to the current pw_hash so it dies once used), 1h.
def make_reset_token(user):
    payload = base64.urlsafe_b64encode(
        json.dumps({"u": user["username"], "exp": int(time.time()) + 3600}).encode()
    ).decode().rstrip("=")
    sig = hmac.new(SESSION_SECRET.encode(), (payload + "|" + user["pw_hash"]).encode(), hashlib.sha256).hexdigest()
    return payload + "." + sig


def verify_reset_token(token):
    try:
        payload, sig = token.rsplit(".", 1)
        data = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        if data.get("exp", 0) < time.time():
            return None
        user = get_user_row(data.get("u"))
        if not user:
            return None
        expected = hmac.new(SESSION_SECRET.encode(), (payload + "|" + user["pw_hash"]).encode(), hashlib.sha256).hexdigest()
        return data["u"] if hmac.compare_digest(sig, expected) else None
    except Exception:
        return None


# ----------------------------- invites ------------------------------------
def create_invite(email, merchant_id, role, created_by, expires_days, commission_percent=None):
    token = secrets.token_urlsafe(24)
    now = int(time.time())
    exp = now + int(expires_days) * 86400 if expires_days else None
    conn = get_db()
    conn.execute(
        "INSERT INTO invites (token, email, merchant_id, role, created_by, created_at, expires_at, commission_percent) "
        "VALUES (?,?,?,?,?,?,?,?)",
        (token, email.strip().lower(), merchant_id, role, created_by, now, exp, commission_percent),
    )
    conn.commit()
    conn.close()
    return token


def get_invite(token):
    if not token:
        return None
    conn = get_db()
    row = conn.execute("SELECT * FROM invites WHERE token = ?", (token,)).fetchone()
    conn.close()
    return dict(row) if row else None


def invite_state(inv):
    if inv.get("used_at"):
        return "used"
    if inv.get("expires_at") and time.time() > inv["expires_at"]:
        return "expired"
    return "pending"


def list_invites():
    conn = get_db()
    rows = conn.execute("SELECT * FROM invites ORDER BY created_at DESC").fetchall()
    out = []
    for r in rows:
        d = dict(r)
        m = get_merchant(d["merchant_id"]) if d["merchant_id"] else None
        out.append({
            "token": d["token"], "email": d["email"], "role": d["role"],
            "merchant_id": d["merchant_id"], "merchant_name": m["name"] if m else None,
            "created_at": d["created_at"], "expires_at": d["expires_at"], "state": invite_state(d),
        })
    conn.close()
    return out


# ----------------------- per-merchant sample data -------------------------
CUSTOMER_POOL = [
    "Atlas Retail", "Bright Mercantile", "Crescent Goods", "Delta Provisions",
    "Evergreen Co", "Fairline Trading", "Granite Outlet", "Harbor & Co",
    "Ivory Labs", "Junction Supply", "Keystone Market", "Lumen Goods",
    "Meridian Shop", "Northwind Trading",
]
TX_COLORS = ["#1B6EF3", "#16A34A", "#7C3AED", "#0EA5E9", "#E5A50A", "#0A2540", "#DB2777", "#0D9488"]
TX_METHODS = ["Card", "Card", "Card", "ACH", "Apple Pay", "Crypto"]
TX_STATUSES = ["completed", "completed", "completed", "completed", "processing", "pending", "refunded"]
PAYOUT_DATES = ["Jun 03, 2026", "May 30, 2026", "May 28, 2026", "May 23, 2026",
                "May 21, 2026", "May 16, 2026", "May 14, 2026"]
PAYOUT_WHEN = [("Tomorrow · 9:00 AM", "Jun 2, 2026"), ("Mon · 9:00 AM", "Jun 3, 2026"),
               ("Fri · 9:00 AM", "Jun 6, 2026")]
RANGE_META = {
    "daily":   {"note": "vs. yesterday",  "unit": "Hour", "mult": 1.0,
                "labels": ["8a", "9a", "10a", "11a", "12p", "1p", "2p", "3p", "4p", "5p", "6p", "7p"]},
    "weekly":  {"note": "vs. last week",  "unit": "Day",  "mult": 6.8,
                "labels": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]},
    "monthly": {"note": "vs. last month", "unit": "Week", "mult": 28.0,
                "labels": ["Week 1", "Week 2", "Week 3", "Week 4"]},
}


def _rng(merchant_id):
    return random.Random(1000 + int(merchant_id) * 7919)


# Flat, round figures per range so totals are trivial to verify (and obviously
# mock): $100 avg ticket, even transaction counts. fee% still drives fees.
FLAT = {
    "daily":   {"collected": 10000.0,  "txns": 100},
    "weekly":  {"collected": 70000.0,  "txns": 700},
    "monthly": {"collected": 300000.0, "txns": 3000},
}


def gen_dashboard(merchant):
    mid = merchant["id"]
    fee_rate = float(merchant.get("fee_percent") or 2.9) / 100.0
    refund_rate = 0.02          # shown as the Refunds KPI; does NOT reduce net revenue
    net_rate = 1 - fee_rate     # net revenue = collected minus our processing fee only
    available = 50000.0
    pending = 20000.0
    next_payout_amt = 25000.0
    pw_when, pw_date = ("Mon · 9:00 AM", "Jun 3, 2026")

    data = {}
    for key, meta in RANGE_META.items():
        collected = FLAT[key]["collected"]
        txns = FLAT[key]["txns"]
        n = len(meta["labels"])
        bar = round(collected / n, 2)            # flat line: every point identical
        coll_series = [bar] * n
        net_series = [round(bar * net_rate, 2)] * n
        data[key] = {
            "rangeNote": meta["note"], "chartUnit": meta["unit"],
            "metrics": {
                "totalCollected": {"value": collected, "change": 0.0},
                "nextPayout": {"amount": next_payout_amt, "when": pw_when, "date": pw_date},
                "availableBalance": {"value": available, "change": 0.0},
                "netRevenue": {"value": round(collected * net_rate, 2), "change": 0.0},
                "pendingBalance": {"value": pending, "change": 0.0},
                "transactions": {"value": txns, "change": 0.0},
                "avgTransaction": {"value": round(collected / txns, 2), "change": 0.0},
                "refunds": {"value": round(collected * refund_rate, 2),
                            "count": int(round(txns * refund_rate)), "change": 0.0},
            },
            "chart": {"labels": meta["labels"], "collected": coll_series, "net": net_series},
            "breakdown": {
                "net": round(collected * net_rate, 2), "fees": round(collected * fee_rate, 2),
            },
        }

    # Flat transactions: six $100 completed payments.
    transactions = [{
        "name": CUSTOMER_POOL[i], "id": "TXN-%d" % (92800000 - mid * 1000 - i),
        "method": "Card", "status": "completed", "amount": 100.0, "color": TX_COLORS[i % len(TX_COLORS)],
    } for i in range(6)]

    # Payout destinations: the merchant's configured method(s), else flat placeholders.
    dests = []
    if merchant.get("ach_account"):
        bank = merchant.get("ach_bank") or "Bank"
        dests.append({"method": "ACH", "asset": "", "dest": "%s ····%s" % (bank, str(merchant["ach_account"])[-4:])})
    if merchant.get("usdt_address"):
        dests.append({"method": "Crypto", "asset": "USDT · ERC-20", "dest": merchant["usdt_address"]})
    if not dests:
        dests = [{"method": "ACH", "asset": "", "dest": "Chase ····0000"},
                 {"method": "Crypto", "asset": "USDT · ERC-20", "dest": "0x" + "0" * 40}]
    if merchant.get("payout_primary") == "usdt":
        dests.sort(key=lambda x: 0 if x["method"] == "Crypto" else 1)
    else:
        dests.sort(key=lambda x: 0 if x["method"] == "ACH" else 1)

    # Flat payouts: $25,000 each.
    payouts = []
    for i, d in enumerate(PAYOUT_DATES):
        status = "processing" if i == 0 else "paid"
        mm = dests[i % len(dests)]
        payouts.append({"date": d, "method": mm["method"], "asset": mm["asset"], "dest": mm["dest"], "status": status, "amount": 25000.0})

    return {
        "merchant": {
            "id": mid, "name": merchant["name"], "email": merchant.get("email"),
            "business_type": merchant.get("business_type"), "status": merchant.get("status"),
            "fee_percent": merchant.get("fee_percent"), "created_at": merchant.get("created_at"),
        },
        "data": data, "transactions": transactions, "payouts": payouts,
    }


def merchant_payout_methods(m):
    has_ach = bool(m.get("ach_account"))
    has_usdt = bool(m.get("usdt_address"))
    primary = m.get("payout_primary") or ("ach" if has_ach else ("usdt" if has_usdt else None))
    acct = m.get("ach_account") or ""
    return {
        "ach": {"enabled": has_ach, "bank": m.get("ach_bank") or "", "account": acct,
                "last4": acct[-4:] if acct else "", "routing": m.get("ach_routing") or ""},
        "usdt": {"enabled": has_usdt, "address": m.get("usdt_address") or ""},
        "primary": primary,
    }


def merchant_summary(merchant):
    d = gen_dashboard(merchant)
    m = d["data"]["monthly"]["metrics"]
    return {
        "id": merchant["id"], "name": merchant["name"], "email": merchant.get("email"),
        "business_type": merchant.get("business_type"), "status": merchant.get("status"),
        "fee_percent": merchant.get("fee_percent"), "created_at": merchant.get("created_at"),
        "agency_id": merchant.get("agency_id"),
        "monthVolume": m["totalCollected"]["value"], "monthTxns": m["transactions"]["value"],
        "availableBalance": m["availableBalance"]["value"],
    }


# ----------------------------- API dispatch -------------------------------
def dispatch_api(method, path, query_string, headers, body_bytes):
    """Handle /api/* requests. Returns (status:int, headers:list[(k,v)], body:bytes)."""
    ensure_init()
    user = session_user_from_cookie(headers.get("Cookie"))
    qs = parse_qs(query_string or "")

    def J(obj, status=200, set_cookie=None):
        hdrs = [("Content-Type", "application/json")]
        if set_cookie:
            hdrs.append(("Set-Cookie", set_cookie))
        return (status, hdrs, json.dumps(obj).encode("utf-8"))

    def body_json():
        try:
            return json.loads(body_bytes or b"{}")
        except (ValueError, TypeError):
            return None

    # ===================== POST =====================
    if method == "POST":
        if path == "/api/login":
            data = body_json() or {}
            u = verify_user(data.get("username", ""), data.get("password", ""))
            if not u:
                return J({"ok": False, "error": "Invalid email or password."}, 401)
            return J({"ok": True, "username": u}, set_cookie=make_session_cookie(u))

        if path == "/api/logout":
            return J({"ok": True}, set_cookie=clear_session_cookie())

        if path == "/api/signup":
            data = body_json()
            if data is None:
                return J({"ok": False, "error": "Bad request"}, 400)
            inv = get_invite(data.get("token", ""))
            if not inv:
                return J({"ok": False, "error": "Invalid invite."}, 404)
            state = invite_state(inv)
            if state != "pending":
                return J({"ok": False, "error": "This invite has %s." % state}, 410)
            password = data.get("password", "")
            if len(password) < 8:
                return J({"ok": False, "error": "Password must be at least 8 characters."}, 400)
            email = inv["email"]
            conn = get_db()
            if conn.execute("SELECT 1 AS x FROM users WHERE username=?", (email,)).fetchone():
                conn.close()
                return J({"ok": False, "error": "An account already exists for this email."}, 409)
            try:
                _insert_user(conn, email, password, inv["role"], inv["merchant_id"])
                if inv["role"] == "agency" and inv.get("commission_percent") is not None:
                    conn.execute("UPDATE users SET commission_percent=? WHERE username=?",
                                 (inv["commission_percent"], email))
            except INTEGRITY_ERRORS:
                conn.close()
                return J({"ok": False, "error": "Account already exists."}, 409)
            conn.execute("UPDATE invites SET used_at=?, used_by=? WHERE token=?", (int(time.time()), email, inv["token"]))
            conn.commit()
            conn.close()
            return J({"ok": True, "username": email}, set_cookie=make_session_cookie(email))

        if path == "/api/forgot":
            data = body_json() or {}
            email = (data.get("email") or "").strip().lower()
            urow = get_user_row(email) if email else None
            if urow:
                link = "%s/reset?token=%s" % (base_url(headers), make_reset_token(urow))
                send_reset_email(email, link)
            # Never reveal whether an account exists.
            return J({"ok": True})

        if path == "/api/reset":
            data = body_json() or {}
            email = verify_reset_token(data.get("token", ""))
            if not email:
                return J({"ok": False, "error": "This reset link is invalid or has expired."}, 400)
            password = data.get("password", "")
            if len(password) < 8:
                return J({"ok": False, "error": "Password must be at least 8 characters."}, 400)
            salt = secrets.token_hex(16)
            conn = get_db()
            conn.execute("UPDATE users SET pw_hash=?, pw_salt=? WHERE username=?",
                         (_hash_pw(password, salt), salt, email))
            conn.commit()
            conn.close()
            return J({"ok": True, "username": email}, set_cookie=make_session_cookie(email))

        row = get_user_row(user)

        if path == "/api/payout-methods":
            if not row:
                return J({"ok": False, "error": "Not authenticated"}, 401)
            data = body_json() or {}
            if row["role"] == "admin":
                try:
                    target = int(data.get("merchant_id"))
                except (TypeError, ValueError):
                    return J({"ok": False, "error": "merchant_id required"}, 400)
            else:
                target = row.get("merchant_id")
                if target is None:
                    return J({"ok": False, "error": "No merchant linked"}, 403)
            if not get_merchant(target):
                return J({"ok": False, "error": "Merchant not found"}, 404)
            ach = data.get("ach") or {}
            usdt = data.get("usdt") or {}
            ach_on, usdt_on = bool(ach.get("enabled")), bool(usdt.get("enabled"))
            if not ach_on and not usdt_on:
                return J({"ok": False, "error": "Enable at least one payout method."}, 400)
            ach_bank = ach_account = ach_routing = usdt_addr = None
            if ach_on:
                ach_bank = (ach.get("bank") or "").strip()
                ach_account = re.sub(r"\D", "", str(ach.get("account") or ""))
                ach_routing = re.sub(r"\D", "", str(ach.get("routing") or ""))
                if not ach_bank:
                    return J({"ok": False, "error": "Bank name is required."}, 400)
                if len(ach_account) < 4:
                    return J({"ok": False, "error": "Enter a valid bank account number."}, 400)
                if len(ach_routing) != 9:
                    return J({"ok": False, "error": "Routing number must be 9 digits."}, 400)
            if usdt_on:
                usdt_addr = (usdt.get("address") or "").strip()
                if not re.match(r"^0x[0-9a-fA-F]{40}$", usdt_addr):
                    return J({"ok": False, "error": "Enter a valid USDT (ERC-20) address: 0x followed by 40 hex characters."}, 400)
            primary = data.get("primary")
            if ach_on and usdt_on:
                primary = primary if primary in ("ach", "usdt") else "ach"
            else:
                primary = "ach" if ach_on else "usdt"
            conn = get_db()
            conn.execute(
                "UPDATE merchants SET ach_bank=?, ach_account=?, ach_routing=?, usdt_address=?, payout_primary=? WHERE id=?",
                (ach_bank, ach_account, ach_routing, usdt_addr, primary, target),
            )
            conn.commit()
            conn.close()
            return J({"ok": True, "methods": merchant_payout_methods(get_merchant(target))})

        if path == "/api/invites":
            if not row or row["role"] != "admin":
                return J({"ok": False, "error": "Admins only"}, 403)
            data = body_json() or {}
            email = (data.get("email") or "").strip().lower()
            if "@" not in email:
                return J({"ok": False, "error": "A valid client email is required."}, 400)
            role = data.get("role") if data.get("role") in ("merchant", "admin", "agency") else "merchant"
            try:
                expires_days = int(data.get("expires_days", 7))
            except (TypeError, ValueError):
                expires_days = 7
            fee = data.get("fee_percent")
            try:
                fee = max(0.0, min(20.0, float(fee))) if fee not in (None, "") else None
            except (TypeError, ValueError):
                fee = None
            commission = data.get("commission_percent")
            try:
                commission = max(0.0, min(100.0, float(commission))) if commission not in (None, "") else None
            except (TypeError, ValueError):
                commission = None
            merchant_id = data.get("merchant_id")
            new_m = data.get("new_merchant")
            if role == "merchant":
                if new_m and (new_m.get("name") or "").strip():
                    conn = get_db()
                    merchant_id = insert_id(
                        conn,
                        "INSERT INTO merchants (name, email, business_type, status, created_at, fee_percent) VALUES (?,?,?,?,?,?)",
                        (new_m["name"].strip(), email, (new_m.get("business_type") or "").strip(),
                         "active", time.strftime("%Y-%m-%d"), fee if fee is not None else 2.9),
                    )
                    conn.commit()
                    conn.close()
                elif merchant_id:
                    merchant_id = int(merchant_id)
                    if not get_merchant(merchant_id):
                        return J({"ok": False, "error": "Merchant not found."}, 404)
                    if fee is not None:
                        conn = get_db()
                        conn.execute("UPDATE merchants SET fee_percent=? WHERE id=?", (fee, merchant_id))
                        conn.commit()
                        conn.close()
                else:
                    return J({"ok": False, "error": "Select a merchant or enter a new one."}, 400)
            else:
                merchant_id = None
            tok = create_invite(email, merchant_id, role, row["username"], expires_days,
                                 commission if role == "agency" else None)
            link = "%s/signup?token=%s" % (base_url(headers), tok)
            m = get_merchant(merchant_id) if merchant_id else None
            emailed = send_invite_email(email, link, m["name"] if m else None)
            return J({"ok": True, "token": tok, "link": link, "email": email, "role": role,
                      "merchant_name": m["name"] if m else None, "expires_days": expires_days,
                      "emailed": emailed})

        if path == "/api/invites/revoke":
            if not row or row["role"] != "admin":
                return J({"ok": False, "error": "Admins only"}, 403)
            data = body_json() or {}
            conn = get_db()
            n = conn.execute("DELETE FROM invites WHERE token=? AND used_at IS NULL", (data.get("token", ""),)).rowcount
            conn.commit()
            conn.close()
            return J({"ok": bool(n)})

        if path == "/api/merchant/status":
            if not row or row["role"] != "admin":
                return J({"ok": False, "error": "Admins only"}, 403)
            data = body_json() or {}
            status = (data.get("status") or "").strip().lower()
            if status not in ("active", "paused", "suspended"):
                return J({"ok": False, "error": "Invalid status."}, 400)
            try:
                mid = int(data.get("merchant_id"))
            except (TypeError, ValueError):
                return J({"ok": False, "error": "merchant_id required"}, 400)
            if not get_merchant(mid):
                return J({"ok": False, "error": "Merchant not found."}, 404)
            conn = get_db()
            conn.execute("UPDATE merchants SET status=? WHERE id=?", (status, mid))
            conn.commit()
            conn.close()
            return J({"ok": True, "merchant_id": mid, "status": status})

        if path == "/api/merchant/delete":
            if not row or row["role"] != "admin":
                return J({"ok": False, "error": "Admins only"}, 403)
            data = body_json() or {}
            try:
                mid = int(data.get("merchant_id"))
            except (TypeError, ValueError):
                return J({"ok": False, "error": "merchant_id required"}, 400)
            if not get_merchant(mid):
                return J({"ok": False, "error": "Merchant not found."}, 404)
            conn = get_db()
            conn.execute("DELETE FROM users WHERE merchant_id=?", (mid,))
            conn.execute("DELETE FROM invites WHERE merchant_id=?", (mid,))
            conn.execute("DELETE FROM merchants WHERE id=?", (mid,))
            conn.commit()
            conn.close()
            return J({"ok": True, "merchant_id": mid})

        if path == "/api/merchant/agency":
            if not row or row["role"] != "admin":
                return J({"ok": False, "error": "Admins only"}, 403)
            data = body_json() or {}
            try:
                mid = int(data.get("merchant_id"))
            except (TypeError, ValueError):
                return J({"ok": False, "error": "merchant_id required"}, 400)
            if not get_merchant(mid):
                return J({"ok": False, "error": "Merchant not found."}, 404)
            aid = data.get("agency_id")
            if aid in (None, "", "none", "null"):
                aid = None
            else:
                try:
                    aid = int(aid)
                except (TypeError, ValueError):
                    return J({"ok": False, "error": "Invalid agency."}, 400)
                a = get_user_by_id(aid)
                if not a or a["role"] != "agency":
                    return J({"ok": False, "error": "Not an agency account."}, 400)
            conn = get_db()
            conn.execute("UPDATE merchants SET agency_id=? WHERE id=?", (aid, mid))
            conn.commit()
            conn.close()
            return J({"ok": True, "merchant_id": mid, "agency_id": aid})

        if path == "/api/agency/commission":
            if not row or row["role"] != "admin":
                return J({"ok": False, "error": "Admins only"}, 403)
            data = body_json() or {}
            try:
                aid = int(data.get("agency_id"))
            except (TypeError, ValueError):
                return J({"ok": False, "error": "agency_id required"}, 400)
            comm = data.get("commission_percent")
            try:
                comm = max(0.0, min(100.0, float(comm))) if comm not in (None, "") else None
            except (TypeError, ValueError):
                return J({"ok": False, "error": "Invalid commission."}, 400)
            a = get_user_by_id(aid)
            if not a or a["role"] != "agency":
                return J({"ok": False, "error": "Not an agency account."}, 404)
            conn = get_db()
            conn.execute("UPDATE users SET commission_percent=? WHERE id=?", (comm, aid))
            conn.commit()
            conn.close()
            return J({"ok": True, "agency_id": aid, "commission_percent": comm})

        return J({"ok": False, "error": "Not found"}, 404)

    # ===================== GET =====================
    if method == "GET":
        if path == "/api/health":
            return J({"ok": True, "db": "postgres" if IS_PG else "sqlite", "email": email_configured()})

        if path == "/api/reset-info":
            email = verify_reset_token(qs.get("token", [None])[0])
            return J({"ok": True, "email": email}) if email else J({"ok": False, "error": "invalid"}, 410)

        row = get_user_row(user)

        if path == "/api/me":
            if not row:
                return J({"ok": False}, 401)
            mname = None
            if row.get("merchant_id"):
                m = get_merchant(row["merchant_id"])
                mname = m["name"] if m else None
            return J({"ok": True, "username": row["username"], "role": row["role"],
                      "merchant_id": row.get("merchant_id"), "merchant_name": mname,
                      "commission_percent": row.get("commission_percent")})

        if path == "/api/invite":
            inv = get_invite(qs.get("token", [None])[0])
            if not inv:
                return J({"ok": False, "error": "invalid"}, 404)
            state = invite_state(inv)
            if state != "pending":
                return J({"ok": False, "error": state}, 410)
            m = get_merchant(inv["merchant_id"]) if inv["merchant_id"] else None
            return J({"ok": True, "email": inv["email"], "role": inv["role"],
                      "merchant_name": m["name"] if m else None})

        if not row:
            return J({"ok": False, "error": "Not authenticated"}, 401)

        if path == "/api/dashboard":
            req_id = qs.get("merchant_id", [None])[0]
            if row["role"] == "admin":
                if not req_id:
                    return J({"ok": False, "error": "merchant_id required"}, 400)
                target = int(req_id)
            elif row["role"] == "agency":
                if not req_id:
                    return J({"ok": False, "error": "merchant_id required"}, 400)
                target = int(req_id)
                m_chk = get_merchant(target)
                if not m_chk or m_chk.get("agency_id") != row["id"]:
                    return J({"ok": False, "error": "Forbidden"}, 403)
            else:
                target = row.get("merchant_id")
                if target is None:
                    return J({"ok": False, "error": "No merchant linked to this account"}, 403)
                if req_id and int(req_id) != target:
                    return J({"ok": False, "error": "Forbidden"}, 403)
            merchant = get_merchant(target)
            if not merchant:
                return J({"ok": False, "error": "Merchant not found"}, 404)
            result = {"ok": True}
            result.update(gen_dashboard(merchant))
            return J(result)

        if path == "/api/payout-methods":
            req_id = qs.get("merchant_id", [None])[0]
            if row["role"] == "admin":
                if not req_id:
                    return J({"ok": False, "error": "merchant_id required"}, 400)
                target = int(req_id)
            else:
                target = row.get("merchant_id")
                if target is None:
                    return J({"ok": False, "error": "No merchant linked"}, 403)
                if req_id and int(req_id) != target:
                    return J({"ok": False, "error": "Forbidden"}, 403)
            merchant = get_merchant(target)
            if not merchant:
                return J({"ok": False, "error": "Merchant not found"}, 404)
            return J({"ok": True, "merchant_name": merchant["name"], "methods": merchant_payout_methods(merchant)})

        if path == "/api/merchants":
            if row["role"] == "admin":
                ms = all_merchants()
            elif row["role"] == "agency":
                ms = merchants_for_agency(row["id"])
            else:
                return J({"ok": False, "error": "Forbidden"}, 403)
            return J({"ok": True, "merchants": [merchant_summary(m) for m in ms]})

        if path == "/api/agencies":
            if row["role"] != "admin":
                return J({"ok": False, "error": "Admins only"}, 403)
            return J({"ok": True, "agencies": list_agencies()})

        if path == "/api/invites":
            if row["role"] != "admin":
                return J({"ok": False, "error": "Admins only"}, 403)
            return J({"ok": True, "invites": list_invites()})

        return J({"ok": False, "error": "Not found"}, 404)

    return J({"ok": False, "error": "Method not allowed"}, 405)


# ----------------------------- CLI ----------------------------------------
def cli(argv):
    init_db()
    cmd = argv[1] if len(argv) > 1 else None
    conn = get_db()
    if cmd == "adduser" and len(argv) >= 4:
        role = argv[4] if len(argv) > 4 else "merchant"
        mid = int(argv[5]) if len(argv) > 5 else None
        try:
            _insert_user(conn, argv[2], argv[3], role, mid)
            print("Created user:", argv[2].lower(), "role=", role, "merchant_id=", mid)
        except INTEGRITY_ERRORS:
            print("User already exists:", argv[2].lower())
    elif cmd == "addmerchant" and len(argv) >= 5:
        mid = insert_id(conn, "INSERT INTO merchants (name, email, business_type, status, created_at) VALUES (?,?,?,?,?)",
                        (argv[2], argv[3], argv[4], "active", time.strftime("%Y-%m-%d")))
        conn.commit()
        print("Created merchant id=%s: %s" % (mid, argv[2]))
    elif cmd == "delmerchant" and len(argv) >= 3:
        mid = int(argv[2])
        if not get_merchant(mid):
            print("No such merchant id:", mid)
        else:
            conn.execute("DELETE FROM users WHERE merchant_id=?", (mid,))
            conn.execute("DELETE FROM invites WHERE merchant_id=?", (mid,))
            conn.execute("DELETE FROM merchants WHERE id=?", (mid,))
            conn.commit()
            print("Deleted merchant id=%d (and its login + invites)." % mid)
    elif cmd == "setrole" and len(argv) >= 4:
        n = conn.execute("UPDATE users SET role=? WHERE username=?", (argv[3], argv[2].lower())).rowcount
        conn.commit()
        print("Role updated." if n else "No such user:", argv[2].lower())
    elif cmd == "setmerchant" and len(argv) >= 4:
        n = conn.execute("UPDATE users SET merchant_id=? WHERE username=?", (int(argv[3]), argv[2].lower())).rowcount
        conn.commit()
        print("Merchant link updated." if n else "No such user:", argv[2].lower())
    elif cmd == "deluser" and len(argv) >= 3:
        email = argv[2].strip().lower()
        admins = conn.execute("SELECT COUNT(*) AS n FROM users WHERE role='admin'").fetchone()["n"]
        target = conn.execute("SELECT role FROM users WHERE username=?", (email,)).fetchone()
        if not target:
            print("No such user:", email)
        elif target["role"] == "admin" and admins <= 1:
            print("Refusing to delete the last admin account:", email)
        else:
            conn.execute("DELETE FROM users WHERE username=?", (email,))
            conn.commit()
            print("Deleted user:", email)
    elif cmd == "passwd" and len(argv) >= 4:
        salt = secrets.token_hex(16)
        n = conn.execute("UPDATE users SET pw_hash=?, pw_salt=? WHERE username=?",
                         (_hash_pw(argv[3], salt), salt, argv[2].strip().lower())).rowcount
        conn.commit()
        print("Password updated." if n else "No such user:", argv[2].lower())
    elif cmd == "listusers":
        for r in conn.execute("SELECT username, role, merchant_id, last_login FROM users ORDER BY id").fetchall():
            r = dict(r)
            seen = time.strftime("%Y-%m-%d %H:%M", time.localtime(r["last_login"])) if r["last_login"] else "never"
            print("  %-34s role=%-9s merchant_id=%4s  last_login=%s" % (r["username"], r["role"], str(r["merchant_id"]), seen))
    elif cmd == "listmerchants":
        for m in conn.execute("SELECT * FROM merchants ORDER BY id").fetchall():
            m = dict(m)
            print("  [%s] %-18s %-8s %s" % (m["id"], m["name"], m["status"], m["email"]))
    else:
        print(__doc__)
    conn.close()
