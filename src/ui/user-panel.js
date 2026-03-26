/**
 * User Tracking Panel
 *
 * Two modes:
 *   Live   — polls latest navnode per user every 5 s, shows 3D markers
 *   History — click a user to fetch full navnode history, draws 3D route
 */
import { fetchUsers, fetchLatestNavnode, fetchNavnodeHistory } from '../services/supabase.js';
import { flyTo } from '../ar/scene.js';
import {
  addUserMarker,
  updateUserMarker,
  clearAllMarkers,
  drawHistoryRoute,
  clearHistoryRoute,
} from '../ar/user-tracking.js';

const POLL_INTERVAL = 5000;

let users = [];
let mode = 'live'; // 'live' | 'history'
let pollTimer = null;
let selectedUserId = null;
let historyPoints = [];

// ─── DOM refs (set during create) ───
let panel, listEl, tabLive, tabHistory, detailSection, detailContent;

/**
 * @param {HTMLElement} container
 */
export function createUserPanel(container) {
  panel = document.createElement('div');
  panel.className = 'user-panel hidden';
  panel.id = 'user-panel';

  panel.innerHTML = `
    <div class="user-panel-header">
      <div class="nav-title">Users</div>
      <div class="user-tabs">
        <button class="user-tab active" data-mode="live">Live</button>
        <button class="user-tab" data-mode="history">History</button>
      </div>
    </div>
    <div class="user-list" id="user-list"></div>
    <div class="user-detail hidden" id="user-detail">
      <div class="nav-divider"></div>
      <div class="user-detail-content" id="user-detail-content"></div>
    </div>
  `;

  container.appendChild(panel);

  listEl = panel.querySelector('#user-list');
  detailSection = panel.querySelector('#user-detail');
  detailContent = panel.querySelector('#user-detail-content');
  tabLive = panel.querySelector('[data-mode="live"]');
  tabHistory = panel.querySelector('[data-mode="history"]');

  tabLive.addEventListener('click', () => switchMode('live'));
  tabHistory.addEventListener('click', () => switchMode('history'));

  return {
    show() {
      panel.classList.remove('hidden');
      loadUsers();
    },
    hide() {
      panel.classList.add('hidden');
      stopPolling();
    },
  };
}

// ─── Mode switching ───

function switchMode(newMode) {
  mode = newMode;
  tabLive.classList.toggle('active', mode === 'live');
  tabHistory.classList.toggle('active', mode === 'history');
  selectedUserId = null;
  detailSection.classList.add('hidden');
  clearAllMarkers();
  clearHistoryRoute();

  highlightSelected();

  if (mode === 'live') {
    startPolling();
  } else {
    stopPolling();
  }
}

// ─── Load users from Supabase ───

async function loadUsers() {
  try {
    users = await fetchUsers();
    renderUserList();
    if (mode === 'live') startPolling();
  } catch (err) {
    console.error('Failed to fetch users:', err);
    listEl.innerHTML = '<div class="user-empty">Failed to load users</div>';
  }
}

function renderUserList() {
  listEl.innerHTML = '';
  if (users.length === 0) {
    listEl.innerHTML = '<div class="user-empty">No users found</div>';
    return;
  }
  users.forEach((u, i) => {
    const item = document.createElement('div');
    item.className = 'user-item';
    item.dataset.userId = u.id;

    const dot = document.createElement('span');
    dot.className = 'user-dot';
    dot.style.background = dotColor(i);

    const name = document.createElement('span');
    name.className = 'user-name';
    name.textContent = u.full_name || u.email;

    const role = document.createElement('span');
    role.className = 'user-role';
    role.textContent = u.role || '';

    item.appendChild(dot);
    item.appendChild(name);
    item.appendChild(role);

    item.addEventListener('click', () => onUserClick(u, i));
    listEl.appendChild(item);
  });
}

const DOT_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#8b5cf6', '#14b8a6'];
function dotColor(i) {
  return DOT_COLORS[i % DOT_COLORS.length];
}

function highlightSelected() {
  listEl.querySelectorAll('.user-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.userId === selectedUserId);
  });
}

// ─── User click handler ───

async function onUserClick(user, colorIndex) {
  selectedUserId = user.id;
  highlightSelected();

  if (mode === 'live') {
    await showLivePosition(user, colorIndex);
  } else {
    await showHistory(user, colorIndex);
  }
}

// ─── LIVE mode ───

async function showLivePosition(user, colorIndex) {
  detailSection.classList.remove('hidden');
  detailContent.innerHTML = '<div class="user-loading">Fetching position…</div>';

  try {
    const rows = await fetchLatestNavnode(user.id);
    if (rows.length === 0) {
      detailContent.innerHTML = '<div class="user-empty">No positions found</div>';
      return;
    }
    const p = rows[0];
    const x = Number(p.pos_x);
    const y = Number(p.pos_y);
    const z = Number(p.pos_z);

    detailContent.innerHTML = `
      <div class="user-pos-label">${user.full_name || user.email}</div>
      <div class="user-pos-coords">
        <span style="color:#ef4444">X ${x.toFixed(4)}</span>
        <span style="color:#22c55e">Y ${y.toFixed(4)}</span>
        <span style="color:#3b82f6">Z ${z.toFixed(4)}</span>
      </div>
      <div class="user-pos-time">${new Date(p.recorded_at).toLocaleString()}</div>
    `;

    addUserMarker(user.id, user.full_name || user.email, x, y, z, colorIndex);
    flyTo(x, y, z);
  } catch (err) {
    console.error(err);
    detailContent.innerHTML = '<div class="user-empty">Error loading position</div>';
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(pollAllLivePositions, POLL_INTERVAL);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function pollAllLivePositions() {
  if (mode !== 'live') return;
  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    try {
      const rows = await fetchLatestNavnode(u.id);
      if (rows.length === 0) continue;
      const p = rows[0];
      const x = Number(p.pos_x);
      const y = Number(p.pos_y);
      const z = Number(p.pos_z);

      updateUserMarker(u.id, x, y, z);

      if (u.id === selectedUserId) {
        const coordsEl = detailContent.querySelector('.user-pos-coords');
        const timeEl = detailContent.querySelector('.user-pos-time');
        if (coordsEl) {
          coordsEl.innerHTML = `
            <span style="color:#ef4444">X ${x.toFixed(4)}</span>
            <span style="color:#22c55e">Y ${y.toFixed(4)}</span>
            <span style="color:#3b82f6">Z ${z.toFixed(4)}</span>
          `;
        }
        if (timeEl) {
          timeEl.textContent = new Date(p.recorded_at).toLocaleString();
        }
      }
    } catch {
      // ignore per-user fetch errors during polling
    }
  }
}

// ─── HISTORY mode ───

async function showHistory(user, colorIndex) {
  detailSection.classList.remove('hidden');
  detailContent.innerHTML = '<div class="user-loading">Loading route history…</div>';
  clearHistoryRoute();

  try {
    historyPoints = await fetchNavnodeHistory(user.id);
    if (historyPoints.length === 0) {
      detailContent.innerHTML = '<div class="user-empty">No history found for this user</div>';
      return;
    }

    drawHistoryRoute(historyPoints, colorIndex);

    const first = historyPoints[0];
    flyTo(Number(first.pos_x), Number(first.pos_y), Number(first.pos_z));

    let html = `<div class="user-pos-label">${user.full_name || user.email} — ${historyPoints.length} points</div>`;
    html += '<div class="user-history-list">';
    historyPoints.forEach((p, idx) => {
      const t = new Date(p.recorded_at).toLocaleTimeString();
      html += `<div class="user-history-item" data-idx="${idx}">
        <span class="user-history-num">${idx + 1}</span>
        <span class="user-history-time">${t}</span>
        <span class="user-history-xyz">${Number(p.pos_x).toFixed(3)}, ${Number(p.pos_y).toFixed(3)}, ${Number(p.pos_z).toFixed(3)}</span>
      </div>`;
    });
    html += '</div>';

    detailContent.innerHTML = html;

    detailContent.querySelectorAll('.user-history-item').forEach((el) => {
      el.addEventListener('click', () => {
        const p = historyPoints[Number(el.dataset.idx)];
        flyTo(Number(p.pos_x), Number(p.pos_y), Number(p.pos_z));
      });
    });
  } catch (err) {
    console.error(err);
    detailContent.innerHTML = '<div class="user-empty">Error loading history</div>';
  }
}
