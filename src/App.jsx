import { useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Breadcrumbs } from './components/collector/Breadcrumbs';
import { CollectorPageBody } from './components/collector/CollectorPageBody';
import { SalesPageBody } from './components/sales/SalesPageBody';
import { WarehousePageBody } from './components/warehouse/WarehousePageBody';
import { BranchManagerPageBody } from './components/branchManager/BranchManagerPageBody';
import { OperatingManagerPageBody } from './components/operatingManager/OperatingManagerPageBody';
import { CustomerPageBody } from './components/customer/CustomerPageBody';
import { Toast, useToast } from './components/collector/Toast';
import { quickFacts } from './pageData';
import { NavIcon } from './navIcons';
import { collectorRole } from './rolePages/collector';
import { isCollectorNavActive, resolveCollectorPage } from './utils/collectorRoutes';
import { isSalesNavActive, resolveSalesPage } from './utils/salesRoutes';
import { isWarehouseNavActive, resolveWarehousePage } from './utils/warehouseRoutes';
import { isBranchManagerNavActive, resolveBranchManagerPage } from './utils/branchManagerRoutes';
import { isOperatingManagerNavActive, resolveOperatingManagerPage } from './utils/operatingManagerRoutes';
import { isCustomerAuthPath, isCustomerNavActive, resolveCustomerPage } from './utils/customerRoutes';
import { salesRole } from './rolePages/sales';
import { warehouseRole } from './rolePages/warehouse';
import { branchManagerRole } from './rolePages/branchManager';
import { operatingManagerRole } from './rolePages/operatingManager';
import { customerRole } from './rolePages/customer';

const ROLES = [collectorRole, salesRole, warehouseRole, branchManagerRole, operatingManagerRole, customerRole];
const ROLE_BY_KEY = Object.fromEntries(ROLES.map((role) => [role.key, role]));
const ROUTE_REGISTRY = Object.assign({}, ...ROLES.map((role) => role.routes));
const SIDEBAR_STORAGE_KEY = 'corvex-sidebar-collapsed';

function readSidebarCollapsed() {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/collector" element={<Navigate to={collectorRole.entryPath} replace />} />
      <Route path="/sales" element={<Navigate to={salesRole.entryPath} replace />} />
      <Route path="/warehouse" element={<Navigate to={warehouseRole.entryPath} replace />} />
      <Route path="/branch-manager" element={<Navigate to={branchManagerRole.entryPath} replace />} />
      <Route path="/operating-manager" element={<Navigate to={operatingManagerRole.entryPath} replace />} />
      <Route path="/customer" element={<Navigate to={customerRole.entryPath} replace />} />
      <Route path="*" element={<PrototypeShell />} />
    </Routes>
  );
}

function PrototypeShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentRole = roleFromPath(location.pathname);
  const isCollector = currentRole?.key === 'collector';
  const isSales = currentRole?.key === 'sales';
  const isWarehouse = currentRole?.key === 'warehouse';
  const isBranchManager = currentRole?.key === 'branchManager';
  const isOperatingManager = currentRole?.key === 'operatingManager';
  const isCustomer = currentRole?.key === 'customer';
  const isRoleModule = isCollector || isSales || isWarehouse || isBranchManager || isOperatingManager || isCustomer;
  const isCustomerLogin = isCustomerAuthPath(location.pathname);
  const fullPath = location.pathname + location.search;
  const page = isCollector
    ? resolveCollectorPage(location.pathname, location.search)
    : isSales
      ? resolveSalesPage(location.pathname, location.search)
      : isWarehouse
        ? resolveWarehousePage(location.pathname)
        : isBranchManager
          ? resolveBranchManagerPage(location.pathname)
          : isOperatingManager
            ? resolveOperatingManagerPage(location.pathname)
            : isCustomer
              ? resolveCustomerPage(location.pathname)
              : ROUTE_REGISTRY[location.pathname] ?? null;
  const [showMap, setShowMap] = useState(false);
  const [filter, setFilter] = useState('All');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  const { toast, showToast, clearToast } = useToast();

  const toggleSidebar = () => {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const topLinks = useMemo(() => {
    if (isAuthPath(location.pathname) || !currentRole) {
      return [
        { label: 'Login', to: '/login' },
        { label: 'Reset password', to: '/password-reset' },
      ];
    }

    return currentRole.navPages;
  }, [currentRole, location.pathname]);

  const pageTitle = page?.title ?? (currentRole ? currentRole.label : 'CORVEX');

  return (
    <div className={`app-shell${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <aside className={`sidebar${sidebarCollapsed ? ' collapsed' : ''}`}>
        <div className="sidebar-header">
          <div className="brand-card">
            <div className="brand-mark">C</div>
            <div className="brand-copy">
              <div className="brand-title">CORVEX</div>
              {currentRole ? <div className="brand-subtitle">{currentRole.label}</div> : null}
            </div>
          </div>
          <button
            className="sidebar-toggle"
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <NavIcon name={sidebarCollapsed ? 'chevronRight' : 'chevronLeft'} />
          </button>
        </div>

        {currentRole && !isAuthPath(location.pathname) && !isCustomerLogin ? (
          <>
            <p className="nav-section-label">Menu</p>
            <nav className="nav-links">
              {topLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={
                    isRoleModule
                      ? (isCollector
                          ? isCollectorNavActive(fullPath, link.to)
                          : isSales
                            ? isSalesNavActive(fullPath, link.to)
                            : isWarehouse
                              ? isWarehouseNavActive(fullPath, link.to)
                              : isBranchManager
                              ? isBranchManagerNavActive(fullPath, link.to)
                              : isOperatingManager
                                ? isOperatingManagerNavActive(fullPath, link.to)
                                : isCustomerNavActive(fullPath, link.to))
                        ? 'nav-link active'
                        : 'nav-link'
                      : location.pathname === link.to
                        ? 'nav-link active'
                        : 'nav-link'
                  }
                  title={sidebarCollapsed ? link.label : undefined}
                >
                  <span className="nav-link-icon">
                    <NavIcon label={link.label} />
                  </span>
                  <span className="nav-link-text">{link.label}</span>
                </Link>
              ))}
            </nav>
            <div className="sidebar-footer">
              <button
                className="button ghost sidebar-switch"
                type="button"
                onClick={() => navigate('/login')}
                title={sidebarCollapsed ? 'Switch user' : undefined}
              >
                <span className="sidebar-switch-icon">
                  <NavIcon name="switch" />
                </span>
                <span className="sidebar-switch-text">Switch user</span>
              </button>
            </div>
          </>
        ) : (
          <nav className="nav-links nav-links-auth">
            {topLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={location.pathname === link.to ? 'nav-link active' : 'nav-link'}
                title={sidebarCollapsed ? link.label : undefined}
              >
                <span className="nav-link-icon">
                  <NavIcon label={link.label} />
                </span>
                <span className="nav-link-text">{link.label}</span>
              </Link>
            ))}
          </nav>
        )}
      </aside>

      <main className="content">
        <div className="content-ambient" aria-hidden="true" />
        <header className="topbar">
          <div className="topbar-main">
            {currentRole && page ? (
              isRoleModule && page.breadcrumbs?.length ? (
                <Breadcrumbs items={page.breadcrumbs} />
              ) : (
                <p className="breadcrumb">
                  {currentRole.label}
                  <span aria-hidden="true">/</span>
                  {page.title}
                </p>
              )
            ) : null}
            <div className="topbar-title-row">
              <h1>{pageTitle}</h1>
            </div>
            {page?.description ? <p className="topbar-subtitle">{page.description}</p> : null}
            {!page?.description && currentRole && isDashboardPath(location.pathname, currentRole) ? (
              <p className="topbar-subtitle">{currentRole.accent}</p>
            ) : null}
          </div>
        </header>

        {location.pathname === '/password-reset' && (
          <section className="panel form-panel narrow">
            <h3>Password Reset</h3>
            <label>
              Email
              <input placeholder="name@example.com" />
            </label>
            <button className="button" type="button" onClick={() => navigate('/login')}>
              Send reset link
            </button>
          </section>
        )}

        <Routes>
          <Route path="/password-reset" element={<PrototypeLanding quickFacts={quickFacts} />} />
          <Route
            path="*"
            element={
              isCollector ? (
                <>
                  <CollectorPageBody page={page} navigate={navigate} showToast={showToast} />
                  <Toast toast={toast} onDismiss={clearToast} />
                </>
              ) : isSales ? (
                <>
                  <SalesPageBody page={page} navigate={navigate} showToast={showToast} />
                  <Toast toast={toast} onDismiss={clearToast} />
                </>
              ) : isWarehouse ? (
                <>
                  <WarehousePageBody page={page} navigate={navigate} showToast={showToast} />
                  <Toast toast={toast} onDismiss={clearToast} />
                </>
              ) : isBranchManager ? (
                <>
                  <BranchManagerPageBody page={page} navigate={navigate} showToast={showToast} />
                  <Toast toast={toast} onDismiss={clearToast} />
                </>
              ) : isOperatingManager ? (
                <>
                  <OperatingManagerPageBody page={page} navigate={navigate} showToast={showToast} />
                  <Toast toast={toast} onDismiss={clearToast} />
                </>
              ) : isCustomer ? (
                <>
                  <CustomerPageBody page={page} navigate={navigate} showToast={showToast} />
                  <Toast toast={toast} onDismiss={clearToast} />
                </>
              ) : (
                <PageBody
                  showMap={showMap}
                  setShowMap={setShowMap}
                  filter={filter}
                  setFilter={setFilter}
                  page={page}
                  currentRole={currentRole}
                  navigate={navigate}
                />
              )
            }
          />
        </Routes>
      </main>
    </div>
  );
}

function roleFromPath(pathname) {
  if (pathname.startsWith('/collector')) return collectorRole;
  if (pathname.startsWith('/sales')) return salesRole;
  if (pathname.startsWith('/warehouse')) return warehouseRole;
  if (pathname.startsWith('/branch-manager')) return branchManagerRole;
  if (pathname.startsWith('/operating-manager')) return operatingManagerRole;
  if (pathname.startsWith('/customer')) return customerRole;
  return null;
}

function isAuthPath(pathname) {
  return pathname === '/password-reset';
}

function isDashboardPath(pathname, role) {
  return Boolean(role && pathname === role.entryPath);
}

function actionButtonClass(variant) {
  if (variant === 'secondary') return 'button secondary';
  if (variant === 'ghost') return 'button ghost';
  return 'button';
}

function PageActions({ actions, navigate, className }) {
  if (!actions?.length) return null;

  return (
    <div className={className}>
      {actions.map((action) => (
        <button
          key={action.label}
          className={actionButtonClass(action.variant)}
          type="button"
          onClick={() => action.to && navigate(action.to)}
          disabled={!action.to}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  const [selectedKey, setSelectedKey] = useState(ROLES[0].key);
  const selectedRole = ROLE_BY_KEY[selectedKey];

  const handleLogin = () => {
    navigate(selectedRole?.entryPath ?? '/login');
  };

  return (
    <div className="login-screen">
      <div className="login-backdrop" aria-hidden="true">
        <div className="login-orb login-orb-one" />
        <div className="login-orb login-orb-two" />
        <div className="login-grid" />
      </div>

      <div className="login-layout">
        <aside className="login-showcase" aria-hidden="true">
          <p className="login-showcase-label">CORVEX Platform</p>
          <h2>Field operations, unified.</h2>
          <p>Access for collectors, sales, warehouse, managers, and customers.</p>
          <ul className="login-showcase-list">
            <li>Role-based dashboards</li>
            <li>Streamlined daily workflows</li>
            <li>One-click user switching</li>
          </ul>
        </aside>

        <div className="login-card">
        <div className="login-brand">
          <div className="login-mark">C</div>
          <div>
            <span className="login-eyebrow">Operations platform</span>
            <h1>CORVEX</h1>
          </div>
        </div>

        <p className="login-lead">Choose a user to continue.</p>

        <label className="login-field">
          <span>Sign in as</span>
          <select value={selectedKey} onChange={(event) => setSelectedKey(event.target.value)}>
            {ROLES.map((role) => (
              <option key={role.key} value={role.key}>
                {role.label}
              </option>
            ))}
          </select>
        </label>

        {selectedRole ? (
          <div className="login-role-preview">
            <strong>{selectedRole.label}</strong>
            <span>{selectedRole.accent}</span>
          </div>
        ) : null}

        <button className="button login-submit" type="button" onClick={handleLogin}>
          Continue
        </button>
        </div>
      </div>
    </div>
  );
}

function PrototypeLanding({ quickFacts }) {
  return (
    <section className="grid three-up">
      {quickFacts.map((fact) => (
        <article key={fact} className="panel fact-card">
          <p>{fact}</p>
        </article>
      ))}
    </section>
  );
}

function PageBody({ showMap, setShowMap, filter, setFilter, page, currentRole, navigate }) {
  const location = useLocation();
  const [formData, setFormData] = useState({});
  const isDashboard = isDashboardPath(location.pathname, currentRole);
  const quickLinks = currentRole?.navPages.filter((link) => link.to !== location.pathname) ?? [];

  if (!page) {
    return (
      <section className="panel empty-state">
        <h3>Page not found</h3>
        <p className="muted">This route is not available yet. Use the sidebar to open a supported screen.</p>
      </section>
    );
  }

  const handleFormChange = (fieldName, value) => {
    setFormData((prev) => ({ ...prev, [fieldName]: value }));
  };

  return (
    <div className="page">
      {page.stats?.length ? (
        <section className="stats-grid">
          {page.stats.map((stat, index) => (
            <article key={stat.label} className="stat-card" style={{ '--stat-index': index }}>
              <div className="stat-card-top">
                <span className="stat-index">{String(index + 1).padStart(2, '0')}</span>
                <span className="stat-dot" aria-hidden="true" />
              </div>
              <span className="stat-label">{stat.label}</span>
              <strong className="stat-value">{stat.value}</strong>
            </article>
          ))}
        </section>
      ) : null}

      {page.actions?.length ? (
        <header className="page-toolbar">
          <div className="page-toolbar-main">
            <PageActions actions={page.actions} navigate={navigate} className="page-toolbar-actions" />
          </div>
        </header>
      ) : null}

      {isDashboard && quickLinks.length ? (
        <section className="panel dashboard-panel">
          <div className="panel-section-header">
            <h3>Quick access</h3>
            <p className="muted">Jump to the screens you use most.</p>
          </div>
          <div className="quick-link-grid">
            {quickLinks.map((link) => (
              <Link key={link.to} to={link.to} className="quick-link-card">
                <span className="quick-link-icon" aria-hidden="true">
                  <NavIcon label={link.label} />
                </span>
                <span className="quick-link-copy">
                  <strong>{link.label}</strong>
                  <span className="muted">Open screen</span>
                </span>
                <span className="quick-link-arrow" aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {page.showMap && (
        <section className="panel content-panel">
          <div className="panel-section-header">
            <h3>Map overview</h3>
            <div className="inline-toolbar">
              <div className="segmented-control">
                {['All', 'Pending', 'Completed'].map((item) => (
                  <button key={item} className={filter === item ? 'segment active' : 'segment'} type="button" onClick={() => setFilter(item)}>
                    {item}
                  </button>
                ))}
              </div>
              <button className="button secondary" type="button" onClick={() => setShowMap(!showMap)}>
                {showMap ? 'Show list view' : 'Show map view'}
              </button>
            </div>
          </div>
          <div className="placeholder-map">{showMap ? 'Leaflet.js map placeholder showing route and territory pins' : `List view for ${filter} records`}</div>
        </section>
      )}

      {page.table && (
        <section className="panel content-panel">
          {(page.table.hasFilter || page.table.hasMap) && (
            <div className="panel-section-header panel-section-header-compact">
              <div className="inline-toolbar">
                {page.table.hasFilter && (
                  <div className="segmented-control">
                    {['All', 'Pending', 'Completed'].map((item) => (
                      <button key={item} className={filter === item ? 'segment active' : 'segment'} type="button" onClick={() => setFilter(item)}>
                        {item}
                      </button>
                    ))}
                  </div>
                )}
                {page.table.hasMap && (
                  <button className="button secondary" type="button" onClick={() => setShowMap(!showMap)}>
                    {showMap ? 'Show list view' : 'Show map view'}
                  </button>
                )}
              </div>
            </div>
          )}

          {showMap && page.table.hasMap ? (
            <div className="placeholder-map">Map view with pins and territory</div>
          ) : (
            <div className="table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    {page.table.columns.map((col) => (
                      <th key={col}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {page.table.rows.map((row, idx) => (
                    <tr key={idx}>
                      {Object.values(row).map((cell, cIdx) => (
                        <td key={cIdx}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Form rendering */}
      {page.form && (
        <section className="panel form-panel content-panel">
          <div className="panel-section-header">
            <h3>{page.form.title}</h3>
          </div>
          {page.form.fields.map((field) => (
            <div key={field.name} className="form-group">
              <label>
                {field.label}
                {field.required && <span className="required">*</span>}
              </label>
              {field.type === 'text' && (
                <input
                  type="text"
                  placeholder={field.placeholder}
                  value={formData[field.name] || ''}
                  onChange={(e) => handleFormChange(field.name, e.target.value)}
                  disabled={field.disabled}
                />
              )}
              {field.type === 'number' && (
                <input
                  type="number"
                  placeholder={field.placeholder}
                  value={formData[field.name] || ''}
                  onChange={(e) => handleFormChange(field.name, e.target.value)}
                  disabled={field.disabled}
                />
              )}
              {field.type === 'textarea' && (
                <textarea
                  placeholder={field.placeholder}
                  value={formData[field.name] || ''}
                  onChange={(e) => handleFormChange(field.name, e.target.value)}
                  disabled={field.disabled}
                />
              )}
              {field.type === 'select' && (
                <select value={formData[field.name] || ''} onChange={(e) => handleFormChange(field.name, e.target.value)}>
                  <option value="">{field.placeholder}</option>
                  {field.options?.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              )}
              {field.type === 'toggle' && (
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    checked={formData[field.name] || false}
                    onChange={(e) => handleFormChange(field.name, e.target.checked)}
                  />
                  {field.toggleLabel}
                </label>
              )}
            </div>
          ))}
        </section>
      )}

      {/* Custom content sections */}
      {page.sections?.map((section) => (
        <section key={section.title} className="panel content-panel">
          <div className="panel-section-header">
            <h3>{section.title}</h3>
          </div>
          {section.type === 'bullet-list' && (
            <ul className="bullet-list">
              {section.items?.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          {section.type === 'text' && <p className="section-text">{section.content}</p>}
        </section>
      ))}
    </div>
  );
}

export default App;