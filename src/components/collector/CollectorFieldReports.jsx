import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  fetchFieldActivityReports,
  fetchFieldActivityReportById,
  fetchTodayFieldVisits,
  submitFieldActivityReport,
} from '../../api/collectorService';
import { formatDisplayDate, formatDisplayDateTime } from '../../utils/formatters.js';
import { usePagination } from '../../hooks/usePagination';
import { isBrowserOnline } from '../../offline/connection.js';
import { saveOfflineRecord } from '../../offline/db.js';
import { DeviceQueue, loadWaiting } from '../../offline/DeviceQueue.jsx';
import { isCollectorAutoSyncEnabled } from '../../offline/prefs.js';
import { NavIcon } from '../../navIcons';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { DetailRowsTable } from '../shared/DetailRowsTable';
import { Pagination } from '../shared/Pagination';
import { StatusBadge } from '../StatusBadge';

export const COLLECTOR_NORMAL_ACTIVITIES = [
  'Collection',
  'Partial Collection',
  'Promise to Pay',
  'Customer Not Available',
  'Follow-up',
];

export const COLLECTOR_INCIDENT_ACTIVITIES = [
  'Payment Dispute',
  'Customer Refused',
  'Safety / Aggression',
  'Location Issue',
];

const INCIDENT_SET = new Set(COLLECTOR_INCIDENT_ACTIVITIES);
const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];

function manilaToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function manilaDateKey(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(value));
}

function isIncidentActivity(activityType) {
  return INCIDENT_SET.has(String(activityType || '').trim());
}

function visitLabel(visit) {
  if (!visit) return '—';
  const date = visit.scheduled_date ? formatDisplayDate(visit.scheduled_date) : '';
  return [visit.customer_name, date, visit.status].filter(Boolean).join(' · ');
}

function reportCustomerLabel(report) {
  if (report.customer_name) {
    const date = report.scheduled_date ? formatDisplayDate(report.scheduled_date) : null;
    return [report.customer_name, date].filter(Boolean).join(' · ');
  }
  return '—';
}

export function FieldActivityReportsPage({ navigate, showToast }) {
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  const preVisitId = search.get('visitId') || '';
  const preCustomerId = search.get('customer') || search.get('customerId') || '';
  const fromContext = search.get('from') || '';

  const [reports, setReports] = useState([]);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [listScope, setListScope] = useState('today');
  const [form, setForm] = useState({
    visit_id: preVisitId,
    activity_type: '',
    severity: '',
    remarks: '',
    photo: '',
    photoName: '',
  });
  const [errors, setErrors] = useState({});
  const [deviceReports, setDeviceReports] = useState([]);

  async function loadDeviceReports() {
    try {
      setDeviceReports(await loadWaiting('field_activity_reports'));
    } catch {
      setDeviceReports([]);
    }
  }

  async function loadReports() {
    setLoading(true);
    const [reportsResult, visitsResult] = await Promise.all([
      fetchFieldActivityReports(),
      fetchTodayFieldVisits(),
    ]);

    if (reportsResult.success) setReports(reportsResult.data || []);
    const loadedVisits = visitsResult.success ? visitsResult.data || [] : [];
    setVisits(loadedVisits);

    setForm((prev) => {
      if (prev.visit_id) return prev;
      const matched =
        (preVisitId && loadedVisits.find((v) => String(v.visit_id) === String(preVisitId)))
        || (preCustomerId && loadedVisits.find((v) => String(v.customer_id) === String(preCustomerId)))
        || null;
      if (matched) return { ...prev, visit_id: String(matched.visit_id) };
      if (preVisitId) return { ...prev, visit_id: String(preVisitId) };
      return prev;
    });

    await loadDeviceReports();
    setLoading(false);
  }

  useEffect(() => {
    loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preVisitId, preCustomerId]);

  async function keepReportOnDevice() {
    const visit = visits.find((row) => String(row.visit_id) === String(form.visit_id));
    await saveOfflineRecord({
      tableName: 'field_activity_reports',
      payload: {
        visit_id: Number(form.visit_id),
        activity_type: form.activity_type,
        severity: isIncidentActivity(form.activity_type) ? form.severity : undefined,
        remarks: form.remarks.trim(),
        photo: form.photo,
        customer_name: visit?.customer_name || '',
        visit_status: visit?.status || '',
      },
    });
    showToast(
      isCollectorAutoSyncEnabled()
        ? 'Saved on this device. It will sync when you are online.'
        : 'Saved on this device. Send it from Settings while auto-sync is off.',
      'success'
    );
    setForm({
      visit_id: form.visit_id,
      activity_type: '',
      severity: '',
      remarks: '',
      photo: '',
      photoName: '',
    });
    await loadDeviceReports();
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    const nextErrors = {};
    if (!form.visit_id) nextErrors.visit_id = 'Select a customer / route stop.';
    if (!form.activity_type) nextErrors.activity_type = 'Select an activity / outcome.';
    if (isIncidentActivity(form.activity_type) && !form.severity) {
      nextErrors.severity = 'Select a severity for incident/issue activities.';
    }
    if (!form.remarks.trim()) nextErrors.remarks = 'Remarks are required.';
    if (form.remarks.trim().length > 4000) nextErrors.remarks = 'Remarks must be 4000 characters or fewer.';
    if (!form.photo) nextErrors.photo = 'Photo evidence is required.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    if (!isBrowserOnline()) {
      await keepReportOnDevice();
      return;
    }

    setSubmitting(true);
    const result = await submitFieldActivityReport({
      visit_id: Number(form.visit_id),
      activity_type: form.activity_type,
      severity: isIncidentActivity(form.activity_type) ? form.severity : undefined,
      remarks: form.remarks.trim(),
      photo: form.photo,
    });
    setSubmitting(false);

    if (result.success) {
      const reportId = result.data?.report_id;
      showToast(
        result.message || 'Field activity report submitted successfully. Your Branch Manager can now review this report.',
        'success'
      );
      setForm({
        visit_id: form.visit_id,
        activity_type: '',
        severity: '',
        remarks: '',
        photo: '',
        photoName: '',
      });
      setErrors({});
      if (reportId) {
        navigate(`/collector/field-reports/${reportId}`);
      } else {
        loadReports();
      }
    } else if (result.offline) {
      await keepReportOnDevice();
    } else {
      showToast(result.message || 'Failed to submit report.', 'error');
    }
  };

  const today = manilaToday();
  const filteredReports = useMemo(() => {
    if (listScope === 'all') return reports;
    return reports.filter((report) => {
      // Operational date = visit scheduled_date (same rule as BM Today filter).
      const workDate = String(report.scheduled_date || '').slice(0, 10);
      const dateKey = workDate || manilaDateKey(report.created_at);
      if (listScope === 'today') return dateKey === today;
      return dateKey && dateKey < today;
    });
  }, [reports, listScope, today]);

  const pagination = usePagination(filteredReports, { resetKey: listScope });
  const showSeverity = isIncidentActivity(form.activity_type);

  if (loading) return <LoadingState message="Loading field activity reports..." />;

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Field Activity Reports</h3>
          <p className="muted">
            Record collection outcomes and field issues for your assigned stops (photo + notes).
            {fromContext === 'route' ? ' Opened from Today\'s Route.' : ''}
          </p>
        </div>

        {deviceReports.length ? <DeviceQueue rows={deviceReports} /> : null}

        <form className="field-report-form" onSubmit={handleSubmit}>
          <div className="field-report-filter-row">
            <label className="field-report-field">
              <span>Customer / Route Stop<span className="required">*</span></span>
              <select
                className="filter-select"
                value={form.visit_id}
                onChange={(e) => setForm((p) => ({ ...p, visit_id: e.target.value }))}
              >
                <option value="">Select customer / route stop</option>
                {visits.map((visit) => (
                  <option key={visit.visit_id} value={visit.visit_id}>
                    {visitLabel(visit)}
                  </option>
                ))}
              </select>
              {errors.visit_id ? <p className="form-error">{errors.visit_id}</p> : null}
            </label>

            <label className="field-report-field">
              <span>Activity / Outcome<span className="required">*</span></span>
              <select
                className="filter-select"
                value={form.activity_type}
                onChange={(e) => {
                  const nextType = e.target.value;
                  setForm((p) => ({
                    ...p,
                    activity_type: nextType,
                    severity: isIncidentActivity(nextType) ? p.severity : '',
                  }));
                }}
              >
                <option value="">Select activity / outcome</option>
                <optgroup label="Normal Activities">
                  {COLLECTOR_NORMAL_ACTIVITIES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </optgroup>
                <optgroup label="Incident / Issue Activities">
                  {COLLECTOR_INCIDENT_ACTIVITIES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </optgroup>
              </select>
              {errors.activity_type ? <p className="form-error">{errors.activity_type}</p> : null}
            </label>
          </div>

          {!visits.length ? (
            <p className="field-report-hint">
              No assigned visits for today. Reports can be filed once a route stop is published for you.
            </p>
          ) : null}

          {showSeverity ? (
            <div className="form-group field-report-block">
              <label>Severity<span className="required">*</span></label>
              <select
                className="filter-select"
                value={form.severity}
                onChange={(e) => setForm((p) => ({ ...p, severity: e.target.value }))}
              >
                <option value="">Select severity</option>
                {SEVERITIES.map((level) => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
              {errors.severity ? <p className="form-error">{errors.severity}</p> : null}
            </div>
          ) : null}

          <div className="form-group field-report-block">
            <label>Remarks<span className="required">*</span></label>
            <textarea
              rows={3}
              placeholder="Describe the collection outcome, promise to pay, customer availability, or incident details."
              value={form.remarks}
              onChange={(e) => setForm((p) => ({ ...p, remarks: e.target.value }))}
            />
            {errors.remarks ? <p className="form-error">{errors.remarks}</p> : null}
          </div>

          <div className="form-group field-report-block">
            <label>Photo Evidence<span className="required">*</span></label>
            <p className="muted" style={{ marginTop: 0, marginBottom: 8 }}>
              Capture payment proof, storefront, location issue, or other field evidence.
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
                style={{ marginTop: 8, maxWidth: 200, maxHeight: 140, borderRadius: 8, border: '1px solid #BADBE9' }}
              />
            ) : null}
            {errors.photo ? <p className="form-error">{errors.photo}</p> : null}
          </div>

          <div className="flex justify-end">
            <button className="button" type="submit" disabled={submitting || !visits.length}>
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
                    <th>Customer / Visit Date</th>
                    <th>Activity / Outcome</th>
                    <th>Severity</th>
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
                      onClick={() => navigate(`/collector/field-reports/${report.report_id}`)}
                    >
                      <td>
                        <strong>{reportCustomerLabel(report)}</strong>
                      </td>
                      <td>{report.activity_type || '—'}</td>
                      <td>{report.severity || '—'}</td>
                      <td>
                        {report.photo ? (
                          <img
                            src={report.photo}
                            alt="Report"
                            style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, border: '1px solid #BADBE9' }}
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
                          title="View Details"
                          onClick={() => navigate(`/collector/field-reports/${report.report_id}`)}
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
            title="No reports yet — submit after a field visit."
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
      const result = await fetchFieldActivityReportById(reportId);
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
        onAction={() => navigate('/collector/field-reports')}
      />
    );
  }

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Field Activity Report</h3>
          <p className="muted">Your submitted field report — view only.</p>
        </div>
        <DetailRowsTable
          rows={[
            { label: 'Report ID', value: report.report_id },
            { label: 'Customer', value: report.customer_name || '—' },
            {
              label: 'Visit Date',
              value: report.scheduled_date ? formatDisplayDate(report.scheduled_date) : '—',
            },
            { label: 'Submitted', value: formatDisplayDateTime(report.created_at) },
            { label: 'Collector', value: report.collector_name || '—' },
            { label: 'Activity / Outcome', value: report.activity_type || '—' },
            { label: 'Severity', value: report.severity || '—' },
            { label: 'Route Visit', value: report.visit_id ? `#${report.visit_id}` : '—' },
            { label: 'Visit Status', value: report.visit_status || '—' },
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
              style={{ maxWidth: '100%', maxHeight: 480, borderRadius: 8, border: '1px solid #BADBE9' }}
            />
          </a>
        ) : (
          <p className="muted">No photo attached.</p>
        )}
      </section>

      <div className="flex justify-end gap-2 mt-4">
        <button className="button secondary" type="button" onClick={() => navigate('/collector/field-reports')}>
          Back to Field Reports
        </button>
        {report.customer_id ? (
          <button
            className="button ghost"
            type="button"
            onClick={() => navigate(`/collector/account-detail/${report.customer_id}?from=route`)}
          >
            Open Customer
          </button>
        ) : null}
      </div>
    </div>
  );
}
