/**
 * 2D Map Panel (Floor Selector)
 * Shows detected floors in the right panel when 2D view is active.
 */
import { showFloor, getFloors, getActiveFloorIndex, resetView, getZoomLevel } from '../ar/map2d.js';

export function create2DMapPanel(container) {
  const panel = document.createElement('div');
  panel.className = 'map2d-panel hidden';
  panel.id = 'map2d-panel';

  panel.innerHTML = `
    <div class="map2d-header">
      <div class="nav-title">2D FLOOR PLAN</div>
    </div>
    <div class="map2d-floor-list" id="floor-list">
      <div class="zone-loading">Detecting floors…</div>
    </div>
    <div class="nav-divider"></div>
    <div class="map2d-controls-section">
      <button class="btn-mode active" id="btn-2d-reset" style="width:calc(100% - 32px);margin:8px 16px;">⟲ Reset View</button>
      <div class="map2d-zoom-info" style="text-align:center;padding:4px 0;">
        <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-3);">Zoom:</span>
        <span class="map2d-zoom-label" id="zoom-label" style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--cyan);">100%</span>
      </div>
    </div>
  `;

  container.appendChild(panel);

  const floorList = panel.querySelector('#floor-list');
  const btnReset = panel.querySelector('#btn-2d-reset');
  const zoomLabel = panel.querySelector('#zoom-label');

  btnReset.addEventListener('click', () => {
    resetView();
    zoomLabel.textContent = '100%';
  });

  /**
   * Populate the floor list after floors are detected.
   * @param {{ label:string, yMin:number, yMax:number }[]} detectedFloors
   */
  function setFloors(detectedFloors) {
    floorList.innerHTML = '';

    if (!detectedFloors || detectedFloors.length === 0) {
      floorList.innerHTML = '<div class="zone-loading">No floors detected</div>';
      return;
    }

    detectedFloors.forEach((floor, i) => {
      const item = document.createElement('div');
      item.className = 'poi-item' + (i === 0 ? ' active' : '');
      item.innerHTML = `
        <span style="font-weight:700;">${floor.label}</span>
        <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-3);margin-left:8px;">
          Y: ${floor.yMin.toFixed(1)} → ${floor.yMax.toFixed(1)}
        </span>
      `;
      item.addEventListener('click', () => {
        showFloor(i);
        floorList.querySelectorAll('.poi-item').forEach((el, j) => {
          el.classList.toggle('active', j === i);
        });
      });
      floorList.appendChild(item);
    });
  }

  // Listen for zoom changes from the 2D canvas
  function onZoomChange(e) {
    zoomLabel.textContent = `${Math.round(e.detail * 100)}%`;
  }

  return {
    show() { panel.classList.remove('hidden'); },
    hide() { panel.classList.add('hidden'); },
    setFloors,
    bindZoomListener(canvasContainer) {
      canvasContainer.addEventListener('zoom-change', onZoomChange);
    },
  };
}
