'use strict';

// ── View routing ──────────────────────────────────────────────────────────────
const views = document.querySelectorAll('.view');
const navBtns = document.querySelectorAll('.nav-btn');

function showView(name) {
  views.forEach((v) => v.classList.remove('active'));
  navBtns.forEach((b) => b.classList.remove('active'));
  document.getElementById(`view-${name}`).classList.add('active');
  document.querySelector(`[data-view="${name}"]`).classList.add('active');
  if (name === 'dashboard') loadDashboard();
  if (name === 'shipments') loadShipments();
}

navBtns.forEach((btn) => {
  btn.addEventListener('click', () => showView(btn.dataset.view));
});

// ── API helpers ───────────────────────────────────────────────────────────────
async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error(data?.error || 'Request failed');
  return data;
}

// ── Badge helper ──────────────────────────────────────────────────────────────
function badge(status) {
  const label = status.replace(/_/g, ' ');
  return `<span class="badge badge-${status}">${label}</span>`;
}

function fmtDate(iso) {
  return new Date(iso).toLocaleString();
}

// ── Empty state ───────────────────────────────────────────────────────────────
function emptyState(message = 'No shipments found') {
  return `<div class="empty-state"><div class="empty-icon">📭</div><p>${message}</p></div>`;
}

// ── Shipment table row ────────────────────────────────────────────────────────
function shipmentRow(s) {
  return `<tr>
    <td><code>${s.trackingNumber}</code></td>
    <td>${esc(s.senderName)}</td>
    <td>${esc(s.recipientName)}</td>
    <td>${esc(s.origin)} → ${esc(s.destination)}</td>
    <td>${badge(s.status)}</td>
    <td>${fmtDate(s.createdAt)}</td>
    <td>
      <button class="btn btn-sm btn-secondary" onclick="openModal('${s.id}','${s.trackingNumber}','${s.status}')">Update</button>
      <button class="btn btn-sm btn-primary"   onclick="trackById('${s.id}')">View</button>
    </td>
  </tr>`;
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function shipmentsTable(list) {
  if (!list.length) return emptyState();
  return `<table class="shipment-table">
    <thead><tr>
      <th>Tracking #</th><th>Sender</th><th>Recipient</th>
      <th>Route</th><th>Status</th><th>Created</th><th>Actions</th>
    </tr></thead>
    <tbody>${list.map(shipmentRow).join('')}</tbody>
  </table>`;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const [stats, all] = await Promise.all([api('/stats'), api('/shipments')]);
    document.getElementById('stat-total').textContent = stats.total;
    ['pending', 'in_transit', 'out_for_delivery', 'delivered', 'cancelled'].forEach((k) => {
      document.getElementById(`stat-${k}`).textContent = stats[k];
    });
    const recent = all.slice(-5).reverse();
    document.getElementById('recent-shipments').innerHTML = shipmentsTable(recent);
  } catch (e) {
    document.getElementById('recent-shipments').innerHTML = `<p class="alert alert-error">${e.message}</p>`;
  }
}

// ── Shipments list ────────────────────────────────────────────────────────────
async function loadShipments() {
  const status = document.getElementById('filter-status').value;
  const url = status ? `/shipments?status=${status}` : '/shipments';
  try {
    const list = await api(url);
    document.getElementById('shipments-list').innerHTML = shipmentsTable(list);
  } catch (e) {
    document.getElementById('shipments-list').innerHTML = `<p class="alert alert-error">${e.message}</p>`;
  }
}

document.getElementById('filter-status').addEventListener('change', loadShipments);

// ── Create shipment form ──────────────────────────────────────────────────────
document.getElementById('create-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl  = document.getElementById('create-error');
  const okEl   = document.getElementById('create-success');
  errEl.classList.add('hidden');
  okEl.classList.add('hidden');

  const body = {
    senderName:    document.getElementById('senderName').value.trim(),
    recipientName: document.getElementById('recipientName').value.trim(),
    origin:        document.getElementById('origin').value.trim(),
    destination:   document.getElementById('destination').value.trim(),
    weight:        document.getElementById('weight').value ? Number(document.getElementById('weight').value) : undefined,
    description:   document.getElementById('description').value.trim(),
  };

  try {
    const s = await api('/shipments', { method: 'POST', body: JSON.stringify(body) });
    okEl.textContent = `Shipment created! Tracking number: ${s.trackingNumber}`;
    okEl.classList.remove('hidden');
    e.target.reset();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

// ── Track shipment ────────────────────────────────────────────────────────────
document.getElementById('track-btn').addEventListener('click', doTrack);
document.getElementById('track-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') doTrack(); });

async function doTrack() {
  const val = document.getElementById('track-input').value.trim();
  const errEl = document.getElementById('track-error');
  errEl.classList.add('hidden');
  document.getElementById('track-result').innerHTML = '';
  if (!val) { errEl.textContent = 'Please enter a tracking number or ID.'; errEl.classList.remove('hidden'); return; }
  try {
    const s = await api(`/shipments/${encodeURIComponent(val)}`);
    renderTrackResult(s);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
}

async function trackById(id) {
  showView('track');
  document.getElementById('track-input').value = id;
  try {
    const s = await api(`/shipments/${id}`);
    renderTrackResult(s);
  } catch (err) {
    document.getElementById('track-error').textContent = err.message;
    document.getElementById('track-error').classList.remove('hidden');
  }
}

function renderTrackResult(s) {
  const history = [...s.statusHistory].reverse();
  document.getElementById('track-result').innerHTML = `
    <div class="card track-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">
        <h2 style="font-size:1.1rem;font-weight:700;">${s.trackingNumber}</h2>
        ${badge(s.status)}
      </div>
      <div class="track-meta">
        <div class="meta-row"><span class="meta-label">Sender</span><span class="meta-value">${esc(s.senderName)}</span></div>
        <div class="meta-row"><span class="meta-label">Recipient</span><span class="meta-value">${esc(s.recipientName)}</span></div>
        <div class="meta-row"><span class="meta-label">Origin</span><span class="meta-value">${esc(s.origin)}</span></div>
        <div class="meta-row"><span class="meta-label">Destination</span><span class="meta-value">${esc(s.destination)}</span></div>
        ${s.weight ? `<div class="meta-row"><span class="meta-label">Weight</span><span class="meta-value">${s.weight} kg</span></div>` : ''}
        ${s.description ? `<div class="meta-row"><span class="meta-label">Description</span><span class="meta-value">${esc(s.description)}</span></div>` : ''}
      </div>
      <h3 style="font-size:.9rem;font-weight:600;margin-bottom:.75rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);">Status History</h3>
      <ul class="timeline">
        ${history.map((h) => `<li>
          <div class="tl-status">${h.status.replace(/_/g, ' ')}</div>
          <div class="tl-time">${fmtDate(h.timestamp)}</div>
          ${h.note ? `<div class="tl-note">${esc(h.note)}</div>` : ''}
        </li>`).join('')}
      </ul>
    </div>`;
}

// ── Update status modal ───────────────────────────────────────────────────────
let _modalShipmentId = null;

function openModal(id, trackingNumber, currentStatus) {
  _modalShipmentId = id;
  document.getElementById('modal-tracking').textContent = `Shipment ${trackingNumber}`;
  document.getElementById('modal-status').value = currentStatus;
  document.getElementById('modal-note').value = '';
  document.getElementById('modal-error').classList.add('hidden');
  document.getElementById('modal-overlay').classList.remove('hidden');
}

document.getElementById('modal-cancel').addEventListener('click', () => {
  document.getElementById('modal-overlay').classList.add('hidden');
});

document.getElementById('modal-save').addEventListener('click', async () => {
  const status = document.getElementById('modal-status').value;
  const note   = document.getElementById('modal-note').value.trim();
  const errEl  = document.getElementById('modal-error');
  errEl.classList.add('hidden');
  try {
    await api(`/shipments/${_modalShipmentId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, note }),
    });
    document.getElementById('modal-overlay').classList.add('hidden');
    // Refresh whichever view is currently active
    const active = document.querySelector('.view.active');
    if (active.id === 'view-dashboard') loadDashboard();
    if (active.id === 'view-shipments') loadShipments();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────
loadDashboard();
