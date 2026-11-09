/** Open the device dialer when a phone number is available. */
export function openPhoneCall(phone) {
  const cleaned = String(phone || '').trim();
  if (!cleaned || cleaned === '—' || cleaned.toLowerCase() === 'n/a') return false;
  const digits = cleaned.replace(/[^\d+]/g, '');
  const numericOnly = digits.replace(/\D/g, '');
  if (numericOnly.length < 7) return false;
  window.location.href = `tel:${digits}`;
  return true;
}

/** Check whether a phone string is a valid callable phone number. */
export function hasCallablePhone(phone) {
  const cleaned = String(phone || '').trim();
  if (!cleaned || cleaned === '—' || cleaned.toLowerCase() === 'n/a') return false;
  const numericOnly = cleaned.replace(/\D/g, '');
  return numericOnly.length >= 7;
}

/** In-app collector map (road context when opened from route). */
export function collectorMapPath(accountId, parentContext = 'accounts') {
  if (accountId == null || accountId === '') return null;
  return `/collector/map/${accountId}?from=${parentContext}`;
}

/** Open Google Maps directions or search in a new tab using actual coordinates or address. */
export function openExternalNavigation({ latitude, longitude, address, originLatitude, originLongitude } = {}) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  const origLat = Number(originLatitude);
  const origLng = Number(originLongitude);
  const hasOrigin = Number.isFinite(origLat) && Number.isFinite(origLng);

  let url;
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}${
      hasOrigin ? `&origin=${origLat},${origLng}` : ''
    }`;
  } else if (address && String(address).trim() && String(address).trim() !== '—') {
    const dest = encodeURIComponent(String(address).trim());
    url = hasOrigin
      ? `https://www.google.com/maps/dir/?api=1&origin=${origLat},${origLng}&destination=${dest}`
      : `https://www.google.com/maps/search/?api=1&query=${dest}`;
  } else {
    return false;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

/**
 * Navigate from the customer's location back to the collector's current GPS position
 * (or branch starting point when live GPS permission is unavailable).
 */
export function openNavigateBackToCollector({
  customerLatitude,
  customerLongitude,
  customerAddress,
  startingLatitude,
  startingLongitude,
  startingAddress,
  onSuccess,
  onError,
} = {}) {
  const custLat = Number(customerLatitude);
  const custLng = Number(customerLongitude);
  const hasCustCoords = Number.isFinite(custLat) && Number.isFinite(custLng);
  const cleanCustAddress =
    customerAddress && String(customerAddress).trim() !== '—'
      ? String(customerAddress).trim()
      : '';

  const buildOriginParam = () => {
    if (hasCustCoords) return `${custLat},${custLng}`;
    if (cleanCustAddress) return encodeURIComponent(cleanCustAddress);
    return '';
  };

  const openToStartFallback = (reasonNote) => {
    const startLat = Number(startingLatitude);
    const startLng = Number(startingLongitude);
    const cleanStartAddress =
      startingAddress && String(startingAddress).trim() !== '—'
        ? String(startingAddress).trim()
        : '';

    const originParam = buildOriginParam();
    if (Number.isFinite(startLat) && Number.isFinite(startLng)) {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${startLat},${startLng}${
        originParam ? `&origin=${originParam}` : ''
      }`;
      window.open(url, '_blank', 'noopener,noreferrer');
      onSuccess?.(
        reasonNote || 'Opening directions back to your branch starting location.'
      );
      return true;
    }
    if (cleanStartAddress) {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
        cleanStartAddress
      )}${originParam ? `&origin=${originParam}` : ''}`;
      window.open(url, '_blank', 'noopener,noreferrer');
      onSuccess?.(
        reasonNote || 'Opening directions back to your branch starting location.'
      );
      return true;
    }
    onError?.(
      'Unable to determine your current location or branch starting coordinates. Check location permissions.'
    );
    return false;
  };

  if (typeof navigator !== 'undefined' && navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const destLat = Number(pos?.coords?.latitude);
        const destLng = Number(pos?.coords?.longitude);
        if (Number.isFinite(destLat) && Number.isFinite(destLng)) {
          const originParam = buildOriginParam();
          const url = `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}${
            originParam ? `&origin=${originParam}` : ''
          }`;
          window.open(url, '_blank', 'noopener,noreferrer');
          onSuccess?.('Opening directions back to your current location.');
        } else {
          openToStartFallback();
        }
      },
      () => {
        openToStartFallback(
          'Live GPS permission unavailable — opening directions back to your branch starting point.'
        );
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
    );
    return true;
  }

  return openToStartFallback();
}
