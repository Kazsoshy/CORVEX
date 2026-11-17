import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createCustomer, updateCustomer, fetchCustomerById } from '../../api/salesService';
import { lookupCustomersForDuplicate } from '../../api/customerPortalService';
import { fetchTerritories, reverseGeocodeLocation, suggestTerritoryForLocation, searchAddressLocation } from '../../api/territoriesService';
import {
  CIVIL_STATUS_OPTIONS,
  CONTACT_RELATIONSHIP_OPTIONS,
  composeCustomerAddress,
} from '../../utils/customerDisplay';
import {
  getBarangays,
  getCities,
  getProvinces,
  getRegions,
  resolveAddressSelection,
} from '../../utils/phAddress';
import { isBrowserOnline } from '../../offline/connection.js';
import { saveOfflineRecord } from '../../offline/db.js';
import { isSalesOfflineEnabled } from '../../offline/prefs.js';
import LeafletMap from '../common/LeafletMap';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';

const GOVERNMENT_ID_TYPES = [
  'Philippine National ID',
  "Driver's License",
  'Passport',
  'UMID',
  'SSS ID',
  'PhilHealth ID',
  'Postal ID',
  "Voter's ID",
  'PRC ID',
  'Other',
];

const CLASSIFICATION_BUSINESS = 'Business Owner';
const CLASSIFICATION_EMPLOYED = 'Employed Individual';
const CLASSIFICATIONS = [CLASSIFICATION_BUSINESS, CLASSIFICATION_EMPLOYED];

const classificationToCustomerType = (classification) => (
  classification === CLASSIFICATION_BUSINESS ? 'Business' : 'Individual'
);
const customerTypeToClassification = (customerType) => (
  customerType === 'Business' ? CLASSIFICATION_BUSINESS : CLASSIFICATION_EMPLOYED
);

const STEPS = [
  { key: 'identity', label: 'Identity' },
  { key: 'credit', label: 'Credit Profile' },
  { key: 'address', label: 'Address & Territory' },
  { key: 'review', label: 'Review' },
];

const PH_REGIONS = getRegions();
const EMPTY_GEO_CODES = { regCode: '', provCode: '', munCityCode: '' };

function emptyForm() {
  return {
    classification: CLASSIFICATION_EMPLOYED,
    customer_type: 'Individual',
    business_name: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    mothers_maiden_name: '',
    civil_status: '',
    contact_phone: '',
    portal_email: '',
    id_type: '',
    id_number: '',
    id_photo: '',
    id_photo_name: '',
    apply_for_credit: false,
    business_type: '',
    business_category: '',
    store_type: '',
    years_of_operation: '',
    estimated_monthly_revenue: '',
    estimated_monthly_expenses: '',
    existing_obligations: '',
    requested_credit_limit: '',
    preferred_payment_terms: '',
    supplier_references: '',
    employer_name: '',
    position: '',
    employment_duration: '',
    employment_status: '',
    monthly_income: '',
    business_document: '',
    evidence_photos: [],
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
    contact_person_fname: '',
    contact_person_mname: '',
    contact_person_lname: '',
    contact_person_phone: '',
    contact_person_relationship: '',
    secondary_contact_fname: '',
    secondary_contact_lname: '',
    secondary_contact_phone: '',
    secondary_contact_relationship: '',
    source_assignment_id: '',
    acknowledge_duplicate: false,
  };
}

function readUpload(file, onValue, warning) {
  if (!file) return;
  if ((!file.type.startsWith('image/') && file.type !== 'application/pdf') || file.size > 900000) {
    warning?.('Upload an image or PDF smaller than 900 KB.');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => onValue(String(reader.result || ''));
  reader.onerror = () => warning?.('The selected file could not be read.');
  reader.readAsDataURL(file);
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
              warning?.('Location is not available in this browser. Search for an address manually.');
              return;
            }
            if (!window.isSecureContext && window.location.hostname !== 'localhost') {
              warning?.('GPS requires a secure connection (HTTPS). Open CORVEX over HTTPS or search for an address manually.');
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
                  const message = error.code === error.PERMISSION_DENIED
                    ? 'Location permission was denied. Allow location access in the browser, then try again.'
                    : 'Could not read your current location. Please check your location permission or search for an address manually.';
                  warning?.(message);
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
          color: '#0B2133',
          popup: 'Customer location',
        }] : []}
      />
    </div>
  );
}

export function CustomerFormPage({ customerId, navigate, showToast }) {
  const isEdit = Boolean(customerId);
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [territories, setTerritories] = useState([]);
  const [geoCodes, setGeoCodes] = useState(EMPTY_GEO_CODES);
  const [barangayOptions, setBarangayOptions] = useState([]);
  const [barangaysLoading, setBarangaysLoading] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState([]);
  const [dupModalOpen, setDupModalOpen] = useState(false);
  const [geoNote, setGeoNote] = useState('');
  const [territoryHint, setTerritoryHint] = useState(null);
  const [addressQuery, setAddressQuery] = useState('');
  const [addressSearching, setAddressSearching] = useState(false);

  // Territory is locked only when the schedule explicitly supplies a territoryId.
  const scheduleTerritoryId = !isEdit
    ? String(searchParams.get('territoryId') || searchParams.get('territory_id') || '')
    : '';
  const territoryLocked = Boolean(scheduleTerritoryId);

  const isBusinessOwner = form.classification === CLASSIFICATION_BUSINESS;
  const isEmployed = form.classification === CLASSIFICATION_EMPLOYED;

  const regionOptions = PH_REGIONS;
  const provinceOptions = useMemo(() => getProvinces(geoCodes.regCode) || [], [geoCodes.regCode]);
  const cityOptions = useMemo(() => getCities(geoCodes.provCode) || [], [geoCodes.provCode]);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const updateClassification = (classification) => {
    setForm((prev) => ({
      ...prev,
      classification,
      customer_type: classificationToCustomerType(classification),
    }));
    setErrors({});
  };

  useEffect(() => {
    const territoryId = searchParams.get('territoryId') || searchParams.get('territory_id');
    const assignmentId = searchParams.get('assignmentId') || searchParams.get('assignment_id');
    if (!isEdit && (territoryId || assignmentId)) {
      setForm((prev) => ({
        ...prev,
        territory_id: territoryId ? String(territoryId) : prev.territory_id,
        source_assignment_id: assignmentId ? String(assignmentId) : prev.source_assignment_id,
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
          const profile = c.registration_profile_json || {};
          const employment = profile.employment || {};
          const classification = CLASSIFICATIONS.includes(profile.classification)
            ? profile.classification
            : customerTypeToClassification(c.customer_type);

          const resolved = await resolveAddressSelection({
            address_region: c.address_region,
            address_province: c.address_province,
            address_city: c.address_city,
            address_barangay: c.address_barangay,
          });
          if (cancelled) return;

          setForm({
            ...emptyForm(),
            classification,
            customer_type: classificationToCustomerType(classification),
            business_name: c.business_name || '',
            first_name: c.first_name || '',
            middle_name: c.middle_name || '',
            last_name: c.last_name || '',
            mothers_maiden_name: c.mothers_maiden_name || '',
            civil_status: c.civil_status || '',
            contact_phone: c.contact_phone || '',
            portal_email: c.portal_email || '',
            id_type: c.id_type || '',
            id_number: c.id_number || '',
            address_region: resolved.regionName || c.address_region || '',
            address_province: resolved.provinceName || c.address_province || '',
            address_city: resolved.cityName || c.address_city || '',
            address_barangay: resolved.barangayName || c.address_barangay || '',
            address_street: c.address_street || '',
            address_zip: c.address_zip || '',
            latitude: c.latitude != null ? String(c.latitude) : '',
            longitude: c.longitude != null ? String(c.longitude) : '',
            territory_id: c.territory_id != null ? String(c.territory_id) : '',
            contact_person_fname: c.contact_person_fname || '',
            contact_person_mname: c.contact_person_mname || '',
            contact_person_lname: c.contact_person_lname || '',
            contact_person_phone: c.contact_person_phone || '',
            contact_person_relationship: c.contact_person_relationship || '',
            secondary_contact_fname: c.secondary_contact_fname || '',
            secondary_contact_lname: c.secondary_contact_lname || '',
            secondary_contact_phone: c.secondary_contact_phone || '',
            secondary_contact_relationship: c.secondary_contact_relationship || '',
            business_type: profile.business_type || '',
            business_category: profile.business_category || '',
            store_type: profile.store_type || '',
            years_of_operation: profile.years_of_operation != null ? String(profile.years_of_operation) : '',
            estimated_monthly_revenue: c.estimated_monthly_revenue != null ? String(c.estimated_monthly_revenue) : '',
            estimated_monthly_expenses: c.estimated_monthly_expenses != null ? String(c.estimated_monthly_expenses) : '',
            existing_obligations: c.existing_obligations != null ? String(c.existing_obligations) : '',
            preferred_payment_terms: profile.preferred_payment_terms || '',
            supplier_references: profile.supplier_references || '',
            employer_name: employment.employer_name || '',
            position: employment.position || '',
            employment_duration: employment.duration_months != null ? String(employment.duration_months) : '',
            employment_status: employment.employment_status || '',
            monthly_income: employment.monthly_income != null ? String(employment.monthly_income) : '',
          });
          setGeoCodes({
            regCode: resolved.regCode || '',
            provCode: resolved.provCode || '',
            munCityCode: resolved.munCityCode || '',
          });
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

  const onSelectRegion = (regCode) => {
    const region = regionOptions.find((r) => r.regCode === regCode);
    setGeoCodes({ regCode, provCode: '', munCityCode: '' });
    setForm((prev) => ({
      ...prev,
      address_region: region?.regionName || '',
      address_province: '',
      address_city: '',
      address_barangay: '',
    }));
    setErrors((prev) => ({ ...prev, address_region: undefined }));
  };

  const onSelectProvince = (provCode) => {
    const province = provinceOptions.find((p) => p.provCode === provCode);
    setGeoCodes((prev) => ({ ...prev, provCode, munCityCode: '' }));
    setForm((prev) => ({
      ...prev,
      address_province: province?.provName || '',
      address_city: '',
      address_barangay: '',
    }));
    setErrors((prev) => ({ ...prev, address_province: undefined }));
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

  const collectStepErrors = (index) => {
    const next = {};
    if (index === 0) {
      if (isBusinessOwner && !String(form.business_name || '').trim()) next.business_name = 'Required';
      if (!String(form.first_name || '').trim()) next.first_name = 'Required';
      if (!String(form.last_name || '').trim()) next.last_name = 'Required';
      if (form.apply_for_credit && isEmployed) {
        if (!form.id_type) next.id_type = 'Required for credit';
        if (!String(form.id_number || '').trim()) next.id_number = 'Required for credit';
      }
      if (!String(form.contact_phone || '').trim()) next.contact_phone = 'Required';
      const alternateContactStarted = [
        form.contact_person_fname,
        form.contact_person_mname,
        form.contact_person_lname,
        form.contact_person_phone,
        form.contact_person_relationship,
      ].some((value) => String(value || '').trim());
      if (alternateContactStarted && (!String(form.contact_person_fname || '').trim()
        || !String(form.contact_person_lname || '').trim()
        || !String(form.contact_person_phone || '').trim()
        || !form.contact_person_relationship)) {
        next.contact_person_fname = 'Complete the alternate contact or leave it blank';
      }
    }
    if (index === 1 && form.apply_for_credit) {
      if (isBusinessOwner) {
        if (!String(form.business_name || '').trim()) next.business_name = 'Required for credit';
        if (!String(form.estimated_monthly_revenue || '').trim()) next.estimated_monthly_revenue = 'Required for credit';
      }
      if (isEmployed) {
        if (!String(form.employer_name || '').trim()) next.employer_name = 'Required for credit';
        if (!String(form.monthly_income || '').trim()) next.monthly_income = 'Required for credit';
      }
    }
    if (index === 2) {
      if (!geoCodes.regCode && !String(form.address_region || '').trim()) next.address_region = 'Required';
      if (!geoCodes.provCode && !String(form.address_province || '').trim()) next.address_province = 'Required';
      if (!geoCodes.munCityCode && !String(form.address_city || '').trim()) next.address_city = 'Required';
      if (!String(form.address_barangay || '').trim()) next.address_barangay = 'Required';
      if (!String(form.territory_id || '').trim()) next.territory_id = 'Required';
      if (territoryHint?.classification === 'outside' && !String(form.territory_override_note || '').trim()) {
        next.territory_override_note = 'Explain why this territory is used outside coverage.';
      }
    }
    return next;
  };

  const validateStep = (index, { commit = true } = {}) => {
    const next = collectStepErrors(index);
    if (commit) setErrors(next);
    return Object.keys(next).length === 0;
  };

  /** Validate every step up to `toIndex` (exclusive). Returns first failing step or -1. */
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

  const runDuplicateCheck = async () => {
    const res = await lookupCustomersForDuplicate({
      contact_phone: form.contact_phone.trim(),
      name: isBusinessOwner
        ? form.business_name.trim()
        : `${form.first_name} ${form.last_name}`.trim(),
      business_name: form.business_name.trim() || undefined,
      address_barangay: form.address_barangay || undefined,
      address: composedAddress || undefined,
    });
    const matches = res.success ? (res.data || []) : [];
    setDuplicateMatches(matches);
    return matches;
  };

  const buildPayload = () => {
    const customerType = classificationToCustomerType(form.classification);
    const business = customerType === 'Business';
    const requestedLimit = form.apply_for_credit && String(form.requested_credit_limit || '').trim() !== ''
      ? Number(form.requested_credit_limit)
      : null;

    return {
      customer_type: customerType,
      business_name: business ? (form.business_name.trim() || null) : null,
      first_name: business
        ? (form.first_name.trim() || form.contact_person_fname.trim())
        : form.first_name.trim(),
      middle_name: form.middle_name.trim() || null,
      last_name: business
        ? (form.last_name.trim() || form.contact_person_lname.trim())
        : form.last_name.trim(),
      mothers_maiden_name: form.mothers_maiden_name.trim() || null,
      civil_status: form.civil_status || null,
      contact_phone: form.contact_phone.trim(),
      portal_email: form.portal_email.trim() || null,
      id_type: form.id_type || null,
      id_number: form.id_number.trim() || null,
      id_photo: form.id_photo || null,
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
      contact_person_fname: form.contact_person_fname.trim(),
      contact_person_mname: form.contact_person_mname.trim() || null,
      contact_person_lname: form.contact_person_lname.trim(),
      contact_person_phone: form.contact_person_phone.trim(),
      contact_person_relationship: form.contact_person_relationship,
      secondary_contact_fname: form.secondary_contact_fname.trim() || null,
      secondary_contact_lname: form.secondary_contact_lname.trim() || null,
      secondary_contact_phone: form.secondary_contact_phone.trim() || null,
      secondary_contact_relationship: form.secondary_contact_relationship || null,
      estimated_monthly_revenue: business ? (form.estimated_monthly_revenue || null) : null,
      estimated_monthly_expenses: business ? (form.estimated_monthly_expenses || null) : null,
      existing_obligations: form.existing_obligations || null,
      request_credit: Boolean(form.apply_for_credit),
      requested_credit_limit: form.apply_for_credit ? form.requested_credit_limit : null,
      credit_request_reason: form.apply_for_credit ? 'First installment' : null,
      credit_request_remarks: form.apply_for_credit
        ? `Registration credit request. Terms: ${form.preferred_payment_terms || 'n/a'}. Refs: ${form.supplier_references || 'n/a'}`
        : null,
      acknowledge_duplicate: Boolean(form.acknowledge_duplicate),
      registration_profile: {
        classification: form.classification,
        business_type: business ? (form.business_type || null) : null,
        business_category: business ? (form.business_category || null) : null,
        store_type: business ? (form.store_type || null) : null,
        years_of_operation: business && form.years_of_operation ? Number(form.years_of_operation) : null,
        preferred_payment_terms: form.preferred_payment_terms || null,
        supplier_references: form.supplier_references || null,
        business_document: business ? (form.business_document || null) : null,
        employment: !business ? {
          employer_name: form.employer_name.trim() || null,
          position: form.position.trim() || null,
          duration_months: form.employment_duration ? Number(form.employment_duration) : null,
          employment_status: form.employment_status || null,
          monthly_income: form.monthly_income ? Number(form.monthly_income) : null,
        } : null,
        evidence_photos: form.evidence_photos || [],
        requested_credit_limit: requestedLimit,
      },
    };
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
      showToast?.('Saved offline — pending synchronization. Not yet submitted to Branch Manager.', 'success');
      navigate('/sales/customers');
      return;
    }

    const result = isEdit
      ? await updateCustomer(customerId, payload)
      : await createCustomer(payload);
    setSaving(false);
    if (result.success) {
      showToast?.(result.message || 'Customer saved.', 'success');
      const id = result.data?.customer_id || customerId;
      navigate(id ? `/sales/customer-detail/${id}?from=customers` : '/sales/customers');
    } else {
      showToast?.(result.message || 'Failed to save customer.', 'error');
    }
  };

  const handleSubmit = async ({ forceNew = false } = {}) => {
    const failStep = validateThrough(3);
    if (failStep >= 0) {
      setStep(failStep);
      const labels = ['Identity', 'Credit Profile', 'Address & Territory'];
      showToast?.(
        failStep === 1
          ? 'Complete credit assessment fields.'
          : `Fix required fields on ${labels[failStep]} before submitting.`,
        'error'
      );
      return;
    }

    if (!isEdit && !forceNew && !form.acknowledge_duplicate) {
      const matches = await runDuplicateCheck();
      if (matches.length) {
        setDupModalOpen(true);
        return;
      }
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
      setGeoCodes((prev) => ({
        regCode: resolved.regCode || prev.regCode,
        provCode: resolved.provCode || prev.provCode,
        munCityCode: resolved.munCityCode || prev.munCityCode,
      }));
      setForm((prev) => ({
        ...prev,
        address_region: resolved.regionName || prev.address_region,
        address_province: resolved.provinceName || prev.address_province,
        address_city: resolved.cityName || prev.address_city,
        address_barangay: resolved.barangayName || prev.address_barangay,
        address_zip: d.address_zip || prev.address_zip,
      }));
      setErrors((prev) => ({
        ...prev,
        address_region: undefined,
        address_province: undefined,
        address_city: undefined,
        address_barangay: undefined,
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
      if (suggest.data.suggested_territory_id && !territoryLocked) {
        setForm((prev) => ({
          ...prev,
          territory_id: String(suggest.data.suggested_territory_id),
        }));
        setErrors((prev) => ({ ...prev, territory_id: undefined }));
      }
    }
  };

  const handleAddressSearch = async () => {
    const query = addressQuery.trim();
    if (!query) {
      showToast?.('Enter an address, barangay, or landmark to search.', 'error');
      return;
    }
    setAddressSearching(true);
    try {
      const result = await searchAddressLocation(query);
      const lat = Number(result?.data?.latitude ?? result?.data?.lat);
      const lng = Number(result?.data?.longitude ?? result?.data?.lng);
      if (!result?.success || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        showToast?.(result?.message || 'No match found. Click the map to place the pin.', 'error');
        return;
      }
      setForm((prev) => ({
        ...prev,
        latitude: lat.toFixed(7),
        longitude: lng.toFixed(7),
      }));
      await onPinSettled({ lat, lng });
    } catch (error) {
      showToast?.(
        error?.message || 'Location found, but the address could not be populated. Please select the address manually.',
        'error'
      );
    } finally {
      setAddressSearching(false);
    }
  };

  if (loading) return <LoadingState message="Loading customer form..." />;

  return (
    <div className="page">
      <section className="panel form-panel content-panel">
        <div className="panel-section-header">
          <h3>{isEdit ? 'Edit Customer' : 'Register Customer'}</h3>
          <p className="muted">
            Registration creates an Active customer for cash sales. Credit requires Branch Manager approval after investigation.
          </p>
        </div>

        <div className="segmented-control" style={{ marginBottom: 16 }}>
          {STEPS.map((s, idx) => (
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
                  showToast?.(`Complete required fields on step ${failStep + 1} before continuing.`, 'error');
                }
              }}
            >
              {idx + 1}. {s.label}
            </button>
          ))}
        </div>

        {step === 0 ? (
          <>
            <h4 className="subsection-title">Customer Identity</h4>
            <div className="account-detail-grid two-up">
              <div className="form-group">
                <label>Classification *</label>
                <select
                  className="filter-select"
                  value={form.classification}
                  onChange={(e) => updateClassification(e.target.value)}
                >
                  {CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <p className="muted">Customer type: {form.customer_type}</p>
              </div>
              {isBusinessOwner ? (
                <div className="form-group">
                  <label>Registered Business Name *</label>
                  <input value={form.business_name} onChange={(e) => updateField('business_name', e.target.value)} />
                  {errors.business_name ? <p className="form-error">{errors.business_name}</p> : null}
                </div>
              ) : null}
              <div className="form-group">
                <label>{isBusinessOwner ? 'Owner First Name *' : 'First Name *'}</label>
                <input value={form.first_name} onChange={(e) => updateField('first_name', e.target.value)} />
                {errors.first_name ? <p className="form-error">{errors.first_name}</p> : null}
              </div>
              <div className="form-group">
                <label>Middle Name</label>
                <input value={form.middle_name} onChange={(e) => updateField('middle_name', e.target.value)} />
              </div>
              <div className="form-group">
                <label>{isBusinessOwner ? 'Owner Last Name *' : 'Last Name *'}</label>
                <input value={form.last_name} onChange={(e) => updateField('last_name', e.target.value)} />
                {errors.last_name ? <p className="form-error">{errors.last_name}</p> : null}
              </div>
              <div className="form-group">
                <label>Mother&apos;s Maiden Name (optional)</label>
                <input value={form.mothers_maiden_name} onChange={(e) => updateField('mothers_maiden_name', e.target.value)} />
                {errors.mothers_maiden_name ? <p className="form-error">{errors.mothers_maiden_name}</p> : null}
              </div>
              <div className="form-group">
                <label>Civil Status (optional)</label>
                <select className="filter-select" value={form.civil_status} onChange={(e) => updateField('civil_status', e.target.value)}>
                  <option value="">Select</option>
                  {CIVIL_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                {errors.civil_status ? <p className="form-error">{errors.civil_status}</p> : null}
              </div>
              <div className="form-group">
                <label>Government ID Type{form.apply_for_credit && isEmployed ? ' *' : ' (optional)'}</label>
                <select className="filter-select" value={form.id_type} onChange={(e) => updateField('id_type', e.target.value)}>
                  <option value="">Select</option>
                  {GOVERNMENT_ID_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                {errors.id_type ? <p className="form-error">{errors.id_type}</p> : null}
              </div>
              <div className="form-group">
                <label>ID Number{form.apply_for_credit && isEmployed ? ' *' : ' (optional)'}</label>
                <input value={form.id_number} onChange={(e) => updateField('id_number', e.target.value)} />
                {errors.id_number ? <p className="form-error">{errors.id_number}</p> : null}
              </div>
              <div className="form-group">
                <label>Government ID Document</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => readUpload(e.target.files?.[0], (value) => updateField('id_photo', value), showToast)}
                />
                {form.id_photo ? <p className="muted">ID document attached.</p> : null}
              </div>
              <div className="form-group">
                <label>Primary Contact Number *</label>
                <input value={form.contact_phone} onChange={(e) => updateField('contact_phone', e.target.value)} />
                {errors.contact_phone ? <p className="form-error">{errors.contact_phone}</p> : null}
              </div>
              <div className="form-group">
                <label>Email (optional)</label>
                <input value={form.portal_email} onChange={(e) => updateField('portal_email', e.target.value)} />
              </div>
            </div>
            <h4 className="subsection-title">Authorized / Alternate Contact (optional)</h4>
            <p className="muted">Add another person only when someone else is authorized to coordinate for this customer.</p>
            <div className="account-detail-grid two-up">
              <div className="form-group">
                <label>Contact First Name</label>
                <input value={form.contact_person_fname} onChange={(e) => updateField('contact_person_fname', e.target.value)} />
                {errors.contact_person_fname ? <p className="form-error">{errors.contact_person_fname}</p> : null}
              </div>
              <div className="form-group">
                <label>Contact Last Name</label>
                <input value={form.contact_person_lname} onChange={(e) => updateField('contact_person_lname', e.target.value)} />
                {errors.contact_person_lname ? <p className="form-error">{errors.contact_person_lname}</p> : null}
              </div>
              <div className="form-group">
                <label>Contact Phone</label>
                <input value={form.contact_person_phone} onChange={(e) => updateField('contact_person_phone', e.target.value)} />
                {errors.contact_person_phone ? <p className="form-error">{errors.contact_person_phone}</p> : null}
              </div>
              <div className="form-group">
                <label>Relationship</label>
                <select className="filter-select" value={form.contact_person_relationship} onChange={(e) => updateField('contact_person_relationship', e.target.value)}>
                  <option value="">Select</option>
                  {CONTACT_RELATIONSHIP_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                {errors.contact_person_relationship ? <p className="form-error">{errors.contact_person_relationship}</p> : null}
              </div>
            </div>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <label className="flex gap-2 items-center" style={{ marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={form.apply_for_credit}
                onChange={(e) => updateField('apply_for_credit', e.target.checked)}
              />
              Apply for credit (creates a Credit Investigation for Branch Manager review)
            </label>
            {!form.apply_for_credit ? (
              <p className="muted">Skip this section for cash-only registration. You can request credit later from the customer profile.</p>
            ) : (
              <div className="account-detail-grid two-up">
                {isBusinessOwner ? (
                  <>
                    {!form.business_name.trim() ? (
                      <div className="form-group">
                        <label>Business Name *</label>
                        <input value={form.business_name} onChange={(e) => updateField('business_name', e.target.value)} />
                        {errors.business_name ? <p className="form-error">{errors.business_name}</p> : null}
                      </div>
                    ) : null}
                    <div className="form-group">
                      <label>Business Type</label>
                      <input value={form.business_type} onChange={(e) => updateField('business_type', e.target.value)} placeholder="e.g. Retail, Services" />
                    </div>
                    <div className="form-group">
                      <label>Store Type</label>
                      <input value={form.store_type} onChange={(e) => updateField('store_type', e.target.value)} placeholder="e.g. Sari-sari, Hardware" />
                    </div>
                    <div className="form-group">
                      <label>Years of Operation</label>
                      <input type="number" min="0" value={form.years_of_operation} onChange={(e) => updateField('years_of_operation', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>Estimated Monthly Revenue *</label>
                      <input type="number" min="0" value={form.estimated_monthly_revenue} onChange={(e) => updateField('estimated_monthly_revenue', e.target.value)} placeholder="PHP per month" />
                      <p className="muted">Approximate total business sales or income before expenses.</p>
                      {errors.estimated_monthly_revenue ? <p className="form-error">{errors.estimated_monthly_revenue}</p> : null}
                    </div>
                    <div className="form-group">
                      <label>Estimated Monthly Expenses</label>
                      <input type="number" min="0" value={form.estimated_monthly_expenses} onChange={(e) => updateField('estimated_monthly_expenses', e.target.value)} placeholder="PHP per month" />
                      <p className="muted">Approximate monthly operating expenses.</p>
                    </div>
                    <div className="form-group">
                      <label>Business Document</label>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={(e) => readUpload(e.target.files?.[0], (value) => updateField('business_document', value), showToast)}
                      />
                      {form.business_document ? <p className="muted">Business document attached.</p> : null}
                    </div>
                    <div className="form-group">
                      <label>Evidence Photos (store, inventory, permits)</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => readUpload(
                          e.target.files?.[0],
                          (value) => setForm((prev) => ({ ...prev, evidence_photos: [...(prev.evidence_photos || []), value] })),
                          showToast
                        )}
                      />
                      {form.evidence_photos?.length ? (
                        <p className="muted">
                          {form.evidence_photos.length} photo(s) attached.{' '}
                          <button className="button ghost" type="button" onClick={() => updateField('evidence_photos', [])}>Clear</button>
                        </p>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="form-group">
                      <label>Employer Name *</label>
                      <input value={form.employer_name} onChange={(e) => updateField('employer_name', e.target.value)} />
                      {errors.employer_name ? <p className="form-error">{errors.employer_name}</p> : null}
                    </div>
                    <div className="form-group">
                      <label>Position</label>
                      <input value={form.position} onChange={(e) => updateField('position', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>Employment Duration (months)</label>
                      <input type="number" min="0" value={form.employment_duration} onChange={(e) => updateField('employment_duration', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>Employment Status</label>
                      <input value={form.employment_status} onChange={(e) => updateField('employment_status', e.target.value)} placeholder="e.g. Permanent" />
                    </div>
                    <div className="form-group">
                      <label>Monthly Income *</label>
                      <input type="number" min="0" value={form.monthly_income} onChange={(e) => updateField('monthly_income', e.target.value)} placeholder="PHP per month" />
                      {errors.monthly_income ? <p className="form-error">{errors.monthly_income}</p> : null}
                    </div>
                    <div className="form-group">
                      <label>ID Evidence</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => readUpload(e.target.files?.[0], (value) => updateField('id_photo', value), showToast)}
                      />
                      <p className="muted">{form.id_photo ? 'Government ID document attached.' : 'Attach a photo of the government ID entered in Identity.'}</p>
                    </div>
                    <div className="form-group">
                      <label>Supporting Evidence (payslip, certificate)</label>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={(e) => readUpload(
                          e.target.files?.[0],
                          (value) => setForm((prev) => ({ ...prev, evidence_photos: [...(prev.evidence_photos || []), value] })),
                          showToast
                        )}
                      />
                      {form.evidence_photos?.length ? (
                        <p className="muted">
                          {form.evidence_photos.length} file(s) attached.{' '}
                          <button className="button ghost" type="button" onClick={() => updateField('evidence_photos', [])}>Clear</button>
                        </p>
                      ) : null}
                    </div>
                  </>
                )}
                <div className="form-group">
                  <label>Existing Obligations</label>
                  <input type="number" min="0" value={form.existing_obligations} onChange={(e) => updateField('existing_obligations', e.target.value)} placeholder="PHP per month" />
                  <p className="muted">Other monthly debts or financial payments.</p>
                </div>
                <div className="form-group">
                  <label>Requested Credit Limit (optional)</label>
                  <input type="number" min="0" value={form.requested_credit_limit} onChange={(e) => updateField('requested_credit_limit', e.target.value)} />
                  <p className="muted">Customer preference only; the system suggestion and Branch Manager approval determine the actual limit.</p>
                </div>
                <div className="form-group">
                  <label>Preferred Payment Terms</label>
                  <input value={form.preferred_payment_terms} onChange={(e) => updateField('preferred_payment_terms', e.target.value)} placeholder="e.g. 15 days" />
                </div>
                <div className="form-group">
                  <label>Supplier References</label>
                  <input value={form.supplier_references} onChange={(e) => updateField('supplier_references', e.target.value)} />
                </div>
              </div>
            )}
            <p className="muted" style={{ marginTop: 8 }}>
              Suggested limit is computed by OM policy after submit. Branch Manager sets the approved limit — Sales Agents cannot approve credit.
            </p>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <h4 className="subsection-title">Address</h4>
            <div className="account-detail-grid two-up">
              <div className="form-group">
                <label>Region *</label>
                <select className="filter-select" value={geoCodes.regCode} onChange={(e) => onSelectRegion(e.target.value)}>
                  <option value="">Select</option>
                  {regionOptions.map((r) => <option key={r.regCode} value={r.regCode}>{r.regionName}</option>)}
                </select>
                {errors.address_region ? <p className="form-error">{errors.address_region}</p> : null}
              </div>
              <div className="form-group">
                <label>Province *</label>
                <select
                  className="filter-select"
                  value={geoCodes.provCode}
                  disabled={!geoCodes.regCode}
                  onChange={(e) => onSelectProvince(e.target.value)}
                >
                  <option value="">Select</option>
                  {provinceOptions.map((p) => <option key={p.provCode} value={p.provCode}>{p.provName}</option>)}
                </select>
                {errors.address_province ? <p className="form-error">{errors.address_province}</p> : null}
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
                <label>Street / Landmark</label>
                <input value={form.address_street} onChange={(e) => updateField('address_street', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Postal Code</label>
                <input value={form.address_zip} onChange={(e) => updateField('address_zip', e.target.value)} />
              </div>
            </div>
            {geoNote ? <p className="muted">{geoNote}</p> : null}
            <div className="form-group">
              <label>Search address on map</label>
              <div className="flex flex-wrap gap-2">
                <input
                  style={{ flex: 1, minWidth: 220 }}
                  value={addressQuery}
                  placeholder="Street, barangay, or landmark"
                  onChange={(e) => setAddressQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddressSearch();
                    }
                  }}
                />
                <button className="button secondary" type="button" disabled={addressSearching} onClick={handleAddressSearch}>
                  {addressSearching ? 'Searching…' : 'Search'}
                </button>
              </div>
              <p className="muted">Finds the location, drops the pin, and fills the address fields for review.</p>
            </div>
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
            <h4 className="subsection-title" style={{ marginTop: 16 }}>Assigned Territory *</h4>
            <div className="form-group">
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
              {territoryLocked ? <p className="muted">Territory is fixed by the assigned schedule.</p> : null}
              {errors.territory_id ? <p className="form-error">{errors.territory_id}</p> : null}
              {territoryHint ? (
                <p className="muted">
                  Location check: {territoryHint.classification}
                  {territoryHint.nearest ? ` · nearest ${territoryHint.nearest.territory_name} (~${territoryHint.nearest.distance_meters} m)` : ''}
                </p>
              ) : null}
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

        {step === 3 ? (
          <>
            <h4 className="subsection-title">Review before submit</h4>
            {Object.keys(errors).length ? (
              <p className="form-error" style={{ marginBottom: 12 }}>
                Some required fields are still missing. Use Back or the step tabs to complete them.
              </p>
            ) : null}
            <p><strong>Classification:</strong> {form.classification} ({form.customer_type})</p>
            <p><strong>Name:</strong> {isBusinessOwner ? `${form.business_name} — ${form.first_name} ${form.last_name}`.trim() : `${form.first_name} ${form.last_name}`}</p>
            <p><strong>Phone:</strong> {form.contact_phone || '—'}</p>
            <p><strong>Address:</strong> {composedAddress || '—'}</p>
            <p>
              <strong>Territory:</strong>{' '}
              {form.territory_id
                ? (territories.find((t) => String(t.territory_id) === String(form.territory_id))?.territory_name
                  || `#${form.territory_id}`)
                : '—'}
            </p>
            <p><strong>Credit application:</strong> {form.apply_for_credit ? `Yes · requested ₱${form.requested_credit_limit || '—'} (optional preference)` : 'No (cash-eligible registration only)'}</p>
            {form.apply_for_credit ? (
              <p className="muted">The Branch Manager decides the approved credit limit after investigation; the requested amount is only a preference.</p>
            ) : null}
            {form.source_assignment_id ? <p><strong>Source assignment:</strong> #{form.source_assignment_id}</p> : null}
            {territoryLocked ? <p className="muted">Territory is locked to the assigned schedule. A pin outside the area requires Branch Manager review.</p> : null}
            {!territories.length ? (
              <p className="form-error">No active territories are available for your branch. Ask your Branch Manager before registering.</p>
            ) : null}
            {!isBrowserOnline() ? (
              <p className="muted">You are offline — submit will queue locally until sync. Branch Manager will not see the CI until synchronization succeeds.</p>
            ) : null}
          </>
        ) : null}

        <div className="flex flex-wrap justify-between gap-2 mt-4">
          <button className="button ghost" type="button" onClick={() => (step === 0 ? navigate('/sales/customers') : setStep((s) => s - 1))}>
            {step === 0 ? 'Cancel' : 'Back'}
          </button>
          <div className="flex gap-2">
            {step < STEPS.length - 1 ? (
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
                Next
              </button>
            ) : (
              <button className="button" type="button" disabled={saving} onClick={() => handleSubmit()}>
                {saving ? 'Saving…' : form.apply_for_credit ? 'Submit Registration + Credit Review' : 'Submit Registration'}
              </button>
            )}
          </div>
        </div>
      </section>

      {dupModalOpen ? (
        <div className="modal-overlay" onClick={() => setDupModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <h3>Possible existing customers</h3>
            <p className="muted">Review matches before creating a new record. Ownership is never transferred from another branch.</p>
            {!duplicateMatches.length ? (
              <EmptyState title="No matches" description="Continue as new customer." />
            ) : (
              <div className="corvex-table-wrapper">
                <table className="corvex-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Code</th>
                      <th>Phone</th>
                      <th>Branch</th>
                      <th>Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {duplicateMatches.map((m) => (
                      <tr key={m.customer_id}>
                        <td>{m.business_name || `${m.first_name || ''} ${m.last_name || ''}`.trim()}</td>
                        <td>{m.customer_code || '—'}</td>
                        <td>{m.contact_phone || '—'}</td>
                        <td>{m.branch_name || '—'}{m.cross_branch ? ' (other branch)' : ''}</td>
                        <td>{m.match_reason || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-2 mt-4">
              <button className="button ghost" type="button" onClick={() => setDupModalOpen(false)}>Cancel</button>
              {duplicateMatches[0] ? (
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => {
                    setDupModalOpen(false);
                    navigate(`/sales/customer-detail/${duplicateMatches[0].customer_id}?from=customers`);
                  }}
                >
                  View Existing
                </button>
              ) : null}
              <button
                className="button"
                type="button"
                disabled={saving}
                onClick={async () => {
                  setForm((prev) => ({ ...prev, acknowledge_duplicate: true }));
                  setDupModalOpen(false);
                  await handleSubmit({ forceNew: true });
                }}
              >
                Continue as New Customer
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
