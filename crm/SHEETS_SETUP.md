# Syncing the dashboard from a Google Sheet

The dashboard reads its data **from a Google Sheet** — the Sheet is the source
of truth. You edit the Sheet; the site reflects the changes. This is one-way
(Sheet → site), which keeps it simple and safe.

```
Google Sheet  ──(Apps Script Web App, JSON)──▶  Dashboard (reads & displays)
   you edit                                         auto-updates
```

## Why this design

- **No backend server needed.** The dashboard is a static site, and Google
  Apps Script hosts the read endpoint for free.
- **No credentials in the browser.** Reading is public-by-URL; nothing
  sensitive ships to the client. (See *Security* below.)
- **Anyone on your team can manage data** in a familiar spreadsheet.

## One-time setup (~5 minutes)

1. **Create a Google Sheet** in the account that should own the data.
2. Open **Extensions ▸ Apps Script**. Delete the placeholder code.
3. Paste the contents of [`apps-script/Code.gs`](apps-script/Code.gs) and click
   **Save**.
4. In the function dropdown choose **`setupSampleData`** and click **Run**.
   Approve the permission prompt the first time. This creates and fills six
   tabs: `Metrics`, `NextPayout`, `Chart`, `Breakdown`, `Transactions`,
   `Payouts`.
5. Click **Deploy ▸ New deployment ▸ Web app**:
   - **Execute as:** Me
   - **Who has access:** Anyone
   - Click **Deploy** and copy the **Web app URL** (ends in `/exec`).
6. Open [`assets/config.js`](assets/config.js) and paste that URL into
   `SHEET_API_URL`. Optionally set `REFRESH_SECONDS` (e.g. `30`) to auto-refresh.
7. Reload the dashboard. The badge by the date toggle should turn green —
   **"Live from Google Sheet."**

If the URL is left blank, or the Sheet can't be reached, the dashboard falls
back to built-in sample data and the badge says so.

## How the tabs map to the dashboard

| Tab            | Purpose                          | Columns |
| -------------- | -------------------------------- | ------- |
| `Metrics`      | KPI values + % change per range  | `key`, `daily`, `daily_change`, `weekly`, `weekly_change`, `monthly`, `monthly_change` |
| `NextPayout`   | Next payout per range            | `range`, `amount`, `when`, `date` |
| `Chart`        | Revenue-over-time series         | `range`, `label`, `collected`, `net` |
| `Breakdown`    | Net / fees / refunds / chargebacks | `range`, `net`, `fees`, `refunds`, `chargebacks` |
| `Transactions` | Recent transactions table        | `name`, `id`, `method`, `status`, `amount`, `color` |
| `Payouts`      | Payout history table             | `date`, `method`, `asset`, `dest`, `status`, `amount` |

**Metric keys** (rows in the `Metrics` tab): `totalCollected`,
`availableBalance`, `netRevenue`, `pendingBalance`, `transactions`,
`avgTransaction`, `refunds`, `refundsCount`.

**Status values** that get colored pills: `completed` / `paid` (green),
`pending` / `processing` (amber), `failed` / `refunded` (red).

**Payout destinations** — set `method` to `ACH` or `Crypto`:
- `ACH` → leave `asset` blank; put the bank + last 4 in `dest` (e.g. `Chase ····4821`).
- `Crypto` → USDT on **ERC-20 only**. Set `asset` to `USDT · ERC-20` and put the
  full `0x…` wallet address in `dest`. The dashboard truncates it to `0x7F3a…b2A4`
  and shows the full address on hover.

To add or change data, just edit cells in the Sheet — no redeploy needed. To
add a whole new metric or column, update the matching mapping in
[`assets/sheet.js`](assets/sheet.js).

## Updating the Sheet automatically (optional, later)

The Sheet is the source of truth, but a human doesn't have to type into it. You
can have your payment-processing backend push rows into the Sheet on a schedule
or on each transaction, using either:

- the **Google Sheets API** with a service account, or
- an Apps Script **`doPost`** endpoint the backend calls.

That keeps today's read path unchanged — the dashboard still just reads the
Sheet — while the Sheet itself stays current.

## Security note

A web app deployed as **"Anyone"** is reachable by anyone who has the
(unguessable) `/exec` URL. That's fine for a prototype and non-secret figures.
Before production with real financial data, tighten this:

- Deploy as **"Anyone with Google account"** and put the dashboard behind login, or
- Front the data with a proper authenticated backend (when Node.js / a server
  is available) and keep the Sheet private to a service account.
