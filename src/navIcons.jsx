const ICONS = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  route: (
    <>
      <path d="M12 21s6-4.35 6-10a6 6 0 1 0-12 0c0 5.65 6 10 6 10Z" />
      <circle cx="12" cy="11" r="2.5" />
    </>
  ),
  account: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 19c1.8-3.5 4.7-5 7-5s5.2 1.5 7 5" />
    </>
  ),
  log: (
    <>
      <path d="M8 4h8l2 2v14H6V4h2Z" />
      <path d="M9 11h6M9 15h6" />
    </>
  ),
  form: (
    <>
      <path d="M7 4h10v16H7z" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4 4 18h16L12 4Z" />
      <path d="M12 10v3M12 16h.01" />
    </>
  ),
  receipt: (
    <>
      <path d="M7 4h10v16l-2-1.5L13 20l-2-1.5L9 20l-2-1.5L5 20V4Z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  schedule: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </>
  ),
  inventory: (
    <>
      <path d="M4 8 12 4l8 4-8 4-8-4Z" />
      <path d="M4 12l8 4 8-4M4 16l8 4 8-4" />
    </>
  ),
  product: (
    <>
      <path d="M6 7h12v12H6z" />
      <path d="M9 7V5h6v2" />
    </>
  ),
  stock: (
    <>
      <path d="M5 7h14v12H5z" />
      <path d="M9 11h6M9 15h4" />
    </>
  ),
  restock: (
    <>
      <path d="M12 5v10M8 11l4 4 4-4" />
      <path d="M5 19h14" />
    </>
  ),
  transfer: (
    <>
      <path d="M7 7h10M17 7l-3-3M17 7l-3 3" />
      <path d="M17 17H7M7 17l3 3M7 17l3-3" />
    </>
  ),
  add: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  map: (
    <>
      <path d="M4 7l6-3 6 3 4-2v13l-6 3-6-3-4 2V7Z" />
      <path d="M10 4v13M14 7v13" />
    </>
  ),
  queue: (
    <>
      <path d="M5 6h14v4H5zM5 14h14v4H5z" />
    </>
  ),
  reports: (
    <>
      <path d="M6 19V9M12 19V5M18 19v-7" />
    </>
  ),
  compare: (
    <>
      <path d="M7 18V8M12 18V4M17 18v-6" />
    </>
  ),
  home: (
    <>
      <path d="M4 10 12 4l8 6" />
      <path d="M7 10v9h10v-9" />
    </>
  ),
  history: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </>
  ),
  login: (
    <>
      <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
      <path d="M14 12H8M18 8l4 4-4 4" />
    </>
  ),
  reset: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.5 2.5" />
    </>
  ),
  switch: (
    <>
      <path d="M8 7H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" />
      <path d="M16 17h3a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3" />
      <path d="M8 12h8M15 9l3 3-3 3M9 15l-3-3 3-3" />
    </>
  ),
  chevronLeft: (
    <path d="M14 6 8 12l6 6" />
  ),
  chevronRight: (
    <path d="M10 6l6 6-6 6" />
  ),
  bell: (
    <>
      <path d="M12 4a4 4 0 0 0-4 4v2.5L6 13h12l-2-2.5V8a4 4 0 0 0-4-4Z" />
      <path d="M10 17a2 2 0 0 0 4 0" />
    </>
  ),
  accounts: (
    <>
      <path d="M8 6h8M8 10h8M8 14h5" />
      <rect x="5" y="4" width="14" height="16" rx="2" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M6 20c1.2-3 3.4-4.5 6-4.5s4.8 1.5 6 4.5" />
    </>
  ),
};

const LABEL_ICON_KEY = {
  Dashboard: 'dashboard',
  Home: 'home',
  "Today's Route": 'route',
  "Today's Schedule": 'schedule',
  'Account Detail': 'account',
  'Account Details': 'account',
  'Collection Log': 'log',
  'CI Form': 'form',
  'Incident Report': 'alert',
  'Digital Receipt': 'receipt',
  'Client Detail': 'account',
  'Sales Visit Log': 'log',
  'Inventory Viewer': 'inventory',
  'Inventory Repository': 'inventory',
  'Product Detail': 'product',
  'Stock Count': 'stock',
  'Restock Log': 'restock',
  'Stock Transfer': 'transfer',
  'Add Product': 'add',
  'Collector Routes': 'route',
  'Sales Schedules': 'schedule',
  'CI Queue': 'queue',
  'CI Detail': 'form',
  'GIS Map': 'map',
  'All-Branch GIS Map': 'map',
  Reports: 'reports',
  'Branch Comparison': 'compare',
  Login: 'login',
  'Reset password': 'reset',
  'Payment History': 'history',
  Receipts: 'receipt',
  Accounts: 'accounts',
  Clients: 'accounts',
  'Collection History': 'history',
  'Sales History': 'history',
  'Stock Movements': 'transfer',
  'Restock History': 'restock',
  Inventory: 'inventory',
  Notifications: 'bell',
  Profile: 'profile',
  'Field Operations': 'route',
  'Credit Investigation Approvals': 'queue',
  'GIS & Location Intelligence': 'map',
  'Reports & Analytics': 'reports',
  'Staff Performance': 'compare',
  'Alerts & Exceptions': 'alert',
  'Executive Dashboard': 'dashboard',
  'Operations Dashboard': 'dashboard',
  'Administration Dashboard': 'dashboard',
  'Branch Performance': 'compare',
  'GIS Intelligence': 'map',
  'Alerts Center': 'alert',
  'Digital Receipts': 'receipt',
  Statements: 'reports',
  'Customer Records': 'accounts',
  'Customer Credit History': 'accounts',
  'User Management': 'accounts',
  'Branch Management': 'home',
  'Inventory Management': 'inventory',
  'System Reports': 'reports',
  'Audit Logs': 'log',
  'Approval Center': 'queue',
  Settings: 'form',
  'System Configuration': 'form',
  'Role & Permissions': 'accounts',
  'System Settings': 'form',
  'Backup & Restore': 'history',
  'Database Monitoring': 'reports',
};

export function NavIcon({ name, label, className = 'nav-svg' }) {
  const iconKey = name ?? LABEL_ICON_KEY[label] ?? 'dashboard';
  const paths = ICONS[iconKey] ?? ICONS.dashboard;

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
}
