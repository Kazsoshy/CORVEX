const fs = require('fs');
const cssPath = 'c:\\Users\\ASUS\\CORVEX\\src\\styles.css';

const newCss = `
/* --- Modern UI Redesign Overrides --- */

/* Sidebar Redesign (Light, modern surface) */
.sidebar {
  background: #171f37 !important;
  border-right: 1px solid var(--surface-3) !important;
  box-shadow: 0 4px 20px rgba(0,0,0,0.03) !important;
}

.brand-card {
  background: var(--surface) !important;
  border: 1px solid var(--surface-2) !important;
  color: var(--ink) !important;
}
.brand-card::after { display: none !important; }
.brand-mark {
  background: var(--blue-10) !important;
  color: var(--blue) !important;
  border: none !important;
}
.brand-title { color: var(--ink) !important; }
.brand-subtitle, .sidebar-note, .muted { color: var(--navy-60) !important; }

.nav-group-summary {
  background: transparent !important;
  border-color: transparent !important;
  color: var(--navy-60) !important;
}
.nav-group-summary:hover {
  background: var(--surface) !important;
  color: var(--ink) !important;
}
.nav-group[open] .nav-group-summary {
  color: var(--blue) !important;
  background: transparent !important;
}

.nav-link {
  color: var(--navy-60) !important;
}
.nav-link:hover {
  background: var(--surface) !important;
  color: var(--ink) !important;
}
.nav-link.active {
  background: var(--blue-08) !important;
  color: var(--blue) !important;
  box-shadow: none !important;
}
.nav-link-icon {
  background: transparent !important;
  border: none !important;
  color: var(--navy-60) !important;
}
.nav-link:hover .nav-link-icon {
  color: var(--ink) !important;
  background: transparent !important;
}
.nav-link.active .nav-link-icon {
  color: var(--blue) !important;
  background: transparent !important;
}

.sidebar-switch {
  color: var(--navy-60) !important;
  border: 1px solid var(--surface-3) !important;
}
.sidebar-switch:hover {
  background: var(--surface) !important;
  color: var(--red) !important;
  border-color: var(--red-soft) !important;
}

/* Status Badges */
.modern-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.badge-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.badge-success {
  background: var(--green-soft);
  color: var(--green);
}
.badge-success .badge-dot { background: var(--green); }

.badge-error {
  background: var(--red-soft);
  color: var(--red);
}
.badge-error .badge-dot { background: var(--red); }

.badge-warning {
  background: var(--amber-soft);
  color: var(--amber);
}
.badge-warning .badge-dot { background: var(--amber); }

.badge-default {
  background: var(--surface-3);
  color: var(--navy-72);
}
.badge-default .badge-dot { background: var(--navy-60); }

/* Icon Action Buttons */
.icon-action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: transparent;
  border: none;
  color: var(--navy-60);
  cursor: pointer;
  transition: all 0.2s ease;
}

.icon-action-button:hover {
  background: var(--surface-2);
  color: var(--blue);
  transform: translateY(-1px);
}

.icon-action-button.danger:hover {
  background: var(--red-soft);
  color: var(--red);
}

.icon-action-button .nav-svg {
  width: 18px;
  height: 18px;
}

/* Generic layout improvements */
.panel, .dashboard-panel, .content-panel {
  border-radius: 20px !important;
  padding: 32px !important;
  box-shadow: 0 8px 30px rgba(0,0,0,0.04) !important;
  border: 1px solid var(--surface-2) !important;
}

.data-table th, .data-table td {
  padding: 16px 20px !important;
}

.table-actions {
  display: flex;
  gap: 6px;
  align-items: center;
}
`;

fs.appendFileSync(cssPath, newCss);
console.log('Appended modern UI styles to styles.css');
