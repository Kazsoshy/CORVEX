import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  fetchCustomers,
  fetchSalesAreaAssignments,
  fetchSalesFieldReportById,
  fetchSalesFieldReports,
  submitSalesFieldReport,
} from '../../api/salesService';
import { formatDisplayDate, formatDisplayDateTime } from '../../data/salesMockData';
import { usePagination } from '../../hooks/usePagination';
import { isBrowserOnline } from '../../offline/connection.js';
import { saveOfflineRecord } from '../../offline/db.js';
import { DeviceQueue, loadWaiting } from '../../offline/DeviceQueue.jsx';
import { isSalesAutoSyncEnabled, isSalesOfflineEnabled } from '../../offline/prefs.js';
import { NavIcon } from '../../navIcons';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { DetailRowsTable } from '../shared/DetailRowsTable';
import { Pagination } from '../shared/Pagination';
import { StatusBadge } from '../StatusBadge';

const SA_ACTIVITY_TYPES = ['Canvassing', 'Follow-up', 'Site Check', 'No Prospects Found'];

function manilaToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function areaLabel(assignment) {
  if (!assignment) return '—';
  const date = assignment.work_date ? formatDisplayDate(assignment.work_date) : '';
  return [assignment.area_name, date].filter(Boolean).join(' · ');
}

function reportAreaLabel(report) {
  if (report.area_name) {
    const date = report.work_date || report.scheduled_date;
    return [report.area_name, date ? formatDisplayDate(date) : null].filter(Boolean).join(' · ');
  }
  if (report.customer_name) return report.customer_name;
  return '—';
}

export function FieldActivityReportsPage({ navigate, showToast }) {
  const location = useLocation();
  const preselectedAssignmentId = new URLSearchParams(location.search).get('assignmentId') || '';

  const [reports, setReports] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [listScope, setListScope] = useState('today');
  const [form, setForm] = useState({
    assignment_id: preselectedAssignmentId,
    activity_type: '',
    remarks: '',
    photo: '',
    photoName: '',
    customer_id: '',
  });
  const [errors, setErrors] = useState({});
  const [deviceReports, setDeviceReports] = useState([]);

  async function loadDeviceReports() {
    try {
      const rows = await loadWaiting('field_activity_reports');
      setDeviceReports(rows);
    } catch {
      setDeviceReports([]);
    }
  }

  async function loadReports() {
    setLoading(true);
    const [reportsResult, todayAssignments, upcomingAssignments, historyAssignments, customersResult] = await Promise.all([
      fetchSalesFieldReports(),
      fetchSalesAreaAssignments({ scope: 'today' }),
      fetchSalesAreaAssignments({ scope: 'upcoming' }),
      fetchSalesAreaAssignments({ scope: 'history' }),
      fetchCustomers({ limit: 200, status: 'Active' }),
    ]);

    if (reportsResult.success) setReports(reportsResult.data || []);
    const combined = [
      ...(todayAssignments.success ? todayAssignments.data || [] : []),
      ...(upcomingAssignments.success ? upcomingAssignments.data || [] : []),
      ...(historyAssignments.success ? (historyAssignments.data || []).slice(0, 20) : []),
    ];
    const deduped = [];
    const seen = new Set();
    for (const row of combined) {
      const id = String(row.assignment_id);
      if (seen.has(id)) continue;
      seen.add(id);
      deduped.push(row);
    }
    setAssignments(deduped);
    if (customersResult.success) setCustomers(customersResult.data || []);

    const todayIds = new Set((todayAssignments.success ? todayAssignments.data || [] : []).map((a) => String(a.assignment_id)));
    setForm((prev) => {
      if (prev.assignment_id) return prev;
      if (preselectedAssignmentId) return { ...prev, assignment_id: String(preselectedAssignmentId) };
      const active = (todayAssignments.success ? todayAssignments.data || [] : [])
        .find((a) => a.status === 'In Progress')
        || (todayAssignments.success ? todayAssignments.data || [] : [])[0];
      return active ? { ...prev, assignment_id: String(active.assignment_id) } : prev;
    });

    // Prefer active today assignment when query param missing
    if (!preselectedAssignmentId && todayIds.size) {
      /* form state handled above */
    }

    await loadDeviceReports();
    setLoading(false);
  }

  useEffect(() => {
    loadReports();
  }, [preselectedAssignmentId]);

  async function keepReportOnDevice() {
    const assignment = assignments.find((row) => String(row.assignment_id) === String(form.assignment_id));
    const customer = customers.find((row) => String(row.customer_id) === String(form.customer_id));
    await saveOfflineRecord({
      tableName: 'field_activity_reports',
      payload: {
        assignment_id: Number(form.assignment_id),
        customer_id: form.customer_id ? Number(form.customer_id) : undefined,
        activity_type: form.activity_type,
        remarks: form.remarks.trim(),
        photo: form.photo,
        area_name: assignment?.area_name || '',
        customer_name: customer
          ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim()
          : '',
      },
    });
    showToast(
      isSalesAutoSyncEnabled()
        ? 'Saved on this device. It will sync when you are online.'
        : 'Saved on this device. Send it from Settings while auto-sync is off.',
      'success'
    );
    setForm({
      assignment_id: form.assignment_id,
      activity_type: '',
      remarks: '',
      photo: '',
      photoName: '',
      customer_id: '',
    });
    await loadDeviceReports();
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    const nextErrors = {};
    if (!form.assignment_id) nextErrors.assignment_id = 'Select an assigned area.';
    if (!form.activity_type) nextErrors.activity_type = 'Select an activity type.';
    if (!form.remarks.trim()) nextErrors.remarks = 'Remarks are required.';
    if (!form.photo) nextErrors.photo = 'Photo evidence is required.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    if (!isBrowserOnline()) {
      if (isSalesOfflineEnabled()) {
        await keepReportOnDevice();
      } else {
        showToast('Turn on offline mode in Settings to keep this report on the device.', 'error');
      }
      return;
    }

    setSubmitting(true);
    const result = await submitSalesFieldReport({
      assignment_id: Number(form.assignment_id),
      customer_id: form.customer_id ? Number(form.customer_id) : undefined,
      activity_type: form.activity_type,
      remarks: form.remarks.trim(),
      photo: form.photo,
    });
    setSubmitting(false);

    if (result.success) {
      showToast(
        result.message || 'Field activity report submitted successfully. Your Branch Manager can now review this report.',
        'success'
      );
      setForm({
        assignment_id: form.assignment_id,
        activity_type: '',
        remarks: '',
        photo: '',
        photoName: '',
        customer_id: '',
      });
      loadReports();
    } else if (result.offline && isSalesOfflineEnabled()) {
      await keepReportOnDevice();
    } else {
      showToast(result.message || 'Failed to submit report.', 'error');
    }
  };

  const today = manilaToday();
  const filteredReports = useMemo(() => {
    if (listScope === 'all') return reports;
    return reports.filter((report) => {
      const workDate = String(report.work_date || report.scheduled_date || '').slice(0, 10);
      const created = report.created_at
        ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(report.created_at))
        : '';
      const dateKey = workDate || created;
      if (listScope === 'today') return dateKey === today;
      return dateKey && dateKey < today;
    });
  }, [reports, listScope, today]);

  const pagination = usePagination(filteredReports, { resetKey: listScope });

  if (loading) return <LoadingState message="Loading field activity reports..." />;

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Field Activity Reports</h3>
          <p className="muted">
            Report what you did in your assigned area today (photo + notes for your Branch Head).
          </p>
        </div>

        {deviceReports.length ? <DeviceQueue rows={deviceReports} /> : null}

        <form className="field-report-form" onSubmit={handleSubmit}>
          <div className="field-report-filter-row">
            <label className="field-report-field">
              <span>Assigned Area<span className="required">*</span></span>
              <select
                className="filter-select"
                value={form.assignment_id}
                onChange={(e) => setForm((p) => ({ ...p, assignment_id: e.target.value }))}
              >
                <option value="">Select assigned area</option>
                {assignments.map((assignment) => (
                  <option key={assignment.assignment_id} value={assignment.assignment_id}>
                    {areaLabel(assignment)} · {assignment.status}
                  </option>
                ))}
              </select>
              {errors.assignment_id ? <p className="form-error">{errors.assignment_id}</p> : null}
            </label>
            <label className="field-report-field">
              <span>Activity Type<span className="required">*</span></span>
              <select
                className="filter-select"
                value={form.activity_type}
                onChange={(e) => setForm((p) => ({ ...p, activity_type: e.target.value }))}
              >
                <option value="">Select activity type</option>
                {SA_ACTIVITY_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              {errors.activity_type ? <p className="form-error">{errors.activity_type}</p> : null}
            </label>
          </div>

          {!assignments.length ? (
            <p className="field-report-hint">
              No area assigned yet. Ask your Branch Head to assign a canvass area before filing a report.
            </p>
          ) : null}

          <div className="form-group field-report-block">
            <label>Related Customer (optional)</label>
            <select
              className="filter-select"
              value={form.customer_id}
              onChange={(e) => setForm((p) => ({ ...p, customer_id: e.target.value }))}
            >
              <option value="">No customer linked</option>
              {customers.map((customer) => (
                <option key={customer.customer_id} value={customer.customer_id}>
                  {`${customer.first_name || ''} ${customer.last_name || ''}`.trim() || `Customer #${customer.customer_id}`}
                </option>
              ))}
            </select>
            <p className="muted" style={{ marginTop: 4 }}>
              Only use this if you met someone while canvassing. Not required to submit.
            </p>
          </div>

          <div className="form-group field-report-block">
            <label>Remarks<span className="required">*</span></label>
            <textarea
              rows={3}
              placeholder="Describe your area coverage, potential customers encountered, activities performed, or reasons no sale was made."
              value={form.remarks}
              onChange={(e) => setForm((p) => ({ ...p, remarks: e.target.value }))}
            />
            {errors.remarks ? <p className="form-error">{errors.remarks}</p> : null}
          </div>

          <div className="form-group field-report-block">
            <label>Photo Evidence<span className="required">*</span></label>
            <p className="muted" style={{ marginTop: 0, marginBottom: 8 }}>
              Capture an area landmark, storefront, canvassing activity, or other field evidence.
            </p>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) {
                  setForm((p) => ({ ...p, photo: '', photoName: '' }));
                  return;
                }
                if (!file.type.startsWith('image/')) {
                  setErrors((prev) => ({ ...prev, photo: 'Please select an image file.' }));
                  return;
                }
                if (file.size > 700_000) {
                  setErrors((prev) => ({ ...prev, photo: 'Image must be 700 KB or smaller.' }));
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                  setForm((p) => ({
                    ...p,
                    photo: typeof reader.result === 'string' ? reader.result : '',
                    photoName: file.name,
                  }));
                  setErrors((prev) => {
                    const next = { ...prev };
                    delete next.photo;
                    return next;
                  });
                };
                reader.readAsDataURL(file);
              }}
            />
            {form.photoName ? <p className="muted">Selected: {form.photoName}</p> : null}
            {form.photo ? (
              <img
                src={form.photo}
                alt="Report preview"
                style={{ marginTop: 8, maxWidth: 200, maxHeight: 140, borderRadius: 8, border: '1px solid #E2E8F0' }}
              />
            ) : null}
            {errors.photo ? <p className="form-error">{errors.photo}</p> : null}
          </div>

          <div className="flex justify-end">
            <button className="button" type="submit" disabled={submitting || !assignments.length}>
              {submitting ? 'Submitting…' : 'Submit Report'}
            </button>
          </div>
        </form>
      </section>

      <section className="panel content-panel">
        <div className="list-section-header">
          <h3>My reports</h3>
          <div className="segmented-control">
            {[
              { key: 'today', label: 'Today' },
              { key: 'history', label: 'History' },
              { key: 'all', label: 'All' },
            ].map((option) => (
              <button
                key={option.key}
                className={listScope === option.key ? 'segment active' : 'segment'}
                type="button"
                onClick={() => setListScope(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {filteredReports.length ? (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Area / Date</th>
                    <th>Activity</th>
                    <th>Photo</th>
                    <th>Submitted</th>
                    <th>Remarks</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.paginatedData.map((report) => (
                    <tr
                      key={report.report_id}
                      className="clickable-row"
                      onClick={() => navigate(`/sales/field-reports/${report.report_id}`)}
                    >
                      <td>
                        <strong>{reportAreaLabel(report)}</strong>
                        {report.customer_name ? (
                          <div className="muted">Customer: {report.customer_name}</div>
                        ) : null}
                      </td>
                      <td>{report.activity_type}</td>
                      <td>
                        {report.photo ? (
                          <img
                            src={report.photo}
                            alt="Report"
                            style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, border: '1px solid #E2E8F0' }}
                          />
                        ) : '—'}
                      </td>
                      <td>{formatDisplayDateTime(report.created_at)}</td>
                      <td
                        style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={report.remarks}
                      >
                        {report.remarks || '—'}
                      </td>
                      <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="icon-action-button"
                          type="button"
                          title="View"
                          onClick={() => navigate(`/sales/field-reports/${report.report_id}`)}
                        >
                          <NavIcon name="view" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination {...pagination} />
          </>
        ) : (
          <EmptyState
            title="No reports yet — submit after working your assigned area."
            description={listScope === 'today' ? 'No reports for today.' : 'Adjust the Today / History filter or submit a new report.'}
          />
        )}
      </section>
    </div>
  );
}

export function FieldActivityReportDetailPage({ reportId, navigate, showToast }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      if (!reportId) {
        setError('No report id provided.');
        setLoading(false);
        return;
      }
      setLoading(true);
      const result = await fetchSalesFieldReportById(reportId);
      if (result.success && result.data) {
        setReport(result.data);
        setError(null);
      } else {
        setReport(null);
        setError(result.message || 'Report not found.');
        showToast?.(result.message || 'Report not found.', 'error');
      }
      setLoading(false);
    }
    load();
  }, [reportId, showToast]);

  if (loading) return <LoadingState message="Loading report..." />;
  if (error || !report) {
    return (
      <EmptyState
        title="Report not found"
        description={error || 'This report is not on your account.'}
        actionLabel="Back to Field Reports"
        onAction={() => navigate('/sales/field-reports')}
      />
    );
  }

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Field Activity Report</h3>
          <p className="muted">Your submitted fieldwork report — view only.</p>
        </div>
        <DetailRowsTable
          rows={[
            { label: 'Assigned Area', value: report.area_name || '—' },
            {
              label: 'Work Date',
              value: report.work_date || report.scheduled_date
                ? formatDisplayDate(report.work_date || report.scheduled_date)
                : '—',
            },
            { label: 'Activity Type', value: report.activity_type || '—' },
            { label: 'Related Customer', value: report.customer_name || 'None' },
            { label: 'Submitted', value: formatDisplayDateTime(report.created_at) },
            { label: 'Sync Status', value: <StatusBadge status={report.sync_status || 'Synced'} /> },
          ]}
        />
      </section>

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Remarks</h3>
        </div>
        <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{report.remarks || '—'}</p>
      </section>

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Photo Evidence</h3>
        </div>
        {report.photo ? (
          <a href={report.photo} target="_blank" rel="noreferrer">
            <img
              src={report.photo}
              alt="Field evidence"
              style={{ maxWidth: '100%', maxHeight: 480, borderRadius: 8, border: '1px solid #E2E8F0' }}
            />
          </a>
        ) : (
          <p className="muted">No photo attached.</p>
        )}
      </section>

      <div className="flex justify-end gap-2 mt-4">
        <button className="button secondary" type="button" onClick={() => navigate('/sales/field-reports')}>
          Back to Field Reports
        </button>
        {report.assignment_id ? (
          <button
            className="button ghost"
            type="button"
            onClick={() => navigate(`/sales/schedule/${report.assignment_id}`)}
          >
            Open Assigned Area
          </button>
        ) : null}
      </div>
    </div>
  );
}
