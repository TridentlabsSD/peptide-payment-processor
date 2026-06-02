/* ============================================================
   3PSolutions Dashboard — Google Sheet data layer
   ------------------------------------------------------------
   Fetches the generic per-tab JSON produced by the Apps Script
   Web App (apps-script/Code.gs) and maps it into the shape the
   dashboard renderer expects.

   The Apps Script returns one array of row-objects per tab:
     { Metrics: [...], NextPayout: [...], Chart: [...],
       Breakdown: [...], Transactions: [...], Payouts: [...] }
   ============================================================ */

const RANGE_META = {
  daily:   { rangeNote: "vs. yesterday",  chartUnit: "Hour" },
  weekly:  { rangeNote: "vs. last week",  chartUnit: "Day" },
  monthly: { rangeNote: "vs. last month", chartUnit: "Week" },
};
const RANGES = ["daily", "weekly", "monthly"];

// Fetch + transform. Returns null when no URL is configured.
async function loadDashboardData() {
  if (!CONFIG.SHEET_API_URL) return null;
  const res = await fetch(CONFIG.SHEET_API_URL, { method: "GET", redirect: "follow" });
  if (!res.ok) throw new Error("Sheet request failed: HTTP " + res.status);
  const raw = await res.json();
  return transformSheetData(raw);
}

function transformSheetData(raw) {
  const num = (v) => (v === "" || v === null || v === undefined ? 0 : Number(v));

  const metricByKey = {};
  (raw.Metrics || []).forEach((r) => { metricByKey[r.key] = r; });

  const payoutByRange = {};
  (raw.NextPayout || []).forEach((r) => { payoutByRange[r.range] = r; });

  const breakdownByRange = {};
  (raw.Breakdown || []).forEach((r) => { breakdownByRange[r.range] = r; });

  const data = {};
  RANGES.forEach((range) => {
    const mv = (key) => num((metricByKey[key] || {})[range]);
    const mc = (key) => num((metricByKey[key] || {})[range + "_change"]);
    const np = payoutByRange[range] || {};
    const bd = breakdownByRange[range] || {};
    const chartRows = (raw.Chart || []).filter((r) => r.range === range);

    data[range] = {
      rangeNote: RANGE_META[range].rangeNote,
      chartUnit: RANGE_META[range].chartUnit,
      metrics: {
        totalCollected:   { value: mv("totalCollected"),   change: mc("totalCollected") },
        nextPayout:       { amount: num(np.amount), when: np.when || "", date: np.date || "" },
        availableBalance: { value: mv("availableBalance"), change: mc("availableBalance") },
        netRevenue:       { value: mv("netRevenue"),       change: mc("netRevenue") },
        pendingBalance:   { value: mv("pendingBalance"),   change: mc("pendingBalance") },
        transactions:     { value: mv("transactions"),     change: mc("transactions") },
        avgTransaction:   { value: mv("avgTransaction"),   change: mc("avgTransaction") },
        refunds:          { value: mv("refunds"), count: mv("refundsCount"), change: mc("refunds") },
      },
      chart: {
        labels: chartRows.map((r) => r.label),
        collected: chartRows.map((r) => num(r.collected)),
        net: chartRows.map((r) => num(r.net)),
      },
      breakdown: {
        net: num(bd.net), fees: num(bd.fees),
        refunds: num(bd.refunds), chargebacks: num(bd.chargebacks),
      },
    };
  });

  const transactions = (raw.Transactions || []).map((r) => ({
    name: r.name, id: r.id, method: r.method, status: String(r.status || "").toLowerCase(),
    amount: num(r.amount), color: r.color || "#0A2540",
  }));

  const payouts = (raw.Payouts || []).map((r) => ({
    date: r.date,
    method: r.method || "ACH",
    asset: r.asset || "",
    dest: r.dest,
    status: String(r.status || "").toLowerCase(),
    amount: num(r.amount),
  }));

  return { data, transactions, payouts };
}
