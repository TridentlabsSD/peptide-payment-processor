/* ============================================================
   3PSolutions Merchant Dashboard — app logic
   ============================================================ */

// ---- Inline SVG icon set (applied via CSS mask) ----
const ICONS = {
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  swap: 'M7 7h11l-3-3M17 17H6l3 3',
  payout: 'M3 7h18v10H3zM3 11h18M7 15h3',
  users: 'M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM2 21a6 6 0 0 1 12 0M17 11a4 4 0 0 0 5 7',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  cog: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 0 0-1.7-1l-.3-2.5h-4l-.3 2.5a7 7 0 0 0-1.7 1l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 1.7 1l.3 2.5h4l.3-2.5a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.5c.07-.33.1-.66.1-1z',
  help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.5 9a2.5 2.5 0 0 1 4.8 1c0 1.7-2.3 2-2.3 3.5M12 17h.01',
  search: 'M21 21l-4.3-4.3M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  cash: 'M3 6h18v12H3zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  wallet: 'M3 7h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12v4M17 13h.01',
  trend: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  receipt: 'M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM8 8h8M8 12h8M8 16h5',
  arrowUp: 'M12 19V5M5 12l7-7 7 7',
  arrowDown: 'M12 5v14M5 12l7 7 7-7',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  bank: 'M3 21h18M4 10l8-5 8 5M5 10v9M19 10v9M9 10v9M15 10v9',
  crypto: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM9.5 8H13a2 2 0 0 1 0 4H9.5m0 0H13a2 2 0 0 1 0 4H9.5M11 6.5v11',
  back: 'M19 12H5M12 19l-7-7 7-7',
  close: 'M18 6 6 18M6 6l12 12',
  plus: 'M12 5v14M5 12h14',
  trash: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6',
};

function applyIcon(el, name, size) {
  const path = ICONS[name];
  if (!path) return;
  const svg = `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='${path}'/></svg>`
  )}")`;
  el.style.webkitMaskImage = svg;
  el.style.maskImage = svg;
  if (size) { el.style.width = size + 'px'; el.style.height = size + 'px'; }
}

document.querySelectorAll('[data-ico]').forEach((el) => applyIcon(el, el.getAttribute('data-ico')));

// ---- Formatters ----
const fmtMoney = (n, max = 2) =>
  '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: max, maximumFractionDigits: max });
const fmtMoney0 = (n) => '$' + Math.round(n).toLocaleString('en-US');
const fmtNum = (n) => Number(n).toLocaleString('en-US');
const fmtPct = (n) => (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
// Truncate a long crypto address to first 6 + … + last 4 chars.
const shortAddr = (a) => {
  const s = String(a || '');
  return s.length > 14 ? s.slice(0, 6) + '…' + s.slice(-4) : s;
};

// ---- Build metric cards ----
function metricCard({ label, value, icon, chip, foot, feature }) {
  const chipHtml = chip
    ? `<span class="chip ${chip.dir}"><span data-ico="${chip.dir === 'up' ? 'arrowUp' : 'arrowDown'}" style="width:12px;height:12px"></span>${fmtPct(chip.value)}</span>`
    : '';
  return `
    <div class="metric ${feature ? 'feature' : ''}">
      <div class="metric-top">
        <span class="metric-label">${label}</span>
        <span class="metric-ico" data-ico="${icon}"></span>
      </div>
      <div class="metric-value">${value}</div>
      <div class="metric-foot">${chipHtml}<span>${foot}</span></div>
    </div>`;
}

function renderMetrics(d) {
  const m = d.metrics;
  const cards = [
    metricCard({
      label: 'Total Cash Collected',
      value: fmtMoney0(m.totalCollected.value),
      icon: 'cash',
      chip: { dir: m.totalCollected.change >= 0 ? 'up' : 'down', value: m.totalCollected.change },
      foot: d.rangeNote,
      feature: true,
    }),
    metricCard({
      label: 'Next Payout',
      value: fmtMoney0(m.nextPayout.amount),
      icon: 'payout',
      foot: m.nextPayout.when,
    }),
    metricCard({
      label: 'Available Balance',
      value: fmtMoney0(m.availableBalance.value),
      icon: 'wallet',
      chip: { dir: m.availableBalance.change >= 0 ? 'up' : 'down', value: m.availableBalance.change },
      foot: 'ready to pay out',
    }),
    metricCard({
      label: 'Net Revenue',
      value: fmtMoney0(m.netRevenue.value),
      icon: 'trend',
      chip: { dir: m.netRevenue.change >= 0 ? 'up' : 'down', value: m.netRevenue.change },
      foot: 'after processing fee',
    }),
    metricCard({
      label: 'Pending Balance',
      value: fmtMoney0(m.pendingBalance.value),
      icon: 'receipt',
      chip: { dir: m.pendingBalance.change >= 0 ? 'up' : 'down', value: m.pendingBalance.change },
      foot: 'still settling',
    }),
    metricCard({
      label: 'Transactions',
      value: fmtNum(m.transactions.value),
      icon: 'swap',
      chip: { dir: m.transactions.change >= 0 ? 'up' : 'down', value: m.transactions.change },
      foot: d.rangeNote,
    }),
    metricCard({
      label: 'Avg. Transaction',
      value: fmtMoney(m.avgTransaction.value),
      icon: 'chart',
      chip: { dir: m.avgTransaction.change >= 0 ? 'up' : 'down', value: m.avgTransaction.change },
      foot: 'per payment',
    }),
    metricCard({
      label: 'Refunds',
      value: fmtMoney0(m.refunds.value),
      icon: 'help',
      chip: { dir: m.refunds.change <= 0 ? 'up' : 'down', value: m.refunds.change },
      foot: m.refunds.count + ' refunds issued',
    }),
  ];
  const wrap = document.getElementById('metrics');
  wrap.innerHTML = cards.join('');
  wrap.querySelectorAll('[data-ico]').forEach((el) => applyIcon(el, el.getAttribute('data-ico')));
}

// ---- Charts ----
let revenueChart, breakdownChart;

function makeGradient(ctx, area, hex) {
  const g = ctx.createLinearGradient(0, area.top, 0, area.bottom);
  g.addColorStop(0, hex + '55');
  g.addColorStop(1, hex + '02');
  return g;
}

function renderRevenueChart(d) {
  const ctx = document.getElementById('revenueChart').getContext('2d');
  const cfg = {
    type: 'line',
    data: {
      labels: d.chart.labels,
      datasets: [
        { label: 'Collected', data: d.chart.collected, borderColor: '#1B6EF3', borderWidth: 2.5,
          tension: 0.4, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: '#1B6EF3',
          fill: true, backgroundColor: (c) => { const {ctx, chartArea} = c.chart; return chartArea ? makeGradient(ctx, chartArea, '#1B6EF3') : '#1B6EF322'; } },
        { label: 'Net revenue', data: d.chart.net, borderColor: '#0A2540', borderWidth: 2.5,
          tension: 0.4, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: '#0A2540',
          fill: true, backgroundColor: (c) => { const {ctx, chartArea} = c.chart; return chartArea ? makeGradient(ctx, chartArea, '#0A2540') : '#0A254022'; } },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0A2540', padding: 12, cornerRadius: 10, titleColor: '#fff',
          bodyColor: '#cdd9ec', usePointStyle: true,
          callbacks: { label: (c) => '  ' + c.dataset.label + ': ' + fmtMoney0(c.parsed.y) },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#9AA3B2', font: { size: 11 } }, border: { display: false } },
        y: { grid: { color: '#EEF1F6' }, border: { display: false },
          ticks: { color: '#9AA3B2', font: { size: 11 }, callback: (v) => '$' + (v / 1000) + 'k' } },
      },
    },
  };
  if (revenueChart) { revenueChart.data = cfg.data; revenueChart.update(); }
  else revenueChart = new Chart(ctx, cfg);
}

function renderBreakdown(d) {
  const b = d.breakdown;
  const feePct = STATE.viewMerchant && STATE.viewMerchant.fee_percent != null
    ? ` (${STATE.viewMerchant.fee_percent}%)` : '';
  const items = [
    { label: 'Net revenue', value: b.net, color: '#16A34A' },
    { label: 'Processing fees' + feePct, value: b.fees, color: '#1B6EF3' },
  ];
  const ctx = document.getElementById('breakdownChart').getContext('2d');
  const cfg = {
    type: 'doughnut',
    data: {
      labels: items.map((i) => i.label),
      datasets: [{ data: items.map((i) => i.value), backgroundColor: items.map((i) => i.color),
        borderWidth: 0, hoverOffset: 6 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: '#0A2540', padding: 10, cornerRadius: 10,
          callbacks: { label: (c) => ' ' + fmtMoney0(c.parsed) } },
      },
    },
  };
  if (breakdownChart) { breakdownChart.data = cfg.data; breakdownChart.update(); }
  else breakdownChart = new Chart(ctx, cfg);

  document.getElementById('breakdownLegend').innerHTML = items
    .map((i) => `<li><span class="bl-left"><span class="bl-dot" style="background:${i.color}"></span>${i.label}</span><span class="bl-val">${fmtMoney0(i.value)}</span></li>`)
    .join('');
}

// ---- Tables ----
function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0] || 'U').slice(0, 2).toUpperCase();
}

function transactionRow(t) {
  return `
    <tr>
      <td>
        <div class="cust">
          <span class="cust-avatar" style="background:${t.color}">${initials(t.name)}</span>
          <span><span class="cust-name">${t.name}</span><br><span class="cust-id">${t.id}</span></span>
        </div>
      </td>
      <td>${t.method}</td>
      <td><span class="status ${t.status}">${t.status[0].toUpperCase() + t.status.slice(1)}</span></td>
      <td class="ralign amount ${t.amount < 0 ? 'neg' : ''}">${t.amount < 0 ? '-' : ''}${fmtMoney(Math.abs(t.amount))}</td>
    </tr>`;
}

function renderTransactions(transactions) {
  document.querySelector('#txTable tbody').innerHTML = transactions.map(transactionRow).join('');
}

function payoutDestCell(p) {
  const isCrypto = String(p.method || '').toLowerCase() === 'crypto';
  const type = isCrypto ? (p.asset || 'Crypto') : 'ACH transfer';
  const detail = isCrypto ? shortAddr(p.dest) : p.dest;
  return `
    <div class="dest">
      <span class="dest-ico ${isCrypto ? 'crypto' : 'ach'}"><span class="i" data-ico="${isCrypto ? 'crypto' : 'bank'}"></span></span>
      <span class="dest-text">
        <span class="dest-type">${type}</span>
        <span class="dest-detail ${isCrypto ? 'mono' : ''}" title="${isCrypto ? String(p.dest || '') : ''}">${detail}</span>
      </span>
    </div>`;
}

function renderPayouts(payouts) {
  const rows = payouts.map((p) => `
    <tr>
      <td>${p.date}</td>
      <td>${payoutDestCell(p)}</td>
      <td><span class="status ${p.status}">${p.status[0].toUpperCase() + p.status.slice(1)}</span></td>
      <td class="ralign amount">${fmtMoney0(p.amount)}</td>
    </tr>`).join('');
  const tbody = document.querySelector('#payoutTable tbody');
  tbody.innerHTML = rows;
  tbody.querySelectorAll('[data-ico]').forEach((el) => applyIcon(el, el.getAttribute('data-ico')));
}

// ---- Active state (live data when available, else sample) ----
const ACTIVE = { data: SAMPLE_DATA, transactions: TRANSACTIONS, payouts: PAYOUTS };
let currentRange = 'daily';

// ---- App state & API data loading ----
const STATE = { me: null, merchants: [], agencies: [], viewMerchantId: null, viewMerchant: null };
const AVATAR_PALETTE = ['#1B6EF3', '#16A34A', '#7C3AED', '#0EA5E9', '#E5A50A', '#0A2540', '#DB2777', '#0D9488'];
const cap = (s) => (s ? String(s)[0].toUpperCase() + String(s).slice(1) : '');
const avatarColor = (n) => AVATAR_PALETTE[(Number(n) || 0) % AVATAR_PALETTE.length];
const MERCHANT_STATUSES = ['active', 'paused', 'suspended'];
function statusSelect(id, status) {
  const opts = MERCHANT_STATUSES.map((s) => `<option value="${s}" ${s === status ? 'selected' : ''}>${cap(s)}</option>`).join('');
  return `<select class="status-select ${status}" data-id="${id}" aria-label="Merchant status">${opts}</select>`;
}

// Admin: change a merchant's account status (active / paused / suspended).
async function updateMerchantStatus(id, status) {
  try {
    await fetchJSON('/api/merchant/status', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant_id: id, status }),
    });
  } catch (err) { console.warn('[3PSolutions] status update failed:', err); return; }
  const m = STATE.merchants.find((x) => x.id === id);
  if (m) m.status = status;
  if (STATE.viewMerchant && STATE.viewMerchant.id === id) {
    STATE.viewMerchant.status = status;
    updateContextBar(STATE.viewMerchant);
  }
  document.querySelectorAll(`.status-select[data-id="${id}"]`).forEach((sel) => {
    sel.className = 'status-select ' + status;
    sel.value = status;
  });
}

async function fetchJSON(url, opts) {
  const r = await fetch(url, opts);
  let body = null;
  try { body = await r.json(); } catch (_) {}
  if (!r.ok) throw Object.assign(new Error((body && body.error) || ('HTTP ' + r.status)), { status: r.status, body });
  return body;
}

// Load a merchant's dashboard from the server (scope enforced server-side).
async function viewMerchant(id) {
  const res = await fetchJSON('/api/dashboard?merchant_id=' + encodeURIComponent(id));
  ACTIVE.data = res.data;
  ACTIVE.transactions = res.transactions;
  ACTIVE.payouts = res.payouts;
  STATE.viewMerchantId = id;
  STATE.viewMerchant = res.merchant;
  updateContextBar(res.merchant);
  renderTransactions(ACTIVE.transactions);
  renderPayouts(ACTIVE.payouts);
  render(currentRange);
}

async function loadMerchants() {
  const res = await fetchJSON('/api/merchants');
  STATE.merchants = res.merchants || [];
  if (STATE.me && STATE.me.role === 'admin') {
    try { STATE.agencies = (await fetchJSON('/api/agencies')).agencies || []; } catch (_) { STATE.agencies = []; }
  }
  return STATE.merchants;
}

// Admin: assign (or clear) which agency a merchant belongs to.
async function updateMerchantAgency(merchantId, agencyId) {
  try {
    await fetchJSON('/api/merchant/agency', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant_id: merchantId, agency_id: agencyId || null }),
    });
    const m = STATE.merchants.find((x) => x.id === merchantId);
    if (m) m.agency_id = agencyId ? Number(agencyId) : null;
  } catch (err) { console.warn('[3PSolutions] agency assignment failed:', err); }
}

function setUserChrome(me) {
  const av = document.getElementById('avatarInitials');
  const nm = document.getElementById('userName');
  const roleEl = document.getElementById('userRole');
  if (av) av.textContent = initials((me.merchant_name || me.username || 'U').replace(/@.*/, ''));
  if (nm) nm.textContent = me.username || '';
  if (roleEl) {
    roleEl.textContent = me.role === 'admin' ? 'Admin' : (me.role === 'agency' ? 'Agency' : 'Merchant');
    roleEl.className = 'role-chip ' + me.role;
  }
  const sub = document.getElementById('pageSub');
  if (me.role === 'admin') {
    const nav = document.getElementById('navMerchants');
    if (nav) nav.style.display = '';
    if (sub) sub.textContent = 'Administrator · viewing all merchants';
  } else if (me.role === 'agency') {
    const nav = document.getElementById('navMerchants');
    if (nav) nav.style.display = '';
    // Agencies are read-only and don't configure payouts.
    const pm = document.getElementById('navPayoutMethods');
    if (pm) pm.style.display = 'none';
    const comm = (me.commission_percent != null && me.commission_percent !== '')
      ? ' · ' + me.commission_percent + '% commission' : '';
    if (sub) sub.textContent = 'Agency · your referred merchants' + comm;
  } else if (sub) {
    sub.textContent = (me.merchant_name || 'Merchant') + ' · merchant portal';
  }
}

// Admin-only banner showing which merchant is being viewed.
function updateContextBar(merchant) {
  const bar = document.getElementById('contextBar');
  if (!bar) return;
  const role = STATE.me && STATE.me.role;
  if (!(role === 'admin' || role === 'agency') || !merchant) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  document.getElementById('ctxName').textContent = merchant.name;
  document.getElementById('ctxMeta').textContent =
    [merchant.business_type,
     merchant.fee_percent != null ? merchant.fee_percent + '% fee' : null,
     merchant.email].filter(Boolean).join(' · ');
  const av = document.getElementById('ctxAvatar');
  if (av) { av.textContent = initials(merchant.name); av.style.background = avatarColor(merchant.id); }
  const cs = document.getElementById('ctxStatus');
  if (cs) {
    if (role === 'agency') { cs.style.display = 'none'; }
    else { cs.style.display = ''; if (merchant.status) { cs.value = merchant.status; cs.className = 'status-select ctx-status ' + merchant.status; } }
  }
}

function enableAdminUI() {
  const nav = document.getElementById('navMerchants');
  if (nav) nav.style.display = '';
}

// ---- Full-page detail views (payouts / transactions) ----
function renderPayoutsPage(payouts) {
  const sum = (arr) => arr.reduce((s, p) => s + p.amount, 0);
  const paid = sum(payouts.filter((p) => p.status === 'paid' || p.status === 'completed'));
  const pending = sum(payouts.filter((p) => p.status === 'processing' || p.status === 'pending'));
  const stats = [
    { label: 'Total paid out', value: fmtMoney0(paid) },
    { label: 'In progress', value: fmtMoney0(pending) },
    { label: 'Total payouts', value: fmtNum(payouts.length) },
  ];
  document.getElementById('payoutsSummary').innerHTML = stats
    .map((s) => `<div class="fp-stat"><span class="fp-stat-label">${s.label}</span><span class="fp-stat-value">${s.value}</span></div>`)
    .join('');
  document.getElementById('payoutsCount').textContent = payouts.length + ' payouts';

  const rows = payouts.map((p) => `
    <tr>
      <td>${p.date}</td>
      <td>${payoutDestCell(p)}</td>
      <td><span class="status ${p.status}">${p.status[0].toUpperCase() + p.status.slice(1)}</span></td>
      <td class="ralign amount">${fmtMoney0(p.amount)}</td>
    </tr>`).join('');
  const tb = document.querySelector('#payoutsFullTable tbody');
  tb.innerHTML = rows;
  tb.querySelectorAll('[data-ico]').forEach((el) => applyIcon(el, el.getAttribute('data-ico')));
}

function renderTransactionsPage(transactions) {
  const gross = transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const refunds = transactions.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const stats = [
    { label: 'Total volume', value: fmtMoney0(gross) },
    { label: 'Refunds', value: fmtMoney0(refunds) },
    { label: 'Transactions', value: fmtNum(transactions.length) },
  ];
  document.getElementById('transactionsSummary').innerHTML = stats
    .map((s) => `<div class="fp-stat"><span class="fp-stat-label">${s.label}</span><span class="fp-stat-value">${s.value}</span></div>`)
    .join('');
  document.getElementById('transactionsCount').textContent = transactions.length + ' transactions';
  document.querySelector('#transactionsFullTable tbody').innerHTML = transactions.map(transactionRow).join('');
}

// Admin-only merchants directory (browse all merchants, click to open one).
function renderMerchantsPage() {
  const role = STATE.me && STATE.me.role;
  if (!(role === 'admin' || role === 'agency')) { exitFullpage(); return; }
  const isAgency = role === 'agency';
  const merchants = STATE.merchants;
  const totalVol = merchants.reduce((s, m) => s + (m.monthVolume || 0), 0);
  const activeN = merchants.filter((m) => m.status === 'active').length;
  const stats = [
    { label: isAgency ? 'Your merchants' : 'Total merchants', value: fmtNum(merchants.length) },
    { label: 'Active', value: fmtNum(activeN) },
    { label: 'Combined volume (30d)', value: fmtMoney0(totalVol) },
  ];
  if (isAgency && STATE.me.commission_percent != null && STATE.me.commission_percent !== '') {
    stats.push({ label: 'Your commission', value: STATE.me.commission_percent + '%' });
  }
  document.getElementById('merchantsSummary').innerHTML = stats
    .map((s) => `<div class="fp-stat"><span class="fp-stat-label">${s.label}</span><span class="fp-stat-value">${s.value}</span></div>`)
    .join('');
  document.getElementById('merchantsCount').textContent = merchants.length + ' merchants';
  const inviteBtn = document.getElementById('inviteBtn');
  if (inviteBtn) inviteBtn.style.display = isAgency ? 'none' : '';
  const myShort = isAgency ? (STATE.me.username || '').replace(/@.*/, '') : '';

  document.querySelector('#merchantsFullTable tbody').innerHTML = merchants.map((m) => {
    const statusCell = isAgency
      ? `<span class="status ${m.status}">${cap(m.status)}</span>`
      : statusSelect(m.id, m.status);
    let agencyCell;
    if (isAgency) {
      agencyCell = `<td>${myShort}</td>`;
    } else {
      const opts = ['<option value="">— None —</option>'].concat(
        (STATE.agencies || []).map((a) =>
          `<option value="${a.id}" ${a.id === m.agency_id ? 'selected' : ''}>${(a.username || '').replace(/@.*/, '')}</option>`));
      agencyCell = `<td><select class="status-select agency-select" data-id="${m.id}" aria-label="Agency">${opts.join('')}</select></td>`;
    }
    const actions = isAgency
      ? `<span class="view-btn">View →</span>`
      : `<span class="view-btn">View →</span> <button class="row-del" title="Delete merchant" aria-label="Delete merchant"><span data-ico="trash"></span></button>`;
    return `
    <tr class="merchant-row" data-id="${m.id}">
      <td>
        <div class="cust">
          <span class="cust-avatar" style="background:${avatarColor(m.id)}">${initials(m.name)}</span>
          <span><span class="cust-name">${m.name}</span><br><span class="cust-id">${m.email || ''}</span></span>
        </div>
      </td>
      <td>${m.business_type || '—'}</td>
      <td>${statusCell}</td>
      <td class="ralign">${m.fee_percent != null ? m.fee_percent + '%' : '—'}</td>
      ${agencyCell}
      <td class="ralign amount">${fmtMoney0(m.monthVolume)}</td>
      <td class="ralign">${fmtNum(m.monthTxns)}</td>
      <td class="ralign">${actions}</td>
    </tr>`;
  }).join('');

  const tb = document.querySelector('#merchantsFullTable tbody');
  tb.querySelectorAll('[data-ico]').forEach((el) => applyIcon(el, el.getAttribute('data-ico')));
  tb.onclick = (e) => {
    if (e.target.closest('.status-select')) return;   // don't navigate when interacting with a select
    const delBtn = e.target.closest('.row-del');
    if (delBtn) {
      const tr = delBtn.closest('.merchant-row');
      const id = Number(tr.getAttribute('data-id'));
      openDeleteConfirm(STATE.merchants.find((x) => x.id === id));
      return;
    }
    const tr = e.target.closest('.merchant-row');
    if (!tr) return;
    exitFullpage();
    viewMerchant(Number(tr.getAttribute('data-id'))).catch((err) => console.warn(err));
  };
  tb.onchange = (e) => {
    const agSel = e.target.closest('.agency-select');
    if (agSel) { updateMerchantAgency(Number(agSel.getAttribute('data-id')), agSel.value); return; }
    const sel = e.target.closest('.status-select');
    if (sel) updateMerchantStatus(Number(sel.getAttribute('data-id')), sel.value);
  };
  if (!isAgency) loadAndRenderInvites();
}

// ---- Invites (admin) ----
function fmtInviteDate(epoch) {
  if (!epoch) return '—';
  return new Date(epoch * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function copyText(text, el) {
  const done = () => {
    if (!el) return;
    const prev = el.textContent;
    el.textContent = 'Copied!';
    el.classList.add('copied');
    setTimeout(() => { el.textContent = prev; el.classList.remove('copied'); }, 1500);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => {});
  }
}

async function loadAndRenderInvites() {
  const card = document.getElementById('invitesCard');
  if (!card) return;
  let invites = [];
  try { invites = (await fetchJSON('/api/invites')).invites || []; }
  catch (_) { card.style.display = 'none'; return; }
  const pending = invites.filter((i) => i.state === 'pending');
  if (!pending.length) { card.style.display = 'none'; return; }
  card.style.display = '';
  document.getElementById('invitesCount').textContent = pending.length + ' pending';
  const tb = document.querySelector('#invitesTable tbody');
  tb.innerHTML = pending.map((i) => `
    <tr data-token="${i.token}">
      <td>${i.email}</td>
      <td>${i.merchant_name || (i.role === 'admin' ? 'Administrator' : '—')}</td>
      <td><span class="status pending">Pending</span></td>
      <td>${fmtInviteDate(i.expires_at)}</td>
      <td class="ralign">
        <span class="copy-mini" data-link="${location.origin}/signup?token=${i.token}">Copy link</span>
        <span class="revoke-btn">Revoke</span>
      </td>
    </tr>`).join('');
  tb.onclick = async (e) => {
    const tr = e.target.closest('tr');
    if (!tr) return;
    if (e.target.classList.contains('copy-mini')) {
      copyText(e.target.getAttribute('data-link'), e.target);
    } else if (e.target.classList.contains('revoke-btn')) {
      try {
        await fetchJSON('/api/invites/revoke', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: tr.getAttribute('data-token') }),
        });
      } catch (_) {}
      loadAndRenderInvites();
    }
  };
}

function toggleNewMerchant() {
  const isNew = document.getElementById('invMerchantSelect').value === '__new__';
  document.getElementById('newMerchantFields').style.display = isNew ? '' : 'none';
}

// Switch the invite form between Merchant and Agency account types.
function toggleInviteType() {
  const t = document.getElementById('invAccountType');
  const isAgency = t && t.value === 'agency';
  const mf = document.getElementById('merchantInviteFields');
  const af = document.getElementById('agencyInviteFields');
  if (mf) mf.style.display = isAgency ? 'none' : '';
  if (af) af.style.display = isAgency ? '' : 'none';
}

// ---- Delete merchant (admin) ----
let pendingDeleteId = null;
function openDeleteConfirm(merchant) {
  if (!merchant) return;
  pendingDeleteId = merchant.id;
  document.getElementById('confirmTitle').textContent = 'Delete ' + merchant.name + '?';
  document.getElementById('confirmMsg').textContent =
    'This permanently removes the merchant, its login account, and any pending invites. This cannot be undone.';
  document.getElementById('confirmError').className = 'modal-msg';
  const m = document.getElementById('confirmModal');
  m.classList.add('open');
  m.setAttribute('aria-hidden', 'false');
}
function closeConfirm() {
  pendingDeleteId = null;
  const m = document.getElementById('confirmModal');
  m.classList.remove('open');
  m.setAttribute('aria-hidden', 'true');
}
async function confirmDeleteMerchant() {
  if (!pendingDeleteId) return;
  const id = pendingDeleteId;
  const btn = document.getElementById('confirmDelete');
  const err = document.getElementById('confirmError');
  btn.disabled = true; btn.textContent = 'Deleting…';
  try {
    await fetchJSON('/api/merchant/delete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant_id: id }),
    });
    await loadMerchants();
    closeConfirm();
    renderMerchantsPage();
    // If we were viewing the deleted merchant, switch to another one.
    if (STATE.viewMerchantId === id) {
      if (STATE.merchants.length) await viewMerchant(STATE.merchants[0].id);
    }
  } catch (e) {
    err.className = 'modal-msg err'; err.textContent = e.message || 'Could not delete merchant.';
  } finally {
    btn.disabled = false; btn.textContent = 'Delete permanently';
  }
}

// ---- Payout methods (merchant / admin) ----
function pmMerchantId() {
  return STATE.me && STATE.me.role === 'admin' ? STATE.viewMerchantId : (STATE.me ? STATE.me.merchant_id : null);
}

function refreshPmUI() {
  const ach = document.getElementById('pmAchEnabled').checked;
  const usdt = document.getElementById('pmUsdtEnabled').checked;
  document.getElementById('pmAchFields').classList.toggle('disabled', !ach);
  document.getElementById('pmUsdtFields').classList.toggle('disabled', !usdt);
  document.getElementById('pmPrimaryCard').style.display = (ach && usdt) ? '' : 'none';
}

async function renderPayoutMethodsPage() {
  const msg = document.getElementById('pmMsg');
  msg.className = 'pm-msg';
  const sub = document.getElementById('pmSub');
  if (STATE.me && STATE.me.role === 'admin' && STATE.viewMerchant) {
    sub.textContent = 'Set where payouts go for ' + STATE.viewMerchant.name;
  } else {
    sub.textContent = 'Choose where 3PSolutions sends your payouts';
  }
  let methods = { ach: { enabled: false, bank: '', account: '', routing: '' }, usdt: { enabled: false, address: '' }, primary: 'ach' };
  try {
    const isAdmin = STATE.me && STATE.me.role === 'admin';
    const res = await fetchJSON('/api/payout-methods' + (isAdmin ? '?merchant_id=' + pmMerchantId() : ''));
    methods = res.methods;
  } catch (_) {}
  document.getElementById('pmAchEnabled').checked = !!methods.ach.enabled;
  document.getElementById('pmAchBank').value = methods.ach.bank || '';
  document.getElementById('pmAchAccount').value = methods.ach.account || '';
  document.getElementById('pmAchRouting').value = methods.ach.routing || '';
  document.getElementById('pmUsdtEnabled').checked = !!methods.usdt.enabled;
  document.getElementById('pmUsdtAddress').value = methods.usdt.address || '';
  const prim = methods.primary || 'ach';
  document.querySelectorAll('input[name="pmPrimary"]').forEach((r) => { r.checked = (r.value === prim); });
  refreshPmUI();
}

async function savePayoutMethods() {
  const msg = document.getElementById('pmMsg');
  const fail = (t) => { msg.className = 'pm-msg err'; msg.textContent = t; };
  msg.className = 'pm-msg';
  const achOn = document.getElementById('pmAchEnabled').checked;
  const usdtOn = document.getElementById('pmUsdtEnabled').checked;
  if (!achOn && !usdtOn) return fail('Enable at least one payout method.');

  const bank = document.getElementById('pmAchBank').value.trim();
  const account = document.getElementById('pmAchAccount').value.replace(/\D/g, '');
  const routing = document.getElementById('pmAchRouting').value.replace(/\D/g, '');
  const address = document.getElementById('pmUsdtAddress').value.trim();
  if (achOn) {
    if (!bank) return fail('Enter your bank name.');
    if (account.length < 4) return fail('Enter a valid bank account number.');
    if (routing.length !== 9) return fail('Routing number must be 9 digits.');
  }
  if (usdtOn && !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return fail('Enter a valid USDT (ERC-20) address: 0x followed by 40 hex characters.');
  }

  const body = {
    ach: { enabled: achOn, bank, account, routing },
    usdt: { enabled: usdtOn, address },
    primary: (document.querySelector('input[name="pmPrimary"]:checked') || {}).value,
  };
  if (STATE.me && STATE.me.role === 'admin') body.merchant_id = pmMerchantId();

  const btn = document.getElementById('pmSave');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    await fetchJSON('/api/payout-methods', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    msg.className = 'pm-msg ok'; msg.textContent = 'Payout methods saved.';
    await viewMerchant(pmMerchantId());   // refresh dashboard payouts to the new destinations
  } catch (err) {
    fail(err.message || 'Could not save payout methods.');
  } finally {
    btn.disabled = false; btn.textContent = 'Save payout methods';
  }
}

function openInviteModal() {
  const sel = document.getElementById('invMerchantSelect');
  sel.innerHTML = STATE.merchants.map((m) => `<option value="${m.id}">${m.name}</option>`).join('')
    + '<option value="__new__">➕ New merchant…</option>';
  document.getElementById('inviteForm').reset();
  document.getElementById('inviteForm').style.display = '';
  document.getElementById('inviteResult').style.display = 'none';
  document.getElementById('inviteMsg').className = 'modal-msg';
  sel.value = STATE.merchants.length ? String(STATE.merchants[0].id) : '__new__';
  toggleNewMerchant();
  toggleInviteType();
  const m = document.getElementById('inviteModal');
  m.classList.add('open');
  m.setAttribute('aria-hidden', 'false');
}

function closeInviteModal() {
  const m = document.getElementById('inviteModal');
  m.classList.remove('open');
  m.setAttribute('aria-hidden', 'true');
}

async function submitInvite(e) {
  e.preventDefault();
  const msg = document.getElementById('inviteMsg');
  const btn = document.getElementById('invSubmit');
  msg.className = 'modal-msg';
  const email = document.getElementById('invEmailInput').value.trim();
  const type = (document.getElementById('invAccountType') || {}).value || 'merchant';
  const body = { email, expires_days: Number(document.getElementById('invExpiry').value), role: type };
  if (type === 'agency') {
    body.commission_percent = Number(document.getElementById('invCommission').value);
  } else {
    body.fee_percent = Number(document.getElementById('invFee').value);
    const sel = document.getElementById('invMerchantSelect').value;
    if (sel === '__new__') {
      const name = document.getElementById('invNewName').value.trim();
      if (!name) { msg.className = 'modal-msg err'; msg.textContent = 'Enter a name for the new merchant.'; return; }
      body.new_merchant = { name, business_type: document.getElementById('invNewType').value.trim() };
    } else {
      body.merchant_id = Number(sel);
    }
  }
  btn.disabled = true; btn.textContent = 'Generating…';
  try {
    const res = await fetchJSON('/api/invites', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    document.getElementById('inviteForm').style.display = 'none';
    document.getElementById('inviteResult').style.display = '';
    document.getElementById('inviteLink').value = res.link;
    document.getElementById('inviteResultNote').textContent =
      `For ${res.email}${res.merchant_name ? ' · ' + res.merchant_name : (type === 'agency' ? ' · Agency' : '')} · expires in ${res.expires_days} days · single-use.`;
    await loadMerchants();
    renderMerchantsPage();
  } catch (err) {
    msg.className = 'modal-msg err'; msg.textContent = err.message || 'Could not create invite.';
  } finally {
    btn.disabled = false; btn.textContent = 'Generate invite link';
  }
}

(function wireInvites() {
  const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
  on('inviteBtn', 'click', openInviteModal);
  on('inviteModalClose', 'click', closeInviteModal);
  on('invMerchantSelect', 'change', toggleNewMerchant);
  on('invAccountType', 'change', toggleInviteType);
  on('inviteForm', 'submit', submitInvite);
  on('inviteAnother', 'click', openInviteModal);
  on('copyLink', 'click', () => copyText(document.getElementById('inviteLink').value, document.getElementById('copyLink')));
  const overlay = document.getElementById('inviteModal');
  if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) closeInviteModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay && overlay.classList.contains('open')) closeInviteModal();
  });
  const ctxStatus = document.getElementById('ctxStatus');
  if (ctxStatus) ctxStatus.addEventListener('change', () => {
    if (STATE.viewMerchantId) updateMerchantStatus(STATE.viewMerchantId, ctxStatus.value);
  });
  on('pmAchEnabled', 'change', refreshPmUI);
  on('pmUsdtEnabled', 'change', refreshPmUI);
  on('pmSave', 'click', savePayoutMethods);
  on('confirmCancel', 'click', closeConfirm);
  on('confirmClose', 'click', closeConfirm);
  on('confirmDelete', 'click', confirmDeleteMerchant);
  const confirmOverlay = document.getElementById('confirmModal');
  if (confirmOverlay) confirmOverlay.addEventListener('click', (e) => { if (e.target === confirmOverlay) closeConfirm(); });
})();

// Generic full-page detail views, keyed by URL hash.
const FULLPAGES = {
  '#merchants': { id: 'merchantsPage', adminOnly: true, render: () => renderMerchantsPage() },
  '#payouts': { id: 'payoutsPage', render: () => renderPayoutsPage(ACTIVE.payouts) },
  '#transactions': { id: 'transactionsPage', render: () => renderTransactionsPage(ACTIVE.transactions) },
  '#payout-methods': { id: 'payoutMethodsPage', render: () => renderPayoutMethodsPage() },
};
function closeAllFullpages() {
  Object.values(FULLPAGES).forEach((c) => {
    const el = document.getElementById(c.id);
    if (el) { el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); }
  });
  document.body.style.overflow = '';
}
function openFullpage(hash) {
  const cfg = FULLPAGES[hash];
  if (!cfg) return;
  // Block admin-only pages for non-admins (e.g. a merchant forcing #merchants).
  if (cfg.adminOnly && !(STATE.me && (STATE.me.role === 'admin' || STATE.me.role === 'agency'))) {
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    return;
  }
  closeAllFullpages();
  cfg.render();
  const el = document.getElementById(cfg.id);
  el.classList.add('open');
  el.setAttribute('aria-hidden', 'false');
  el.scrollTop = 0;
  document.body.style.overflow = 'hidden';
}
function syncFullpageFromHash() {
  if (FULLPAGES[location.hash]) openFullpage(location.hash);
  else closeAllFullpages();
}
function exitFullpage() {
  // Clear the hash without leaving an extra history entry, then close.
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  closeAllFullpages();
}

window.addEventListener('hashchange', syncFullpageFromHash);
document.querySelectorAll('.fp-exit').forEach((b) => b.addEventListener('click', exitFullpage));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && FULLPAGES[location.hash]) exitFullpage();
});

// ---- Range switching ----
function render(range) {
  currentRange = range;
  const d = ACTIVE.data[range];
  renderMetrics(d);
  renderRevenueChart(d);
  renderBreakdown(d);
  document.getElementById('revenueSub').textContent = `Cash collected vs. net revenue · by ${d.chartUnit.toLowerCase()}`;
  document.getElementById('sidebarPayout').textContent =
    `${fmtMoney0(d.metrics.nextPayout.amount)} · ${d.metrics.nextPayout.date}`;
}

document.getElementById('rangeToggle').addEventListener('click', (e) => {
  const btn = e.target.closest('.seg');
  if (!btn) return;
  document.querySelectorAll('.seg').forEach((s) => s.classList.remove('active'));
  btn.classList.add('active');
  render(btn.dataset.range);
});

// ---- Data source status badge ----
function setStatus(state) {
  const badge = document.getElementById('dataBadge');
  const foot = document.getElementById('footStatus');
  if (!badge) return;
  const map = {
    loading: { cls: 'loading', text: 'Loading…',    foot: 'Loading account data…' },
    live:    { cls: 'live',    text: 'Live data',    foot: 'Data scoped to this account.' },
    sample:  { cls: 'sample',  text: 'Sample data',  foot: 'Preview mode — built-in sample data.' },
    error:   { cls: 'error',   text: 'Data error',   foot: 'Could not load account data.' },
  };
  const s = map[state] || map.sample;
  badge.className = 'data-badge ' + s.cls;
  badge.textContent = s.text;
  if (foot) foot.textContent = s.foot;
}

// ---- Init ----
function renderFallback() {
  // Static preview (no auth server) — show built-in sample data as one merchant.
  ACTIVE.data = SAMPLE_DATA;
  ACTIVE.transactions = TRANSACTIONS;
  ACTIVE.payouts = PAYOUTS;
  renderTransactions(ACTIVE.transactions);
  renderPayouts(ACTIVE.payouts);
  render(currentRange);
  setStatus('sample');
}

async function init() {
  setStatus('loading');
  let me = null;
  try {
    me = await fetchJSON('/api/me');
  } catch (err) {
    if (err && err.status === 401) {
      // Not signed in — the dashboard shell is public, so send them to login.
      window.location.href = '/login';
      return;
    }
    // No API reachable at all (pure static preview) — show sample data.
    renderFallback();
    syncFullpageFromHash();
    return;
  }

  STATE.me = me;
  setUserChrome(me);

  try {
    if (me.role === 'admin' || me.role === 'agency') {
      enableAdminUI();
      await loadMerchants();
      if (STATE.merchants.length) await viewMerchant(STATE.merchants[0].id);
    } else {
      await viewMerchant(me.merchant_id);
    }
    setStatus('live');
  } catch (err) {
    console.warn('[3PSolutions] Could not load account data:', err);
    renderFallback();
  }

  syncFullpageFromHash();
}

init();
