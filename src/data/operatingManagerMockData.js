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

export const TREND_DATA = {
  collection: [82, 84, 86, 85, 88, 90, 91],
  sales: [74, 76, 78, 79, 81, 83, 84],
  delinquency: [18, 17, 16, 15, 14, 13, 12],
};

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
  return `PHP ${amount.toLocaleString('en-PH')}`;
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
