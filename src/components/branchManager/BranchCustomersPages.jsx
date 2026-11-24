import { useEffect, useState } from 'react';
import {
  fetchCustomers,
  fetchCustomerById,
  updateCustomer,
  decideCustomerIdentityReview,
} from '../../api/salesService.js';
import { fetchTerritories } from '../../api/territoriesService.js';
import { getBranchStaff } from '../../api/branchManagerService.js';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { Stats } from '../shared/StatsGrid';
import { Pagination } from '../shared/Pagination';
import { DetailRowsTable } from '../shared/DetailRowsTable';
import { StatusBadge } from '../StatusBadge';
import { NavIcon } from '../../navIcons';
import LeafletMap from '../common/LeafletMap';
import { useServerPagination, DEFAULT_PAGE_SIZE } from '../../hooks/usePagination';
import { formatCurrency, formatDisplayDate } from '../../utils/formatters.js';
import {
  formatCustomerDisplayId,
  formatCustomerFullName,
  formatContactPersonName,
  formatSecondaryContactName,
} from '../../utils/customerDisplay';
import { paymentStanding } from '../../utils/customerStanding.js';
import { openExternalNavigation } from '../../utils/mapsNavigation.js';
import { downloadPdf } from '../../utils/dataExport.js';

function staffDisplayName(user) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(' ')
    || user?.email
    || (user?.id != null ? `#${user.id}` : '—');
}

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

function isTerritoryExceptionHold(customer) {
  if (String(customer?.status || '') !== 'Pending Identity Review') return false;
  const profile = customer?.registration_profile_json || {};
  return String(profile.hold_reason || '') === 'territory_exception'
    || Boolean(profile.territory_outside_review)
    || Boolean(customer?.territory_override_note);
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

function buildReturnQuery({ search, statusFilter, paymentFilter, territoryFilter, agentFilter, page }) {
  const params = new URLSearchParams();
  if (search) params.set('q', search);
  if (statusFilter && statusFilter !== 'All') params.set('status', statusFilter);
  if (paymentFilter && paymentFilter !== 'All') params.set('standing', paymentFilter);
  if (territoryFilter && territoryFilter !== 'All') params.set('territory', territoryFilter);
  if (agentFilter) params.set('agent', agentFilter);
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
  const [agentFilter, setAgentFilter] = useState(initial.get('agent') || '');
  const [agentLabel, setAgentLabel] = useState('');
  const [territories, setTerritories] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [stats, setStats] = useState(null);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(true);

  const filterResetKey = `${search}|${statusFilter}|${paymentFilter}|${territoryFilter}|${agentFilter}`;
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
      if (
        statusFilter === 'Active'
        || statusFilter === 'Inactive'
        || statusFilter === 'Pending Identity Review'
      ) {
        params.status = statusFilter;
      }
      const standing = standingToApiFilter(paymentFilter);
      if (standing) params.standing = standing;
      if (territoryFilter === 'none') params.territory_id = 'none';
      else if (territoryFilter !== 'All') params.territory_id = territoryFilter;
      if (agentFilter) params.agent = agentFilter;

      const res = await fetchCustomers(params);
      if (!active) return;
      if (res.success) {
        setCustomers(res.data || []);
        setTotalRecords(Number(res.pagination?.total) || 0);
        setStats(res.meta?.stats || null);
        if (agentFilter) {
          const named = (res.data || []).find((c) => c.assigned_sales_agent_name)?.assigned_sales_agent_name;
          if (named) setAgentLabel(named);
        } else {
          setAgentLabel('');
        }
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
  }, [pagination.currentPage, search, statusFilter, paymentFilter, territoryFilter, agentFilter, showToast]);

  const returnQuery = buildReturnQuery({
    search,
    statusFilter,
    paymentFilter,
    territoryFilter,
    agentFilter,
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
              {agentFilter
                ? ` Showing permanent book for Sales Agent${agentLabel ? ` ${agentLabel}` : ''} (#${agentFilter}).`
                : ''}
            </p>
          </div>
          {agentFilter ? (
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                setAgentFilter('');
                setAgentLabel('');
                navigate(`${opsBase}/customers`);
              }}
            >
              Clear Sales Agent filter
            </button>
          ) : null}
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
              {['All', 'Active', 'Inactive', 'Pending Identity Review', 'Rejected'].map((s) => (
                <option key={s} value={s}>
                  {s === 'All' ? 'All Statuses' : (s === 'Rejected' ? 'Rejected (declined)' : s)}
                </option>
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
  const [salesAgents, setSalesAgents] = useState([]);
  const [collectors, setCollectors] = useState([]);
  const [staffDraft, setStaffDraft] = useState({
    assigned_sales_agent_id: '',
    account_manager_id: '',
  });
  const [staffConfirm, setStaffConfirm] = useState(null);
  const [staffBusy, setStaffBusy] = useState(false);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);
  const backQuery = typeof window !== 'undefined'
    ? window.location.search
    : '';

  const reloadCustomer = async () => {
    const res = await fetchCustomerById(customerId);
    if (res.success && res.data) {
      setCustomer(res.data);
      setStaffDraft({
        assigned_sales_agent_id: res.data.assigned_sales_agent_id
          ? String(res.data.assigned_sales_agent_id)
          : '',
        account_manager_id: res.data.account_manager_id
          ? String(res.data.account_manager_id)
          : '',
      });
      return res.data;
    }
    setCustomer(null);
    showToast?.(res.message || 'Customer not found.', 'error');
    return null;
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const res = await fetchCustomerById(customerId);
      if (cancelled) return;
      if (res.success && res.data) {
        setCustomer(res.data);
        setStaffDraft({
          assigned_sales_agent_id: res.data.assigned_sales_agent_id
            ? String(res.data.assigned_sales_agent_id)
            : '',
          account_manager_id: res.data.account_manager_id
            ? String(res.data.account_manager_id)
            : '',
        });
      } else {
        setCustomer(null);
        showToast?.(res.message || 'Customer not found.', 'error');
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [customerId, showToast]);

  useEffect(() => {
    let cancelled = false;
    async function loadStaff() {
      const res = await getBranchStaff();
      if (cancelled) return;
      if (!res.success) {
        setSalesAgents([]);
        setCollectors([]);
        return;
      }
      const sales = (res.data?.salesAgents || []).filter(
        (u) => String(u.status || 'Active') === 'Active' || Number(u.id) === Number(customer?.assigned_sales_agent_id)
      );
      const cols = (res.data?.collectors || []).filter(
        (u) => String(u.status || 'Active') === 'Active' || Number(u.id) === Number(customer?.account_manager_id)
      );
      setSalesAgents(sales);
      setCollectors(cols);
    }
    loadStaff();
    return () => { cancelled = true; };
  }, [customer?.assigned_sales_agent_id, customer?.account_manager_id]);

  const openStaffConfirm = () => {
    if (!customer) return;
    const nextSa = staffDraft.assigned_sales_agent_id
      ? Number(staffDraft.assigned_sales_agent_id)
      : null;
    const nextCollector = staffDraft.account_manager_id
      ? Number(staffDraft.account_manager_id)
      : null;
    const currentSa = customer.assigned_sales_agent_id
      ? Number(customer.assigned_sales_agent_id)
      : null;
    const currentCollector = customer.account_manager_id
      ? Number(customer.account_manager_id)
      : null;
    if (nextSa === currentSa && nextCollector === currentCollector) {
      showToast?.('No staffing changes to save.', 'error');
      return;
    }
    const saName = nextSa
      ? staffDisplayName(salesAgents.find((u) => Number(u.id) === nextSa))
      : 'Unassigned';
    const collectorName = nextCollector
      ? staffDisplayName(collectors.find((u) => Number(u.id) === nextCollector))
      : 'Unassigned';
    setStaffConfirm({
      assigned_sales_agent_id: nextSa,
      account_manager_id: nextCollector,
      saName,
      collectorName,
    });
  };

  const saveStaffing = async () => {
    if (!staffConfirm || !customer) return;
    setStaffBusy(true);
    const result = await updateCustomer(customer.customer_id, {
      assigned_sales_agent_id: staffConfirm.assigned_sales_agent_id,
      account_manager_id: staffConfirm.account_manager_id,
    });
    setStaffBusy(false);
    if (result.success) {
      showToast?.(result.message || 'Field staffing updated.', 'success');
      setStaffConfirm(null);
      await reloadCustomer();
    } else {
      showToast?.(result.message || 'Could not update staffing.', 'error');
    }
  };

  const decideTerritoryHold = async (decision) => {
    if (!customer) return;
    setReviewBusy(true);
    const res = await decideCustomerIdentityReview(customer.customer_id, {
      decision,
      note: reviewNote.trim() || undefined,
    });
    setReviewBusy(false);
    if (res.success) {
      showToast?.(res.message || (decision === 'approve' ? 'Approved.' : 'Rejected.'), 'success');
      setReviewNote('');
      await reloadCustomer();
    } else {
      showToast?.(res.message || 'Could not record decision.', 'error');
    }
  };

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
  const territoryHold = isTerritoryExceptionHold(customer);

  return (
    <div className="page account-detail-page">
      <section className="panel content-panel">
        <div className="panel-section-header">
          <div>
            <h3>Profile</h3>
            <p className="muted" style={{ marginTop: 4 }}>
              {territoryHold
                ? 'Territory exception is pending — approve or reject below before sales can start.'
                : 'Branch supervision view — profile facts are read-only; field staffing can be reassigned below.'}
            </p>
          </div>
          <StatusBadge status={standing} />
        </div>
        <DetailRowsTable
          rows={[
            { label: 'Full Name', value: name },
            { label: 'Customer Code', value: code },
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
            ...(customer.territory_override_note
              ? [{
                label: 'Territory exception',
                value: territoryHold
                  ? `${customer.territory_override_note} · awaiting BM decision`
                  : customer.territory_override_note,
              }]
              : []),
            { label: 'Assigned Sales Agent', value: customer.assigned_sales_agent_name || '—' },
            { label: 'Account Manager / Collector', value: customer.account_manager_name || '—' },
          ]}
        />
      </section>

      {territoryHold ? (
        <section className="panel content-panel">
          <div className="panel-section-header">
            <div>
              <h3>Territory exception review</h3>
              <p className="muted" style={{ marginTop: 4 }}>
                This registration is outside territory coverage. Approve to activate the account, or reject
                to decline it (Rejected). The Sales Agent can fix details and resubmit the same customer — do not create a duplicate.
              </p>
            </div>
            <StatusBadge status="Pending Identity Review" />
          </div>
          <DetailRowsTable
            rows={[
              { label: 'Address', value: customer.address || '—' },
              { label: 'Territory', value: customer.territory_name || '—' },
              { label: 'Exception note', value: customer.territory_override_note || '—' },
              {
                label: 'Map pin',
                value: pinOk
                  ? `${Number(customer.latitude).toFixed(5)}, ${Number(customer.longitude).toFixed(5)}`
                  : 'Not set',
              },
              { label: 'Sales Agent', value: customer.assigned_sales_agent_name || '—' },
            ]}
          />
          <div className="form-group" style={{ marginTop: 12 }}>
            <label htmlFor="bm-territory-review-note">Decision note</label>
            <textarea
              id="bm-territory-review-note"
              className="filter-input"
              rows={2}
              value={reviewNote}
              disabled={reviewBusy}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="Optional reason for approve or reject"
            />
          </div>
          <div className="flex flex-wrap gap-2" style={{ marginTop: 12 }}>
            <button
              className="button"
              type="button"
              disabled={reviewBusy}
              onClick={() => decideTerritoryHold('approve')}
            >
              {reviewBusy ? 'Saving…' : 'Approve & activate'}
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={reviewBusy}
              onClick={() => decideTerritoryHold('reject')}
            >
              Reject (declined)
            </button>
          </div>
        </section>
      ) : null}

      {!territoryHold ? (
        <section className="panel content-panel">
          <div className="panel-section-header">
            <div>
              <h3>Field staffing</h3>
              <p className="muted" style={{ marginTop: 4 }}>
                Reassign receiving-branch Sales Agent or Collector after transfers or staff changes.
              </p>
            </div>
          </div>
          <div className="account-detail-grid two-up">
            <div className="form-group">
              <label htmlFor="bm-assign-sa">Sales Agent</label>
              <select
                id="bm-assign-sa"
                className="filter-select"
                value={staffDraft.assigned_sales_agent_id}
                disabled={staffBusy || Boolean(staffConfirm)}
                onChange={(e) => setStaffDraft((prev) => ({
                  ...prev,
                  assigned_sales_agent_id: e.target.value,
                }))}
              >
                <option value="">Unassigned</option>
                {salesAgents.map((u) => (
                  <option key={u.id} value={u.id}>{staffDisplayName(u)}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="bm-assign-collector">Collector / Account Manager</label>
              <select
                id="bm-assign-collector"
                className="filter-select"
                value={staffDraft.account_manager_id}
                disabled={staffBusy || Boolean(staffConfirm)}
                onChange={(e) => setStaffDraft((prev) => ({
                  ...prev,
                  account_manager_id: e.target.value,
                }))}
              >
                <option value="">Unassigned</option>
                {collectors.map((u) => (
                  <option key={u.id} value={u.id}>{staffDisplayName(u)}</option>
                ))}
              </select>
            </div>
          </div>
          {staffConfirm ? (
            <div className="panel" style={{ padding: 12, marginTop: 12, border: '1px solid var(--border-color, #ddd)' }}>
              <strong>Confirm staffing change?</strong>
              <dl className="account-detail-grid two-up" style={{ margin: '8px 0 0' }}>
                <div>
                  <dt className="muted">Sales Agent</dt>
                  <dd style={{ margin: 0 }}>{staffConfirm.saName}</dd>
                </div>
                <div>
                  <dt className="muted">Collector</dt>
                  <dd style={{ margin: 0 }}>{staffConfirm.collectorName}</dd>
                </div>
              </dl>
              <div className="modal-actions" style={{ marginTop: 12 }}>
                <button
                  className="button ghost"
                  type="button"
                  disabled={staffBusy}
                  onClick={() => setStaffConfirm(null)}
                >
                  Cancel
                </button>
                <button className="button" type="button" disabled={staffBusy} onClick={saveStaffing}>
                  {staffBusy ? 'Saving…' : 'Confirm Assignment'}
                </button>
              </div>
            </div>
          ) : (
            <div className="modal-actions" style={{ marginTop: 12, justifyContent: 'flex-start' }}>
              <button className="button" type="button" onClick={openStaffConfirm}>
                Review &amp; Save Staffing
              </button>
            </div>
          )}
        </section>
      ) : null}

      {!territoryHold ? (
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
      ) : null}

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
