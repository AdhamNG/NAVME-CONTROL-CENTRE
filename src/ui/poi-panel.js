/**
 * POI Panel UI
 * Shows a scrollable list of POIs. Clicking one shows editable X/Y/Z fields.
 * "Save Changes" updates the POI in the 3D scene.
 */

import { poisData, addPOI, deletePOI, getPOIObjects, updatePOIName, updatePOIPosition } from '../ar/pois.js';
import { flyTo, attachGizmo, detachGizmo, setGizmoDragCallback } from '../ar/scene.js';

let selectedIndex = -1;
let inputName, inputX, inputY, inputZ;

/**
 * @param {HTMLElement} container
 */
export function createPOIPanel(container) {
  const panel = document.createElement('div');
  panel.className = 'poi-panel hidden';
  panel.id = 'poi-panel';

  panel.innerHTML = `
    <div class="poi-panel-header">
      <div class="nav-title">POIs</div>
    </div>
    <div class="poi-list" id="poi-list"></div>
    <div class="poi-coords hidden" id="poi-coords">
      <div class="nav-divider"></div>
      <div class="poi-coords-title" id="poi-selected-name"></div>
      <div class="coord-group" style="padding:0 16px 8px;">
        <label>Name</label>
        <input type="text" id="poi-name" value="" />
      </div>
      <div class="coord-inputs">
        <div class="coord-group">
          <label style="color:#ef4444;font-weight:700;">X</label>
          <input type="number" id="poi-x" value="0" step="any" />
        </div>
        <div class="coord-group">
          <label style="color:#22c55e;font-weight:700;">Y</label>
          <input type="number" id="poi-y" value="0" step="any" />
        </div>
        <div class="coord-group">
          <label style="color:#3b82f6;font-weight:700;">Z</label>
          <input type="number" id="poi-z" value="0" step="any" />
        </div>
      </div>
      <div style="display:flex;gap:8px;padding:0 16px;">
        <button class="btn-save" id="btn-save-poi" style="flex:1;margin:0;">
          <span class="icon">💾</span> Save Changes
        </button>
        <button class="btn-save" id="btn-delete-poi" style="width:auto;margin:0;padding:10px 12px;background:linear-gradient(135deg,#ef4444 0%,#b91c1c 100%);" title="Delete POI">
          🗑️
        </button>
      </div>
      <div class="nav-divider"></div>
      <div class="nav-subtitle">Add New POI</div>
      <div class="coord-group" style="padding:0 16px 8px;">
        <label>Name</label>
        <input type="text" id="new-poi-name" placeholder="New POI Name" />
      </div>
      <div class="coord-inputs">
        <div class="coord-group">
          <label style="color:#ef4444;font-weight:700;">X</label>
          <input type="number" id="new-poi-x" value="0" step="any" />
        </div>
        <div class="coord-group">
          <label style="color:#22c55e;font-weight:700;">Y</label>
          <input type="number" id="new-poi-y" value="0" step="any" />
        </div>
        <div class="coord-group">
          <label style="color:#3b82f6;font-weight:700;">Z</label>
          <input type="number" id="new-poi-z" value="0" step="any" />
        </div>
      </div>
      <button class="btn-save" id="btn-add-poi">
        <span class="icon">➕</span> Add POI
      </button>
    </div>
  `;

  container.appendChild(panel);

  const listEl = panel.querySelector('#poi-list');
  const coordsEl = panel.querySelector('#poi-coords');
  const selectedNameEl = panel.querySelector('#poi-selected-name');
  inputName = panel.querySelector('#poi-name');
  inputX = panel.querySelector('#poi-x');
  inputY = panel.querySelector('#poi-y');
  inputZ = panel.querySelector('#poi-z');
  const btnSave = panel.querySelector('#btn-save-poi');
  const btnDelete = panel.querySelector('#btn-delete-poi');
  const btnAdd = panel.querySelector('#btn-add-poi');
  const newPoiName = panel.querySelector('#new-poi-name');
  const newPoiX = panel.querySelector('#new-poi-x');
  const newPoiY = panel.querySelector('#new-poi-y');
  const newPoiZ = panel.querySelector('#new-poi-z');

  function rebuildList() {
    listEl.innerHTML = '';
    poisData.forEach((poi, index) => {
      const item = document.createElement('div');
      item.className = 'poi-item';
      item.dataset.index = index;
      item.textContent = poi.poi_name;
      item.addEventListener('click', () => selectPOI(index));
      listEl.appendChild(item);
    });
  }
  rebuildList();

  function selectPOI(index) {
    selectedIndex = index;
    const poi = poisData[index];

    // Highlight active item
    listEl.querySelectorAll('.poi-item').forEach((el, i) => {
      el.classList.toggle('active', i === index);
    });

    // Show coords
    coordsEl.classList.remove('hidden');
    selectedNameEl.textContent = poi.poi_name;
    inputName.value = poi.poi_name;
    inputX.value = poi.pos_x.toFixed(4);
    inputY.value = poi.pos_y.toFixed(4);
    inputZ.value = poi.pos_z.toFixed(4);
    newPoiX.value = poi.pos_x.toFixed(4);
    newPoiY.value = poi.pos_y.toFixed(4);
    newPoiZ.value = poi.pos_z.toFixed(4);

    // Fly camera to POI
    flyTo(poi.pos_x, poi.pos_y, poi.pos_z);

    // Attach gizmo to this POI's mesh
    const objs = getPOIObjects();
    if (objs[index]) {
      attachGizmo(objs[index].mesh);
    }
  }

  // Save button
  btnSave.addEventListener('click', () => {
    if (selectedIndex < 0) return;
    const name = inputName.value.trim();
    const x = parseFloat(inputX.value) || 0;
    const y = parseFloat(inputY.value) || 0;
    const z = parseFloat(inputZ.value) || 0;
    if (name) {
      updatePOIName(selectedIndex, name);
      selectedNameEl.textContent = name;
    }
    updatePOIPosition(selectedIndex, x, y, z);
    rebuildList();
    selectPOI(selectedIndex);

    // Flash save feedback
    btnSave.textContent = '✓ Saved!';
    btnSave.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
    setTimeout(() => {
      btnSave.innerHTML = '<span class="icon">💾</span> Save Changes';
      btnSave.style.background = '';
    }, 1200);
  });

  btnAdd.addEventListener('click', () => {
    const name = newPoiName.value.trim();
    if (!name) return;
    const x = parseFloat(newPoiX.value) || 0;
    const y = parseFloat(newPoiY.value) || 0;
    const z = parseFloat(newPoiZ.value) || 0;
    addPOI({ poi_name: name, pos_x: x, pos_y: y, pos_z: z });
    rebuildList();
    const idx = poisData.length - 1;
    selectPOI(idx);
    newPoiName.value = '';
  });

  btnDelete.addEventListener('click', () => {
    if (selectedIndex < 0) return;
    const name = poisData[selectedIndex]?.poi_name || 'this POI';
    if (!confirm(`Delete ${name}?`)) return;
    deletePOI(selectedIndex);
    detachGizmo();
    selectedIndex = -1;
    coordsEl.classList.add('hidden');
    rebuildList();
  });

  // Listen for gizmo drag to update coordinate fields in real-time
  setGizmoDragCallback((transform) => {
    if (selectedIndex < 0) return;
    const pos = transform.position;
    inputX.value = pos.x.toFixed(4);
    inputY.value = pos.y.toFixed(4);
    inputZ.value = pos.z.toFixed(4);

    // Also update the label position and data
    const objs = getPOIObjects();
    if (objs[selectedIndex]) {
      objs[selectedIndex].label.position.set(pos.x, pos.y + 1.2, pos.z);
    }
  });

  return {
    show() {
      panel.classList.remove('hidden');
    },
    hide() {
      panel.classList.add('hidden');
    }
  };
}
