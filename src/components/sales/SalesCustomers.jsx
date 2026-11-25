import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  fetchCustomerById,
  fetchCustomers,
  fetchSalesCreditInvestigations,
} from '../../api/salesService';
import { getCurrentUser, getUserAssignedLocation } from '../../api/authService.js';
import {
  areaOrAddress,
  formatContactPersonName,
  formatCustomerDisplayId,
  formatCustomerFullName,
  formatSecondaryContactName,
  hasValidCoords,
} from '../../utils/customerDisplay';
import { handleCustomerNavigate } from '../../utils/mapsNavigation';
import { paymentStanding as sharedPaymentStanding } from '../../utils/customerStanding.js';
import { formatCurrency, formatDisplayDate } from '../../utils/formatters.js';
import { useServerPagination, DEFAULT_PAGE_SIZE } from '../../hooks/usePagination';
import LeafletMap from '../common/LeafletMap';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { DetailRowsTable } from '../shared/DetailRowsTable';
import { Pagination } from '../shared/Pagination';
import { RowActionMenu } from '../shared/RowActionMenu';
import { StatusBadge } from '../StatusBadge';
import { CreditReviewRequestModal } from '../shared/CreditReviewRequestModal';
import { FindExistingCustomerModal } from './FindExistingCustomerModal';

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function SortableTh({ label, column, sortBy, sortDir, onSort }) {
  const active = sortBy === column;
  return (
    <th>
      <button
        type="button"
        className="button ghost"
        style={{ padding: 0, fontWeight: 600 }}
        onClick={() => onSort(column)}
      >
        {label}
        {active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  );
}

function customerRowItems(customer, { navigate, showToast }) {
  const id = customer.customer_id;
  const active = customer.status === 'Active';
  const canNavigate = hasValidCoords(customer) || Boolean(String(customer.address || '').trim());
  const creditLimit = money(customer.creditLimit ?? customer.creditInfo?.credit_limit ?? 0);
  const openCiId = customer.openCiId || customer.open_ci_id || null;
  const openCiStatus = customer.openCiStatus || customer.open_ci_status || null;
  const pendingCi = openCiId && ['Pending', 'Revision', 'Needs Revision'].includes(String(openCiStatus || ''));

  return [
    {
      key: 'view',
      label: 'View',
      onSelect: () => navigate(`/sales/customer-detail/${id}?from=customers`),
    },
    active ? {
      key: 'edit',
      label: 'Edit',
      onSelect: () => navigate(`/sales/customers/${id}/edit`),
    } : null,
    active ? {
      key: 'log-sale',
      label: 'Log Sale',
      onSelect: () => navigate(`/sales/log-sale/${id}`),
    } : null,
    pendingCi ? {
      key: 'view-ci',
      label: 'View pending CI',
      onSelect: () => navigate(`/sales/credit-investigations/${openCiId}`),
    } : active && creditLimit <= 0 ? {
      key: 'credit-review',
      label: 'Credit Review',
      onSelect: () => navigate(`/sales/credit-investigations?customerId=${id}`),
    } : null,
    canNavigate ? {
      key: 'navigate',
      label: 'Navigate',
      onSelect: () => handleCustomerNavigate(customer, showToast),
    } : null,
  ];
}

function truncateText(value, max = 48) {
  const text = String(value || '').trim();
  if (!text) return '—';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function paymentStanding(customer) {
  return sharedPaymentStanding(customer);
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

export function CustomersPage({ navigate, showToast }) {
  const currentUser = getCurrentUser();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('Active');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [loading, setLoading] = useState(true);
  const [customersData, setCustomersData] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [findModalOpen, setFindModalOpen] = useState(false);
  const filterResetKey = `${search}|${filter}|${sortBy}|${sortDir}`;
  const pagination = useServerPagination({
    totalRecords,
    pageSize: DEFAULT_PAGE_SIZE,
    resetKey: filterResetKey,
  });

  const openAddCustomer = () => {
    setFindModalOpen(true);
  };

  const toggleSort = (column) => {
    if (sortBy === column) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortDir(column === 'name' || column === 'code' || column === 'territory' || column === 'status' ? 'asc' : 'desc');
    }
  };

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const params = {
        page: pagination.currentPage,
        limit: DEFAULT_PAGE_SIZE,
        sort_by: sortBy,
        sort_dir: sortDir,
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
  }, [pagination.currentPage, search, filter, sortBy, sortDir, showToast]);

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
            <button className="button" type="button" onClick={openAddCustomer}>
              Add Customer
            </button>
          </div>
        </div>
        <FindExistingCustomerModal
          open={findModalOpen}
          onClose={() => setFindModalOpen(false)}
          navigate={navigate}
          showToast={showToast}
        />
        {totalRecords ? (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <SortableTh label="Customer" column="name" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Code" column="code" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Territory" column="territory" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Outstanding" column="outstanding" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Credit Limit" column="credit_limit" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Status" column="status" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Registered" column="created_at" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customersData.map((customer) => {
                    const code = formatCustomerDisplayId(customer);
                    return (
                      <tr
                        key={customer.customer_id}
                        className="clickable-row"
                        onClick={() => navigate(`/sales/customer-detail/${customer.customer_id}?from=customers`)}
                      >
                        <td>
                          <strong>{formatCustomerFullName(customer)}</strong>
                          {customer.branch_name ? (
                            <div className="muted" style={{ fontSize: '0.75rem' }}>{customer.branch_name}</div>
                          ) : null}
                        </td>
                        <td>{code}</td>
                        <td>{customer.territory_name || areaOrAddress(customer)}</td>
                        <td>{formatCurrency(customer.outstandingBalance ?? customer.activity?.outstanding_balance ?? 0)}</td>
                        <td>{formatCurrency(customer.creditLimit ?? customer.creditInfo?.credit_limit ?? 0)}</td>
                        <td><StatusBadge status={customer.status} /></td>
                        <td>{formatDisplayDate(customer.created_at)}</td>
                        <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                          <RowActionMenu
                            label={`Actions for ${formatCustomerFullName(customer)}`}
                            items={customerRowItems(customer, { navigate, showToast })}
                          />
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
  const [searchParams, setSearchParams] = useSearchParams();
  const currentUser = getCurrentUser();
  const isSalesAgent = [
    currentUser?.roleSlug,
    currentUser?.role,
    currentUser?.role?.slug,
    currentUser?.role?.name,
  ].some((value) => ['sales_staff', 'Sales Agent'].includes(String(value || '')));
  const tabs = [
    ['overview', 'Overview'],
    ['business', 'Business Information'],
    ['address', 'Address & Territory'],
  ];
  const requestedTab = searchParams.get('tab');
  const activeTab = tabs.some(([key]) => key === requestedTab) ? requestedTab : 'overview';
  const selectTab = (tab) => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'overview') next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creditReviewOpen, setCreditReviewOpen] = useState(false);
  const [latestCi, setLatestCi] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLatestCi(null);
      const res = await fetchCustomerById(customerId);
      if (cancelled) return;
      if (res.success && res.data) setCustomer(res.data);
      else setCustomer(null);
      setLoading(false);
      // CI result is secondary: load without blocking the detail view.
      const ciRes = await fetchSalesCreditInvestigations({});
      if (cancelled) return;
      const rows = Array.isArray(ciRes?.data) ? ciRes.data : [];
      const forCustomer = rows.filter((row) => String(row.customer_id) === String(customerId));
      const open = forCustomer.find((row) => ['Pending', 'Revision Requested'].includes(row.status));
      setLatestCi(open || forCustomer[0] || null);
    }
    load();
    return () => { cancelled = true; };
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
  const remaining = customer.available_credit != null
    ? Math.max(0, money(customer.available_credit))
    : (hasCredit ? Math.max(0, creditLimit - outstanding) : null);

  // CI / credit result (read-only for Sales Agents; approved limit is set by Branch Manager).
  const ciStatus = latestCi?.status
    || (hasCredit && creditLimit > 0 ? 'Approved' : null);
  const ciApprovedLimit = ciStatus === 'Approved'
    ? money(latestCi?.approved_credit_limit ?? creditLimit)
    : 0;
  const ciAvailable = Math.max(0, ciApprovedLimit - outstanding);
  const ciDecidedAt = latestCi?.decided_at || customer.creditInfo?.approved_date || null;
  const ciDecidedBy = latestCi?.approved_by_name || customer.creditInfo?.approved_by_name || null;
  const lastBmDecision = Array.isArray(latestCi?.revision_history)
    ? [...latestCi.revision_history].reverse().find((entry) => entry?.event === 'bm_decision' && entry?.remarks)
    : null;
  const ciRevisionInstructions = latestCi?.decision_remarks || lastBmDecision?.remarks || null;
  const ciRejectionReason = latestCi?.rejection_reason || latestCi?.decision_remarks || null;
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
        <div className="segmented-control" role="tablist" aria-label="Customer detail sections">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={activeTab === key ? 'active' : ''}
              role="tab"
              aria-selected={activeTab === key}
              onClick={() => selectTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {activeTab === 'overview' ? <section className="panel content-panel">
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
            { label: 'Territory', value: customer.territory_name || '—' },
            { label: sameOwner ? 'Sales Agent' : 'Assigned Sales Agent', value: agentName },
            ...(!sameOwner && customer.account_manager_name
              ? [{ label: 'Account Manager / Collector', value: customer.account_manager_name }]
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
                style={{ maxWidth: 240, maxHeight: 160, borderRadius: 8, border: '1px solid var(--border)' }}
              />
            </a>
          </div>
        ) : null}
      </section> : null}

      {activeTab === 'business' ? <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Business Information</h3>
        </div>
        <DetailRowsTable
          rows={[
            { label: 'Customer Type', value: customer.customer_type || 'Individual' },
            { label: 'Business Name', value: customer.business_name || '—' },
            { label: 'Business Type', value: customer.registration_profile_json?.business_type || '—' },
            { label: 'Business Category', value: customer.registration_profile_json?.business_category || '—' },
            { label: 'Store Type', value: customer.registration_profile_json?.store_type || '—' },
            { label: 'Years of Operation', value: customer.registration_profile_json?.years_of_operation ?? '—' },
            { label: 'Estimated Monthly Revenue', value: customer.estimated_monthly_revenue != null ? formatCurrency(customer.estimated_monthly_revenue) : '—' },
            { label: 'Employment Status', value: customer.registration_profile_json?.employment?.employment_status || customer.creditInfo?.employment_status || '—' },
            { label: 'Employer', value: customer.registration_profile_json?.employment?.employer_name || '—' },
            { label: 'Position', value: customer.registration_profile_json?.employment?.position || '—' },
          ]}
        />
      </section> : null}

      {activeTab === 'overview' ? <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Money Status</h3>
          <p className="muted">Check standing before logging a sale or installment.</p>
        </div>
        <DetailRowsTable
          rows={[
            { label: 'Outstanding Balance', value: formatCurrency(outstanding) },
            { label: 'Credit Limit', value: hasCredit && creditLimit > 0 ? formatCurrency(creditLimit) : 'No credit on file' },
            { label: 'Available Credit', value: remaining == null ? '—' : formatCurrency(remaining) },
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
      </section> : null}

      {activeTab === 'overview' ? <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Credit Investigation Result</h3>
          <p className="muted">Credit limits are approved by the Branch Manager and cannot be edited here.</p>
        </div>
        <DetailRowsTable
          rows={[
            {
              label: 'CI Status',
              value: ciStatus ? <StatusBadge status={ciStatus} /> : 'No credit review on file',
            },
            ...(latestCi?.ci_id ? [
              { label: 'CI Reference', value: `CI #${latestCi.ci_id}` },
              ...(latestCi.requested_credit_limit != null
                ? [{ label: 'Requested Limit', value: formatCurrency(latestCi.requested_credit_limit) }]
                : []),
            ] : []),
            ...(ciStatus === 'Approved' ? [
              { label: 'Approved Credit Limit', value: formatCurrency(ciApprovedLimit) },
              { label: 'Outstanding', value: formatCurrency(outstanding) },
              { label: 'Available Credit', value: formatCurrency(ciAvailable) },
              ...(ciDecidedAt ? [{ label: 'Approved On', value: formatDisplayDate(ciDecidedAt) }] : []),
              ...(ciDecidedBy ? [{ label: 'Approved By', value: ciDecidedBy }] : []),
            ] : []),
            ...(ciStatus === 'Rejected' ? [
              { label: 'Rejection Reason', value: ciRejectionReason || 'No reason recorded.' },
              ...(ciDecidedAt ? [{ label: 'Decided On', value: formatDisplayDate(ciDecidedAt) }] : []),
              ...(ciDecidedBy ? [{ label: 'Decided By', value: ciDecidedBy }] : []),
            ] : []),
            ...(ciStatus === 'Revision Requested' ? [
              { label: 'Revision Instructions', value: ciRevisionInstructions || 'No instructions provided.' },
            ] : []),
            ...(ciStatus === 'Pending' ? [
              { label: 'Next Step', value: 'Awaiting Branch Manager decision.' },
            ] : []),
          ]}
        />
        {latestCi?.ci_id && ['Pending', 'Revision Requested'].includes(ciStatus) ? (
          <div style={{ marginTop: 12 }}>
            <button
              className="button secondary"
              type="button"
              onClick={() => navigate(`/sales/credit-investigations/${latestCi.ci_id}`)}
            >
              {ciStatus === 'Revision Requested' ? 'Open CI to Revise' : 'View CI'}
            </button>
          </div>
        ) : null}
      </section> : null}

      {activeTab === 'address' ? <section className="panel content-panel">
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
              color: 'var(--text)',
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
      </section> : null}

      {!isSalesAgent && activeTab === 'overview' ? <section className="panel content-panel">
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
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 16 }}>
                    No recent payments
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section> : null}

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
        {!isSalesAgent ? (
          <button
            className="button secondary"
            type="button"
            onClick={() => navigate(`/sales/credit-history?customerId=${customer.customer_id}`)}
          >
            View Payment History
          </button>
        ) : null}
        {customer.status === 'Active' ? (
          <button
            className="button secondary"
            type="button"
            onClick={() => setCreditReviewOpen(true)}
          >
            Request Credit Review
          </button>
        ) : null}
        {customer.status === 'Pending Identity Review' ? (
          <p className="muted" style={{ flexBasis: '100%', margin: 0 }}>
            Pending Identity Review — Branch Manager must approve before cash sales or credit requests.
          </p>
        ) : null}
        {customer.status === 'Active' ? (
          <button className="button" type="button" onClick={() => navigate(`/sales/log-sale/${customer.customer_id}`)}>
            Log a Sale
          </button>
        ) : null}
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
