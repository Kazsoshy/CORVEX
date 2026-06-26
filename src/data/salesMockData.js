export const SALES_AGENT_PROFILE = {
  name: 'Carlos Mendoza',
  employeeId: 'SA-1087',
  branch: 'Manila North Branch',
  email: 'carlos.mendoza@corvex.ph',
  phone: '+63 918 222 3344',
  avatarInitials: 'CM',
};

export const CLIENTS = [
  {
    id: '1',
    clientName: 'Corner Store Manila',
    businessName: 'Corner Store Trading',
    address: '120 Rizal Ave, Manila',
    phone: '+63 917 111 2233',
    lastPurchaseDate: '2026-06-21',
    purchaseVolume: 250,
    totalPurchaseVolume: 45600,
    distanceKm: 2.1,
    status: 'Completed',
    assignedToday: true,
    rank: 1,
    active: true,
    highValue: true,
    delinquent: false,
    lastVisitDate: '2026-06-21',
    purchaseHistory: [
      { date: '2026-06-21', amount: 12500, products: 3, agent: 'Carlos Mendoza' },
      { date: '2026-06-14', amount: 8900, products: 2, agent: 'Carlos Mendoza' },
      { date: '2026-06-07', amount: 6200, products: 2, agent: 'Maria Santos' },
    ],
    stockAvailability: [
      { product: 'Beverage Pack A', stock: 45 },
      { product: 'Snack Box B', stock: 12 },
    ],
    salesPerformance: { monthlyTarget: 50000, achieved: 38200, visitsCompleted: 8, visitsPlanned: 12 },
  },
  {
    id: '2',
    clientName: 'City Convenience',
    businessName: 'City Convenience Corp',
    address: '88 Commonwealth Ave, Quezon City',
    phone: '+63 920 444 5566',
    lastPurchaseDate: '2026-06-18',
    purchaseVolume: 180,
    totalPurchaseVolume: 32100,
    distanceKm: 3.8,
    status: 'Pending',
    assignedToday: true,
    rank: 2,
    active: true,
    highValue: true,
    delinquent: false,
    lastVisitDate: '2026-06-18',
    purchaseHistory: [
      { date: '2026-06-18', amount: 9800, products: 4, agent: 'Carlos Mendoza' },
    ],
    stockAvailability: [
      { product: 'Beverage Pack A', stock: 30 },
      { product: 'Candy Mix C', stock: 8 },
    ],
    salesPerformance: { monthlyTarget: 40000, achieved: 28900, visitsCompleted: 6, visitsPlanned: 10 },
  },
  {
    id: '3',
    clientName: 'Riverside Trading',
    businessName: 'Riverside Trading Inc',
    address: '15 Ortigas Ave, Pasig',
    phone: '+63 915 777 8899',
    lastPurchaseDate: '2026-06-15',
    purchaseVolume: 120,
    totalPurchaseVolume: 22400,
    distanceKm: 5.2,
    status: 'Pending',
    assignedToday: true,
    rank: 3,
    active: true,
    highValue: false,
    delinquent: false,
    lastVisitDate: '2026-06-15',
    purchaseHistory: [],
    stockAvailability: [{ product: 'Snack Box B', stock: 20 }],
    salesPerformance: { monthlyTarget: 30000, achieved: 15600, visitsCompleted: 4, visitsPlanned: 8 },
  },
  {
    id: '4',
    clientName: 'Barangay Store',
    businessName: 'Barangay Store Co-op',
    address: '44 EDSA, Caloocan',
    phone: '+63 912 333 4455',
    lastPurchaseDate: '2026-06-10',
    purchaseVolume: 95,
    totalPurchaseVolume: 18700,
    distanceKm: 6.5,
    status: 'Rescheduled',
    assignedToday: true,
    rank: 4,
    active: true,
    highValue: false,
    delinquent: true,
    lastVisitDate: '2026-06-10',
    purchaseHistory: [],
    stockAvailability: [],
    salesPerformance: { monthlyTarget: 20000, achieved: 8200, visitsCompleted: 3, visitsPlanned: 8 },
  },
  {
    id: '5',
    clientName: 'Plaza Shop',
    businessName: 'Plaza Shop Enterprises',
    address: '9 Marikina Heights, Marikina',
    phone: '+63 928 666 7788',
    lastPurchaseDate: '2026-06-24',
    purchaseVolume: 75,
    totalPurchaseVolume: 14200,
    distanceKm: 4.4,
    status: 'Completed',
    assignedToday: true,
    rank: 5,
    active: true,
    highValue: false,
    delinquent: false,
    lastVisitDate: '2026-06-24',
    purchaseHistory: [
      { date: '2026-06-24', amount: 3800, products: 2, agent: 'Carlos Mendoza' },
    ],
    stockAvailability: [{ product: 'Beverage Pack A', stock: 15 }],
    salesPerformance: { monthlyTarget: 18000, achieved: 14200, visitsCompleted: 7, visitsPlanned: 8 },
  },
  {
    id: '6',
    clientName: 'Metro Wholesale',
    businessName: 'Metro Wholesale Ltd',
    address: '200 Shaw Blvd, Mandaluyong',
    phone: '+63 919 888 9900',
    lastPurchaseDate: '2026-05-28',
    purchaseVolume: 0,
    totalPurchaseVolume: 8900,
    distanceKm: 7.1,
    status: 'Inactive',
    assignedToday: false,
    rank: null,
    active: false,
    highValue: false,
    delinquent: false,
    lastVisitDate: '2026-05-28',
    purchaseHistory: [],
    stockAvailability: [],
    salesPerformance: { monthlyTarget: 15000, achieved: 0, visitsCompleted: 0, visitsPlanned: 4 },
  },
];

export const SCHEDULE_STOPS = CLIENTS.filter((c) => c.assignedToday).map((client, index) => ({
  ...client,
  rank: index + 1,
}));

export const PRODUCTS = [
  { id: 'p1', name: 'Beverage Pack A', sku: 'BEV-A-001', category: 'Beverages', unitPrice: 250, stock: 450, branch: 'Manila North', status: 'Sufficient', minStock: 100 },
  { id: 'p2', name: 'Snack Box B', sku: 'SNK-B-002', category: 'Snacks', unitPrice: 180, stock: 85, branch: 'Manila North', status: 'Low', minStock: 100 },
  { id: 'p3', name: 'Candy Mix C', sku: 'CND-C-003', category: 'Confectionery', unitPrice: 120, stock: 15, branch: 'Manila North', status: 'Critical', minStock: 50 },
  { id: 'p4', name: 'Instant Noodles D', sku: 'NOD-D-004', category: 'Groceries', unitPrice: 95, stock: 320, branch: 'Manila North', status: 'Sufficient', minStock: 80 },
  { id: 'p5', name: 'Household Pack E', sku: 'HH-E-005', category: 'Household', unitPrice: 420, stock: 62, branch: 'Manila North', status: 'Low', minStock: 75 },
];

export const SALES_HISTORY = [
  {
    id: 'INV-2024-0089',
    invoiceNumber: 'INV-2024-0089',
    clientName: 'Plaza Shop',
    clientId: '5',
    totalAmount: 3800,
    date: '2026-06-24',
    status: 'Confirmed',
    branch: 'Manila North Branch',
    paymentMethod: 'Cash',
    products: [
      { name: 'Beverage Pack A', quantity: 10, unitPrice: 250, lineTotal: 2500 },
      { name: 'Snack Box B', quantity: 5, unitPrice: 180, lineTotal: 900 },
    ],
    notes: 'Restock for weekend rush.',
  },
  {
    id: 'INV-2024-0088',
    invoiceNumber: 'INV-2024-0088',
    clientName: 'Corner Store Manila',
    clientId: '1',
    totalAmount: 12500,
    date: '2026-06-21',
    status: 'Confirmed',
    branch: 'Manila North Branch',
    paymentMethod: 'Bank Transfer',
    products: [
      { name: 'Beverage Pack A', quantity: 30, unitPrice: 250, lineTotal: 7500 },
      { name: 'Snack Box B', quantity: 20, unitPrice: 180, lineTotal: 3600 },
    ],
    notes: 'Monthly replenishment order.',
  },
  {
    id: 'INV-2024-0087',
    invoiceNumber: 'INV-2024-0087',
    clientName: 'City Convenience',
    clientId: '2',
    totalAmount: 9800,
    date: '2026-06-18',
    status: 'Pending Review',
    branch: 'Manila North Branch',
    paymentMethod: 'Check',
    products: [{ name: 'Instant Noodles D', quantity: 40, unitPrice: 95, lineTotal: 3800 }],
    notes: 'Partial delivery requested.',
  },
];

export const NOTIFICATIONS = [
  { id: 'sn1', type: 'stock', title: 'Low stock alert', message: 'Candy Mix C is at critical level (15 units).', time: '9:10 AM', read: false, relatedTo: '/sales/inventory/p3' },
  { id: 'sn2', type: 'schedule', title: 'Schedule change', message: 'Barangay Store visit rescheduled to 2:00 PM.', time: '8:30 AM', read: false, relatedTo: '/sales/schedule' },
  { id: 'sn3', type: 'sale', title: 'Sale confirmed', message: 'Invoice INV-2024-0089 confirmed for Plaza Shop.', time: 'Yesterday', read: true, relatedTo: '/sales/history/INV-2024-0089' },
  { id: 'sn4', type: 'assignment', title: 'New client assigned', message: 'Riverside Trading added to your territory.', time: 'Jun 23', read: true, relatedTo: '/sales/clients' },
  { id: 'sn5', type: 'ci', title: 'CI response', message: 'Credit investigation for Barangay Store approved.', time: 'Jun 22', read: true, relatedTo: '/sales/client-detail/4?from=clients' },
];

export const SALES_ANALYTICS = {
  dailyRevenue: 3800,
  weeklyRevenue: 26100,
  monthlyRevenue: 96800,
  topClients: [
    { name: 'Corner Store Manila', revenue: 38200 },
    { name: 'City Convenience', revenue: 28900 },
    { name: 'Plaza Shop', revenue: 14200 },
  ],
  topProducts: [
    { name: 'Beverage Pack A', units: 420 },
    { name: 'Snack Box B', units: 285 },
    { name: 'Instant Noodles D', units: 190 },
  ],
};

export const DASHBOARD_SUMMARY = {
  accountsToVisit: SCHEDULE_STOPS.length,
  salesLogged: 2,
  pendingVisits: SCHEDULE_STOPS.filter((c) => c.status === 'Pending' || c.status === 'Rescheduled').length,
  completedVisits: SCHEDULE_STOPS.filter((c) => c.status === 'Completed').length,
  visitProgress: Math.round((SCHEDULE_STOPS.filter((c) => c.status === 'Completed').length / SCHEDULE_STOPS.length) * 100),
};

export const LOW_STOCK_ITEMS = PRODUCTS.filter((p) => p.status === 'Low' || p.status === 'Critical');

export const OFFLINE_STATUS = {
  enabled: true,
  isOnline: true,
  lastSync: '2026-06-25 08:45 AM',
  pendingSync: 0,
  cachedSchedules: SCHEDULE_STOPS.length,
  cachedInventory: PRODUCTS.length,
};

export const AUDIT_LOGS = [
  { id: 'a1', action: 'Login', detail: 'Signed in from mobile device', timestamp: '2026-06-25 08:00 AM' },
  { id: 'a2', action: 'Sales submission', detail: 'Invoice INV-2024-0089 logged for Plaza Shop', timestamp: '2026-06-24 10:32 AM' },
  { id: 'a3', action: 'Inventory view', detail: 'Viewed inventory for Manila North Branch', timestamp: '2026-06-24 09:15 AM' },
  { id: 'a4', action: 'CI submission', detail: 'Credit investigation submitted for Barangay Store', timestamp: '2026-06-23 03:40 PM' },
  { id: 'a5', action: 'Schedule completion', detail: 'Marked Corner Store Manila visit completed', timestamp: '2026-06-21 02:20 PM' },
];

export const ROUTE_TRACKING = {
  gpsEnabled: true,
  currentLocation: '14.5995, 120.9842',
  territoryCoverage: 68,
  visitsVerified: 2,
  visitsPlanned: SCHEDULE_STOPS.length,
};

export function formatCurrency(amount) {
  return `PHP ${Number(amount).toLocaleString('en-PH')}`;
}

export function getClientById(id) {
  return CLIENTS.find((client) => client.id === String(id)) ?? null;
}

export function getProductById(id) {
  return PRODUCTS.find((product) => product.id === String(id)) ?? null;
}

export function getSaleById(id) {
  return SALES_HISTORY.find((sale) => sale.id === id || sale.invoiceNumber === id) ?? null;
}

export function getProductStock(productId) {
  return PRODUCTS.find((p) => p.id === productId)?.stock ?? 0;
}
