/**
 * MultiSet Map Download
 * 1. GET /v1/vps/map/{mapCode}  → get full map info (includes file keys)
 * 2. GET /v1/file?key={key}     → get pre-signed S3 URL
 * 3. Fetch GLB from S3 URL
 *
 * Fallback: tries to construct a conventional key from accountId + mapId.
 */

const MAP_INFO_URL = '/api/multiset/v1/vps/map';
const FILE_URL = '/api/multiset/v1/file';

/**
 * Download the map's 3D file (GLB).
 * @param {string} token  JWT bearer token
 * @param {string} mapCode  The MAP_* code
 * @returns {Promise<ArrayBuffer|null>}  GLB data or null if unavailable
 */
export async function downloadMapMesh(token, mapCode) {
  // Step 1: Get map info
  const mapInfoRes = await fetch(`${MAP_INFO_URL}/${encodeURIComponent(mapCode)}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!mapInfoRes.ok) {
    const errText = await mapInfoRes.text().catch(() => '');
    console.warn(`Could not fetch map info (${mapInfoRes.status}):`, errText);
    throw new Error(`Failed to fetch map info (${mapInfoRes.status})`);
  }

  const mapInfo = await mapInfoRes.json();
  console.log('📦 Full map info response:', JSON.stringify(mapInfo, null, 2));

  // Try to find a downloadable file key
  const meshKey = findMeshKey(mapInfo);

  if (!meshKey) {
    // Fallback: try to construct a conventional key
    const fallbackKey = buildFallbackKey(mapInfo);
    if (fallbackKey) {
      console.log('🔄 Trying fallback key:', fallbackKey);
      const result = await tryDownload(token, fallbackKey);
      if (result) return result;
    }

    console.warn('❌ No downloadable file found. Map info keys:', Object.keys(mapInfo));
    return null;
  }

  console.log('🔑 Found mesh key:', meshKey);
  return await tryDownload(token, meshKey);
}

/**
 * Attempt to download a file by key → pre-signed URL → fetch.
 */
async function tryDownload(token, key) {
  const fileRes = await fetch(`${FILE_URL}?key=${encodeURIComponent(key)}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!fileRes.ok) {
    console.warn(`File URL request failed (${fileRes.status}) for key: ${key}`);
    return null;
  }

  const fileData = await fileRes.json();
  console.log('📂 File response:', fileData);

  let downloadUrl = fileData.url || fileData.downloadUrl || fileData.signedUrl || fileData.presignedUrl;
  if (!downloadUrl) {
    console.warn('No download URL in file response:', fileData);
    return null;
  }

  // Workaround for S3 CORS: If using the proxy in dev
  if (downloadUrl.startsWith('https://prod-multiset.s3-accelerate.amazonaws.com')) {
    downloadUrl = downloadUrl.replace('https://prod-multiset.s3-accelerate.amazonaws.com', '/s3-proxy');
  }

  const glbRes = await fetch(downloadUrl);
  if (!glbRes.ok) {
    console.warn(`GLB download failed (${glbRes.status})`);
    return null;
  }

  return await glbRes.arrayBuffer();
}

/**
 * Search the map info object for a GLB/mesh file key.
 * Tries multiple known response shapes.
 */
function findMeshKey(info) {
  // Direct fields
  if (info.meshKey) return info.meshKey;
  if (info.meshFileKey) return info.meshFileKey;
  if (info.mesh?.key) return info.mesh.key;
  if (info.mesh?.fileKey) return info.mesh.fileKey;
  if (info.glbKey) return info.glbKey;
  if (info.fileKey) return info.fileKey;

  // Nested under map data
  if (info.data?.meshKey) return info.data.meshKey;
  if (info.map?.meshKey) return info.map.meshKey;

  // offlineBundle
  if (info.offlineBundle?.meshKey) return info.offlineBundle.meshKey;
  if (info.offlineBundle?.key) return info.offlineBundle.key;
  if (info.offlineBundle?.glbKey) return info.offlineBundle.glbKey;

  // files array
  if (Array.isArray(info.files)) {
    const glb = info.files.find(f => {
      const path = (f.key || f.path || f.name || '').toLowerCase();
      return path.endsWith('.glb') || path.endsWith('.gltf') ||
        (f.type || '').toLowerCase().includes('mesh');
    });
    if (glb) return glb.key || glb.path || glb.url;
  }

  // Deep search: find any string value containing .glb
  const found = deepFindGlb(info);
  if (found) return found;

  return null;
}

/**
 * Try to construct a conventional MultiSet file key from map metadata.
 * Format: {accountId}/{mapId}/Mesh/TexturedMesh.glb
 */
function buildFallbackKey(info) {
  const accountId = info.accountId || info.account_id || info.userId || info.user_id;
  const mapId = info._id || info.id || info.mapId || info.map_id;

  if (accountId && mapId) {
    return `${accountId}/${mapId}/Mesh/TexturedMesh.glb`;
  }
  return null;
}

/**
 * Recursively search an object for string values that look like GLB file keys.
 */
function deepFindGlb(obj, depth = 0) {
  if (depth > 5 || !obj || typeof obj !== 'object') return null;

  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === 'string') {
      const lower = val.toLowerCase();
      if (lower.endsWith('.glb') || lower.endsWith('.gltf')) {
        return val;
      }
      // Also match paths that contain /Mesh/ or /mesh/
      if (lower.includes('/mesh/') && (lower.includes('.glb') || lower.includes('.gltf'))) {
        return val;
      }
    } else if (typeof val === 'object' && val !== null) {
      const found = deepFindGlb(val, depth + 1);
      if (found) return found;
    }
  }
  return null;
}
