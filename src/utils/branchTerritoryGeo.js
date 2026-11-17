/**
 * Branch service-area presets for territory barangay pickers.
 * PSGC 2025 treats highly urbanized cities (Davao, Gensan) as province-level LGUs.
 */

const BY_ID = {
  1: {
    branchKey: 'davao_city',
    label: 'Davao City',
    regCode: '11',
    provCode: '307',
    munCityCode: '30700',
    lockRegion: true,
    lockProvince: true,
    lockCity: true,
    mapCenter: [7.0731, 125.6128],
    defaultZoom: 12,
  },
  2: {
    branchKey: 'gensan',
    label: 'General Santos City',
    regCode: '12',
    provCode: '308',
    munCityCode: '30800',
    lockRegion: true,
    lockProvince: true,
    lockCity: true,
    mapCenter: [6.1164, 125.1717],
    defaultZoom: 12,
  },
  3: {
    branchKey: 'davao_oriental',
    label: 'Davao Oriental',
    regCode: '11',
    provCode: '025',
    munCityCode: null,
    lockRegion: true,
    lockProvince: true,
    lockCity: false,
    mapCenter: [6.9564, 126.2219],
    defaultZoom: 10,
  },
};

function normalizeBranchName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Resolve geo scope for a branch id and/or name.
 * Falls back to Davao City when unknown so BM never sees nationwide PSGC.
 */
export function resolveBranchTerritoryGeo({ branchId, branchName } = {}) {
  const id = Number(branchId);
  if (Number.isFinite(id) && BY_ID[id]) return { ...BY_ID[id], branchId: id };

  const name = normalizeBranchName(branchName);
  if (name.includes('general santos') || name.includes('gensan')) {
    return { ...BY_ID[2], branchId: id || 2 };
  }
  if (name.includes('oriental') || name.includes('mati')) {
    return { ...BY_ID[3], branchId: id || 3 };
  }
  if (name.includes('davao')) {
    return { ...BY_ID[1], branchId: id || 1 };
  }

  return { ...BY_ID[1], branchId: id || null };
}

export function listBranchTerritoryGeoPresets() {
  return Object.entries(BY_ID).map(([id, value]) => ({ branchId: Number(id), ...value }));
}
