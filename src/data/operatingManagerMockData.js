// Furniture retail — Operating Manager (3 branches)

export const OPERATING_MANAGER_PROFILE = {
  name: 'Elena Mercado',
  employeeId: 'OM-2001',
  region: 'Mindanao Operations — Davao & SoCCSKSargen',
  email: 'elena.mercado@corvex.ph',
  phone: '+63 918 555 4400',
  avatarInitials: 'EM',
};

export const BRANCHES = [
  {
    id: 'davao-city',
    name: 'Davao City',
    collectionRate: 88,
    salesCompletionRate: 82,
    inventoryHealth: 76,
    overdueAccounts: 11,
    routeCompliance: 91,
    performanceScore: 86,
    riskScore: 22,
    growthScore: 82,
    revenue: 4820000,
    collections: 4240000,
    sales: 3680000,
    delinquencies: 284800,
    inventoryValue: 1240000,
    collectors: 5,
    salesAgents: 4,
    locations: 320,
    status: 'Healthy',
  },
  {
    id: 'general-santos',
    name: 'General Santos',
    collectionRate: 91,
    salesCompletionRate: 86,
    inventoryHealth: 82,
    overdueAccounts: 7,
    routeCompliance: 93,
    performanceScore: 91,
    riskScore: 14,
    growthScore: 88,
    revenue: 5640000,
    collections: 5120000,
    sales: 4380000,
    delinquencies: 168000,
    inventoryValue: 1520000,
    collectors: 6,
    salesAgents: 5,
    locations: 380,
    status: 'Top Performer',
  },
  {
    id: 'davao-oriental',
    name: 'Davao Oriental',
    collectionRate: 82,
    salesCompletionRate: 76,
    inventoryHealth: 68,
    overdueAccounts: 19,
    routeCompliance: 84,
    performanceScore: 74,
    riskScore: 38,
    growthScore: 68,
    revenue: 3120000,
    collections: 2680000,
    sales: 2240000,
    delinquencies: 428000,
    inventoryValue: 880000,
    collectors: 4,
    salesAgents: 3,
    locations: 240,
    status: 'Needs Support',
  },
];

export const ENTERPRISE_KPIS = {
  totalRevenue:       BRANCHES.reduce((s, b) => s + b.revenue, 0),
  totalCollections:   BRANCHES.reduce((s, b) => s + b.collections, 0),
  totalSales:         BRANCHES.reduce((s, b) => s + b.sales, 0),
  totalDelinquencies: BRANCHES.reduce((s, b) => s + b.delinquencies, 0),
  totalInventoryValue:BRANCHES.reduce((s, b) => s + b.inventoryValue, 0),
};

export const TREND_DATA = {
  collection:  [80, 82, 84, 83, 86, 88, 89],
  sales:       [72, 74, 76, 78, 80, 82, 83],
  delinquency: [24, 22, 21, 20, 19, 18, 17],
};

export const MONTHLY_REVENUE = [
  { month: 'Jan', 'Davao City': 4100000, 'General Santos': 4800000, 'Davao Oriental': 2600000 },
  { month: 'Feb', 'Davao City': 4280000, 'General Santos': 5020000, 'Davao Oriental': 2720000 },
  { month: 'Mar', 'Davao City': 4420000, 'General Santos': 5180000, 'Davao Oriental': 2840000 },
  { month: 'Apr', 'Davao City': 4560000, 'General Santos': 5340000, 'Davao Oriental': 2920000 },
  { month: 'May', 'Davao City': 4700000, 'General Santos': 5500000, 'Davao Oriental': 3020000 },
  { month: 'Jun', 'Davao City': 4820000, 'General Santos': 5640000, 'Davao Oriental': 3120000 },
];

export const MONTHLY_COLLECTIONS = [
  { month: 'Jan', 'Davao City': 3600000, 'General Santos': 4320000, 'Davao Oriental': 2280000 },
  { month: 'Feb', 'Davao City': 3740000, 'General Santos': 4480000, 'Davao Oriental': 2380000 },
  { month: 'Mar', 'Davao City': 3860000, 'General Santos': 4640000, 'Davao Oriental': 2460000 },
  { month: 'Apr', 'Davao City': 3960000, 'General Santos': 4800000, 'Davao Oriental': 2520000 },
  { month: 'May', 'Davao City': 4100000, 'General Santos': 4960000, 'Davao Oriental': 2600000 },
  { month: 'Jun', 'Davao City': 4240000, 'General Santos': 5120000, 'Davao Oriental': 2680000 },
];

export const MONTHLY_DELINQUENCY = [
  { month: 'Jan', 'Davao City': 14, 'General Santos': 9,  'Davao Oriental': 24 },
  { month: 'Feb', 'Davao City': 13, 'General Santos': 8,  'Davao Oriental': 23 },
  { month: 'Mar', 'Davao City': 12, 'General Santos': 8,  'Davao Oriental': 22 },
  { month: 'Apr', 'Davao City': 13, 'General Santos': 7,  'Davao Oriental': 21 },
  { month: 'May', 'Davao City': 12, 'General Santos': 7,  'Davao Oriental': 20 },
  { month: 'Jun', 'Davao City': 11, 'General Santos': 7,  'Davao Oriental': 19 },
];

export const WEEKLY_COLLECTION_RATE = [
  { week: 'W1', 'Davao City': 85, 'General Santos': 89, 'Davao Oriental': 79 },
  { week: 'W2', 'Davao City': 86, 'General Santos': 90, 'Davao Oriental': 80 },
  { week: 'W3', 'Davao City': 87, 'General Santos': 91, 'Davao Oriental': 81 },
  { week: 'W4', 'Davao City': 88, 'General Santos': 91, 'Davao Oriental': 82 },
];

export const WEEKLY_SALES_RATE = [
  { week: 'W1', 'Davao City': 79, 'General Santos': 83, 'Davao Oriental': 73 },
  { week: 'W2', 'Davao City': 80, 'General Santos': 84, 'Davao Oriental': 74 },
  { week: 'W3', 'Davao City': 81, 'General Santos': 85, 'Davao Oriental': 75 },
  { week: 'W4', 'Davao City': 82, 'General Santos': 86, 'Davao Oriental': 76 },
];

export const BRANCH_RADAR = [
  { metric: 'Collection', 'Davao City': 88, 'General Santos': 91, 'Davao Oriental': 82 },
  { metric: 'Sales',      'Davao City': 82, 'General Santos': 86, 'Davao Oriental': 76 },
  { metric: 'Inventory',  'Davao City': 76, 'General Santos': 82, 'Davao Oriental': 68 },
  { metric: 'Compliance', 'Davao City': 91, 'General Santos': 93, 'Davao Oriental': 84 },
  { metric: 'Growth',     'Davao City': 82, 'General Santos': 88, 'Davao Oriental': 68 },
];

export const GIS_LAYERS = [
  { id: 'routes',       label: 'Collector Routes',         active: true  },
  { id: 'territories',  label: 'Sales Territories',        active: true  },
  { id: 'delinquency',  label: 'Delinquency Clusters',     active: false },
  { id: 'payment',      label: 'Payment Behavior Zones',   active: false },
  { id: 'profitability',label: 'Profitability Zones',      active: true  },
  { id: 'coverage',     label: 'Branch Coverage Areas',    active: true  },
  { id: 'efficiency',   label: 'Route Efficiency',         active: false },
  { id: 'opportunity',  label: 'High-Value Client Zones',  active: false },
];

export const REPORT_CATEGORIES = [
  { id: 'collections', title: 'Collection Reports',    path: '/operating-manager/reports/collections', reports: ['Branch Collection Comparison', 'Recovery Rate Trend', 'Overdue Account Analysis'] },
  { id: 'sales',       title: 'Sales Reports',         path: '/operating-manager/reports/sales',       reports: ['Revenue by Branch', 'Product Category Performance', 'Sales Agent Conversion Rate'] },
  { id: 'inventory',   title: 'Inventory Reports',     path: '/operating-manager/reports/inventory',   reports: ['Inventory Health by Branch', 'Forecasted Stockouts', 'Transfer Activity Summary'] },
  { id: 'delinquency', title: 'Delinquency Reports',   path: '/operating-manager/reports/delinquency', reports: ['Delinquency Trend by Branch', 'Geographic Risk Analysis', 'High-Risk Account List'] },
  { id: 'executive',   title: 'Executive Summary',     path: '/operating-manager/reports/executive-summary', reports: ['Consolidated Performance Report', 'Branch Rankings', 'Strategic Recommendations'] },
];

export const ALERTS = [
  { id: 'a1', type: 'Delinquency Growth',         severity: 'Critical',      branch: 'Davao Oriental', branchId: 'davao-oriental', message: 'Delinquency rate up 3.8% this month — 19 overdue accounts.',          date: '2026-06-25', resolved: false },
  { id: 'a2', type: 'Inventory Shortage',          severity: 'Warning',       branch: 'Davao Oriental', branchId: 'davao-oriental', message: 'Ergonomic Office Chair out of stock. 3 SKUs critically low.',          date: '2026-06-24', resolved: false },
  { id: 'a3', type: 'Route Compliance Drop',       severity: 'Warning',       branch: 'Davao Oriental', branchId: 'davao-oriental', message: 'Branch route compliance fell to 84% — below 85% minimum.',            date: '2026-06-24', resolved: false },
  { id: 'a4', type: 'Sales Completion Decline',    severity: 'Informational', branch: 'Davao City',     branchId: 'davao-city',     message: 'Sales completion rate down 2% vs last week.',                         date: '2026-06-23', resolved: true  },
  { id: 'a5', type: 'Collection Rate Breach',      severity: 'Critical',      branch: 'Davao Oriental', branchId: 'davao-oriental', message: 'Collection rate at 82% — below 85% company-wide minimum threshold.', date: '2026-06-22', resolved: false },
];

export const NOTIFICATIONS = [
  { id: 'n1', type: 'Branch Alerts',              message: 'Davao Oriental delinquency alert escalated to Critical.',         read: false, relatedTo: '/operating-manager/alerts' },
  { id: 'n2', type: 'Approval Escalations',        message: 'Inventory transfer approval pending executive review.',           read: false, relatedTo: '/operating-manager/alerts' },
  { id: 'n3', type: 'KPI Threshold Notifications', message: 'Davao Oriental inventory health below 70% target.',              read: true,  relatedTo: '/operating-manager/branch-performance/comparison' },
  { id: 'n4', type: 'Report Ready',               message: 'Executive Summary report for June 2026 ready for download.',      read: false, relatedTo: '/operating-manager/reports/executive-summary' },
];

export function formatCurrency(amount) { return `₱${Number(amount).toLocaleString('en-PH')}`; }
export function getBranchById(id)       { return BRANCHES.find((b) => b.id === id) ?? null; }
export function getAlertById(id)        { return ALERTS.find((a) => a.id === id) ?? null; }
export function getHighestPerformingBranch() { return [...BRANCHES].sort((a, b) => b.performanceScore - a.performanceScore)[0]; }
export function getLowestPerformingBranch()  { return [...BRANCHES].sort((a, b) => a.performanceScore - b.performanceScore)[0]; }

// ── Customer Records (Operating Manager view — all branches) ─────────────────
export const CUSTOMER_RECORDS = [
  {
    id: 'CR-001',
    clientName: 'Luntiang Tahanan Interiors',
    accountNumber: 'ACC-1001',
    branch: 'Davao City',
    contactPerson: 'Juan Santos',
    phone: '+63 912 345 6789',
    email: 'luntiang.tahanan@email.com',
    address: '42 Ilustre Ave, Davao City',
    businessType: 'Furniture Retail Store',
    creditLimit: 200000,
    outstandingBalance: 48500,
    status: 'Overdue',
    daysOverdue: 14,
    riskLevel: 'Medium',
    totalPurchases: 842000,
    assignedCollector: 'Maria Dela Cruz',
    lastVisit: '2026-06-20',
    accountOpenDate: '2024-03-15',
    paymentHistory: [
      { month: 'Jun 2026', paid: 25500, due: 30000, onTime: false },
      { month: 'May 2026', paid: 30000, due: 30000, onTime: true  },
      { month: 'Apr 2026', paid: 28000, due: 30000, onTime: false },
      { month: 'Mar 2026', paid: 30000, due: 30000, onTime: true  },
    ],
  },
  {
    id: 'CR-002',
    clientName: 'Furniture Plus GenSan',
    accountNumber: 'ACC-2001',
    branch: 'General Santos',
    contactPerson: 'Rosario Bautista',
    phone: '+63 917 111 2233',
    email: 'furniture.plus@gensan.ph',
    address: '120 Pioneer Ave, General Santos City',
    businessType: 'Furniture Showroom',
    creditLimit: 500000,
    outstandingBalance: 0,
    status: 'Current',
    daysOverdue: 0,
    riskLevel: 'Low',
    totalPurchases: 1240000,
    assignedCollector: 'Carlos Mendoza',
    lastVisit: '2026-06-25',
    accountOpenDate: '2023-08-01',
    paymentHistory: [
      { month: 'Jun 2026', paid: 128000, due: 128000, onTime: true },
      { month: 'May 2026', paid: 95000,  due: 95000,  onTime: true },
      { month: 'Apr 2026', paid: 110000, due: 110000, onTime: true },
      { month: 'Mar 2026', paid: 88000,  due: 88000,  onTime: true },
    ],
  },
  {
    id: 'CR-003',
    clientName: 'Abode Furniture Warehouse',
    accountNumber: 'ACC-2004',
    branch: 'General Santos',
    contactPerson: 'Marco Reyes',
    phone: '+63 912 333 4455',
    email: 'abode.furniture@gensan.ph',
    address: '44 General Santos Drive, General Santos City',
    businessType: 'Furniture Wholesale',
    creditLimit: 200000,
    outstandingBalance: 82000,
    status: 'Overdue',
    daysOverdue: 21,
    riskLevel: 'High',
    totalPurchases: 298000,
    assignedCollector: 'Carlos Mendoza',
    lastVisit: '2026-06-10',
    accountOpenDate: '2024-01-20',
    paymentHistory: [
      { month: 'Jun 2026', paid: 15000, due: 40000, onTime: false },
      { month: 'May 2026', paid: 10000, due: 40000, onTime: false },
      { month: 'Apr 2026', paid: 35000, due: 40000, onTime: false },
      { month: 'Mar 2026', paid: 40000, due: 40000, onTime: true  },
    ],
  },
  {
    id: 'CR-004',
    clientName: 'Mabuhay Sala Sets',
    accountNumber: 'ACC-1006',
    branch: 'Davao City',
    contactPerson: 'Ernesto Cruz',
    phone: '+63 919 333 2211',
    email: 'mabuhay.sala@davao.ph',
    address: '33 R. Castillo St, Davao City',
    businessType: 'Sala Set Specialty',
    creditLimit: 100000,
    outstandingBalance: 38000,
    status: 'Blacklisted',
    daysOverdue: 28,
    riskLevel: 'Critical',
    totalPurchases: 155000,
    assignedCollector: 'John Dela Cruz',
    lastVisit: '2026-05-28',
    accountOpenDate: '2023-11-05',
    paymentHistory: [
      { month: 'Jun 2026', paid: 5000,  due: 20000, onTime: false },
      { month: 'May 2026', paid: 3000,  due: 20000, onTime: false },
      { month: 'Apr 2026', paid: 8000,  due: 20000, onTime: false },
      { month: 'Mar 2026', paid: 15000, due: 20000, onTime: false },
    ],
  },
  {
    id: 'CR-005',
    clientName: 'Hardin ng Bahay Home Store',
    accountNumber: 'ACC-1003',
    branch: 'Davao City',
    contactPerson: 'Maribel Santos',
    phone: '+63 905 111 2233',
    email: 'hardin.bahay@davao.ph',
    address: '7 Quirino Ave, Davao City',
    businessType: 'Home Store',
    creditLimit: 120000,
    outstandingBalance: 15800,
    status: 'Pending',
    daysOverdue: 6,
    riskLevel: 'Low',
    totalPurchases: 380000,
    assignedCollector: 'Maria Dela Cruz',
    lastVisit: '2026-06-19',
    accountOpenDate: '2024-05-10',
    paymentHistory: [
      { month: 'Jun 2026', paid: 12000, due: 15000, onTime: false },
      { month: 'May 2026', paid: 15000, due: 15000, onTime: true  },
      { month: 'Apr 2026', paid: 15000, due: 15000, onTime: true  },
      { month: 'Mar 2026', paid: 14000, due: 15000, onTime: false },
    ],
  },
];

export function getCustomerRecordById(id) {
  return CUSTOMER_RECORDS.find((r) => r.id === id) ?? null;
}
