export const BRANCH_MANAGER_PROFILE = {
  name: 'Roberto Villanueva',
  employeeId: 'BM-4012',
  branch: 'Quezon City Main Branch',
  email: 'roberto.villanueva@corvex.ph',
  phone: '+63 917 555 9900',
  avatarInitials: 'RV',
};

export const BRANCH_ANALYTICS = {
  healthScore: 82,
  collectionEfficiency: 91,
  salesEfficiency: 84,
  inventoryHealth: 78,
  collectionRateToday: 91,
  routeCompliance: 88,
  salesVisitCompletion: 84,
  stockAlertsCount: 7,
  pendingCI: 12,
  overdueAccounts: 23,
  totalCollectionsToday: 285400,
  totalSalesToday: 314200,
  activeCollectors: 5,
  activeSalesAgents: 4,
};

export const COLLECTORS = [
  {
    id: 'c1',
    name: 'Maria Dela Cruz',
    accountsAssigned: 24,
    accountsVisited: 16,
    accountsPending: 8,
    complianceScore: 94,
    collectionAmount: 68500,
    recoveryRate: 88,
    missedVisits: 2,
    avgVisitDuration: '22 min',
    collectionSuccessRate: 92,
    route: [
      { account: 'Juan Santos', status: 'Completed', time: '08:30 AM', amount: 5000 },
      { account: 'Maria Garcia', status: 'Completed', time: '09:45 AM', amount: 3500 },
      { account: 'Pedro Reyes', status: 'Pending', time: '—', amount: 0 },
      { account: 'Anna Lopez', status: 'Missed', time: '—', amount: 0 },
    ],
    missedAccounts: ['Anna Lopez'],
    gpsAttendance: true,
  },
  {
    id: 'c2',
    name: 'John Dela Cruz',
    accountsAssigned: 20,
    accountsVisited: 18,
    accountsPending: 2,
    complianceScore: 97,
    collectionAmount: 74200,
    recoveryRate: 94,
    missedVisits: 0,
    avgVisitDuration: '19 min',
    collectionSuccessRate: 96,
    route: [],
    missedAccounts: [],
    gpsAttendance: true,
  },
  {
    id: 'c3',
    name: 'Pedro Garcia',
    accountsAssigned: 22,
    accountsVisited: 14,
    accountsPending: 8,
    complianceScore: 88,
    collectionAmount: 52100,
    recoveryRate: 81,
    missedVisits: 3,
    avgVisitDuration: '25 min',
    collectionSuccessRate: 85,
    route: [],
    missedAccounts: ['Jose Cruz', 'Rosa Mendoza'],
    gpsAttendance: true,
  },
];

export const SALES_AGENTS = [
  {
    id: 's1',
    name: 'Carlos Mendoza',
    clientsAssigned: 17,
    visitsCompleted: 11,
    salesLogged: 8,
    totalSalesAmount: 87600,
    visitCompletionRate: 84,
    conversionRate: 72,
    avgSaleValue: 10950,
    newClientsAcquired: 2,
    clients: ['Corner Store Manila', 'City Convenience', 'Riverside Trading'],
    productPerformance: [{ product: 'Beverage Pack A', units: 120 }, { product: 'Snack Box B', units: 85 }],
  },
  {
    id: 's2',
    name: 'Jane Smith',
    clientsAssigned: 15,
    visitsCompleted: 13,
    salesLogged: 9,
    totalSalesAmount: 72400,
    visitCompletionRate: 87,
    conversionRate: 69,
    avgSaleValue: 8044,
    newClientsAcquired: 1,
    clients: ['Barangay Store', 'Plaza Shop'],
    productPerformance: [{ product: 'Instant Noodles D', units: 95 }],
  },
  {
    id: 's3',
    name: 'Robert Lee',
    clientsAssigned: 18,
    visitsCompleted: 16,
    salesLogged: 11,
    totalSalesAmount: 95200,
    visitCompletionRate: 89,
    conversionRate: 78,
    avgSaleValue: 8655,
    newClientsAcquired: 3,
    clients: [],
    productPerformance: [],
  },
];

export const CI_QUEUE = [
  {
    id: 'ci1',
    clientName: 'Juan Santos',
    submittedBy: 'Maria Dela Cruz',
    submissionDate: '2026-06-24',
    delinquencyStatus: 'Clear',
    status: 'Pending',
    monthlyIncome: 45000,
    businessType: 'Sari-Sari Store',
    purpose: 'Credit Limit Increase',
    references: 'Verified — 2 references',
    paymentHistory: [
      { date: '2026-06-20', amount: 5000, status: 'Paid' },
      { date: '2026-06-15', amount: 3500, status: 'Paid' },
    ],
    delinquencyFlags: [],
    gisClassification: 'High Collection Area',
    riskScore: 22,
    formRemarks: 'Consistent payer, requesting limit increase.',
  },
  {
    id: 'ci2',
    clientName: 'Maria Garcia',
    submittedBy: 'John Dela Cruz',
    submissionDate: '2026-06-24',
    delinquencyStatus: 'Overdue',
    status: 'Pending',
    monthlyIncome: 32000,
    businessType: 'Convenience Store',
    purpose: 'Delinquency Review',
    references: '1 reference pending verification',
    paymentHistory: [{ date: '2026-06-10', amount: 2000, status: 'Late' }],
    delinquencyFlags: ['12 days overdue', 'Missed last visit'],
    gisClassification: 'Delinquency Cluster Zone B',
    riskScore: 68,
    formRemarks: 'Review required due to recent delinquency.',
  },
  {
    id: 'ci3',
    clientName: 'Pedro Reyes',
    submittedBy: 'Pedro Garcia',
    submissionDate: '2026-06-23',
    delinquencyStatus: 'Clear',
    status: 'Approved',
    monthlyIncome: 28000,
    businessType: 'General Store',
    purpose: 'New Account',
    references: 'Verified',
    paymentHistory: [],
    delinquencyFlags: [],
    gisClassification: 'Moderate Collection Area',
    riskScore: 35,
    formRemarks: 'New client onboarding.',
  },
  {
    id: 'ci4',
    clientName: 'Jose Cruz',
    submittedBy: 'Anna Lopez',
    submissionDate: '2026-06-22',
    delinquencyStatus: 'Overdue',
    status: 'Rejected',
    monthlyIncome: 18000,
    businessType: 'Retail',
    purpose: 'Account Restructure',
    references: 'Incomplete',
    paymentHistory: [],
    delinquencyFlags: ['Multiple missed payments'],
    gisClassification: 'Low Collection Area',
    riskScore: 82,
    formRemarks: 'Rejected — insufficient payment history.',
  },
];

export const MAP_ACCOUNTS = [
  { id: 'a1', clientName: 'Juan Santos', balance: 18500, paymentStatus: 'Overdue', lastVisit: '2026-06-16', assignedStaff: 'Maria Dela Cruz', lat: 14.676, lng: 121.043, zone: 'High Collection' },
  { id: 'a2', clientName: 'Maria Garcia', balance: 5200, paymentStatus: 'Pending', lastVisit: '2026-06-18', assignedStaff: 'John Dela Cruz', lat: 14.599, lng: 120.984, zone: 'Delinquency Cluster' },
  { id: 'a3', clientName: 'Corner Store Manila', balance: 0, paymentStatus: 'Current', lastVisit: '2026-06-24', assignedStaff: 'Carlos Mendoza', lat: 14.554, lng: 121.024, zone: 'High Sales' },
  { id: 'a4', clientName: 'Pedro Reyes', balance: 3800, paymentStatus: 'Overdue', lastVisit: '2026-06-19', assignedStaff: 'Maria Dela Cruz', lat: 14.608, lng: 121.022, zone: 'Low Collection' },
];

export const ALERTS = [
  { id: 'al1', type: 'collection', category: 'Overdue Accounts', title: '23 accounts overdue', message: 'Total outstanding PHP 412,800 across branch territory.', severity: 'Critical', time: '9:00 AM' },
  { id: 'al2', type: 'collection', category: 'Missed Visits', title: '5 missed visits today', message: 'Collectors missed scheduled account visits.', severity: 'Warning', time: '8:45 AM' },
  { id: 'al3', type: 'sales', category: 'Unvisited Clients', title: '6 clients unvisited', message: 'Sales agents have pending client visits.', severity: 'Warning', time: '8:30 AM' },
  { id: 'al4', type: 'inventory', category: 'Low Stock', title: '7 low stock items', message: 'Snack Box B and Coffee Mix D below reorder point.', severity: 'Warning', time: '8:15 AM' },
  { id: 'al5', type: 'inventory', category: 'Stockout Risk', title: 'Candy Mix C out of stock', message: 'Predicted stockout — reorder recommended.', severity: 'Critical', time: '8:00 AM' },
  { id: 'al6', type: 'route', category: 'Route Deviations', title: 'Route deviation detected', message: 'Pedro Garcia deviated from assigned route.', severity: 'Warning', time: '7:50 AM' },
  { id: 'al7', type: 'route', category: 'Low Compliance', title: 'Compliance below threshold', message: 'Pedro Garcia compliance at 88%.', severity: 'Informational', time: '7:30 AM' },
  { id: 'al8', type: 'collection', category: 'High Delinquency', title: 'Critical delinquency cluster', message: 'Zone B delinquency rate increased 8%.', severity: 'Critical', time: 'Yesterday' },
];

export const NOTIFICATIONS = [
  { id: 'bn1', type: 'ci', title: 'CI pending review', message: 'Maria Garcia CI submitted by John Dela Cruz.', time: '9:10 AM', read: false, relatedTo: '/branch-manager/ci-approvals/ci2' },
  { id: 'bn2', type: 'route', title: 'Route alert', message: 'Pedro Garcia route deviation flagged.', time: '8:50 AM', read: false, relatedTo: '/branch-manager/alerts' },
  { id: 'bn3', type: 'delinquency', title: 'Delinquency spike', message: 'Zone B delinquency rate increased.', time: '8:30 AM', read: false, relatedTo: '/branch-manager/gis/delinquency' },
  { id: 'bn4', type: 'inventory', title: 'Critical stock alert', message: 'Candy Mix C out of stock at Main Branch.', time: 'Yesterday', read: true, relatedTo: '/branch-manager/alerts' },
  { id: 'bn5', type: 'staff', title: 'Staff check-in', message: 'All collectors checked in via GPS.', time: '8:00 AM', read: true, relatedTo: '/branch-manager/staff-performance' },
];

export const PENDING_APPROVALS = {
  ci: CI_QUEUE.filter((c) => c.status === 'Pending').length,
  transfers: 2,
  specialCollections: 1,
};

export const AUDIT_LOGS = [
  { id: 'ba1', action: 'CI Approval', detail: 'Approved CI for Pedro Reyes (ci3)', timestamp: '2026-06-23 03:15 PM' },
  { id: 'ba2', action: 'CI Rejection', detail: 'Rejected CI for Jose Cruz — insufficient history', timestamp: '2026-06-22 11:40 AM' },
  { id: 'ba3', action: 'Report Export', detail: 'Exported Collection Report (PDF)', timestamp: '2026-06-22 09:00 AM' },
  { id: 'ba4', action: 'GIS Access', detail: 'Viewed Delinquency Heatmap layer', timestamp: '2026-06-21 04:30 PM' },
  { id: 'ba5', action: 'Staff Monitoring', detail: 'Reviewed Pedro Garcia route playback', timestamp: '2026-06-21 02:00 PM' },
];

export const TRENDS = {
  delinquency: [18, 19, 17, 20, 22, 21, 23],
  routeCompliance: [85, 86, 87, 88, 87, 89, 88],
  sales: [280000, 295000, 301000, 308000, 310000, 312000, 314200],
  collection: [260000, 268000, 272000, 275000, 279000, 282000, 285400],
};

export function formatCurrency(amount) {
  return `PHP ${Number(amount).toLocaleString('en-PH')}`;
}

export function getCollectorById(id) {
  return COLLECTORS.find((c) => c.id === String(id)) ?? null;
}

export function getSalesAgentById(id) {
  return SALES_AGENTS.find((a) => a.id === String(id)) ?? null;
}

export function getCIById(id) {
  return CI_QUEUE.find((c) => c.id === String(id)) ?? null;
}

export function getMapAccountById(id) {
  return MAP_ACCOUNTS.find((a) => a.id === String(id)) ?? null;
}

export function getAlertById(id) {
  return ALERTS.find((a) => a.id === String(id)) ?? null;
}
