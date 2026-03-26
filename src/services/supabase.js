/**
 * Supabase REST client for NavMe.
 * Plain fetch — no SDK dependency.
 */

const SUPABASE_URL = 'https://erosfuvpexeofhsjiefr.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyb3NmdXZwZXhlb2Zoc2ppZWZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4MzQyMjEsImV4cCI6MjA4NzQxMDIyMX0.-vYf7Yg8wH2vyaxlUZMW1TN5BX-_Ftdl3MdkvMRpHvE';

const baseHeaders = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

async function query(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: baseHeaders });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${res.statusText}`);
  return res.json();
}

async function mutate(method, path, body = null) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { ...baseHeaders, Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase ${method} ${res.status}: ${text || res.statusText}`);
  }
  if (method === 'DELETE') return null;
  return res.json();
}

async function headCount(table, filter = '') {
  const qs = filter ? `?${filter}` : '';
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${qs}`, {
    method: 'HEAD',
    headers: { ...baseHeaders, Prefer: 'count=exact' },
  });
  const range = res.headers.get('content-range');
  if (range) return parseInt(range.split('/')[1], 10) || 0;
  return 0;
}

/* ────────────────────────────────────────────
   User tracking (existing — unchanged)
   ──────────────────────────────────────────── */

export function fetchUsers() {
  return query('ar_ropin_users?is_active=eq.true&select=id,full_name,email,role');
}

export function fetchLatestNavnode(userId) {
  return query(
    `ar_ropin_navnode?user_id=eq.${userId}&select=id,pos_x,pos_y,pos_z,recorded_at&order=recorded_at.desc&limit=1`
  );
}

export function fetchNavnodeHistory(userId) {
  return query(
    `ar_ropin_navnode?user_id=eq.${userId}&select=id,pos_x,pos_y,pos_z,recorded_at&order=recorded_at.asc`
  );
}

/* ────────────────────────────────────────────
   POIs CRUD
   ──────────────────────────────────────────── */

export function fetchAllPois() {
  return query('ar_ropin_pois?select=*&order=created_at.desc');
}
export function updatePoi(id, data) {
  return mutate('PATCH', `ar_ropin_pois?id=eq.${id}`, data);
}
export function deletePoi(id) {
  return mutate('DELETE', `ar_ropin_pois?id=eq.${id}`);
}

/* ────────────────────────────────────────────
   Facilities CRUD
   ──────────────────────────────────────────── */

export function fetchAllFacilities() {
  return query(
    'ar_ropin_facilities?select=*,ar_ropin_facility_types(code,description)&order=facility_name.asc'
  );
}
export function updateFacility(id, data) {
  return mutate('PATCH', `ar_ropin_facilities?id=eq.${id}`, data);
}
export function deleteFacility(id) {
  return mutate('DELETE', `ar_ropin_facilities?id=eq.${id}`);
}

/* ────────────────────────────────────────────
   Facility Types CRUD
   ──────────────────────────────────────────── */

export function fetchAllFacilityTypes() {
  return query('ar_ropin_facility_types?select=*&order=code.asc');
}
export function updateFacilityType(id, data) {
  return mutate('PATCH', `ar_ropin_facility_types?id=eq.${id}`, data);
}
export function deleteFacilityType(id) {
  return mutate('DELETE', `ar_ropin_facility_types?id=eq.${id}`);
}

/* ────────────────────────────────────────────
   Users Admin CRUD
   ──────────────────────────────────────────── */

export function fetchAllUsers() {
  return query('ar_ropin_users?select=*&order=created_at.desc');
}
export function updateUser(id, data) {
  return mutate('PATCH', `ar_ropin_users?id=eq.${id}`, data);
}
export function deleteUser(id) {
  return mutate('DELETE', `ar_ropin_users?id=eq.${id}`);
}

/* ────────────────────────────────────────────
   Zones CRUD (access_control_zones + ar_ropin_zones)
   ──────────────────────────────────────────── */

export function fetchAllAccessZones() {
  return query('access_control_zones?select=*&order=created_at.desc');
}
export function createAccessZone(data) {
  return mutate('POST', 'access_control_zones', data);
}
export function updateAccessZone(id, data) {
  return mutate('PATCH', `access_control_zones?id=eq.${id}`, data);
}
export function deleteAccessZone(id) {
  return mutate('DELETE', `access_control_zones?id=eq.${id}`);
}

export function fetchAllRopinZones() {
  return query('ar_ropin_zones?select=*&order=created_at.desc');
}
export function createRopinZone(data) {
  return mutate('POST', 'ar_ropin_zones', data);
}
export function updateRopinZone(id, data) {
  return mutate('PATCH', `ar_ropin_zones?id=eq.${id}`, data);
}
export function deleteRopinZone(id) {
  return mutate('DELETE', `ar_ropin_zones?id=eq.${id}`);
}
export function deleteRopinZoneByAccessId(accessZoneId) {
  return mutate('DELETE', `ar_ropin_zones?access_zone_id=eq.${accessZoneId}`);
}

/* ────────────────────────────────────────────
   Analytics / Counts
   ──────────────────────────────────────────── */

export async function fetchCounts() {
  const [users, pois, facilities, types, navnodes] = await Promise.all([
    headCount('ar_ropin_users', 'is_active=eq.true'),
    headCount('ar_ropin_pois', 'is_active=eq.true'),
    headCount('ar_ropin_facilities', 'is_active=eq.true'),
    headCount('ar_ropin_facility_types', 'is_active=eq.true'),
    headCount('ar_ropin_navnode'),
  ]);
  return { users, pois, facilities, types, navnodes };
}
