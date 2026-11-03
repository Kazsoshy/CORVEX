import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  createCustomer,
  fetchCustomerById,
  fetchCustomers,
  updateCustomer,
} from '../../api/salesService';
import { lookupCustomersForDuplicate } from '../../api/customerPortalService';
import { getCurrentUser, getUserAssignedLocation } from '../../api/authService.js';
import {
  CIVIL_STATUS_OPTIONS,
  CONTACT_RELATIONSHIP_OPTIONS,
  composeCustomerAddress,
  formatContactPersonName,
  formatCustomerDisplayId,
  formatCustomerFullName,
  formatSecondaryContactName,
} from '../../utils/customerDisplay';
import {
  getBarangays,
  getCities,
  getProvinces,
  getRegions,
  resolveAddressSelection,
} from '../../utils/phAddress';
import { openExternalNavigation } from '../../utils/mapsNavigation';
import { formatCurrency, formatDisplayDate } from '../../data/salesMockData';
import { useServerPagination, DEFAULT_PAGE_SIZE } from '../../hooks/usePagination';
import LeafletMap from '../common/LeafletMap';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { DetailRowsTable } from '../shared/DetailRowsTable';
import { Pagination } from '../shared/Pagination';
import { StatusBadge } from '../StatusBadge';
import { NavIcon } from '../../navIcons';
import { CreditReviewRequestModal } from '../shared/CreditReviewRequestModal';

export const GOVERNMENT_ID_TYPES = [
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

const PH_REGIONS = getRegions();

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function hasValidCoords(customer) {
  const lat = Number(customer?.latitude);
  const lng = Number(customer?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng);
}

function truncateText(value, max = 48) {
  const text = String(value || '').trim();
  if (!text) return '—';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function areaOrAddress(customer) {
  const city = String(customer?.address_city || '').trim();
  const barangay = String(customer?.address_barangay || '').trim();
  const address = String(customer?.address || '').trim();
  if (barangay && city) return `${barangay}, ${city}`;
  if (city) return city;
  return address || '—';
}

function paymentStanding(customer) {
  const outstanding = money(customer?.activity?.outstanding_balance ?? customer?.outstandingBalance ?? 0);
  if (outstanding <= 0) return 'Current';
  if (customer?.hasOverdueInvoice) return 'Overdue';
  return 'Has Balance';
}

function creditStatusLabel(customer) {
  const outstanding = money(customer?.activity?.outstanding_balance ?? customer?.outstandingBalance ?? 0);
  const hasCredit = Boolean(customer?.creditInfo);
  const limit = money(customer?.creditInfo?.credit_limit || 0);
  if (!hasCredit || limit <= 0) return 'No Credit';
  if (outstanding > limit) return 'Over Limit';
  return 'Has Limit';
}

function kycStatusLabel(customer) {
  return customer?.id_verification_status || 'Unverified';
}

function normalizeKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function phonesMatch(a, b) {
  const digits = (value) => String(value || '').replace(/\D/g, '');
  const left = digits(a);
  const right = digits(b);
  if (!left || !right) return false;
  return left === right || left.endsWith(right) || right.endsWith(left);
}

function handleCustomerNavigate(customer, showToast) {
  if (!hasValidCoords(customer) && !String(customer?.address || '').trim()) {
    showToast?.('No location pin or address is set for navigation.', 'error');
    return;
  }
  const ok = openExternalNavigation({
    latitude: hasValidCoords(customer) ? customer.latitude : undefined,
    longitude: hasValidCoords(customer) ? customer.longitude : undefined,
    address: customer.address,
  });
  if (!ok) showToast?.('Add an address or map pin to navigate.', 'error');
}

function MapPinPicker({ latitude, longitude, onChange, warning }) {
  const hasPin = Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));
  const center = hasPin ? [Number(latitude), Number(longitude)] : [12.8797, 121.7740];

  const setPin = ({ lat, lng }) => {
    onChange?.({
      latitude: String(Number(lat).toFixed(7)),
      longitude: String(Number(lng).toFixed(7)),
    });
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      warning?.('Location is not available on this device.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => setPin({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => warning?.('Could not read your current location.'),
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  return (
    <div className="customer-map-picker">
      <div className="flex flex-wrap gap-2" style={{ marginBottom: 8 }}>
        <button className="button secondary" type="button" onClick={useCurrentLocation}>
          Use My Current Location
        </button>
        {hasPin ? (
          <button className="button ghost" type="button" onClick={() => onChange?.({ latitude: '', longitude: '' })}>
            Clear Pin
          </button>
        ) : null}
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        {hasPin
          ? 'Drag the marker or tap the map to adjust the pin.'
          : 'Tap the map to set a pin. You can save without a pin, but navigation will not work until one is set.'}
      </p>
      <LeafletMap
        center={center}
        zoom={hasPin ? 15 : 6}
        height={280}
        showFullscreen
        onMapClick={setPin}
        markers={hasPin ? [{
          id: 'customer-pin',
          position: center,
          draggable: true,
          onDragEnd: setPin,
          color: '#0B1E30',
          popup: 'Customer location',
        }] : []}
      />
      {!hasPin ? <p className="form-error" style={{ marginTop: 8 }}>No location pin.</p> : null}
    </div>
  );
}

export function CustomersPage({ navigate, showToast }) {
  const currentUser = getCurrentUser();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('Active');
  const [loading, setLoading] = useState(true);
  const [customersData, setCustomersData] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const filterResetKey = `${search}|${filter}`;
  const pagination = useServerPagination({
    totalRecords,
    pageSize: DEFAULT_PAGE_SIZE,
    resetKey: filterResetKey,
  });

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const params = {
        page: pagination.currentPage,
        limit: DEFAULT_PAGE_SIZE,
      };
      if (search.trim()) params.search = search.trim();
      if (filter === 'Active') params.status = 'Active';
      else if (filter === 'Inactive') params.status = 'Inactive';
      const res = await fetchCustomers(params);
      if (!active) return;
      if (res.success) {
        setCustomersData(res.data || []);
        setTotalRecords(Number(res.pagination?.total) || (res.data || []).length);
      } else {
        setCustomersData([]);
        setTotalRecords(0);
        showToast?.(res.message || 'Failed to load customers.', 'error');
      }
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [pagination.currentPage, search, filter, showToast]);

  if (loading) return <LoadingState message="Loading customers..." />;

  return (
    <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3>Customers <span className="text-ink/70">({totalRecords})</span></h3>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            People and accounts you sell to in {getUserAssignedLocation(currentUser)} — add new finds from the field, open a profile before logging a sale.
          </p>
        </div>
        <div className="list-section-toolbar">
          <div className="list-section-controls">
            <input
              className="filter-input search"
              type="search"
              placeholder="Search name, phone, code, or address"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select className="filter-select" value={filter} onChange={(e) => setFilter(e.target.value)}>
              {['Active', 'Inactive', 'All'].map((option) => (
                <option key={option} value={option}>{option === 'All' ? 'All Customers' : option}</option>
              ))}
            </select>
            <button className="button" type="button" onClick={() => navigate('/sales/customers/new')}>
              Add Customer
            </button>
          </div>
        </div>
        {totalRecords ? (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th>Area / Address</th>
                    <th>Outstanding</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customersData.map((customer) => {
                    const code = formatCustomerDisplayId(customer);
                    const canNavigate = hasValidCoords(customer) || Boolean(String(customer.address || '').trim());
                    return (
                      <tr
                        key={customer.customer_id}
                        className="clickable-row"
                        onClick={() => navigate(`/sales/customer-detail/${customer.customer_id}?from=customers`)}
                      >
                        <td>
                          <strong>{formatCustomerFullName(customer)}</strong>
                          {code !== '—' ? (
                            <div className="muted" style={{ fontSize: '0.78rem' }}>{code}</div>
                          ) : null}
                          {customer.branch_name ? (
                            <div className="muted" style={{ fontSize: '0.75rem' }}>{customer.branch_name}</div>
                          ) : null}
                        </td>
                        <td>{customer.contact_phone || '—'}</td>
                        <td title={areaOrAddress(customer)}>{truncateText(areaOrAddress(customer), 56)}</td>
                        <td>{formatCurrency(customer.outstandingBalance ?? customer.activity?.outstanding_balance ?? 0)}</td>
                        <td><StatusBadge status={customer.status} /></td>
                        <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="icon-action-button"
                            type="button"
                            title="View"
                            onClick={() => navigate(`/sales/customer-detail/${customer.customer_id}?from=customers`)}
                          >
                            <NavIcon name="view" />
                          </button>
                          {canNavigate ? (
                            <button
                              className="icon-action-button"
                              type="button"
                              title="Navigate"
                              onClick={() => handleCustomerNavigate(customer, showToast)}
                            >
                              <NavIcon name="map" />
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination {...pagination} />
          </>
        ) : (
          <EmptyState
            title="No customers found"
            description="Adjust your search or filters, or add someone you met in the field."
            actionLabel="Clear filters"
            onAction={() => {
              setSearch('');
              setFilter('Active');
            }}
          />
        )}
      </section>
    </div>
  );
}

export function CustomerDetailPage({
  customerId,
  parentContext,
  navigate,
  showToast,
}) {
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creditReviewOpen, setCreditReviewOpen] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await fetchCustomerById(customerId);
      if (res.success && res.data) setCustomer(res.data);
      else setCustomer(null);
      setLoading(false);
    }
    load();
  }, [customerId]);

  if (loading) return <LoadingState message="Loading customer details..." />;
  if (!customer) {
    return (
      <EmptyState
        title="Customer not found"
        actionLabel="Back to Customers"
        onAction={() => navigate('/sales/customers')}
      />
    );
  }

  const outstanding = money(customer.activity?.outstanding_balance || 0);
  const hasCredit = Boolean(customer.creditInfo);
  const creditLimit = money(customer.creditInfo?.credit_limit || 0);
  const remaining = hasCredit && creditLimit > 0 ? Math.max(0, creditLimit - outstanding) : null;
  const standing = paymentStanding(customer);
  const ownerName = formatCustomerFullName(customer);
  const displayCode = formatCustomerDisplayId(customer);
  const primaryContactName = formatContactPersonName(customer);
  const secondaryName = formatSecondaryContactName(customer);
  const pinOk = hasValidCoords(customer);
  const agentName = customer.assigned_sales_agent_name || customer.account_manager_name || '—';
  const sameOwner = customer.assigned_sales_agent_name
    && customer.account_manager_name
    && customer.assigned_sales_agent_name === customer.account_manager_name;

  return (
    <div className="page account-detail-page">
      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Profile</h3>
        </div>
        <DetailRowsTable
          rows={[
            { label: 'Full Name', value: ownerName },
            { label: 'Customer Code', value: displayCode },
            { label: "Mother's Maiden Name", value: customer.mothers_maiden_name || '—' },
            { label: 'Civil Status', value: customer.civil_status || '—' },
            { label: 'Business / Mobile Phone', value: customer.contact_phone || '—' },
            {
              label: 'Alternate Contact',
              value: primaryContactName !== '—'
                ? `${primaryContactName} · ${customer.contact_person_phone || '—'} · ${customer.contact_person_relationship || '—'}`
                : '—',
            },
            ...(secondaryName ? [{
              label: 'Secondary Contact',
              value: `${secondaryName} · ${customer.secondary_contact_phone || '—'} · ${customer.secondary_contact_relationship || '—'}`,
            }] : []),
            { label: 'Address', value: customer.address || '—' },
            { label: 'Account Status', value: <StatusBadge status={customer.status || '—'} /> },
            { label: 'ID / KYC Status', value: <StatusBadge status={kycStatusLabel(customer)} /> },
            { label: 'Government ID', value: customer.id_type ? `${customer.id_type} · ${customer.id_number || '—'}` : '—' },
            { label: 'Credit Status', value: <StatusBadge status={creditStatusLabel(customer)} /> },
            { label: 'Branch', value: customer.branch_name || '—' },
            { label: sameOwner ? 'Sales Agent' : 'Assigned Sales Agent', value: agentName },
            ...(!sameOwner && customer.account_manager_name
              ? [{ label: 'Account Manager', value: customer.account_manager_name }]
              : []),
          ]}
        />
        {customer.id_photo ? (
          <div style={{ marginTop: 12 }}>
            <p className="muted" style={{ marginBottom: 6 }}>ID Photo</p>
            <a href={customer.id_photo} target="_blank" rel="noreferrer">
              <img
                src={customer.id_photo}
                alt="Government ID"
                style={{ maxWidth: 240, maxHeight: 160, borderRadius: 8, border: '1px solid #BADBE9' }}
              />
            </a>
          </div>
        ) : null}
      </section>

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Money Status</h3>
          <p className="muted">Check standing before logging a sale or installment.</p>
        </div>
        <DetailRowsTable
          rows={[
            { label: 'Outstanding Balance', value: formatCurrency(outstanding) },
            { label: 'Credit Limit', value: hasCredit && creditLimit > 0 ? formatCurrency(creditLimit) : 'No credit on file' },
            { label: 'Remaining Credit', value: remaining == null ? '—' : formatCurrency(remaining) },
            { label: 'Payment Standing', value: <StatusBadge status={standing} /> },
            {
              label: 'Last Payment / Sale',
              value: [
                customer.activity?.last_collection_date
                  ? `Collected ${formatDisplayDate(customer.activity.last_collection_date)}`
                  : null,
                customer.activity?.last_sales_visit
                  ? `Sold ${formatDisplayDate(customer.activity.last_sales_visit)}`
                  : null,
              ].filter(Boolean).join(' · ') || '—',
            },
            ...(customer.unpaidInvoiceCount
              ? [{ label: 'Open Invoices', value: String(customer.unpaidInvoiceCount) }]
              : []),
          ]}
        />
      </section>

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Location</h3>
          <p className="muted">{customer.address || 'No address on file.'}</p>
        </div>
        {pinOk ? (
          <LeafletMap
            center={[Number(customer.latitude), Number(customer.longitude)]}
            zoom={15}
            height={300}
            markers={[{
              id: customer.customer_id,
              position: [Number(customer.latitude), Number(customer.longitude)],
              popup: `<strong>${ownerName}</strong><br/>${customer.address || ''}`,
              color: '#0B1E30',
            }]}
          />
        ) : (
          <EmptyState title="No location pin set." description="Edit the customer to drop a map pin from the field address." />
        )}
        <div className="flex flex-wrap gap-2" style={{ marginTop: 12 }}>
          <button
            className="button secondary"
            type="button"
            disabled={!pinOk && !String(customer.address || '').trim()}
            onClick={() => handleCustomerNavigate(customer, showToast)}
          >
            Navigate
          </button>
        </div>
      </section>

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Recent Activity</h3>
        </div>
        {(customer.recentSales || []).length ? (
          <>
            <h4 className="subsection-title">Recent sales</h4>
            <div className="table-shell" style={{ marginBottom: 16 }}>
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {customer.recentSales.map((sale) => (
                    <tr
                      key={sale.sales_invoices_id}
                      className="clickable-row"
                      onClick={() => navigate(`/sales/invoices/${encodeURIComponent(sale.invoice_number)}`)}
                    >
                      <td>{sale.invoice_number}</td>
                      <td>{formatDisplayDate(sale.invoices_date)}</td>
                      <td>{formatCurrency(sale.total_amount)}</td>
                      <td><StatusBadge status={sale.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        <h4 className="subsection-title">Payments / collections</h4>
        <div className="table-shell">
          <table className="corvex-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Receipt #</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Collector</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {customer.paymentHistory?.length ? customer.paymentHistory.map((payment) => (
                <tr key={payment.payment_id || payment.receipt_number}>
                  <td>{formatDisplayDate(payment.payment_date)}</td>
                  <td>{payment.receipt_number || '—'}</td>
                  <td>{formatCurrency(Number(payment.amount))}</td>
                  <td>{payment.payment_method || '—'}</td>
                  <td>{payment.collector_name || '—'}</td>
                  <td><StatusBadge status={payment.payment_status || 'Completed'} /></td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: '#5F7385', padding: 16 }}>
                    No recent payments
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <button
          className="button secondary"
          type="button"
          onClick={() => navigate(parentContext === 'schedule' ? '/sales/schedule' : parentContext === 'log-sale' ? '/sales/log-sale' : '/sales/customers')}
        >
          Back
        </button>
        <button
          className="button secondary"
          type="button"
          onClick={() => navigate(`/sales/customers/${customer.customer_id}/edit`)}
        >
          Edit Customer
        </button>
        <button
          className="button secondary"
          type="button"
          onClick={() => navigate(`/sales/credit-history?customerId=${customer.customer_id}`)}
        >
          View Payment History
        </button>
        <button
          className="button secondary"
          type="button"
          onClick={() => setCreditReviewOpen(true)}
        >
          Request Credit Review
        </button>
        <button className="button" type="button" onClick={() => navigate(`/sales/log-sale/${customer.customer_id}`)}>
          Log a Sale
        </button>
      </div>

      <CreditReviewRequestModal
        open={creditReviewOpen}
        customer={customer}
        onClose={() => setCreditReviewOpen(false)}
        showToast={showToast}
        onSubmitted={(ciId) => {
          setCreditReviewOpen(false);
          if (ciId) navigate(`/sales/credit-investigations/${ciId}`);
          else navigate('/sales/credit-investigations');
        }}
      />
    </div>
  );
}

function emptyCustomerForm() {
  return {
    first_name: '',
    middle_name: '',
    last_name: '',
    mothers_maiden_name: '',
    civil_status: '',
    address_region: '',
    address_province: '',
    address_city: '',
    address_barangay: '',
    address_street: '',
    address_zip: '',
    latitude: '',
    longitude: '',
    contact_phone: '',
    contact_person_fname: '',
    contact_person_mname: '',
    contact_person_lname: '',
    contact_person_phone: '',
    contact_person_relationship: '',
    secondary_contact_fname: '',
    secondary_contact_lname: '',
    secondary_contact_phone: '',
    secondary_contact_relationship: '',
    id_type: '',
    id_number: '',
    id_photo: '',
    id_photo_name: '',
    acknowledgeDuplicate: false,
  };
}

export function CustomerFormPage({
  customerId,
  navigate,
  showToast,
}) {
  const location = useLocation();
  const currentUser = getCurrentUser();
  const returnTo = new URLSearchParams(location.search).get('returnTo') || '';
  const isEdit = Boolean(customerId);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [form, setForm] = useState(emptyCustomerForm);
  const [duplicateMatches, setDuplicateMatches] = useState([]);
  const [geoCodes, setGeoCodes] = useState({ regCode: '', provCode: '', munCityCode: '' });
  const [provinceOptions, setProvinceOptions] = useState([]);
  const [cityOptions, setCityOptions] = useState([]);
  const [barangayOptions, setBarangayOptions] = useState([]);
  const [barangaysLoading, setBarangaysLoading] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      if (isEdit) {
        const customerRes = await fetchCustomerById(customerId);
        if (!customerRes.success || !customerRes.data) {
          showToast?.(customerRes.message || 'Customer not found.', 'error');
          setLoading(false);
          return;
        }
        const customer = customerRes.data;
        const resolved = await resolveAddressSelection({
          address_region: customer.address_region,
          address_province: customer.address_province,
          address_city: customer.address_city,
          address_barangay: customer.address_barangay,
        });
        setGeoCodes({
          regCode: resolved.regCode,
          provCode: resolved.provCode,
          munCityCode: resolved.munCityCode,
        });
        setProvinceOptions(resolved.regCode ? getProvinces(resolved.regCode) : []);
        setCityOptions(resolved.provCode ? getCities(resolved.provCode) : []);
        if (resolved.munCityCode) {
          setBarangaysLoading(true);
          try {
            setBarangayOptions(await getBarangays(resolved.munCityCode));
          } finally {
            setBarangaysLoading(false);
          }
        } else {
          setBarangayOptions([]);
        }
        setForm({
          ...emptyCustomerForm(),
          first_name: customer.first_name || '',
          middle_name: customer.middle_name || '',
          last_name: customer.last_name || '',
          mothers_maiden_name: customer.mothers_maiden_name || '',
          civil_status: customer.civil_status || '',
          address_region: resolved.regionName || customer.address_region || '',
          address_province: resolved.provinceName || customer.address_province || '',
          address_city: resolved.cityName || customer.address_city || '',
          address_barangay: resolved.barangayName || customer.address_barangay || '',
          address_street: customer.address_street || '',
          address_zip: customer.address_zip || '',
          latitude: customer.latitude != null ? String(customer.latitude) : '',
          longitude: customer.longitude != null ? String(customer.longitude) : '',
          contact_phone: customer.contact_phone || '',
          contact_person_fname: customer.contact_person_fname || '',
          contact_person_mname: customer.contact_person_mname || '',
          contact_person_lname: customer.contact_person_lname || '',
          contact_person_phone: customer.contact_person_phone || '',
          contact_person_relationship: customer.contact_person_relationship || '',
          secondary_contact_fname: customer.secondary_contact_fname || '',
          secondary_contact_lname: customer.secondary_contact_lname || '',
          secondary_contact_phone: customer.secondary_contact_phone || '',
          secondary_contact_relationship: customer.secondary_contact_relationship || '',
          id_type: customer.id_type || '',
          id_number: customer.id_number || '',
          id_photo: customer.id_photo || '',
          id_photo_name: customer.id_photo ? 'Saved ID photo' : '',
          acknowledgeDuplicate: false,
        });
      }
      setLoading(false);
    }
    load();
  }, [customerId, isEdit, showToast]);

  useEffect(() => {
    if (isEdit) {
      setDuplicateMatches([]);
      return undefined;
    }
    const phone = form.contact_phone.trim();
    if (!phone) {
      setDuplicateMatches([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      const res = await lookupCustomersForDuplicate({ contact_phone: phone });
      setDuplicateMatches(res.success ? res.data || [] : []);
    }, 400);
    return () => clearTimeout(timer);
  }, [form.contact_phone, isEdit]);

  const updateField = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const selectRegion = (regCode) => {
    const region = PH_REGIONS.find((row) => row.regCode === regCode);
    const nextProvinces = regCode ? getProvinces(regCode) : [];
    setGeoCodes({ regCode: regCode || '', provCode: '', munCityCode: '' });
    setProvinceOptions(nextProvinces);
    setCityOptions([]);
    setBarangayOptions([]);
    setForm((prev) => ({
      ...prev,
      address_region: region?.regionName || '',
      address_province: '',
      address_city: '',
      address_barangay: '',
    }));
    setErrors((prev) => ({
      ...prev,
      address_region: undefined,
      address_province: undefined,
      address_city: undefined,
      address_barangay: undefined,
    }));
  };

  const applyCitySelection = async (provCode, munCityCode, cityName = '') => {
    setGeoCodes((prev) => ({ ...prev, provCode, munCityCode: munCityCode || '' }));
    setForm((prev) => ({
      ...prev,
      address_city: cityName,
      address_barangay: '',
    }));
    setErrors((prev) => ({ ...prev, address_city: undefined, address_barangay: undefined }));
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
  };

  const selectProvince = async (provCode) => {
    const province = provinceOptions.find((row) => row.provCode === provCode);
    const nextCities = provCode ? getCities(provCode) : [];
    setCityOptions(nextCities);
    setBarangayOptions([]);
    setGeoCodes((prev) => ({ ...prev, provCode: provCode || '', munCityCode: '' }));
    setForm((prev) => ({
      ...prev,
      address_province: province?.provName || '',
      address_city: '',
      address_barangay: '',
    }));
    setErrors((prev) => ({
      ...prev,
      address_province: undefined,
      address_city: undefined,
      address_barangay: undefined,
    }));

    if (nextCities.length === 1) {
      await applyCitySelection(provCode, nextCities[0].munCityCode, nextCities[0].munCityName);
    }
  };

  const selectCity = async (munCityCode) => {
    const city = cityOptions.find((row) => row.munCityCode === munCityCode);
    await applyCitySelection(geoCodes.provCode, munCityCode, city?.munCityName || '');
  };

  const selectBarangay = (brgyName) => {
    updateField('address_barangay', brgyName);
  };

  const handleSubmit = async () => {
    const nextErrors = {};
    [
      'first_name',
      'last_name',
      'mothers_maiden_name',
      'civil_status',
      'contact_phone',
      'address_region',
      'address_province',
      'address_city',
      'address_barangay',
      'contact_person_fname',
      'contact_person_lname',
      'contact_person_phone',
      'contact_person_relationship',
      'id_type',
      'id_number',
    ].forEach((field) => {
      if (!String(form[field] || '').trim()) nextErrors[field] = 'Required';
    });

    const customerName = [form.first_name, form.middle_name, form.last_name].filter(Boolean).join(' ');
    const contactName = [form.contact_person_fname, form.contact_person_mname, form.contact_person_lname].filter(Boolean).join(' ');
    if (normalizeKey(customerName) && normalizeKey(customerName) === normalizeKey(contactName)) {
      nextErrors.contact_person_fname = 'Alternate contact cannot be the same person as the customer.';
    }
    if (phonesMatch(form.contact_phone, form.contact_person_phone)) {
      nextErrors.contact_person_phone = 'Alternate contact phone must differ from the customer phone.';
    }

    const primaryKey = `${form.contact_person_fname}|${form.contact_person_phone}`.toLowerCase();
    const secondaryKey = `${form.secondary_contact_fname}|${form.secondary_contact_phone}`.toLowerCase();
    if (form.secondary_contact_fname && form.secondary_contact_phone && primaryKey === secondaryKey) {
      nextErrors.secondary_contact_phone = 'Secondary contact must be different from the alternate contact.';
    }

    if (!isEdit && duplicateMatches.length && !form.acknowledgeDuplicate) {
      nextErrors.acknowledgeDuplicate = 'Review possible duplicates, or confirm this is a new customer.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      showToast('Please complete all required fields.', 'error');
      return;
    }

    const composedAddress = composeCustomerAddress(form);
    const payload = {
      first_name: form.first_name.trim(),
      middle_name: form.middle_name.trim() || null,
      last_name: form.last_name.trim(),
      mothers_maiden_name: form.mothers_maiden_name.trim(),
      civil_status: form.civil_status.trim(),
      address: composedAddress,
      address_region: form.address_region.trim() || null,
      address_province: form.address_province.trim(),
      address_city: form.address_city.trim(),
      address_barangay: form.address_barangay.trim(),
      address_street: form.address_street.trim() || null,
      address_zip: form.address_zip.trim() || null,
      contact_phone: form.contact_phone.trim(),
      contact_person_fname: form.contact_person_fname.trim(),
      contact_person_mname: form.contact_person_mname.trim() || null,
      contact_person_lname: form.contact_person_lname.trim(),
      contact_person_phone: form.contact_person_phone.trim(),
      contact_person_relationship: form.contact_person_relationship.trim(),
      secondary_contact_fname: form.secondary_contact_fname.trim() || null,
      secondary_contact_lname: form.secondary_contact_lname.trim() || null,
      secondary_contact_phone: form.secondary_contact_phone.trim() || null,
      secondary_contact_relationship: form.secondary_contact_relationship.trim() || null,
      latitude: form.latitude !== '' ? Number(form.latitude) : null,
      longitude: form.longitude !== '' ? Number(form.longitude) : null,
      id_type: form.id_type,
      id_number: form.id_number.trim(),
      id_photo: form.id_photo || null,
    };

    setSubmitting(true);
    let result;
    if (isEdit) {
      result = await updateCustomer(customerId, payload);
    } else {
      result = await createCustomer({
        ...payload,
        branch_id: currentUser?.branchId ?? undefined,
        account_manager_id: currentUser?.id ?? undefined,
        create_portal_account: false,
      });
    }
    setSubmitting(false);

    if (!result.success || !result.data) {
      showToast(result.message || (isEdit ? 'Failed to update customer.' : 'Failed to create customer.'), 'error');
      return;
    }

    if (!form.latitude || !form.longitude) {
      showToast('Customer saved. Navigation will not work until a location pin is set.', 'success');
    } else {
      showToast(result.message || (isEdit ? 'Customer updated.' : 'Customer created successfully.'), 'success');
    }

    const savedId = result.data.customer_id || customerId;
    if (!isEdit && returnTo.startsWith('/sales/log-sale')) {
      navigate(`/sales/log-sale/${savedId}`);
      return;
    }
    navigate(`/sales/customer-detail/${savedId}?from=customers`);
  };

  if (loading) return <LoadingState message={isEdit ? 'Loading customer…' : 'Loading customer form...'} />;

  return (
    <div className="page">
      <section className="panel form-panel content-panel">
        <div className="panel-section-header">
          <h3>{isEdit ? 'Edit Customer' : 'Add Customer'}</h3>
          <p className="muted">
            {isEdit
              ? 'Correct profile, alternate contacts, and location. Credit limit and ID verification stay with Branch Head / CI.'
              : 'Register someone you met in the field. Pin their location on the map from the address.'}
          </p>
        </div>

        {!isEdit && duplicateMatches.length ? (
          <section className="panel content-panel" style={{ borderColor: '#fcd34d', background: 'rgba(245,158,11,0.06)', marginBottom: 16 }}>
            <h4 style={{ marginTop: 0 }}>Possible existing customers</h4>
            <p className="muted">Review these matches before saving. Shared household phones are common — confirm only if this is truly a new customer.</p>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Customer Code</th>
                    <th>Name</th>
                    <th>Phone</th>
                  </tr>
                </thead>
                <tbody>
                  {duplicateMatches.map((match) => (
                    <tr key={match.customer_id}>
                      <td>{match.customer_code || '—'}</td>
                      <td>{`${match.first_name || ''} ${match.last_name || ''}`.trim()}</td>
                      <td>{match.contact_phone || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="toggle-label" style={{ marginTop: 12 }}>
              <input
                type="checkbox"
                checked={form.acknowledgeDuplicate}
                onChange={(e) => updateField('acknowledgeDuplicate', e.target.checked)}
              />
              I checked these matches and this is a new customer
            </label>
            {errors.acknowledgeDuplicate ? <p className="form-error">{errors.acknowledgeDuplicate}</p> : null}
          </section>
        ) : null}

        <h4 className="subsection-title">Identity</h4>
        <div className="account-detail-grid two-up">
          <div className="form-group">
            <label htmlFor="cust-first">First Name *</label>
            <input id="cust-first" value={form.first_name} onChange={(e) => updateField('first_name', e.target.value)} />
            {errors.first_name ? <p className="form-error">{errors.first_name}</p> : null}
          </div>
          <div className="form-group">
            <label htmlFor="cust-middle">Middle Name</label>
            <input id="cust-middle" value={form.middle_name} onChange={(e) => updateField('middle_name', e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="cust-last">Last Name *</label>
            <input id="cust-last" value={form.last_name} onChange={(e) => updateField('last_name', e.target.value)} />
            {errors.last_name ? <p className="form-error">{errors.last_name}</p> : null}
          </div>
          <div className="form-group">
            <label htmlFor="cust-maiden">Mother&apos;s Maiden Name *</label>
            <input
              id="cust-maiden"
              value={form.mothers_maiden_name}
              onChange={(e) => updateField('mothers_maiden_name', e.target.value)}
              placeholder="Mother's family name"
            />
            {errors.mothers_maiden_name ? <p className="form-error">{errors.mothers_maiden_name}</p> : null}
          </div>
          <div className="form-group">
            <label htmlFor="cust-civil">Civil Status *</label>
            <select
              id="cust-civil"
              className="filter-select"
              value={form.civil_status}
              onChange={(e) => updateField('civil_status', e.target.value)}
            >
              <option value="">Select status</option>
              {CIVIL_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
            {errors.civil_status ? <p className="form-error">{errors.civil_status}</p> : null}
          </div>
          <div className="form-group">
            <label htmlFor="cust-phone">Business / Mobile Phone *</label>
            <input id="cust-phone" value={form.contact_phone} onChange={(e) => updateField('contact_phone', e.target.value)} />
            {errors.contact_phone ? <p className="form-error">{errors.contact_phone}</p> : null}
          </div>
          <div className="form-group">
            <label htmlFor="cust-id-type">Government ID Type *</label>
            <select id="cust-id-type" className="filter-select" value={form.id_type} onChange={(e) => updateField('id_type', e.target.value)}>
              <option value="">Select ID type</option>
              {GOVERNMENT_ID_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            {errors.id_type ? <p className="form-error">{errors.id_type}</p> : null}
          </div>
          <div className="form-group">
            <label htmlFor="cust-id-number">ID Number *</label>
            <input id="cust-id-number" value={form.id_number} onChange={(e) => updateField('id_number', e.target.value)} />
            {errors.id_number ? <p className="form-error">{errors.id_number}</p> : null}
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="cust-id-photo">ID Photo (recommended)</label>
          <p className="muted" style={{ marginTop: 0 }}>
            Upload or capture the ID. Enter the type and number from the card. Automatic ID reading is not enabled yet — verification stays Unverified until Branch Head / CI reviews it.
          </p>
          <input
            id="cust-id-photo"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) {
                updateField('id_photo', '');
                updateField('id_photo_name', '');
                return;
              }
              if (!file.type.startsWith('image/')) {
                setErrors((prev) => ({ ...prev, id_photo: 'Please select an image file.' }));
                return;
              }
              if (file.size > 700_000) {
                setErrors((prev) => ({ ...prev, id_photo: 'Image must be 700 KB or smaller.' }));
                return;
              }
              const reader = new FileReader();
              reader.onload = () => {
                updateField('id_photo', typeof reader.result === 'string' ? reader.result : '');
                updateField('id_photo_name', file.name);
              };
              reader.readAsDataURL(file);
            }}
          />
          {form.id_photo_name ? <p className="muted">Selected: {form.id_photo_name}</p> : null}
          {form.id_photo ? (
            <img
              src={form.id_photo}
              alt="ID preview"
              style={{ marginTop: 8, maxWidth: 200, maxHeight: 140, borderRadius: 8, border: '1px solid #BADBE9' }}
            />
          ) : null}
          {errors.id_photo ? <p className="form-error">{errors.id_photo}</p> : null}
        </div>
      </section>

      <section className="panel form-panel content-panel">
        <div className="panel-section-header">
          <h3>Address and Map</h3>
          <p className="muted">
            Choose Region, then Province, City / Municipality, and Barangay in order. Pin the map from the field address.
          </p>
        </div>
        <div className="account-detail-grid two-up">
          <div className="form-group">
            <label htmlFor="addr-region">Region *</label>
            <select
              id="addr-region"
              className="filter-select"
              value={geoCodes.regCode}
              onChange={(e) => selectRegion(e.target.value)}
            >
              <option value="">Select region</option>
              {PH_REGIONS.map((region) => (
                <option key={region.regCode} value={region.regCode}>{region.regionName}</option>
              ))}
            </select>
            {errors.address_region ? <p className="form-error">{errors.address_region}</p> : null}
          </div>
          {geoCodes.regCode ? (
            <div className="form-group">
              <label htmlFor="addr-province">Province *</label>
              <select
                id="addr-province"
                className="filter-select"
                value={geoCodes.provCode}
                onChange={(e) => selectProvince(e.target.value)}
              >
                <option value="">Select province</option>
                {provinceOptions.map((province) => (
                  <option key={province.provCode} value={province.provCode}>{province.provName}</option>
                ))}
              </select>
              {errors.address_province ? <p className="form-error">{errors.address_province}</p> : null}
            </div>
          ) : null}
          {geoCodes.provCode ? (
            <div className="form-group">
              <label htmlFor="addr-city">City / Municipality *</label>
              <select
                id="addr-city"
                className="filter-select"
                value={geoCodes.munCityCode}
                onChange={(e) => selectCity(e.target.value)}
              >
                <option value="">Select city / municipality</option>
                {cityOptions.map((city) => (
                  <option key={city.munCityCode} value={city.munCityCode}>{city.munCityName}</option>
                ))}
              </select>
              {errors.address_city ? <p className="form-error">{errors.address_city}</p> : null}
            </div>
          ) : null}
          {geoCodes.munCityCode ? (
            <div className="form-group">
              <label htmlFor="addr-barangay">Barangay *</label>
              <select
                id="addr-barangay"
                className="filter-select"
                value={form.address_barangay}
                onChange={(e) => selectBarangay(e.target.value)}
                disabled={barangaysLoading}
              >
                <option value="">{barangaysLoading ? 'Loading barangays…' : 'Select barangay'}</option>
                {barangayOptions.map((barangay) => (
                  <option key={barangay.brgyCode || barangay.psgcCode} value={barangay.brgyName}>
                    {barangay.brgyName}
                  </option>
                ))}
              </select>
              {errors.address_barangay ? <p className="form-error">{errors.address_barangay}</p> : null}
            </div>
          ) : null}
          <div className="form-group">
            <label htmlFor="addr-street">Street / Sitio / Landmark</label>
            <input id="addr-street" value={form.address_street} onChange={(e) => updateField('address_street', e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="addr-zip">ZIP Code</label>
            <input id="addr-zip" value={form.address_zip} onChange={(e) => updateField('address_zip', e.target.value)} />
          </div>
        </div>
        <MapPinPicker
          latitude={form.latitude}
          longitude={form.longitude}
          onChange={({ latitude, longitude }) => setForm((prev) => ({ ...prev, latitude, longitude }))}
          warning={(message) => showToast?.(message, 'error')}
        />
      </section>

      <section className="panel form-panel content-panel">
        <div className="panel-section-header">
          <h3>Contacts</h3>
          <p className="muted">Alternate contact is someone to call when the customer themselves cannot be reached.</p>
        </div>
        <h4 className="subsection-title">Alternate Contact Person *</h4>
        <div className="account-detail-grid two-up">
          <div className="form-group">
            <label htmlFor="pc-fname">First Name *</label>
            <input id="pc-fname" value={form.contact_person_fname} onChange={(e) => updateField('contact_person_fname', e.target.value)} />
            {errors.contact_person_fname ? <p className="form-error">{errors.contact_person_fname}</p> : null}
          </div>
          <div className="form-group">
            <label htmlFor="pc-mname">Middle Name</label>
            <input id="pc-mname" value={form.contact_person_mname} onChange={(e) => updateField('contact_person_mname', e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="pc-lname">Last Name *</label>
            <input id="pc-lname" value={form.contact_person_lname} onChange={(e) => updateField('contact_person_lname', e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="pc-phone">Phone *</label>
            <input id="pc-phone" value={form.contact_person_phone} onChange={(e) => updateField('contact_person_phone', e.target.value)} />
            {errors.contact_person_phone ? <p className="form-error">{errors.contact_person_phone}</p> : null}
          </div>
          <div className="form-group">
            <label htmlFor="pc-rel">Relationship *</label>
            <select id="pc-rel" className="filter-select" value={form.contact_person_relationship} onChange={(e) => updateField('contact_person_relationship', e.target.value)}>
              <option value="">Select relationship</option>
              {CONTACT_RELATIONSHIP_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            {errors.contact_person_relationship ? <p className="form-error">{errors.contact_person_relationship}</p> : null}
          </div>
        </div>

        <h4 className="subsection-title">Secondary Contact (optional)</h4>
        <div className="account-detail-grid two-up">
          <div className="form-group">
            <label htmlFor="sc-fname">First Name</label>
            <input id="sc-fname" value={form.secondary_contact_fname} onChange={(e) => updateField('secondary_contact_fname', e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="sc-lname">Last Name</label>
            <input id="sc-lname" value={form.secondary_contact_lname} onChange={(e) => updateField('secondary_contact_lname', e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="sc-phone">Phone</label>
            <input id="sc-phone" value={form.secondary_contact_phone} onChange={(e) => updateField('secondary_contact_phone', e.target.value)} />
            {errors.secondary_contact_phone ? <p className="form-error">{errors.secondary_contact_phone}</p> : null}
          </div>
          <div className="form-group">
            <label htmlFor="sc-rel">Relationship</label>
            <select id="sc-rel" className="filter-select" value={form.secondary_contact_relationship} onChange={(e) => updateField('secondary_contact_relationship', e.target.value)}>
              <option value="">Select relationship</option>
              {CONTACT_RELATIONSHIP_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <button
          className="button secondary"
          type="button"
          onClick={() => navigate(isEdit ? `/sales/customer-detail/${customerId}` : '/sales/customers')}
        >
          Cancel
        </button>
        <button className="button" type="button" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Save Customer'}
        </button>
      </div>
    </div>
  );
}
