/**
 * Barangay geocoding via OpenStreetMap Nominatim.
 * Fail closed: never invent coordinates. Callers must allow map confirmation.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = 'CORVEX-TerritoryGeocode/1.0 (branch-operations; contact=ops@corvex.local)';
const cache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let lastRequestAt = 0;

function cacheKey(barangayCode, barangayName, municipalityName, provinceName) {
  return [
    String(barangayCode || '').trim(),
    String(barangayName || '').trim().toLowerCase(),
    String(municipalityName || '').trim().toLowerCase(),
    String(provinceName || '').trim().toLowerCase(),
  ].join('|');
}

function normalizePlaceLabel(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (lower === 'city of davao' || lower === 'davao') return 'Davao City';
  if (lower === 'city of general santos' || lower === 'general santos') return 'General Santos City';
  if (lower.startsWith('city of ')) return `${raw.slice(8).trim()} City`;
  return raw;
}

async function throttle() {
  const wait = Math.max(0, 1100 - (Date.now() - lastRequestAt));
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastRequestAt = Date.now();
}

async function nominatimSearch(query) {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '1',
    countrycodes: 'ph',
    addressdetails: '0',
  });

  await throttle();
  const response = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Geocoding service returned ${response.status}.`);
  }

  const rows = await response.json();
  if (!Array.isArray(rows) || !rows.length) return null;

  const latitude = Number(rows[0].lat);
  const longitude = Number(rows[0].lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    latitude,
    longitude,
    displayName: rows[0].display_name || query,
    source: 'nominatim',
  };
}

/**
 * @returns {Promise<{ latitude: number, longitude: number, displayName: string, source: string }|null>}
 */
export async function geocodeBarangay({
  barangayCode = '',
  barangayName = '',
  municipalityName = 'Davao City',
  provinceName = 'Davao del Sur',
} = {}) {
  const name = String(barangayName || '').trim();
  if (!name) return null;

  const key = cacheKey(barangayCode, name, municipalityName, provinceName);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.value;
  }

  const city = normalizePlaceLabel(municipalityName) || 'Davao City';
  const province = normalizePlaceLabel(provinceName) || 'Davao del Sur';

  const queries = [
    [name, city, province, 'Philippines'].filter(Boolean).join(', '),
    [name, city, 'Philippines'].filter(Boolean).join(', '),
    // HUC aliases (PSGC "City of Davao" vs OSM "Davao City")
    city !== String(municipalityName || '').trim()
      ? [name, String(municipalityName || '').trim(), 'Philippines'].filter(Boolean).join(', ')
      : null,
  ].filter(Boolean);

  let value = null;
  for (const query of queries) {
    value = await nominatimSearch(query);
    if (value) break;
  }

  cache.set(key, { at: Date.now(), value });
  return value;
}

/**
 * Reverse geocode coordinates. Never invents postal codes or barangays —
 * returns Nominatim address parts and a needs_verification flag when sparse.
 */
export async function reverseGeocodeLatLng(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const key = `rev|${lat.toFixed(5)}|${lng.toFixed(5)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.value;
  }

  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: 'json',
    addressdetails: '1',
    zoom: '18',
  });

  await throttle();
  const response = await fetch(`${NOMINATIM_REVERSE_URL}?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
  });
  if (!response.ok) {
    throw new Error(`Reverse geocoding service returned ${response.status}.`);
  }
  const json = await response.json();
  const addr = json?.address || {};
  const barangay = addr.suburb || addr.neighbourhood || addr.village || addr.quarter || '';
  const city = addr.city || addr.town || addr.municipality || addr.city_district || '';
  const province = addr.state || addr.province || addr.region || '';
  const region = addr.region || '';
  const postal = addr.postcode || '';
  const value = {
    latitude: lat,
    longitude: lng,
    displayName: json?.display_name || null,
    address_region: region || null,
    address_province: province || null,
    address_city: city || null,
    address_barangay: barangay || null,
    address_zip: postal || null,
    needs_verification: !barangay || !city,
    source: 'nominatim-reverse',
  };
  cache.set(key, { at: Date.now(), value });
  return value;
}
