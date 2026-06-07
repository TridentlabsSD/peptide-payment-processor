# 3PSolutions — Settlement Webhook

Push real settlement figures for a merchant and they appear on that merchant's
dashboard immediately. Send this document to your underlying provider.

## Endpoint

```
POST  https://app.use3psolutions.com/api/webhook
Content-Type: application/json
```

## Authentication

Every request must include the shared secret in a header:

```
X-Webhook-Secret: <WEBHOOK_SECRET>
```

(Alternatively `Authorization: Bearer <WEBHOOK_SECRET>`.) Requests without the
correct secret get `401 Unauthorized`. The secret is the `WEBHOOK_SECRET`
environment variable on the server — share it with the provider over a secure
channel; never put it in client code.

## Body

Identify the merchant by **`merchant_id`** (our internal id) *or*
**`merchant_email`**. Optionally set **`period`** (`daily`, `weekly`, `monthly`,
or `all` — default `all`). Then send any of the settlement amounts (positive
numbers); anything omitted keeps its current/sample value:

| Field | Meaning |
| --- | --- |
| `gross` | Gross processed → **Total Collected** card |
| `fee` | Processing fee |
| `net` | Net (gross − fee) → **Net Revenue** card |
| `hold` | Reserve held → **Pending Balance** card |
| `refund_dispute` | Refunds / disputes → **Refunds** card |
| `dispute_win` | Disputes won back |
| `release` | Held reserve released this period |
| `payout` | Amount paid out → **Next Payout** card |
| `rent_fee` | Rent fee |
| `sent_to_merchant` | Sent to merchant |
| `receive` | Received |
| `exchange_to_clients` | After FX/exchange to clients |
| `paid` | Already paid out to clients |
| `left_balance` | Remaining balance → **Available Balance** card |

> All 14 fields are stored, so they're ready for the detailed settlement view —
> today they map onto the dashboard cards shown above.

### Example

```bash
curl -X POST https://app.use3psolutions.com/api/webhook \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: <WEBHOOK_SECRET>" \
  -d '{
    "merchant_email": "merchant@example.com",
    "period": "all",
    "gross": 204.00, "fee": 10.53, "net": 193.47, "hold": 19.35,
    "release": 19.35, "payout": 193.47, "rent_fee": 15.48,
    "sent_to_merchant": 177.99, "receive": 177.99,
    "exchange_to_clients": 170.87, "paid": 0, "left_balance": 170.87
  }'
```

## Responses

| Status | Meaning |
| --- | --- |
| `200 {"ok": true, ...}` | Stored; the merchant's dashboard now reflects it |
| `401` | Missing/incorrect `X-Webhook-Secret` |
| `404` | Unknown merchant |
| `400` | Bad JSON, bad `period`, or no settlement fields |
| `503` | `WEBHOOK_SECRET` not configured on the server |

## Notes

- **Idempotent / latest-wins:** each call replaces the stored figures for that
  `(merchant, period)`. Send the current snapshot whenever it changes.
- Until a webhook is received for a merchant, the dashboard shows sample data.
- Send `period` values separately (`daily`/`weekly`/`monthly`) for per-range
  figures; otherwise `all` drives every range.
