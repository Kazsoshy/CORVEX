import { useState, useMemo } from 'react';
import { CUSTOMER_CREDIT_RECORDS, BRANCHES, getCreditRecordById } from '../../data/warehouseMockData';
import { NavIcon } from '../../navIcons';
import { EmptyState } from '../collector/EmptyState';
import { StatusBadge } from '../StatusBadge';

function actionButtonClass(variant) {
  if (variant === 'secondary') return 'button secondary';
  if (variant === 'ghost') return 'button ghost';
  return 'button';
}

function PageToolbar({ actions, onAction }) {
  if (!actions?.length) return null;
  return (
    <header className="page-toolbar">
      <div className="page-toolbar-main">
        <div className="page-toolbar-actions">
          {actions.map((action) => (
            <button key={action.label} className={actionButtonClass(action.variant)} type="button" onClick={() => onAction(action)}>
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

function normalizeBranch(branch) {
  return (branch || '').replace(/ Branch$/, '').trim();
}

export function CreditHistoryListPage({ navigate, basePath = '/warehouse/credit-history', userBranch }) {
  const normalizedUserBranch = normalizeBranch(userBranch);
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState(normalizedUserBranch || 'All');
  const [riskFilter, setRiskFilter] = useState('All');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return CUSTOMER_CREDIT_RECORDS.filter((r) => {
      const matchSearch = !q || r.customerName.toLowerCase().includes(q) || r.accountNumber.toLowerCase().includes(q);
      const recordBranch = normalizeBranch(r.branch);
      const matchBranch = !normalizedUserBranch || recordBranch === branchFilter || (branchFilter === 'All' && recordBranch === normalizedUserBranch);
      const matchRisk   = riskFilter  === 'All' || r.riskLevel === riskFilter;
      return matchSearch && matchBranch && matchRisk;
    });
  }, [search, branchFilter, riskFilter, normalizedUserBranch]);

  const riskStyle = { Low: { color: '#059669', bg: 'rgba(5,150,105,0.1)' }, Medium: { color: '#d97706', bg: 'rgba(217,119,6,0.1)' }, High: { color: '#dc2626', bg: 'rgba(220,38,38,0.1)' }, Critical: { color: '#7f1d1d', bg: 'rgba(127,29,29,0.12)' } };

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Customer Credit History</h3><p className="muted">Monitor credit standing, delinquency flags, and payment behaviour for inventory release decisions.</p></div>
        <div className="accounts-toolbar">
          <input className="search-input" type="search" placeholder="Search by customer name or account number" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="accounts-filters">
            <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} disabled={!!normalizedUserBranch}>
              {normalizedUserBranch && <option value={normalizedUserBranch}>{normalizedUserBranch}</option>}
              {!normalizedUserBranch && <option value="All">All Branches</option>}
              {BRANCHES.map((b) => <option key={b}>{b}</option>)}
            </select>
            <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}>
              {['All', 'Low', 'Medium', 'High', 'Critical'].map((r) => <option key={r} value={r}>{r === 'All' ? 'All Risk Levels' : r}</option>)}
            </select>
          </div>
        </div>
      </section>

      {filtered.length ? (
        <section className="panel content-panel">
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr><th>Account</th><th>Customer</th><th>Branch</th><th>Outstanding</th><th>Credit Limit</th><th>Utilization</th><th>Days Overdue</th><th>Risk</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const rs = riskStyle[r.riskLevel] ?? {};
                  return (
                    <tr key={r.id}>
                      <td>{r.accountNumber}</td>
                      <td><strong>{r.customerName}</strong></td>
                      <td>{r.branch.replace(' Branch', '')}</td>
                      <td style={{ fontWeight: 600, color: r.outstandingBalance > 0 ? '#dc2626' : '#059669' }}>
                        {r.outstandingBalance > 0 ? `₱${r.outstandingBalance.toLocaleString('en-PH')}` : 'Clear'}
                      </td>
                      <td>₱{r.creditLimit.toLocaleString('en-PH')}</td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 50, height: 6, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden', display: 'inline-block' }}>
                            <span style={{ display: 'block', height: '100%', width: `${r.creditUtilization}%`, background: r.creditUtilization > 70 ? '#dc2626' : '#2563eb', borderRadius: 999 }} />
                          </span>
                          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{r.creditUtilization}%</span>
                        </span>
                      </td>
                      <td style={{ color: r.daysOverdue > 0 ? '#dc2626' : '#059669', fontWeight: 600 }}>{r.daysOverdue > 0 ? `${r.daysOverdue}d` : '—'}</td>
                      <td>
                        <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', background: rs.bg, color: rs.color }}>
                          {r.riskLevel}
                        </span>
                      </td>
                      <td className="table-actions">
                        <button className="icon-action-button" type="button" title="View" onClick={() => navigate(`${basePath}/${r.id}`)}><NavIcon name="view" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : <EmptyState title="No records found" description="Adjust your search or filters." />}
    </div>
  );
}

export function CreditHistoryDetailPage({ creditId, navigate, basePath = '/warehouse/credit-history' }) {
  const record = getCreditRecordById(creditId);
  if (!record) return <EmptyState title="Record not found" actionLabel="Back" onAction={() => navigate(basePath)} />;

  const riskColors = { Low: '#059669', Medium: '#d97706', High: '#dc2626', Critical: '#7f1d1d' };
  const color = riskColors[record.riskLevel] ?? '#64748b';

  return (
    <div className="page">
      <section className="panel dashboard-greeting">
        <div className="dashboard-greeting-main">
          <p className="dashboard-eyebrow" style={{ color }}>{record.riskLevel} Risk · {record.status}</p>
          <h2>{record.customerName}</h2>
          <p className="muted">{record.accountNumber} · {record.branch}</p>
        </div>
      </section>

      <section className="stats-grid">
        {[
          { label: 'Credit Limit',       value: `₱${record.creditLimit.toLocaleString('en-PH')}` },
          { label: 'Outstanding Balance', value: `₱${record.outstandingBalance.toLocaleString('en-PH')}` },
          { label: 'Credit Utilization',  value: `${record.creditUtilization}%` },
          { label: 'Days Overdue',        value: record.daysOverdue > 0 ? `${record.daysOverdue} days` : 'None' },
          { label: 'Last Payment',        value: `₱${record.lastPaymentAmount.toLocaleString('en-PH')}` },
          { label: 'Last Payment Date',   value: record.lastPaymentDate },
        ].map((s, i) => (
          <article key={s.label} className="stat-card" style={{ '--stat-index': i }}>
            <div className="stat-card-top"><span className="stat-index">{String(i + 1).padStart(2, '0')}</span><span className="stat-dot" /></div>
            <span className="stat-label">{s.label}</span>
            <strong className="stat-value" style={{ fontSize: '1.1rem' }}>{s.value}</strong>
          </article>
        ))}
      </section>

      {record.delinquencyFlags.length > 0 && (
        <section className="panel content-panel" style={{ borderColor: '#fca5a5', background: 'rgba(220,38,38,0.04)' }}>
          <div className="panel-section-header"><h3 style={{ color: '#dc2626' }}>⚠ Delinquency Flags</h3></div>
          <ul className="flag-list">
            {record.delinquencyFlags.map((f) => <li key={f}>{f}</li>)}
          </ul>
        </section>
      )}

      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Payment History</h3></div>
        {record.paymentHistory.length ? (
          <div className="table-shell">
            <table className="data-table">
              <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Status</th><th>Receipt #</th></tr></thead>
              <tbody>
                {record.paymentHistory.map((p) => (
                  <tr key={p.receipt}>
                    <td>{p.date}</td>
                    <td>₱{p.amount.toLocaleString('en-PH')}</td>
                    <td>{p.method}</td>
                    <td><StatusBadge status={p.status} /></td>
                    <td>{p.receipt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="No payment history" description="No payments on record for this account." />}
      </section>

      <PageToolbar actions={[{ label: 'Back to Credit History', to: basePath, variant: 'ghost' }]} onAction={(a) => navigate(a.to)} />
    </div>
  );
}
