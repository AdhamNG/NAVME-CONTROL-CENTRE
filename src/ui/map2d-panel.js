/**
 * 2D Map Panel — Manual Floor Management
 * Users add floor markers in the 3D scene, position them on Y axis,
 * then use them as clipping boundaries for the 2D floor plan.
 */
import {
  addFloorMarker,
  attachFloorGizmo,
  detachFloorGizmo,
  removeFloorMarker,
  getFloorMarkerY,
  setGizmoDragCallback,
} from '../ar/scene.js';
import { setManualFloors, showFloor, resetView, getZoomLevel } from '../ar/map2d.js';

let floorEntries = []; // { id, name, marker, yPos, confirmed }
let nextId = 1;
let activeEntryId = null;

export function create2DMapPanel(container) {
  const panel = document.createElement('div');
  panel.className = 'map2d-panel hidden';
  panel.id = 'map2d-panel';

  panel.innerHTML = `
    <div class="map2d-header">
      <div class="nav-title">FLOOR MANAGER</div>
    </div>
    <div class="map2d-add-section" style="padding:8px 16px;">
      <button class="btn-save" id="btn-add-floor" style="background:linear-gradient(135deg,rgba(0,240,255,0.2),rgba(139,92,246,0.2));border:1px solid rgba(0,240,255,0.3);">
        <span class="icon">＋</span> Add Floor Marker
      </button>
    </div>
    <div class="nav-divider"></div>
    <div class="map2d-floor-list" id="floor-list">
      <div class="zone-loading" style="color:var(--text-3);font-size:11px;">
        No floors defined yet.<br>Click "Add Floor Marker" to start.
      </div>
    </div>
    <div class="nav-divider"></div>
    <div style="padding:8px 16px;">
      <button class="btn-mode active" id="btn-2d-reset" style="width:100%;">⟲ Reset View</button>
      <div style="text-align:center;padding:4px 0;">
        <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-3);">Zoom:</span>
        <span class="map2d-zoom-label" id="zoom-label" style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--cyan);">100%</span>
      </div>
    </div>
  `;

  container.appendChild(panel);

  const floorList = panel.querySelector('#floor-list');
  const btnAdd = panel.querySelector('#btn-add-floor');
  const btnReset = panel.querySelector('#btn-2d-reset');
  const zoomLabel = panel.querySelector('#zoom-label');

  btnReset.addEventListener('click', () => {
    resetView();
    zoomLabel.textContent = '100%';
  });

  btnAdd.addEventListener('click', () => {
    addNewFloor();
  });

  function addNewFloor() {
    const id = nextId++;
    const colorIndex = floorEntries.length;
    const marker = addFloorMarker(0, colorIndex);
    if (!marker) return;

    const entry = {
      id,
      name: `Floor ${floorEntries.length + 1}`,
      marker,
      yPos: 0,
      confirmed: false,
    };
    floorEntries.push(entry);
    renderFloorList();

    // Attach gizmo to this marker
    selectEntry(id);
  }

  function selectEntry(id) {
    activeEntryId = id;
    const entry = floorEntries.find(e => e.id === id);
    if (!entry) return;

    // Attach Y-only gizmo
    attachFloorGizmo(entry.marker);

    // Listen for gizmo drag to update Y position
    setGizmoDragCallback((data) => {
      entry.yPos = data.position.y;
      const yLabel = panel.querySelector(`#floor-y-${entry.id}`);
      if (yLabel) yLabel.textContent = `Y: ${entry.yPos.toFixed(1)}`;
    });

    renderFloorList();
  }

  function confirmEntry(id) {
    const entry = floorEntries.find(e => e.id === id);
    if (!entry) return;
    entry.confirmed = true;
    entry.yPos = getFloorMarkerY(entry.marker);
    detachFloorGizmo();
    setGizmoDragCallback(null);
    activeEntryId = null;
    renderFloorList();
    pushFloorsTo2D();
  }

  function deleteEntry(id) {
    const idx = floorEntries.findIndex(e => e.id === id);
    if (idx === -1) return;
    const entry = floorEntries[idx];
    removeFloorMarker(entry.marker);
    if (activeEntryId === id) {
      setGizmoDragCallback(null);
      activeEntryId = null;
    }
    floorEntries.splice(idx, 1);
    renderFloorList();
    pushFloorsTo2D();
  }

  function renameEntry(id, newName) {
    const entry = floorEntries.find(e => e.id === id);
    if (entry) entry.name = newName;
  }

  function pushFloorsTo2D() {
    // Build sorted floor definitions from confirmed entries
    const confirmed = floorEntries.filter(e => e.confirmed);
    if (confirmed.length === 0) {
      setManualFloors([]);
      return;
    }

    // Sort by Y ascending
    confirmed.sort((a, b) => a.yPos - b.yPos);

    const floors = confirmed.map((entry, i) => {
      const yMin = i === 0 ? -9999 : (confirmed[i - 1].yPos + entry.yPos) / 2;
      const yMax = i === confirmed.length - 1 ? 9999 : (entry.yPos + confirmed[i + 1].yPos) / 2;
      return {
        label: entry.name,
        yMin,
        yMax,
        yCenter: entry.yPos,
      };
    });

    setManualFloors(floors);
  }

  function renderFloorList() {
    if (floorEntries.length === 0) {
      floorList.innerHTML = `
        <div class="zone-loading" style="color:var(--text-3);font-size:11px;">
          No floors defined yet.<br>Click "Add Floor Marker" to start.
        </div>
      `;
      return;
    }

    floorList.innerHTML = '';
    floorEntries.forEach((entry) => {
      const isActive = activeEntryId === entry.id;
      const item = document.createElement('div');
      item.className = 'floor-entry' + (isActive ? ' active' : '') + (entry.confirmed ? ' confirmed' : '');
      item.innerHTML = `
        <div class="floor-entry-header">
          <input class="floor-name-input" type="text" value="${entry.name}"
            ${entry.confirmed ? 'disabled' : ''}
            style="background:transparent;border:1px solid ${entry.confirmed ? 'var(--border-dim)' : 'var(--border-bright)'};
            color:var(--text-1);font-family:var(--font-mono);font-size:11px;padding:4px 8px;border-radius:4px;width:100px;outline:none;">
          <span id="floor-y-${entry.id}" style="font-family:var(--font-mono);font-size:10px;color:var(--text-3);white-space:nowrap;">
            Y: ${entry.yPos.toFixed(1)}
          </span>
        </div>
        <div class="floor-entry-actions">
          ${!entry.confirmed ? `
            <button class="admin-btn admin-btn-save btn-confirm-floor" title="Confirm position">✓</button>
            <button class="admin-btn admin-btn-edit btn-select-floor" title="Select / drag">↕</button>
          ` : `
            <button class="admin-btn admin-btn-edit btn-reposition-floor" title="Reposition">↕</button>
          `}
          <button class="admin-btn admin-btn-delete btn-delete-floor" title="Delete">✕</button>
        </div>
      `;

      // Name change
      const nameInput = item.querySelector('.floor-name-input');
      nameInput.addEventListener('change', () => renameEntry(entry.id, nameInput.value));

      // Confirm
      const btnConfirm = item.querySelector('.btn-confirm-floor');
      if (btnConfirm) btnConfirm.addEventListener('click', () => confirmEntry(entry.id));

      // Select/drag
      const btnSelect = item.querySelector('.btn-select-floor');
      if (btnSelect) btnSelect.addEventListener('click', () => selectEntry(entry.id));

      // Reposition confirmed floor
      const btnReposition = item.querySelector('.btn-reposition-floor');
      if (btnReposition) {
        btnReposition.addEventListener('click', () => {
          entry.confirmed = false;
          selectEntry(entry.id);
        });
      }

      // Delete
      const btnDelete = item.querySelector('.btn-delete-floor');
      btnDelete.addEventListener('click', () => deleteEntry(entry.id));

      // Click to select floor in 2D view
      if (entry.confirmed) {
        item.addEventListener('click', (e) => {
          if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
          const confirmedEntries = floorEntries.filter(f => f.confirmed).sort((a, b) => a.yPos - b.yPos);
          const floorIdx = confirmedEntries.findIndex(f => f.id === entry.id);
          if (floorIdx >= 0) showFloor(floorIdx);
        });
      }

      floorList.appendChild(item);
    });
  }

  // Zoom listener
  function onZoomChange(e) {
    zoomLabel.textContent = `${Math.round(e.detail * 100)}%`;
  }

  return {
    show() { panel.classList.remove('hidden'); },
    hide() { panel.classList.add('hidden'); },
    bindZoomListener(canvasContainer) {
      canvasContainer.addEventListener('zoom-change', onZoomChange);
    },
    getConfirmedFloors() {
      return floorEntries.filter(e => e.confirmed);
    },
  };
}
