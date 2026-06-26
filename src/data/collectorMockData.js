export const COLLECTOR_PROFILE = {
  name: 'Maria Dela Cruz',
  employeeId: 'COL-2048',
  branch: 'Quezon City Main Branch',
  email: 'maria.delacruz@corvex.ph',
  phone: '+63 917 555 0142',
  avatarInitials: 'MD',
};

export const ACCOUNTS = [
  {
    id: '1',
    clientName: 'Juan Santos',
    accountNumber: 'ACC-1001',
    address: '42 Mabini St, Quezon City',
    phone: '+63 912 345 6789',
    outstandingBalance: 18500,
    daysOverdue: 12,
    status: 'Overdue',
    assignedToday: true,
    lastVisitDate: '2026-06-16',
    distanceKm: 2.4,
    blacklisted: false,
    paymentHistory: [
      { date: '2026-06-20', amount: 5000, collector: 'Maria Dela Cruz', receipt: 'RCP-001' },
      { date: '2026-06-18', amount: 3500, collector: 'Maria Dela Cruz', receipt: 'RCP-002' },
      { date: '2026-06-15', amount: 2000, collector: 'Maria Dela Cruz', receipt: 'RCP-003' },
    ],
  },
  {
    id: '2',
    clientName: 'Maria Garcia',
    accountNumber: 'ACC-1002',
    address: '18 Rizal Ave, Manila',
    phone: '+63 918 765 4321',
    outstandingBalance: 5200,
    daysOverdue: 9,
    status: 'Pending',
    assignedToday: true,
    lastVisitDate: '2026-06-18',
    distanceKm: 4.1,
    blacklisted: false,
    paymentHistory: [
      { date: '2026-06-19', amount: 1200, collector: 'Maria Dela Cruz', receipt: 'RCP-010' },
    ],
  },
  {
    id: '3',
    clientName: 'Pedro Reyes',
    accountNumber: 'ACC-1003',
    address: '7 Osmena Blvd, Cebu City',
    phone: '+63 905 111 2233',
    outstandingBalance: 3800,
    daysOverdue: 7,
    status: 'Pending',
    assignedToday: true,
    lastVisitDate: '2026-06-19',
    distanceKm: 6.8,
    blacklisted: false,
    paymentHistory: [],
  },
  {
    id: '4',
    clientName: 'Anna Lopez',
    accountNumber: 'ACC-1004',
    address: '55 Bonifacio St, Davao City',
    phone: '+63 927 888 9900',
    outstandingBalance: 2100,
    daysOverdue: 5,
    status: 'Completed',
    assignedToday: false,
    lastVisitDate: '2026-06-24',
    distanceKm: 8.2,
    blacklisted: false,
    paymentHistory: [
      { date: '2026-06-24', amount: 2100, collector: 'Maria Dela Cruz', receipt: 'RCP-2024-0042' },
    ],
  },
  {
    id: '5',
    clientName: 'Jose Cruz',
    accountNumber: 'ACC-1005',
    address: '91 Aurora Blvd, Quezon City',
    phone: '+63 916 444 5566',
    outstandingBalance: 1500,
    daysOverdue: 3,
    status: 'Completed',
    assignedToday: true,
    lastVisitDate: '2026-06-24',
    distanceKm: 1.9,
    blacklisted: false,
    paymentHistory: [
      { date: '2026-06-24', amount: 1500, collector: 'Maria Dela Cruz', receipt: 'RCP-2024-0041' },
    ],
  },
  {
    id: '6',
    clientName: 'Rosa Mendoza',
    accountNumber: 'ACC-1006',
    address: '33 Taft Ave, Manila',
    phone: '+63 919 333 2211',
    outstandingBalance: 9200,
    daysOverdue: 21,
    status: 'Overdue',
    assignedToday: false,
    lastVisitDate: '2026-06-03',
    distanceKm: 5.5,
    blacklisted: true,
    paymentHistory: [],
  },
];

export const ROUTE_STOPS = ACCOUNTS.filter((a) => a.assignedToday).map((account, index) => ({
  ...account,
  rank: index + 1,
}));

export const COLLECTION_HISTORY = [
  {
    id: 'RCP-2024-0042',
    receiptNumber: 'RCP-2024-0042',
    clientName: 'Anna Lopez',
    accountNumber: 'ACC-1004',
    amount: 2100,
    date: '2026-06-24',
    time: '10:32 AM',
    status: 'Confirmed',
    paymentMethod: 'Cash',
    collectorName: 'Maria Dela Cruz',
    branch: 'Quezon City Main Branch',
  },
  {
    id: 'RCP-2024-0041',
    receiptNumber: 'RCP-2024-0041',
    clientName: 'Jose Cruz',
    accountNumber: 'ACC-1005',
    amount: 1500,
    date: '2026-06-24',
    time: '09:15 AM',
    status: 'Confirmed',
    paymentMethod: 'Cash',
    collectorName: 'Maria Dela Cruz',
    branch: 'Quezon City Main Branch',
  },
  {
    id: 'RCP-001',
    receiptNumber: 'RCP-001',
    clientName: 'Juan Santos',
    accountNumber: 'ACC-1001',
    amount: 5000,
    date: '2026-06-20',
    time: '02:45 PM',
    status: 'Confirmed',
    paymentMethod: 'Bank Transfer',
    collectorName: 'Maria Dela Cruz',
    branch: 'Quezon City Main Branch',
  },
  {
    id: 'RCP-010',
    receiptNumber: 'RCP-010',
    clientName: 'Maria Garcia',
    accountNumber: 'ACC-1002',
    amount: 1200,
    date: '2026-06-19',
    time: '11:20 AM',
    status: 'Pending Review',
    paymentMethod: 'Check',
    collectorName: 'Maria Dela Cruz',
    branch: 'Quezon City Main Branch',
  },
];

export const NOTIFICATIONS = [
  {
    id: 'n1',
    type: 'assignment',
    title: 'New accounts assigned',
    message: '3 new accounts added to your route for today.',
    time: '8:00 AM',
    read: false,
    relatedTo: '/collector/route',
  },
  {
    id: 'n2',
    type: 'route',
    title: 'Route updated',
    message: 'Stop order changed for Quezon City cluster.',
    time: '7:45 AM',
    read: false,
    relatedTo: '/collector/route',
  },
  {
    id: 'n3',
    type: 'incident',
    title: 'Incident response',
    message: 'Branch manager acknowledged your report for ACC-1006.',
    time: 'Yesterday',
    read: true,
    relatedTo: '/collector/incident/6?from=accounts',
  },
  {
    id: 'n4',
    type: 'collection',
    title: 'Collection confirmed',
    message: 'Payment of PHP 2,100 for Anna Lopez has been confirmed.',
    time: 'Yesterday',
    read: true,
    relatedTo: '/collector/history/RCP-2024-0042',
  },
  {
    id: 'n5',
    type: 'assignment',
    title: 'Weekly target reminder',
    message: 'You are at 78% of your weekly collection target.',
    time: 'Jun 23',
    read: true,
    relatedTo: '/collector/dashboard',
  },
];

export const DASHBOARD_SUMMARY = {
  accountsAssigned: ROUTE_STOPS.length,
  collectedToday: 2,
  pendingVisits: ROUTE_STOPS.filter((a) => a.status === 'Pending' || a.status === 'Overdue').length,
  completedVisits: ROUTE_STOPS.filter((a) => a.status === 'Completed').length,
  routeProgress: Math.round((ROUTE_STOPS.filter((a) => a.status === 'Completed').length / ROUTE_STOPS.length) * 100),
};

export function formatCurrency(amount) {
  return `PHP ${Number(amount).toLocaleString('en-PH')}`;
}

export function getAccountById(id) {
  return ACCOUNTS.find((account) => account.id === String(id)) ?? null;
}

export function getReceiptById(id) {
  return COLLECTION_HISTORY.find((receipt) => receipt.id === id || receipt.receiptNumber === id) ?? null;
}
