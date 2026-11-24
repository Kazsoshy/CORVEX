import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  fetchCustomerById,
  fetchCustomers,
  fetchSalesCreditInvestigations,
  fetchBranchTransfers,
  resubmitBranchTransfer,
  updateCustomer,
} from '../../api/salesService';
import { resendCustomerPortalInvitation } from '../../api/customerPortalService.js';
import { getCurrentUser, getUserAssignedLocation } from '../../api/authService.js';
import { getUserBranchId } from '../branchManager/approvalCenterHelpers.js';
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
import { RowActionMenu } from '../shared/RowActionMenu';
import { StatusBadge } from '../StatusBadge';
import { CreditReviewRequestModal } from '../shared/CreditReviewRequestModal';
import { FindExistingCustomerModal } from './FindExistingCustomerModal';
import { BranchTransferRequestForm } from './BranchTransferRequestForm';
import {
  BranchTransferProgressModal,
  persistOpenTransferId,
} from './BranchTransferProgressModal';

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

  function customerRowItems(customer, { navigate }) {
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
        label: 'Apply for Credit',
        onSelect: () => navigate(`/sales/credit-investigations?customerId=${id}`),
      } : null,
      canNavigate ? {
        key: 'navigate',
        label: 'Navigate',
        onSelect: () => handleCustomerNavigate(customer, showToast),
      } : null,
    ];
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
    return sharedPaymentStanding(customer);
  }

  function customerCreditLimit(customer) {
    return money(
      customer?.creditInfo?.credit_limit
      ?? customer?.creditLimit
      ?? customer?.approved_credit_limit
      ?? 0
    );
  }

  function accountEligibilityLabel(customer) {
    if (customerCreditLimit(customer) > 0) return 'Installment / Credit';
    return 'Cash / Spot Cash';
  }

  function matchesEligibilityFilter(customer, eligibilityFilter) {
    const limit = customerCreditLimit(customer);
    if (eligibilityFilter === 'cash') return limit <= 0;
    if (eligibilityFilter === 'credit') return limit > 0;
    return true;
  }

  function portalStatusLabel(status) {
    const raw = String(status || 'none').toLowerCase();
    if (raw === 'active') return 'Active';
    if (raw === 'invited') return 'Invited';
    return 'None';
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

  export function CustomersPage({ navigate, showToast }) {
    const currentUser = getCurrentUser();
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('Active');
    const [eligibilityFilter, setEligibilityFilter] = useState('all');
    const [sortBy, setSortBy] = useState('created_at');
    const [sortDir, setSortDir] = useState('desc');
    const [loading, setLoading] = useState(true);
    const [customersData, setCustomersData] = useState([]);
    const [totalRecords, setTotalRecords] = useState(0);
    const [findModalOpen, setFindModalOpen] = useState(false);
    const [myTransfers, setMyTransfers] = useState([]);
    const [transfersLoading, setTransfersLoading] = useState(false);
    const [transfersPanelOpen, setTransfersPanelOpen] = useState(false);
    const [progressOpen, setProgressOpen] = useState(false);
    const [progressTransferId, setProgressTransferId] = useState(null);
    const [transferFormOpen, setTransferFormOpen] = useState(false);
    const [transferBusy, setTransferBusy] = useState(false);
    const [resubmitTransfer, setResubmitTransfer] = useState(null);
    const filterResetKey = `${search}|${filter}|${eligibilityFilter}|${sortBy}|${sortDir}`;
    const receivingBranchId = getUserBranchId(currentUser);
    const receivingBranchLabel = getUserAssignedLocation(currentUser)
      || currentUser?.branch?.name
      || currentUser?.branch_name
      || 'Assigned branch';
    const pagination = useServerPagination({
      totalRecords,
      pageSize: DEFAULT_PAGE_SIZE,
      resetKey: filterResetKey,
    });

    const openAddCustomer = () => {
      setFindModalOpen(true);
    };

    const loadMyTransfers = async () => {
      setTransfersLoading(true);
      const res = await fetchBranchTransfers({ mine: 1, limit: 30 });
      setTransfersLoading(false);
      if (!res.success) {
        setMyTransfers([]);
        return;
      }
      const rows = [...(res.data || [])].sort((a, b) => (
        new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0)
      ));
      setMyTransfers(rows);
    };

    const openTransferProgress = (transferId) => {
      if (!transferId) return;
      persistOpenTransferId(transferId);
      setProgressTransferId(Number(transferId));
      setProgressOpen(true);
    };

    const submitTransferResubmit = async (payload) => {
      if (!resubmitTransfer?.transfer_id) return;
      setTransferBusy(true);
      try {
        const res = await resubmitBranchTransfer(resubmitTransfer.transfer_id, payload);
        if (res.success) {
          showToast?.(res.message || 'Transfer resubmitted.', 'success');
          setTransferFormOpen(false);
          openTransferProgress(res.data?.transfer_id || resubmitTransfer.transfer_id);
          loadMyTransfers();
          return;
        }
        showToast?.(res.message || 'Could not resubmit transfer.', 'error');
      } finally {
        setTransferBusy(false);
      }
    };

    const isOpenTransfer = (t) => !['Approved', 'Rejected', 'Cancelled'].includes(String(t.status || ''));
    const openTransfers = myTransfers.filter(isOpenTransfer);
    const openTransferCount = openTransfers.length;

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
        else if (filter === 'Pending Identity Review') params.status = 'Pending Identity Review';
        else if (filter === 'Rejected') params.status = 'Rejected';
        if (eligibilityFilter === 'cash' || eligibilityFilter === 'credit') {
          params.eligibility = eligibilityFilter;
        }
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
    }, [pagination.currentPage, search, filter, eligibilityFilter, sortBy, sortDir, showToast]);

    useEffect(() => {
      loadMyTransfers();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const visibleCustomers = useMemo(
      () => customersData.filter((customer) => matchesEligibilityFilter(customer, eligibilityFilter)),
      [customersData, eligibilityFilter]
    );
    const displayTotal = eligibilityFilter === 'all'
      ? totalRecords
      : (visibleCustomers.length < customersData.length
        ? visibleCustomers.length
        : totalRecords);

    return (
      <div className="page">
        <section className="panel content-panel relative overflow-hidden">
          <div className="list-section-header">
            <h3>Customers <span className="text-ink/70">({displayTotal})</span></h3>
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
                {[
                  ['Active', 'Active'],
                  ['Inactive', 'Inactive'],
                  ['Pending Identity Review', 'Pending review'],
                  ['Rejected', 'Rejected'],
                  ['All', 'All statuses'],
                ].map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <select
                className="filter-select"
                value={eligibilityFilter}
                onChange={(e) => setEligibilityFilter(e.target.value)}
                title="Account eligibility"
              >
                <option value="all">All eligibility</option>
                <option value="cash">Cash / Spot Cash</option>
                <option value="credit">Installment / Credit</option>
              </select>
              <button className="button" type="button" onClick={openAddCustomer}>
                Add Customer
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={async () => {
                  const next = !transfersPanelOpen;
                  setTransfersPanelOpen(next);
                  if (next) await loadMyTransfers();
                }}
                disabled={transfersLoading}
                title="Show or hide open branch transfer requests you submitted"
              >
                {transfersLoading
                  ? 'Loading transfers…'
                  : transfersPanelOpen
                    ? 'Hide branch transfers'
                    : `My branch transfers${openTransferCount ? ` (${openTransferCount})` : ''}`}
              </button>
            </div>
          </div>

          {transfersPanelOpen ? (
            <div className="panel" style={{ margin: '0 0 12px', padding: 12 }}>
              <div className="flex flex-wrap justify-between gap-2 items-center" style={{ marginBottom: 8 }}>
                <strong>My open branch transfers</strong>
                <button
                  className="button ghost"
                  type="button"
                  style={{ padding: '2px 8px' }}
                  onClick={loadMyTransfers}
                  disabled={transfersLoading}
                >
                  Refresh
                </button>
              </div>
              <p className="muted" style={{ fontSize: '0.85rem', marginTop: 0 }}>
                Open requests only (Receiving BM → Source BM → OM). Closed transfers stay off this list.
              </p>
              {openTransfers.length ? (
                <div className="corvex-table-wrapper">
                  <table className="corvex-table">
                    <thead>
                      <tr>
                        <th>Reference</th>
                        <th>Customer</th>
                        <th>From → To</th>
                        <th>Status</th>
                        <th>Updated</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openTransfers.map((t) => {
                        const name = [t.first_name, t.last_name].filter(Boolean).join(' ')
                          || t.customer_code
                          || `Customer #${t.customer_id}`;
                        const ref = t.progress?.transfer_ref || `CBT-${t.transfer_id}`;
                        return (
                          <tr key={t.transfer_id}>
                            <td>{ref}</td>
                            <td>
                              <strong>{name}</strong>
                              {t.customer_code ? (
                                <div className="muted" style={{ fontSize: '0.75rem' }}>{t.customer_code}</div>
                              ) : null}
                            </td>
                            <td>
                              {(t.source_branch_name || '—')}
                              {' → '}
                              {(t.target_branch_name || '—')}
                            </td>
                            <td><StatusBadge status={t.status} /></td>
                            <td>{formatDisplayDate(t.updated_at || t.created_at)}</td>
                            <td className="table-actions">
                              <RowActionMenu
                                label={`Actions for ${ref}`}
                                items={[
                                  {
                                    key: 'status',
                                    label: 'View status',
                                    onSelect: () => openTransferProgress(t.transfer_id),
                                  },
                                  ['Returned to SA', 'Needs Revision'].includes(String(t.status)) ? {
                                    key: 'correct',
                                    label: 'Correct location',
                                    onSelect: () => {
                                      setResubmitTransfer(t);
                                      setTransferFormOpen(true);
                                    },
                                  } : null,
                                  t.customer_id ? {
                                    key: 'profile',
                                    label: 'Open customer',
                                    onSelect: () => navigate(`/sales/customer-detail/${t.customer_id}?from=customers`),
                                  } : null,
                                ].filter(Boolean)}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  title="No open transfers"
                  description="Cross-branch requests you submit will appear here until they are approved or rejected."
                />
              )}
            </div>
          ) : null}

          <FindExistingCustomerModal
            open={findModalOpen}
            onClose={() => {
              setFindModalOpen(false);
              loadMyTransfers();
            }}
            navigate={navigate}
            showToast={showToast}
          />
          <BranchTransferProgressModal
            open={progressOpen}
            transferId={progressTransferId}
            showToast={showToast}
            onClose={() => {
              persistOpenTransferId(null);
              setProgressOpen(false);
              loadMyTransfers();
            }}
            onOpenProfile={(customerId) => {
              persistOpenTransferId(null);
              setProgressOpen(false);
              navigate(`/sales/customer-detail/${customerId}?from=customers`);
            }}
            onCorrectLocation={(transfer) => {
              setResubmitTransfer(transfer);
              setProgressOpen(false);
              setTransferFormOpen(true);
            }}
          />
          <BranchTransferRequestForm
            open={transferFormOpen}
            match={{
              customer_id: resubmitTransfer?.customer_id,
              customer_code: resubmitTransfer?.customer_code,
              first_name: resubmitTransfer?.first_name,
              last_name: resubmitTransfer?.last_name,
              branch_name: resubmitTransfer?.source_branch_name,
            }}
            receivingBranchId={receivingBranchId}
            receivingBranchLabel={receivingBranchLabel}
            mode="resubmit"
            busy={transferBusy}
            initialReason={resubmitTransfer?.reason || ''}
            initialLocation={resubmitTransfer ? {
              address_region: resubmitTransfer.address_region,
              address_province: resubmitTransfer.address_province,
              address_city: resubmitTransfer.address_city,
              address_barangay: resubmitTransfer.address_barangay,
              address_street: resubmitTransfer.address_street,
              latitude: resubmitTransfer.latitude,
              longitude: resubmitTransfer.longitude,
            } : null}
            showToast={showToast}
            onClose={() => setTransferFormOpen(false)}
            onSubmit={submitTransferResubmit}
          />
          {loading ? (
            <LoadingState message="Loading customers..." />
          ) : visibleCustomers.length ? (
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
                      <th>Eligibility</th>
                      <SortableTh label="Status" column="status" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCustomers.map((customer) => {
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
                          <td>{formatCurrency(customerCreditLimit(customer))}</td>
                          <td>{accountEligibilityLabel(customer)}</td>
                          <td><StatusBadge status={customer.status} /></td>
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
                setEligibilityFilter('all');
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
    const [inviteOpen, setInviteOpen] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [portalBusy, setPortalBusy] = useState(false);

    useEffect(() => {
      let cancelled = false;
      async function load() {
        setLoading(true);
        setLatestCi(null);
        setInviteOpen(false);
        setInviteEmail('');
        const res = await fetchCustomerById(customerId);
        if (cancelled) return;
        if (res.success && res.data) {
          setCustomer(res.data);
        } else {
          setCustomer(null);
        }
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

    const portalActive = String(customer.portal_status || '').toLowerCase() === 'active';
    const portalInvited = String(customer.portal_status || '').toLowerCase() === 'invited';
    const isFirstCredit = !(hasCredit && creditLimit > 0);

    return (
      <div className="page account-detail-page">
        {activeTab === 'overview' ? <section className="panel content-panel">
          <div className="segmented-control" role="tablist" aria-label="Customer detail sections" style={{ marginBottom: 12 }}>
            {tabs.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={activeTab === key ? 'segment active' : 'segment'}
                role="tab"
                aria-selected={activeTab === key}
                onClick={() => selectTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="panel-section-header panel-section-header-compact">
            <h3>Profile</h3>
          </div>
          <DetailRowsTable
            dense
            rows={[
              { label: 'Full Name', value: ownerName },
              { label: 'Customer Code', value: displayCode },
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
              { label: 'Account Eligibility', value: accountEligibilityLabel(customer) },
              { label: 'ID / KYC Status', value: <StatusBadge status={kycStatusLabel(customer)} /> },
              { label: 'Government ID', value: customer.id_type ? `${customer.id_type} · ${customer.id_number || '—'}` : '—' },
              { label: 'Credit Status', value: <StatusBadge status={creditStatusLabel(customer)} /> },
              { label: 'Branch', value: customer.branch_name || '—' },
              { label: 'Territory', value: customer.territory_name || '—' },
              ...(customer.territory_override_note
                ? [{
                  label: 'Territory exception',
                  value: customer.status === 'Pending Identity Review'
                    ? `${customer.territory_override_note} · awaiting BM review`
                    : customer.territory_override_note,
                }]
                : []),
              { label: sameOwner ? 'Sales Agent' : 'Assigned Sales Agent', value: agentName },
              ...(!sameOwner && customer.account_manager_name
                ? [{ label: 'Account Manager / Collector', value: customer.account_manager_name }]
                : []),
            ]}
          />
          {customer.id_photo ? (
            <div style={{ marginTop: 8 }}>
              <p className="muted" style={{ marginBottom: 4, fontSize: 12 }}>ID Photo</p>
              <a href={customer.id_photo} target="_blank" rel="noreferrer">
                <img
                  src={customer.id_photo}
                  alt="Government ID"
                  style={{ maxWidth: 200, maxHeight: 130, borderRadius: 6, border: '1px solid #E2E8F0' }}
                />
              </a>
            </div>
          ) : null}

          <div className="panel-section-header panel-section-header-compact" style={{ marginTop: 16 }}>
            <div>
              <h3>Customer portal</h3>
              <p className="muted" style={{ marginTop: 2 }}>
                Portal needs an email. Cash sales work without it — invite only when you have a reachable address.
              </p>
            </div>
          </div>
          <DetailRowsTable
            dense
            rows={[
              { label: 'Portal Email', value: customer.portal_email || '—' },
              { label: 'Portal Status', value: <StatusBadge status={portalStatusLabel(customer.portal_status)} /> },
            ]}
          />
          {!portalActive ? (
            <div style={{ marginTop: 10 }}>
              {!inviteOpen ? (
                <button
                  className="button secondary"
                  type="button"
                  disabled={portalBusy}
                  onClick={() => {
                    setInviteEmail(customer.portal_email || '');
                    setInviteOpen(true);
                  }}
                >
                  {portalInvited ? 'Resend invite' : 'Invite to portal'}
                </button>
              ) : (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label htmlFor="portal-invite-email">Email for invite</label>
                  <div className="flex flex-wrap gap-2">
                    <input
                      id="portal-invite-email"
                      type="email"
                      style={{ flex: 1, minWidth: 200 }}
                      value={inviteEmail}
                      disabled={portalBusy}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="customer@email.com"
                    />
                    <button
                      className="button"
                      type="button"
                      disabled={portalBusy || !String(inviteEmail || '').trim()}
                      onClick={async () => {
                        const email = String(inviteEmail || '').trim();
                        if (!email) {
                          showToast?.('Enter a portal email first.', 'error');
                          return;
                        }
                        setPortalBusy(true);
                        const emailChanged = email.toLowerCase() !== String(customer.portal_email || '').trim().toLowerCase();
                        if (emailChanged) {
                          const saveRes = await updateCustomer(customer.customer_id, { portal_email: email });
                          if (!saveRes.success) {
                            setPortalBusy(false);
                            showToast?.(saveRes.message || 'Could not save portal email.', 'error');
                            return;
                          }
                        }
                        const inviteRes = await resendCustomerPortalInvitation(customer.customer_id, email);
                        setPortalBusy(false);
                        if (inviteRes.success) {
                          showToast?.(inviteRes.message || 'Portal invitation sent.', 'success');
                          setInviteOpen(false);
                          setInviteEmail('');
                          const refreshed = await fetchCustomerById(customerId);
                          if (refreshed.success && refreshed.data) setCustomer(refreshed.data);
                        } else {
                          showToast?.(inviteRes.message || 'Could not send portal invitation.', 'error');
                        }
                      }}
                    >
                      {portalBusy ? 'Sending…' : 'Send invite'}
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={portalBusy}
                      onClick={() => {
                        setInviteOpen(false);
                        setInviteEmail('');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </section> : null}

        {activeTab === 'overview' ? (
          <section className="panel content-panel">
            <div className="account-detail-grid two-up" style={{ gap: 16 }}>
              <div>
                <div className="panel-section-header panel-section-header-compact">
                  <h3>Money Status</h3>
                  <p className="muted">Standing before sale or installment.</p>
                </div>
                <DetailRowsTable
                  dense
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
              </div>
              <div>
                <div className="panel-section-header panel-section-header-compact">
                  <h3>Credit Investigation</h3>
                  <p className="muted">Limits are set by Branch Manager.</p>
                </div>
                <DetailRowsTable
                  dense
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
                  <div style={{ marginTop: 10 }}>
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => navigate(`/sales/credit-investigations/${latestCi.ci_id}`)}
                    >
                      {ciStatus === 'Revision Requested' ? 'Open CI to Revise' : 'View CI'}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === 'address' ? <section className="panel content-panel">
          <div className="segmented-control" role="tablist" aria-label="Customer detail sections" style={{ marginBottom: 12 }}>
            {tabs.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={activeTab === key ? 'segment active' : 'segment'}
                role="tab"
                aria-selected={activeTab === key}
                onClick={() => selectTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="panel-section-header panel-section-header-compact">
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
                color: '#0B2133',
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
                    <td colSpan={6} style={{ textAlign: 'center', color: '#5F7385', padding: 16 }}>
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
              {hasCredit && creditLimit > 0 ? 'Apply for higher credit' : 'Apply for Credit'}
            </button>
          ) : null}
          {customer.status === 'Pending Identity Review' ? (
            <p className="muted" style={{ flexBasis: '100%', margin: 0 }}>
              {(customer.registration_profile_json?.hold_reason === 'territory_exception'
                || customer.registration_profile_json?.territory_outside_review
                || customer.territory_override_note)
                ? 'Waiting for Branch Manager territory exception review — cash sales stay blocked until approved.'
                : 'Pending Identity Review — Branch Manager must approve before cash sales or credit requests.'}
            </p>
          ) : null}
          {customer.status === 'Rejected' ? (
            <div style={{ flexBasis: '100%' }}>
              <p className="muted" style={{ margin: '0 0 8px' }}>
                Registration declined (Rejected)
                {customer.identity_review_note ? ` — ${customer.identity_review_note}` : ''}.
                Fix address/territory and resubmit for Branch Manager review. Do not create a new customer.
              </p>
              <button
                className="button"
                type="button"
                onClick={() => navigate(`/sales/customers/${customer.customer_id}/edit?resubmitReview=1`)}
              >
                Fix &amp; resubmit for review
              </button>
            </div>
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
          isFirstCredit={isFirstCredit}
          defaultReason={isFirstCredit ? 'First installment' : 'Need higher limit'}
          onClose={() => setCreditReviewOpen(false)}
          showToast={showToast}
          onSubmitted={async (ciId) => {
            setCreditReviewOpen(false);
            const refreshed = await fetchCustomerById(customerId);
            if (refreshed.success && refreshed.data) setCustomer(refreshed.data);
            if (ciId) navigate(`/sales/credit-investigations/${ciId}`);
            else navigate('/sales/credit-investigations');
          }}
        />
      </div>
    );
  }
