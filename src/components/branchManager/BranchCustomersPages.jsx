import { useEffect, useState } from 'react';
import { fetchCustomers, fetchCustomerById } from '../../api/salesService.js';
import { fetchTerritories } from '../../api/territoriesService.js';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { Stats } from '../shared/StatsGrid';
import { Pagination } from '../shared/Pagination';
import { DetailRowsTable } from '../shared/DetailRowsTable';
import { StatusBadge } from '../StatusBadge';
import { NavIcon } from '../../navIcons';
import LeafletMap from '../common/LeafletMap';
import { useServerPagination, DEFAULT_PAGE_SIZE } from '../../hooks/usePagination';
import { formatCurrency, formatDisplayDate } from '../../data/branchManagerMockData';
import {
  formatCustomerDisplayId,
  formatCustomerFullName,
  formatContactPersonName,
  formatSecondaryContactName,
} from '../../utils/customerDisplay';
import { paymentStanding } from '../../utils/customerStanding.js';
import { openExternalNavigation } from '../../utils/mapsNavigation.js';
import { downloadPdf } from '../../utils/dataExport.js';

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function areaOrAddress(customer) {
  const city = String(customer?.address_city || '').trim();
  const barangay = String(customer?.address_barangay || '').trim();
  const address = String(customer?.address || '').trim();
  if (barangay && city) return `${barangay}, ${city}`;
  if (city) return city;
  return address || '—';
}

function hasValidCoords(customer) {
  const lat = Number(customer?.latitude);
  const lng = Number(customer?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
}

function daysOverdueOf(customer) {
  if (paymentStanding(customer) !== 'Overdue') return 0;
  const explicit = Number(customer?.daysOverdue);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const due = customer?.earliestDueDate;
  if (!due) return 0;
  const manilaToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
  const diff = Math.floor(
    (new Date(`${manilaToday}T12:00:00`) - new Date(`${due}T12:00:00`)) / 86400000
  );
  return Math.max(0, diff);
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
  if (!ok) showToast?.('Unable to open navigation.', 'error');
}

function standingToApiFilter(value) {
  if (value === 'Current') return 'current';
  if (value === 'Has Balance') return 'has_balance';
  if (value === 'Overdue') return 'overdue';
  return undefined;
}

function buildReturnQuery({ search, statusFilter, paymentFilter, territoryFilter, page }) {
  const params = new URLSearchParams();
  if (search) params.set('q', search);
  if (statusFilter && statusFilter !== 'All') params.set('status', statusFilter);
  if (paymentFilter && paymentFilter !== 'All') params.set('standing', paymentFilter);
  if (territoryFilter && territoryFilter !== 'All') params.set('territory', territoryFilter);
  if (page && page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function BranchCustomersPage({ navigate, opsBase, showToast }) {
  const initial = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams();

  const [search, setSearch] = useState(initial.get('q') || '');
  const [statusFilter, setStatusFilter] = useState(initial.get('status') || 'All');
  const [paymentFilter, setPaymentFilter] = useState(initial.get('standing') || 'All');
  const [territoryFilter, setTerritoryFilter] = useState(initial.get('territory') || 'All');
  const [territories, setTerritories] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [stats, setStats] = useState(null);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(true);

  const filterResetKey = `${search}|${statusFilter}|${paymentFilter}|${territoryFilter}`;
  const pagination = useServerPagination({
    totalRecords,
    pageSize: DEFAULT_PAGE_SIZE,
    resetKey: filterResetKey,
  });

  useEffect(() => {
    let cancelled = false;
    fetchTerritories({ status: 'all' }).then((result) => {
      if (cancelled) return;
      if (result?.success) setTerritories(result.data || []);
    }).catch(() => {
      if (!cancelled) setTerritories([]);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const params = {
        page: pagination.currentPage,
        limit: DEFAULT_PAGE_SIZE,
        include_stats: 1,
      };
      if (search.trim()) params.search = search.trim();
      if (statusFilter === 'Active' || statusFilter === 'Inactive') params.status = statusFilter;
      const standing = standingToApiFilter(paymentFilter);
      if (standing) params.standing = standing;
      if (territoryFilter === 'none') params.territory_id = 'none';
      else if (territoryFilter !== 'All') params.territory_id = territoryFilter;

      const res = await fetchCustomers(params);
      if (!active) return;
      if (res.success) {
        setCustomers(res.data || []);
        setTotalRecords(Number(res.pagination?.total) || 0);
        setStats(res.meta?.stats || null);
      } else {
        setCustomers([]);
        setTotalRecords(0);
        setStats(null);
        showToast?.(res.message || 'Failed to load customers.', 'error');
      }
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [pagination.currentPage, search, statusFilter, paymentFilter, territoryFilter, showToast]);

  const returnQuery = buildReturnQuery({
    search,
    statusFilter,
    paymentFilter,
    territoryFilter,
    page: pagination.currentPage,
  });

  if (loading && !customers.length && !stats) {
    return <LoadingState message="Loading branch customers..." />;
  }

  return (
    <div className="page">
      <Stats stats={[
        { label: 'Total Customers', value: String(stats?.totalCustomers ?? totalRecords) },
        { label: 'Active Customers', value: String(stats?.activeCustomers ?? '—') },
        { label: 'Overdue Customers', value: String(stats?.overdueCustomers ?? '—') },
        { label: 'Customers With Balance', value: String(stats?.hasBalanceCustomers ?? '—') },
        { label: 'Total Outstanding', value: formatCurrency(stats?.totalOutstanding || 0) },
      ]} />

      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <div>
            <h3>Customers</h3>
            <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
              Monitor and supervise customer accounts across your assigned branch.
            </p>
          </div>
        </div>

        <div className="list-section-toolbar suppliers-toolbar audit-logs-toolbar">
          <div className="list-section-controls audit-logs-filters">
            <input
              className="filter-input search"
              type="search"
              placeholder="Search name, code, phone, or address"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search customers"
            />
            <select
              className="filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              {['All', 'Active', 'Inactive'].map((s) => (
                <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s}</option>
              ))}
            </select>
            <select
              className="filter-select"
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              aria-label="Filter by payment standing"
            >
              {['All', 'Current', 'Has Balance', 'Overdue'].map((s) => (
                <option key={s} value={s}>
                  {s === 'All' ? 'All Standing' : s === 'Has Balance' ? 'With Balance' : s}
                </option>
              ))}
            </select>
            <select
              className="filter-select"
              value={territoryFilter}
              onChange={(e) => setTerritoryFilter(e.target.value)}
              aria-label="Filter by territory"
            >
              <option value="All">All Territories</option>
              <option value="none">No Territory</option>
              {territories.map((t) => (
                <option key={t.territory_id} value={t.territory_id}>{t.territory_name}</option>
              ))}
            </select>
          </div>
          <div className="list-section-actions suppliers-toolbar-actions">
            <button
              className="button secondary whitespace-nowrap"
              type="button"
              onClick={() => {
                const rows = customers.map((c) => ({
                  customer: formatCustomerFullName(c),
                  code: formatCustomerDisplayId(c),
                  phone: c.contact_phone || '',
                  area: areaOrAddress(c),
                  outstanding: money(c.outstandingBalance ?? c.outstanding_balance ?? 0),
                  standing: paymentStanding(c),
                  days_overdue: daysOverdueOf(c),
                  status: c.status || '',
                  sales_agent: c.assigned_sales_agent_name || '',
                }));
                if (downloadPdf(rows, { filename: 'branch-customers.pdf', title: 'Branch Customers' })) {
                  showToast?.('Customer list exported as PDF.', 'success');
                } else {
                  showToast?.('Nothing to export.', 'error');
                }
              }}
            >
              Export PDF
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
                    <th>Area</th>
                    <th>Outstanding</th>
                    <th>Standing</th>
                    <th>Days Overdue</th>
                    <th>Status</th>
                    <th>Sales Agent</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => {
                    const standing = paymentStanding(customer);
                    const code = formatCustomerDisplayId(customer);
                    const canNavigate = hasValidCoords(customer) || Boolean(String(customer.address || '').trim());
                    const overdueDays = daysOverdueOf(customer);
                    return (
                      <tr
                        key={customer.customer_id}
                        className="clickable-row"
                        onClick={() => navigate(`${opsBase}/customers/${customer.customer_id}${returnQuery}`)}
                      >
                        <td>
                          <strong>{formatCustomerFullName(customer)}</strong>
                          {code !== '—' ? (
                            <div className="muted" style={{ fontSize: '0.78rem' }}>{code}</div>
                          ) : null}
                          {customer.territory_name ? (
                            <div className="muted" style={{ fontSize: '0.75rem' }}>{customer.territory_name}</div>
                          ) : null}
                        </td>
                        <td>{customer.contact_phone || '—'}</td>
                        <td title={areaOrAddress(customer)}>{areaOrAddress(customer)}</td>
                        <td>{formatCurrency(customer.outstandingBalance ?? customer.outstanding_balance ?? 0)}</td>
                        <td><StatusBadge status={standing} /></td>
                        <td>{standing === 'Overdue' ? overdueDays : '—'}</td>
                        <td><StatusBadge status={customer.status || 'Active'} /></td>
                        <td>{customer.assigned_sales_agent_name || '—'}</td>
                        <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="icon-action-button"
                            type="button"
                            title="Open"
                            onClick={() => navigate(`${opsBase}/customers/${customer.customer_id}${returnQuery}`)}
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
                          {hasValidCoords(customer) ? (
                            <button
                              className="icon-action-button"
                              type="button"
                              title="View on Field Map"
                              onClick={() => navigate(`${opsBase}/leaflet?customer=${encodeURIComponent(customer.customer_id)}`)}
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
            title="No customer accounts found for this branch."
            description="Adjust search or standing filters. Customer registration stays with Sales Agents."
            actionLabel="Clear filters"
            onAction={() => {
              setSearch('');
              setStatusFilter('All');
              setPaymentFilter('All');
              setTerritoryFilter('All');
            }}
          />
        )}
      </section>
    </div>
  );
}

export function BranchCustomerDetailPage({
  customerId,
  navigate,
  opsBase,
  showToast,
  branchName,
}) {
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const backQuery = typeof window !== 'undefined'
    ? window.location.search
    : '';

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const res = await fetchCustomerById(customerId);
      if (cancelled) return;
      if (res.success && res.data) setCustomer(res.data);
      else {
        setCustomer(null);
        showToast?.(res.message || 'Customer not found.', 'error');
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [customerId, showToast]);

  if (loading) return <LoadingState variant="detail" message="Loading customer..." />;
  if (!customer) {
    return (
      <EmptyState
        title="Customer not found"
        description="This customer may not belong to your branch or no longer exists."
        actionLabel="Back to Customers"
        onAction={() => navigate(`${opsBase}/customers${backQuery}`)}
      />
    );
  }

  const outstanding = money(customer.activity?.outstanding_balance ?? customer.outstandingBalance ?? 0);
  const creditLimit = money(customer.creditInfo?.credit_limit || 0);
  const remaining = Math.max(0, creditLimit - outstanding);
  const standing = paymentStanding(customer);
  const overdueDays = daysOverdueOf(customer);
  const name = formatCustomerFullName(customer);
  const code = formatCustomerDisplayId(customer);
  const primaryContact = formatContactPersonName(customer);
  const secondary = formatSecondaryContactName(customer);
  const pinOk = hasValidCoords(customer);

  return (
    <div className="page account-detail-page">
      <section className="panel content-panel">
        <div className="panel-section-header">
          <div>
            <h3>Profile</h3>
            <p className="muted" style={{ marginTop: 4 }}>
              Read-only supervision view — same customer facts used by Sales and Collectors.
            </p>
          </div>
          <StatusBadge status={standing} />
        </div>
        <DetailRowsTable
          rows={[
            { label: 'Full Name', value: name },
            { label: 'Customer Code', value: code },
            { label: "Mother's Maiden Name", value: customer.mothers_maiden_name || '—' },
            { label: 'Civil Status', value: customer.civil_status || '—' },
            { label: 'Business / Mobile Phone', value: customer.contact_phone || '—' },
            { label: 'Portal Email', value: customer.portal_email || '—' },
            {
              label: 'Alternate Contact',
              value: primaryContact !== '—'
                ? `${primaryContact} · ${customer.contact_person_phone || '—'} · ${customer.contact_person_relationship || '—'}`
                : '—',
            },
            ...(secondary ? [{
              label: 'Secondary Contact',
              value: `${secondary} · ${customer.secondary_contact_phone || '—'} · ${customer.secondary_contact_relationship || '—'}`,
            }] : []),
            { label: 'Address', value: customer.address || '—' },
            { label: 'Account Status', value: <StatusBadge status={customer.status || '—'} /> },
            { label: 'ID / KYC Status', value: <StatusBadge status={customer.id_verification_status || 'Unverified'} /> },
            { label: 'Government ID', value: customer.id_type ? `${customer.id_type} · ${customer.id_number || '—'}` : '—' },
            { label: 'Branch', value: customer.branch_name || branchName || '—' },
            { label: 'Territory', value: customer.territory_name || '—' },
            { label: 'Assigned Sales Agent', value: customer.assigned_sales_agent_name || '—' },
            { label: 'Account Manager / Collector', value: customer.account_manager_name || '—' },
          ]}
        />
      </section>

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Money</h3>
        </div>
        <DetailRowsTable
          rows={[
            { label: 'Outstanding Balance', value: formatCurrency(outstanding) },
            { label: 'Credit Limit', value: formatCurrency(creditLimit) },
            { label: 'Remaining Credit', value: formatCurrency(remaining) },
            { label: 'Payment Standing', value: <StatusBadge status={standing} /> },
            { label: 'Days Overdue', value: standing === 'Overdue' ? String(overdueDays) : '—' },
            { label: 'Open Invoices', value: String(customer.unpaidInvoiceCount ?? '—') },
            {
              label: 'Last Payment',
              value: customer.activity?.last_collection_date
                ? formatDisplayDate(customer.activity.last_collection_date)
                : '—',
            },
            {
              label: 'Last Sale',
              value: customer.activity?.last_sales_visit
                ? formatDisplayDate(customer.activity.last_sales_visit)
                : '—',
            },
          ]}
        />
      </section>

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Location</h3>
        </div>
        <DetailRowsTable
          rows={[
            { label: 'Address', value: customer.address || '—' },
            {
              label: 'Coordinates',
              value: pinOk
                ? `${Number(customer.latitude).toFixed(6)}, ${Number(customer.longitude).toFixed(6)}`
                : 'No map pin',
            },
          ]}
        />
        {pinOk ? (
          <div style={{ minHeight: 220, borderRadius: 8, overflow: 'hidden', marginTop: 12 }}>
            <LeafletMap
              center={[Number(customer.latitude), Number(customer.longitude)]}
              zoom={15}
              height={220}
              markers={[{
                id: customer.customer_id,
                position: [Number(customer.latitude), Number(customer.longitude)],
                label: name.substring(0, 2).toUpperCase(),
                color: standing === 'Overdue' ? '#dc2626' : standing === 'Has Balance' ? '#d97706' : '#153450',
                popup: name,
              }]}
            />
          </div>
        ) : (
          <p className="muted">No map pin is set for this customer.</p>
        )}
        <div className="flex flex-wrap gap-2" style={{ marginTop: 12 }}>
          <button
            className="button secondary"
            type="button"
            onClick={() => handleCustomerNavigate(customer, showToast)}
          >
            Navigate
          </button>
          <button
            className="button secondary"
            type="button"
            disabled={!pinOk}
            onClick={() => navigate(`${opsBase}/leaflet?customer=${encodeURIComponent(customer.customer_id)}`)}
          >
            Open on Field Map
          </button>
        </div>
      </section>

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Recent Activity</h3>
        </div>
        <h4 className="subsection-title">Recent Sales</h4>
        {(customer.recentSales || []).length ? (
          <div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Due</th>
                  <th>Total</th>
                  <th>Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {customer.recentSales.map((sale) => (
                  <tr key={sale.sales_invoices_id}>
                    <td>{sale.invoice_number || sale.sales_invoices_id}</td>
                    <td>{sale.invoices_date ? formatDisplayDate(sale.invoices_date) : '—'}</td>
                    <td>{sale.due_date ? formatDisplayDate(sale.due_date) : '—'}</td>
                    <td>{formatCurrency(sale.total_amount || 0)}</td>
                    <td>{formatCurrency(sale.balance || 0)}</td>
                    <td><StatusBadge status={sale.status || '—'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No recent sales on record.</p>
        )}

        <h4 className="subsection-title">Recent Payments</h4>
        {(customer.paymentHistory || []).length ? (
          <div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Collector</th>
                  <th>Receipt</th>
                </tr>
              </thead>
              <tbody>
                {customer.paymentHistory.map((pay) => (
                  <tr key={pay.payment_id || `${pay.receipt_number}-${pay.payment_date}`}>
                    <td>{pay.payment_date ? formatDisplayDate(pay.payment_date) : '—'}</td>
                    <td>{formatCurrency(pay.amount || 0)}</td>
                    <td>{pay.payment_method || '—'}</td>
                    <td>{pay.collector_name || '—'}</td>
                    <td>{pay.receipt_number || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No recent payments on record.</p>
        )}
      </section>

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Credit</h3>
        </div>
        {customer.creditInfo ? (
          <DetailRowsTable
            rows={[
              { label: 'Credit Limit', value: formatCurrency(creditLimit) },
              { label: 'Current Exposure', value: formatCurrency(outstanding) },
              { label: 'Remaining Credit', value: formatCurrency(remaining) },
              { label: 'Monthly Income', value: formatCurrency(Number(customer.creditInfo.monthly_income || 0)) },
              { label: 'Credit Score', value: customer.creditInfo.credit_score || '—' },
              { label: 'Employment Status', value: customer.creditInfo.employment_status || '—' },
              { label: 'Approved By', value: customer.creditInfo.approved_by_name || '—' },
              {
                label: 'Approved Date',
                value: customer.creditInfo.approved_date
                  ? formatDisplayDate(customer.creditInfo.approved_date)
                  : '—',
              },
            ]}
          />
        ) : (
          <EmptyState title="No credit information" description="This customer has no credit record on file." />
        )}
      </section>

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Supervision Links</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="button secondary"
            type="button"
            onClick={() => navigate(`${opsBase}/credit-history?customerId=${encodeURIComponent(customer.customer_id)}`)}
          >
            View Payment History
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={() => navigate(`${opsBase}/ci-approvals?customerId=${encodeURIComponent(customer.customer_id)}`)}
          >
            Credit Reviews
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={() => navigate(`${opsBase}/field-activity-reports?customer_id=${encodeURIComponent(customer.customer_id)}&scope=week`)}
          >
            Field Activity Reports
          </button>
        </div>
      </section>

      <div className="flex justify-end gap-2 mt-4">
        <button
          className="button ghost"
          type="button"
          onClick={() => navigate(`${opsBase}/customers${backQuery}`)}
        >
          Back to Customers
        </button>
      </div>
    </div>
  );
}
