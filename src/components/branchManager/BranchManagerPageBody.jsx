import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import {
  ALERTS, AUDIT_LOGS, BRANCH_ANALYTICS, BRANCH_MANAGER_PROFILE,
  CI_QUEUE, COLLECTORS, MAP_ACCOUNTS, NOTIFICATIONS, PENDING_APPROVALS,
  SALES_AGENTS, TRENDS, formatCurrency, getCIById,
  getCollectorById, getMapAccountById, getSalesAgentById,
} from '../../data/branchManagerMockData';
import { EmptyState } from '../collector/EmptyState';
import { LoadingState } from '../collector/LoadingState';
import { NavIcon } from '../../navIcons';

const C = ['#2563eb','#06b6d4','#10b981','#f59e0b','#ef4444'];

function cls(v) {
  if (v === 'secondary') return 'button secondary';
  if (v === 'ghost') return 'button ghost';
  return 'button';
}

function Toolbar({ actions, onAction }) {
  if (!actions?.length) return null;
  return (
    <header className="page-toolbar">
      <div className="page-toolbar-main">
        <div className="page-toolbar-actions">
          {actions.map((a) => (
            <button key={a.label} className={cls(a.variant)} type="button" onClick={() => onAction(a)}>{a.label}</button>
          ))}
        </div>
      </div>
    </header>
  );
}

function Stats({ stats }) {
  if (!stats?.length) return null;
  return (
    <section className="stats-grid">
      {stats.map((s, i) => (
        <article key={s.label} className="stat-card" style={{ '--stat-index': i }}>
          <div className="stat-card-top"><span className="stat-index">{String(i+1).padStart(2,'0')}</span><span className="stat-dot" /></div>
          <span className="stat-label">{s.label}</span>
          <strong className="stat-value">{s.value}</strong>
        </article>
      ))}
    </section>
  );
}

function Severity({ severity }) {
  const map = { Critical:'severity-critical', Warning:'severity-warning', Informational:'severity-info' };
  return <span className={`severity-badge ${map[severity]??''}`}>{severity}</span>;
}

function Card({ title, sub, children }) {
  return (
    <section className="panel content-panel">
      <div className="panel-section-header">
        <div><h3>{title}</h3>{sub&&<p className="muted" style={{margin:'2px 0 0',fontSize:'0.85rem'}}>{sub}</p>}</div>
      </div>
      {children}
    </section>
  );
}

function StaffCard({ title, metrics, actions, onAction }) {
  return (
    <article className="account-card">
      <div className="account-card-header"><h4>{title}</h4></div>
      <div className="account-metrics">
        {metrics.map((m) => <div key={m.label}><span className="metric-label">{m.label}</span><strong>{m.value}</strong></div>)}
      </div>
      <div className="account-card-actions">
        {actions.map((a) => <button key={a.label} className={cls(a.variant)} type="button" onClick={() => onAction(a)}>{a.label}</button>)}
      </div>
    </article>
  );
}

// ── chart data derived from mock ──────────────────────────────────────────────
const DAILY_COL = [
  {day:'Mon',  amount:170000, target:180000},
  {day:'Tue',  amount:178000, target:180000},
  {day:'Wed',  amount:182000, target:185000},
  {day:'Thu',  amount:186000, target:185000},
  {day:'Fri',  amount:189000, target:190000},
  {day:'Sat',  amount:192000, target:190000},
  {day:'Today',amount:186500, target:190000},
];
const WEEKLY_SALES_D = [
  {day:'Mon',  actual:220000, target:230000},
  {day:'Tue',  actual:235000, target:230000},
  {day:'Wed',  actual:241000, target:240000},
  {day:'Thu',  actual:248000, target:245000},
  {day:'Fri',  actual:252000, target:250000},
  {day:'Sat',  actual:258000, target:255000},
  {day:'Today',actual:248000, target:260000},
];
const DELINQUENCY_W = [
  {week:'W1', accounts:9,  rate:14},
  {week:'W2', accounts:10, rate:15},
  {week:'W3', accounts:9,  rate:13},
  {week:'W4', accounts:10, rate:16},
  {week:'W5', accounts:11, rate:17},
  {week:'W6', accounts:10, rate:16},
  {week:'W7', accounts:11, rate:18},
];
const COMPLIANCE_W = [
  {week:'W1', Maria:92, John:96, Pedro:82},
  {week:'W2', Maria:93, John:97, Pedro:83},
  {week:'W3', Maria:91, John:97, Pedro:84},
  {week:'W4', Maria:94, John:97, Pedro:85},
];

// ── Dashboard ─────────────────────────────────────────────────────────────────
function DashboardPage({ navigate }) {
  const unread = NOTIFICATIONS.filter((n) => !n.read).length;
  const critical = ALERTS.filter((a) => a.severity === 'Critical');
  return (
    <div className="page">
      <section className="panel dashboard-greeting">
        <div className="dashboard-greeting-main">
          <p className="dashboard-eyebrow">{BRANCH_MANAGER_PROFILE.branch}</p>
          <h2>{BRANCH_MANAGER_PROFILE.name}</h2>
          <p className="muted">Branch Health: <strong>{BRANCH_ANALYTICS.healthScore}/100</strong></p>
        </div>
        <Link to="/branch-manager/notifications" className="notification-bell" aria-label={`${unread} unread`}>
          <NavIcon name="bell" />{unread>0&&<span className="notification-badge">{unread}</span>}
        </Link>
      </section>

      <Stats stats={[
        {label:'Collection Rate',value:`${BRANCH_ANALYTICS.collectionRateToday}%`},
        {label:'Route Compliance',value:`${BRANCH_ANALYTICS.routeCompliance}%`},
        {label:'Sales Visit Completion',value:`${BRANCH_ANALYTICS.salesVisitCompletion}%`},
        {label:'Pending CI Approvals',value:String(BRANCH_ANALYTICS.pendingCI)},
        {label:'Overdue Accounts',value:String(BRANCH_ANALYTICS.overdueAccounts)},
        {label:'Stock Alerts',value:String(BRANCH_ANALYTICS.stockAlertsCount)},
      ]} />

      <div className="grid two-up">
        <Card title="Daily Collection vs Target" sub="This week">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={DAILY_COL}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
              <XAxis dataKey="day" tick={{fontSize:12}}/>
              <YAxis tick={{fontSize:11}} tickFormatter={(v)=>`${(v/1000).toFixed(0)}k`}/>
              <Tooltip formatter={(v)=>formatCurrency(v)}/>
              <Legend/>
              <Area type="monotone" dataKey="target" name="Target" stroke="#e2e8f0" fill="#f1f5f9" strokeWidth={2} strokeDasharray="5 5"/>
              <Area type="monotone" dataKey="amount" name="Collected" stroke="#2563eb" fill="#2563eb" fillOpacity={0.12} strokeWidth={2}/>
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Sales vs Target" sub="This week">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={WEEKLY_SALES_D}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
              <XAxis dataKey="day" tick={{fontSize:12}}/>
              <YAxis tick={{fontSize:11}} tickFormatter={(v)=>`${(v/1000).toFixed(0)}k`}/>
              <Tooltip formatter={(v)=>formatCurrency(v)}/><Legend/>
              <Bar dataKey="target" name="Target" fill="#e2e8f0" radius={[4,4,0,0]}/>
              <Bar dataKey="actual" name="Actual" fill="#06b6d4" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid two-up">
        <Card title="Delinquency Trend" sub="Weekly overdue accounts">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={DELINQUENCY_W}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
              <XAxis dataKey="week" tick={{fontSize:12}}/><YAxis tick={{fontSize:12}}/><Tooltip/><Legend/>
              <Area type="monotone" dataKey="accounts" name="Overdue" stroke="#ef4444" fill="#ef4444" fillOpacity={0.1} strokeWidth={2}/>
              <Area type="monotone" dataKey="rate" name="Rate %" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.08} strokeWidth={2}/>
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        <section className="panel content-panel">
          <div className="panel-section-header">
            <h3>Critical Alerts</h3>
            <button className="button ghost" type="button" onClick={()=>navigate('/branch-manager/alerts')}>View All</button>
          </div>
          <ul className="widget-list">
            {critical.slice(0,4).map((a)=>(
              <li key={a.id}><div><strong>{a.title}</strong><span className="muted">{a.category}</span></div><Severity severity={a.severity}/></li>
            ))}
          </ul>
        </section>
      </div>

      <Toolbar actions={[
        {label:'Field Operations',to:'/branch-manager/field-operations'},
        {label:'Approve CIs',to:'/branch-manager/ci-approvals',variant:'secondary'},
        {label:'GIS Map',to:'/branch-manager/gis',variant:'secondary'},
        {label:'Reports',to:'/branch-manager/reports',variant:'secondary'},
      ]} onAction={(a)=>navigate(a.to)}/>
    </div>
  );
}

// ── Field Operations (combined hub + tab navigation) ─────────────────────────
function FieldOperationsHub({ navigate, showToast }) {
  const [tab, setTab] = useState('overview');
  const tabs = [{key:'overview',label:'Overview'},{key:'collectors',label:'Collector Routes'},{key:'sales',label:'Sales Schedules'},{key:'performance',label:'Route Performance'}];

  const collectorChart = COLLECTORS.map((c)=>({name:c.name.split(' ')[0],compliance:c.complianceScore,recovery:c.recoveryRate}));
  const salesChart = SALES_AGENTS.map((a)=>({name:a.name.split(' ')[0],visits:a.visitCompletionRate,conversion:a.conversionRate}));

  return (
    <div className="page">
      <div className="segmented-control" style={{marginBottom:24,flexWrap:'wrap'}}>
        {tabs.map((t)=><button key={t.key} className={tab===t.key?'segment active':'segment'} type="button" onClick={()=>setTab(t.key)}>{t.label}</button>)}
      </div>

      {tab==='overview'&&(<>
        <Stats stats={[
          {label:'Active Collectors',value:String(BRANCH_ANALYTICS.activeCollectors)},
          {label:'Active Sales Agents',value:String(BRANCH_ANALYTICS.activeSalesAgents)},
          {label:'Route Compliance',value:`${BRANCH_ANALYTICS.routeCompliance}%`},
          {label:'Sales Completion',value:`${BRANCH_ANALYTICS.salesVisitCompletion}%`},
        ]}/>
        <div className="grid two-up">
          <Card title="Collector Performance" sub="Compliance & recovery">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={collectorChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                <XAxis dataKey="name" tick={{fontSize:12}}/><YAxis domain={[0,100]} unit="%" tick={{fontSize:12}}/><Tooltip formatter={(v)=>`${v}%`}/><Legend/>
                <Bar dataKey="compliance" name="Compliance" fill="#2563eb" radius={[4,4,0,0]}/>
                <Bar dataKey="recovery" name="Recovery" fill="#06b6d4" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card title="Sales Agent Performance" sub="Visit completion & conversion">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={salesChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                <XAxis dataKey="name" tick={{fontSize:12}}/><YAxis domain={[0,100]} unit="%" tick={{fontSize:12}}/><Tooltip formatter={(v)=>`${v}%`}/><Legend/>
                <Bar dataKey="visits" name="Visit Completion" fill="#8b5cf6" radius={[4,4,0,0]}/>
                <Bar dataKey="conversion" name="Conversion" fill="#10b981" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
        <Card title="Route Compliance Trend" sub="Weekly by collector">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={COMPLIANCE_W}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
              <XAxis dataKey="week" tick={{fontSize:12}}/><YAxis domain={[80,100]} unit="%" tick={{fontSize:12}}/><Tooltip formatter={(v)=>`${v}%`}/><Legend/>
              {['Maria','John','Pedro'].map((n,i)=><Line key={n} type="monotone" dataKey={n} stroke={C[i]} strokeWidth={2} dot={false}/>)}
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </>)}

      {tab==='collectors'&&(
        <div className="account-card-grid">
          {COLLECTORS.map((c)=>(
            <StaffCard key={c.id} title={c.name}
              metrics={[{label:'Assigned',value:c.accountsAssigned},{label:'Visited',value:c.accountsVisited},{label:'Pending',value:c.accountsPending},{label:'Compliance',value:`${c.complianceScore}%`},{label:'Collected',value:formatCurrency(c.collectionAmount)}]}
              actions={[{label:'Expand Route',action:'detail'},{label:'View on Map',action:'map',variant:'ghost'}]}
              onAction={(a)=>{ if(a.action==='detail') navigate(`/branch-manager/field-operations/collectors/${c.id}`); else navigate('/branch-manager/gis'); }}
            />
          ))}
        </div>
      )}

      {tab==='sales'&&(
        <div className="account-card-grid">
          {SALES_AGENTS.map((a)=>(
            <StaffCard key={a.id} title={a.name}
              metrics={[{label:'Clients',value:a.clientsAssigned},{label:'Visits',value:a.visitsCompleted},{label:'Sales',value:a.salesLogged},{label:'Revenue',value:formatCurrency(a.totalSalesAmount)}]}
              actions={[{label:'Expand Schedule',action:'detail'},{label:'View on Map',action:'map',variant:'ghost'}]}
              onAction={(act)=>{ if(act.action==='detail') navigate(`/branch-manager/field-operations/sales/${a.id}`); else navigate('/branch-manager/gis'); }}
            />
          ))}
        </div>
      )}

      {tab==='performance'&&(
        <section className="panel content-panel">
          <div className="panel-section-header"><h3>Route Performance Summary</h3></div>
          <div className="table-shell">
            <table className="data-table">
              <thead><tr><th>Staff</th><th>Type</th><th>Compliance</th><th>Recovery / Revenue</th><th>Missed</th></tr></thead>
              <tbody>
                {COLLECTORS.map((c)=><tr key={c.id}><td>{c.name}</td><td>Collector</td><td>{c.complianceScore}%</td><td>{c.recoveryRate}%</td><td>{c.missedVisits}</td></tr>)}
                {SALES_AGENTS.map((a)=><tr key={a.id}><td>{a.name}</td><td>Sales</td><td>{a.visitCompletionRate}%</td><td>{formatCurrency(a.totalSalesAmount)}</td><td>—</td></tr>)}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function CollectorDetailPage({ collectorId, navigate }) {
  const c = getCollectorById(collectorId);
  if (!c) return <EmptyState title="Collector not found" actionLabel="Back" onAction={()=>navigate('/branch-manager/field-operations')}/>;
  return (
    <div className="page">
      <Stats stats={[{label:'Compliance',value:`${c.complianceScore}%`},{label:'Success Rate',value:`${c.collectionSuccessRate}%`},{label:'Avg Visit',value:c.avgVisitDuration},{label:'Recovery',value:`${c.recoveryRate}%`}]}/>
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Route Timeline</h3><span className="muted">GPS: {c.gpsAttendance?'Active':'Off'}</span></div>
        {c.route.length?(<div className="table-shell"><table className="data-table"><thead><tr><th>Account</th><th>Status</th><th>Time</th><th>Amount</th></tr></thead><tbody>{c.route.map((r)=><tr key={r.account}><td>{r.account}</td><td>{r.status}</td><td>{r.time}</td><td>{r.amount?formatCurrency(r.amount):'—'}</td></tr>)}</tbody></table></div>):<EmptyState title="No route data"/>}
        <div className="placeholder-map" style={{marginTop:16}}>GPS route playback</div>
      </section>
      <Toolbar actions={[{label:'View on Map',to:'/branch-manager/gis',variant:'secondary'},{label:'Back',to:'/branch-manager/field-operations',variant:'ghost'}]} onAction={(a)=>navigate(a.to)}/>
    </div>
  );
}

function SalesAgentDetailPage({ agentId, navigate }) {
  const a = getSalesAgentById(agentId);
  if (!a) return <EmptyState title="Agent not found" actionLabel="Back" onAction={()=>navigate('/branch-manager/field-operations')}/>;
  return (
    <div className="page">
      <Stats stats={[{label:'Visit Completion',value:`${a.visitCompletionRate}%`},{label:'Conversion',value:`${a.conversionRate}%`},{label:'Avg Sale',value:formatCurrency(a.avgSaleValue)},{label:'New Clients',value:String(a.newClientsAcquired)}]}/>
      <section className="panel content-panel">
        {a.clients.length?(<><h4 className="subsection-title">Clients</h4><ul className="bullet-list">{a.clients.map((c)=><li key={c}>{c}</li>)}</ul></>):null}
        {a.productPerformance.length?(<><h4 className="subsection-title" style={{marginTop:16}}>Product Performance</h4><ul className="widget-list">{a.productPerformance.map((p)=><li key={p.product}><div><strong>{p.product}</strong></div><span>{p.units} units</span></li>)}</ul></>):null}
      </section>
      <Toolbar actions={[{label:'Back',to:'/branch-manager/field-operations',variant:'ghost'}]} onAction={(a)=>navigate(a.to)}/>
    </div>
  );
}

// ── Reports & Analytics (combined with tab nav) ───────────────────────────────
function ReportsHubPage({ navigate, showToast }) {
  const [tab, setTab] = useState('collection');
  const tabs = [{key:'collection',label:'Collections'},{key:'sales',label:'Sales'},{key:'inventory',label:'Inventory'},{key:'delinquency',label:'Delinquency'}];
  const exportRow = <Toolbar actions={[{label:'Export PDF',action:'pdf'},{label:'Export Excel',action:'excel',variant:'secondary'}]} onAction={(a)=>showToast(`${a.label} initiated.`,'success')}/>;
  const collectorAmt = COLLECTORS.map((c)=>({name:c.name.split(' ')[0],amount:c.collectionAmount,compliance:c.complianceScore}));
  const agentRev = SALES_AGENTS.map((a)=>({name:a.name.split(' ')[0],revenue:a.totalSalesAmount,visits:a.visitCompletionRate}));

  return (
    <div className="page">
      <div className="segmented-control" style={{marginBottom:24,flexWrap:'wrap'}}>
        {tabs.map((t)=><button key={t.key} className={tab===t.key?'segment active':'segment'} type="button" onClick={()=>setTab(t.key)}>{t.label}</button>)}
      </div>

      {tab==='collection'&&(<>
        <Stats stats={[{label:'Collections Today',value:formatCurrency(BRANCH_ANALYTICS.totalCollectionsToday)},{label:'Collection Rate',value:`${BRANCH_ANALYTICS.collectionRateToday}%`},{label:'Efficiency',value:`${BRANCH_ANALYTICS.collectionEfficiency}%`},{label:'Overdue',value:String(BRANCH_ANALYTICS.overdueAccounts)}]}/>
        <div className="grid two-up">
          <Card title="Daily Collection vs Target">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={DAILY_COL}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="day" tick={{fontSize:12}}/><YAxis tick={{fontSize:11}} tickFormatter={(v)=>`${(v/1000).toFixed(0)}k`}/><Tooltip formatter={(v)=>formatCurrency(v)}/><Legend/>
                <Area type="monotone" dataKey="target" name="Target" stroke="#e2e8f0" fill="#f1f5f9" strokeWidth={2} strokeDasharray="5 5"/>
                <Area type="monotone" dataKey="amount" name="Collected" stroke="#2563eb" fill="#2563eb" fillOpacity={0.12} strokeWidth={2}/>
              </AreaChart>
            </ResponsiveContainer>
          </Card>
          <Card title="Collector Amounts">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={collectorAmt}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="name" tick={{fontSize:12}}/><YAxis tick={{fontSize:11}} tickFormatter={(v)=>`${(v/1000).toFixed(0)}k`}/><Tooltip/><Legend/>
                <Bar dataKey="amount" name="Collected (PHP)" fill="#2563eb" radius={[4,4,0,0]}/>
                <Bar dataKey="compliance" name="Compliance %" fill="#06b6d4" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>{exportRow}
      </>)}

      {tab==='sales'&&(<>
        <Stats stats={[{label:'Sales Today',value:formatCurrency(BRANCH_ANALYTICS.totalSalesToday)},{label:'Sales Efficiency',value:`${BRANCH_ANALYTICS.salesEfficiency}%`},{label:'Agents',value:String(BRANCH_ANALYTICS.activeSalesAgents)},{label:'Visit Completion',value:`${BRANCH_ANALYTICS.salesVisitCompletion}%`}]}/>
        <div className="grid two-up">
          <Card title="Sales vs Target">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={WEEKLY_SALES_D}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="day" tick={{fontSize:12}}/><YAxis tick={{fontSize:11}} tickFormatter={(v)=>`${(v/1000).toFixed(0)}k`}/><Tooltip formatter={(v)=>formatCurrency(v)}/><Legend/>
                <Bar dataKey="target" name="Target" fill="#e2e8f0" radius={[4,4,0,0]}/>
                <Bar dataKey="actual" name="Actual" fill="#06b6d4" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card title="Agent Revenue & Visits">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={agentRev}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="name" tick={{fontSize:12}}/><YAxis yAxisId="l" tick={{fontSize:11}} tickFormatter={(v)=>`${(v/1000).toFixed(0)}k`}/><YAxis yAxisId="r" orientation="right" domain={[0,100]} unit="%" tick={{fontSize:12}}/><Tooltip/><Legend/>
                <Bar yAxisId="l" dataKey="revenue" name="Revenue" fill="#8b5cf6" radius={[4,4,0,0]}/>
                <Bar yAxisId="r" dataKey="visits" name="Visit %" fill="#10b981" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>{exportRow}
      </>)}

      {tab==='inventory'&&(<>
        <Stats stats={[{label:'Inventory Health',value:`${BRANCH_ANALYTICS.inventoryHealth}%`},{label:'Stock Alerts',value:String(BRANCH_ANALYTICS.stockAlertsCount)}]}/>
        <Card title="Inventory Status"><div className="placeholder-map" style={{minHeight:160}}>Inventory chart — connect to warehouse data</div></Card>
        {exportRow}
      </>)}

      {tab==='delinquency'&&(<>
        <Stats stats={[{label:'Overdue Accounts',value:String(BRANCH_ANALYTICS.overdueAccounts)},{label:'Branch Health',value:`${BRANCH_ANALYTICS.healthScore}/100`}]}/>
        <div className="grid two-up">
          <Card title="Delinquency Trend">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={DELINQUENCY_W}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="week" tick={{fontSize:12}}/><YAxis tick={{fontSize:12}}/><Tooltip/><Legend/>
                <Area type="monotone" dataKey="accounts" name="Overdue" stroke="#ef4444" fill="#ef4444" fillOpacity={0.1} strokeWidth={2}/>
                <Area type="monotone" dataKey="rate" name="Rate %" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.08} strokeWidth={2}/>
              </AreaChart>
            </ResponsiveContainer>
          </Card>
          <Card title="Route Compliance Trend">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={COMPLIANCE_W}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="week" tick={{fontSize:12}}/><YAxis domain={[80,100]} unit="%" tick={{fontSize:12}}/><Tooltip formatter={(v)=>`${v}%`}/><Legend/>
                {['Maria','John','Pedro'].map((n,i)=><Line key={n} type="monotone" dataKey={n} stroke={C[i]} strokeWidth={2} dot={false}/>)}
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </div>{exportRow}
      </>)}
    </div>
  );
}

// ── Staff Performance (improved) ──────────────────────────────────────────────
function StaffPerformancePage({ navigate }) {
  const [tab, setTab] = useState('overview');
  const [period, setPeriod] = useState('Daily');
  const tabs = [{key:'overview',label:'Overview'},{key:'collectors',label:'Collectors'},{key:'sales',label:'Sales Agents'},{key:'scorecards',label:'Scorecards'}];

  const topCollector = [...COLLECTORS].sort((a,b)=>b.complianceScore-a.complianceScore)[0];
  const topAgent = [...SALES_AGENTS].sort((a,b)=>b.totalSalesAmount-a.totalSalesAmount)[0];
  const combined = [
    ...COLLECTORS.map((c)=>({name:c.name,role:'Collector',score:c.complianceScore,metric:`${c.recoveryRate}% recovery`})),
    ...SALES_AGENTS.map((a)=>({name:a.name,role:'Sales',score:a.visitCompletionRate,metric:formatCurrency(a.totalSalesAmount)})),
  ].sort((a,b)=>b.score-a.score);

  const collectorBar = COLLECTORS.map((c)=>({name:c.name.split(' ')[0],score:c.complianceScore,recovery:c.recoveryRate,missed:c.missedVisits}));
  const salesBar = SALES_AGENTS.map((a)=>({name:a.name.split(' ')[0],visits:a.visitCompletionRate,conversion:a.conversionRate,newClients:a.newClientsAcquired}));

  return (
    <div className="page">
      <div className="segmented-control" style={{marginBottom:24,flexWrap:'wrap'}}>
        {tabs.map((t)=><button key={t.key} className={tab===t.key?'segment active':'segment'} type="button" onClick={()=>setTab(t.key)}>{t.label}</button>)}
      </div>

      {tab==='overview'&&(<>
        <Stats stats={[
          {label:'Active Collectors',value:String(BRANCH_ANALYTICS.activeCollectors)},
          {label:'Active Sales Agents',value:String(BRANCH_ANALYTICS.activeSalesAgents)},
          {label:'Top Collector',value:topCollector.name.split(' ')[0]},
          {label:'Top Sales Agent',value:topAgent.name.split(' ')[0]},
        ]}/>
        <div className="grid two-up">
          <Card title="Collector Scorecard" sub="Compliance & recovery rates">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={collectorBar}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="name" tick={{fontSize:12}}/><YAxis domain={[0,100]} unit="%" tick={{fontSize:12}}/><Tooltip formatter={(v)=>`${v}%`}/><Legend/>
                <Bar dataKey="score" name="Compliance" fill="#2563eb" radius={[4,4,0,0]}/>
                <Bar dataKey="recovery" name="Recovery" fill="#06b6d4" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card title="Sales Agent Scorecard" sub="Visit completion & conversion">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={salesBar}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="name" tick={{fontSize:12}}/><YAxis domain={[0,100]} unit="%" tick={{fontSize:12}}/><Tooltip formatter={(v)=>`${v}%`}/><Legend/>
                <Bar dataKey="visits" name="Visit Completion" fill="#8b5cf6" radius={[4,4,0,0]}/>
                <Bar dataKey="conversion" name="Conversion" fill="#10b981" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
        <Card title="Route Compliance Trend" sub="Weekly per collector">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={COMPLIANCE_W}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="week" tick={{fontSize:12}}/><YAxis domain={[80,100]} unit="%" tick={{fontSize:12}}/><Tooltip formatter={(v)=>`${v}%`}/><Legend/>
              {['Maria','John','Pedro'].map((n,i)=><Line key={n} type="monotone" dataKey={n} stroke={C[i]} strokeWidth={2} dot={false}/>)}
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </>)}

      {tab==='collectors'&&(
        <section className="panel content-panel">
          <div className="panel-section-header">
            <h3>Collector Rankings</h3>
            <div className="segmented-control">
              {['Daily','Weekly','Monthly'].map((p)=><button key={p} className={period===p?'segment active':'segment'} type="button" onClick={()=>setPeriod(p)}>{p}</button>)}
            </div>
          </div>
          <div className="table-shell">
            <table className="data-table">
              <thead><tr><th>#</th><th>Collector</th><th>Compliance</th><th>Collections</th><th>Recovery</th><th>Missed</th></tr></thead>
              <tbody>
                {[...COLLECTORS].sort((a,b)=>b.complianceScore-a.complianceScore).map((c,i)=>(
                  <tr key={c.id}><td>{i+1}</td><td>{c.name}</td><td>{c.complianceScore}%</td><td>{formatCurrency(c.collectionAmount)}</td><td>{c.recoveryRate}%</td><td>{c.missedVisits}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab==='sales'&&(
        <section className="panel content-panel">
          <div className="panel-section-header">
            <h3>Sales Agent Rankings</h3>
            <div className="segmented-control">
              {['Daily','Weekly','Monthly'].map((p)=><button key={p} className={period===p?'segment active':'segment'} type="button" onClick={()=>setPeriod(p)}>{p}</button>)}
            </div>
          </div>
          <div className="table-shell">
            <table className="data-table">
              <thead><tr><th>#</th><th>Agent</th><th>Visit Completion</th><th>Revenue</th><th>New Clients</th><th>Sales</th></tr></thead>
              <tbody>
                {[...SALES_AGENTS].sort((a,b)=>b.totalSalesAmount-a.totalSalesAmount).map((a,i)=>(
                  <tr key={a.id}><td>{i+1}</td><td>{a.name}</td><td>{a.visitCompletionRate}%</td><td>{formatCurrency(a.totalSalesAmount)}</td><td>{a.newClientsAcquired}</td><td>{a.salesLogged}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab==='scorecards'&&(
        <section className="panel content-panel">
          <div className="panel-section-header"><h3>Overall Rankings</h3></div>
          <ul className="widget-list">
            {combined.map((s,i)=>(
              <li key={s.name}>
                <div style={{display:'flex',alignItems:'center',gap:12}}>
                  <span style={{width:28,height:28,borderRadius:'50%',background:'#2563eb',color:'#fff',display:'grid',placeItems:'center',fontSize:'0.75rem',fontWeight:700,flexShrink:0}}>#{i+1}</span>
                  <div><strong>{s.name}</strong><span className="muted" style={{display:'block',fontSize:'0.82rem'}}>{s.role}</span></div>
                </div>
                <div style={{textAlign:'right'}}>
                  <strong>{s.score}%</strong>
                  <span className="muted" style={{display:'block',fontSize:'0.82rem'}}>{s.metric}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ── CI Queue ──────────────────────────────────────────────────────────────────
function CIQueuePage({ navigate, showToast }) {
  const [filter, setFilter] = useState('Pending');
  const filtered = useMemo(()=>CI_QUEUE.filter((c)=>filter==='All'||c.status===filter),[filter]);
  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="segmented-control">
          {['Pending','Approved','Rejected','All'].map((f)=><button key={f} className={filter===f?'segment active':'segment'} type="button" onClick={()=>setFilter(f)}>{f}</button>)}
        </div>
      </section>
      {filtered.length?(
        <section className="panel content-panel">
          <div className="table-shell"><table className="data-table">
            <thead><tr><th>Client</th><th>Submitted By</th><th>Date</th><th>Delinquency</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{filtered.map((ci)=>(<tr key={ci.id}><td>{ci.clientName}</td><td>{ci.submittedBy}</td><td>{ci.submissionDate}</td><td>{ci.delinquencyStatus}</td><td>{ci.status}</td><td className="table-actions">
              <button className="link-button" type="button" onClick={()=>navigate(`/branch-manager/ci-approvals/${ci.id}`)}>Open</button>
              {ci.status==='Pending'&&<><button className="link-button" type="button" onClick={()=>showToast(`Approved CI for ${ci.clientName}.`,'success')}>Approve</button><button className="link-button" type="button" onClick={()=>showToast(`Rejected CI for ${ci.clientName}.`,'error')}>Reject</button></>}
            </td></tr>))}</tbody>
          </table></div>
        </section>
      ):<EmptyState title="No CI records" description="No items match this filter."/>}
    </div>
  );
}

function CIDetailPage({ ciId, navigate, showToast }) {
  const ci = getCIById(ciId);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  if (!ci) return <EmptyState title="CI not found" actionLabel="Back" onAction={()=>navigate('/branch-manager/ci-approvals')}/>;
  return (
    <div className="page">
      <Stats stats={[{label:'Client',value:ci.clientName},{label:'Risk Score',value:String(ci.riskScore)},{label:'Delinquency',value:ci.delinquencyStatus},{label:'GIS Zone',value:ci.gisClassification}]}/>
      <section className="panel content-panel">
        <ul className="bullet-list"><li>Purpose: {ci.purpose}</li><li>Income: {formatCurrency(ci.monthlyIncome)}</li><li>Business: {ci.businessType}</li><li>References: {ci.references}</li><li>Remarks: {ci.formRemarks}</li></ul>
        {ci.delinquencyFlags.length?(<div style={{marginTop:16,padding:12,background:'rgba(220,38,38,0.06)',borderRadius:12}}><strong>Delinquency Flags:</strong><ul className="bullet-list">{ci.delinquencyFlags.map((f)=><li key={f}>{f}</li>)}</ul></div>):null}
        {ci.paymentHistory.length?(<><h4 className="subsection-title">Payment History</h4><div className="table-shell"><table className="data-table"><thead><tr><th>Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>{ci.paymentHistory.map((p)=><tr key={p.date}><td>{p.date}</td><td>{formatCurrency(p.amount)}</td><td>{p.status}</td></tr>)}</tbody></table></div></>):null}
      </section>
      {showReject&&<section className="panel form-panel content-panel"><div className="form-group"><label>Rejection Reason<span className="required">*</span></label><textarea value={rejectReason} onChange={(e)=>setRejectReason(e.target.value)} placeholder="Mandatory reason..."/></div></section>}
      {ci.status==='Pending'?(
        <Toolbar actions={[{label:'Approve',action:'approve'},{label:showReject?'Confirm Reject':'Reject',action:'reject',variant:'secondary'},{label:'Request Revision',action:'revision',variant:'secondary'},{label:'Back',to:'/branch-manager/ci-approvals',variant:'ghost'}]}
          onAction={(a)=>{
            if(a.action==='approve'){showToast('CI approved.','success');navigate('/branch-manager/ci-approvals');}
            else if(a.action==='reject'){if(showReject){if(!rejectReason.trim()){showToast('Reason required.','error');return;}showToast(`CI rejected.`,'error');navigate('/branch-manager/ci-approvals');}else setShowReject(true);}
            else if(a.action==='revision'){showToast('Revision requested.','success');navigate('/branch-manager/ci-approvals');}
            else navigate(a.to);
          }}/>
      ):<Toolbar actions={[{label:'Back',to:'/branch-manager/ci-approvals',variant:'ghost'}]} onAction={(a)=>navigate(a.to)}/>}
    </div>
  );
}

// ── GIS, Alerts, Notifications, Profile, Audit ───────────────────────────────
function GISPage({ pageType, navigate, showToast }) {
  const [layers, setLayers] = useState(['Collector Routes','Delinquency Clusters']);
  const layerOptions = ['Collector Routes','Sales Territories','Payment Behavior Zones','Delinquency Clusters','Profitability Zones','High Collection Areas','Route Efficiency Layer'];
  const toggle = (l) => setLayers((p)=>p.includes(l)?p.filter((x)=>x!==l):[...p,l]);
  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>GIS & Location Intelligence</h3></div>
        <div className="accounts-filters">
          <select><option>Today</option><option>This Week</option><option>This Month</option></select>
          <select><option>All Staff</option>{COLLECTORS.map((c)=><option key={c.id}>{c.name}</option>)}{SALES_AGENTS.map((a)=><option key={a.id}>{a.name}</option>)}</select>
        </div>
        <div className="layer-toggles">{layerOptions.map((l)=><label key={l} className="toggle-label"><input type="checkbox" checked={layers.includes(l)} onChange={()=>toggle(l)}/>{l}</label>)}</div>
        <div className="placeholder-map">Interactive map · {layers.length} active layers</div>
      </section>
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Client Pins</h3></div>
        <div className="table-shell"><table className="data-table">
          <thead><tr><th>Client</th><th>Balance</th><th>Status</th><th>Last Visit</th><th>Staff</th></tr></thead>
          <tbody>{MAP_ACCOUNTS.map((a)=><tr key={a.id}><td>{a.clientName}</td><td>{formatCurrency(a.balance)}</td><td>{a.paymentStatus}</td><td>{a.lastVisit}</td><td>{a.assignedStaff}</td></tr>)}</tbody>
        </table></div>
      </section>
      <Toolbar actions={[{label:'Delinquency Heatmap',to:'/branch-manager/gis/delinquency',variant:'secondary'},{label:'Profitability Zones',to:'/branch-manager/gis/profitability',variant:'secondary'}]} onAction={(a)=>navigate(a.to)}/>
    </div>
  );
}

function AlertsPage({ navigate, showToast }) {
  const [filter, setFilter] = useState('All');
  const filtered = useMemo(()=>filter==='All'?ALERTS:ALERTS.filter((a)=>a.category.includes(filter)),[filter]);
  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="segmented-control">
          {['All','Collection','Sales','Inventory','Route'].map((f)=><button key={f} className={filter===f?'segment active':'segment'} type="button" onClick={()=>setFilter(f)}>{f}</button>)}
        </div>
      </section>
      <div className="notification-list">
        {filtered.map((a)=>(
          <article key={a.id} className="notification-item">
            <div><h4>{a.title}</h4><p className="muted">{a.message}</p><span className="notification-time">{a.category} · {a.time}</span></div>
            <div className="notification-actions"><Severity severity={a.severity}/><button className="button ghost" type="button" onClick={()=>showToast('Follow-up assigned.','success')}>Assign</button><button className="button" type="button" onClick={()=>showToast('Resolved.','success')}>Resolve</button></div>
          </article>
        ))}
      </div>
    </div>
  );
}

function NotificationsPage({ navigate, showToast }) {
  const [items, setItems] = useState(NOTIFICATIONS);
  const [filter, setFilter] = useState('All');
  const filtered = useMemo(()=>{
    if(filter==='Unread') return items.filter((n)=>!n.read);
    if(filter==='All') return items;
    return items.filter((n)=>n.type===filter.toLowerCase());
  },[items,filter]);
  return (
    <div className="page">
      <Toolbar actions={[{label:'Mark All as Read',action:'markAll'}]} onAction={()=>{setItems((n)=>n.map((i)=>({...i,read:true})));showToast('All marked read.','success');}}/>
      <section className="panel content-panel">
        <div className="segmented-control">{['All','Unread','CI','Route','Delinquency','Inventory','Staff'].map((f)=><button key={f} className={filter===f?'segment active':'segment'} type="button" onClick={()=>setFilter(f)}>{f}</button>)}</div>
      </section>
      {filtered.length?(
        <div className="notification-list">
          {filtered.map((item)=>(
            <article key={item.id} className={`notification-item${item.read?'':' unread'}`}>
              <div><h4>{item.title}</h4><p className="muted">{item.message}</p><span className="notification-time">{item.time}</span></div>
              <div className="notification-actions">
                {!item.read&&<button className="button ghost" type="button" onClick={()=>setItems((ns)=>ns.map((n)=>n.id===item.id?{...n,read:true}:n))}>Mark Read</button>}
                <button className="button secondary" type="button" onClick={()=>navigate(item.relatedTo)}>Open</button>
              </div>
            </article>
          ))}
        </div>
      ):<EmptyState title="No notifications" description="You're all caught up."/>}
    </div>
  );
}

function ProfilePage({ navigate, showToast }) {
  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="profile-header">
          <div className="profile-avatar">{BRANCH_MANAGER_PROFILE.avatarInitials}</div>
          <div><h3>{BRANCH_MANAGER_PROFILE.name}</h3><p className="muted">{BRANCH_MANAGER_PROFILE.employeeId}</p></div>
        </div>
        <ul className="bullet-list"><li>Branch: {BRANCH_MANAGER_PROFILE.branch}</li><li>Email: {BRANCH_MANAGER_PROFILE.email}</li><li>Phone: {BRANCH_MANAGER_PROFILE.phone}</li></ul>
      </section>
      <Toolbar actions={[{label:'Update Profile',action:'update'},{label:'Change Password',action:'password',variant:'secondary'},{label:'Approval Center',to:'/branch-manager/approval-center',variant:'ghost'},{label:'Audit Log',to:'/branch-manager/audit-log',variant:'ghost'},{label:'Logout',action:'logout',variant:'ghost'}]}
        onAction={(a)=>{if(a.to)navigate(a.to);else if(a.action==='logout'){showToast('Logged out.','success');navigate('/login');}else showToast(`${a.label} opened.`,'success');}}/>
    </div>
  );
}

function ApprovalCenterPage({ navigate, showToast }) {
  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Approval Center</h3></div>
        <div className="analytics-grid three-up">
          <button className="analytics-card report-card" type="button" onClick={()=>navigate('/branch-manager/ci-approvals')}><span className="metric-label">Credit Investigations</span><strong>{PENDING_APPROVALS.ci} pending</strong></button>
          <button className="analytics-card report-card" type="button" onClick={()=>showToast('Transfer approvals opened.','success')}><span className="metric-label">Inventory Transfers</span><strong>{PENDING_APPROVALS.transfers} pending</strong></button>
          <button className="analytics-card report-card" type="button" onClick={()=>showToast('Special collections opened.','success')}><span className="metric-label">Special Collections</span><strong>{PENDING_APPROVALS.specialCollections} pending</strong></button>
        </div>
      </section>
    </div>
  );
}

function AuditLogPage({ navigate }) {
  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Audit Log</h3></div>
        <div className="table-shell"><table className="data-table"><thead><tr><th>Action</th><th>Detail</th><th>Timestamp</th></tr></thead><tbody>{AUDIT_LOGS.map((l)=><tr key={l.id}><td>{l.action}</td><td>{l.detail}</td><td>{l.timestamp}</td></tr>)}</tbody></table></div>
      </section>
      <Toolbar actions={[{label:'Back to Profile',to:'/branch-manager/profile',variant:'ghost'}]} onAction={(a)=>navigate(a.to)}/>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function BranchManagerPageBody({ page, navigate, showToast }) {
  if (!page) return <EmptyState title="Page not found" description="Use the sidebar to open a supported screen." />;
  const p = { collectorId: page.params?.collectorId, agentId: page.params?.agentId, ciId: page.params?.ciId, accountId: page.params?.accountId, navigate, showToast };
  switch (page.pageType) {
    case 'dashboard':           return <DashboardPage {...p} />;
    case 'fieldOperations':
    case 'collectorRoutes':
    case 'salesSchedules':
    case 'routePerformance':    return <FieldOperationsHub {...p} />;
    case 'collectorDetail':     return <CollectorDetailPage {...p} />;
    case 'salesAgentDetail':    return <SalesAgentDetailPage {...p} />;
    case 'ciQueue':             return <CIQueuePage {...p} />;
    case 'ciDetail':            return <CIDetailPage {...p} />;
    case 'gisMap':
    case 'gisTerritory':
    case 'gisDelinquency':
    case 'gisProfitability':    return <GISPage pageType={page.pageType} {...p} />;
    case 'reports':
    case 'reportCollection':
    case 'reportSales':
    case 'reportInventory':
    case 'reportDelinquency':   return <ReportsHubPage {...p} />;
    case 'staffPerformance':
    case 'staffCollectors':
    case 'staffSales':
    case 'staffScorecards':     return <StaffPerformancePage {...p} />;
    case 'alerts':              return <AlertsPage {...p} />;
    case 'notifications':       return <NotificationsPage {...p} />;
    case 'approvalCenter':      return <ApprovalCenterPage {...p} />;
    case 'profile':             return <ProfilePage {...p} />;
    case 'auditLog':            return <AuditLogPage {...p} />;
    default:                    return <EmptyState title="Page not found" description="This screen is not configured yet." />;
  }
}
