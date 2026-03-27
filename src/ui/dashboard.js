/**
 * Dashboard Shell
 * Creates the futuristic control-center layout:
 *   top bar · sidebar · 3D viewport · right panel · bottom stats bar
 */
import { fetchCounts } from '../services/supabase.js';

const SIDEBAR_ITEMS = [
  { id: '3d-view',   icon: svgCube,     label: 'Map' },
  { id: '2d-map',    icon: svgMap2D,    label: '2D Map' },
  { id: 'pois',      icon: svgPin,      label: 'POIs' },
  { id: 'tracking',  icon: svgRadar,    label: 'Track' },
  { id: 'zones',     icon: svgBox,      label: 'Zones' },
  { id: 'facilities',icon: svgBuilding, label: 'Facil.' },
  { id: 'types',     icon: svgLayers,   label: 'Types' },
  { id: 'users',     icon: svgUsers,    label: 'Users' },
  { id: 'analytics', icon: svgChart,    label: 'Stats' },
];

let activePanel = '3d-view';
let uptimeStart = null;
let clockTimer = null;

export function createDashboard(container) {
  const el = document.createElement('div');
  el.className = 'dashboard hidden';
  el.id = 'dashboard';

  el.innerHTML = `
    <div class="scanlines"></div>

    <header class="topbar">
      <div class="topbar-left">
        <span class="topbar-logo-icon">${svgHex()}</span>
        <span class="topbar-logo-text">NAVME</span>
        <span class="topbar-divider"></span>
        <span class="topbar-subtitle">CONTROL CENTER</span>
      </div>
      <div class="topbar-center">
        <span class="sys-dot"></span>
        <span class="sys-label">SYSTEM ONLINE</span>
      </div>
      <div class="topbar-right">
        <span class="topbar-date" id="topbar-date"></span>
        <span class="topbar-time" id="topbar-time"></span>
      </div>
    </header>

    <nav class="sidebar" id="sidebar"></nav>

    <main class="viewport" id="viewport">
      <div class="viewport-tabs" id="viewport-tabs">
        <button class="viewport-tab active" data-view="3d" id="tab-3d">3D View</button>
        <button class="viewport-tab" data-view="2d" id="tab-2d">2D Floor Plan</button>
      </div>
      <div class="viewport-3d active" id="viewport-3d"></div>
      <div class="viewport-2d" id="viewport-2d"></div>
    </main>

    <aside class="right-panel" id="right-panel">
      <div class="panel-slot active" data-panel="3d-view"    id="slot-nav"></div>
      <div class="panel-slot"        data-panel="2d-map"     id="slot-2dmap"></div>
      <div class="panel-slot"        data-panel="pois"       id="slot-pois"></div>
      <div class="panel-slot"        data-panel="tracking"   id="slot-tracking"></div>
      <div class="panel-slot"        data-panel="zones"      id="slot-zones"></div>
      <div class="panel-slot"        data-panel="facilities" id="slot-facilities"></div>
      <div class="panel-slot"        data-panel="types"      id="slot-types"></div>
      <div class="panel-slot"        data-panel="users"      id="slot-users"></div>
      <div class="panel-slot"        data-panel="analytics"  id="slot-analytics"></div>
    </aside>

    <footer class="bottombar">
      <div class="stat-chip">
        <span class="stat-label">USERS</span>
        <span class="stat-value" id="stat-users">--</span>
      </div>
      <div class="stat-chip">
        <span class="stat-label">POIs</span>
        <span class="stat-value" id="stat-pois">--</span>
      </div>
      <div class="stat-chip">
        <span class="stat-label">FACILITIES</span>
        <span class="stat-value" id="stat-facilities">--</span>
      </div>
      <div class="stat-chip">
        <span class="stat-label">NAVNODES</span>
        <span class="stat-value" id="stat-navnodes">--</span>
      </div>
      <div class="stat-chip">
        <span class="stat-label">UPTIME</span>
        <span class="stat-value" id="stat-uptime">00:00:00</span>
      </div>
    </footer>
  `;

  container.appendChild(el);

  // Build sidebar buttons
  const sidebarEl = el.querySelector('#sidebar');
  SIDEBAR_ITEMS.forEach((item) => {
    const btn = document.createElement('button');
    btn.className = `sidebar-btn${item.id === activePanel ? ' active' : ''}`;
    btn.dataset.panel = item.id;
    btn.title = item.label;
    btn.innerHTML = `${item.icon()}<span class="sidebar-label">${item.label}</span>`;
    btn.addEventListener('click', () => setActivePanel(item.id, el));
    sidebarEl.appendChild(btn);
  });

  const viewport = el.querySelector('#viewport');
  const viewport3d = el.querySelector('#viewport-3d');
  const viewport2d = el.querySelector('#viewport-2d');
  const tab3d = el.querySelector('#tab-3d');
  const tab2d = el.querySelector('#tab-2d');
  let activeView = '3d';
  let onViewSwitch = null;

  tab3d.addEventListener('click', () => switchView('3d'));
  tab2d.addEventListener('click', () => switchView('2d'));

  function switchView(view) {
    activeView = view;
    tab3d.classList.toggle('active', view === '3d');
    tab2d.classList.toggle('active', view === '2d');
    viewport3d.classList.toggle('active', view === '3d');
    viewport2d.classList.toggle('active', view === '2d');

    // Switch which right-panel slot is visible
    if (view === '2d') {
      setActivePanel('2d-map', el);
    } else {
      setActivePanel('3d-view', el);
    }

    if (onViewSwitch) onViewSwitch(view);
  }

  const slots = {
    nav:        el.querySelector('#slot-nav'),
    map2d:      el.querySelector('#slot-2dmap'),
    pois:       el.querySelector('#slot-pois'),
    tracking:   el.querySelector('#slot-tracking'),
    zones:      el.querySelector('#slot-zones'),
    facilities: el.querySelector('#slot-facilities'),
    types:      el.querySelector('#slot-types'),
    users:      el.querySelector('#slot-users'),
    analytics:  el.querySelector('#slot-analytics'),
  };

  return {
    element: el,
    viewport: viewport3d,
    viewport2d,
    slots,
    show() {
      el.classList.remove('hidden');
      uptimeStart = Date.now();
      startClock(el);
      refreshBottomStats(el);
    },
    hide() {
      el.classList.add('hidden');
      if (clockTimer) clearInterval(clockTimer);
    },
    refreshStats() { refreshBottomStats(el); },
    onViewSwitch(cb) { onViewSwitch = cb; },
    switchView,
  };
}

function setActivePanel(panelId, dashEl) {
  activePanel = panelId;
  dashEl.querySelectorAll('.sidebar-btn').forEach((b) =>
    b.classList.toggle('active', b.dataset.panel === panelId)
  );
  dashEl.querySelectorAll('.panel-slot').forEach((s) =>
    s.classList.toggle('active', s.dataset.panel === panelId)
  );
}

function startClock(dashEl) {
  const dateEl = dashEl.querySelector('#topbar-date');
  const timeEl = dashEl.querySelector('#topbar-time');
  const uptimeEl = dashEl.querySelector('#stat-uptime');

  function tick() {
    const now = new Date();
    dateEl.textContent = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    timeEl.textContent = now.toLocaleTimeString('en-US', { hour12: false });
    if (uptimeStart) {
      const s = Math.floor((Date.now() - uptimeStart) / 1000);
      const h = String(Math.floor(s / 3600)).padStart(2, '0');
      const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
      const sec = String(s % 60).padStart(2, '0');
      uptimeEl.textContent = `${h}:${m}:${sec}`;
    }
  }

  tick();
  clockTimer = setInterval(tick, 1000);
}

async function refreshBottomStats(dashEl) {
  try {
    const c = await fetchCounts();
    dashEl.querySelector('#stat-users').textContent = c.users;
    dashEl.querySelector('#stat-pois').textContent = c.pois;
    dashEl.querySelector('#stat-facilities').textContent = c.facilities;
    dashEl.querySelector('#stat-navnodes').textContent = c.navnodes.toLocaleString();
  } catch { /* silent */ }
}

/* ── Inline SVG icon factories ── */

function svgWrap(paths) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

function svgCube() {
  return svgWrap(
    '<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>'
  );
}

function svgPin() {
  return svgWrap(
    '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>'
  );
}

function svgRadar() {
  return svgWrap(
    '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><line x1="12" y1="2" x2="12" y2="6"/>'
  );
}

function svgBuilding() {
  return svgWrap(
    '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01"/>'
  );
}

function svgLayers() {
  return svgWrap(
    '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>'
  );
}

function svgUsers() {
  return svgWrap(
    '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>'
  );
}

function svgChart() {
  return svgWrap(
    '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>'
  );
}

function svgBox() {
  return svgWrap(
    '<path d="M2.97 12.92A2 2 0 002 14.63v3.24a2 2 0 00.97 1.71l3 1.8a2 2 0 002.06 0L12 19v-5.5l-5-3-4.03 2.42z"/><path d="M7 16.5l-4.74-2.85"/><path d="M7 16.5l5-3"/><path d="M7 16.5v5.17"/><path d="M12 13.5V19l3.97 2.38a2 2 0 002.06 0l3-1.8A2 2 0 0022 17.87v-3.24a2 2 0 00-.97-1.71L17 10.5l-5 3z"/><path d="M17 16.5l-5-3"/><path d="M17 16.5l4.74-2.85"/><path d="M17 16.5v5.17"/><path d="M7.97 4.42A2 2 0 007 6.13v4.37l5 3 5-3V6.13a2 2 0 00-.97-1.71l-3-1.8a2 2 0 00-2.06 0l-3 1.8z"/><path d="M12 8L7.26 5.15"/><path d="M12 8l4.74-2.85"/><path d="M12 13.5V8"/>'
  );
}

function svgMap2D() {
  return svgWrap(
    '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>'
  );
}

function svgHex() {
  return '<svg class="logo-hex" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/><circle cx="12" cy="12" r="3"/></svg>';
}
