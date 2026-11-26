import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  fetchSalesAreaAssignments,
  fetchSalesFieldReportById,
  fetchSalesFieldReports,
  submitSalesFieldReport,
  updateSalesFieldReport,
} from '../../api/salesService';
import { formatDisplayDate, formatDisplayDateTime } from '../../utils/formatters.js';
import { usePagination } from '../../hooks/usePagination';
import { isBrowserOnline } from '../../offline/connection.js';
import { saveOfflineRecord } from '../../offline/db.js';
import { DeviceQueue, loadWaiting } from '../../offline/DeviceQueue.jsx';
import { isSalesAutoSyncEnabled, isSalesOfflineEnabled } from '../../offline/prefs.js';
import { SALES_ASSIGNMENT_OUTCOMES, outcomeLabel, reportPhotoSrc } from '../../utils/fieldActivityReports.js';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { DetailRowsTable } from '../shared/DetailRowsTable';
import { RowActionMenu } from '../shared/RowActionMenu';
import { Pagination } from '../shared/Pagination';
import { StatusBadge } from '../StatusBadge';

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
  return '—';
}

function emptyForm(assignmentId = '') {
  return {
    assignment_id: assignmentId ? String(assignmentId) : '',
    overall_outcome: '',
    remarks: '',
    photo: '',
    photoName: '',
    photo_exception: false,
    photo_exception_reason: '',
  };
}

async function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read image.'));
    reader.readAsDataURL(file);
  });
}

export function FieldActivityReportsPage({ navigate, showToast }) {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const preselectedAssignmentId = searchParams.get('assignmentId') || '';
  const mode = searchParams.get('mode') || '';

  const [reports, setReports] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('queue');
  const [listScope, setListScope] = useState('today');
  const [formOpen, setFormOpen] = useState(Boolean(preselectedAssignmentId) || mode === 'new');
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm(preselectedAssignmentId));
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
    const [reportsResult, todayAssignments, historyAssignments] = await Promise.all([
      fetchSalesFieldReports(),
      fetchSalesAreaAssignments({ scope: 'today' }),
      fetchSalesAreaAssignments({ scope: 'history' }),
    ]);

    if (reportsResult.success) setReports(reportsResult.data || []);
    const combined = [
      ...(todayAssignments.success ? todayAssignments.data || [] : []),
      ...(historyAssignments.success ? (historyAssignments.data || []).slice(0, 30) : []),
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
    setLoading(false);
    await loadDeviceReports();
  }

  useEffect(() => {
    loadReports();
  }, []);

  useEffect(() => {
    if (!preselectedAssignmentId && mode !== 'new' && mode !== 'edit') return;
    setActiveTab('queue');
    if (!preselectedAssignmentId) {
      if (mode === 'new') setFormOpen(true);
      return;
    }
    const existing = reports.find(
      (r) => String(r.assignment_id) === String(preselectedAssignmentId) && !r.is_superseded
    );
    if (existing) {
      setEditingId(existing.report_id);
      setForm({
        assignment_id: String(preselectedAssignmentId),
        overall_outcome: existing.activity_type || '',
        remarks: existing.remarks || '',
        photo: '',
        photoName: '',
        photo_exception: Boolean(existing.photo_exception_reason),
        photo_exception_reason: existing.photo_exception_reason || '',
      });
      setFormOpen(true);
    } else {
      setEditingId(null);
      setForm((prev) => ({ ...prev, assignment_id: String(preselectedAssignmentId) }));
      setFormOpen(true);
    }
  }, [preselectedAssignmentId, mode, reports]);

  const reportsByAssignment = useMemo(() => {
    const map = new Map();
    for (const report of reports) {
      if (report.is_superseded) continue;
      if (report.assignment_id) map.set(String(report.assignment_id), report);
    }
    return map;
  }, [reports]);

  const eligibleForCreate = useMemo(
    () => assignments.filter((a) => {
      if (a.status !== 'In Progress') return false;
      return !reportsByAssignment.has(String(a.assignment_id));
    }),
    [assignments, reportsByAssignment]
  );

  const today = manilaToday();
  const filteredReports = useMemo(() => {
    const active = reports.filter((r) => !r.is_superseded);
    if (listScope === 'all') return active;
    return active.filter((r) => {
      const work = String(r.work_date || r.scheduled_date || '').slice(0, 10);
      const created = r.created_at
        ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(r.created_at))
        : '';
      const day = work || created;
      if (listScope === 'today') return day === today;
      return day && day !== today;
    });
  }, [reports, listScope, today]);

  const pagination = usePagination(filteredReports, { resetKey: listScope });

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const onPhotoChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) {
      setErrors((prev) => ({ ...prev, photo: 'Choose an image file (JPG, PNG, or WebP).' }));
      return;
    }
    if (file.size > 700_000) {
      setErrors((prev) => ({ ...prev, photo: 'Image must be 700KB or smaller.' }));
      return;
    }
    try {
      const dataUrl = await readImageAsDataUrl(file);
      updateField('photo', dataUrl);
      updateField('photoName', file.name);
      updateField('photo_exception', false);
      updateField('photo_exception_reason', '');
    } catch {
      setErrors((prev) => ({ ...prev, photo: 'Could not read that image.' }));
    }
  };

  const validate = () => {
    const next = {};
    if (!form.assignment_id) next.assignment_id = 'Select an assigned area.';
    if (!form.overall_outcome) next.overall_outcome = 'Select an overall assignment outcome.';
    if (!String(form.remarks || '').trim()) next.remarks = 'Remarks are required.';
    if (form.photo_exception) {
      if (!String(form.photo_exception_reason || '').trim()) {
        next.photo_exception_reason = 'Explain why photo evidence cannot be provided.';
      }
    } else if (!editingId && !form.photo) {
      next.photo = 'Photo evidence is required, or mark a photo exception.';
    } else if (editingId && !form.photo && !form.photo_exception) {
      // Keep existing photo on edit unless exception is chosen / new photo uploaded.
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const buildPayload = () => ({
    assignment_id: Number(form.assignment_id),
    overall_outcome: form.overall_outcome,
    activity_type: form.overall_outcome,
    remarks: String(form.remarks || '').trim(),
    photo: form.photo_exception ? undefined : (form.photo || undefined),
    photo_exception_reason: form.photo_exception
      ? String(form.photo_exception_reason || '').trim()
      : (form.photo ? null : undefined),
  });

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    const payload = buildPayload();

    if (!isBrowserOnline()) {
      if (!isSalesOfflineEnabled()) {
        showToast?.('Turn on offline mode in Settings to save this report on the device.', 'error');
        setSubmitting(false);
        return;
      }
      await saveOfflineRecord({
        tableName: 'field_activity_reports',
        payload: { ...payload, saved_offline: true },
      });
      showToast?.(
        isSalesAutoSyncEnabled()
          ? 'Saved on this device. It will sync when you are online.'
          : 'Saved on this device. Send it from Settings while auto-sync is off.',
        'success'
      );
      setForm(emptyForm());
      setFormOpen(false);
      setEditingId(null);
      await loadDeviceReports();
      setSubmitting(false);
      return;
    }

    let result;
    if (editingId) {
      result = await updateSalesFieldReport(editingId, payload);
    } else {
      result = await submitSalesFieldReport(payload);
      if (!result.success && result.status === 409 && result.data?.report_id) {
        showToast?.(result.message || 'A report already exists. Opening it for edit.', 'error');
        navigate(`/sales/field-reports/${result.data.report_id}`);
        setSubmitting(false);
        return;
      }
    }

    setSubmitting(false);
    if (result.success) {
      showToast?.(result.message || (editingId ? 'Report updated.' : 'Report submitted.'), 'success');
      const reportId = result.data?.report_id || editingId;
      setForm(emptyForm());
      setFormOpen(false);
      setEditingId(null);
      await loadReports();
      if (reportId) navigate(`/sales/field-reports/${reportId}`);
    } else {
      showToast?.(result.message || 'Could not save report.', 'error');
    }
  };

  const startCreate = () => {
    setActiveTab('queue');
    setEditingId(null);
    setForm(emptyForm(eligibleForCreate[0]?.assignment_id || ''));
    setErrors({});
    setFormOpen(true);
  };

  const startEdit = (report) => {
    setActiveTab('queue');
    setEditingId(report.report_id);
    setForm({
      assignment_id: String(report.assignment_id || ''),
      overall_outcome: SALES_ASSIGNMENT_OUTCOMES.includes(report.activity_type)
        ? report.activity_type
        : '',
      remarks: report.remarks || '',
      photo: '',
      photoName: '',
      photo_exception: Boolean(report.photo_exception_reason) && !report.has_photo,
      photo_exception_reason: report.photo_exception_reason || '',
    });
    setErrors({});
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) return <LoadingState message="Loading field activity reports..." />;

  return (
    <div className="page">
      <DeviceQueue rows={deviceReports} />

      <section className="panel content-panel">
        <div className="list-section-header">
          <div>
            <h3>Field Activity Reports</h3>
            <p className="muted" style={{ marginTop: 4 }}>
              One consolidated report per assigned area. Submit before marking the assignment Done.
            </p>
          </div>
        </div>

        <div
          className="segmented-control"
          role="tablist"
          aria-label="Field activity report views"
          style={{ marginBottom: 16, flexWrap: 'wrap' }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'queue'}
            className={activeTab === 'queue' ? 'segment active' : 'segment'}
            onClick={() => setActiveTab('queue')}
          >
            Field Activity Reports
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'mine'}
            className={activeTab === 'mine' ? 'segment active' : 'segment'}
            onClick={() => setActiveTab('mine')}
          >
            My Reports
          </button>
        </div>

        {activeTab === 'queue' ? (
          <>
            <div className="list-section-header" style={{ marginBottom: 12 }}>
              <div className="list-section-actions flex flex-wrap gap-2">
                {formOpen ? (
                  <button className="button secondary" type="button" onClick={() => { setFormOpen(false); setEditingId(null); }}>
                    Hide Form
                  </button>
                ) : (
                  <button
                    className="button"
                    type="button"
                    onClick={startCreate}
                    disabled={!eligibleForCreate.length}
                  >
                    Submit FAR
                  </button>
                )}
              </div>
            </div>

            {!formOpen && !eligibleForCreate.length ? (
              <EmptyState
                title="No assignments waiting for a report"
                description="Start an In Progress assignment from your schedule, or open an existing report to edit before the deadline."
                actionLabel="Open Schedule"
                onAction={() => navigate('/sales/schedule')}
              />
            ) : null}

            {formOpen ? (
              <div style={{ marginTop: 16 }}>
                <h4 style={{ marginTop: 0 }}>{editingId ? 'Edit Field Activity Report' : 'Submit Field Activity Report'}</h4>
                <div className="form-grid">
                  <div className="form-field">
                    <label htmlFor="far-assignment">Assigned Area</label>
                    <select
                      id="far-assignment"
                      className="filter-select"
                      value={form.assignment_id}
                      disabled={Boolean(editingId)}
                      onChange={(e) => updateField('assignment_id', e.target.value)}
                    >
                      <option value="">Select assigned area</option>
                      {(editingId ? assignments : eligibleForCreate).map((a) => (
                        <option key={a.assignment_id} value={a.assignment_id}>
                          {areaLabel(a)} · {a.status}
                        </option>
                      ))}
                    </select>
                    {errors.assignment_id ? <p className="form-error">{errors.assignment_id}</p> : null}
                  </div>

                  <div className="form-field">
                    <label htmlFor="far-outcome">Overall Assignment Outcome</label>
                    <select
                      id="far-outcome"
                      className="filter-select"
                      value={form.overall_outcome}
                      onChange={(e) => updateField('overall_outcome', e.target.value)}
                    >
                      <option value="">Select outcome</option>
                      {SALES_ASSIGNMENT_OUTCOMES.map((outcome) => (
                        <option key={outcome} value={outcome}>{outcome}</option>
                      ))}
                    </select>
                    {errors.overall_outcome ? <p className="form-error">{errors.overall_outcome}</p> : null}
                  </div>

                  <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                    <label htmlFor="far-remarks">Remarks</label>
                    <textarea
                      id="far-remarks"
                      className="filter-input"
                      rows={4}
                      value={form.remarks}
                      onChange={(e) => updateField('remarks', e.target.value)}
                      placeholder="Summarize the assigned area covered, canvassing activities performed, prospective customers encountered, products promoted, results, and any follow-up requirements."
                    />
                    {errors.remarks ? <p className="form-error">{errors.remarks}</p> : null}
                  </div>

                  <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                    <label htmlFor="far-photo">Photo Evidence</label>
                    <input id="far-photo" type="file" accept="image/*" onChange={onPhotoChange} disabled={form.photo_exception} />
                    <p className="muted" style={{ marginTop: 4 }}>
                      JPG/PNG/WebP, max about 700KB. {editingId && !form.photo ? 'Leave empty to keep the current photo.' : 'Required unless you record a photo exception.'}
                    </p>
                    {form.photoName ? <p className="muted">Selected: {form.photoName}</p> : null}
                    {form.photo ? (
                      <img src={form.photo} alt="Evidence preview" style={{ marginTop: 8, maxWidth: 240, borderRadius: 8 }} />
                    ) : null}
                    {errors.photo ? <p className="form-error">{errors.photo}</p> : null}
                    <label className="flex items-center gap-2" style={{ marginTop: 8 }}>
                      <input
                        type="checkbox"
                        checked={form.photo_exception}
                        onChange={(e) => {
                          updateField('photo_exception', e.target.checked);
                          if (e.target.checked) {
                            updateField('photo', '');
                            updateField('photoName', '');
                          }
                        }}
                      />
                      <span>Photo cannot be provided (exception)</span>
                    </label>
                    {form.photo_exception ? (
                      <>
                        <textarea
                          className="filter-input"
                          rows={2}
                          style={{ marginTop: 8 }}
                          value={form.photo_exception_reason}
                          onChange={(e) => updateField('photo_exception_reason', e.target.value)}
                          placeholder="Explain why photo evidence is unavailable. Branch Manager will see this."
                        />
                        {errors.photo_exception_reason ? <p className="form-error">{errors.photo_exception_reason}</p> : null}
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2 mt-4">
                  <button className="button secondary" type="button" onClick={() => { setFormOpen(false); setEditingId(null); }}>
                    Cancel
                  </button>
                  <button className="button" type="button" disabled={submitting} onClick={handleSubmit}>
                    {submitting ? 'Saving…' : editingId ? 'Save Changes' : 'Submit Report'}
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {activeTab === 'mine' ? (
          <>
            <div className="list-section-header" style={{ marginBottom: 12 }}>
              <div className="list-section-actions">
                <div className="segmented-control" aria-label="Report date scope">
                  {[
                    { id: 'today', label: 'Today' },
                    { id: 'history', label: 'History' },
                    { id: 'all', label: 'All' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={listScope === opt.id ? 'segment active' : 'segment'}
                      onClick={() => setListScope(opt.id)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {filteredReports.length ? (
              <>
                <div className="corvex-table-wrapper">
                  <table className="corvex-table">
                    <thead>
                      <tr>
                        <th>Assigned Area</th>
                        <th>Work Date</th>
                        <th>Overall Outcome</th>
                        <th>Report Status</th>
                        <th>Submitted At</th>
                        <th>Last Updated</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagination.paginatedData.map((report) => (
                        <tr key={report.report_id}>
                          <td>{reportAreaLabel(report)}</td>
                          <td>{report.work_date ? formatDisplayDate(report.work_date) : '—'}</td>
                          <td>{outcomeLabel(report.activity_type)}</td>
                          <td><StatusBadge status={report.review_status || 'Submitted'} /></td>
                          <td>{formatDisplayDateTime(report.created_at)}</td>
                          <td>{formatDisplayDateTime(report.updated_at || report.created_at)}</td>
                          <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                            <RowActionMenu
                              label="Field report actions"
                              items={[
                                {
                                  key: 'view',
                                  label: 'View',
                                  onSelect: () => navigate(`/sales/field-reports/${report.report_id}`),
                                },
                                report.editable !== false ? {
                                  key: 'edit',
                                  label: 'Edit',
                                  onSelect: () => startEdit(report),
                                } : null,
                              ]}
                            />
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
                title={listScope === 'today' ? 'No FAR submitted today' : listScope === 'history' ? 'No historical reports' : 'No reports yet'}
                description={
                  eligibleForCreate.length
                    ? 'Submit a Field Activity Report for an In Progress assignment.'
                    : 'All eligible assignments already have reports, or no assignments are available.'
                }
                actionLabel={eligibleForCreate.length ? 'Submit FAR' : 'Open Schedule'}
                onAction={() => (eligibleForCreate.length ? startCreate() : navigate('/sales/schedule'))}
              />
            )}
          </>
        ) : null}
      </section>
    </div>
  );
}

export function FieldActivityReportDetailPage({ reportId, navigate, showToast }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await fetchSalesFieldReportById(reportId);
      if (result.success) setReport(result.data);
      else {
        setReport(null);
        showToast?.(result.message || 'Report not found.', 'error');
      }
      setLoading(false);
    }
    load();
  }, [reportId, showToast]);

  if (loading) return <LoadingState message="Loading report..." />;
  if (!report) {
    return (
      <EmptyState
        title="Report not found"
        actionLabel="Back to Reports"
        onAction={() => navigate('/sales/field-reports')}
      />
    );
  }

  const photoSrc = reportPhotoSrc(report.photo);
  const canEdit = report.editable !== false && !report.is_superseded;

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Field Activity Report</h3>
          <StatusBadge status={report.review_status || 'Submitted'} />
        </div>
        <DetailRowsTable
          rows={[
            { label: 'Assigned Area', value: report.area_name || '—' },
            { label: 'Work Date', value: report.work_date ? formatDisplayDate(report.work_date) : '—' },
            { label: 'Assignment', value: report.assignment_id ? `#${report.assignment_id}` : '—' },
            { label: 'Overall Outcome', value: outcomeLabel(report.activity_type) },
            { label: 'Remarks', value: report.remarks || '—' },
            { label: 'Photo Exception', value: report.photo_exception_reason || '—' },
            { label: 'Submitted', value: formatDisplayDateTime(report.created_at) },
            { label: 'Last Updated', value: formatDisplayDateTime(report.updated_at || report.created_at) },
            {
              label: 'Activity Summary',
              value: report.activity_summary
                ? `Sales ${report.activity_summary.sales_logged || 0} · New customers ${report.activity_summary.new_customers || 0}`
                : '—',
            },
          ]}
        />
        {photoSrc ? (
          <div style={{ marginTop: 12 }}>
            <p className="muted">Photo evidence</p>
            <a href={photoSrc} target="_blank" rel="noreferrer">
              <img src={photoSrc} alt="Field evidence" style={{ maxWidth: 320, borderRadius: 8 }} />
            </a>
          </div>
        ) : null}
        {(report.revision_history || []).length ? (
          <div style={{ marginTop: 16 }}>
            <h4>Revision history</h4>
            <ul>
              {(report.revision_history || []).slice().reverse().map((rev, idx) => (
                <li key={`${rev.at}-${idx}`}>
                  {formatDisplayDateTime(rev.at)} · {outcomeLabel(rev.activity_type)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2 mt-4">
          <button className="button secondary" type="button" onClick={() => navigate('/sales/field-reports')}>
            Back
          </button>
          {report.assignment_id ? (
            <button
              className="button secondary"
              type="button"
              onClick={() => navigate(`/sales/schedule/${report.assignment_id}`)}
            >
              Open Assignment
            </button>
          ) : null}
          {canEdit ? (
            <button
              className="button"
              type="button"
              onClick={() => navigate(`/sales/field-reports?assignmentId=${report.assignment_id}&mode=edit`)}
            >
              Edit Report
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
