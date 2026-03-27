/**
 * 2D Map Panel
 * Renders a top-down orthographic view of the loaded 3D mesh
 * with zone overlays drawn on a 2D canvas.
 */
import * as THREE from 'three';
import { getScene } from '../ar/scene.js';
import { fetchAllAccessZones } from '../services/supabase.js';

let orthoRenderer, orthoScene, orthoCamera;
let overlayCanvas, overlayCtx;
let meshClone = null;
let zones = [];
let panOffset = { x: 0, y: 0 };
let zoomLevel = 1;
let meshBounds = null;
let isReady = false;
let animFrameId = null;
let containerEl = null;

export function create2DMapPanel(container) {
  const panel = document.createElement('div');
  panel.className = 'map2d-panel hidden';
  panel.id = 'map2d-panel';

  panel.innerHTML = `
    <div class="map2d-header">
      <div class="nav-title">2D FLOOR PLAN</div>
      <div class="map2d-controls">
        <button class="btn-mode active" id="btn-2d-reset" title="Reset View">⟲ Reset</button>
        <span class="map2d-zoom-label" id="zoom-label">100%</span>
      </div>
    </div>
    <div class="map2d-canvas-wrap" id="map2d-canvas-wrap"></div>
  `;

  container.appendChild(panel);

  const canvasWrap = panel.querySelector('#map2d-canvas-wrap');
  const btnReset = panel.querySelector('#btn-2d-reset');
  const zoomLabel = panel.querySelector('#zoom-label');

  // ── Setup Interaction ──

  let isPanning = false;
  let panStart = { x: 0, y: 0 };

  canvasWrap.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    zoomLevel = Math.max(0.1, Math.min(20, zoomLevel * delta));
    zoomLabel.textContent = `${Math.round(zoomLevel * 100)}%`;
    requestRender();
  }, { passive: false });

  canvasWrap.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    isPanning = true;
    panStart = { x: e.clientX, y: e.clientY };
    canvasWrap.style.cursor = 'grabbing';
    canvasWrap.setPointerCapture(e.pointerId);
  });

  canvasWrap.addEventListener('pointermove', (e) => {
    if (!isPanning) return;
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    panOffset.x += dx;
    panOffset.y += dy;
    panStart = { x: e.clientX, y: e.clientY };
    requestRender();
  });

  canvasWrap.addEventListener('pointerup', () => {
    isPanning = false;
    canvasWrap.style.cursor = 'grab';
  });

  btnReset.addEventListener('click', () => {
    panOffset = { x: 0, y: 0 };
    zoomLevel = 1;
    zoomLabel.textContent = '100%';
    requestRender();
  });

  // ── Rendering ──

  function initRenderer() {
    if (orthoRenderer) return;

    const w = canvasWrap.clientWidth || 600;
    const h = canvasWrap.clientHeight || 400;

    // Ortho renderer
    orthoRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    orthoRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    orthoRenderer.setSize(w, h);
    orthoRenderer.setClearColor(0x0d1117, 1);
    orthoRenderer.domElement.style.display = 'block';
    canvasWrap.appendChild(orthoRenderer.domElement);

    // Overlay canvas for zone labels/rectangles
    overlayCanvas = document.createElement('canvas');
    overlayCanvas.width = w * Math.min(window.devicePixelRatio, 2);
    overlayCanvas.height = h * Math.min(window.devicePixelRatio, 2);
    overlayCanvas.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;`;
    overlayCtx = overlayCanvas.getContext('2d');
    canvasWrap.appendChild(overlayCanvas);

    // Ortho scene
    orthoScene = new THREE.Scene();
    orthoScene.background = new THREE.Color(0x0d1117);

    // Ortho camera (looking straight down)
    const aspect = w / h;
    orthoCamera = new THREE.OrthographicCamera(-10 * aspect, 10 * aspect, 10, -10, 0.1, 1000);
    orthoCamera.position.set(0, 100, 0);
    orthoCamera.lookAt(0, 0, 0);
    orthoCamera.up.set(0, 0, -1); // Z points "up" in screen space

    // Lighting
    orthoScene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(0, 100, 0);
    orthoScene.add(dirLight);

    window.addEventListener('resize', onResize);
  }

  function onResize() {
    if (!orthoRenderer || !canvasWrap.clientWidth) return;
    const w = canvasWrap.clientWidth;
    const h = canvasWrap.clientHeight;
    orthoRenderer.setSize(w, h);
    overlayCanvas.width = w * Math.min(window.devicePixelRatio, 2);
    overlayCanvas.height = h * Math.min(window.devicePixelRatio, 2);
    overlayCanvas.style.width = w + 'px';
    overlayCanvas.style.height = h + 'px';
    requestRender();
  }

  function loadMeshFrom3DScene() {
    const scene3D = getScene();
    if (!scene3D) return;

    const mapMesh = scene3D.getObjectByName('MultiSetAnchor');
    if (!mapMesh) return;

    // Remove old clone
    if (meshClone) {
      orthoScene.remove(meshClone);
      meshClone.traverse((c) => { if (c.geometry) c.geometry.dispose(); });
    }

    meshClone = mapMesh.clone(true);

    // Replace wireframe materials with solid floor-plan style
    meshClone.traverse((child) => {
      if (child.isMesh && child.material) {
        const applyFloorStyle = (mat) => {
          const newMat = new THREE.MeshBasicMaterial({
            color: 0x58a6ff,
            wireframe: false,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide,
          });
          return newMat;
        };

        if (Array.isArray(child.material)) {
          child.material = child.material.map(applyFloorStyle);
        } else {
          child.material = applyFloorStyle(child.material);
        }
      }
    });

    orthoScene.add(meshClone);

    // Compute bounds
    const box = new THREE.Box3().setFromObject(meshClone);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    meshBounds = { box, size, center };

    // Fit camera
    const w = canvasWrap.clientWidth || 600;
    const h = canvasWrap.clientHeight || 400;
    const aspect = w / h;
    const maxDim = Math.max(size.x, size.z) * 0.6;

    orthoCamera.left = -maxDim * aspect;
    orthoCamera.right = maxDim * aspect;
    orthoCamera.top = maxDim;
    orthoCamera.bottom = -maxDim;
    orthoCamera.position.set(center.x, center.y + 50, center.z);
    orthoCamera.lookAt(center.x, center.y, center.z);
    orthoCamera.updateProjectionMatrix();

    isReady = true;
  }

  async function loadZones() {
    try {
      zones = await fetchAllAccessZones();
    } catch (e) {
      console.warn('[2D Map] Failed to load zones:', e);
      zones = [];
    }
  }

  function requestRender() {
    if (animFrameId) return;
    animFrameId = requestAnimationFrame(() => {
      render();
      animFrameId = null;
    });
  }

  function render() {
    if (!isReady || !orthoRenderer || !orthoCamera) return;

    // Apply pan/zoom
    if (meshBounds) {
      const w = canvasWrap.clientWidth || 600;
      const h = canvasWrap.clientHeight || 400;
      const aspect = w / h;
      const maxDim = Math.max(meshBounds.size.x, meshBounds.size.z) * 0.6;
      const z = zoomLevel;

      const halfW = (maxDim * aspect) / z;
      const halfH = maxDim / z;

      // Convert pixel pan to world-space units
      const pixelsPerUnit = w / (halfW * 2);
      const worldPanX = panOffset.x / pixelsPerUnit;
      const worldPanY = panOffset.y / pixelsPerUnit;

      orthoCamera.left = -halfW - worldPanX;
      orthoCamera.right = halfW - worldPanX;
      orthoCamera.top = halfH + worldPanY;
      orthoCamera.bottom = -halfH + worldPanY;
      orthoCamera.updateProjectionMatrix();
    }

    orthoRenderer.render(orthoScene, orthoCamera);
    renderZoneOverlay();
  }

  function renderZoneOverlay() {
    if (!overlayCtx || !meshBounds) return;

    const cw = overlayCanvas.width;
    const ch = overlayCanvas.height;
    overlayCtx.clearRect(0, 0, cw, ch);

    const dpr = Math.min(window.devicePixelRatio, 2);

    zones.forEach((zone) => {
      const x = Number(zone.x);
      const z = Number(zone.z);
      const w = Number(zone.w);
      const h = Number(zone.h);
      const label = zone.label || 'Zone';
      const isBlocked = zone.is_blocked;

      // Project world coords to screen coords
      const worldVec = new THREE.Vector3(x, 0, z);
      worldVec.project(orthoCamera);
      const sx = ((worldVec.x + 1) / 2) * cw;
      const sy = ((-worldVec.y + 1) / 2) * ch;

      // Project corner to get pixel size
      const cornerVec = new THREE.Vector3(x + w / 2, 0, z + h / 2);
      cornerVec.project(orthoCamera);
      const cx = ((cornerVec.x + 1) / 2) * cw;
      const cy = ((-cornerVec.y + 1) / 2) * ch;

      const pw = Math.abs(cx - sx) * 2;
      const ph = Math.abs(cy - sy) * 2;

      // Draw zone rectangle
      const color = isBlocked ? 'rgba(239, 68, 68, 0.35)' : 'rgba(0, 240, 255, 0.2)';
      const borderColor = isBlocked ? '#ef4444' : '#00f0ff';

      overlayCtx.fillStyle = color;
      overlayCtx.fillRect(sx - pw / 2, sy - ph / 2, pw, ph);

      overlayCtx.strokeStyle = borderColor;
      overlayCtx.lineWidth = 1.5 * dpr;
      overlayCtx.strokeRect(sx - pw / 2, sy - ph / 2, pw, ph);

      // Label
      overlayCtx.fillStyle = '#fff';
      overlayCtx.font = `${11 * dpr}px Inter, sans-serif`;
      overlayCtx.textAlign = 'center';
      overlayCtx.textBaseline = 'middle';
      overlayCtx.fillText(label, sx, sy);
    });
  }

  // ── Public API ──

  return {
    show() {
      panel.classList.remove('hidden');
      initRenderer();
      loadMeshFrom3DScene();
      loadZones().then(() => requestRender());
    },
    hide() {
      panel.classList.add('hidden');
    },
    refresh() {
      loadMeshFrom3DScene();
      loadZones().then(() => requestRender());
    },
  };
}
