export const OPERATING_MANAGER_PROFILE = {
  name: 'Elena Mercado',
  employeeId: 'OM-2001',
  region: 'National Operations — Luzon & Mindanao',
  email: 'elena.mercado@corvex.ph',
  phone: '+63 918 555 4400',
  avatarInitials: 'EM',
};

export const BRANCHES = [
  {
    id: 'main',
    name: 'Main Branch',
    collectionRate: 91,
    salesCompletionRate: 84,
    inventoryHealth: 88,
    overdueAccounts: 23,
    routeCompliance: 88,
    performanceScore: 92,
    riskScore: 18,
    growthScore: 85,
    revenue: 4280000,
    collections: 3890000,
    sales: 3140000,
    delinquencies: 142000,
    inventoryValue: 890000,
    collectors: 12,
    salesAgents: 8,
    locations: 450,
    status: 'Healthy',
  },
  {
    id: 'north',
    name: 'North Branch',
    collectionRate: 89,
    salesCompletionRate: 81,
    inventoryHealth: 82,
    overdueAccounts: 31,
    routeCompliance: 86,
    performanceScore: 87,
    riskScore: 28,
    growthScore: 79,
    revenue: 3620000,
    collections: 3220000,
    sales: 2680000,
    delinquencies: 198000,
    inventoryValue: 720000,
    collectors: 9,
    salesAgents: 6,
    locations: 320,
    status: 'Stable',
  },
  {
    id: 'south',
    name: 'South Branch',
    collectionRate: 85,
    salesCompletionRate: 78,
    inventoryHealth: 74,
    overdueAccounts: 47,
    routeCompliance: 82,
    performanceScore: 78,
    riskScore: 42,
    growthScore: 71,
    revenue: 2980000,
    collections: 2530000,
    sales: 2320000,
    delinquencies: 312000,
    inventoryValue: 610000,
    collectors: 11,
    salesAgents: 7,
    locations: 380,
    status: 'Needs Support',
  },
  {
    id: 'davao',
    name: 'Davao City',
    collectionRate: 96,
    salesCompletionRate: 91,
    inventoryHealth: 90,
    overdueAccounts: 12,
    routeCompliance: 94,
    performanceScore: 96,
    riskScore: 12,
    growthScore: 93,
    revenue: 5120000,
    collections: 4910000,
    sales: 4020000,
    delinquencies: 89000,
    inventoryValue: 1050000,
    collectors: 14,
    salesAgents: 10,
    locations: 520,
    status: 'Top Performer',
  },
];

export const ENTERPRISE_KPIS = {
  totalRevenue: BRANCHES.reduce((s, b) => s + b.revenue, 0),
  totalCollections: BRANCHES.reduce((s, b) => s + b.collections, 0),
  totalSales: BRANCHES.reduce((s, b) => s + b.sales, 0),
  totalDelinquencies: BRANCHES.reduce((s, b) => s + b.delinquencies, 0),
  totalInventoryValue: BRANCHES.reduce((s, b) => s + b.inventoryValue, 0),
};

// Weekly trend data (7 weeks) for line/area charts
export const TREND_DATA = {
  collection: [82, 84, 86, 85, 88, 90, 91],
  sales: [74, 76, 78, 79, 81, 83, 84],
  delinquency: [18, 17, 16, 15, 14, 13, 12],
};

// Monthly revenue per branch (6 months) for multi-line chart
export const MONTHLY_REVENUE = [
  { month: 'Jan', Main: 3800000, North: 3100000, South: 2600000, Davao: 4400000 },
  { month: 'Feb', Main: 3950000, North: 3220000, South: 2700000, Davao: 4600000 },
  { month: 'Mar', Main: 4050000, North: 3350000, South: 2820000, Davao: 4750000 },
  { month: 'Apr', Main: 4100000, North: 3480000, South: 2890000, Davao: 4890000 },
  { month: 'May', Main: 4200000, North: 3560000, South: 2940000, Davao: 5020000 },
  { month: 'Jun', Main: 4280000, North: 3620000, South: 2980000, Davao: 5120000 },
];

// Monthly collections per branch
export const MONTHLY_COLLECTIONS = [
  { month: 'Jan', Main: 3400000, North: 2800000, South: 2200000, Davao: 4100000 },
  { month: 'Feb', Main: 3520000, North: 2920000, South: 2310000, Davao: 4280000 },
  { month: 'Mar', Main: 3640000, North: 3010000, South: 2390000, Davao: 4450000 },
  { month: 'Apr', Main: 3710000, North: 3090000, South: 2440000, Davao: 4620000 },
  { month: 'May', Main: 3800000, North: 3160000, South: 2490000, Davao: 4780000 },
  { month: 'Jun', Main: 3890000, North: 3220000, South: 2530000, Davao: 4910000 },
];

// Monthly delinquency rate per branch
export const MONTHLY_DELINQUENCY = [
  { month: 'Jan', Main: 22, North: 30, South: 46, Davao: 14 },
  { month: 'Feb', Main: 21, North: 29, South: 45, Davao: 13 },
  { month: 'Mar', Main: 20, North: 28, South: 44, Davao: 13 },
  { month: 'Apr', Main: 19, North: 29, South: 46, Davao: 12 },
  { month: 'May', Main: 21, North: 30, South: 47, Davao: 12 },
  { month: 'Jun', Main: 23, North: 31, South: 47, Davao: 12 },
];

// Collection rate weekly trend per branch
export const WEEKLY_COLLECTION_RATE = [
  { week: 'W1', Main: 88, North: 85, South: 80, Davao: 93 },
  { week: 'W2', Main: 89, North: 86, South: 81, Davao: 94 },
  { week: 'W3', Main: 90, North: 87, South: 83, Davao: 95 },
  { week: 'W4', Main: 91, North: 89, South: 85, Davao: 96 },
];

// Sales completion weekly trend per branch
export const WEEKLY_SALES_RATE = [
  { week: 'W1', Main: 80, North: 77, South: 74, Davao: 88 },
  { week: 'W2', Main: 81, North: 78, South: 75, Davao: 89 },
  { week: 'W3', Main: 83, North: 80, South: 76, Davao: 90 },
  { week: 'W4', Main: 84, North: 81, South: 78, Davao: 91 },
];

// Radar / performance profile per branch (for radar chart)
export const BRANCH_RADAR = [
  { metric: 'Collection', Main: 91, North: 89, South: 85, Davao: 96 },
  { metric: 'Sales', Main: 84, North: 81, South: 78, Davao: 91 },
  { metric: 'Inventory', Main: 88, North: 82, South: 74, Davao: 90 },
  { metric: 'Compliance', Main: 88, North: 86, South: 82, Davao: 94 },
  { metric: 'Growth', Main: 85, North: 79, South: 71, Davao: 93 },
];

export const GIS_LAYERS = [
  { id: 'routes', label: 'Collector Routes', active: true },
  { id: 'territories', label: 'Sales Territories', active: true },
  { id: 'delinquency', label: 'Delinquency Clusters', active: false },
  { id: 'payment', label: 'Payment Behavior Zones', active: false },
  { id: 'profitability', label: 'Profitability Zones', active: true },
  { id: 'coverage', label: 'Branch Coverage Areas', active: true },
  { id: 'efficiency', label: 'Route Efficiency', active: false },
  { id: 'opportunity', label: 'Sales Opportunity Zones', active: false },
];

export const REPORT_CATEGORIES = [
  {
    id: 'collections',
    title: 'Collection Reports',
    path: '/operating-manager/reports/collections',
    reports: ['Branch Collection Comparison', 'Recovery Rate', 'Collection Trends'],
  },
  {
    id: 'sales',
    title: 'Sales Reports',
    path: '/operating-manager/reports/sales',
    reports: ['Revenue Trends', 'Product Performance', 'Sales Conversion'],
  },
  {
    id: 'inventory',
    title: 'Inventory Reports',
    path: '/operating-manager/reports/inventory',
    reports: ['Inventory Health', 'Forecasted Stockouts', 'Transfer Activity'],
  },
  {
    id: 'delinquency',
    title: 'Delinquency Reports',
    path: '/operating-manager/reports/delinquency',
    reports: ['Delinquency Trends', 'Geographic Risk Analysis'],
  },
  {
    id: 'executive',
    title: 'Executive Summary',
    path: '/operating-manager/reports/executive-summary',
    reports: ['Consolidated Performance Report', 'Branch Rankings', 'Strategic Recommendations'],
  },
];

export const ALERTS = [
  {
    id: 'a1',
    type: 'Critical Delinquency Growth',
    severity: 'Critical',
    branch: 'South Branch',
    branchId: 'south',
    message: 'Delinquency rate increased 4.2% this month.',
    date: '2026-06-25',
    resolved: false,
  },
  {
    id: 'a2',
    type: 'Inventory Shortages',
    severity: 'Warning',
    branch: 'North Branch',
    branchId: 'north',
    message: '12 SKUs below reorder point.',
    date: '2026-06-24',
    resolved: false,
  },
  {
    id: 'a3',
    type: 'Route Compliance Issues',
    severity: 'Warning',
    branch: 'South Branch',
    branchId: 'south',
    message: 'Route compliance dropped below 85% threshold.',
    date: '2026-06-24',
    resolved: false,
  },
  {
    id: 'a4',
    type: 'Sales Performance Decline',
    severity: 'Informational',
    branch: 'North Branch',
    branchId: 'north',
    message: 'Sales completion rate down 2% vs last week.',
    date: '2026-06-23',
    resolved: true,
  },
  {
    id: 'a5',
    type: 'Branch KPI Threshold Breach',
    severity: 'Critical',
    branch: 'South Branch',
    branchId: 'south',
    message: 'Collection rate below 87% company minimum.',
    date: '2026-06-22',
    resolved: false,
  },
];

export const NOTIFICATIONS = [
  { id: 'n1', type: 'Branch Alerts', message: 'South Branch delinquency alert escalated.', read: false, relatedTo: '/operating-manager/alerts' },
  { id: 'n2', type: 'Approval Escalations', message: 'Transfer approval pending executive review.', read: false, relatedTo: '/operating-manager/alerts' },
  { id: 'n3', type: 'KPI Threshold Notifications', message: 'North Branch inventory health below target.', read: true, relatedTo: '/operating-manager/branch-performance/comparison' },
  { id: 'n4', type: 'Report Generation Notifications', message: 'Executive Summary report ready for download.', read: false, relatedTo: '/operating-manager/reports/executive-summary' },
];

export function formatCurrency(amount) {
  return `PHP ${Number(amount).toLocaleString('en-PH')}`;
}

export function getBranchById(id) {
  return BRANCHES.find((b) => b.id === id) ?? null;
}

export function getAlertById(id) {
  return ALERTS.find((a) => a.id === id) ?? null;
}

export function getHighestPerformingBranch() {
  return [...BRANCHES].sort((a, b) => b.performanceScore - a.performanceScore)[0];
}

export function getLowestPerformingBranch() {
  return [...BRANCHES].sort((a, b) => a.performanceScore - b.performanceScore)[0];
}
