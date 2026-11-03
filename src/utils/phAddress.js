import regionsData from '@jobuntux/psgc/data/2025-2Q/regions.json';
import provincesData from '@jobuntux/psgc/data/2025-2Q/provinces.json';
import muncitiesData from '@jobuntux/psgc/data/2025-2Q/muncities.json';

const regions = Array.isArray(regionsData) ? regionsData : [];
const provinces = Array.isArray(provincesData) ? provincesData : [];
const muncities = Array.isArray(muncitiesData) ? muncitiesData : [];

let barangaysCache = null;
let barangaysByCity = null;
let barangaysPromise = null;

function sortByName(items, key) {
  return [...items].sort((a, b) => String(a[key] || '').localeCompare(String(b[key] || ''), undefined, { sensitivity: 'base' }));
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\bcity of\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function namesMatch(a, b) {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
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
  if (!regCode) return [];
  return sortByName(provinces.filter((row) => row.regCode === regCode), 'provName');
}

export function getCities(provCode) {
  if (!provCode) return [];
  return sortByName(muncities.filter((row) => row.provCode === provCode), 'munCityName');
}

export async function getBarangays(munCityCode) {
  if (!munCityCode) return [];
  const index = await ensureBarangays();
  return sortByName(index[String(munCityCode)] || [], 'brgyName');
}

export function findRegionByName(name) {
  if (!String(name || '').trim()) return null;
  return regions.find((row) => namesMatch(row.regionName, name)) || null;
}

export function findProvinceByName(regCode, name) {
  if (!String(name || '').trim()) return null;
  const pool = regCode ? getProvinces(regCode) : provinces;
  return pool.find((row) => namesMatch(row.provName, name)) || null;
}

export function findCityByName(provCode, name) {
  if (!String(name || '').trim()) return null;
  const pool = provCode ? getCities(provCode) : muncities;
  return pool.find((row) => namesMatch(row.munCityName, name)) || null;
}

export async function findBarangayByName(munCityCode, name) {
  if (!String(name || '').trim() || !munCityCode) return null;
  const pool = await getBarangays(munCityCode);
  return pool.find((row) => namesMatch(row.brgyName, name)) || null;
}

/** Resolve stored name fields back into PSGC codes for edit forms. */
export async function resolveAddressSelection(parts = {}) {
  const region = findRegionByName(parts.address_region);
  const province = findProvinceByName(region?.regCode, parts.address_province);
  const city = findCityByName(province?.provCode, parts.address_city);
  const barangay = city
    ? await findBarangayByName(city.munCityCode, parts.address_barangay)
    : null;

  return {
    regCode: region?.regCode || '',
    provCode: province?.provCode || '',
    munCityCode: city?.munCityCode || '',
    regionName: region?.regionName || String(parts.address_region || '').trim(),
    provinceName: province?.provName || String(parts.address_province || '').trim(),
    cityName: city?.munCityName || String(parts.address_city || '').trim(),
    barangayName: barangay?.brgyName || String(parts.address_barangay || '').trim(),
  };
}
