import * as THREE from 'three';
import poisData from '../data/pois.json';

/** Exported so UI can read POI names/coords */
export { poisData };

/** Array of { mesh, label } for each POI, indexed same as poisData */
const poiObjects = [];
let poiGroupRef = null;

/**
 * Create a text sprite for the POI label.
 */
function createTextSprite(message) {
  const fontface = 'Arial';
  const fontsize = 36;
  const padding = 8;
  const borderRadius = 8;

  const canvas = document.createElement('canvas');
  // Initially set a large enough size
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');

  context.font = `Bold ${fontsize}px ${fontface}`;
  const metrics = context.measureText(message);
  const textWidth = metrics.width;
  
  // Resize canvas to exactly fit the text + padding
  canvas.width = textWidth + padding * 2;
  canvas.height = fontsize * 1.4 + padding * 2;
  
  // Need to re-set font after resize
  context.font = `Bold ${fontsize}px ${fontface}`;
  context.textBaseline = 'middle';
  context.textAlign = 'center';

  // Draw background bubble
  context.fillStyle = 'rgba(10, 10, 20, 0.8)'; // Dark background
  context.beginPath();
  context.roundRect(0, 0, canvas.width, canvas.height, borderRadius);
  context.fill();

  // Draw border
  context.lineWidth = 2;
  context.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  context.stroke();

  // Draw text
  context.fillStyle = 'rgba(255, 255, 255, 1.0)';
  context.fillText(message, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  // Need to map canvas size to world scale appropriately.
  // The canvas width/height ratio should be maintained.
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(spriteMaterial);
  
  // Scale the sprite based on canvas aspect ratio
  const scaleObj = 1.5; // Base scale size in 3D world
  sprite.scale.set(scaleObj * (canvas.width / canvas.height), scaleObj, 1);
  
  return sprite;
}

/**
 * Add POIs as spheres with labels to the given Group/Scene.
 * @param {THREE.Object3D} container 
 */
export function addPOIsToScene(container) {
  // Remove existing POIs group if any
  const existing = container.getObjectByName('POIGroup');
  if (existing) container.remove(existing);

  // Clear previous references
  poiObjects.length = 0;

  const poiGroup = new THREE.Group();
  poiGroup.name = 'POIGroup';
  poiGroupRef = poiGroup;

  // Geometry and Material for the pointer dot
  const dotGeo = new THREE.SphereGeometry(0.3, 16, 16);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xff3366 }); // Bright pink/red dot

  poisData.forEach((poi, index) => {
    const obj = createPOIObject(poi, index, dotGeo, dotMat);
    poiGroup.add(obj.mesh);
    poiGroup.add(obj.label);
    poiObjects.push(obj);
  });

  container.add(poiGroup);
}

/**
 * Get POI objects array (mesh + label per POI).
 */
export function getPOIObjects() {
  return poiObjects;
}

/**
 * Update a POI's 3D position (mesh + label).
 * @param {number} index  POI index
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
export function updatePOIPosition(index, x, y, z) {
  const obj = poiObjects[index];
  if (!obj) return;
  obj.mesh.position.set(x, y, z);
  obj.label.position.set(x, y + 1.2, z);
  // Also update the data source so coords stay consistent
  poisData[index].pos_x = x;
  poisData[index].pos_y = y;
  poisData[index].pos_z = z;
}

/**
 * Update a POI name and refresh its label sprite.
 * @param {number} index
 * @param {string} name
 */
export function updatePOIName(index, name) {
  const obj = poiObjects[index];
  const poi = poisData[index];
  if (!obj || !poi) return;
  poi.poi_name = name;

  const oldMaterial = obj.label.material;
  const oldMap = oldMaterial.map;
  const newLabel = createTextSprite(name);
  newLabel.position.copy(obj.label.position);

  if (poiGroupRef) poiGroupRef.remove(obj.label);
  obj.label = newLabel;
  if (poiGroupRef) poiGroupRef.add(newLabel);

  if (oldMap) oldMap.dispose();
  oldMaterial.dispose();
}

/**
 * Add a new POI in-memory and spawn it in the current scene.
 * @param {{ poi_name:string, pos_x:number, pos_y:number, pos_z:number }} poi
 */
export function addPOI(poi) {
  const newPoi = {
    poi_name: poi.poi_name,
    pos_x: poi.pos_x,
    pos_y: poi.pos_y,
    pos_z: poi.pos_z,
  };
  poisData.push(newPoi);
  const index = poisData.length - 1;

  if (poiGroupRef) {
    const dotGeo = new THREE.SphereGeometry(0.3, 16, 16);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xff3366 });
    const obj = createPOIObject(newPoi, index, dotGeo, dotMat);
    poiGroupRef.add(obj.mesh);
    poiGroupRef.add(obj.label);
    poiObjects.push(obj);
  }
}

/**
 * Delete a POI by index from in-memory data and current 3D scene.
 * @param {number} index
 */
export function deletePOI(index) {
  if (index < 0 || index >= poisData.length) return;

  const obj = poiObjects[index];
  if (obj && poiGroupRef) {
    poiGroupRef.remove(obj.mesh);
    poiGroupRef.remove(obj.label);
    if (obj.mesh.geometry) obj.mesh.geometry.dispose();
    if (obj.mesh.material) obj.mesh.material.dispose();
    if (obj.label.material?.map) obj.label.material.map.dispose();
    if (obj.label.material) obj.label.material.dispose();
  }

  poiObjects.splice(index, 1);
  poisData.splice(index, 1);

  // Keep mesh metadata aligned with current poi indexes.
  poiObjects.forEach((entry, i) => {
    entry.mesh.userData.poiIndex = i;
  });
}

function createPOIObject(poi, index, dotGeo, dotMat) {
  const mesh = new THREE.Mesh(dotGeo, dotMat);
  mesh.position.set(poi.pos_x, poi.pos_y, poi.pos_z);
  mesh.userData.poiIndex = index;

  const label = createTextSprite(poi.poi_name);
  label.position.set(poi.pos_x, poi.pos_y + 1.2, poi.pos_z);
  return { mesh, label };
}
