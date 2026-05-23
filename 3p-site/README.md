# 3P — Peptide Payment Processor

Marketing site for 3P, the first payment processor purpose-built for peptide merchants.

**Live:** [peptidepaymentprocessor.com](https://peptidepaymentprocessor.com)

## Stack

- Vanilla HTML/CSS/JS — single file (`index.html`)
- Hosted on Vercel
- Auto-deploys from `main` branch

## Local development

Open `index.html` in any browser. That's it. No build step.

## File structure

```
.
├── index.html       # The entire site
├── logo.png         # Brand logo (also embedded as base64 inside index.html)
├── vercel.json      # Deploy config + security headers
├── .gitignore
└── README.md
```

## Deployment

Every push to `main` auto-deploys to Vercel.

```bash
git add .
git commit -m "Update copy"
git push
```

Live in ~30 seconds.

## Editing copy

All content lives in `index.html`. Search for the section you want (e.g. `<!-- ============== PRICING ==`) and edit directly.

## CTAs

All "Contact Us" buttons link to Telegram: `https://t.me/use3psolutions`

To change the Telegram handle, find/replace `t.me/use3psolutions` site-wide in `index.html`.
