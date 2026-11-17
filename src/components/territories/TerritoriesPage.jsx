import { useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState } from '../shared/EmptyState';
import { Pagination } from '../shared/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { StatusBadge } from '../StatusBadge';
import LeafletMap from '../common/LeafletMap';
import {
  fetchTerritories,
  createTerritory,
  updateTerritory,
  deleteTerritory,
  geocodeTerritoryBarangay,
  fetchTerritoryDependencies,
} from '../../api/territoriesService';
import { getCurrentUser } from '../../api/authService';
import apiClient from '../../api/apiClient';
import {
  getBarangays,
  getCities,
  getProvinces,
  getRegions,
} from '../../utils/phAddress';
import { resolveBranchTerritoryGeo } from '../../utils/branchTerritoryGeo';

const DEFAULT_RADIUS = 800;
const PH_REGIONS = getRegions();

function getBranchLabel(branch) {
  return String(branch?.branch_name || branch?.name || '').trim();
}

function getBranchId(branch) {
  return branch?.branch_id ?? branch?.id ?? null;
}

function formatRadiusLabel(meters) {
  const n = Number(meters);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 1000) {
    const km = n / 1000;
    return `${km % 1 === 0 ? km.toFixed(0) : km.toFixed(1)} km`;
  }
  return `${Math.round(n)} m`;
}

function namesLoose(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function autoTerritoryName(barangayName, municipalityName) {
  const brgy = String(barangayName || '').trim();
  if (!brgy) return '';
  const city = String(municipalityName || '').trim();
  if (city && !namesLoose(brgy, city) && !city.toLowerCase().includes(brgy.toLowerCase())) {
    return brgy;
  }
  return brgy;
}

function emptyForm(branchId = '') {
  return {
    territory_name: '',
    branch_id: branchId || '',
    notes: '',
    latitude: '',
    longitude: '',
    radius_meters: String(DEFAULT_RADIUS),
    barangay_code: '',
    barangay_name: '',
    municipality_name: '',
    province_name: '',
  };
}

function TerritoryFormModal({
  open,
  editing,
  form,
  setForm,
  errors,
  submitting,
  geocoding,
  geocodeError,
  isBranchManager,
  currentUser,
  userBranchId,
  branches,
  geoScope,
  geoCodes,
  regionOptions,
  provinceOptions,
  cityOptions,
  barangayOptions,
  barangaysLoading,
  onBranchChange,
  onSelectCity,
  onSelectBarangay,
  onGeocode,
  onClose,
  onSubmit,
}) {
  if (!open) return null;

  const hasPin = Number.isFinite(Number(form.latitude)) && Number.isFinite(Number(form.longitude));
  const mapCenter = hasPin
    ? [Number(form.latitude), Number(form.longitude)]
    : (geoScope?.mapCenter || [7.0731, 125.6128]);
  const mapZoom = hasPin ? 14 : (geoScope?.defaultZoom || 12);
  const mapMarkers = hasPin
    ? [{
      id: 'territory-pin',
      position: mapCenter,
      label: 'T',
      color: '#153450',
      popup: form.territory_name || form.barangay_name || 'Territory center',
      draggable: true,
      onDragEnd: ({ lat, lng }) => {
        setForm((prev) => ({
          ...prev,
          latitude: String(Number(lat.toFixed(7))),
          longitude: String(Number(lng.toFixed(7))),
        }));
      },
    }]
    : [];
  const radius = Number(form.radius_meters);
  const mapCircles = hasPin && Number.isFinite(radius) && radius > 0
    ? [{
      id: 'territory-radius',
      center: mapCenter,
      radius,
      color: '#153450',
      fillOpacity: 0.14,
      popup: 'Approximate map coverage (not a staffing boundary)',
    }]
    : [];

  const regionName = regionOptions.find((r) => r.regCode === geoCodes.regCode)?.regionName
    || PH_REGIONS.find((r) => r.regCode === geoCodes.regCode)?.regionName
    || '';
  const provinceName = provinceOptions.find((p) => p.provCode === geoCodes.provCode)?.provName
    || form.province_name
    || '';
  const cityName = cityOptions.find((c) => c.munCityCode === geoCodes.munCityCode)?.munCityName
    || form.municipality_name
    || '';

  const pinStatusLabel = hasPin
    ? `Pin set for ${form.barangay_name || form.territory_name || 'this territory'}. Drag the pin or click the map to adjust.`
    : 'Select a barangay, then Locate — or click the map to place the pin.';

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="territory-form-title" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: 760, maxHeight: '90vh', overflow: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div>
            <h3 id="territory-form-title">{editing ? 'Edit Territory' : 'Create Territory'}</h3>
            <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
              Geography-first coverage zone. Staff are assigned through daily field ops, not territory defaults.
            </p>
          </div>
          <button className="button ghost" type="button" onClick={onClose} aria-label="Close">×</button>
        </div>

        <h4 className="subsection-title">Territory Information</h4>
        <div className="account-detail-grid two-up">
          <div className="form-group">
            <label htmlFor="terr-name">Territory Name</label>
            <input
              id="terr-name"
              value={form.territory_name || 'Select a barangay…'}
              readOnly
              aria-readonly="true"
            />
            <p className="muted" style={{ marginTop: 4, fontSize: '0.85rem' }}>
              Filled automatically from the barangay.
            </p>
            {errors.territory_name ? <p className="form-error">{errors.territory_name}</p> : null}
          </div>
          <div className="form-group">
            <label htmlFor="terr-branch">Branch *</label>
            {isBranchManager ? (
              <input
                id="terr-branch"
                value={currentUser?.branch?.name || `Branch #${userBranchId}`}
                disabled
              />
            ) : (
              <select
                id="terr-branch"
                className="filter-select"
                value={form.branch_id}
                onChange={(e) => onBranchChange(e.target.value)}
                disabled={Boolean(editing)}
              >
                <option value="">Select branch</option>
                {branches.map((branch) => (
                  <option key={getBranchId(branch)} value={getBranchId(branch)}>
                    {getBranchLabel(branch)}
                  </option>
                ))}
              </select>
            )}
            {errors.branch_id ? <p className="form-error">{errors.branch_id}</p> : null}
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="terr-notes">Specific Location / Coverage Description</label>
            <textarea
              id="terr-notes"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Optional sub-zone notes (e.g. north of the market)"
            />
          </div>
        </div>

        <h4 className="subsection-title">Barangay *</h4>
        <p className="muted" style={{ marginTop: 0 }}>
          Limited to this branch&apos;s service area
          {geoScope?.label ? ` (${geoScope.label})` : ''}. Nationwide places are not listed.
        </p>
        <div className="account-detail-grid two-up">
          <div className="form-group">
            <label htmlFor="terr-region">Region</label>
            <input id="terr-region" value={regionName || '—'} readOnly disabled />
          </div>
          <div className="form-group">
            <label htmlFor="terr-province">Province / HUC</label>
            <input id="terr-province" value={provinceName || '—'} readOnly disabled />
          </div>
          <div className="form-group">
            <label htmlFor="terr-city">City / Municipality{geoScope?.lockCity ? '' : ' *'}</label>
            {geoScope?.lockCity ? (
              <input id="terr-city" value={cityName || '—'} readOnly disabled />
            ) : (
              <select
                id="terr-city"
                className="filter-select"
                value={geoCodes.munCityCode}
                onChange={(e) => onSelectCity(e.target.value)}
                disabled={!geoCodes.provCode}
              >
                <option value="">Select city / municipality</option>
                {cityOptions.map((row) => (
                  <option key={row.munCityCode} value={row.munCityCode}>{row.munCityName}</option>
                ))}
              </select>
            )}
          </div>
          <div className="form-group">
            <label htmlFor="terr-barangay">Barangay *</label>
            <select
              id="terr-barangay"
              className="filter-select"
              value={form.barangay_code || ''}
              onChange={(e) => onSelectBarangay(e.target.value)}
              disabled={!geoCodes.munCityCode || barangaysLoading}
            >
              <option value="">{barangaysLoading ? 'Loading…' : 'Select barangay'}</option>
              {barangayOptions.map((row) => (
                <option key={row.brgyCode} value={row.brgyCode}>{String(row.brgyName || '').trim()}</option>
              ))}
            </select>
            {errors.barangay_name ? <p className="form-error">{errors.barangay_name}</p> : null}
          </div>
        </div>
        <div className="flex gap-2" style={{ marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            className="button secondary"
            type="button"
            disabled={!form.barangay_name || geocoding}
            onClick={onGeocode}
          >
            {geocoding ? 'Locating…' : 'Locate on map'}
          </button>
          {geocodeError ? <span className="form-error" style={{ margin: 0 }}>{geocodeError}</span> : null}
        </div>

        <h4 className="subsection-title">Map Pin *</h4>
        <p className="muted" style={{ marginTop: 0 }}>
          Place or adjust the pin on the map. Sales Agent assignment does not use this pin — Field Ops does.
        </p>
        <div style={{ height: 300, marginBottom: 12, borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
          <LeafletMap
            center={mapCenter}
            zoom={mapZoom}
            height={300}
            markers={mapMarkers}
            circles={mapCircles}
            pinStatusLabel={pinStatusLabel}
            onMapClick={({ lat, lng }) => {
              setForm((prev) => ({
                ...prev,
                latitude: String(Number(lat.toFixed(7))),
                longitude: String(Number(lng.toFixed(7))),
              }));
            }}
          />
        </div>
        {errors.latitude || errors.longitude ? (
          <p className="form-error">{errors.latitude || errors.longitude}</p>
        ) : null}

        <div className="form-group" style={{ maxWidth: 320 }}>
          <label htmlFor="terr-radius">Map coverage zone (optional)</label>
          <input
            id="terr-radius"
            type="number"
            min={100}
            max={20000}
            step={50}
            value={form.radius_meters}
            onChange={(e) => setForm((prev) => ({ ...prev, radius_meters: e.target.value }))}
            placeholder={`${DEFAULT_RADIUS}`}
          />
          <p className="muted" style={{ marginTop: 4, fontSize: '0.85rem' }}>
            Approximate circle on the Field Map only
            {form.radius_meters ? ` (≈ ${formatRadiusLabel(form.radius_meters)})` : ` — default ${DEFAULT_RADIUS} m`}.
            Not used when assigning Sales Agents.
          </p>
          {errors.radius_meters ? <p className="form-error">{errors.radius_meters}</p> : null}
        </div>

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="button secondary" type="button" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="button" type="button" disabled={submitting} onClick={onSubmit}>
            {submitting ? 'Saving…' : (editing ? 'Save Changes' : 'Create Territory')}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeactivateModal({ open, row, deps, loading, submitting, onClose, onConfirm }) {
  if (!open || !row) return null;
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="terr-deactivate-title" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 id="terr-deactivate-title">Deactivate territory?</h3>
        </div>
        <p>
          Soft-deactivate <strong>{row.territory_name}</strong>. Linked customers stay attached; historical records are preserved. It cannot receive new Active assignments.
        </p>
        {loading ? (
          <p className="muted">Loading dependency counts…</p>
        ) : (
          <ul style={{ margin: '12px 0', paddingLeft: 18 }}>
            <li>Active customers linked: <strong>{deps?.activeCustomers ?? 0}</strong></li>
            <li>With overdue balance: <strong>{deps?.overdueCustomers ?? 0}</strong></li>
            <li>Open field assignments: <strong>{deps?.openAssignments ?? 0}</strong></li>
          </ul>
        )}
        <div className="modal-actions">
          <button className="button secondary" type="button" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="button" type="button" onClick={onConfirm} disabled={submitting || loading}>
            {submitting ? 'Deactivating…' : 'Deactivate'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TerritoriesPage({ showToast, navigate, opsBase }) {
  const currentUser = getCurrentUser();
  const userBranchId = currentUser?.branch?.id ?? currentUser?.branchId ?? null;
  const canListAllBranches = ['super_admin', 'operating_manager'].includes(currentUser?.role?.slug);
  const isBranchManager = userBranchId != null && currentUser?.role?.slug === 'branch_manager';
  const resolvedOpsBase = opsBase
    || (currentUser?.role?.slug === 'operating_manager' ? '/operating-manager/operations' : '/branch-manager');

  const [territories, setTerritories] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState(isBranchManager ? String(userBranchId) : '');
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(() => emptyForm(isBranchManager ? userBranchId : ''));
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState('');

  const [geoScope, setGeoScope] = useState(null);
  const [geoCodes, setGeoCodes] = useState({ regCode: '', provCode: '', munCityCode: '' });
  const [regionOptions, setRegionOptions] = useState([]);
  const [provinceOptions, setProvinceOptions] = useState([]);
  const [cityOptions, setCityOptions] = useState([]);
  const [barangayOptions, setBarangayOptions] = useState([]);
  const [barangaysLoading, setBarangaysLoading] = useState(false);

  const [menuOpenId, setMenuOpenId] = useState(null);
  const menuRef = useRef(null);

  const [deactivateRow, setDeactivateRow] = useState(null);
  const [deactivateDeps, setDeactivateDeps] = useState(null);
  const [deactivateLoading, setDeactivateLoading] = useState(false);
  const [deactivateSubmitting, setDeactivateSubmitting] = useState(false);

  const lockedBranchId = isBranchManager ? userBranchId : null;

  async function loadTerritories() {
    try {
      setLoading(true);
      const params = { status: 'all' };
      if (canListAllBranches && branchFilter) params.branch_id = branchFilter;
      const data = await fetchTerritories(params);
      if (data.success) setTerritories(data.data || []);
      else showToast?.(data.message || 'Failed to load territories', 'error');
    } catch (err) {
      showToast?.(err.response?.data?.message || 'Failed to load territories', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTerritories();
  }, [branchFilter]);

  useEffect(() => {
    let cancelled = false;
    async function loadBranches() {
      if (!canListAllBranches) return;
      try {
        const branchesRes = await apiClient.get('/branches');
        if (!cancelled && branchesRes.data?.success) {
          setBranches(branchesRes.data.data || []);
        }
      } catch {
        /* optional for BM */
      }
    }
    loadBranches();
    return () => { cancelled = true; };
  }, [canListAllBranches]);

  useEffect(() => {
    function onDocClick(event) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target)) setMenuOpenId(null);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = (territories || []).filter((row) => {
      if (statusFilter !== 'all' && String(row.status || 'Active') !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        row.territory_name,
        row.branch_name,
        row.barangay_name,
        row.municipality_name,
        row.province_name,
        row.coverage_area,
      ].map((v) => String(v || '').toLowerCase()).join(' ');
      return hay.includes(q);
    });

    const dir = sortDir === 'desc' ? -1 : 1;
    rows = [...rows].sort((a, b) => {
      const pick = (row) => {
        switch (sortKey) {
          case 'barangay': return String(row.barangay_name || '').toLowerCase();
          case 'customers': return Number(row.customer_count || 0);
          case 'overdue': return Number(row.overdue_customer_count || 0);
          case 'status': return String(row.status || '').toLowerCase();
          case 'branch': return String(row.branch_name || '').toLowerCase();
          default: return String(row.territory_name || '').toLowerCase();
        }
      };
      const left = pick(a);
      const right = pick(b);
      if (typeof left === 'number' && typeof right === 'number') return (left - right) * dir;
      return String(left).localeCompare(String(right)) * dir;
    });
    return rows;
  }, [territories, search, statusFilter, sortKey, sortDir]);

  const pagination = usePagination(filtered);

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function branchMeta(branchId) {
    const id = Number(branchId);
    const fromList = branches.find((b) => Number(getBranchId(b)) === id);
    const name = getBranchLabel(fromList)
      || (Number(userBranchId) === id ? (currentUser?.branch?.name || '') : '');
    return resolveBranchTerritoryGeo({ branchId: id, branchName: name });
  }

  async function applyGeoScope(scope, { preferredBarangayCode = '', preferredBarangayName = '' } = {}) {
    setGeoScope(scope);
    setGeocodeError('');
    const region = PH_REGIONS.find((r) => r.regCode === scope.regCode);
    const provinces = getProvinces(scope.regCode).filter((p) => p.provCode === scope.provCode);
    const cities = getCities(scope.provCode);
    const scopedCities = scope.munCityCode
      ? cities.filter((c) => c.munCityCode === scope.munCityCode)
      : cities;
    const munCityCode = scope.munCityCode || (scopedCities.length === 1 ? scopedCities[0].munCityCode : '');
    const city = scopedCities.find((c) => c.munCityCode === munCityCode) || scopedCities[0] || null;
    const province = provinces[0] || null;

    setRegionOptions(region ? [region] : []);
    setProvinceOptions(provinces);
    setCityOptions(scopedCities);
    setGeoCodes({
      regCode: scope.regCode,
      provCode: scope.provCode,
      munCityCode: munCityCode || '',
    });

    setForm((prev) => ({
      ...prev,
      province_name: province?.provName || prev.province_name || '',
      municipality_name: city?.munCityName || (scope.lockCity ? scope.label : prev.municipality_name) || '',
    }));

    if (!munCityCode) {
      setBarangayOptions([]);
      return;
    }

    setBarangaysLoading(true);
    try {
      const barangays = await getBarangays(munCityCode);
      setBarangayOptions(barangays);
      const match = barangays.find((b) => b.brgyCode === preferredBarangayCode)
        || barangays.find((b) => namesLoose(b.brgyName, preferredBarangayName));
      if (match) {
        const name = String(match.brgyName || '').trim();
        const municipality = city?.munCityName || scope.label || '';
        setForm((prev) => ({
          ...prev,
          barangay_code: match.brgyCode,
          barangay_name: name,
          municipality_name: municipality,
          province_name: province?.provName || prev.province_name,
          territory_name: autoTerritoryName(name, municipality),
        }));
      }
    } finally {
      setBarangaysLoading(false);
    }
  }

  async function openCreate() {
    setEditing(null);
    setErrors({});
    setGeocodeError('');
    const branchId = lockedBranchId || branchFilter || '';
    setForm(emptyForm(branchId));
    setShowForm(true);
    if (branchId) {
      await applyGeoScope(branchMeta(branchId));
    } else {
      setGeoScope(null);
      setGeoCodes({ regCode: '', provCode: '', munCityCode: '' });
      setRegionOptions([]);
      setProvinceOptions([]);
      setCityOptions([]);
      setBarangayOptions([]);
    }
  }

  async function openEdit(row) {
    setEditing(row);
    setErrors({});
    setGeocodeError('');
    setForm({
      territory_name: row.territory_name || row.barangay_name || '',
      branch_id: row.branch_id || '',
      notes: row.coverage_area || '',
      latitude: row.latitude != null ? String(row.latitude) : '',
      longitude: row.longitude != null ? String(row.longitude) : '',
      radius_meters: String(row.radius_meters || DEFAULT_RADIUS),
      barangay_code: row.barangay_code || '',
      barangay_name: row.barangay_name || '',
      municipality_name: row.municipality_name || '',
      province_name: row.province_name || '',
    });
    setShowForm(true);
    setMenuOpenId(null);
    await applyGeoScope(branchMeta(row.branch_id), {
      preferredBarangayCode: row.barangay_code,
      preferredBarangayName: row.barangay_name,
    });
  }

  async function handleBranchChange(branchId) {
    setForm((prev) => ({
      ...emptyForm(branchId),
      notes: prev.notes,
      radius_meters: prev.radius_meters,
      branch_id: branchId,
    }));
    if (!branchId) {
      setGeoScope(null);
      setGeoCodes({ regCode: '', provCode: '', munCityCode: '' });
      setBarangayOptions([]);
      return;
    }
    await applyGeoScope(branchMeta(branchId));
  }

  async function selectCity(munCityCode) {
    const city = cityOptions.find((row) => row.munCityCode === munCityCode);
    setGeoCodes((prev) => ({ ...prev, munCityCode: munCityCode || '' }));
    setForm((prev) => ({
      ...prev,
      barangay_code: '',
      barangay_name: '',
      territory_name: '',
      municipality_name: city?.munCityName || '',
      latitude: '',
      longitude: '',
    }));
    setGeocodeError('');
    if (!munCityCode) {
      setBarangayOptions([]);
      return;
    }
    setBarangaysLoading(true);
    try {
      setBarangayOptions(await getBarangays(munCityCode));
    } finally {
      setBarangaysLoading(false);
    }
  }

  function selectBarangay(brgyCode) {
    const row = barangayOptions.find((b) => b.brgyCode === brgyCode);
    const name = row ? String(row.brgyName || '').trim() : '';
    setForm((prev) => ({
      ...prev,
      barangay_code: row?.brgyCode || '',
      barangay_name: name,
      territory_name: autoTerritoryName(name, prev.municipality_name),
      latitude: '',
      longitude: '',
    }));
    setGeocodeError('');
  }

  async function handleGeocode() {
    if (!form.barangay_name) {
      setGeocodeError('Select a barangay first.');
      return;
    }
    setGeocoding(true);
    setGeocodeError('');
    try {
      const result = await geocodeTerritoryBarangay({
        barangay_code: form.barangay_code,
        barangay_name: form.barangay_name,
        municipality_name: form.municipality_name || geoScope?.label || 'Davao City',
        province_name: form.province_name || 'Davao del Sur',
      });
      if (!result.success || result.data?.latitude == null) {
        setGeocodeError(result.message || 'No match found. Click the map to place the pin.');
        return;
      }
      setForm((prev) => ({
        ...prev,
        latitude: String(Number(result.data.latitude.toFixed?.(7) ?? result.data.latitude)),
        longitude: String(Number(result.data.longitude.toFixed?.(7) ?? result.data.longitude)),
      }));
      showToast?.('Pin placed from barangay. Adjust on the map if needed.', 'success');
    } catch (err) {
      setGeocodeError(err.response?.data?.message || 'Locate failed. Click the map to place the pin.');
    } finally {
      setGeocoding(false);
    }
  }

  function validateClient() {
    const next = {};
    const name = String(form.territory_name || form.barangay_name || '').trim();
    if (!name) next.territory_name = 'Select a barangay so the name can be set';
    const branchId = lockedBranchId || form.branch_id;
    if (!branchId) next.branch_id = 'Required';
    if (!String(form.barangay_name || '').trim()) next.barangay_name = 'Required';
    if (!Number.isFinite(Number(form.latitude)) || !Number.isFinite(Number(form.longitude))) {
      next.latitude = 'Place a map pin (Locate or click the map)';
    }
    if (form.radius_meters !== '' && form.radius_meters != null) {
      const radius = Number(form.radius_meters);
      if (!Number.isFinite(radius) || radius < 100 || radius > 20000) {
        next.radius_meters = 'Coverage zone must be 100–20000 meters when set';
      }
    }
    // Client-side same-barangay guard (server also enforces).
    const dup = (territories || []).find((row) => {
      if (editing && Number(row.territory_id) === Number(editing.territory_id)) return false;
      if (String(row.status || 'Active') !== 'Active') return false;
      if (Number(row.branch_id) !== Number(branchId)) return false;
      if (form.barangay_code && row.barangay_code && String(row.barangay_code) === String(form.barangay_code)) return true;
      return namesLoose(row.barangay_name, form.barangay_name)
        && namesLoose(row.municipality_name, form.municipality_name);
    });
    if (dup) {
      next.barangay_name = `Already covered by “${dup.territory_name}”. Deactivate it first or pick another barangay.`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (!validateClient()) {
      showToast?.('Complete the required territory fields.', 'error');
      return;
    }
    const name = String(form.territory_name || form.barangay_name).trim();
    const payload = {
      territory_name: name,
      branch_id: Number(lockedBranchId || form.branch_id),
      status: 'Active',
      notes: form.notes.trim() || null,
      coverage_area: form.notes.trim() || null,
      latitude: Number(form.latitude),
      longitude: Number(form.longitude),
      radius_meters: form.radius_meters === '' || form.radius_meters == null
        ? DEFAULT_RADIUS
        : Number(form.radius_meters),
      barangay_code: form.barangay_code || null,
      barangay_name: form.barangay_name.trim(),
      municipality_name: form.municipality_name || null,
      province_name: form.province_name || null,
      default_sales_agent_id: null,
      default_collector_id: null,
    };

    setSubmitting(true);
    try {
      const result = editing
        ? await updateTerritory(editing.territory_id, payload)
        : await createTerritory(payload);
      if (!result.success) {
        showToast?.(result.message || 'Failed to save territory.', 'error');
        return;
      }
      showToast?.(result.message || (editing ? 'Territory updated.' : 'Territory created.'), 'success');
      setShowForm(false);
      setEditing(null);
      await loadTerritories();
    } catch (err) {
      showToast?.(err.response?.data?.message || 'Failed to save territory.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function openDeactivate(row) {
    setMenuOpenId(null);
    setDeactivateRow(row);
    setDeactivateDeps(null);
    setDeactivateLoading(true);
    try {
      const res = await fetchTerritoryDependencies(row.territory_id);
      if (res.success) setDeactivateDeps(res.data);
      else showToast?.(res.message || 'Could not load dependencies.', 'error');
    } catch (err) {
      showToast?.(err.response?.data?.message || 'Could not load dependencies.', 'error');
    } finally {
      setDeactivateLoading(false);
    }
  }

  async function confirmDeactivate() {
    if (!deactivateRow) return;
    setDeactivateSubmitting(true);
    try {
      const result = await deleteTerritory(deactivateRow.territory_id);
      if (!result.success) {
        showToast?.(result.message || 'Failed to deactivate territory.', 'error');
        return;
      }
      showToast?.(result.message || 'Territory deactivated.', 'success');
      setDeactivateRow(null);
      await loadTerritories();
    } catch (err) {
      showToast?.(err.response?.data?.message || 'Failed to deactivate territory.', 'error');
    } finally {
      setDeactivateSubmitting(false);
    }
  }

  function openCustomers(row) {
    if (!navigate || !resolvedOpsBase) return;
    navigate(`${resolvedOpsBase}/customers?territory=${encodeURIComponent(row.territory_id)}`);
  }

  function sortLabel(key, label) {
    const active = sortKey === key;
    return (
      <button
        type="button"
        className="button ghost"
        style={{ padding: 0, fontWeight: 600 }}
        onClick={() => toggleSort(key)}
      >
        {label}{active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
      </button>
    );
  }

  return (
    <div className="page">
      <section className="panel content-panel relative overflow-hidden mb-4">
        <div className="list-section-header">
          <div>
            <h3>Branch Territories</h3>
            <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
              Permanent barangay coverage zones with map pins. Daily staffing is assigned in Field Operations.
            </p>
          </div>
          <button className="button" type="button" onClick={openCreate}>
            New Territory
          </button>
        </div>

        <div className="list-section-controls" style={{ flexWrap: 'wrap', gap: 8 }}>
          <input
            className="filter-input"
            type="search"
            placeholder="Search name, barangay, notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Status filter"
          >
            <option value="all">All statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
          {canListAllBranches ? (
            <select
              className="filter-select"
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              aria-label="Branch filter"
            >
              <option value="">All branches</option>
              {branches.map((branch) => (
                <option key={getBranchId(branch)} value={getBranchId(branch)}>
                  {getBranchLabel(branch)}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </section>

      <section className="panel content-panel relative overflow-hidden">
        {loading ? (
          <p className="muted">Loading territories…</p>
        ) : !filtered.length ? (
          <EmptyState
            title="No territories found"
            description="Create an Active territory with a barangay and map pin."
            actionLabel="New Territory"
            onAction={openCreate}
          />
        ) : (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>{sortLabel('name', 'Territory')}</th>
                    <th>{sortLabel('barangay', 'Barangay')}</th>
                    {canListAllBranches ? <th>{sortLabel('branch', 'Branch')}</th> : null}
                    <th>{sortLabel('customers', 'Customers')}</th>
                    <th>{sortLabel('overdue', 'Overdue')}</th>
                    <th>Coverage</th>
                    <th>{sortLabel('status', 'Status')}</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {pagination.paginatedData.map((row) => (
                    <tr key={row.territory_id}>
                      <td>
                        <strong>{row.territory_name}</strong>
                        {row.coverage_area ? (
                          <div className="text-ink/70" style={{ fontSize: '0.85rem' }}>{row.coverage_area}</div>
                        ) : null}
                      </td>
                      <td>
                        {row.barangay_name || '—'}
                        {row.municipality_name ? (
                          <div className="text-ink/70" style={{ fontSize: '0.85rem' }}>{row.municipality_name}</div>
                        ) : null}
                      </td>
                      {canListAllBranches ? <td>{row.branch_name || '—'}</td> : null}
                      <td>
                        {navigate && resolvedOpsBase ? (
                          <button
                            type="button"
                            className="button ghost"
                            style={{ padding: 0 }}
                            onClick={() => openCustomers(row)}
                          >
                            {row.customer_count ?? 0}
                          </button>
                        ) : (row.customer_count ?? 0)}
                      </td>
                      <td>{row.overdue_customer_count ?? 0}</td>
                      <td>
                        {formatRadiusLabel(row.radius_meters)}
                        <div className="text-ink/70" style={{ fontSize: '0.85rem' }}>
                          {row.map_location || (row.latitude != null ? 'Pin Set' : 'Missing')}
                        </div>
                      </td>
                      <td><StatusBadge status={row.status || 'Active'} /></td>
                      <td style={{ position: 'relative' }}>
                        <div ref={menuOpenId === row.territory_id ? menuRef : null}>
                          <button
                            type="button"
                            className="button ghost"
                            aria-label="Territory actions"
                            aria-expanded={menuOpenId === row.territory_id}
                            onClick={() => setMenuOpenId((id) => (id === row.territory_id ? null : row.territory_id))}
                          >
                            ⋮
                          </button>
                          {menuOpenId === row.territory_id ? (
                            <div
                              className="panel"
                              style={{
                                position: 'absolute',
                                right: 0,
                                top: '100%',
                                zIndex: 20,
                                minWidth: 160,
                                padding: 8,
                                boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                              }}
                            >
                              <button
                                type="button"
                                className="button ghost"
                                style={{ display: 'block', width: '100%', textAlign: 'left' }}
                                onClick={() => openEdit(row)}
                              >
                                Edit
                              </button>
                              {String(row.status || 'Active') === 'Active' ? (
                                <button
                                  type="button"
                                  className="button ghost"
                                  style={{ display: 'block', width: '100%', textAlign: 'left' }}
                                  onClick={() => openDeactivate(row)}
                                >
                                  Deactivate
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination {...pagination} />
          </>
        )}
      </section>

      <TerritoryFormModal
        open={showForm}
        editing={editing}
        form={form}
        setForm={setForm}
        errors={errors}
        submitting={submitting}
        geocoding={geocoding}
        geocodeError={geocodeError}
        isBranchManager={isBranchManager}
        currentUser={currentUser}
        userBranchId={userBranchId}
        branches={branches}
        geoScope={geoScope}
        geoCodes={geoCodes}
        regionOptions={regionOptions}
        provinceOptions={provinceOptions}
        cityOptions={cityOptions}
        barangayOptions={barangayOptions}
        barangaysLoading={barangaysLoading}
        onBranchChange={handleBranchChange}
        onSelectCity={selectCity}
        onSelectBarangay={selectBarangay}
        onGeocode={handleGeocode}
        onClose={() => { setShowForm(false); setEditing(null); }}
        onSubmit={handleSubmit}
      />

      <DeactivateModal
        open={Boolean(deactivateRow)}
        row={deactivateRow}
        deps={deactivateDeps}
        loading={deactivateLoading}
        submitting={deactivateSubmitting}
        onClose={() => setDeactivateRow(null)}
        onConfirm={confirmDeactivate}
      />
    </div>
  );
}
