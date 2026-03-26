/**
 * AR Scene → Standard 3D Map Viewer
 *
 * No camera/AR — just a Three.js scene with OrbitControls
 * to display the downloaded map mesh in VPS coordinates.
 *
 * Hierarchy:
 *   Scene
 *   ├── AmbientLight
 *   ├── DirectionalLight
 *   ├── GridHelper (ground reference)
 *   └── multisetAnchor (Group — pose from VPS)
 *         └── Map Mesh (loaded GLB)
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

let renderer, scene, camera, controls;
let transformControls;
let multisetAnchor;
let isInitialized = false;
let _container = null;

/** Callback fired whenever the gizmo moves the attached object */
let onGizmoDrag = null;

/**
 * Register a callback for gizmo drag events.
 * @param {(position: {x:number, y:number, z:number}) => void} cb
 */
export function setGizmoDragCallback(cb) {
  onGizmoDrag = cb;
}

/** Expose the scene so external modules can add/remove 3D objects. */
export function getScene() {
  return scene;
}

export function getCamera() {
  return camera;
}

export function getCanvas() {
  return renderer ? renderer.domElement : null;
}

export function setOrbitEnabled(enabled) {
  if (controls) controls.enabled = enabled;
}

/**
 * Initialize the 3D viewer scene.
 * @param {HTMLElement} container
 */
export function initScene(container) {
  _container = container;
  const w = container.clientWidth || window.innerWidth;
  const h = container.clientHeight || window.innerHeight;

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.setClearColor(0x0a0a14, 1);
  container.appendChild(renderer.domElement);

  // Scene
  scene = new THREE.Scene();

  // Fog for depth
  scene.fog = new THREE.FogExp2(0x0a0a14, 0.015);

  // Camera
  camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000);
  camera.position.set(5, 8, 12);
  camera.lookAt(0, 0, 0);

  // Orbit controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1;
  controls.maxDistance = 200;
  controls.target.set(0, 0, 0);

  // TransformControls (gizmo)
  transformControls = new TransformControls(camera, renderer.domElement);
  transformControls.setMode('translate');
  transformControls.setSize(0.8);
  scene.add(transformControls.getHelper());

  // Disable orbit while dragging the gizmo
  transformControls.addEventListener('dragging-changed', (event) => {
    controls.enabled = !event.value;
  });

  // Fire callback on gizmo change (object-change fires per-frame while dragging)
  transformControls.addEventListener('objectChange', () => {
    const obj = transformControls.object;
    if (!obj) return;
    
    if (onGizmoDrag) {
      onGizmoDrag({
        position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
        rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
        scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z }
      });
    }
  });

  // Lighting
  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
  dirLight.position.set(10, 20, 10);
  dirLight.castShadow = false;
  scene.add(dirLight);

  const hemiLight = new THREE.HemisphereLight(0x8888ff, 0x444422, 0.4);
  scene.add(hemiLight);

  // Grid helper (ground plane reference)
  const grid = new THREE.GridHelper(50, 50, 0x333355, 0x1a1a2e);
  scene.add(grid);

  // Axes helper (small, at origin)
  const axes = new THREE.AxesHelper(2);
  scene.add(axes);

  // MultiSet anchor group — mesh goes here
  multisetAnchor = new THREE.Group();
  multisetAnchor.name = 'MultiSetAnchor';
  scene.add(multisetAnchor);

  // Handle resize
  window.addEventListener('resize', onResize);

  isInitialized = true;
  animate();
}

function onResize() {
  if (!camera || !renderer) return;
  const w = _container ? _container.clientWidth : window.innerWidth;
  const h = _container ? _container.clientHeight : window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

let flyAnimation = null;

function animate() {
  requestAnimationFrame(animate);
  if (!isInitialized) return;

  // Handle fly-to animation
  if (flyAnimation) {
    flyAnimation.t += flyAnimation.speed;
    if (flyAnimation.t >= 1) {
      flyAnimation.t = 1;
      camera.position.copy(flyAnimation.endPos);
      controls.target.copy(flyAnimation.endTarget);
      flyAnimation = null;
    } else {
      const t = easeInOutCubic(flyAnimation.t);
      camera.position.lerpVectors(flyAnimation.startPos, flyAnimation.endPos, t);
      controls.target.lerpVectors(flyAnimation.startTarget, flyAnimation.endTarget, t);
    }
  }

  controls.update();
  renderer.render(scene, camera);
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Smoothly fly the camera to look at a point (x, y, z).
 * Camera positions itself at an offset above and behind the target.
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
export function flyTo(x, y, z) {
  if (!camera || !controls) return;

  const target = new THREE.Vector3(x, y, z);
  const offset = new THREE.Vector3(3, 5, 8); // camera offset from target

  flyAnimation = {
    t: 0,
    speed: 0.018, // ~55 frames ≈ ~0.9s
    startPos: camera.position.clone(),
    endPos: target.clone().add(offset),
    startTarget: controls.target.clone(),
    endTarget: target.clone(),
  };
}

/**
 * Apply a VPS pose to the MultiSet anchor group.
 * @param {{x: number, y: number, z: number}} position
 * @param {{x: number, y: number, z: number, w: number}} quaternion
 */
export function applyVPSPose(position, quaternion) {
  if (!multisetAnchor) return;
  multisetAnchor.position.set(position.x, position.y, position.z);
  multisetAnchor.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
}

import { addPOIsToScene } from './pois.js';

/**
 * Add a loaded GLTF scene to the MultiSet anchor group.
 * Auto-frames the camera to fit the model.
 * @param {THREE.Object3D} gltfScene
 */
export function addMesh(gltfScene) {
  if (!multisetAnchor) return;

  // Remove previously-added meshes
  const existing = multisetAnchor.getObjectByName('MapMesh');
  if (existing) multisetAnchor.remove(existing);

  // Apply wireframe to all meshes
  gltfScene.traverse((child) => {
    if (child.isMesh && child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach(mat => {
          mat.wireframe = true;
          // Optional: tweak appearance like color or opacity here if needed
        });
      } else {
        child.material.wireframe = true;
      }
    }
  });

  gltfScene.name = 'MapMesh';
  multisetAnchor.add(gltfScene);

  // Add POIs to the anchor
  addPOIsToScene(multisetAnchor);

  // Auto-frame camera to fit the model
  frameCameraToObject(gltfScene);
}

/**
 * Fit the camera to show the entire loaded model.
 */
function frameCameraToObject(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = camera.fov * (Math.PI / 180);
  let cameraDistance = maxDim / (2 * Math.tan(fov / 2));
  cameraDistance *= 1.5; // some padding

  camera.position.set(
    center.x + cameraDistance * 0.5,
    center.y + cameraDistance * 0.6,
    center.z + cameraDistance
  );
  camera.lookAt(center);
  controls.target.copy(center);
  controls.update();

  // Update near/far planes for the model scale
  camera.near = maxDim * 0.001;
  camera.far = maxDim * 100;
  camera.updateProjectionMatrix();
}

/**
 * Attach the TransformControls gizmo to a 3D mesh.
 * @param {THREE.Object3D} mesh
 */
export function attachGizmo(mesh) {
  if (!transformControls) return;
  transformControls.attach(mesh);
}

/**
 * Switch the TransformControls mode (translate, rotate, scale).
 * @param {'translate'|'rotate'|'scale'} mode
 */
export function setGizmoMode(mode) {
  if (!transformControls) return;
  transformControls.setMode(mode);
}

/**
 * Detach the TransformControls gizmo.
 */
export function detachGizmo() {
  if (!transformControls) return;
  transformControls.detach();
}
