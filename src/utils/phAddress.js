import regionsData from '@jobuntux/psgc/data/2025-2Q/regions.json';
import provincesData from '@jobuntux/psgc/data/2025-2Q/provinces.json';
import muncitiesData from '@jobuntux/psgc/data/2025-2Q/muncities.json';

const regions = Array.isArray(regionsData) ? regionsData : [];
const provinces = Array.isArray(provincesData) ? provincesData : [];
const muncities = Array.isArray(muncitiesData) ? muncitiesData : [];

let barangaysCache = null;
let barangaysByCity = null;
let barangaysPromise = null;

/** PSGC HUC province codes that should not collide with real province names. */
const HUC_PROVINCE_LABELS = {
  307: 'Davao City (HUC)',
  308: 'General Santos City (HUC)',
};

/**
 * Geographic parent provinces → related HUC province codes.
 * Users expect City of Davao under Davao del Sur and Gensan under South Cotabato
 * even though PSGC lists those HUCs as province-level LGUs.
 */
const PROVINCE_RELATED_HUC = {
  '024': '307', // Davao del Sur → City of Davao
  '063': '308', // South Cotabato → City of General Santos
};

function sortByName(items, key) {
  return [...items].sort((a, b) => String(a[key] || '').localeCompare(String(b[key] || ''), undefined, { sensitivity: 'base' }));
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\bcity of\b/g, '')
    .replace(/\bhuc\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function namesMatch(a, b) {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function displayProvince(row) {
  if (!row) return row;
  const label = HUC_PROVINCE_LABELS[String(row.provCode)];
  return label ? { ...row, provName: label } : row;
}

async function ensureBarangays() {
  if (barangaysByCity) return barangaysByCity;
  if (!barangaysPromise) {
    barangaysPromise = import('@jobuntux/psgc/data/2025-2Q/barangays.json').then((mod) => {
      barangaysCache = Array.isArray(mod.default) ? mod.default : (Array.isArray(mod) ? mod : []);
      barangaysByCity = barangaysCache.reduce((acc, row) => {
        const key = String(row.munCityCode || '');
        if (!key) return acc;
        (acc[key] || (acc[key] = [])).push(row);
        return acc;
      }, {});
      return barangaysByCity;
    });
  }
  return barangaysPromise;
}

export function getRegions() {
  return sortByName(regions, 'regionName');
}

export function getProvinces(regCode) {
  if (!regCode) return getAllProvinces();
  const resolvedRegion = regions.find((row) => row.regCode === regCode)
    || regions.find((row) => namesMatch(row.regionName, regCode));
  const code = resolvedRegion?.regCode || regCode;
  return sortByName(provinces.filter((row) => row.regCode === code).map(displayProvince), 'provName');
}

/** Province-first cascading: all provinces across regions. */
export function getAllProvinces() {
  return sortByName(provinces.map(displayProvince), 'provName');
}

export function getRegionForProvince(provCode) {
  const province = provinces.find((row) => row.provCode === String(provCode));
  if (!province) return null;
  return regions.find((row) => row.regCode === province.regCode) || null;
}

/**
 * Resolve cities by PSGC province code (preferred) or name.
 * Name lookup uses exact-normalized match first to avoid Davao HUC vs Davao del Sur collisions.
 */
function citiesForProvinceCode(provCode) {
  const code = String(provCode || '');
  if (!code) return [];
  const own = muncities.filter((row) => row.provCode === code);
  const relatedHuc = PROVINCE_RELATED_HUC[code];
  if (!relatedHuc) return own;
  const extra = muncities.filter((row) => row.provCode === relatedHuc);
  const seen = new Set(own.map((row) => String(row.munCityCode)));
  const merged = [...own];
  for (const row of extra) {
    const key = String(row.munCityCode);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }
  return merged;
}

export function getCities(provCode) {
  if (!provCode) return [];
  const byCode = provinces.find((row) => row.provCode === String(provCode));
  if (byCode) {
    return sortByName(citiesForProvinceCode(byCode.provCode), 'munCityName');
  }
  // Prefer HUC aliases before loose name match.
  const normalized = normalizeName(provCode);
  if (normalized === 'davaocity' || normalized === 'cityofdavao') {
    return sortByName(citiesForProvinceCode('307'), 'munCityName');
  }
  if (normalized.includes('generalsantos')) {
    return sortByName(citiesForProvinceCode('308'), 'munCityName');
  }
  // Exact normalized province name only (no substring) to avoid "Davao" matching HUC.
  const exact = provinces.find((row) => normalizeName(row.provName) === normalized
    || normalizeName(displayProvince(row).provName) === normalized);
  if (exact) {
    return sortByName(citiesForProvinceCode(exact.provCode), 'munCityName');
  }
  return [];
}

export async function getBarangays(munCityCode) {
  if (!munCityCode) return [];
  const index = await ensureBarangays();
  const resolvedCity = muncities.find((row) => row.munCityCode === String(munCityCode))
    || muncities.find((row) => namesMatch(row.munCityName, munCityCode));
  const code = resolvedCity?.munCityCode || String(munCityCode);
  return sortByName(index[code] || [], 'brgyName');
}

export function findRegionByName(name) {
  if (!String(name || '').trim()) return null;
  return regions.find((row) => namesMatch(row.regionName, name)) || null;
}

export function findProvinceByName(regCode, name) {
  if (!String(name || '').trim()) return null;
  const normalized = normalizeName(name);
  if (normalized === 'cityofdavao' || normalized === 'davaocity') {
    return displayProvince(provinces.find((row) => row.provCode === '307') || null);
  }
  if (normalized.includes('generalsantos')) {
    return displayProvince(provinces.find((row) => row.provCode === '308') || null);
  }
  const pool = regCode
    ? getProvinces(regCode)
    : provinces.map(displayProvince);
  // Prefer exact match before loose includes.
  return pool.find((row) => normalizeName(row.provName) === normalized)
    || pool.find((row) => namesMatch(row.provName, name))
    || null;
}

export function findCityByName(provCode, name) {
  if (!String(name || '').trim()) return null;
  const pool = provCode ? getCities(provCode) : muncities;
  const normalized = normalizeName(name);
  return pool.find((row) => normalizeName(row.munCityName) === normalized)
    || pool.find((row) => namesMatch(row.munCityName, name))
    || null;
}

export async function findBarangayByName(munCityCode, name) {
  if (!String(name || '').trim() || !munCityCode) return null;
  const pool = await getBarangays(munCityCode);
  const normalized = normalizeName(name);
  return pool.find((row) => normalizeName(row.brgyName) === normalized)
    || pool.find((row) => namesMatch(row.brgyName, name))
    || null;
}

/** Resolve stored name fields back into PSGC codes for edit forms. */
export async function resolveAddressSelection(parts = {}) {
  let region = findRegionByName(parts.address_region);
  let province = findProvinceByName(region?.regCode, parts.address_province);
  let city = findCityByName(province?.provCode, parts.address_city);

  if (!city && parts.address_city) {
    city = findCityByName('', parts.address_city);
  }
  if (city && !province) {
    province = displayProvince(provinces.find((row) => row.provCode === city.provCode) || null);
  }
  if (province && !region) {
    region = regions.find((row) => row.regCode === province.regCode) || null;
  }
  const barangay = city
    ? await findBarangayByName(city.munCityCode, parts.address_barangay)
    : null;

  const provinceDisplay = province ? displayProvince(province) : null;

  return {
    regCode: region?.regCode || '',
    provCode: province?.provCode || '',
    munCityCode: city?.munCityCode || '',
    regionName: region?.regionName || String(parts.address_region || '').trim(),
    provinceName: provinceDisplay?.provName || String(parts.address_province || '').trim(),
    cityName: city?.munCityName || String(parts.address_city || '').trim(),
    barangayName: barangay?.brgyName || String(parts.address_barangay || '').trim(),
  };
}
