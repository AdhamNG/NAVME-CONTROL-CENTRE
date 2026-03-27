/**
 * 2D Map Renderer
 * Renders a top-down orthographic view of the loaded 3D mesh.
 * Floors are defined manually via setManualFloors().
 * Clipping planes slice the mesh to show one floor at a time.
 */
import * as THREE from 'three';

let renderer, scene, camera;
let meshClone = null;
let floors = [];
let activeFloorIndex = 0;
let containerEl = null;
let isInitialized = false;

// Interaction state
let panOffset = { x: 0, y: 0 };
let zoomLevel = 1;
let baseFrustum = { halfW: 10, halfH: 10 };
let isPanning = false;
let panStart = { x: 0, y: 0 };

// Clipping planes (top and bottom of current floor)
const clipTop = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
const clipBottom = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

// ── Manual Floor Definitions ──────────────────────────────

/**
 * Set the floor definitions (from manually-placed markers).
 * @param {{ label:string, yMin:number, yMax:number, yCenter:number }[]} manualFloors
 */
export function setManualFloors(manualFloors) {
  floors = manualFloors;
  if (floors.length > 0) {
    showFloor(0);
  }
}

// ── Renderer Setup ──────────────────────────────────────

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

  const aspect = w / h;
  camera = new THREE.OrthographicCamera(-10 * aspect, 10 * aspect, 10, -10, 0.1, 2000);
  camera.position.set(0, 500, 0);
  camera.lookAt(0, 0, 0);
  camera.up.set(0, 0, -1);

  scene.add(new THREE.AmbientLight(0xffffff, 1.0));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
  dirLight.position.set(0, 100, 0);
  scene.add(dirLight);

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
  panOffset.x += e.clientX - panStart.x;
  panOffset.y += e.clientY - panStart.y;
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
 * Load the mesh into the 2D scene.
 * @param {THREE.Object3D} meshRoot — the MultiSetAnchor from the 3D scene
 */
export function loadMeshFor2D(meshRoot) {
  if (!scene) return;

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

  // Apply floor-plan materials with clipping
  meshClone.traverse((child) => {
    if (child.isMesh && child.material) {
      const newMat = new THREE.MeshLambertMaterial({
        color: 0x58a6ff,
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

  // Fit camera to mesh bounds
  const box = new THREE.Box3().setFromObject(meshClone);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  baseFrustum.halfW = Math.max(size.x, size.z) * 0.6;
  baseFrustum.halfH = Math.max(size.x, size.z) * 0.6;

  const camY = center.y + Math.max(size.y, 50) + 100;
  camera.position.set(center.x, camY, center.z);
  camera.lookAt(center.x, center.y, center.z);

  panOffset = { x: 0, y: 0 };
  zoomLevel = 1;

  // If we have floors, show the first one; otherwise show the full mesh
  if (floors.length > 0) {
    showFloor(0);
  } else {
    // No clipping — show everything
    clipTop.constant = 99999;
    clipBottom.constant = 99999;
    render();
  }
}

// ── Floor Switching ──────────────────────────────────────

export function showFloor(index) {
  if (index < 0 || index >= floors.length) return;
  activeFloorIndex = index;
  const floor = floors[index];

  clipTop.constant = floor.yMax;
  clipBottom.constant = -floor.yMin;

  render();
  console.log(`[map2d] Showing ${floor.label} (Y: ${floor.yMin.toFixed(2)} → ${floor.yMax.toFixed(2)})`);
}

export function getFloors() { return floors; }
export function getActiveFloorIndex() { return activeFloorIndex; }
export function getZoomLevel() { return zoomLevel; }

export function resetView() {
  panOffset = { x: 0, y: 0 };
  zoomLevel = 1;
  updateCamera();
  render();
}

function render() {
  if (!isInitialized || !renderer || !camera || !scene) return;
  renderer.render(scene, camera);
}

export function requestRender() {
  if (!isInitialized) return;
  onResize();
  render();
}
