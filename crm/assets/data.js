/* ============================================================
   Fallback sample data for the 3PSolutions Merchant Dashboard.
   These objects are ONLY used when CONFIG.SHEET_API_URL is empty
   or the Google Sheet can't be reached. When a Sheet URL is set,
   live data from the Sheet replaces everything below.
   The shapes here also document exactly what the Sheet must
   provide (see assets/sheet.js for the mapping).
   ============================================================ */

const SAMPLE_DATA = {
  daily: {
    rangeNote: "vs. yesterday",
    chartUnit: "Hour",
    metrics: {
      totalCollected: { value: 18420.5, change: 12.4 },
      nextPayout: { amount: 14250.0, when: "Tomorrow · 9:00 AM", date: "Jun 2, 2026" },
      availableBalance: { value: 9820.0, change: 4.1 },
      netRevenue: { value: 17105.3, change: 9.8 },
      pendingBalance: { value: 4310.0, change: -2.3 },
      transactions: { value: 64, change: 8.0 },
      avgTransaction: { value: 287.82, change: 3.9 },
      refunds: { value: 412.0, count: 2, change: -1.2 },
    },
    chart: {
      labels: ["8a", "9a", "10a", "11a", "12p", "1p", "2p", "3p", "4p", "5p", "6p", "7p"],
      collected: [820, 1340, 1610, 2080, 1750, 1920, 2240, 1680, 1430, 1180, 940, 1430],
      net: [760, 1245, 1500, 1930, 1625, 1780, 2080, 1560, 1325, 1095, 870, 1335],
    },
    breakdown: { net: 17105.3, fees: 552.62, refunds: 412.0, chargebacks: 150.0 },
  },

  weekly: {
    rangeNote: "vs. last week",
    chartUnit: "Day",
    metrics: {
      totalCollected: { value: 124680.0, change: 8.6 },
      nextPayout: { amount: 38940.0, when: "Mon · 9:00 AM", date: "Jun 3, 2026" },
      availableBalance: { value: 41250.0, change: 6.2 },
      netRevenue: { value: 115430.2, change: 7.1 },
      pendingBalance: { value: 18620.0, change: 3.4 },
      transactions: { value: 428, change: 5.5 },
      avgTransaction: { value: 291.31, change: 2.9 },
      refunds: { value: 2840.0, count: 11, change: 4.0 },
    },
    chart: {
      labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      collected: [16420, 18950, 21300, 19870, 22480, 14260, 11400],
      net: [15180, 17560, 19720, 18390, 20810, 13190, 10580],
    },
    breakdown: { net: 115430.2, fees: 3741.4, refunds: 2840.0, chargebacks: 668.4 },
  },

  monthly: {
    rangeNote: "vs. last month",
    chartUnit: "Week",
    metrics: {
      totalCollected: { value: 512340.0, change: 14.2 },
      nextPayout: { amount: 38940.0, when: "Mon · 9:00 AM", date: "Jun 3, 2026" },
      availableBalance: { value: 41250.0, change: 6.2 },
      netRevenue: { value: 476120.0, change: 12.7 },
      pendingBalance: { value: 23980.0, change: 5.1 },
      transactions: { value: 1762, change: 9.8 },
      avgTransaction: { value: 290.77, change: 4.0 },
      refunds: { value: 11260.0, count: 47, change: -3.5 },
    },
    chart: {
      labels: ["Week 1", "Week 2", "Week 3", "Week 4"],
      collected: [118400, 126900, 131800, 135240],
      net: [110100, 117800, 122500, 125720],
    },
    breakdown: { net: 476120.0, fees: 15370.2, refunds: 11260.0, chargebacks: 3589.8 },
  },
};

// Recent transactions (most recent first)
const TRANSACTIONS = [
  { name: "Helix Labs", id: "TXN-92841", method: "Card", status: "completed", amount: 1240.0, color: "#1B6EF3" },
  { name: "Vireo Wellness", id: "TXN-92840", method: "ACH", status: "processing", amount: 860.5, color: "#16A34A" },
  { name: "Nordic Peptides", id: "TXN-92839", method: "Card", status: "completed", amount: 432.0, color: "#7C3AED" },
  { name: "Aster Bio", id: "TXN-92838", method: "Crypto", status: "completed", amount: 2980.0, color: "#0EA5E9" },
  { name: "Quanta Health", id: "TXN-92837", method: "Card", status: "refunded", amount: -212.0, color: "#E5484D" },
  { name: "Lumen Research", id: "TXN-92836", method: "ACH", status: "pending", amount: 1575.0, color: "#E5A50A" },
  { name: "Cascade Supply", id: "TXN-92835", method: "Card", status: "completed", amount: 689.99, color: "#0A2540" },
];

// Payout history (most recent first).
// method: "ACH" (dest = bank ····last4) or "Crypto" (dest = wallet address, asset = token/network)
const PAYOUTS = [
  { date: "Jun 03, 2026", method: "ACH",    asset: "",             dest: "Chase ····4821",                              status: "processing", amount: 38940.0 },
  { date: "May 30, 2026", method: "ACH",    asset: "",             dest: "Chase ····4821",                              status: "paid",       amount: 36120.0 },
  { date: "May 28, 2026", method: "Crypto", asset: "USDT · ERC-20", dest: "0x7F3a4E91c2B6d05A8f1E9C2b7D4a3F0e15C9b2A4", status: "paid",       amount: 18500.0 },
  { date: "May 23, 2026", method: "ACH",    asset: "",             dest: "Chase ····4821",                              status: "paid",       amount: 34890.0 },
  { date: "May 21, 2026", method: "Crypto", asset: "USDT · ERC-20", dest: "0x7F3a4E91c2B6d05A8f1E9C2b7D4a3F0e15C9b2A4", status: "paid",       amount: 12750.0 },
  { date: "May 16, 2026", method: "ACH",    asset: "",             dest: "Chase ····4821",                              status: "paid",       amount: 41030.0 },
  { date: "May 14, 2026", method: "Crypto", asset: "USDT · ERC-20", dest: "0x7F3a4E91c2B6d05A8f1E9C2b7D4a3F0e15C9b2A4", status: "paid",       amount: 9800.0 },
];
