/**
 * 2D Map Renderer
 * Analyzes 3D mesh to detect floors (by Y-axis vertex clustering),
 * then renders a top-down orthographic view with clipping planes.
 */
import * as THREE from 'three';

let renderer, scene, camera;
let meshClone = null;
let floors = [];
let activeFloorIndex = 0;
let containerEl = null;
let isInitialized = false;
let animId = null;

// Interaction state
let panOffset = { x: 0, y: 0 };
let zoomLevel = 1;
let baseFrustum = { halfW: 10, halfH: 10 };
let isPanning = false;
let panStart = { x: 0, y: 0 };

// Clipping planes (top and bottom of current floor)
const clipTop = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);   // cuts above
const clipBottom = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);  // cuts below

/**
 * Analyze mesh geometry to detect floors using valley-based splitting.
 * Builds a Y histogram, smooths it, finds deep valleys (low-density Y regions)
 * to identify floor separation boundaries.
 * @param {THREE.Object3D} meshRoot
 * @returns {{ label:string, yMin:number, yMax:number, yCenter:number }[]}
 */
export function analyzeFloors(meshRoot) {
  const yValues = [];

  meshRoot.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    child.updateWorldMatrix(true, false);
    const pos = child.geometry.attributes.position;
    if (!pos) return;
    const worldMatrix = child.matrixWorld;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      v.applyMatrix4(worldMatrix);
      yValues.push(v.y);
    }
  });

  if (yValues.length === 0) return [{ label: 'Floor 1', yMin: -100, yMax: 100, yCenter: 0 }];

  let yMin = Infinity, yMax = -Infinity;
  for (let i = 0; i < yValues.length; i++) {
    if (yValues[i] < yMin) yMin = yValues[i];
    if (yValues[i] > yMax) yMax = yValues[i];
  }
  const totalRange = yMax - yMin;

  console.log(`[map2d] Y range: ${yMin.toFixed(2)} → ${yMax.toFixed(2)} (${totalRange.toFixed(2)}m), ${yValues.length} vertices`);

  // Single floor if the mesh is shorter than a typical room
  if (totalRange < 2.0) {
    return [{ label: 'Floor 1', yMin: yMin - 0.5, yMax: yMax + 0.5, yCenter: (yMin + yMax) / 2 }];
  }

  // ── Build coarse histogram ──
  const binSize = 0.3; // 30cm bins — coarse enough to smooth wall noise
  const numBins = Math.ceil(totalRange / binSize);
  const histogram = new Array(numBins).fill(0);

  for (const y of yValues) {
    const bin = Math.min(numBins - 1, Math.floor((y - yMin) / binSize));
    histogram[bin]++;
  }

  // ── Heavy smoothing (window = 7 bins = ~2m) to merge wall noise ──
  const smoothed = new Array(numBins).fill(0);
  const halfWin = 3;
  for (let i = 0; i < numBins; i++) {
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - halfWin); j <= Math.min(numBins - 1, i + halfWin); j++) {
      sum += histogram[j];
      count++;
    }
    smoothed[i] = sum / count;
  }

  // ── Find ALL local minima in the smoothed histogram ──
  const edgeMargin = Math.max(5, Math.floor(numBins * 0.05));
  const localMinima = [];

  for (let i = edgeMargin; i < numBins - edgeMargin; i++) {
    // A local minimum: lower than all neighbors in ±3 bin window
    let isMin = true;
    for (let j = Math.max(0, i - 3); j <= Math.min(numBins - 1, i + 3); j++) {
      if (j !== i && smoothed[j] < smoothed[i]) { isMin = false; break; }
    }
    if (!isMin) continue;

    // Find the highest peak to the LEFT (scan up to 50 bins or edge)
    let leftPeak = smoothed[i];
    for (let j = i - 1; j >= Math.max(0, i - 50); j--) {
      if (smoothed[j] > leftPeak) leftPeak = smoothed[j];
    }

    // Find the highest peak to the RIGHT
    let rightPeak = smoothed[i];
    for (let j = i + 1; j <= Math.min(numBins - 1, i + 50); j++) {
      if (smoothed[j] > rightPeak) rightPeak = smoothed[j];
    }

    // Prominence: how much does this valley dip relative to the lower of its two surrounding peaks?
    const neighborPeak = Math.min(leftPeak, rightPeak);
    const prominence = neighborPeak > 0 ? (1 - smoothed[i] / neighborPeak) : 0;

    // Only consider valleys that dip at least 30% below their neighboring peaks
    if (prominence > 0.30) {
      localMinima.push({
        bin: i,
        y: yMin + (i + 0.5) * binSize,
        density: smoothed[i],
        prominence,
      });
    }
  }

  // ── Sort candidates by prominence (deepest relative valleys first) ──
  localMinima.sort((a, b) => b.prominence - a.prominence);

  // ── Remove valleys too close to each other (keep the most prominent) ──
  const minFloorHeight = 1.5;
  const splits = [];
  for (const c of localMinima) {
    const tooClose = splits.some(s => Math.abs(s.y - c.y) < minFloorHeight);
    if (!tooClose) {
      splits.push(c);
    }
  }

  // Sort splits by Y position
  splits.sort((a, b) => a.y - b.y);

  console.log(`[map2d] Found ${splits.length} valley split(s):`,
    splits.map(s => `Y=${s.y.toFixed(2)} (prominence=${(s.prominence * 100).toFixed(0)}%)`));

  // ── Build floor ranges from splits ──
  if (splits.length === 0) {
    // No valleys found → single floor
    return [{ label: 'Floor 1', yMin: yMin - 0.5, yMax: yMax + 0.5, yCenter: (yMin + yMax) / 2 }];
  }

  const result = [];
  let prevY = yMin - 0.5;
  for (let i = 0; i < splits.length; i++) {
    const splitY = splits[i].y;
    result.push({
      label: `Floor ${i + 1}`,
      yMin: prevY,
      yMax: splitY,
      yCenter: (prevY + splitY) / 2,
    });
    prevY = splitY;
  }
  // Final floor (above last split)
  result.push({
    label: `Floor ${splits.length + 1}`,
    yMin: prevY,
    yMax: yMax + 0.5,
    yCenter: (prevY + yMax + 0.5) / 2,
  });

  console.log(`[map2d] Detected ${result.length} floor(s):`, result.map(f => `${f.label}: Y ${f.yMin.toFixed(2)} → ${f.yMax.toFixed(2)}`));
  return result;
}

// ── Renderer Setup ──────────────────────────────────────

/**
 * Initialize the 2D orthographic renderer inside a container.
 * @param {HTMLElement} container
 */
export function init2DView(container) {
  containerEl = container;

  const w = container.clientWidth || 800;
  const h = container.clientHeight || 600;

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  renderer.setClearColor(0x0d1117, 1);
  renderer.localClippingEnabled = true;
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1117);

  // Orthographic camera looking straight down
  const aspect = w / h;
  camera = new THREE.OrthographicCamera(-10 * aspect, 10 * aspect, 10, -10, 0.1, 2000);
  camera.position.set(0, 500, 0);
  camera.lookAt(0, 0, 0);
  camera.up.set(0, 0, -1);

  // Lighting
  scene.add(new THREE.AmbientLight(0xffffff, 1.0));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
  dirLight.position.set(0, 100, 0);
  scene.add(dirLight);

  // Interaction
  container.addEventListener('wheel', onWheel, { passive: false });
  container.addEventListener('pointerdown', onPointerDown);
  container.addEventListener('pointermove', onPointerMove);
  container.addEventListener('pointerup', onPointerUp);
  container.addEventListener('pointerleave', onPointerUp);

  window.addEventListener('resize', onResize);
  isInitialized = true;
}

function onResize() {
  if (!renderer || !containerEl) return;
  const w = containerEl.clientWidth;
  const h = containerEl.clientHeight;
  if (w === 0 || h === 0) return;
  renderer.setSize(w, h);
  updateCamera();
  render();
}

function onWheel(e) {
  e.preventDefault();
  const factor = e.deltaY > 0 ? 0.9 : 1.1;
  zoomLevel = Math.max(0.05, Math.min(50, zoomLevel * factor));
  updateCamera();
  render();
  // Dispatch zoom change for UI updates
  if (containerEl) containerEl.dispatchEvent(new CustomEvent('zoom-change', { detail: zoomLevel }));
}

function onPointerDown(e) {
  if (e.button !== 0) return;
  isPanning = true;
  panStart = { x: e.clientX, y: e.clientY };
  containerEl.style.cursor = 'grabbing';
  containerEl.setPointerCapture(e.pointerId);
}

function onPointerMove(e) {
  if (!isPanning) return;
  const dx = e.clientX - panStart.x;
  const dy = e.clientY - panStart.y;
  panOffset.x += dx;
  panOffset.y += dy;
  panStart = { x: e.clientX, y: e.clientY };
  updateCamera();
  render();
}

function onPointerUp() {
  isPanning = false;
  if (containerEl) containerEl.style.cursor = 'grab';
}

function updateCamera() {
  if (!camera || !containerEl) return;
  const w = containerEl.clientWidth || 800;
  const h = containerEl.clientHeight || 600;
  const aspect = w / h;

  const halfW = baseFrustum.halfW / zoomLevel;
  const halfH = baseFrustum.halfH / zoomLevel;

  // Convert pixel-space pan to world units
  const pixPerUnit = w / (halfW * 2);
  const wx = panOffset.x / pixPerUnit;
  const wy = panOffset.y / pixPerUnit;

  camera.left = -halfW * aspect - wx;
  camera.right = halfW * aspect - wx;
  camera.top = halfH + wy;
  camera.bottom = -halfH + wy;
  camera.updateProjectionMatrix();
}

// ── Mesh Loading ──────────────────────────────────────

/**
 * Load the mesh into the 2D scene and detect floors.
 * @param {THREE.Object3D} meshRoot — the MultiSetAnchor from the 3D scene
 * @returns {{ label:string, yMin:number, yMax:number, yCenter:number }[]}
 */
export function loadMeshFor2D(meshRoot) {
  if (!scene) return [];

  // Remove old clone
  if (meshClone) {
    scene.remove(meshClone);
    meshClone.traverse((c) => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
        else c.material.dispose();
      }
    });
  }

  meshClone = meshRoot.clone(true);

  // Replace materials with floor-plan style, enable clipping
  meshClone.traverse((child) => {
    if (child.isMesh && child.material) {
      const newMat = new THREE.MeshLambertMaterial({
        color: 0x58a6ff,
        transparent: false,
        side: THREE.DoubleSide,
        clippingPlanes: [clipTop, clipBottom],
        clipShadows: true,
      });

      if (Array.isArray(child.material)) {
        child.material.forEach(m => m.dispose());
        child.material = child.material.map(() => newMat.clone());
      } else {
        child.material.dispose();
        child.material = newMat;
      }
    }
  });

  scene.add(meshClone);

  // Detect floors
  floors = analyzeFloors(meshClone);

  // Fit camera to mesh bounds
  const box = new THREE.Box3().setFromObject(meshClone);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  baseFrustum.halfW = Math.max(size.x, size.z) * 0.6;
  baseFrustum.halfH = Math.max(size.x, size.z) * 0.6;

  const camY = center.y + Math.max(size.y, 50) + 100;
  camera.position.set(center.x, camY, center.z);
  camera.lookAt(center.x, center.y, center.z);

  // Show first floor
  panOffset = { x: 0, y: 0 };
  zoomLevel = 1;
  if (floors.length > 0) showFloor(0);

  return floors;
}

// ── Floor Switching ──────────────────────────────────────

/**
 * Show a specific floor by index.
 * @param {number} index
 */
export function showFloor(index) {
  if (index < 0 || index >= floors.length) return;
  activeFloorIndex = index;
  const floor = floors[index];

  // Set clipping planes to slice at this floor's Y range
  clipTop.constant = floor.yMax;     // -Y plane at yMax: hides everything above
  clipBottom.constant = -floor.yMin; // +Y plane at yMin: hides everything below

  render();
  console.log(`[map2d] Showing ${floor.label} (Y: ${floor.yMin.toFixed(2)} → ${floor.yMax.toFixed(2)})`);
}

export function getFloors() {
  return floors;
}

export function getActiveFloorIndex() {
  return activeFloorIndex;
}

export function getZoomLevel() {
  return zoomLevel;
}

/**
 * Reset pan and zoom to default.
 */
export function resetView() {
  panOffset = { x: 0, y: 0 };
  zoomLevel = 1;
  updateCamera();
  render();
}

// ── Render Loop ──────────────────────────────────────

function render() {
  if (!isInitialized || !renderer || !camera || !scene) return;
  renderer.render(scene, camera);
}

/**
 * Trigger a render (called externally when view becomes visible).
 */
export function requestRender() {
  if (!isInitialized) return;
  onResize(); // recalculate dimensions in case container changed
  render();
}

/**
 * Dispose the 2D renderer and free resources.
 */
export function dispose2DView() {
  if (renderer) {
    renderer.dispose();
    if (renderer.domElement && renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
  }
  if (containerEl) {
    containerEl.removeEventListener('wheel', onWheel);
    containerEl.removeEventListener('pointerdown', onPointerDown);
    containerEl.removeEventListener('pointermove', onPointerMove);
    containerEl.removeEventListener('pointerup', onPointerUp);
    containerEl.removeEventListener('pointerleave', onPointerUp);
  }
  window.removeEventListener('resize', onResize);
  isInitialized = false;
}
