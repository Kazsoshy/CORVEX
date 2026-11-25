import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  createCustomer,
  updateCustomer,
  fetchCustomerById,
} from '../../api/salesService';
import { fetchTerritories, reverseGeocodeLocation, suggestTerritoryForLocation } from '../../api/territoriesService';
import { composeCustomerAddress } from '../../utils/customerDisplay';
import {
  getAllProvinces,
  getBarangays,
  getCities,
  getRegionForProvince,
  resolveAddressSelection,
} from '../../utils/phAddress';
import { getCurrentUser, getUserAssignedLocation } from '../../api/authService.js';
import { isBrowserOnline } from '../../offline/connection.js';
import { saveOfflineRecord } from '../../offline/db.js';
import { isSalesOfflineEnabled } from '../../offline/prefs.js';
import LeafletMap from '../common/LeafletMap';
import { LoadingState } from '../shared/LoadingState';
import { StatusBadge } from '../StatusBadge';

const PRIVACY_VERSION = 'corvex-privacy-2026';
const NAME_SUFFIXES = ['Jr', 'Sr', 'II', 'III', 'IV', 'V'];

const CREATE_STEPS = [
  { key: 'details', label: 'Customer Details' },
  { key: 'address', label: 'Address & Territory' },
  { key: 'review', label: 'Review & Register' },
];

const EDIT_STEPS = [
  { key: 'details', label: 'Customer Details' },
  { key: 'address', label: 'Address & Territory' },
  { key: 'review', label: 'Review' },
];

const EMPTY_GEO_CODES = { regCode: '', provCode: '', munCityCode: '' };

function emptyForm() {
  return {
    first_name: '',
    middle_name: '',
    last_name: '',
    name_suffix: '',
    contact_phone: '',
    phone_verification_status: 'Unverified',
    portal_email: '',
    address_region: '',
    address_province: '',
    address_city: '',
    address_barangay: '',
    address_street: '',
    address_zip: '',
    latitude: '',
    longitude: '',
    territory_id: '',
    territory_override_note: '',
    source_assignment_id: '',
    privacy_notice_acknowledged: false,
    marketing_opt_in: false,
  };
}

function MapPinPicker({ latitude, longitude, onChange, warning, onPinSettled }) {
  const hasPin = Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));
  const center = hasPin ? [Number(latitude), Number(longitude)] : [7.1907, 125.4553];

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
          id: 'customer-pin',
          position: center,
          draggable: true,
          onDragEnd: setPin,
          color: 'var(--text)',
          popup: 'Customer location',
        }] : []}
      />
    </div>
  );
}

export function CustomerFormPage({ customerId, navigate, showToast }) {
  const isEdit = Boolean(customerId);
  const steps = isEdit ? EDIT_STEPS : CREATE_STEPS;
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo') || searchParams.get('return_to') || '';
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [territories, setTerritories] = useState([]);
  const [geoCodes, setGeoCodes] = useState(EMPTY_GEO_CODES);
  const [barangayOptions, setBarangayOptions] = useState([]);
  const [barangaysLoading, setBarangaysLoading] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [geoNote, setGeoNote] = useState('');
  const [territoryHint, setTerritoryHint] = useState(null);

  const currentUser = getCurrentUser();
  const branchLabel = getUserAssignedLocation(currentUser) || currentUser?.branch_name || 'Assigned branch';

  const scheduleTerritoryId = !isEdit
    ? String(searchParams.get('territoryId') || searchParams.get('territory_id') || '')
    : '';
  const territoryLocked = Boolean(scheduleTerritoryId);
  const fromFind = (() => {
    if (searchParams.get('fromFind') === '1') return true;
    try { return sessionStorage.getItem('corvex_find_done') === '1'; } catch { return false; }
  })();

  const provinceOptions = useMemo(() => getAllProvinces(), []);
  const cityOptions = useMemo(() => getCities(geoCodes.provCode) || [], [geoCodes.provCode]);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  useEffect(() => {
    if (!isEdit && !fromFind) {
      showToast?.('Search for an existing customer before registering.', 'error');
      navigate('/sales/customers');
    }
  }, [isEdit, fromFind, navigate, showToast]);

  useEffect(() => {
    const territoryId = searchParams.get('territoryId') || searchParams.get('territory_id');
    const assignmentId = searchParams.get('assignmentId') || searchParams.get('assignment_id');
    if (!isEdit) {
      setForm((prev) => ({
        ...prev,
        territory_id: territoryId ? String(territoryId) : prev.territory_id,
        source_assignment_id: assignmentId ? String(assignmentId) : prev.source_assignment_id,
        first_name: searchParams.get('firstName') || prev.first_name,
        middle_name: searchParams.get('middleName') || prev.middle_name,
        last_name: searchParams.get('lastName') || prev.last_name,
        contact_phone: searchParams.get('phone') || prev.contact_phone,
      }));
    }
  }, [searchParams, isEdit]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const terr = await fetchTerritories({});
      if (cancelled) return;
      const rows = (terr?.data || terr || []).filter((t) => String(t.status || 'Active') === 'Active');
      setTerritories(rows);
      if (isEdit && customerId) {
        setLoading(true);
        const res = await fetchCustomerById(customerId);
        if (!cancelled && res.success && res.data) {
          const c = res.data;
          const resolved = await resolveAddressSelection({
            address_region: c.address_region,
            address_province: c.address_province,
            address_city: c.address_city,
            address_barangay: c.address_barangay,
          });
          if (cancelled) return;
          setForm({
            ...emptyForm(),
            first_name: c.first_name || '',
            middle_name: c.middle_name || '',
            last_name: c.last_name || '',
            name_suffix: c.name_suffix || '',
            contact_phone: c.contact_phone || '',
            phone_verification_status: c.phone_verification_status || 'Unverified',
            portal_email: c.portal_email || '',
            address_region: resolved.regionName || c.address_region || '',
            address_province: resolved.provinceName || c.address_province || '',
            address_city: resolved.cityName || c.address_city || '',
            address_barangay: resolved.barangayName || c.address_barangay || '',
            address_street: c.address_street || '',
            address_zip: c.address_zip || '',
            latitude: c.latitude != null ? String(c.latitude) : '',
            longitude: c.longitude != null ? String(c.longitude) : '',
            territory_id: c.territory_id != null ? String(c.territory_id) : '',
            territory_override_note: c.territory_override_note || '',
            marketing_opt_in: Boolean(c.marketing_opt_in),
            privacy_notice_acknowledged: Boolean(c.privacy_notice_acknowledged_at),
          });
          setGeoCodes({
            regCode: resolved.regCode || '',
            provCode: resolved.provCode || '',
            munCityCode: resolved.munCityCode || '',
          });
          if (c.latitude != null && c.longitude != null) setMapExpanded(true);
        }
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [customerId, isEdit]);

  useEffect(() => {
    let cancelled = false;
    async function loadBarangays() {
      if (!geoCodes.munCityCode) {
        setBarangayOptions([]);
        setBarangaysLoading(false);
        return;
      }
      setBarangaysLoading(true);
      try {
        const rows = await getBarangays(geoCodes.munCityCode);
        if (!cancelled) setBarangayOptions(rows || []);
      } finally {
        if (!cancelled) setBarangaysLoading(false);
      }
    }
    loadBarangays();
    return () => { cancelled = true; };
  }, [geoCodes.munCityCode]);

  const onSelectProvince = (provCode) => {
    const province = provinceOptions.find((p) => p.provCode === provCode);
    const region = getRegionForProvince(provCode);
    setGeoCodes({ regCode: region?.regCode || '', provCode, munCityCode: '' });
    setForm((prev) => ({
      ...prev,
      address_province: province?.provName || '',
      address_region: region?.regionName || '',
      address_city: '',
      address_barangay: '',
    }));
    setErrors((prev) => ({ ...prev, address_province: undefined, address_region: undefined }));
  };

  const onSelectCity = (munCityCode) => {
    const city = cityOptions.find((c) => c.munCityCode === munCityCode);
    setGeoCodes((prev) => ({ ...prev, munCityCode }));
    setForm((prev) => ({
      ...prev,
      address_city: city?.munCityName || '',
      address_barangay: '',
    }));
    setErrors((prev) => ({ ...prev, address_city: undefined }));
  };

  const composedAddress = useMemo(() => composeCustomerAddress({
    address_street: form.address_street,
    address_barangay: form.address_barangay,
    address_city: form.address_city,
    address_province: form.address_province,
    address_region: form.address_region,
    address_zip: form.address_zip,
  }), [form]);

  const detailsStepIndex = 0;
  const addressStepIndex = 1;
  const reviewStepIndex = 2;

  const collectStepErrors = (index) => {
    const next = {};
    if (index === detailsStepIndex) {
      if (!String(form.first_name || '').trim()) next.first_name = 'Required';
      if (!String(form.last_name || '').trim()) next.last_name = 'Required';
      if (!String(form.contact_phone || '').trim()) next.contact_phone = 'Required';
    }
    if (index === addressStepIndex) {
      if (!geoCodes.provCode && !String(form.address_province || '').trim()) next.address_province = 'Required';
      if (!geoCodes.munCityCode && !String(form.address_city || '').trim()) next.address_city = 'Required';
      if (!String(form.address_barangay || '').trim()) next.address_barangay = 'Required';
      if (!String(form.address_street || '').trim()) next.address_street = 'Required';
      if (!String(form.territory_id || '').trim()) next.territory_id = 'Required';
      if (territoryHint?.classification === 'outside' && !String(form.territory_override_note || '').trim()) {
        next.territory_override_note = 'Explain why this territory is used outside coverage.';
      }
    }
    if (index === reviewStepIndex && !isEdit) {
      if (!form.privacy_notice_acknowledged) next.privacy_notice_acknowledged = 'Required';
    }
    return next;
  };

  const validateStep = (index, { commit = true } = {}) => {
    const next = collectStepErrors(index);
    if (commit) setErrors(next);
    return Object.keys(next).length === 0;
  };

  const validateThrough = (toIndex) => {
    const merged = {};
    let firstFail = -1;
    for (let i = 0; i < toIndex; i += 1) {
      const stepErrors = collectStepErrors(i);
      Object.assign(merged, stepErrors);
      if (firstFail < 0 && Object.keys(stepErrors).length) firstFail = i;
    }
    setErrors(merged);
    return firstFail;
  };

  const buildPayload = () => ({
    cash_registration: !isEdit,
    customer_type: 'Individual',
    first_name: form.first_name.trim(),
    middle_name: form.middle_name.trim() || null,
    last_name: form.last_name.trim(),
    name_suffix: form.name_suffix || null,
    contact_phone: form.contact_phone.trim(),
    phone_verification_status: form.phone_verification_status === 'Verified' ? 'Verified' : 'Unverified',
    portal_email: form.portal_email.trim() || null,
    address_region: form.address_region,
    address_province: form.address_province,
    address_city: form.address_city,
    address_barangay: form.address_barangay,
    address_street: form.address_street.trim() || null,
    address_zip: form.address_zip.trim() || null,
    address: composedAddress,
    latitude: form.latitude || null,
    longitude: form.longitude || null,
    territory_id: form.territory_id ? Number(form.territory_id) : null,
    territory_override_note: form.territory_override_note.trim() || null,
    source_assignment_id: form.source_assignment_id ? Number(form.source_assignment_id) : null,
    privacy_notice_acknowledged: Boolean(form.privacy_notice_acknowledged),
    privacy_notice_version: PRIVACY_VERSION,
    marketing_opt_in: Boolean(form.marketing_opt_in),
    registration_profile: {
      cash_registration: !isEdit,
      territory_outside_review: Boolean(form.territory_override_note.trim())
        || territoryHint?.classification === 'outside',
      account_eligibility: 'Cash',
      find_lookup_summary: 'no_match',
    },
  });

  const successNavigate = (id) => {
    if (returnTo) {
      if (returnTo.includes(':id') && id) {
        navigate(returnTo.replace(':id', String(id)));
        return;
      }
      if (id && /^\/sales\/log-sale\/?(\?|$)/.test(returnTo.split('?')[0])) {
        const qs = returnTo.includes('?') ? returnTo.slice(returnTo.indexOf('?')) : '';
        navigate(`/sales/log-sale/${id}${qs}`);
        return;
      }
      navigate(returnTo);
      return;
    }
    navigate(id ? `/sales/customer-detail/${id}?from=customers` : '/sales/customers');
  };

  const submitPayload = async (payload) => {
    setSaving(true);
    if (!isBrowserOnline()) {
      if (!isSalesOfflineEnabled()) {
        setSaving(false);
        showToast?.('You are offline. Enable offline mode in Settings to save locally.', 'error');
        return;
      }
      const localId = `cust-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await saveOfflineRecord({
        tableName: 'customer_registration',
        localId,
        payload: { ...payload, client_local_id: localId },
      });
      setSaving(false);
      showToast?.('Saved offline — pending synchronization.', 'success');
      navigate('/sales/customers');
      return;
    }

    const result = isEdit
      ? await updateCustomer(customerId, payload)
      : await createCustomer(payload);
    setSaving(false);

    if (!isEdit && result.status === 409) {
      if (result.code === 'EXACT_SAME_BRANCH') {
        const existingId = result.data?.customer_id;
        showToast?.(result.message || 'Exact match in your branch — opening existing profile.', 'error');
        if (existingId) {
          navigate(`/sales/customer-detail/${existingId}?from=customers`);
        } else {
          navigate('/sales/customers');
        }
        return;
      }
      if (result.code === 'EXACT_CROSS_BRANCH') {
        const existingId = result.data?.customer_id;
        try {
          if (existingId) {
            sessionStorage.setItem('corvex_transfer_target_customer_id', String(existingId));
            sessionStorage.setItem('corvex_reopen_find', '1');
          }
        } catch { /* ignore */ }
        showToast?.(
          result.message || 'Exact match in another branch — return to Customers and request a branch transfer.',
          'error'
        );
        navigate('/sales/customers');
        return;
      }
      if (result.code === 'REQUIRES_IDENTITY_VERIFICATION') {
        showToast?.(
          result.message || 'Possible matches found — return to Find Existing Customer and review profiles. Registration cannot continue.',
          'error'
        );
        navigate('/sales/customers');
        return;
      }
      showToast?.(result.message || 'Exact match found — do not create a duplicate.', 'error');
      navigate('/sales/customers');
      return;
    }

    if (result.success) {
      showToast?.(result.message || 'Customer saved.', 'success');
      try {
        sessionStorage.removeItem('corvex_identity_clearance');
        sessionStorage.removeItem('corvex_find_done');
        sessionStorage.removeItem('corvex_pending_identity_verification');
        sessionStorage.removeItem('corvex_transfer_target_customer_id');
      } catch { /* ignore */ }
      const id = result.data?.customer_id || customerId;
      successNavigate(id);
    } else {
      if (result.code === 'REQUIRES_IDENTITY_VERIFICATION') {
        showToast?.(
          result.message || 'Possible matches found — return to Find Existing Customer and review profiles. Registration cannot continue.',
          'error'
        );
        navigate('/sales/customers');
        return;
      }
      showToast?.(result.message || 'Failed to save customer.', 'error');
    }
  };

  const handleSubmit = async () => {
    const failStep = validateThrough(steps.length);
    if (failStep >= 0) {
      setStep(failStep);
      showToast?.(`Fix required fields on ${steps[failStep].label} before submitting.`, 'error');
      return;
    }
    await submitPayload(buildPayload());
  };

  const onPinSettled = async ({ lat, lng }) => {
    const reverse = await reverseGeocodeLocation({ lat, lng });
    let resolvedBarangay = form.address_barangay;
    if (reverse.success && reverse.data) {
      const d = reverse.data;
      const resolved = await resolveAddressSelection({
        address_region: d.address_region,
        address_province: d.address_province,
        address_city: d.address_city,
        address_barangay: d.address_barangay,
      });
      resolvedBarangay = resolved.barangayName || '';
      setGeoNote(d.needs_verification
        ? 'Location detected — verify barangay/postal before submit.'
        : 'Address fields filled from map location (review before submit).');
      setGeoCodes({
        regCode: resolved.regCode || '',
        provCode: resolved.provCode || '',
        munCityCode: resolved.munCityCode || '',
      });
      setForm((prev) => ({
        ...prev,
        address_region: resolved.regionName || prev.address_region,
        address_province: resolved.provinceName || prev.address_province,
        address_city: resolved.cityName || prev.address_city,
        address_barangay: resolved.barangayName || prev.address_barangay,
        address_zip: d.address_zip || prev.address_zip,
      }));
    } else {
      setGeoNote('Could not reverse-geocode reliably. Enter address manually.');
    }

    const suggest = await suggestTerritoryForLocation({
      lat,
      lng,
      barangay: resolvedBarangay || undefined,
    });
    if (suggest.success && suggest.data) {
      setTerritoryHint(suggest.data);
    }
  };

  if (loading) return <LoadingState message="Loading customer form..." />;

  const territoryName = form.territory_id
    ? (territories.find((t) => String(t.territory_id) === String(form.territory_id))?.territory_name
      || `#${form.territory_id}`)
    : '—';

  return (
    <div className="page">
      <section className="panel form-panel content-panel">
        <div className="panel-section-header">
          <h3>{isEdit ? 'Edit Customer' : 'Register Customer'}</h3>
          <p className="muted">
            {isEdit
              ? 'Update customer details for cash-eligible accounts.'
              : 'Register a cash-eligible natural person. Duplicate search already ran before this form. Credit stays a separate request after Active registration.'}
          </p>
        </div>

        <div className="segmented-control" style={{ marginBottom: 16 }}>
          {steps.map((s, idx) => (
            <button
              key={s.key}
              type="button"
              className={step === idx ? 'segment active' : 'segment'}
              onClick={() => {
                if (idx <= step) {
                  setStep(idx);
                  return;
                }
                const failStep = validateThrough(idx);
                if (failStep < 0) setStep(idx);
                else {
                  setStep(failStep);
                  showToast?.(`Complete required fields on ${steps[failStep].label} before continuing.`, 'error');
                }
              }}
            >
              {idx + 1}. {s.label}
            </button>
          ))}
        </div>

        {step === detailsStepIndex ? (
          <>
            <h4 className="subsection-title">Customer Details</h4>
            <div className="account-detail-grid two-up">
              <div className="form-group">
                <label>First Name *</label>
                <input value={form.first_name} onChange={(e) => updateField('first_name', e.target.value)} />
                {errors.first_name ? <p className="form-error">{errors.first_name}</p> : null}
              </div>
              <div className="form-group">
                <label>Middle Name</label>
                <input value={form.middle_name} onChange={(e) => updateField('middle_name', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Last Name *</label>
                <input value={form.last_name} onChange={(e) => updateField('last_name', e.target.value)} />
                {errors.last_name ? <p className="form-error">{errors.last_name}</p> : null}
              </div>
              <div className="form-group">
                <label>Suffix</label>
                <select className="filter-select" value={form.name_suffix} onChange={(e) => updateField('name_suffix', e.target.value)}>
                  <option value="">None</option>
                  {NAME_SUFFIXES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Mobile Number *</label>
                <div className="flex flex-wrap gap-2">
                  <input
                    style={{ flex: 1, minWidth: 180 }}
                    value={form.contact_phone}
                    onChange={(e) => updateField('contact_phone', e.target.value)}
                  />
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => updateField(
                      'phone_verification_status',
                      form.phone_verification_status === 'Verified' ? 'Unverified' : 'Verified'
                    )}
                  >
                    {form.phone_verification_status === 'Verified' ? 'Verified' : 'Verify'}
                  </button>
                </div>
                <p className="muted">
                  UI attestation only this release — status: {form.phone_verification_status}.
                </p>
                {errors.contact_phone ? <p className="form-error">{errors.contact_phone}</p> : null}
              </div>
              <div className="form-group">
                <label>Email (optional)</label>
                <input value={form.portal_email} onChange={(e) => updateField('portal_email', e.target.value)} />
              </div>
            </div>
          </>
        ) : null}

        {step === addressStepIndex ? (
          <>
            <h4 className="subsection-title">Address & Territory</h4>
            <div className="account-detail-grid two-up">
              <div className="form-group">
                <label>Province *</label>
                <select
                  className="filter-select"
                  value={geoCodes.provCode}
                  onChange={(e) => onSelectProvince(e.target.value)}
                >
                  <option value="">Select</option>
                  {provinceOptions.map((p) => <option key={p.provCode} value={p.provCode}>{p.provName}</option>)}
                </select>
                {errors.address_province ? <p className="form-error">{errors.address_province}</p> : null}
              </div>
              <div className="form-group">
                <label>Region</label>
                <input value={form.address_region || '—'} readOnly disabled />
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
                  {cityOptions.map((c) => <option key={c.munCityCode} value={c.munCityCode}>{c.munCityName}</option>)}
                </select>
                {errors.address_city ? <p className="form-error">{errors.address_city}</p> : null}
              </div>
              <div className="form-group">
                <label>Barangay *</label>
                <select
                  className="filter-select"
                  value={form.address_barangay}
                  disabled={!geoCodes.munCityCode || barangaysLoading}
                  onChange={(e) => updateField('address_barangay', e.target.value)}
                >
                  <option value="">{barangaysLoading ? 'Loading…' : 'Select'}</option>
                  {barangayOptions.map((b) => {
                    const name = String(b.brgyName || '').trim();
                    return <option key={b.brgyCode || b.psgcCode || name} value={name}>{name}</option>;
                  })}
                </select>
                {errors.address_barangay ? <p className="form-error">{errors.address_barangay}</p> : null}
              </div>
              <div className="form-group">
                <label>House / Street / Landmark *</label>
                <input value={form.address_street} onChange={(e) => updateField('address_street', e.target.value)} />
                {errors.address_street ? <p className="form-error">{errors.address_street}</p> : null}
              </div>
              <div className="form-group">
                <label>Postal Code</label>
                <input value={form.address_zip} onChange={(e) => updateField('address_zip', e.target.value)} />
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
                latitude={form.latitude}
                longitude={form.longitude}
                onChange={({ latitude, longitude }) => {
                  updateField('latitude', latitude);
                  updateField('longitude', longitude);
                }}
                warning={(msg) => showToast?.(msg, 'error')}
                onPinSettled={onPinSettled}
              />
            ) : null}

            <h4 className="subsection-title" style={{ marginTop: 16 }}>Assigned Branch & Territory</h4>
            <div className="account-detail-grid two-up">
              <div className="form-group">
                <label>Assigned Branch</label>
                <input value={branchLabel} readOnly disabled />
              </div>
              <div className="form-group">
                <label>Territory *</label>
                <select
                  className="filter-select"
                  value={form.territory_id}
                  disabled={territoryLocked}
                  onChange={(e) => updateField('territory_id', e.target.value)}
                >
                  <option value="">Select territory</option>
                  {territories.map((t) => (
                    <option key={t.territory_id} value={t.territory_id}>
                      {t.territory_name}{t.barangay_name ? ` · ${t.barangay_name}` : ''}
                    </option>
                  ))}
                </select>
                {territoryLocked ? (
                  <p className="muted">
                    {scheduleTerritoryId
                      ? 'Territory is fixed by the assigned schedule.'
                      : 'Select a schedule assignment first when registering from the field schedule.'}
                  </p>
                ) : null}
                {errors.territory_id ? <p className="form-error">{errors.territory_id}</p> : null}
                {territoryHint ? (
                  <p className="muted">
                    Location check: {territoryHint.classification}
                    {territoryHint.nearest
                      ? ` · nearest ${territoryHint.nearest.territory_name} (~${territoryHint.nearest.distance_meters} m)`
                      : ''}
                  </p>
                ) : null}
              </div>
            </div>
            {territoryHint?.classification === 'outside' || form.territory_override_note ? (
              <div className="form-group">
                <label>Territory exception note {territoryHint?.classification === 'outside' ? '*' : ''}</label>
                <textarea
                  className="filter-input"
                  rows={2}
                  value={form.territory_override_note}
                  onChange={(e) => updateField('territory_override_note', e.target.value)}
                />
                {errors.territory_override_note ? <p className="form-error">{errors.territory_override_note}</p> : null}
              </div>
            ) : null}
          </>
        ) : null}

        {step === reviewStepIndex ? (
          <>
            <h4 className="subsection-title">Review & Register</h4>
            {Object.keys(errors).length ? (
              <p className="form-error" style={{ marginBottom: 12 }}>
                Some required fields are still missing. Use Back or the step tabs to complete them.
              </p>
            ) : null}
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <tbody>
                  <tr>
                    <th>Name</th>
                    <td>
                      {[form.first_name, form.middle_name, form.last_name, form.name_suffix]
                        .filter(Boolean)
                        .join(' ')}
                    </td>
                  </tr>
                  <tr>
                    <th>Mobile</th>
                    <td>
                      {form.contact_phone || '—'}
                      {' · '}
                      <StatusBadge status={form.phone_verification_status || 'Unverified'} />
                    </td>
                  </tr>
                  <tr>
                    <th>Email</th>
                    <td>{form.portal_email || '—'}</td>
                  </tr>
                  <tr>
                    <th>Address</th>
                    <td>{composedAddress || '—'}</td>
                  </tr>
                  <tr>
                    <th>Branch</th>
                    <td>{branchLabel}</td>
                  </tr>
                  <tr>
                    <th>Territory</th>
                    <td>{territoryName}</td>
                  </tr>
                  <tr>
                    <th>Duplicate check</th>
                    <td>
                      {isEdit
                        ? 'Edit mode'
                        : 'No match (checked before registration)'}
                    </td>
                  </tr>
                  <tr>
                    <th>Account Eligibility</th>
                    <td>Cash / Spot Cash</td>
                  </tr>
                  <tr>
                    <th>Credit Application</th>
                    <td>Not applied</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {!isEdit ? (
              <div style={{ marginTop: 16 }}>
                <label className="flex gap-2 items-start" style={{ marginBottom: 12 }}>
                  <input
                    type="checkbox"
                    checked={form.privacy_notice_acknowledged}
                    onChange={(e) => updateField('privacy_notice_acknowledged', e.target.checked)}
                  />
                  <span>
                    I acknowledge the CORVEX Privacy Notice ({PRIVACY_VERSION}). *
                    {errors.privacy_notice_acknowledged
                      ? <span className="form-error"> Required</span>
                      : null}
                  </span>
                </label>
                <label className="flex gap-2 items-start">
                  <input
                    type="checkbox"
                    checked={form.marketing_opt_in}
                    onChange={(e) => updateField('marketing_opt_in', e.target.checked)}
                  />
                  <span>Optional: I agree to receive marketing and promotional messages.</span>
                </label>
              </div>
            ) : null}

            {!isBrowserOnline() ? (
              <p className="muted" style={{ marginTop: 12 }}>You are offline — submit will queue locally until sync.</p>
            ) : null}
          </>
        ) : null}

        <div className="flex flex-wrap justify-between gap-2 mt-4">
          <button
            className="button ghost"
            type="button"
            onClick={() => {
              if (step === 0) {
                navigate(returnTo || '/sales/customers');
                return;
              }
              setStep((s) => s - 1);
            }}
          >
            {step === 0 ? 'Cancel' : 'Back'}
          </button>
          <div className="flex gap-2">
            {step < steps.length - 1 ? (
              <button
                className="button"
                type="button"
                onClick={() => {
                  if (!validateStep(step)) {
                    showToast?.('Fix the required fields on this step before continuing.', 'error');
                    return;
                  }
                  setStep((s) => s + 1);
                }}
              >
                Continue
              </button>
            ) : (
              <button className="button" type="button" disabled={saving} onClick={handleSubmit}>
                {saving ? 'Saving…' : 'Register Customer'}
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
