/* ============================================================
   3PSolutions Merchant Dashboard — Google Sheets backend
   ------------------------------------------------------------
   This script turns a Google Sheet into the read-only source of
   truth for the dashboard. The dashboard fetches doGet() as JSON.

   SETUP (see ../SHEETS_SETUP.md for the full walkthrough):
     1. Create a Google Sheet.
     2. Extensions ▸ Apps Script, paste this file, Save.
     3. Run setupSampleData() once to create + seed the tabs.
     4. Deploy ▸ New deployment ▸ Web app
          - Execute as: Me
          - Who has access: Anyone
        Copy the /exec URL into assets/config.js (SHEET_API_URL).
   ============================================================ */

/** Serves every tab as JSON: { TabName: [ {col: val, ...}, ... ] } */
function doGet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const out = {};
  ss.getSheets().forEach(function (sheet) {
    const name = sheet.getName();
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) { out[name] = []; return; }
    const headers = values[0].map(function (h) { return String(h).trim(); });
    out[name] = values.slice(1)
      .filter(function (row) { return row.some(function (c) { return c !== '' && c !== null; }); })
      .map(function (row) {
        const obj = {};
        headers.forEach(function (h, i) { if (h) obj[h] = row[i]; });
        return obj;
      });
  });
  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Run ONCE to create all tabs and fill them with starter data.
    Safe to re-run: it clears and rewrites each tab. */
function setupSampleData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  writeTab(ss, 'Metrics', [
    ['key', 'daily', 'daily_change', 'weekly', 'weekly_change', 'monthly', 'monthly_change'],
    ['totalCollected', 18420.5, 12.4, 124680, 8.6, 512340, 14.2],
    ['availableBalance', 9820, 4.1, 41250, 6.2, 41250, 6.2],
    ['netRevenue', 17105.3, 9.8, 115430.2, 7.1, 476120, 12.7],
    ['pendingBalance', 4310, -2.3, 18620, 3.4, 23980, 5.1],
    ['transactions', 64, 8.0, 428, 5.5, 1762, 9.8],
    ['avgTransaction', 287.82, 3.9, 291.31, 2.9, 290.77, 4.0],
    ['refunds', 412, -1.2, 2840, 4.0, 11260, -3.5],
    ['refundsCount', 2, '', 11, '', 47, ''],
  ]);

  writeTab(ss, 'NextPayout', [
    ['range', 'amount', 'when', 'date'],
    ['daily', 14250, 'Tomorrow · 9:00 AM', 'Jun 2, 2026'],
    ['weekly', 38940, 'Mon · 9:00 AM', 'Jun 3, 2026'],
    ['monthly', 38940, 'Mon · 9:00 AM', 'Jun 3, 2026'],
  ]);

  writeTab(ss, 'Chart', [['range', 'label', 'collected', 'net']].concat(
    zip('daily',
      ['8a','9a','10a','11a','12p','1p','2p','3p','4p','5p','6p','7p'],
      [820,1340,1610,2080,1750,1920,2240,1680,1430,1180,940,1430],
      [760,1245,1500,1930,1625,1780,2080,1560,1325,1095,870,1335]),
    zip('weekly',
      ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
      [16420,18950,21300,19870,22480,14260,11400],
      [15180,17560,19720,18390,20810,13190,10580]),
    zip('monthly',
      ['Week 1','Week 2','Week 3','Week 4'],
      [118400,126900,131800,135240],
      [110100,117800,122500,125720])
  ));

  writeTab(ss, 'Breakdown', [
    ['range', 'net', 'fees', 'refunds', 'chargebacks'],
    ['daily', 17105.3, 552.62, 412, 150],
    ['weekly', 115430.2, 3741.4, 2840, 668.4],
    ['monthly', 476120, 15370.2, 11260, 3589.8],
  ]);

  writeTab(ss, 'Transactions', [
    ['name', 'id', 'method', 'status', 'amount', 'color'],
    ['Helix Labs', 'TXN-92841', 'Card', 'completed', 1240.0, '#1B6EF3'],
    ['Vireo Wellness', 'TXN-92840', 'ACH', 'processing', 860.5, '#16A34A'],
    ['Nordic Peptides', 'TXN-92839', 'Card', 'completed', 432.0, '#7C3AED'],
    ['Aster Bio', 'TXN-92838', 'Crypto', 'completed', 2980.0, '#0EA5E9'],
    ['Quanta Health', 'TXN-92837', 'Card', 'refunded', -212.0, '#E5484D'],
    ['Lumen Research', 'TXN-92836', 'ACH', 'pending', 1575.0, '#E5A50A'],
    ['Cascade Supply', 'TXN-92835', 'Card', 'completed', 689.99, '#0A2540'],
  ]);

  writeTab(ss, 'Payouts', [
    ['date', 'method', 'asset', 'dest', 'status', 'amount'],
    ['Jun 03, 2026', 'ACH', '', 'Chase ····4821', 'processing', 38940.0],
    ['May 30, 2026', 'ACH', '', 'Chase ····4821', 'paid', 36120.0],
    ['May 28, 2026', 'Crypto', 'USDT · ERC-20', '0x7F3a4E91c2B6d05A8f1E9C2b7D4a3F0e15C9b2A4', 'paid', 18500.0],
    ['May 23, 2026', 'ACH', '', 'Chase ····4821', 'paid', 34890.0],
    ['May 21, 2026', 'Crypto', 'USDT · ERC-20', '0x7F3a4E91c2B6d05A8f1E9C2b7D4a3F0e15C9b2A4', 'paid', 12750.0],
    ['May 16, 2026', 'ACH', '', 'Chase ····4821', 'paid', 41030.0],
    ['May 14, 2026', 'Crypto', 'USDT · ERC-20', '0x7F3a4E91c2B6d05A8f1E9C2b7D4a3F0e15C9b2A4', 'paid', 9800.0],
  ]);

  SpreadsheetApp.getActive().toast('All tabs created and seeded.', '3PSolutions', 5);
}

/* ---- helpers ---- */
function writeTab(ss, name, rows) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  sheet.clear();
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sheet.getRange(1, 1, 1, rows[0].length).setFontWeight('bold');
  sheet.setFrozenRows(1);
}

function zip(range, labels, collected, net) {
  return labels.map(function (label, i) { return [range, label, collected[i], net[i]]; });
}
