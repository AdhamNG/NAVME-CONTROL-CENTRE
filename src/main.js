/**
 * Main orchestrator
 * Flow: Form → Auth → Init Dashboard + 3D viewer → Download mesh → Display
 */
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { renderForm } from './ui/form.js';
import { createStatusBar, createConfidenceBadge } from './ui/status.js';
import { getM2MToken } from './services/multiset-auth.js';
import { downloadMapMesh } from './services/multiset-mesh.js';
import { initScene, addMesh, flyTo, getScene } from './ar/scene.js';
import { init2DView, loadMeshFor2D, requestRender as render2D } from './ar/map2d.js';
import { createDashboard } from './ui/dashboard.js';
import { createNavPanel } from './ui/nav.js';
import { createPOIPanel } from './ui/poi-panel.js';
import { createUserPanel } from './ui/user-panel.js';
import { createAdminPanels } from './ui/admin-panel.js';
import { createZonePanel } from './ui/zone-panel.js';
import { create2DMapPanel } from './ui/map2d-panel.js';

const app = document.getElementById('app');

const dashboard = createDashboard(app);
const statusBar = createStatusBar(app);
const confidenceBadge = createConfidenceBadge(app);
const formUI = renderForm(app, onFormSubmit);

const navPanel = createNavPanel(dashboard.slots.nav, flyTo);
const poiPanel = createPOIPanel(dashboard.slots.pois);
const userPanel = createUserPanel(dashboard.slots.tracking);
const zonePanel = createZonePanel(dashboard.slots.zones);
const map2dPanel = create2DMapPanel(dashboard.slots.map2d);

createAdminPanels(
  {
    facilities: dashboard.slots.facilities,
    types: dashboard.slots.types,
    users: dashboard.slots.users,
    analytics: dashboard.slots.analytics,
  },
  () => dashboard.refreshStats()
);

let is2DInitialized = false;

// When switching to 2D tab, init the renderer and load the mesh
dashboard.onViewSwitch((view) => {
  if (view === '2d') {
    if (!is2DInitialized) {
      init2DView(dashboard.viewport2d);
      is2DInitialized = true;

      const scene3D = getScene();
      if (scene3D) {
        const anchor = scene3D.getObjectByName('MultiSetAnchor');
        if (anchor) {
          loadMeshFor2D(anchor);
          map2dPanel.bindZoomListener(dashboard.viewport2d);
        }
      }
    }
    render2D();
    map2dPanel.show();
  } else {
    map2dPanel.hide();
  }
});

async function onFormSubmit(creds) {
  formUI.disable();
  statusBar.show('Authenticating…', 'loading');

  try {
    const authResult = await getM2MToken(creds.clientId, creds.clientSecret);
    const token = authResult.token;

    statusBar.show('Loading 3D viewer…', 'loading');

    formUI.hide();
    dashboard.show();
    initScene(dashboard.viewport);

    statusBar.show('Downloading map mesh…', 'loading');
    const glbBuffer = await downloadMapMesh(token, creds.mapCode);

    if (!glbBuffer) {
      statusBar.show('No GLB file found — but you can navigate the coordinate system', 'success');
      navPanel.show();
      poiPanel.show();
      userPanel.show();
      zonePanel.show();
      setTimeout(() => statusBar.hide(), 3000);
      return;
    }

    statusBar.show('Rendering map…', 'loading');
    const loader = new GLTFLoader();
    const gltf = await new Promise((resolve, reject) => {
      loader.parse(glbBuffer, '', resolve, reject);
    });

    addMesh(gltf.scene);
    statusBar.show('Map loaded ✓', 'success');
    navPanel.show();
    poiPanel.show();
    userPanel.show();
    zonePanel.show();

    setTimeout(() => statusBar.hide(), 3000);
  } catch (err) {
    console.error(err);
    statusBar.show(err.message, 'error');
    formUI.enable();
  }
}
