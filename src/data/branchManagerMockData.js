// Furniture retail — Operating Manager operations data

export const BRANCH_MANAGER_PROFILE = {
  name: 'Roberto Villanueva',
  employeeId: 'BM-4012',
  branch: 'Davao City Branch',
  email: 'roberto.villanueva@corvex.ph',
  phone: '+63 917 555 9900',
  avatarInitials: 'RV',
};

export const BRANCH_ANALYTICS = {
  healthScore: 84,
  collectionEfficiency: 88,
  salesEfficiency: 82,
  inventoryHealth: 76,
  collectionRateToday: 88,
  routeCompliance: 91,
  salesVisitCompletion: 82,
  stockAlertsCount: 4,
  pendingCI: 8,
  overdueAccounts: 11,
  totalCollectionsToday: 186500,
  totalSalesToday: 248000,
  activeCollectors: 5,
  activeSalesAgents: 4,
};

export const COLLECTORS = [
  {
    id: 'c1',
    name: 'Maria Dela Cruz',
    accountsAssigned: 18,
    accountsVisited: 13,
    accountsPending: 5,
    complianceScore: 94,
    collectionAmount: 68500,
    recoveryRate: 88,
    missedVisits: 2,
    avgVisitDuration: '28 min',
    collectionSuccessRate: 92,
    route: [
      { account: 'Luntiang Tahanan Interiors', status: 'Completed', time: '08:30 AM', amount: 12000 },
      { account: 'Casa Moderna Furniture',     status: 'Completed', time: '09:45 AM', amount: 10000 },
      { account: 'Hardin ng Bahay',            status: 'Pending',   time: '—',        amount: 0 },
      { account: 'Mabuhay Sala Sets',          status: 'Missed',    time: '—',        amount: 0 },
    ],
    missedAccounts: ['Mabuhay Sala Sets'],
    gpsAttendance: true,
  },
  {
    id: 'c2',
    name: 'John Dela Cruz',
    accountsAssigned: 16,
    accountsVisited: 15,
    accountsPending: 1,
    complianceScore: 97,
    collectionAmount: 74200,
    recoveryRate: 94,
    missedVisits: 0,
    avgVisitDuration: '22 min',
    collectionSuccessRate: 96,
    route: [],
    missedAccounts: [],
    gpsAttendance: true,
  },
  {
    id: 'c3',
    name: 'Pedro Garcia',
    accountsAssigned: 20,
    accountsVisited: 12,
    accountsPending: 8,
    complianceScore: 85,
    collectionAmount: 43800,
    recoveryRate: 78,
    missedVisits: 4,
    avgVisitDuration: '32 min',
    collectionSuccessRate: 82,
    route: [],
    missedAccounts: ['Dreamspace Living', 'Soledad Furniture Gallery'],
    gpsAttendance: true,
  },
];

export const SALES_AGENTS = [
  {
    id: 's1',
    name: 'Carlos Mendoza',
    clientsAssigned: 14,
    visitsCompleted: 10,
    salesLogged: 7,
    totalSalesAmount: 248000,
    visitCompletionRate: 82,
    conversionRate: 70,
    avgSaleValue: 35429,
    newClientsAcquired: 2,
    clients: ['Furniture Plus GenSan', 'Casa Elegante GenSan', 'Living Space Interiors'],
    productPerformance: [{ product: 'L-Shape Sofa (Gray)', units: 8 }, { product: '6-Seater Dining Set (Narra)', units: 4 }],
  },
  {
    id: 's2',
    name: 'Jane Smith',
    clientsAssigned: 12,
    visitsCompleted: 11,
    salesLogged: 8,
    totalSalesAmount: 192000,
    visitCompletionRate: 88,
    conversionRate: 72,
    avgSaleValue: 24000,
    newClientsAcquired: 1,
    clients: ['Home Essentials SoCCSKSargen', 'Abode Furniture Warehouse'],
    productPerformance: [{ product: 'Queen Bed Frame (Walnut)', units: 5 }, { product: 'Ergonomic Office Chair', units: 12 }],
  },
  {
    id: 's3',
    name: 'Robert Lee',
    clientsAssigned: 15,
    visitsCompleted: 13,
    salesLogged: 10,
    totalSalesAmount: 276000,
    visitCompletionRate: 86,
    conversionRate: 76,
    avgSaleValue: 27600,
    newClientsAcquired: 3,
    clients: [],
    productPerformance: [],
  },
];

export const CI_QUEUE = [
  {
    id: 'ci1',
    clientName: 'Luntiang Tahanan Interiors',
    submittedBy: 'Maria Dela Cruz',
    submissionDate: '2026-06-24',
    delinquencyStatus: 'Clear',
    status: 'Pending',
    monthlyIncome: 180000,
    businessType: 'Furniture Retail Store',
    purpose: 'Credit Limit Increase',
    references: 'Verified — 2 trade references',
    paymentHistory: [
      { date: '2026-06-20', amount: 12000, status: 'Paid' },
      { date: '2026-06-15', amount: 8500,  status: 'Paid' },
    ],
    delinquencyFlags: [],
    leafletClassification: 'High Collection Area',
    riskScore: 18,
    formRemarks: 'Consistent payer, requesting credit limit increase for Q3 orders.',
  },
  {
    id: 'ci2',
    clientName: 'Mabuhay Sala Sets',
    submittedBy: 'John Dela Cruz',
    submissionDate: '2026-06-24',
    delinquencyStatus: 'Overdue',
    status: 'Pending',
    monthlyIncome: 95000,
    businessType: 'Sala Set Specialty Store',
    purpose: 'Delinquency Review',
    references: '1 reference pending verification',
    paymentHistory: [{ date: '2026-05-28', amount: 5000, status: 'Late' }],
    delinquencyFlags: ['28 days overdue', 'Missed 3 collector visits'],
    leafletClassification: 'Delinquency Cluster Zone B',
    riskScore: 72,
    formRemarks: 'Review required — long overdue balance.',
  },
  {
    id: 'ci3',
    clientName: 'Dreamspace Living',
    submittedBy: 'Pedro Garcia',
    submissionDate: '2026-06-23',
    delinquencyStatus: 'Clear',
    status: 'Approved',
    monthlyIncome: 140000,
    businessType: 'Home Décor & Furniture',
    purpose: 'New Account',
    references: 'Verified',
    paymentHistory: [],
    delinquencyFlags: [],
    leafletClassification: 'Moderate Collection Area',
    riskScore: 28,
    formRemarks: 'New client onboarding for Sandawa district.',
  },
  {
    id: 'ci4',
    clientName: 'Casa Moderna Furniture',
    submittedBy: 'Maria Dela Cruz',
    submissionDate: '2026-06-22',
    delinquencyStatus: 'Overdue',
    status: 'Rejected',
    monthlyIncome: 75000,
    businessType: 'Furniture Retail',
    purpose: 'Account Restructure',
    references: 'Incomplete',
    paymentHistory: [],
    delinquencyFlags: ['Multiple partial payments', '9 days overdue'],
    leafletClassification: 'Low Collection Area',
    riskScore: 68,
    formRemarks: 'Rejected — incomplete documentation.',
  },
];

export const MAP_ACCOUNTS = [
  { id: 'a1', clientName: 'Luntiang Tahanan Interiors', balance: 48500,  paymentStatus: 'Overdue',  lastVisit: '2026-06-16', assignedStaff: 'Maria Dela Cruz', lat: 7.0731, lng: 125.6128, zone: 'High Collection' },
  { id: 'a2', clientName: 'Casa Moderna Furniture',     balance: 22000,  paymentStatus: 'Pending',  lastVisit: '2026-06-18', assignedStaff: 'John Dela Cruz',  lat: 7.0682, lng: 125.6096, zone: 'Delinquency Cluster' },
  { id: 'a3', clientName: 'Furniture Plus GenSan',      balance: 0,      paymentStatus: 'Current',  lastVisit: '2026-06-24', assignedStaff: 'Carlos Mendoza', lat: 6.1175, lng: 125.1739, zone: 'High Sales' },
  { id: 'a4', clientName: 'Hardin ng Bahay',            balance: 15800,  paymentStatus: 'Overdue',  lastVisit: '2026-06-19', assignedStaff: 'Maria Dela Cruz', lat: 7.0718, lng: 125.6148, zone: 'Low Collection' },
];

export const ALERTS = [
  { id: 'al1', type: 'collection', category: 'Overdue Accounts', title: '11 accounts overdue',         message: 'Total outstanding PHP 284,800 across Davao City territory.',                severity: 'Critical',       time: '9:00 AM' },
  { id: 'al2', type: 'collection', category: 'Missed Visits',    title: '4 missed visits today',       message: 'Collectors missed scheduled account visits.',                            severity: 'Warning',        time: '8:45 AM' },
  { id: 'al3', type: 'sales',      category: 'Unvisited Clients', title: '5 clients unvisited',        message: 'Sales agents have pending client visits in Davao City territory.',       severity: 'Warning',        time: '8:30 AM' },
  { id: 'al4', type: 'inventory',  category: 'Low Stock',         title: '4 low stock items',          message: 'Ergonomic Office Chair and Queen Bed Frame below reorder point.',        severity: 'Warning',        time: '8:15 AM' },
  { id: 'al5', type: 'inventory',  category: 'Stockout Risk',     title: 'Office Chair out of stock',  message: 'Ergonomic Office Chair (Black Mesh) — zero units remaining at branch.',  severity: 'Critical',       time: '8:00 AM' },
  { id: 'al6', type: 'route',      category: 'Route Deviations',  title: 'Route deviation detected',   message: 'Pedro Garcia deviated from assigned route in McArthur Highway cluster.', severity: 'Warning',        time: '7:50 AM' },
  { id: 'al7', type: 'route',      category: 'Low Compliance',    title: 'Compliance below threshold', message: 'Pedro Garcia compliance score at 85% — below 90% branch minimum.',       severity: 'Informational',  time: '7:30 AM' },
  { id: 'al8', type: 'collection', category: 'High Delinquency',  title: 'Delinquency cluster growth', message: 'JP Laurel Ave zone delinquency rate increased 6% week-on-week.',        severity: 'Critical',       time: 'Yesterday' },
];

export const NOTIFICATIONS = [
  { id: 'bn1', type: 'ci',          title: 'CI pending review',    message: 'Mabuhay Sala Sets CI submitted by John Dela Cruz.',          time: '9:10 AM',   read: false, relatedTo: '/branch-manager/ci-approvals/ci2' },
  { id: 'bn2', type: 'route',       title: 'Route alert',          message: 'Pedro Garcia route deviation flagged in McArthur cluster.',  time: '8:50 AM',   read: false, relatedTo: '/branch-manager/alerts' },
  { id: 'bn3', type: 'delinquency', title: 'Delinquency spike',    message: 'JP Laurel Ave zone delinquency rate increased.',            time: '8:30 AM',   read: false, relatedTo: '/branch-manager/leaflet/delinquency' },
  { id: 'bn4', type: 'inventory',   title: 'Critical stock alert', message: 'Ergonomic Office Chair out of stock at Davao City Branch.', time: 'Yesterday', read: true,  relatedTo: '/branch-manager/alerts' },
  { id: 'bn5', type: 'staff',       title: 'Staff check-in',       message: 'All collectors checked in via GPS.',                        time: '8:00 AM',   read: true,  relatedTo: '/branch-manager/staff-performance' },
];

export const PENDING_APPROVALS = {
  ci: CI_QUEUE.filter((c) => c.status === 'Pending').length,
  transfers: 2,
  specialCollections: 1,
};

export const AUDIT_LOGS = [
  { id: 'ba1', action: 'CI Approval',   detail: 'Approved CI for Dreamspace Living (ci3)',             timestamp: '2026-06-23 03:15 PM' },
  { id: 'ba2', action: 'CI Rejection',  detail: 'Rejected CI for Casa Moderna — incomplete docs',      timestamp: '2026-06-22 11:40 AM' },
  { id: 'ba3', action: 'Report Export', detail: 'Exported Collection Report (PDF)',                    timestamp: '2026-06-22 09:00 AM' },
  { id: 'ba4', action: 'Leaflet | OpenStreetMap Access',    detail: 'Viewed Delinquency Heatmap layer — Davao City',       timestamp: '2026-06-21 04:30 PM' },
  { id: 'ba5', action: 'Staff Monitor', detail: 'Reviewed Pedro Garcia GPS route playback',            timestamp: '2026-06-21 02:00 PM' },
];

export const TRENDS = {
  delinquency:    [14, 15, 13, 16, 17, 16, 18],
  routeCompliance:[88, 89, 90, 91, 90, 92, 91],
  sales:    [220000, 235000, 241000, 248000, 252000, 258000, 248000],
  collection:[170000, 178000, 182000, 186000, 189000, 192000, 186500],
};

export const DAILY_COLLECTION = [
  { day: 'Mon', amount: 170000, target: 180000 },
  { day: 'Tue', amount: 178000, target: 180000 },
  { day: 'Wed', amount: 182000, target: 185000 },
  { day: 'Thu', amount: 186000, target: 185000 },
  { day: 'Fri', amount: 189000, target: 190000 },
  { day: 'Sat', amount: 192000, target: 190000 },
  { day: 'Today', amount: 186500, target: 190000 },
];

export const WEEKLY_SALES = [
  { day: 'Mon', actual: 220000, target: 230000 },
  { day: 'Tue', actual: 235000, target: 230000 },
  { day: 'Wed', actual: 241000, target: 240000 },
  { day: 'Thu', actual: 248000, target: 245000 },
  { day: 'Fri', actual: 252000, target: 250000 },
  { day: 'Sat', actual: 258000, target: 255000 },
  { day: 'Today', actual: 248000, target: 260000 },
];

export const COLLECTOR_PERFORMANCE_CHART = [];

export const DELINQUENCY_TREND = [
  { week: 'W1', rate: 14, accounts: 9  },
  { week: 'W2', rate: 15, accounts: 10 },
  { week: 'W3', rate: 13, accounts: 9  },
  { week: 'W4', rate: 16, accounts: 10 },
  { week: 'W5', rate: 17, accounts: 11 },
  { week: 'W6', rate: 16, accounts: 10 },
  { week: 'W7', rate: 18, accounts: 11 },
];

export const COMPLIANCE_TREND = [
  { week: 'W1', Maria: 92, John: 96, Pedro: 82 },
  { week: 'W2', Maria: 93, John: 97, Pedro: 83 },
  { week: 'W3', Maria: 91, John: 97, Pedro: 84 },
  { week: 'W4', Maria: 94, John: 97, Pedro: 85 },
];

export function formatCurrency(amount) { return `₱${Number(amount).toLocaleString('en-PH')}`; }
export function getCollectorById(id)   { return COLLECTORS.find((c) => c.id === String(id)) ?? null; }
export function getSalesAgentById(id)  { return SALES_AGENTS.find((a) => a.id === String(id)) ?? null; }
export function getCIById(id)          { return CI_QUEUE.find((c) => c.id === String(id)) ?? null; }
export function getMapAccountById(id)  { return MAP_ACCOUNTS.find((a) => a.id === String(id)) ?? null; }
export function getAlertById(id)       { return ALERTS.find((a) => a.id === String(id)) ?? null; }
