// Furniture retail — Davao City branch sales agent

export const SALES_AGENT_PROFILE = {
  name: 'Carlos Mendoza',
  employeeId: 'SA-1087',
  branch: 'Davao City Branch',
  email: 'carlos.mendoza@corvex.ph',
  phone: '+63 918 222 3344',
  avatarInitials: 'CM',
};

export const CUSTOMERS = [
  {
    id: '1',
    first_name: 'Juan',
    last_name: 'Dela Cruz',
    contact_person_fname: 'Maria',
    contact_person_lname: 'Santos',
    address: '120 Pioneer Ave, Davao City City',
    phone: '+63 917 111 2233',
    lastVisitDate: '2026-06-21',
    purchaseVolume: 18,
    totalPurchaseVolume: 842000,
    distanceKm: 2.1,
    status: 'Active',
    assignedToday: true,
    rank: 1,
    active: true,
    highValue: true,
    delinquent: false,
    lastPurchaseDate: '2026-06-21',
    paymentHistory: [
      { payment_id: 'pay-1', payment_date: '2026-06-21', amount: 128000, collector_name: 'Carlos Mendoza', payment_method: 'Bank Transfer' },
      { payment_id: 'pay-2', payment_date: '2026-06-14', amount: 95000, collector_name: 'Carlos Mendoza', payment_method: 'Cash' },
      { payment_id: 'pay-3', payment_date: '2026-06-07', amount: 76000, collector_name: 'Maria Santos', payment_method: 'Cash' },
    ],
    account_number: 'ACC-001',
    business_type: 'Retail',
    credit_limit: 500000,
    outstanding_balance: 0,
    days_overdue: 0,
  },
  {
    id: '2',
    first_name: 'Pedro',
    last_name: 'Penduko',
    contact_person_fname: 'Jose',
    contact_person_lname: 'Rizal',
    address: '88 Santiago Blvd, Davao City City',
    phone: '+63 920 444 5566',
    lastVisitDate: '2026-06-18',
    purchaseVolume: 12,
    totalPurchaseVolume: 620000,
    distanceKm: 3.8,
    status: 'Active',
    assignedToday: true,
    rank: 2,
    active: true,
    highValue: true,
    delinquent: false,
    lastPurchaseDate: '2026-06-18',
    paymentHistory: [
      { payment_id: 'pay-4', payment_date: '2026-06-18', amount: 86000, collector_name: 'Carlos Mendoza', payment_method: 'Check' },
    ],
    account_number: 'ACC-002',
    business_type: 'Wholesale',
    credit_limit: 300000,
    outstanding_balance: 0,
    days_overdue: 0,
  },
  {
    id: '3',
    first_name: 'Andres',
    last_name: 'Bonifacio',
    contact_person_fname: 'Emilio',
    contact_person_lname: 'Aguinaldo',
    address: '15 City Heights Drive, Davao City City',
    phone: '+63 915 777 8899',
    lastVisitDate: '2026-06-15',
    purchaseVolume: 9,
    totalPurchaseVolume: 415000,
    distanceKm: 5.2,
    status: 'Active',
    assignedToday: true,
    rank: 3,
    active: true,
    highValue: false,
    delinquent: false,
    lastPurchaseDate: '2026-06-15',
    paymentHistory: [],
    account_number: 'ACC-003',
    business_type: 'Retail',
    credit_limit: 200000,
    outstanding_balance: 0,
    days_overdue: 0,
  },
  {
    id: '4',
    first_name: 'Apolinario',
    last_name: 'Mabini',
    contact_person_fname: 'Antonio',
    contact_person_lname: 'Luna',
    address: '44 Davao City Drive, Davao City City',
    phone: '+63 912 333 4455',
    lastVisitDate: '2026-06-10',
    purchaseVolume: 7,
    totalPurchaseVolume: 298000,
    distanceKm: 6.5,
    status: 'Active',
    assignedToday: true,
    rank: 4,
    active: true,
    highValue: false,
    delinquent: true,
    lastPurchaseDate: '2026-06-10',
    paymentHistory: [],
    account_number: 'ACC-004',
    business_type: 'Wholesale',
    credit_limit: 150000,
    outstanding_balance: 45000,
    days_overdue: 15,
  },
  {
    id: '5',
    first_name: 'Gabriela',
    last_name: 'Silang',
    contact_person_fname: 'Melchora',
    contact_person_lname: 'Aquino',
    address: '9 Bulaong Extension, Davao City City',
    phone: '+63 928 666 7788',
    lastVisitDate: '2026-06-24',
    purchaseVolume: 6,
    totalPurchaseVolume: 182000,
    distanceKm: 4.4,
    status: 'Active',
    assignedToday: true,
    rank: 5,
    active: true,
    highValue: false,
    delinquent: false,
    lastPurchaseDate: '2026-06-24',
    paymentHistory: [
      { payment_id: 'pay-5', payment_date: '2026-06-24', amount: 48000, collector_name: 'Carlos Mendoza', payment_method: 'Cash' },
    ],
    account_number: 'ACC-005',
    business_type: 'Retail',
    credit_limit: 100000,
    outstanding_balance: 0,
    days_overdue: 0,
  },
  {
    id: '6',
    first_name: 'Lapu',
    last_name: 'Lapu',
    contact_person_fname: 'Raha',
    contact_person_lname: 'Sulayman',
    address: '200 Makar Rd, Davao City City',
    phone: '+63 919 888 9900',
    lastVisitDate: '2026-05-28',
    purchaseVolume: 0,
    totalPurchaseVolume: 94000,
    distanceKm: 7.1,
    status: 'Inactive',
    assignedToday: false,
    rank: null,
    active: false,
    highValue: false,
    delinquent: false,
    lastPurchaseDate: '2026-05-28',
    paymentHistory: [],
    account_number: 'ACC-006',
    business_type: 'Retail',
    credit_limit: 100000,
    outstanding_balance: 0,
    days_overdue: 0,
  },
];

// SAW (Simple Additive Weighting) scoring for sales visit prioritization
// Criteria: total purchase volume (weight 0.40), delinquency risk (weight 0.35), distance km (weight 0.25)
// Delinquent customers are flagged as high priority; higher score = visit first
function computeSAWScore(customer) {
  const maxVolume   = 842000;
  const maxDistance = 7.1;
  const normVolume    = maxVolume   > 0 ? customer.totalPurchaseVolume / maxVolume              : 0;
  const normDelinquent = customer.delinquent ? 1 : (customer.highValue ? 0.6 : 0.2);
  // Closer is better — invert distance
  const normDistance  = maxDistance > 0 ? 1 - (customer.distanceKm / maxDistance)               : 0;
  return (normVolume * 0.40) + (normDelinquent * 0.35) + (normDistance * 0.25);
}

export const SCHEDULE_STOPS = CUSTOMERS
  .filter((c) => c.assignedToday)
  .map((customer) => ({ ...customer, sawScore: computeSAWScore(customer) }))
  .sort((a, b) => b.sawScore - a.sawScore)
  .map((customer, index) => ({ ...customer, rank: index + 1 }));

export const PRODUCTS = [
  { id: 'p1', name: 'L-Shape Sofa (Gray)',          sku: 'SOF-LSH-001', category: 'Sofas',           unitPrice: 28500, stock: 14, branch: 'Davao City', status: 'Sufficient', minStock: 5 },
  { id: 'p2', name: '6-Seater Dining Set (Mahogany)',sku: 'DNG-6ST-002', category: 'Dining Tables',   unitPrice: 42000, stock: 3,  branch: 'Davao City', status: 'Low',        minStock: 5 },
  { id: 'p3', name: 'Office Chair (Ergonomic)',      sku: 'CHR-ERG-003', category: 'Office Chairs',   unitPrice: 8500,  stock: 0,  branch: 'Davao City', status: 'Critical',   minStock: 10 },
  { id: 'p4', name: 'Queen Bed Frame (Walnut)',       sku: 'BED-QWN-004', category: 'Beds',            unitPrice: 22000, stock: 8,  branch: 'Davao City', status: 'Sufficient', minStock: 4 },
  { id: 'p5', name: 'Wardrobe 3-Door (White)',        sku: 'WRD-3DW-005', category: 'Wardrobes',       unitPrice: 18500, stock: 6,  branch: 'Davao City', status: 'Sufficient', minStock: 3 },
];

export const SALES_HISTORY = [
  {
    id: 'INV-2024-0089',
    invoiceNumber: 'INV-2024-0089',
    customerName: 'Casa Elegante GenSan',
    customerId: '5',
    totalAmount: 48000,
    date: '2026-06-24',
    status: 'Confirmed',
    branch: 'Davao City Branch',
    paymentMethod: 'Cash',
    products: [
      { name: 'Coffee Table (Tempered Glass)', quantity: 4, unitPrice: 7500,  lineTotal: 30000 },
      { name: 'TV Stand (Modern Oak)',          quantity: 3, unitPrice: 6000,  lineTotal: 18000 },
    ],
    notes: 'Display replenishment order.',
  },
  {
    id: 'INV-2024-0088',
    invoiceNumber: 'INV-2024-0088',
    first_name: 'Juan', last_name: 'Dela Cruz',
    customerId: '1',
    totalAmount: 128000,
    date: '2026-06-21',
    status: 'Confirmed',
    branch: 'Davao City Branch',
    paymentMethod: 'Bank Transfer',
    products: [
      { name: 'L-Shape Sofa (Gray)',          quantity: 3, unitPrice: 28500, lineTotal: 85500 },
      { name: 'Office Chair (Ergonomic)',      quantity: 5, unitPrice: 8500,  lineTotal: 42500 },
    ],
    notes: 'Monthly showroom restock.',
  },
  {
    id: 'INV-2024-0087',
    invoiceNumber: 'INV-2024-0087',
    first_name: 'Pedro', last_name: 'Penduko',
    customerId: '2',
    totalAmount: 86000,
    date: '2026-06-18',
    status: 'Pending Review',
    branch: 'Davao City Branch',
    paymentMethod: 'Check',
    products: [
      { name: '6-Seater Dining Set (Mahogany)', quantity: 2, unitPrice: 42000, lineTotal: 84000 },
    ],
    notes: 'Partial delivery requested.',
  },
];

export const NOTIFICATIONS = [
  { id: 'sn1', type: 'stock',    title: 'Zero stock alert',    message: 'Office Chair (Ergonomic) is out of stock at Davao City branch.', time: '9:10 AM', read: false, relatedTo: '/sales/inventory/p3' },
  { id: 'sn2', type: 'schedule', title: 'Schedule change',     message: 'Abode Furniture Warehouse visit rescheduled to 2:00 PM.',           time: '8:30 AM', read: false, relatedTo: '/sales/schedule' },
  { id: 'sn3', type: 'sale',     title: 'Sale confirmed',       message: 'Invoice INV-2024-0089 confirmed for Casa Elegante GenSan.',         time: 'Yesterday',read: true,  relatedTo: '/sales/history' },
  { id: 'sn4', type: 'assignment',title: 'New customer assigned', message: 'Living Space Interiors added to your territory.',                   time: 'Jun 23',  read: true,  relatedTo: '/sales/customers' },
  { id: 'sn5', type: 'ci',       title: 'CI response',         message: 'Credit investigation for Abode Furniture approved.',               time: 'Jun 22',  read: true,  relatedTo: '/sales/customer-detail/4?from=customers' },
];

export const SALES_ANALYTICS = {
  dailyRevenue: 48000,
  weeklyRevenue: 312000,
  monthlyRevenue: 1051000,
  topCustomers: [
    { name: 'Furniture Plus GenSan',        revenue: 382000 },
    { name: 'Home Essentials SoCCSKSargen', revenue: 289000 },
    { name: 'Casa Elegante GenSan',         revenue: 142000 },
  ],
  topProducts: [
    { name: 'L-Shape Sofa (Gray)',           units: 22 },
    { name: '6-Seater Dining Set (Mahogany)',units: 14 },
    { name: 'Office Chair (Ergonomic)',       units: 38 },
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
  { id: 'a1', action: 'Login',                detail: 'Signed in from mobile device',                          timestamp: '2026-06-25 08:00 AM' },
  { id: 'a2', action: 'Sales submission',      detail: 'Invoice INV-2024-0089 logged for Casa Elegante GenSan', timestamp: '2026-06-24 10:32 AM' },
  { id: 'a3', action: 'Inventory view',        detail: 'Viewed inventory for Davao City Branch',            timestamp: '2026-06-24 09:15 AM' },
  { id: 'a4', action: 'CI submission',         detail: 'Credit investigation submitted for Abode Furniture',   timestamp: '2026-06-23 03:40 PM' },
  { id: 'a5', action: 'Schedule completion',   detail: 'Marked Furniture Plus GenSan visit completed',         timestamp: '2026-06-21 02:20 PM' },
];

export const ROUTE_TRACKING = {
  gpsEnabled: true,
  currentLocation: '6.1164, 125.1716',
  territoryCoverage: 68,
  visitsVerified: 2,
  visitsPlanned: SCHEDULE_STOPS.length,
};

export { formatCurrency, formatDisplayDate, formatDisplayDateTime } from '../utils/formatters.js';

export function getCustomerById(id) { return CUSTOMERS.find((c) => c.id === String(id)) ?? null; }
export function getProductById(id) { return PRODUCTS.find((p) => p.id === String(id)) ?? null; }
export function getSaleById(id) { return SALES_HISTORY.find((s) => s.id === id || s.invoiceNumber === id) ?? null; }
export function getProductStock(productId) { return PRODUCTS.find((p) => p.id === productId)?.stock ?? 0; }
