/** Open the device dialer when a phone number is available. */
export function openPhoneCall(phone) {
  const digits = String(phone || '').replace(/[^\d+]/g, '');
  if (!digits) return false;
  window.location.href = `tel:${digits}`;
  return true;
}

/** In-app collector map (OSRM road context when opened from route). */
export function collectorMapPath(accountId, parentContext = 'accounts') {
  if (accountId == null || accountId === '') return null;
  return `/collector/map/${accountId}?from=${parentContext}`;
}

/** Open Google Maps directions or search in a new tab. */
export function openExternalNavigation({ latitude, longitude, address } = {}) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  let url;
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  } else if (address && String(address).trim()) {
    url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(String(address).trim())}`;
  } else {
    return false;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}
