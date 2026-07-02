// Furniture retail — Davao City branch collector

export const COLLECTOR_PROFILE = {
  name: 'Maria Dela Cruz',
  employeeId: 'COL-2048',
  branch: 'Davao City Branch',
  email: 'maria.delacruz@corvex.ph',
  phone: '+63 917 555 0142',
  avatarInitials: 'MD',
};

export const ACCOUNTS = [
  {
    id: '1',
    clientName: 'Luntiang Tahanan Interiors',
    accountNumber: 'ACC-1001',
    address: '42 Ilustre Ave, Davao City',
    phone: '+63 912 345 6789',
    outstandingBalance: 48500,
    daysOverdue: 14,
    status: 'Overdue',
    assignedToday: true,
    lastVisitDate: '2026-06-16',
    distanceKm: 2.4,
    blacklisted: false,
    paymentHistory: [
      { date: '2026-06-20', amount: 12000, collector: 'Maria Dela Cruz', receipt: 'RCP-001' },
      { date: '2026-06-18', amount: 8500,  collector: 'Maria Dela Cruz', receipt: 'RCP-002' },
      { date: '2026-06-15', amount: 5000,  collector: 'Maria Dela Cruz', receipt: 'RCP-003' },
    ],
  },
  {
    id: '2',
    clientName: 'Casa Moderna Furniture',
    accountNumber: 'ACC-1002',
    address: '18 JP Laurel Ave, Davao City',
    phone: '+63 918 765 4321',
    outstandingBalance: 22000,
    daysOverdue: 9,
    status: 'Pending',
    assignedToday: true,
    lastVisitDate: '2026-06-18',
    distanceKm: 4.1,
    blacklisted: false,
    paymentHistory: [
      { date: '2026-06-19', amount: 10000, collector: 'Maria Dela Cruz', receipt: 'RCP-010' },
    ],
  },
  {
    id: '3',
    clientName: 'Hardin ng Bahay Home Store',
    accountNumber: 'ACC-1003',
    address: '7 Quirino Ave, Davao City',
    phone: '+63 905 111 2233',
    outstandingBalance: 15800,
    daysOverdue: 6,
    status: 'Pending',
    assignedToday: true,
    lastVisitDate: '2026-06-19',
    distanceKm: 3.5,
    blacklisted: false,
    paymentHistory: [],
  },
  {
    id: '4',
    clientName: 'Soledad Furniture Gallery',
    accountNumber: 'ACC-1004',
    address: '55 McArthur Highway, Davao City',
    phone: '+63 927 888 9900',
    outstandingBalance: 9200,
    daysOverdue: 0,
    status: 'Completed',
    assignedToday: false,
    lastVisitDate: '2026-06-24',
    distanceKm: 5.2,
    blacklisted: false,
    paymentHistory: [
      { date: '2026-06-24', amount: 9200, collector: 'Maria Dela Cruz', receipt: 'RCP-2024-0042' },
    ],
  },
  {
    id: '5',
    clientName: 'Dreamspace Living',
    accountNumber: 'ACC-1005',
    address: '91 Sandawa Rd, Davao City',
    phone: '+63 916 444 5566',
    outstandingBalance: 6500,
    daysOverdue: 0,
    status: 'Completed',
    assignedToday: true,
    lastVisitDate: '2026-06-24',
    distanceKm: 1.9,
    blacklisted: false,
    paymentHistory: [
      { date: '2026-06-24', amount: 6500, collector: 'Maria Dela Cruz', receipt: 'RCP-2024-0041' },
    ],
  },
  {
    id: '6',
    clientName: 'Mabuhay Sala Sets',
    accountNumber: 'ACC-1006',
    address: '33 R. Castillo St, Davao City',
    phone: '+63 919 333 2211',
    outstandingBalance: 38000,
    daysOverdue: 28,
    status: 'Overdue',
    assignedToday: false,
    lastVisitDate: '2026-05-28',
    distanceKm: 6.8,
    blacklisted: true,
    paymentHistory: [],
  },
];

// SAW (Simple Additive Weighting) scoring for collection prioritization
// Criteria: outstanding balance (weight 0.45), days overdue (weight 0.35), distance km (weight 0.20)
// Higher score = higher priority (lower rank number = visit first)
function computeSAWScore(account) {
  const maxBalance = 48500;
  const maxOverdue = 28;
  const maxDistance = 6.8;
  const normBalance  = maxBalance  > 0 ? account.outstandingBalance / maxBalance  : 0;
  const normOverdue  = maxOverdue  > 0 ? account.daysOverdue         / maxOverdue  : 0;
  // For distance, closer is better, so invert the normalisation
  const normDistance = maxDistance > 0 ? 1 - (account.distanceKm / maxDistance)   : 0;
  return (normBalance * 0.45) + (normOverdue * 0.35) + (normDistance * 0.20);
}

export const ROUTE_STOPS = ACCOUNTS
  .filter((a) => a.assignedToday)
  .map((account) => ({ ...account, sawScore: computeSAWScore(account) }))
  .sort((a, b) => b.sawScore - a.sawScore)
  .map((account, index) => ({ ...account, rank: index + 1 }));

export const COLLECTION_HISTORY = [
  {
    id: 'RCP-2024-0042',
    receiptNumber: 'RCP-2024-0042',
    clientName: 'Soledad Furniture Gallery',
    accountNumber: 'ACC-1004',
    amount: 9200,
    date: '2026-06-24',
    time: '10:32 AM',
    status: 'Confirmed',
    paymentMethod: 'Cash',
    collectorName: 'Maria Dela Cruz',
    branch: 'Davao City Branch',
  },
  {
    id: 'RCP-2024-0041',
    receiptNumber: 'RCP-2024-0041',
    clientName: 'Dreamspace Living',
    accountNumber: 'ACC-1005',
    amount: 6500,
    date: '2026-06-24',
    time: '09:15 AM',
    status: 'Confirmed',
    paymentMethod: 'Cash',
    collectorName: 'Maria Dela Cruz',
    branch: 'Davao City Branch',
  },
  {
    id: 'RCP-001',
    receiptNumber: 'RCP-001',
    clientName: 'Luntiang Tahanan Interiors',
    accountNumber: 'ACC-1001',
    amount: 12000,
    date: '2026-06-20',
    time: '02:45 PM',
    status: 'Confirmed',
    paymentMethod: 'Bank Transfer',
    collectorName: 'Maria Dela Cruz',
    branch: 'Davao City Branch',
  },
  {
    id: 'RCP-010',
    receiptNumber: 'RCP-010',
    clientName: 'Casa Moderna Furniture',
    accountNumber: 'ACC-1002',
    amount: 10000,
    date: '2026-06-19',
    time: '11:20 AM',
    status: 'Pending Review',
    paymentMethod: 'Check',
    collectorName: 'Maria Dela Cruz',
    branch: 'Davao City Branch',
  },
];

export const NOTIFICATIONS = [
  { id: 'n1', type: 'assignment', title: 'New accounts assigned', message: '3 new accounts added to your route for today.', time: '8:00 AM', read: false, relatedTo: '/collector/route' },
  { id: 'n2', type: 'route', title: 'Route updated', message: 'Stop order updated for Davao City cluster.', time: '7:45 AM', read: false, relatedTo: '/collector/route' },
  { id: 'n3', type: 'incident', title: 'Incident acknowledged', message: 'Branch manager acknowledged your report for ACC-1006 (Mabuhay Sala Sets).', time: 'Yesterday', read: true, relatedTo: '/collector/incident/6?from=accounts' },
  { id: 'n4', type: 'collection', title: 'Collection confirmed', message: 'Payment of PHP 9,200 for Soledad Furniture Gallery has been confirmed.', time: 'Yesterday', read: true, relatedTo: '/collector/history/RCP-2024-0042' },
  { id: 'n5', type: 'assignment', title: 'Weekly target reminder', message: 'You are at 72% of your weekly collection target.', time: 'Jun 23', read: true, relatedTo: '/collector/dashboard' },
];

export const DASHBOARD_SUMMARY = {
  accountsAssigned: ROUTE_STOPS.length,
  collectedToday: 2,
  pendingVisits: ROUTE_STOPS.filter((a) => a.status === 'Pending' || a.status === 'Overdue').length,
  completedVisits: ROUTE_STOPS.filter((a) => a.status === 'Completed').length,
  routeProgress: Math.round((ROUTE_STOPS.filter((a) => a.status === 'Completed').length / ROUTE_STOPS.length) * 100),
};

export function formatCurrency(amount) {
  return `₱${Number(amount).toLocaleString('en-PH')}`;
}

export function getAccountById(id) {
  return ACCOUNTS.find((a) => a.id === String(id)) ?? null;
}

export function getReceiptById(id) {
  return COLLECTION_HISTORY.find((r) => r.id === id || r.receiptNumber === id) ?? null;
}
