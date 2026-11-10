import { useEffect, useMemo, useState } from 'react';
import { getFieldActivityReports, getFieldActivityReport, getBranchStaff } from '../../api/branchManagerService.js';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { Pagination } from '../shared/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { DetailRowsTable } from '../shared/DetailRowsTable';
import { StatusBadge } from '../StatusBadge';
import { NavIcon } from '../../navIcons';
import { formatDisplayDate, formatDisplayDateTime } from '../../utils/formatters.js';
import {
  FAR_ACTIVITY_FILTER_GROUPS,
  FAR_PERIOD_OPTIONS,
  FAR_ROLE_OPTIONS,
  FAR_SEVERITY_OPTIONS,
  isIncidentActivity,
  reportPhotoSrc,
  severityTone,
} from '../../utils/fieldActivityReports.js';

function ContextCell({ report }) {
  if (report.staff_role_slug === 'sales_staff' || report.assignment_id) {
    return (
      <td>
        {report.area_name ? <strong>{report.area_name}</strong> : <span>—</span>}
        {report.customer_name ? <div className="muted">{report.customer_name}</div> : null}
        {report.work_date ? <div className="muted">Work date {formatDisplayDate(report.work_date)}</div> : null}
      </td>
    );
  }
  return (
    <td>
      <strong>{report.customer_name || '—'}</strong>
      {report.customer_code ? <div className="muted">{report.customer_code}</div> : null}
      {report.visit_status ? (
        <div className="muted">Visit: {report.visit_status}</div>
      ) : null}
    </td>
  );
}

function PhotoCell({ report }) {
  if (!report.has_photo) return <td className="muted">None</td>;
  return <td><span title="Photo attached">Attached</span></td>;
}

export function FieldActivityReportsPage({
  navigate,
  showToast,
  currentUser,
  opsBase,
}) {
  const showBranch = currentUser?.role?.slug === 'operating_manager'
    || currentUser?.role?.slug === 'super_admin';
  const [reports, setReports] = useState([]);
  const [summary, setSummary] = useState(null);
  const [total, setTotal] = useState(0);
  const [staffOptions, setStaffOptions] = useState({ collectors: [], salesAgents: [] });
  const [loading, setLoading] = useState(true);
  const customerIdFromQuery = typeof window !== 'undefined'
    ? (new URLSearchParams(window.location.search).get('customer_id')
      || new URLSearchParams(window.location.search).get('customerId')
      || '')
    : '';
  const initialScope = typeof window !== 'undefined'
    ? (new URLSearchParams(window.location.search).get('scope') || 'today')
    : 'today';
  const [scope, setScope] = useState(
    ['today', 'week', 'all'].includes(initialScope) ? initialScope : 'today'
  );
  const [role, setRole] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [activityType, setActivityType] = useState('all');
  const [staffId, setStaffId] = useState('all');
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [customerIdFilter, setCustomerIdFilter] = useState(customerIdFromQuery);

  useEffect(() => {
    getBranchStaff().then((result) => {
      if (result.success && result.data) {
        setStaffOptions({
          collectors: result.data.collectors || [],
          salesAgents: result.data.salesAgents || [],
        });
      }
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const params = {
        scope,
        role,
        severity,
        activity_type: activityType === 'all' ? undefined : activityType,
        staff_id: staffId === 'all' ? undefined : staffId,
        search: search || undefined,
        customer_id: customerIdFilter || undefined,
        limit: 100,
        page: 1,
      };
      const result = await getFieldActivityReports(params);
      if (cancelled) return;
      if (result.success) {
        setReports(result.data || []);
        setTotal(Number(result.total ?? result.data?.length ?? 0));
        setSummary(result.summary || null);
      } else {
        setReports([]);
        setTotal(0);
        showToast?.(result.message || 'Failed to load field activity reports.', 'error');
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [scope, role, severity, activityType, staffId, search, customerIdFilter, showToast]);

  const pagination = usePagination(reports, {
    resetKey: `${scope}-${role}-${severity}-${activityType}-${staffId}-${search}-${customerIdFilter}`,
  });
  const rows = pagination.paginatedData;

  const staffSelectOptions = useMemo(() => {
    if (role === 'collector') return staffOptions.collectors;
    if (role === 'sales') return staffOptions.salesAgents;
    return [...staffOptions.collectors, ...staffOptions.salesAgents];
  }, [role, staffOptions]);

  if (loading && !reports.length) {
    return <LoadingState message="Loading field activity reports..." />;
  }

  return (
    <div className="page">
      {summary ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16, fontSize: '0.9rem' }}>
          <span>Today&apos;s reports: <strong>{summary.today_count ?? 0}</strong></span>
          <span>Incidents needing attention: <strong>{summary.incident_attention_count ?? 0}</strong></span>
          <span>Sales agent reports today: <strong>{summary.sales_today_count ?? 0}</strong></span>
          <span>Collector reports today: <strong>{summary.collector_today_count ?? 0}</strong></span>
        </div>
      ) : null}

      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <div>
            <h3>Field Activity Reports</h3>
            <p className="text-ink/70" style={{ margin: '4px 0 0', fontSize: '0.82rem' }}>
              Review field reports submitted by collectors and sales agents
              {showBranch ? ' across branches' : ' in your branch'}.
              {total ? ` ${total} matching report${total === 1 ? '' : 's'}.` : ''}
              {customerIdFilter ? ` Filtered to customer #${customerIdFilter}.` : ''}
            </p>
          </div>
          {customerIdFilter ? (
            <button
              className="button ghost"
              type="button"
              onClick={() => setCustomerIdFilter('')}
            >
              Clear customer filter
            </button>
          ) : null}
        </div>

        <div className="list-section-toolbar">
          <div className="list-section-controls" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <select className="filter-select" value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Reporting period">
              {FAR_PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select className="filter-select" value={role} onChange={(e) => { setRole(e.target.value); setStaffId('all'); }} aria-label="Staff role">
              {FAR_ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select className="filter-select" value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="Severity">
              {FAR_SEVERITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select className="filter-select" value={staffId} onChange={(e) => setStaffId(e.target.value)} aria-label="Staff member">
              <option value="all">All Staff</option>
              {staffSelectOptions.map((person) => (
                <option key={person.id} value={person.id}>{person.name}</option>
              ))}
            </select>
            <select className="filter-select" value={activityType} onChange={(e) => setActivityType(e.target.value)} aria-label="Activity type">
              <option value="all">All Activities</option>
              {FAR_ACTIVITY_FILTER_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSearch(searchDraft.trim());
              }}
              style={{ display: 'flex', gap: 8 }}
            >
              <input
                className="filter-input search"
                type="search"
                placeholder="Search staff, customer, area, remarks"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
              />
              <button className="button secondary" type="submit">Search</button>
            </form>
          </div>
        </div>

        {rows.length ? (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Staff</th>
                    {showBranch ? <th>Branch</th> : null}
                    <th>Context</th>
                    <th>Activity</th>
                    <th>Severity</th>
                    <th>Work Date</th>
                    <th>Submitted</th>
                    <th>Photo</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((report) => {
                    const tone = severityTone(report.severity);
                    return (
                      <tr
                        key={report.report_id}
                        style={tone === 'critical'
                          ? { background: 'rgba(220, 38, 38, 0.06)' }
                          : tone === 'high'
                            ? { background: 'rgba(217, 119, 6, 0.06)' }
                            : undefined}
                      >
                        <td>
                          <strong>{report.staff_name || report.collector_name}</strong>
                          {report.staff_role ? <div className="muted">{report.staff_role}</div> : null}
                        </td>
                        {showBranch ? <td>{report.branch_name || '—'}</td> : null}
                        <ContextCell report={report} />
                        <td>{report.activity_type || '—'}</td>
                        <td>
                          {report.severity
                            ? <StatusBadge status={report.severity} />
                            : <span className="muted">—</span>}
                        </td>
                        <td>{formatDisplayDate(report.work_date || report.scheduled_date)}</td>
                        <td>{formatDisplayDateTime(report.created_at)}</td>
                        <PhotoCell report={report} />
                        <td className="table-actions">
                          <button
                            className="icon-action-button"
                            type="button"
                            title="View report"
                            onClick={() => navigate(`${opsBase}/field-activity-reports/${report.report_id}`)}
                          >
                            <NavIcon name="view" />
                          </button>
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
            title="No field activity reports"
            description="No reports match these filters. Field staff submit reports from their Field Activity Reports screens."
          />
        )}
      </section>
    </div>
  );
}

export function FieldActivityReportDetailPage({
  reportId,
  navigate,
  showToast,
  opsBase,
  currentUser,
}) {
  const showBranch = currentUser?.role?.slug === 'operating_manager'
    || currentUser?.role?.slug === 'super_admin';
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const result = await getFieldActivityReport(reportId);
      if (cancelled) return;
      if (result.success && result.data) setReport(result.data);
      else {
        setReport(null);
        showToast?.(result.message || 'Report not found.', 'error');
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [reportId, showToast]);

  if (loading) return <LoadingState message="Loading field activity report..." />;
  if (!report) {
    return (
      <EmptyState
        title="Report not found"
        description="This report may not belong to your branch or no longer exists."
        actionLabel="Back to reports"
        onAction={() => navigate(`${opsBase}/field-activity-reports`)}
      />
    );
  }

  const isSales = report.staff_role_slug === 'sales_staff' || Boolean(report.assignment_id);
  const photoSrc = reportPhotoSrc(report.photo);
  const staffPath = isSales
    ? `${opsBase}/field-operations/sales/${report.staff_id || report.collector_id}`
    : `${opsBase}/field-operations/collectors/${report.staff_id || report.collector_id}`;

  return (
    <div className="page">
      <section className="panel dashboard-greeting">
        <div className="flex flex-col gap-1">
          <p className="text-[0.82rem] font-bold tracking-widest uppercase text-navy/60 m-0">
            {report.branch_name || 'Field Activity Report'}
          </p>
          <h2>{report.activity_type || 'Field Activity Report'}</h2>
          <p className="text-ink/70">
            {report.staff_name || report.collector_name}
            {report.staff_role ? ` · ${report.staff_role}` : ''}
            {report.severity ? ` · ${report.severity}` : ''}
          </p>
        </div>
      </section>

      <section className="panel content-panel relative overflow-hidden">
        <h3>Staff Information</h3>
        <DetailRowsTable rows={[
          { label: 'Staff Name', value: report.staff_name || report.collector_name || '—' },
          { label: 'Staff Role', value: report.staff_role || '—' },
          ...(showBranch ? [{ label: 'Branch', value: report.branch_name || '—' }] : []),
        ]} />
        <div className="flex justify-end gap-2 mt-3">
          <button className="button secondary" type="button" onClick={() => navigate(staffPath)}>
            Open Staff Profile
          </button>
        </div>
      </section>

      <section className="panel content-panel relative overflow-hidden">
        <h3>Field Activity Context</h3>
        {isSales ? (
          <DetailRowsTable rows={[
            { label: 'Assigned Area', value: report.area_name || '—' },
            { label: 'Assignment ID', value: report.assignment_id || '—' },
            { label: 'Work Date', value: formatDisplayDate(report.work_date || report.assignment_work_date) },
            { label: 'Associated Customer', value: report.customer_name || '—' },
            { label: 'Customer Code', value: report.customer_code || '—' },
          ]} />
        ) : (
          <DetailRowsTable rows={[
            { label: 'Customer', value: report.customer_name || '—' },
            { label: 'Customer Code', value: report.customer_code || '—' },
            { label: 'Visit ID', value: report.visit_id || '—' },
            { label: 'Scheduled Date', value: formatDisplayDate(report.visit_scheduled_date || report.work_date) },
            { label: 'Visit Status', value: report.visit_status || '—' },
            { label: 'Visit Type', value: report.visit_type || '—' },
          ]} />
        )}
        {report.customer_id ? (
          <div className="flex justify-end gap-2 mt-3">
            <button
              className="button secondary"
              type="button"
              onClick={() => navigate(`${opsBase}/customers/${report.customer_id}`)}
            >
              Open Customer
            </button>
          </div>
        ) : null}
      </section>

      <section className="panel content-panel relative overflow-hidden">
        <h3>Report Information</h3>
        <DetailRowsTable rows={[
          { label: 'Activity Type', value: report.activity_type || '—' },
          {
            label: 'Severity',
            value: isIncidentActivity(report.activity_type)
              ? (report.severity || '—')
              : 'Not applicable',
          },
          { label: 'Work Date', value: formatDisplayDate(report.work_date || report.scheduled_date) },
          { label: 'Submitted', value: formatDisplayDateTime(report.created_at) },
          { label: 'Device Sync Status', value: report.sync_status || '—' },
          { label: 'Remarks', value: report.remarks || '—' },
        ]} />
      </section>

      <section className="panel content-panel relative overflow-hidden">
        <h3>Photo Evidence</h3>
        {photoSrc ? (
          <a href={photoSrc} target="_blank" rel="noreferrer">
            <img
              src={photoSrc}
              alt="Report evidence"
              style={{ maxWidth: '100%', maxHeight: 420, borderRadius: 8, border: '1px solid #BADBE9' }}
            />
          </a>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            {report.has_photo ? 'Photo could not be displayed.' : 'No photo attached.'}
          </p>
        )}
      </section>

      <div className="flex justify-end gap-2 mt-4">
        <button className="button ghost" type="button" onClick={() => navigate(`${opsBase}/field-activity-reports`)}>
          Back
        </button>
      </div>
    </div>
  );
}
