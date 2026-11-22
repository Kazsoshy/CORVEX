import { useEffect, useMemo, useState } from 'react';
import {
  getAllProvinces,
  getCities,
  getBarangays,
  getRegionForProvince,
  findProvinceByName,
  findCityByName,
  resolveAddressSelection,
} from '../../utils/phAddress.js';
import { resolveBranchTerritoryGeo } from '../../utils/branchTerritoryGeo.js';
import { suggestTerritoryForLocation, reverseGeocodeLocation } from '../../api/territoriesService.js';
import LeafletMap from '../common/LeafletMap';

/** Same map UX as CustomerRegistrationForm (Use My Location, Clear Pin, draggable pin). */
function MapPinPicker({ latitude, longitude, onChange, warning, onPinSettled, defaultCenter }) {
  const hasPin = Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));
  const fallback = Array.isArray(defaultCenter) && defaultCenter.length >= 2
    ? defaultCenter
    : [7.1907, 125.4553];
  const center = hasPin ? [Number(latitude), Number(longitude)] : fallback;

  const setPin = ({ lat, lng }) => {
    onChange?.({
      latitude: String(Number(lat).toFixed(7)),
      longitude: String(Number(lng).toFixed(7)),
    });
    Promise.resolve(onPinSettled?.({ lat: Number(lat), lng: Number(lng) }))
      .catch((error) => warning?.(
        error?.message || 'Location detected, but the address could not be populated. Please select the address manually.'
      ));
  };

  return (
    <div className="customer-map-picker">
      <div className="flex flex-wrap gap-2" style={{ marginBottom: 8 }}>
        <button
          className="button secondary"
          type="button"
          onClick={() => {
            if (!navigator.geolocation) {
              warning?.('Location is not available in this browser.');
              return;
            }
            if (!window.isSecureContext && window.location.hostname !== 'localhost') {
              warning?.('GPS requires a secure connection (HTTPS).');
              return;
            }
            const readLocation = (options, allowRetry = true) => {
              navigator.geolocation.getCurrentPosition(
                (position) => setPin({ lat: position.coords.latitude, lng: position.coords.longitude }),
                (error) => {
                  if (allowRetry && (error.code === error.TIMEOUT || error.code === error.POSITION_UNAVAILABLE)) {
                    readLocation({ enableHighAccuracy: false, timeout: 20000, maximumAge: 300000 }, false);
                    return;
                  }
                  warning?.(error.code === error.PERMISSION_DENIED
                    ? 'Location permission was denied.'
                    : 'Could not read your current location.');
                },
                options
              );
            };
            readLocation({ enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
          }}
        >
          Use My Current Location
        </button>
        {hasPin ? (
          <button className="button ghost" type="button" onClick={() => onChange?.({ latitude: '', longitude: '' })}>
            Clear Pin
          </button>
        ) : null}
      </div>
      <LeafletMap
        center={center}
        zoom={hasPin ? 15 : 12}
        height={280}
        showFullscreen
        onMapClick={setPin}
        markers={hasPin ? [{
          id: 'transfer-pin',
          position: center,
          draggable: true,
          onDragEnd: setPin,
          color: '#0B2133',
          popup: 'Current customer location',
        }] : []}
      />
    </div>
  );
}

/**
 * SA form to request (or resubmit) a branch transfer with current customer location.
 * Address cascade mirrors CustomerRegistrationForm; HUC cities also appear under
 * their geographic parent province (Davao del Sur / South Cotabato).
 */
export function BranchTransferRequestForm({
  open,
  match,
  receivingBranchLabel,
  receivingBranchId,
  initialLocation = null,
  initialReason = '',
  mode = 'create',
  busy = false,
  onClose,
  onSubmit,
  showToast,
}) {
  const provinceOptions = useMemo(() => getAllProvinces(), []);
  const branchGeo = useMemo(
    () => resolveBranchTerritoryGeo({
      branchId: receivingBranchId,
      branchName: receivingBranchLabel,
    }),
    [receivingBranchId, receivingBranchLabel]
  );
  const [geoCodes, setGeoCodes] = useState({ provCode: '', munCityCode: '' });
  const [barangayOptions, setBarangayOptions] = useState([]);
  const [barangaysLoading, setBarangaysLoading] = useState(false);
  const [street, setStreet] = useState('');
  const [barangayName, setBarangayName] = useState('');
  const [reason, setReason] = useState(initialReason || '');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [mapExpanded, setMapExpanded] = useState(false);
  const [geoNote, setGeoNote] = useState('');
  const [suggestedTerritory, setSuggestedTerritory] = useState(null);
  const [suggestBusy, setSuggestBusy] = useState(false);

  const region = geoCodes.provCode ? getRegionForProvince(geoCodes.provCode) : null;
  const cityOptions = useMemo(
    () => getCities(geoCodes.provCode) || [],
    [geoCodes.provCode]
  );
  const selectedProvince = provinceOptions.find((p) => String(p.provCode) === String(geoCodes.provCode));
  const selectedCity = cityOptions.find((c) => String(c.munCityCode) === String(geoCodes.munCityCode))
    || (geoCodes.munCityCode
      ? (getCities(geoCodes.provCode) || []).find((c) => String(c.munCityCode) === String(geoCodes.munCityCode))
      : null);

  useEffect(() => {
    if (!open) return;
    setReason(initialReason || '');
    setGeoNote('');
    setMapExpanded(false);
    const loc = initialLocation || {};
    setStreet(loc.address_street || '');
    setBarangayName(loc.address_barangay || '');
    setLatitude(loc.latitude != null && loc.latitude !== '' ? String(loc.latitude) : '');
    setLongitude(loc.longitude != null && loc.longitude !== '' ? String(loc.longitude) : '');

    let provCode = '';
    let munCityCode = '';
    const provinceHint = loc.address_province || '';
    const cityHint = String(loc.address_city || '').toLowerCase();

    if (cityHint.includes('davao city') || cityHint.includes('city of davao')
      || normalizeLoose(provinceHint) === 'davaocity') {
      provCode = '307';
      munCityCode = '30700';
    } else if (cityHint.includes('general santos') || normalizeLoose(provinceHint).includes('generalsantos')) {
      provCode = '308';
      munCityCode = '30800';
    } else if (provinceHint) {
      const prov = findProvinceByName(null, provinceHint)
        || provinceOptions.find((p) => normalizeLoose(p.provName) === normalizeLoose(provinceHint));
      provCode = prov?.provCode ? String(prov.provCode) : '';
    }

    // No saved location yet — seed from receiving branch service area (Davao City / Gensan / Oriental).
    if (!provCode && branchGeo?.provCode) {
      provCode = String(branchGeo.provCode);
      if (branchGeo.munCityCode) munCityCode = String(branchGeo.munCityCode);
    }

    setGeoCodes({ provCode, munCityCode });
  }, [open, initialLocation, initialReason, provinceOptions, branchGeo]);

  useEffect(() => {
    if (!geoCodes.provCode || !initialLocation?.address_city || geoCodes.munCityCode) return;
    const city = findCityByName(geoCodes.provCode, initialLocation.address_city)
      || (getCities(geoCodes.provCode) || []).find((c) => (
        normalizeLoose(c.munCityName) === normalizeLoose(initialLocation.address_city)
      ));
    if (city?.munCityCode) {
      // If the city is an HUC LGU, store under its HUC province code.
      const nextProv = city.provCode ? String(city.provCode) : geoCodes.provCode;
      setGeoCodes({
        provCode: nextProv,
        munCityCode: String(city.munCityCode),
      });
    }
  }, [geoCodes.provCode, geoCodes.munCityCode, initialLocation]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!geoCodes.munCityCode) {
        setBarangayOptions([]);
        return;
      }
      setBarangaysLoading(true);
      const rows = await getBarangays(geoCodes.munCityCode);
      if (!active) return;
      setBarangayOptions(rows || []);
      setBarangaysLoading(false);
      if (initialLocation?.address_barangay) {
        const matchBrgy = (rows || []).find((b) => (
          normalizeLoose(b.brgyName) === normalizeLoose(initialLocation.address_barangay)
        ));
        if (matchBrgy?.brgyName) setBarangayName(String(matchBrgy.brgyName).trim());
      }
    })();
    return () => { active = false; };
  }, [geoCodes.munCityCode, initialLocation]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!receivingBranchId || !barangayName) {
        setSuggestedTerritory(null);
        return;
      }
      setSuggestBusy(true);
      const res = await suggestTerritoryForLocation({
        branch_id: receivingBranchId,
        barangay: barangayName,
        lat: latitude || undefined,
        lng: longitude || undefined,
      });
      if (!active) return;
      setSuggestBusy(false);
      if (res.success) setSuggestedTerritory(res.data || res);
      else setSuggestedTerritory(null);
    })();
    return () => { active = false; };
  }, [receivingBranchId, barangayName, latitude, longitude]);

  if (!open) return null;

  const customerName = match?.display_name
    || match?.business_name
    || [match?.first_name, match?.last_name].filter(Boolean).join(' ')
    || 'Customer';

  const onSelectProvince = (provCode) => {
    setGeoCodes({ provCode, munCityCode: '' });
    setBarangayName('');
    setBarangayOptions([]);
  };

  const onSelectCity = (munCityCode) => {
    const city = (getCities(geoCodes.provCode) || []).find(
      (c) => String(c.munCityCode) === String(munCityCode)
    );
    // Selecting a related HUC city (e.g. City of Davao under Davao del Sur)
    // switches the stored province to the HUC entry.
    const nextProv = city?.provCode ? String(city.provCode) : geoCodes.provCode;
    setGeoCodes({
      provCode: nextProv,
      munCityCode: munCityCode || '',
    });
    setBarangayName('');
  };

  const onPinSettled = async ({ lat, lng }) => {
    const reverse = await reverseGeocodeLocation({ lat, lng });
    if (!reverse?.success || !reverse.data) {
      setGeoNote('Could not reverse-geocode reliably. Enter address manually.');
      return;
    }
    const data = reverse.data;
    const resolved = await resolveAddressSelection({
      address_region: data.address_region,
      address_province: data.address_province,
      address_city: data.address_city,
      address_barangay: data.address_barangay,
    });

    setGeoCodes({
      provCode: resolved.provCode ? String(resolved.provCode) : '',
      munCityCode: resolved.munCityCode ? String(resolved.munCityCode) : '',
    });
    if (resolved.barangayName) setBarangayName(resolved.barangayName);
    if (data.address_street) setStreet(data.address_street);
    setGeoNote(data.needs_verification
      ? 'Location detected — verify barangay/postal before submit.'
      : 'Address fields filled from map location (review before submit).');
  };

  const submit = async () => {
    if (!selectedProvince || !selectedCity || !barangayName.trim() || !street.trim() || !reason.trim()) {
      showToast?.('Province, city, barangay, street, and reason are required.', 'error');
      return;
    }
    if (!receivingBranchId) {
      showToast?.('Your account has no assigned branch.', 'error');
      return;
    }
    const cityName = selectedCity.munCityName || selectedCity.cityName || selectedCity.name;
    const proposedId = suggestedTerritory?.territory_id
      || suggestedTerritory?.proposed_territory_id
      || suggestedTerritory?.nearest?.territory_id
      || null;
    await onSubmit?.({
      target_branch_id: Number(receivingBranchId),
      reason: reason.trim(),
      address_region: region?.regionName || '',
      address_province: selectedProvince.provName,
      address_city: cityName,
      address_barangay: barangayName.trim(),
      address_street: street.trim(),
      address: [street.trim(), barangayName.trim(), cityName, selectedProvince.provName]
        .filter(Boolean)
        .join(', '),
      latitude: latitude !== '' ? Number(latitude) : null,
      longitude: longitude !== '' ? Number(longitude) : null,
      proposed_territory_id: proposedId ? Number(proposedId) : null,
    });
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose} style={{ zIndex: 1200 }}>
      <div
        className="modal-content"
        style={{ maxWidth: 720, maxHeight: '92vh', overflow: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0 }}>
          {mode === 'resubmit' ? 'Correct Transfer Location' : 'Request Branch Transfer'}
        </h3>
        <p className="muted">
          Provide the customer&apos;s current location. Do not create another customer record.
        </p>

        <div className="panel" style={{ padding: 12, marginBottom: 12 }}>
          <strong>{customerName}</strong>
          <div className="muted" style={{ fontSize: '0.85rem' }}>
            Customer ID: {match?.customer_id || '—'}
            {match?.customer_code ? ` · ${match.customer_code}` : ''}
          </div>
          <div className="muted" style={{ fontSize: '0.85rem' }}>
            Existing home branch: {match?.branch_name || '—'}
          </div>
          <div className="muted" style={{ fontSize: '0.85rem' }}>
            Proposed receiving branch: {receivingBranchLabel || '—'} (read-only)
          </div>
        </div>

        <div className="account-detail-grid two-up">
          <div className="form-group">
            <label>Province *</label>
            <select
              className="filter-select"
              value={geoCodes.provCode}
              onChange={(e) => onSelectProvince(e.target.value)}
            >
              <option value="">Select</option>
              {provinceOptions.map((p) => (
                <option key={p.provCode} value={p.provCode}>{p.provName}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Region</label>
            <input value={region?.regionName || '—'} readOnly disabled />
            <p className="muted">Derived from the selected province.</p>
          </div>
          <div className="form-group">
            <label>City / Municipality *</label>
            <select
              className="filter-select"
              value={geoCodes.munCityCode}
              disabled={!geoCodes.provCode}
              onChange={(e) => onSelectCity(e.target.value)}
            >
              <option value="">Select</option>
              {cityOptions.map((c) => (
                <option key={c.munCityCode} value={c.munCityCode}>
                  {c.munCityName || c.cityName || c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Barangay *</label>
            <select
              className="filter-select"
              value={barangayName}
              disabled={!geoCodes.munCityCode || barangaysLoading}
              onChange={(e) => setBarangayName(e.target.value)}
            >
              <option value="">{barangaysLoading ? 'Loading…' : 'Select'}</option>
              {barangayOptions.map((b) => {
                const name = String(b.brgyName || '').trim();
                return <option key={b.brgyCode || b.psgcCode || name} value={name}>{name}</option>;
              })}
            </select>
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>House / Street / Landmark *</label>
            <input
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              placeholder="House no., street, landmark"
            />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Transfer reason *</label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why should ownership move to your branch?"
            />
          </div>
        </div>

        {geoNote ? <p className="muted">{geoNote}</p> : null}

        <div style={{ marginTop: 12, marginBottom: 12 }}>
          <button
            className="button secondary"
            type="button"
            onClick={() => setMapExpanded((v) => !v)}
          >
            {mapExpanded ? 'Hide Map' : 'Set Location on Map'}
          </button>
        </div>
        {mapExpanded ? (
          <MapPinPicker
            latitude={latitude}
            longitude={longitude}
            defaultCenter={branchGeo?.mapCenter}
            onChange={({ latitude: nextLat, longitude: nextLng }) => {
              setLatitude(nextLat);
              setLongitude(nextLng);
            }}
            warning={(msg) => showToast?.(msg, 'error')}
            onPinSettled={onPinSettled}
          />
        ) : null}

        <p className="muted" style={{ fontSize: '0.85rem', marginTop: 8 }}>
          {suggestBusy
            ? 'Checking receiving-branch territory coverage…'
            : (suggestedTerritory?.territory_name || suggestedTerritory?.nearest?.territory_name
              ? `Suggested territory: ${suggestedTerritory.territory_name || suggestedTerritory.nearest?.territory_name}`
                + (suggestedTerritory.classification ? ` (${suggestedTerritory.classification})` : '')
              : 'No automatic territory match — Receiving BM will assign.')}
        </p>

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="button ghost" type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="button" type="button" onClick={submit} disabled={busy}>
            {busy ? 'Submitting…' : (mode === 'resubmit' ? 'Resubmit Transfer' : 'Submit Transfer Request')}
          </button>
        </div>
      </div>
    </div>
  );
}

function normalizeLoose(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\bcity of\b/g, '')
    .replace(/\bhuc\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}
