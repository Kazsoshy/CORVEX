import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useState } from 'react';
import apiClient from '../../api/apiClient';
import { geocodeTerritoryBarangay } from '../../api/territoriesService';
import { Pagination } from '../shared/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { DetailRowsTable } from '../shared/DetailRowsTable';
import { RowActionsMenu } from '../shared/RowActionMenu';
import { StatusBadge } from '../StatusBadge';
import { Stats } from '../shared/StatsGrid';
import LeafletMap from '../common/LeafletMap';
import {
  getRegions,
  getProvinces,
  getCities,
  getBarangays,
  resolveAddressSelection,
} from '../../utils/phAddress.js';
import { formatDisplayDateTime, formatPhone } from '../../utils/formatters.js';

const DEFAULT_ADMIN_BASE = '/operating-manager/admin';

const EMPTY_BRANCH_FORM = {
  branch_name: '',
  address_street: '',
  address_barangay: '',
  address_city: '',
  address_province: '',
  address_region: '',
  address_zip: '',
  latitude: '',
  longitude: '',
  contact_no: '',
  email: '',
};

function BranchMapPinPicker({ latitude, longitude, onChange, warning }) {
  const hasPin = Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));
  const center = hasPin ? [Number(latitude), Number(longitude)] : [7.0731, 125.6128];

  const setPin = ({ lat, lng }) => {
    onChange?.({
      latitude: String(Number(lat).toFixed(7)),
      longitude: String(Number(lng).toFixed(7)),
    });
  };

  return (
    <div className="customer-map-picker">
      <p className="muted" style={{ marginTop: 0 }}>
        {hasPin
          ? 'Pin set. Drag the marker or click the map to correct the location. Coordinates are filled automatically.'
          : 'Search or pick a barangay, then Locate — or click the map to place the branch pin.'}
      </p>
      <LeafletMap
        center={center}
        zoom={hasPin ? 15 : 11}
        height={280}
        showFullscreen
        pinStatusLabel={hasPin ? 'Branch pin set' : 'No pin yet'}
        onMapClick={setPin}
        markers={hasPin ? [{
          id: 'branch-pin',
          position: center,
          draggable: true,
          onDragEnd: setPin,
          color: 'var(--text)',
          popup: 'Branch location',
        }] : []}
      />
      {!hasPin ? <p className="form-error" style={{ marginTop: 8 }}>A map pin is required before saving.</p> : null}
      {hasPin ? (
        <p className="muted" style={{ marginTop: 8, fontSize: '0.82rem' }}>
          Location locked from map · lat {Number(latitude).toFixed(5)}, lng {Number(longitude).toFixed(5)}
          {' · '}
          <button
            type="button"
            className="button ghost"
            style={{ padding: 0, minHeight: 0, height: 'auto' }}
            onClick={() => {
              warning?.('Cleared pin. Place a new location on the map.');
              onChange?.({ latitude: '', longitude: '' });
            }}
          >
            Clear pin
          </button>
        </p>
      ) : null}
    </div>
  );
}

function BranchAddressForm({ form, setForm, errors, showToast }) {
  const [geoCodes, setGeoCodes] = useState({ regCode: '', provCode: '', munCityCode: '' });
  const [barangayOptions, setBarangayOptions] = useState([]);
  const [barangaysLoading, setBarangaysLoading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState('');

  const regionOptions = useMemo(() => getRegions(), []);
  const provinceOptions = useMemo(() => getProvinces(geoCodes.regCode), [geoCodes.regCode]);
  const cityOptions = useMemo(() => getCities(geoCodes.provCode), [geoCodes.provCode]);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      const resolved = await resolveAddressSelection({
        address_region: form.address_region,
        address_province: form.address_province,
        address_city: form.address_city,
        address_barangay: form.address_barangay,
      });
      if (cancelled) return;
      setGeoCodes({
        regCode: resolved.regCode || '',
        provCode: resolved.provCode || '',
        munCityCode: resolved.munCityCode || '',
      });
    }
    hydrate();
    return () => { cancelled = true; };
  }, [form.address_region, form.address_province, form.address_city, form.address_barangay]);

  useEffect(() => {
    let cancelled = false;
    async function loadBarangays() {
      if (!geoCodes.munCityCode) {
        setBarangayOptions([]);
        return;
      }
      setBarangaysLoading(true);
      try {
        const rows = await getBarangays(geoCodes.munCityCode);
        if (!cancelled) setBarangayOptions(rows);
      } finally {
        if (!cancelled) setBarangaysLoading(false);
      }
    }
    loadBarangays();
    return () => { cancelled = true; };
  }, [geoCodes.munCityCode]);

  const update = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const onSelectRegion = (regCode) => {
    const region = regionOptions.find((r) => r.regCode === regCode);
    setGeoCodes({ regCode, provCode: '', munCityCode: '' });
    update({
      address_region: region?.regionName || '',
      address_province: '',
      address_city: '',
      address_barangay: '',
      latitude: '',
      longitude: '',
    });
  };

  const onSelectProvince = (provCode) => {
    const province = provinceOptions.find((r) => r.provCode === provCode);
    setGeoCodes((prev) => ({ ...prev, provCode, munCityCode: '' }));
    update({
      address_province: province?.provName || '',
      address_city: '',
      address_barangay: '',
      latitude: '',
      longitude: '',
    });
  };

  const onSelectCity = (munCityCode) => {
    const city = cityOptions.find((r) => r.munCityCode === munCityCode);
    setGeoCodes((prev) => ({ ...prev, munCityCode }));
    update({
      address_city: city?.munCityName || '',
      address_barangay: '',
      latitude: '',
      longitude: '',
    });
  };

  const onSelectBarangay = (brgyName) => {
    update({
      address_barangay: brgyName,
      latitude: '',
      longitude: '',
    });
  };

  const locate = async () => {
    if (!form.address_barangay || !form.address_city) {
      setGeocodeError('Select city and barangay first.');
      return;
    }
    setGeocoding(true);
    setGeocodeError('');
    try {
      const result = await geocodeTerritoryBarangay({
        barangay_name: form.address_barangay,
        municipality_name: form.address_city,
        province_name: form.address_province,
      });
      if (!result.success || result.data?.latitude == null) {
        setGeocodeError(result.message || 'No match found. Click the map to place the pin.');
        return;
      }
      update({
        latitude: String(Number(result.data.latitude.toFixed?.(7) ?? result.data.latitude)),
        longitude: String(Number(result.data.longitude.toFixed?.(7) ?? result.data.longitude)),
      });
    } catch (err) {
      setGeocodeError(err.response?.data?.message || 'Locate failed. Click the map to place the pin.');
    } finally {
      setGeocoding(false);
    }
  };

  return (
    <>
      <fieldset className="user-form-section">
        <legend>Address</legend>
        <div className="grid two-up">
          <div className="form-group">
            <label htmlFor="bf-region">Region *</label>
            <select
              id="bf-region"
              className="filter-select"
              value={geoCodes.regCode}
              onChange={(e) => onSelectRegion(e.target.value)}
            >
              <option value="">Select region</option>
              {regionOptions.map((row) => (
                <option key={row.regCode} value={row.regCode}>{row.regionName}</option>
              ))}
            </select>
            {errors.address_region ? <p className="form-error">{errors.address_region}</p> : null}
          </div>
          <div className="form-group">
            <label htmlFor="bf-province">Province *</label>
            <select
              id="bf-province"
              className="filter-select"
              value={geoCodes.provCode}
              onChange={(e) => onSelectProvince(e.target.value)}
              disabled={!geoCodes.regCode}
            >
              <option value="">Select province</option>
              {provinceOptions.map((row) => (
                <option key={row.provCode} value={row.provCode}>{row.provName}</option>
              ))}
            </select>
            {errors.address_province ? <p className="form-error">{errors.address_province}</p> : null}
          </div>
          <div className="form-group">
            <label htmlFor="bf-city">City / Municipality *</label>
            <select
              id="bf-city"
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
            {errors.address_city ? <p className="form-error">{errors.address_city}</p> : null}
          </div>
          <div className="form-group">
            <label htmlFor="bf-barangay">Barangay *</label>
            <select
              id="bf-barangay"
              className="filter-select"
              value={form.address_barangay}
              onChange={(e) => onSelectBarangay(e.target.value)}
              disabled={!geoCodes.munCityCode || barangaysLoading}
            >
              <option value="">{barangaysLoading ? 'Loading…' : 'Select barangay'}</option>
              {barangayOptions.map((row) => (
                <option key={row.brgyCode} value={String(row.brgyName || '').trim()}>
                  {String(row.brgyName || '').trim()}
                </option>
              ))}
            </select>
            {errors.address_barangay ? <p className="form-error">{errors.address_barangay}</p> : null}
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="bf-street">Street / Sitio / Landmark</label>
            <input
              id="bf-street"
              value={form.address_street}
              onChange={(e) => update({ address_street: e.target.value })}
              placeholder="Building, street, or landmark"
            />
          </div>
          <div className="form-group">
            <label htmlFor="bf-zip">Postal / ZIP Code</label>
            <input
              id="bf-zip"
              value={form.address_zip}
              onChange={(e) => update({ address_zip: e.target.value })}
              placeholder="Optional"
            />
          </div>
        </div>
        <div className="flex gap-2" style={{ marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            className="button secondary"
            type="button"
            disabled={!form.address_barangay || geocoding}
            onClick={locate}
          >
            {geocoding ? 'Locating…' : 'Locate on map'}
          </button>
          {geocodeError ? <span className="form-error" style={{ margin: 0 }}>{geocodeError}</span> : null}
        </div>
      </fieldset>

      <fieldset className="user-form-section">
        <legend>Map Location *</legend>
        <BranchMapPinPicker
          latitude={form.latitude}
          longitude={form.longitude}
          onChange={({ latitude, longitude }) => update({ latitude, longitude })}
          warning={(message) => showToast?.(message, 'error')}
        />
        {errors.latitude ? <p className="form-error">{errors.latitude}</p> : null}
      </fieldset>
    </>
  );
}

function validateBranchForm(form) {
  const errors = {};
  if (!form.branch_name.trim()) errors.branch_name = 'Branch name is required.';
  if (!form.address_region) errors.address_region = 'Region is required.';
  if (!form.address_province) errors.address_province = 'Province is required.';
  if (!form.address_city) errors.address_city = 'City / municipality is required.';
  if (!form.address_barangay) errors.address_barangay = 'Barangay is required.';
  if (!Number.isFinite(Number(form.latitude)) || !Number.isFinite(Number(form.longitude))) {
    errors.latitude = 'Place a map pin for this branch.';
  }
  if (!form.contact_no.trim()) errors.contact_no = 'Contact number is required.';
  if (!form.email.trim()) errors.email = 'Email is required.';
  return errors;
}

function toBranchPayload(form) {
  return {
    branch_name: form.branch_name.trim(),
    address_street: form.address_street.trim() || null,
    address_barangay: form.address_barangay.trim(),
    address_city: form.address_city.trim(),
    address_province: form.address_province.trim(),
    address_region: form.address_region.trim(),
    address_zip: form.address_zip.trim() || null,
    latitude: Number(form.latitude),
    longitude: Number(form.longitude),
    contact_no: form.contact_no.trim(),
    email: form.email.trim(),
  };
}

function formFromBranch(branch) {
  return {
    branch_name: branch.branch_name || '',
    address_street: branch.address_street || '',
    address_barangay: branch.address_barangay || '',
    address_city: branch.address_city || '',
    address_province: branch.address_province || '',
    address_region: branch.region || branch.address_region || '',
    address_zip: branch.address_zip || '',
    latitude: branch.latitude != null ? String(branch.latitude) : '',
    longitude: branch.longitude != null ? String(branch.longitude) : '',
    contact_no: branch.contact_no || branch.phone || '',
    email: branch.email || '',
  };
}

function BranchFormModal({
  title,
  initial,
  branchCode,
  saving,
  onCancel,
  onSubmit,
  showToast,
}) {
  const [form, setForm] = useState(initial || EMPTY_BRANCH_FORM);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    setForm(initial || EMPTY_BRANCH_FORM);
    setErrors({});
  }, [initial]);

  const handleSubmit = (event) => {
    event.preventDefault();
    const nextErrors = validateBranchForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    onSubmit(toBranchPayload(form));
  };

  return createPortal(
    <div className="modal-overlay" onClick={() => !saving && onCancel()}>
      <div
        className="modal-content modal-content--wide"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
      >
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        {branchCode ? (
          <p className="muted" style={{ marginTop: 0 }}>
            Branch Code <strong style={{ fontFamily: 'monospace' }}>{branchCode}</strong> is permanent and cannot be changed.
          </p>
        ) : (
          <p className="muted" style={{ marginTop: 0 }}>
            A Branch Code (for example BR-00001) is assigned automatically when you save — the same idea as a product SKU.
          </p>
        )}
        <form onSubmit={handleSubmit}>
          <fieldset className="user-form-section">
            <legend>Branch Identity</legend>
            <div className="form-group">
              <label htmlFor="bf-name">Branch Name *</label>
              <input
                id="bf-name"
                value={form.branch_name}
                onChange={(e) => setForm((prev) => ({ ...prev, branch_name: e.target.value }))}
                required
              />
              {errors.branch_name ? <p className="form-error">{errors.branch_name}</p> : null}
            </div>
            <div className="grid two-up">
              <div className="form-group">
                <label htmlFor="bf-phone">Contact Number *</label>
                <input
                  id="bf-phone"
                  value={form.contact_no}
                  onChange={(e) => setForm((prev) => ({ ...prev, contact_no: e.target.value }))}
                  placeholder="09XX XXX XXXX"
                  required
                />
                {errors.contact_no ? <p className="form-error">{errors.contact_no}</p> : null}
              </div>
              <div className="form-group">
                <label htmlFor="bf-email">Email *</label>
                <input
                  id="bf-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  required
                />
                {errors.email ? <p className="form-error">{errors.email}</p> : null}
              </div>
            </div>
          </fieldset>

          <BranchAddressForm form={form} setForm={setForm} errors={errors} showToast={showToast} />

          <p className="muted" style={{ fontSize: '0.85rem' }}>
            Operational status is managed by branch policies and recorded operations (suspension or cessation), not by a manual Active/Inactive toggle on this form.
          </p>

          <div className="modal-actions">
            <button type="button" className="button secondary" disabled={saving} onClick={onCancel}>Cancel</button>
            <button type="submit" className="button" disabled={saving}>
              {saving ? 'Saving…' : 'Save Branch'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

export function BranchListPage({ navigate, showToast, adminBase = DEFAULT_ADMIN_BASE }) {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [branchFormOpen, setBranchFormOpen] = useState(false);
  const [branchForm, setBranchForm] = useState(EMPTY_BRANCH_FORM);
  const [editingBranch, setEditingBranch] = useState(null);
  const [savingBranch, setSavingBranch] = useState(false);
  const pagination = usePagination(branches);
  const paginatedBranches = pagination.paginatedData;

  const loadBranches = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/branches');
      if (response.data.success) {
        setBranches(response.data.data || []);
        setError(null);
      } else {
        setError(response.data.message || 'Failed to load branches');
      }
    } catch (err) {
      console.error('Error fetching branches:', err);
      setError('Failed to load branches');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  const openCreateBranch = () => {
    setEditingBranch(null);
    setBranchForm(EMPTY_BRANCH_FORM);
    setBranchFormOpen(true);
  };

  const openEditBranch = (branch) => {
    setEditingBranch(branch);
    setBranchForm(formFromBranch(branch));
    setBranchFormOpen(true);
  };

  const openViewBranch = (branch) => {
    navigate(`${adminBase}/branches/${branch.branch_id}`);
  };

  const saveBranch = async (payload) => {
    setSavingBranch(true);
    try {
      if (editingBranch?.branch_id) {
        await apiClient.put(`/branches/${editingBranch.branch_id}`, payload);
        showToast('Branch updated.', 'success');
      } else {
        const res = await apiClient.post('/branches', payload);
        const code = res.data?.data?.branch_code;
        showToast(code ? `Branch created (${code}).` : 'Branch created.', 'success');
      }
      setBranchFormOpen(false);
      setEditingBranch(null);
      loadBranches();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to save branch.', 'error');
    } finally {
      setSavingBranch(false);
    }
  };

  if (loading) {
    return <div className="page"><LoadingState message="Loading branches..." /></div>;
  }
  if (error) {
    return (
      <div className="page">
        <section className="panel content-panel relative overflow-hidden">
          <div className="list-section-header"><h3>All Branches</h3></div>
          <div style={{ padding: 40, textAlign: 'center', color: '#dc2626' }}>{error}</div>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <div>
            <h3>
              All Branches{' '}
              <span className="text-ink/70" style={{ fontWeight: 400, fontSize: '0.88rem' }}>
                ({branches.length})
              </span>
            </h3>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.88rem' }}>
              Branch Codes are system-generated. Status follows configured branch policies and recorded operations.
            </p>
          </div>
          <button className="button" type="button" onClick={openCreateBranch}>+ Add Branch</button>
        </div>

        <div className="corvex-table-wrapper">
          <table className="corvex-table corvex-table-branches">
            <thead>
              <tr>
                <th className="cell-name">Branch</th>
                <th className="cell-address">Address</th>
                <th className="cell-contact">Contact</th>
                <th className="cell-status">Status</th>
                <th className="cell-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {branches.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
                    No branches found
                  </td>
                </tr>
              ) : paginatedBranches.map((b) => (
                <tr
                  key={b.branch_id}
                  className="clickable-row"
                  onClick={() => openViewBranch(b)}
                >
                  <td className="cell-name">
                    <strong>{b.branch_name}</strong>
                    <span className="user-meta-id" style={{ fontFamily: 'monospace' }}>
                      {b.branch_code || '—'}
                    </span>
                  </td>
                  <td className="cell-address" title={b.address}>{b.address || '—'}</td>
                  <td
                    className="cell-contact"
                    title={[formatPhone(b.contact_no || b.phone), b.email].filter(Boolean).join(' · ')}
                  >
                    <span className="contact-phone">{formatPhone(b.contact_no || b.phone)}</span>
                    {b.email ? <span className="user-meta-id">{b.email}</span> : null}
                  </td>
                  <td className="cell-status">
                    <StatusBadge status={b.status} />
                    {b.operations_state && b.operations_state !== 'operating' ? (
                      <span className="user-meta-id" style={{ display: 'block' }}>
                        {b.operations_state}
                      </span>
                    ) : null}
                  </td>
                  <td className="table-actions cell-actions" onClick={(e) => e.stopPropagation()}>
                    <RowActionsMenu
                      label={`Actions for ${b.branch_name}`}
                      items={[
                        { key: 'view', label: 'View Details', onSelect: () => openViewBranch(b) },
                        { key: 'edit', label: 'Edit Branch', onSelect: () => openEditBranch(b) },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination {...pagination} />
      </section>

      {branchFormOpen ? (
        <BranchFormModal
          title={editingBranch ? 'Edit Branch' : 'Add Branch'}
          initial={branchForm}
          branchCode={editingBranch?.branch_code || null}
          saving={savingBranch}
          onCancel={() => { if (!savingBranch) { setBranchFormOpen(false); setEditingBranch(null); } }}
          onSubmit={saveBranch}
          showToast={showToast}
        />
      ) : null}
    </div>
  );
}

export function BranchDetailPage({
  branchId,
  navigate,
  showToast,
  adminBase = DEFAULT_ADMIN_BASE,
}) {
  const [branch, setBranch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [managers, setManagers] = useState([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [managerId, setManagerId] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [branchForm, setBranchForm] = useState(EMPTY_BRANCH_FORM);
  const [opsOpen, setOpsOpen] = useState(false);
  const [opsState, setOpsState] = useState('suspended');
  const [opsReason, setOpsReason] = useState('');
  const [opsBusy, setOpsBusy] = useState(false);
  const [savingBranch, setSavingBranch] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [branchRes, usersRes] = await Promise.all([
        apiClient.get(`/branches/${branchId}`),
        apiClient.get('/users?role=branch_manager&status=Active&limit=100'),
      ]);
      if (branchRes.data.success) {
        setBranch(branchRes.data.data);
        setManagerId(branchRes.data.data.manager_id ? String(branchRes.data.data.manager_id) : '');
      } else {
        setBranch(null);
      }
      if (usersRes.data.success) setManagers(usersRes.data.data || []);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to load branch.', 'error');
      setBranch(null);
    }
    setLoading(false);
  }, [branchId, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const staff = branch?.staff || [];
  const pagination_branchUsers = usePagination(staff);
  const paginated_branchUsers = pagination_branchUsers.paginatedData;
  const hasManager = Boolean(branch?.manager_id);

  if (loading) return <LoadingState message="Loading branch…" />;
  if (!branch) {
    return (
      <EmptyState
        title="Branch not found"
        actionLabel="Back"
        onAction={() => navigate(`${adminBase}/branches`)}
      />
    );
  }

  const assignManager = async () => {
    try {
      await apiClient.put(`/branches/${branchId}`, { manager_id: managerId ? Number(managerId) : null });
      showToast('Branch manager assigned.', 'success');
      setAssignOpen(false);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to assign manager.', 'error');
    }
  };

  const openEdit = () => {
    setBranchForm(formFromBranch(branch));
    setEditOpen(true);
  };

  const saveEdit = async (payload) => {
    setSavingBranch(true);
    try {
      await apiClient.put(`/branches/${branchId}`, payload);
      showToast('Branch updated.', 'success');
      setEditOpen(false);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update branch.', 'error');
    } finally {
      setSavingBranch(false);
    }
  };

  const submitOperations = async () => {
    if (opsBusy) return;
    setOpsBusy(true);
    try {
      await apiClient.post(`/branches/${branchId}/operations`, {
        operations_state: opsState,
        reason: opsReason.trim(),
      });
      showToast('Branch operations state recorded.', 'success');
      setOpsOpen(false);
      setOpsReason('');
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to record operations state.', 'error');
    } finally {
      setOpsBusy(false);
    }
  };

  const detailRows = [
    { key: 'code', label: 'Branch Code', value: <span style={{ fontFamily: 'monospace' }}>{branch.branch_code || '—'}</span> },
    { key: 'name', label: 'Branch Name', value: branch.branch_name || '—' },
    { key: 'address', label: 'Complete Address', value: branch.address || '—' },
    { key: 'street', label: 'Street / Landmark', value: branch.address_street || '—' },
    { key: 'barangay', label: 'Barangay', value: branch.address_barangay || '—' },
    { key: 'city', label: 'City / Municipality', value: branch.address_city || '—' },
    { key: 'province', label: 'Province', value: branch.address_province || '—' },
    { key: 'region', label: 'Region', value: branch.region || '—' },
    { key: 'zip', label: 'Postal Code', value: branch.address_zip || '—' },
    { key: 'contact', label: 'Contact No', value: formatPhone(branch.contact_no || branch.phone) },
    { key: 'email', label: 'Email', value: branch.email || '—' },
    {
      key: 'status',
      label: 'Operational Status',
      value: (
        <span>
          <StatusBadge status={branch.status} />
          {branch.operations_state ? ` · ${branch.operations_state}` : ''}
        </span>
      ),
    },
    { key: 'status_reason', label: 'Status Reason', value: branch.status_reason || '—' },
    { key: 'status_changed', label: 'Status Changed', value: formatDisplayDateTime(branch.status_changed_at) },
    { key: 'last_activity', label: 'Last Qualifying Activity', value: formatDisplayDateTime(branch.last_activity_at) },
    {
      key: 'manager',
      label: 'Assigned Branch Manager',
      value: branch.manager_name
        ? `${branch.manager_name}${branch.manager_employee_id ? ` (${branch.manager_employee_id})` : ''}`
        : 'Unassigned',
    },
    { key: 'created', label: 'Created', value: formatDisplayDateTime(branch.created_at) },
  ];

  return (
    <div className="page">
      <section className="panel dashboard-greeting">
        <div className="flex flex-col gap-1">
          <p className="text-[0.82rem] font-bold tracking-widest uppercase text-navy/60 m-0">
            {branch.branch_code || 'Branch'}
          </p>
          <h2>{branch.branch_name}</h2>
          <p className="text-ink/70">
            {branch.address || 'No address on file'}
          </p>
          <p className="muted" style={{ marginTop: 4, fontSize: '0.85rem' }}>
            <StatusBadge status={branch.status} />
            {branch.operations_state && branch.operations_state !== 'operating'
              ? ` · ${branch.operations_state}`
              : ''}
            {branch.manager_name ? ` · Manager: ${branch.manager_name}` : ' · No Branch Manager assigned'}
          </p>
        </div>
      </section>

      <Stats stats={[
        { label: 'Active Staff', value: String(staff.length) },
        { label: 'Customers', value: String(branch.customers?.active ?? branch.customers?.total ?? 0) },
        {
          label: 'Branch Manager',
          value: hasManager ? 'Assigned' : 'Vacant',
        },
      ]} />

      <section className="panel content-panel relative overflow-hidden" style={{ marginBottom: 16 }}>
        <div className="list-section-header">
          <h3>Branch Administration</h3>
        </div>
        <DetailRowsTable rows={detailRows} />
        <div className="flex justify-end gap-2 mt-6" style={{ flexWrap: 'wrap' }}>
          <button className="button ghost" type="button" onClick={() => navigate(`${adminBase}/branches`)}>Back</button>
          <button className="button secondary" type="button" onClick={() => {
            setOpsState(branch.operations_state === 'operating' ? 'suspended' : 'operating');
            setOpsReason('');
            setOpsOpen(true);
          }}>
            Record Operations
          </button>
          {!hasManager ? (
            <button className="button secondary" type="button" onClick={() => setAssignOpen(true)}>
              Assign Manager
            </button>
          ) : null}
          <button className="button" type="button" onClick={openEdit}>Edit Branch</button>
        </div>
      </section>

      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header"><h3>Branch Users</h3></div>
        {staff.length ? (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr><th>Employee ID</th><th>Name</th><th>Role</th><th>Status</th><th>Email</th></tr>
                </thead>
                <tbody>
                  {paginated_branchUsers.map((u) => (
                    <tr key={u.id}>
                      <td style={{ fontFamily: 'monospace' }}>{u.employee_id || '—'}</td>
                      <td>{u.full_name}</td>
                      <td>{u.role_name}</td>
                      <td><StatusBadge status={u.status} /></td>
                      <td>{u.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination {...pagination_branchUsers} />
          </>
        ) : (
          <EmptyState title="No active staff" description="Assign users to this branch in User Management." />
        )}
      </section>

      {assignOpen && !hasManager ? createPortal(
        <div className="modal-overlay" onClick={() => setAssignOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3>Assign Branch Manager</h3>
            <p className="muted" style={{ fontSize: '0.88rem' }}>
              Only one active Branch Manager should be linked to a branch.
            </p>
            <select
              className="filter-select"
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
              style={{ width: '100%', marginBottom: 16 }}
            >
              <option value="">— Select manager —</option>
              {managers.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.first_name} {m.last_name}{m.employee_id ? ` (${m.employee_id})` : ''}
                </option>
              ))}
            </select>
            <div className="modal-actions">
              <button type="button" className="button secondary" onClick={() => setAssignOpen(false)}>Cancel</button>
              <button type="button" className="button" onClick={assignManager} disabled={!managerId}>Save</button>
            </div>
          </div>
        </div>,
        document.body
      ) : null}

      {opsOpen ? createPortal(
        <div className="modal-overlay" onClick={() => !opsBusy && setOpsOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h3>Record Branch Operations</h3>
            <p className="muted" style={{ fontSize: '0.88rem' }}>
              Use this when the branch formally suspends or ceases operations. Prolonged inactivity is handled separately by System Configuration policies — do not invent cessation without a real record.
            </p>
            <div className="form-group">
              <label htmlFor="ops-state">Operations state</label>
              <select
                id="ops-state"
                className="filter-select"
                value={opsState}
                onChange={(e) => setOpsState(e.target.value)}
              >
                <option value="operating">Operating (resume)</option>
                <option value="suspended">Suspended</option>
                <option value="ceased">Ceased</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="ops-reason">Reason {opsState !== 'operating' ? '*' : ''}</label>
              <textarea
                id="ops-reason"
                rows={3}
                value={opsReason}
                onChange={(e) => setOpsReason(e.target.value)}
                placeholder="e.g. Temporary suspension pending lease renewal; documented by OM on …"
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="button secondary" disabled={opsBusy} onClick={() => setOpsOpen(false)}>Cancel</button>
              <button
                type="button"
                className="button"
                disabled={opsBusy || (opsState !== 'operating' && opsReason.trim().length < 5)}
                onClick={submitOperations}
              >
                {opsBusy ? 'Saving…' : 'Save Record'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      ) : null}

      {editOpen ? (
        <BranchFormModal
          title="Edit Branch"
          initial={branchForm}
          branchCode={branch.branch_code}
          saving={savingBranch}
          onCancel={() => { if (!savingBranch) setEditOpen(false); }}
          onSubmit={saveEdit}
          showToast={showToast}
        />
      ) : null}
    </div>
  );
}
