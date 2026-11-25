import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  createCustomer,
  updateCustomer,
  fetchCustomerById,
  sendCustomerEmailOtp,
  verifyCustomerEmailOtp,
  submitCustomerChangeRequest,
  resubmitCustomerIdentityReview,
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

function formatMeters(meters) {
  const n = Number(meters);
  if (!Number.isFinite(n)) return '';
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)} km`;
  return `${Math.round(n)} m`;
}

function territoryClassificationLabel(hint) {
  if (!hint?.classification) return '';
  const nearestName = hint.nearest?.territory_name || hint.suggested_territory_name || 'a territory';
  const dist = formatMeters(hint.nearest?.distance_meters);
  switch (hint.classification) {
    case 'inside':
      return `Inside ${nearestName}${dist ? ` (~${dist} from center)` : ''}.`;
    case 'near':
      return `Near ${nearestName}${dist ? ` (~${dist} from center)` : ''} — within the coverage buffer.`;
    case 'outside':
      return `Outside nearest territory (${nearestName}${dist ? `, ~${dist}` : ''}). Add an audit note if you still assign a territory.`;
    case 'barangay_match':
      return `Matched by barangay to ${hint.barangay_match?.territory_name || nearestName}. Set a map pin to confirm coverage.`;
    default:
      return `Location check: ${hint.classification}.`;
  }
}

function territoryBarangayConflict(hint) {
  const geoId = hint?.nearest?.territory_id ?? hint?.suggested_territory_id;
  const brgyId = hint?.barangay_match?.territory_id;
  if (!geoId || !brgyId || String(geoId) === String(brgyId)) return null;
  return `Barangay matches ${hint.barangay_match.territory_name}, but the map pin is nearest to ${hint.nearest?.territory_name || 'another territory'}. Prefer the pin when placing the customer.`;
}

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

const SA_PROTECTED_EDIT_FIELDS = [
  'first_name', 'middle_name', 'last_name', 'contact_phone',
  'address_region', 'address_province', 'address_city', 'address_barangay',
  'address_street', 'address_zip', 'latitude', 'longitude', 'territory_id',
];
const SA_SOFT_EDIT_FIELDS = ['portal_email'];

function normEditValue(value) {
  if (value == null) return '';
  return String(value).trim();
}

export function CustomerFormPage({ customerId, navigate, showToast }) {
  const isEdit = Boolean(customerId);
  const steps = isEdit ? EDIT_STEPS : CREATE_STEPS;
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo') || searchParams.get('return_to') || '';
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [baseline, setBaseline] = useState(null);
  const [recordStatus, setRecordStatus] = useState(null);
  const [changeReason, setChangeReason] = useState('');
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(isEdit);
  const isRejectedResubmit = isEdit && String(recordStatus || '') === 'Rejected';
  const [saving, setSaving] = useState(false);
  const [territories, setTerritories] = useState([]);
  const [geoCodes, setGeoCodes] = useState(EMPTY_GEO_CODES);
  const [barangayOptions, setBarangayOptions] = useState([]);
  const [barangaysLoading, setBarangaysLoading] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [geoNote, setGeoNote] = useState('');
  const [territoryHint, setTerritoryHint] = useState(null);
  const [emailOtpCode, setEmailOtpCode] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [emailVerificationToken, setEmailVerificationToken] = useState('');
  const [emailOtpSending, setEmailOtpSending] = useState(false);
  const [emailOtpVerifying, setEmailOtpVerifying] = useState(false);

  const currentUser = getCurrentUser();
  const isSalesAgent = [
    currentUser?.roleSlug,
    currentUser?.role,
    currentUser?.role?.slug,
    currentUser?.role?.name,
  ].some((value) => ['sales_staff', 'Sales Agent'].includes(String(value || '')));
  const branchLabel = getUserAssignedLocation(currentUser) || currentUser?.branch_name || 'Assigned branch';

  const scheduleTerritoryId = !isEdit
    ? String(searchParams.get('territoryId') || searchParams.get('territory_id') || '')
    : '';
  const territoryLocked = Boolean(scheduleTerritoryId);
  const fromFind = (() => {
    if (searchParams.get('fromFind') === '1') return true;
    try { return sessionStorage.getItem('corvex_find_done') === '1'; } catch { return false; }
  })();

  const lockedFromFind = useMemo(() => {
    if (isEdit || !fromFind) {
      return {
        first_name: false,
        middle_name: false,
        last_name: false,
        contact_phone: false,
        portal_email: false,
      };
    }
    return {
      first_name: Boolean(String(searchParams.get('firstName') || '').trim()),
      middle_name: Boolean(String(searchParams.get('middleName') || '').trim()),
      last_name: Boolean(String(searchParams.get('lastName') || '').trim()),
      contact_phone: Boolean(String(searchParams.get('phone') || '').trim()),
      portal_email: Boolean(String(searchParams.get('email') || '').trim()),
    };
  }, [isEdit, fromFind, searchParams]);

  const provinceOptions = useMemo(() => getAllProvinces(), []);
  const cityOptions = useMemo(() => getCities(geoCodes.provCode) || [], [geoCodes.provCode]);

  const clearEmailVerification = () => {
    setEmailVerified(false);
    setEmailVerificationToken('');
    setEmailOtpCode('');
  };

  const updateField = (key, value) => {
    if (lockedFromFind[key]) return;
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, key)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    if (key === 'portal_email') clearEmailVerification();
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
        portal_email: searchParams.get('email') || prev.portal_email,
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
          const loaded = {
            ...emptyForm(),
            first_name: c.first_name || '',
            middle_name: c.middle_name || '',
            last_name: c.last_name || '',
            name_suffix: c.name_suffix || '',
            contact_phone: c.contact_phone || '',
            phone_verification_status: c.phone_verification_status || 'Unverified',
            email_verification_status: c.email_verification_status || 'Unverified',
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
          };
          setForm(loaded);
          setBaseline(loaded);
          setRecordStatus(c.status || null);
          setChangeReason('');
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
    setErrors((prev) => {
      const next = { ...prev };
      delete next.address_province;
      delete next.address_region;
      return next;
    });
  };

  const onSelectCity = (munCityCode) => {
    const city = cityOptions.find((c) => c.munCityCode === munCityCode);
    setGeoCodes((prev) => ({ ...prev, munCityCode }));
    setForm((prev) => ({
      ...prev,
      address_city: city?.munCityName || '',
      address_barangay: '',
    }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next.address_city;
      return next;
    });
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
      const emailValue = String(form.portal_email || '').trim();
      if (emailValue && !isEdit && !emailVerified) {
        next.portal_email = 'Verify this email with the code we send before continuing.';
      }
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
    email_verification_token: form.portal_email.trim() && !isEdit
      ? (emailVerificationToken || null)
      : undefined,
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
      hold_reason: (
        Boolean(form.territory_override_note.trim())
        || territoryHint?.classification === 'outside'
      ) ? 'territory_exception' : undefined,
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

  const buildSaEditPatches = () => {
    const softPatch = {};
    const protectedPatch = {};
    if (!baseline) return { softPatch, protectedPatch };
    for (const key of SA_SOFT_EDIT_FIELDS) {
      const next = key === 'portal_email' ? (form[key].trim() || null) : form[key];
      const prev = key === 'portal_email' ? (baseline[key].trim() || null) : baseline[key];
      if (normEditValue(next) !== normEditValue(prev)) softPatch[key] = next;
    }
    for (const key of SA_PROTECTED_EDIT_FIELDS) {
      if (normEditValue(form[key]) !== normEditValue(baseline[key])) {
        protectedPatch[key] = form[key] === '' ? null : form[key];
      }
    }
    if (protectedPatch.territory_id != null && protectedPatch.territory_id !== '') {
      protectedPatch.territory_id = Number(protectedPatch.territory_id);
    }
    return { softPatch, protectedPatch };
  };
  const saEditPatches = isEdit && isSalesAgent && baseline
    ? buildSaEditPatches()
    : { softPatch: {}, protectedPatch: {} };
  const hasSaSoftChanges = Object.keys(saEditPatches.softPatch).length > 0;
  const hasSaProtectedChanges = Object.keys(saEditPatches.protectedPatch).length > 0;

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

    let result;
    if (isEdit && isSalesAgent && isRejectedResubmit) {
      result = await resubmitCustomerIdentityReview(customerId, {
        territory_id: form.territory_id ? Number(form.territory_id) : null,
        territory_override_note: form.territory_override_note.trim() || null,
        territory_outside_review: Boolean(form.territory_override_note.trim())
          || territoryHint?.classification === 'outside',
        address_region: form.address_region,
        address_province: form.address_province,
        address_city: form.address_city,
        address_barangay: form.address_barangay,
        address_street: form.address_street.trim() || null,
        address_zip: form.address_zip.trim() || null,
        address: composedAddress,
        latitude: form.latitude || null,
        longitude: form.longitude || null,
      });
    } else if (isEdit && isSalesAgent) {
      const { softPatch, protectedPatch } = buildSaEditPatches();
      if (!Object.keys(softPatch).length && !Object.keys(protectedPatch).length) {
        setSaving(false);
        showToast?.('No changes to save.', 'error');
        return;
      }
      if (Object.keys(protectedPatch).length && !String(changeReason || '').trim()) {
        setSaving(false);
        setErrors((prev) => ({ ...prev, change_reason: 'Required for identity, phone, address, or territory changes.' }));
        showToast?.('Add a reason for Branch Manager approval of protected field changes.', 'error');
        return;
      }
      if (Object.keys(softPatch).length) {
        result = await updateCustomer(customerId, softPatch);
        if (!result.success) {
          setSaving(false);
          showToast?.(result.message || 'Failed to save soft fields.', 'error');
          return;
        }
      }
      if (Object.keys(protectedPatch).length) {
        result = await submitCustomerChangeRequest(customerId, {
          ...protectedPatch,
          reason: String(changeReason).trim(),
        });
        if (!result.success) {
          setSaving(false);
          showToast?.(result.message || 'Failed to submit change request.', 'error');
          return;
        }
        result = {
          ...result,
          pending: true,
          message: result.message
            || 'Protected changes submitted for Branch Manager approval.',
        };
      } else if (result?.success) {
        result = {
          ...result,
          message: result.message || 'Customer soft fields updated.',
        };
      }
    } else {
      result = isEdit
        ? await updateCustomer(customerId, payload)
        : await createCustomer(payload);
    }
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
      showToast?.(
        result.message
          || (result.pending
            ? 'Change request submitted for Branch Manager approval.'
            : (result.territory_hold
              ? 'Submitted for Branch Manager territory review.'
              : 'Customer saved.')),
        'success'
      );
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

  const handleSendEmailOtp = async () => {
    const email = String(form.portal_email || '').trim();
    if (!email) {
      setErrors((prev) => ({ ...prev, portal_email: 'Enter an email first.' }));
      return;
    }
    setEmailOtpSending(true);
    const res = await sendCustomerEmailOtp(email);
    setEmailOtpSending(false);
    if (res.success) {
      setEmailVerified(false);
      setEmailVerificationToken('');
      setEmailOtpCode('');
      setErrors((prev) => {
        const next = { ...prev };
        delete next.portal_email;
        return next;
      });
      showToast?.(res.message || 'Verification code sent.', 'success');
      return;
    }
    showToast?.(res.message || 'Failed to send verification code.', 'error');
  };

  const handleVerifyEmailOtp = async () => {
    const email = String(form.portal_email || '').trim();
    const code = String(emailOtpCode || '').trim();
    if (!email) {
      setErrors((prev) => ({ ...prev, portal_email: 'Enter an email first.' }));
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setErrors((prev) => ({ ...prev, portal_email: 'Enter the 6-digit code from the email.' }));
      return;
    }
    setEmailOtpVerifying(true);
    const res = await verifyCustomerEmailOtp(email, code);
    setEmailOtpVerifying(false);
    if (res.success && res.data?.email_verification_token) {
      setEmailVerified(true);
      setEmailVerificationToken(res.data.email_verification_token);
      setErrors((prev) => {
        const next = { ...prev };
        delete next.portal_email;
        return next;
      });
      showToast?.(res.message || 'Email verified.', 'success');
      return;
    }
    setEmailVerified(false);
    setEmailVerificationToken('');
    showToast?.(res.message || 'Failed to verify email code.', 'error');
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

  const hasMapPin = Number.isFinite(Number(form.latitude)) && Number.isFinite(Number(form.longitude));

  const refreshTerritoryHint = async ({
    lat = form.latitude,
    lng = form.longitude,
    barangay = form.address_barangay,
    autoApply = false,
  } = {}) => {
    const latN = Number(lat);
    const lngN = Number(lng);
    const hasCoords = Number.isFinite(latN) && Number.isFinite(lngN);
    const barangayName = String(barangay || '').trim();
    if (!hasCoords && !barangayName) {
      setTerritoryHint(null);
      return null;
    }
    const suggest = await suggestTerritoryForLocation({
      lat: hasCoords ? latN : undefined,
      lng: hasCoords ? lngN : undefined,
      barangay: barangayName || undefined,
    });
    if (!suggest.success || !suggest.data) return null;
    setTerritoryHint(suggest.data);
    const suggestedId = suggest.data.suggested_territory_id;
    const canAuto = autoApply
      && suggestedId
      && !territoryLocked
      && ['inside', 'near', 'barangay_match'].includes(suggest.data.classification);
    if (canAuto) {
      setForm((prev) => {
        if (String(prev.territory_id || '').trim()) return prev;
        return { ...prev, territory_id: String(suggestedId) };
      });
      setErrors((prev) => {
        const next = { ...prev };
        delete next.territory_id;
        return next;
      });
    }
    return suggest.data;
  };

  const applySuggestedTerritory = () => {
    const id = territoryHint?.suggested_territory_id || territoryHint?.nearest?.territory_id;
    if (!id || territoryLocked) return;
    updateField('territory_id', String(id));
    showToast?.(
      `Territory set to ${territoryHint.suggested_territory_name || territoryHint.nearest?.territory_name || id}.`,
      'success'
    );
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

    await refreshTerritoryHint({
      lat,
      lng,
      barangay: resolvedBarangay,
      autoApply: true,
    });
  };

  if (loading) return <LoadingState message="Loading customer form..." />;

  const territoryName = form.territory_id
    ? (territories.find((t) => String(t.territory_id) === String(form.territory_id))?.territory_name
      || `#${form.territory_id}`)
    : '—';
  const territoryHintLabel = territoryClassificationLabel(territoryHint);
  const barangayConflictMsg = territoryBarangayConflict(territoryHint);
  const suggestedTerritoryId = territoryHint?.suggested_territory_id || territoryHint?.nearest?.territory_id;
  const suggestedTerritoryName = territoryHint?.suggested_territory_name || territoryHint?.nearest?.territory_name;

  return (
    <div className="page">
      <section className="panel form-panel content-panel">
        <div className="panel-section-header">
          <h3>
            {isRejectedResubmit
              ? 'Fix & resubmit registration'
              : (isEdit ? 'Edit Customer' : 'Register Customer')}
          </h3>
          {isRejectedResubmit ? (
            <p className="muted" style={{ marginTop: 4 }}>
              This registration was declined (Rejected). Correct address/territory, then resubmit for Branch Manager
              review. Do not create a new customer.
            </p>
          ) : null}
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
                <input
                  value={form.first_name}
                  readOnly={lockedFromFind.first_name}
                  disabled={lockedFromFind.first_name}
                  onChange={(e) => updateField('first_name', e.target.value)}
                />
                {lockedFromFind.first_name ? <p className="muted">Locked from Find Existing search.</p> : null}
                {errors.first_name ? <p className="form-error">{errors.first_name}</p> : null}
              </div>
              <div className="form-group">
                <label>Middle Name</label>
                <input
                  value={form.middle_name}
                  readOnly={lockedFromFind.middle_name}
                  disabled={lockedFromFind.middle_name}
                  onChange={(e) => updateField('middle_name', e.target.value)}
                />
                {lockedFromFind.middle_name ? <p className="muted">Locked from Find Existing search.</p> : null}
              </div>
              <div className="form-group">
                <label>Last Name *</label>
                <input
                  value={form.last_name}
                  readOnly={lockedFromFind.last_name}
                  disabled={lockedFromFind.last_name}
                  onChange={(e) => updateField('last_name', e.target.value)}
                />
                {lockedFromFind.last_name ? <p className="muted">Locked from Find Existing search.</p> : null}
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
                    readOnly={lockedFromFind.contact_phone}
                    disabled={lockedFromFind.contact_phone}
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
                  Sales agent attestation that this mobile was confirmed with the customer. SMS OTP is not available in this release.
                  {' '}Status: {form.phone_verification_status}.
                </p>
                {lockedFromFind.contact_phone ? <p className="muted">Locked from Find Existing search.</p> : null}
                {errors.contact_phone ? <p className="form-error">{errors.contact_phone}</p> : null}
              </div>
              <div className="form-group">
                <label>Email (optional)</label>
                <div className="flex flex-wrap gap-2">
                  <input
                    style={{ flex: 1, minWidth: 180 }}
                    type="email"
                    value={form.portal_email}
                    readOnly={lockedFromFind.portal_email}
                    disabled={lockedFromFind.portal_email}
                    onChange={(e) => updateField('portal_email', e.target.value)}
                  />
                  {!isEdit ? (
                    <button
                      className="button secondary"
                      type="button"
                      disabled={emailOtpSending || !String(form.portal_email || '').trim()}
                      onClick={handleSendEmailOtp}
                    >
                      {emailOtpSending ? 'Sending…' : 'Send code'}
                    </button>
                  ) : null}
                </div>
                {!isEdit && String(form.portal_email || '').trim() ? (
                  <div className="flex flex-wrap gap-2" style={{ marginTop: 8 }}>
                    <input
                      style={{ flex: 1, minWidth: 140, maxWidth: 180 }}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="6-digit code"
                      value={emailOtpCode}
                      onChange={(e) => {
                        setEmailOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                        if (emailVerified) clearEmailVerification();
                      }}
                    />
                    <button
                      className="button secondary"
                      type="button"
                      disabled={emailOtpVerifying || emailVerified}
                      onClick={handleVerifyEmailOtp}
                    >
                      {emailVerified ? 'Verified' : (emailOtpVerifying ? 'Verifying…' : 'Confirm code')}
                    </button>
                  </div>
                ) : null}
                <p className="muted">
                  {isEdit
                    ? 'Portal needs an email. Soft field — Sales Agents can update this directly, then invite from customer detail.'
                    : emailVerified
                      ? 'Email verified. After register (or BM territory approve), an activation invite is emailed for the customer portal.'
                      : 'Optional — needed only for customer portal. Leave blank for cash-only; add email later to invite. If filled, confirm the verification code before register.'}
                </p>
                {lockedFromFind.portal_email ? <p className="muted">Locked from Find Existing search.</p> : null}
                {errors.portal_email ? <p className="form-error">{errors.portal_email}</p> : null}
              </div>
            </div>
          </>
        ) : null}

        {step === addressStepIndex ? (
          <>
            <h4 className="subsection-title">Address & Territory</h4>
            <div className="account-detail-grid two-up">
              <div className="form-group">
                <label>Province / HUC *</label>
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
                  onChange={(e) => {
                    const nextBarangay = e.target.value;
                    updateField('address_barangay', nextBarangay);
                    refreshTerritoryHint({
                      barangay: nextBarangay,
                      autoApply: !String(form.territory_id || '').trim() && !territoryLocked,
                    });
                  }}
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
                {mapExpanded ? 'Hide Map' : (hasMapPin ? 'Show Map Location' : 'Set Location on Map')}
              </button>
              {!hasMapPin ? (
                <p className="muted" style={{ marginTop: 8 }}>
                  Recommended: drop a map pin so CORVEX can fill address fields and suggest the right territory.
                  Without a pin, coverage checks are weaker.
                </p>
              ) : (
                <p className="muted" style={{ marginTop: 8 }}>
                  Map pin set ({Number(form.latitude).toFixed(5)}, {Number(form.longitude).toFixed(5)}).
                </p>
              )}
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
                  onChange={(e) => {
                    updateField('territory_id', e.target.value);
                    refreshTerritoryHint({ autoApply: false });
                  }}
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
                  <div style={{ marginTop: 8 }}>
                    <p className="muted">{territoryHintLabel}</p>
                    {barangayConflictMsg ? (
                      <p className="muted" style={{ marginTop: 4 }}>
                        {barangayConflictMsg}
                      </p>
                    ) : null}
                    {!territoryLocked
                      && suggestedTerritoryId
                      && String(form.territory_id || '') !== String(suggestedTerritoryId) ? (
                        <button
                          className="button secondary"
                          type="button"
                          style={{ marginTop: 8 }}
                          onClick={applySuggestedTerritory}
                        >
                          Use suggested territory
                          {suggestedTerritoryName ? `: ${suggestedTerritoryName}` : ''}
                        </button>
                      ) : null}
                    {form.territory_id
                      && territoryHint.nearest?.territory_id
                      && String(form.territory_id) !== String(territoryHint.nearest.territory_id)
                      && territoryHint.classification === 'inside' ? (
                        <p className="muted" style={{ marginTop: 4 }}>
                          Pin is inside {territoryHint.nearest.territory_name}, but a different territory is selected.
                        </p>
                      ) : null}
                  </div>
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
                  placeholder="Why assign this territory outside coverage?"
                />
                <p className="muted">
                  Required for outside coverage. Registration will wait for Branch Manager approve/reject
                  before the account can be used for cash sales.
                </p>
                {errors.territory_override_note ? <p className="form-error">{errors.territory_override_note}</p> : null}
              </div>
            ) : null}
          </>
        ) : null}

        {step === reviewStepIndex ? (
          <>
            <h4 className="subsection-title">Review & Register</h4>
            {Object.values(errors).some(Boolean) ? (
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
                    <td>
                      {form.portal_email || '—'}
                      {form.portal_email ? (
                        <>
                          {' · '}
                          <StatusBadge
                            status={
                              isEdit
                                ? (form.email_verification_status || 'Unverified')
                                : (emailVerified ? 'Verified' : 'Unverified')
                            }
                          />
                        </>
                      ) : null}
                    </td>
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
                    <td>
                      {territoryName}
                      {territoryHintLabel ? (
                        <span className="muted">
                          {' · '}
                          {territoryHintLabel}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                  {String(form.territory_override_note || '').trim() ? (
                    <tr>
                      <th>Territory exception</th>
                      <td>
                        {String(form.territory_override_note).trim()}
                        <span className="muted"> · BM will review before activation</span>
                      </td>
                    </tr>
                  ) : null}
                  <tr>
                    <th>Account Eligibility</th>
                    <td>
                      Cash / Spot Cash
                      <span className="muted"> · credit is a separate Apply for Credit request after Active</span>
                    </td>
                  </tr>
                  <tr>
                    <th>Portal</th>
                    <td>
                      {form.portal_email.trim()
                        ? (emailVerified || isEdit
                          ? `Invite will use ${form.portal_email.trim()} after the account is Active`
                          : 'Email entered — verify the code before register')
                        : 'No email — cash account only (portal invite later when email is available)'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {isEdit && isSalesAgent ? (
              <div className="form-group" style={{ marginTop: 16 }}>
                <div className="muted" style={{ marginBottom: 8 }}>
                  <strong>Change action:</strong>{' '}
                  {hasSaProtectedChanges
                    ? 'Submit protected changes for BM approval'
                    : hasSaSoftChanges
                      ? 'Save soft changes immediately'
                      : 'No changes detected'}
                </div>
                <label htmlFor="sa-change-reason">Reason for protected changes</label>
                <textarea
                  id="sa-change-reason"
                  className="filter-input"
                  rows={2}
                  required={hasSaProtectedChanges}
                  disabled={!hasSaProtectedChanges}
                  value={changeReason}
                  onChange={(e) => {
                    setChangeReason(e.target.value);
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.change_reason;
                      return next;
                    });
                  }}
                  placeholder="Required when changing name, mobile, address, or territory"
                />
                <p className="muted">
                  <strong>Soft / immediate:</strong> portal email only.
                  {' '}<strong>BM approval required:</strong> name, mobile, address, coordinates, and territory.
                </p>
                {errors.change_reason ? <p className="form-error">{errors.change_reason}</p> : null}
              </div>
            ) : null}

            {!isEdit ? (
              <div className="registration-consent" style={{ marginTop: 16 }}>
                <label className="registration-consent-row">
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
                <label className="registration-consent-row">
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
                  if (step === addressStepIndex && !hasMapPin && !isEdit) {
                    showToast?.(
                      'No map pin yet — territory coverage check is limited. You can still continue.',
                      'error'
                    );
                  }
                  setStep((s) => s + 1);
                }}
              >
                Continue
              </button>
            ) : (
              <button className="button" type="button" disabled={saving} onClick={handleSubmit}>
                {saving
                  ? 'Saving…'
                  : (isRejectedResubmit
                    ? 'Save & resubmit for BM'
                    : (isEdit
                        ? (isSalesAgent
                          ? (hasSaProtectedChanges
                            ? (hasSaSoftChanges
                              ? 'Save Soft Fields + Submit for BM'
                              : 'Submit for BM Approval')
                            : 'Save')
                          : 'Save Customer')
                    : 'Register Customer'))}
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
