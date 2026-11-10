import { useEffect, useState } from 'react';
import { fetchAccounts, fetchAccountById, flagCustomerForCreditReview } from '../../api/collectorService';
import { getCurrentUser, getUserAssignedLocation } from '../../api/authService.js';
import {
  formatContactPersonName,
  formatCustomerDisplayId,
  formatCustomerFullName,
  formatSecondaryContactName,
} from '../../utils/customerDisplay';
import { openExternalNavigation } from '../../utils/mapsNavigation';
import { paymentStanding as sharedPaymentStanding } from '../../utils/customerStanding.js';
import { formatCurrency, formatDisplayDate } from '../../utils/formatters.js';
import { useServerPagination, DEFAULT_PAGE_SIZE } from '../../hooks/usePagination';
import LeafletMap from '../common/LeafletMap';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { DetailRowsTable } from '../shared/DetailRowsTable';
import { Pagination } from '../shared/Pagination';
import { StatusBadge } from '../StatusBadge';
import { NavIcon } from '../../navIcons';

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
  if (customer?.paymentStanding) return customer.paymentStanding;
  return sharedPaymentStanding(customer);
}

function creditStatusLabel(customer) {
  const outstanding = money(customer?.activity?.outstanding_balance ?? customer?.outstandingBalance ?? 0);
  const hasCredit = Boolean(customer?.creditInfo);
  const limit = money(customer?.creditInfo?.credit_limit || customer?.credit_limit || 0);
  if (!hasCredit || limit <= 0) return 'No Credit';
  if (outstanding > limit) return 'Over Limit';
  return 'Has Limit';
}

function kycStatusLabel(customer) {
  return customer?.id_verification_status || 'Unverified';
}

function daysOverdueValue(customer) {
  if (Number.isFinite(Number(customer?.daysOverdue))) return Number(customer.daysOverdue);
  const outstanding = money(customer?.activity?.outstanding_balance ?? customer?.outstandingBalance ?? 0);
  const earliest = customer?.earliestDueDate;
  if (outstanding <= 0 || !earliest) return 0;
  const manilaToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
  const asOf = new Date(`${manilaToday}T12:00:00`);
  const due = new Date(earliest);
  return Math.max(0, Math.floor((asOf - due) / 86400000));
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

export function AccountsPage({ navigate, showToast }) {
  const currentUser = getCurrentUser();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('Active');
  const [standingFilter, setStandingFilter] = useState('All Standing');
  const [loading, setLoading] = useState(true);
  const [customersData, setCustomersData] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const filterResetKey = `${search}|${statusFilter}|${standingFilter}`;
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
      if (statusFilter === 'Active') params.status = 'Active';
      else if (statusFilter === 'Inactive') params.status = 'Inactive';
      if (standingFilter === 'Assigned Today') params.standing = 'assigned_today';
      else if (standingFilter === 'Overdue') params.standing = 'overdue';
      else if (standingFilter === 'With Balance') params.standing = 'with_balance';

      const res = await fetchAccounts(params);
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
  }, [pagination.currentPage, search, statusFilter, standingFilter, showToast]);

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('Active');
    setStandingFilter('All Standing');
  };

  if (loading) return <LoadingState message="Loading customers..." />;

  return (
    <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3>Customers <span className="text-ink/70">({totalRecords})</span></h3>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Accounts assigned to your branch in {getUserAssignedLocation(currentUser)} — check balance and standing before visiting or logging a collection.
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
            <select
              className="filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Customer account status"
            >
              {['Active', 'Inactive', 'All'].map((option) => (
                <option key={option} value={option}>{option === 'All' ? 'All Customers' : option}</option>
              ))}
            </select>
            <select
              className="filter-select"
              value={standingFilter}
              onChange={(e) => setStandingFilter(e.target.value)}
              aria-label="Collection standing"
            >
              {['All Standing', 'Assigned Today', 'Overdue', 'With Balance'].map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
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
                    <th>Days Overdue</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customersData.map((customer) => {
                    const code = formatCustomerDisplayId(customer);
                    const canNavigate = hasValidCoords(customer) || Boolean(String(customer.address || '').trim());
                    const detailPath = `/collector/account-detail/${customer.customer_id || customer.id}?from=accounts`;
                    return (
                      <tr
                        key={customer.customer_id || customer.id}
                        className="clickable-row"
                        onClick={() => navigate(detailPath)}
                      >
                        <td>
                          <strong>{formatCustomerFullName(customer) !== '—' ? formatCustomerFullName(customer) : customer.customerName}</strong>
                          {code !== '—' ? (
                            <div className="muted" style={{ fontSize: '0.78rem' }}>{code}</div>
                          ) : null}
                        </td>
                        <td>{customer.contact_phone || customer.phone || '—'}</td>
                        <td title={areaOrAddress(customer)}>{truncateText(areaOrAddress(customer), 56)}</td>
                        <td>{formatCurrency(customer.outstandingBalance ?? customer.activity?.outstanding_balance ?? 0)}</td>
                        <td>{daysOverdueValue(customer)}</td>
                        <td><StatusBadge status={customer.status || 'Active'} /></td>
                        <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="icon-action-button"
                            type="button"
                            title="View"
                            onClick={() => navigate(detailPath)}
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
            description="Adjust your search or filters."
            actionLabel="Clear filters"
            onAction={clearFilters}
          />
        )}
      </section>
    </div>
  );
}

export function AccountDetailPage({
  accountId,
  parentContext,
  navigate,
  showToast,
}) {
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [flagReason, setFlagReason] = useState('');
  const [flagNote, setFlagNote] = useState('');
  const [flagging, setFlagging] = useState(false);
  const isFromRoute = parentContext === 'route';

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await fetchAccountById(accountId);
      if (res.success && res.data) setCustomer(res.data);
      else setCustomer(null);
      setLoading(false);
    }
    load();
  }, [accountId]);

  const onRouteToday = Boolean(customer?.todayVisit);
  const canCollect = isFromRoute && onRouteToday;
  const backTo = isFromRoute ? '/collector/route' : '/collector/accounts';
  const backLabel = isFromRoute ? 'Back to Route' : 'Back to Customers';

  if (loading) return <LoadingState message="Loading customer details..." />;
  if (!customer) {
    return (
      <EmptyState
        title="Customer not found"
        actionLabel={backLabel}
        onAction={() => navigate(backTo)}
      />
    );
  }

  const outstanding = money(customer.activity?.outstanding_balance ?? customer.outstandingBalance ?? 0);
  const hasCredit = Boolean(customer.creditInfo);
  const creditLimit = money(customer.creditInfo?.credit_limit || customer.credit_limit || 0);
  const remaining = hasCredit && creditLimit > 0 ? Math.max(0, creditLimit - outstanding) : null;
  const standing = paymentStanding(customer);
  const ownerName = formatCustomerFullName(customer) !== '—'
    ? formatCustomerFullName(customer)
    : (customer.customerName || '—');
  const displayCode = formatCustomerDisplayId(customer);
  const primaryContactName = formatContactPersonName(customer);
  const secondaryName = formatSecondaryContactName(customer);
  const pinOk = hasValidCoords(customer);
  const agentName = customer.assigned_sales_agent_name || customer.account_manager_name || '—';
  const sameOwner = customer.assigned_sales_agent_name
    && customer.account_manager_name
    && customer.assigned_sales_agent_name === customer.account_manager_name;
  const overdueDays = daysOverdueValue(customer);
  const oldestDue = customer.earliestDueDate || null;
  const lastCollectionVisit = customer.lastFieldVisitDate || null;
  const canNavigate = pinOk || Boolean(String(customer.address || '').trim());
  const invoices = customer.recentSales || [];
  const payments = customer.paymentHistory || [];

  return (
    <div className="page account-detail-page">
      {!isFromRoute && onRouteToday ? (
        <section className="panel content-panel" style={{ marginBottom: 12 }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <strong>On Today&apos;s Route</strong>
              <p className="muted" style={{ margin: '4px 0 0' }}>
                This customer is assigned to your published route. Directory view stays read-only.
              </p>
            </div>
            <button
              className="button"
              type="button"
              onClick={() => navigate(`/collector/account-detail/${customer.customer_id || customer.id}?from=route`)}
            >
              Open Stop
            </button>
          </div>
        </section>
      ) : null}

      {canCollect && customer.todayVisit ? (
        <section className="panel content-panel" style={{ marginBottom: 12 }}>
          <div className="panel-section-header">
            <h3>Today&apos;s Visit</h3>
            <p className="muted">Published route stop for this collector.</p>
          </div>
          <DetailRowsTable
            rows={[
              { label: 'Visit Status', value: <StatusBadge status={customer.todayVisit.status || 'Pending'} /> },
              ...(customer.todayVisit.visit_outcome
                ? [{ label: 'Visit Outcome', value: customer.todayVisit.visit_outcome }]
                : []),
              {
                label: 'Scheduled',
                value: customer.todayVisit.scheduled_date
                  ? formatDisplayDate(customer.todayVisit.scheduled_date)
                  : '—',
              },
            ]}
          />
        </section>
      ) : null}

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
            { label: 'Business / Mobile Phone', value: customer.contact_phone || customer.phone || '—' },
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
                style={{ maxWidth: 240, maxHeight: 160, borderRadius: 8, border: '1px solid #E2E8F0' }}
              />
            </a>
          </div>
        ) : null}
      </section>

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Flag for Credit Review</h3>
          <p className="muted">
            Field observation only — this does not create a formal credit investigation or change the credit limit.
          </p>
        </div>
        <div className="form-group">
          <label htmlFor="ci-flag-reason">Reason</label>
          <select
            id="ci-flag-reason"
            className="filter-select"
            value={flagReason}
            onChange={(e) => setFlagReason(e.target.value)}
          >
            <option value="">Select reason</option>
            <option value="Customer frequently requests additional credit">Customer frequently requests additional credit</option>
            <option value="Customer has payment difficulties">Customer has payment difficulties</option>
            <option value="Customer reports a change in employment">Customer reports a change in employment</option>
            <option value="Customer requests a higher credit limit">Customer requests a higher credit limit</option>
            <option value="Possible account-risk concern">Possible account-risk concern</option>
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="ci-flag-note">Supporting note</label>
          <textarea
            id="ci-flag-note"
            rows={2}
            value={flagNote}
            onChange={(e) => setFlagNote(e.target.value)}
            placeholder="Optional field observation"
          />
        </div>
        <button
          className="button secondary"
          type="button"
          disabled={flagging || !flagReason}
          onClick={async () => {
            setFlagging(true);
            const res = await flagCustomerForCreditReview({
              customer_id: customer.customer_id || customer.id,
              reason: flagReason,
              observation: flagNote || null,
              note: flagNote || null,
            });
            setFlagging(false);
            if (!res.success) {
              showToast?.(res.message || 'Failed to flag customer.', 'error');
              return;
            }
            showToast?.(res.message || 'Customer flagged for credit review.', 'success');
            setFlagReason('');
            setFlagNote('');
          }}
        >
          {flagging ? 'Submitting…' : 'Submit Flag'}
        </button>
      </section>

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Money Status</h3>
          <p className="muted">Check standing before visiting or logging a collection.</p>
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
            {
              label: 'Open Invoices',
              value: String(customer.unpaidInvoiceCount || invoices.length || 0),
            },
            { label: 'Days Overdue', value: String(overdueDays) },
            {
              label: 'Oldest Due Date',
              value: oldestDue ? formatDisplayDate(oldestDue) : '—',
            },
            {
              label: 'Last Collection Visit',
              value: lastCollectionVisit ? formatDisplayDate(lastCollectionVisit) : '—',
            },
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
              id: customer.customer_id || customer.id,
              position: [Number(customer.latitude), Number(customer.longitude)],
              popup: `<strong>${ownerName}</strong><br/>${customer.address || ''}`,
              color: '#0B2133',
            }]}
          />
        ) : (
          <EmptyState title="No location pin set." description="Ask Sales to drop a map pin on this customer record." />
        )}
        <div className="flex flex-wrap gap-2" style={{ marginTop: 12 }}>
          <button
            className="button secondary"
            type="button"
            disabled={!canNavigate}
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

        <h4 className="subsection-title">Open / Recent Sales Invoices</h4>
        <div className="table-shell" style={{ marginBottom: 16 }}>
          <table className="corvex-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Date</th>
                <th>Due Date</th>
                <th>Amount</th>
                <th>Balance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length ? invoices.map((sale) => (
                <tr key={sale.sales_invoices_id || sale.invoice_number}>
                  <td>{sale.invoice_number}</td>
                  <td>{formatDisplayDate(sale.invoices_date)}</td>
                  <td>{sale.due_date ? formatDisplayDate(sale.due_date) : '—'}</td>
                  <td>{formatCurrency(sale.total_amount)}</td>
                  <td>{formatCurrency(sale.balance != null ? sale.balance : sale.total_amount)}</td>
                  <td><StatusBadge status={sale.status} /></td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: '#5F7385', padding: 16 }}>
                    No open invoices
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <h4 className="subsection-title">Payments / Collections</h4>
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
              {payments.length ? payments.map((payment) => (
                <tr key={payment.payment_id || payment.receipt_number || payment.receipt}>
                  <td>{formatDisplayDate(payment.payment_date || payment.date)}</td>
                  <td>{payment.receipt_number || payment.receipt || '—'}</td>
                  <td>{formatCurrency(Number(payment.amount))}</td>
                  <td>{payment.payment_method || payment.method || '—'}</td>
                  <td>{payment.collector_name || payment.collector || '—'}</td>
                  <td><StatusBadge status={payment.payment_status || payment.status || 'Completed'} /></td>
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
        <button className="button secondary" type="button" onClick={() => navigate(backTo)}>
          {backLabel}
        </button>
        <button
          className="button secondary"
          type="button"
          disabled={!canNavigate}
          onClick={() => handleCustomerNavigate(customer, showToast)}
        >
          Navigate
        </button>
        {canCollect ? (
          <>
            <button
              className="button secondary"
              type="button"
              onClick={() =>
                navigate(
                  `/collector/field-reports?customer=${customer.customer_id || customer.id}${
                    customer.todayVisit?.visit_id ? `&visitId=${customer.todayVisit.visit_id}` : ''
                  }&from=route`
                )
              }
            >
              File Field Report
            </button>
            <button
              className="button"
              type="button"
              disabled={outstanding <= 0}
              onClick={() =>
                navigate(`/collector/collection-log/${customer.customer_id || customer.id}?from=route`)
              }
            >
              Log Collection
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
