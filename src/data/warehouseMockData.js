export const WAREHOUSE_STAFF_PROFILE = {
  name: 'Ana Reyes',
  employeeId: 'WH-3051',
  warehouse: 'Main Distribution Center',
  branch: 'Main Branch',
  email: 'ana.reyes@corvex.ph',
  phone: '+63 917 888 7766',
  avatarInitials: 'AR',
};

export const BRANCHES = ['Main Branch', 'North Branch', 'South Branch', 'East Branch'];

export const CATEGORIES = ['Drinks', 'Snacks', 'Sweets', 'Dairy', 'Household', 'Other'];

export const PRODUCTS = [
  {
    id: 'p1',
    name: 'Beverage Pack A',
    sku: 'BEV-A-001',
    category: 'Drinks',
    description: 'Assorted beverage multipack for retail distribution.',
    stock: 450,
    branch: 'Main Branch',
    reorderPoint: 100,
    supplier: 'FreshDrinks Co.',
    unitType: 'Case',
    lastUpdated: '2026-06-25',
    status: 'Sufficient',
    barcode: '8901234567890',
    forecast: { days7: 420, days30: 380, stockoutDate: '2026-07-19', recommendedReorder: 200 },
    movementHistory: [
      { date: '2026-06-23', type: 'Sale Deduction', quantity: -22, reason: 'Sales' },
      { date: '2026-06-21', type: 'Restock', quantity: 150, reason: 'Restock received' },
      { date: '2026-06-20', type: 'Transfer Out', quantity: -20, reason: 'Transfer to North' },
    ],
  },
  {
    id: 'p2',
    name: 'Snack Box B',
    sku: 'SNK-B-002',
    category: 'Snacks',
    description: 'Mixed snack box for convenience stores.',
    stock: 85,
    branch: 'Main Branch',
    reorderPoint: 100,
    supplier: 'SnackWorld Inc.',
    unitType: 'Box',
    lastUpdated: '2026-06-25',
    status: 'Low Stock',
    barcode: '8901234567891',
    forecast: { days7: 70, days30: 55, stockoutDate: '2026-07-02', recommendedReorder: 150 },
    movementHistory: [
      { date: '2026-06-24', type: 'Sale Deduction', quantity: -15, reason: 'Sales' },
      { date: '2026-06-22', type: 'Stock Count Adjustment', quantity: -5, reason: 'Count variance' },
    ],
  },
  {
    id: 'p3',
    name: 'Candy Mix C',
    sku: 'CND-C-003',
    category: 'Sweets',
    description: 'Assorted candy mix for sari-sari stores.',
    stock: 0,
    branch: 'Main Branch',
    reorderPoint: 50,
    supplier: 'SweetSupply Ltd.',
    unitType: 'Pack',
    lastUpdated: '2026-06-23',
    status: 'Out of Stock',
    barcode: '8901234567892',
    forecast: { days7: 0, days30: 0, stockoutDate: '2026-06-23', recommendedReorder: 200 },
    movementHistory: [
      { date: '2026-06-23', type: 'Sale Deduction', quantity: -12, reason: 'Sales' },
    ],
  },
  {
    id: 'p4',
    name: 'Coffee Mix D',
    sku: 'CFD-D-004',
    category: 'Drinks',
    description: 'Instant coffee mix packs.',
    stock: 28,
    branch: 'North Branch',
    reorderPoint: 75,
    supplier: 'CoffeeDirect',
    unitType: 'Pack',
    lastUpdated: '2026-06-24',
    status: 'Critical Stock',
    barcode: '8901234567893',
    forecast: { days7: 25, days30: 18, stockoutDate: '2026-06-28', recommendedReorder: 120 },
    movementHistory: [],
  },
  {
    id: 'p5',
    name: 'Household Pack E',
    sku: 'HH-E-005',
    category: 'Household',
    description: 'Household essentials bundle.',
    stock: 320,
    branch: 'South Branch',
    reorderPoint: 80,
    supplier: 'HomeGoods Supply',
    unitType: 'Set',
    lastUpdated: '2026-06-24',
    status: 'Sufficient',
    barcode: '8901234567894',
    forecast: { days7: 310, days30: 290, stockoutDate: '2026-08-15', recommendedReorder: 100 },
    movementHistory: [],
  },
  {
    id: 'p6',
    name: 'Dairy Pack F',
    sku: 'DRY-F-006',
    category: 'Dairy',
    description: 'Refrigerated dairy product pack.',
    stock: 95,
    branch: 'Main Branch',
    reorderPoint: 60,
    supplier: 'DairyFresh',
    unitType: 'Case',
    lastUpdated: '2026-06-25',
    status: 'Sufficient',
    barcode: '8901234567895',
    forecast: { days7: 88, days30: 72, stockoutDate: '2026-07-10', recommendedReorder: 80 },
    movementHistory: [],
  },
];

export const STOCK_MOVEMENTS = [
  { id: 'MOV-1042', productId: 'p1', productName: 'Beverage Pack A', quantity: -22, type: 'Sale Deduction', branch: 'Main Branch', date: '2026-06-23', notes: 'Daily sales deduction' },
  { id: 'MOV-1041', productId: 'p1', productName: 'Beverage Pack A', quantity: 150, type: 'Restock', branch: 'Main Branch', date: '2026-06-21', notes: 'Supplier delivery RST-8821' },
  { id: 'MOV-1040', productId: 'p1', productName: 'Beverage Pack A', quantity: -20, type: 'Transfer Out', branch: 'Main Branch', date: '2026-06-20', notes: 'Transfer to North Branch' },
  { id: 'MOV-1039', productId: 'p2', productName: 'Snack Box B', quantity: -5, type: 'Stock Count Adjustment', branch: 'Main Branch', date: '2026-06-22', notes: 'Physical count variance' },
  { id: 'MOV-1038', productId: 'p4', productName: 'Coffee Mix D', quantity: 50, type: 'Transfer In', branch: 'North Branch', date: '2026-06-19', notes: 'Received from Main Branch' },
  { id: 'MOV-1037', productId: 'p3', productName: 'Candy Mix C', quantity: -12, type: 'Sale Deduction', branch: 'Main Branch', date: '2026-06-23', notes: 'Sales order' },
];

export const TRANSFERS = [
  { id: 'TRF-301', productId: 'p1', productName: 'Beverage Pack A', quantity: 50, sourceBranch: 'Main Branch', destinationBranch: 'North Branch', status: 'Pending Approval', submittedBy: 'Ana Reyes', submittedDate: '2026-06-25', approvalInfo: null, notes: 'North branch low stock' },
  { id: 'TRF-300', productId: 'p2', productName: 'Snack Box B', quantity: 30, sourceBranch: 'Main Branch', destinationBranch: 'South Branch', status: 'Approved', submittedBy: 'Ana Reyes', submittedDate: '2026-06-24', approvalInfo: 'Approved by Branch Manager', notes: 'Weekly replenishment' },
  { id: 'TRF-299', productId: 'p1', productName: 'Beverage Pack A', quantity: 20, sourceBranch: 'Main Branch', destinationBranch: 'North Branch', status: 'Completed', submittedBy: 'Ana Reyes', submittedDate: '2026-06-20', approvalInfo: 'Completed by receiving branch', notes: 'Routine transfer' },
  { id: 'TRF-298', productId: 'p5', productName: 'Household Pack E', quantity: 15, sourceBranch: 'South Branch', destinationBranch: 'East Branch', status: 'Rejected', submittedBy: 'Ana Reyes', submittedDate: '2026-06-18', approvalInfo: 'Rejected: insufficient stock at source', notes: 'Cancelled request' },
  { id: 'TRF-297', productId: 'p6', productName: 'Dairy Pack F', quantity: 25, sourceBranch: 'Main Branch', destinationBranch: 'North Branch', status: 'Submitted', submittedBy: 'Ana Reyes', submittedDate: '2026-06-25', approvalInfo: null, notes: 'Awaiting review' },
];

export const RESTOCK_RECORDS = [
  { id: 'RST-8821', productId: 'p1', productName: 'Beverage Pack A', supplier: 'FreshDrinks Co.', quantity: 150, dateReceived: '2026-06-21', deliveryRef: 'DEL-4421', branch: 'Main Branch' },
  { id: 'RST-8819', productId: 'p2', productName: 'Snack Box B', supplier: 'SnackWorld Inc.', quantity: 100, dateReceived: '2026-06-18', deliveryRef: 'DEL-4398', branch: 'Main Branch' },
  { id: 'RST-8815', productId: 'p6', productName: 'Dairy Pack F', supplier: 'DairyFresh', quantity: 80, dateReceived: '2026-06-15', deliveryRef: 'DEL-4355', branch: 'Main Branch' },
  { id: 'RST-8810', productId: 'p5', productName: 'Household Pack E', supplier: 'HomeGoods Supply', quantity: 60, dateReceived: '2026-06-12', deliveryRef: 'DEL-4310', branch: 'South Branch' },
];

export const NOTIFICATIONS = [
  { id: 'wn1', type: 'critical', title: 'Critical stock alert', message: 'Coffee Mix D at North Branch is critically low (28 units).', time: '9:30 AM', read: false, relatedTo: '/warehouse/product/p4' },
  { id: 'wn2', type: 'low', title: 'Low stock alert', message: 'Snack Box B below reorder point at Main Branch.', time: '9:15 AM', read: false, relatedTo: '/warehouse/product/p2' },
  { id: 'wn3', type: 'transfer', title: 'Transfer approval required', message: 'Transfer TRF-301 pending approval.', time: '8:45 AM', read: false, relatedTo: '/warehouse/transfers/TRF-301' },
  { id: 'wn4', type: 'transfer', title: 'Transfer rejected', message: 'Transfer TRF-298 was rejected by branch manager.', time: 'Yesterday', read: true, relatedTo: '/warehouse/transfers/TRF-298' },
  { id: 'wn5', type: 'restock', title: 'Restock confirmed', message: 'Restock RST-8821 for Beverage Pack A recorded.', time: 'Jun 21', read: true, relatedTo: '/warehouse/restock-history/RST-8821' },
  { id: 'wn6', type: 'forecast', title: 'Forecast warning', message: 'Candy Mix C predicted stockout — reorder recommended.', time: 'Jun 23', read: true, relatedTo: '/warehouse/product/p3' },
];

export const DASHBOARD_SUMMARY = {
  totalProducts: PRODUCTS.length,
  lowStockAlerts: PRODUCTS.filter((p) => p.status === 'Low Stock' || p.status === 'Critical Stock').length,
  pendingRestocks: 3,
  movementsToday: STOCK_MOVEMENTS.filter((m) => m.date === '2026-06-25').length || 4,
};

export const TOP_MOVING_PRODUCTS = [
  { name: 'Beverage Pack A', movements: 42 },
  { name: 'Snack Box B', movements: 28 },
  { name: 'Coffee Mix D', movements: 19 },
];

export const INVENTORY_HEALTH = {
  sufficient: PRODUCTS.filter((p) => p.status === 'Sufficient').length,
  low: PRODUCTS.filter((p) => p.status === 'Low Stock').length,
  critical: PRODUCTS.filter((p) => p.status === 'Critical Stock').length,
  outOfStock: PRODUCTS.filter((p) => p.status === 'Out of Stock').length,
};

export const AUDIT_LOGS = [
  { id: 'wa1', action: 'Product creation', detail: 'Created Dairy Pack F (DRY-F-006)', timestamp: '2026-06-10 10:00 AM' },
  { id: 'wa2', action: 'Stock adjustment', detail: 'Stock count adjustment for Snack Box B (-5 units)', timestamp: '2026-06-22 02:15 PM' },
  { id: 'wa3', action: 'Restock', detail: 'Restock RST-8821 recorded for Beverage Pack A', timestamp: '2026-06-21 09:30 AM' },
  { id: 'wa4', action: 'Transfer', detail: 'Transfer TRF-299 completed to North Branch', timestamp: '2026-06-20 04:00 PM' },
  { id: 'wa5', action: 'Product update', detail: 'Updated reorder point for Coffee Mix D', timestamp: '2026-06-19 11:20 AM' },
];

export const EXISTING_SKUS = PRODUCTS.map((p) => p.sku);

export function getProductById(id) {
  return PRODUCTS.find((p) => p.id === String(id)) ?? null;
}

export function getMovementById(id) {
  return STOCK_MOVEMENTS.find((m) => m.id === id) ?? null;
}

export function getTransferById(id) {
  return TRANSFERS.find((t) => t.id === id) ?? null;
}

export function getRestockById(id) {
  return RESTOCK_RECORDS.find((r) => r.id === id) ?? null;
}

export function getStockStatus(stock, reorderPoint) {
  if (stock <= 0) return 'Out of Stock';
  if (stock <= reorderPoint * 0.3) return 'Critical Stock';
  if (stock <= reorderPoint) return 'Low Stock';
  return 'Sufficient';
}
