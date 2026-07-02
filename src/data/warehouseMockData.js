// Furniture retail — Davao Oriental branch warehouse

export const WAREHOUSE_STAFF_PROFILE = {
  name: 'Ana Reyes',
  employeeId: 'WH-3051',
  warehouse: 'Davao Oriental Distribution Center',
  branch: 'Davao Oriental Branch',
  email: 'ana.reyes@corvex.ph',
  phone: '+63 917 888 7766',
  avatarInitials: 'AR',
};

export const BRANCHES = ['Davao City Branch', 'General Santos Branch', 'Davao Oriental Branch'];

export const CATEGORIES = ['Sofas', 'Dining Tables', 'Office Chairs', 'Beds', 'Wardrobes', 'Cabinets', 'Coffee Tables', 'TV Stands', 'Bookshelves', 'Mattresses', 'Desks', 'Outdoor Furniture'];

export const PRODUCTS = [
  {
    id: 'p1',
    name: '3-Seater Fabric Sofa (Beige)',
    sku: 'SOF-3FB-001',
    category: 'Sofas',
    description: 'Modern 3-seater fabric sofa, beige upholstery, solid wood legs.',
    stock: 22,
    branch: 'Davao Oriental Branch',
    reorderPoint: 8,
    supplier: 'PhilFurniture Manufacturing',
    unitType: 'Unit',
    lastUpdated: '2026-06-25',
    status: 'Sufficient',
    barcode: '8901234500001',
    forecast: { days7: 20, days30: 16, stockoutDate: '2026-08-10', recommendedReorder: 10 },
    movementHistory: [
      { date: '2026-06-23', type: 'Sale Deduction', quantity: -2, reason: 'Sales order' },
      { date: '2026-06-20', type: 'Restock',        quantity: 10, reason: 'Supplier delivery' },
      { date: '2026-06-18', type: 'Transfer Out',   quantity: -3, reason: 'Transfer to Davao City' },
    ],
  },
  {
    id: 'p2',
    name: '6-Seater Dining Table Set (Narra)',
    sku: 'DNG-6NT-002',
    category: 'Dining Tables',
    description: 'Solid Narra wood 6-seater dining table with matching chairs.',
    stock: 5,
    branch: 'Davao Oriental Branch',
    reorderPoint: 6,
    supplier: 'Mindanao Wood Crafts',
    unitType: 'Set',
    lastUpdated: '2026-06-25',
    status: 'Low Stock',
    barcode: '8901234500002',
    forecast: { days7: 4, days30: 2, stockoutDate: '2026-07-05', recommendedReorder: 8 },
    movementHistory: [
      { date: '2026-06-24', type: 'Sale Deduction', quantity: -1, reason: 'Sales' },
      { date: '2026-06-22', type: 'Stock Count Adjustment', quantity: -1, reason: 'Count variance' },
    ],
  },
  {
    id: 'p3',
    name: 'Ergonomic Office Chair (Black Mesh)',
    sku: 'CHR-EOB-003',
    category: 'Office Chairs',
    description: 'Adjustable ergonomic office chair with lumbar support and mesh back.',
    stock: 0,
    branch: 'Davao Oriental Branch',
    reorderPoint: 10,
    supplier: 'ErgoCraft Philippines',
    unitType: 'Unit',
    lastUpdated: '2026-06-23',
    status: 'Out of Stock',
    barcode: '8901234500003',
    forecast: { days7: 0, days30: 0, stockoutDate: '2026-06-23', recommendedReorder: 15 },
    movementHistory: [
      { date: '2026-06-23', type: 'Sale Deduction', quantity: -4, reason: 'Sales' },
    ],
  },
  {
    id: 'p4',
    name: 'Queen Size Bed Frame (Walnut Veneer)',
    sku: 'BED-QWV-004',
    category: 'Beds',
    description: 'Queen bed frame with walnut veneer finish and under-bed storage.',
    stock: 4,
    branch: 'General Santos Branch',
    reorderPoint: 5,
    supplier: 'PhilFurniture Manufacturing',
    unitType: 'Unit',
    lastUpdated: '2026-06-24',
    status: 'Critical Stock',
    barcode: '8901234500004',
    forecast: { days7: 3, days30: 1, stockoutDate: '2026-07-02', recommendedReorder: 8 },
    movementHistory: [],
  },
  {
    id: 'p5',
    name: '3-Door Wardrobe (White Gloss)',
    sku: 'WRD-3DG-005',
    category: 'Wardrobes',
    description: '3-door sliding wardrobe with white gloss finish and mirror panel.',
    stock: 18,
    branch: 'Davao City Branch',
    reorderPoint: 6,
    supplier: 'KabinetPro Davao',
    unitType: 'Unit',
    lastUpdated: '2026-06-24',
    status: 'Sufficient',
    barcode: '8901234500005',
    forecast: { days7: 17, days30: 14, stockoutDate: '2026-08-20', recommendedReorder: 6 },
    movementHistory: [],
  },
  {
    id: 'p6',
    name: 'Coffee Table (Tempered Glass & Steel)',
    sku: 'CTB-TGS-006',
    category: 'Coffee Tables',
    description: 'Modern coffee table with tempered glass top and stainless steel frame.',
    stock: 30,
    branch: 'Davao Oriental Branch',
    reorderPoint: 8,
    supplier: 'Glasscraft Furniture',
    unitType: 'Unit',
    lastUpdated: '2026-06-25',
    status: 'Sufficient',
    barcode: '8901234500006',
    forecast: { days7: 28, days30: 24, stockoutDate: '2026-09-01', recommendedReorder: 10 },
    movementHistory: [],
  },
  {
    id: 'p7',
    name: 'TV Stand with Cabinet (Oak)',
    sku: 'TVS-CAB-007',
    category: 'TV Stands',
    description: 'Oak finish TV stand with 2-door cabinet and open shelves.',
    stock: 12,
    branch: 'Davao City Branch',
    reorderPoint: 5,
    supplier: 'KabinetPro Davao',
    unitType: 'Unit',
    lastUpdated: '2026-06-24',
    status: 'Sufficient',
    barcode: '8901234500007',
    forecast: { days7: 11, days30: 9, stockoutDate: '2026-08-05', recommendedReorder: 6 },
    movementHistory: [],
  },
  {
    id: 'p8',
    name: '5-Shelf Bookcase (Natural Wood)',
    sku: 'BSH-5NW-008',
    category: 'Bookshelves',
    description: 'Freestanding 5-shelf bookcase in natural wood finish.',
    stock: 9,
    branch: 'General Santos Branch',
    reorderPoint: 6,
    supplier: 'Mindanao Wood Crafts',
    unitType: 'Unit',
    lastUpdated: '2026-06-24',
    status: 'Sufficient',
    barcode: '8901234500008',
    forecast: { days7: 8, days30: 6, stockoutDate: '2026-08-15', recommendedReorder: 8 },
    movementHistory: [],
  },
  {
    id: 'p9',
    name: 'Orthopedic Queen Mattress (8-inch)',
    sku: 'MAT-OQ8-009',
    category: 'Mattresses',
    description: 'High-density foam orthopedic queen mattress, 8-inch profile.',
    stock: 7,
    branch: 'Davao Oriental Branch',
    reorderPoint: 5,
    supplier: 'SleepWell PH',
    unitType: 'Unit',
    lastUpdated: '2026-06-23',
    status: 'Sufficient',
    barcode: '8901234500009',
    forecast: { days7: 6, days30: 4, stockoutDate: '2026-07-20', recommendedReorder: 6 },
    movementHistory: [],
  },
  {
    id: 'p10',
    name: 'L-Shape Study Desk (White)',
    sku: 'DSK-LWH-010',
    category: 'Desks',
    description: 'L-shaped study desk with side cabinet and cable management.',
    stock: 3,
    branch: 'Davao City Branch',
    reorderPoint: 5,
    supplier: 'ErgoCraft Philippines',
    unitType: 'Unit',
    lastUpdated: '2026-06-24',
    status: 'Critical Stock',
    barcode: '8901234500010',
    forecast: { days7: 2, days30: 0, stockoutDate: '2026-07-03', recommendedReorder: 8 },
    movementHistory: [],
  },
  {
    id: 'p11',
    name: 'Outdoor Rattan Set (4-pc)',
    sku: 'OUT-RT4-011',
    category: 'Outdoor Furniture',
    description: '4-piece outdoor rattan set: 2 chairs, 1 sofa, 1 coffee table.',
    stock: 6,
    branch: 'General Santos Branch',
    reorderPoint: 4,
    supplier: 'Davao Rattan Exports',
    unitType: 'Set',
    lastUpdated: '2026-06-25',
    status: 'Sufficient',
    barcode: '8901234500011',
    forecast: { days7: 5, days30: 4, stockoutDate: '2026-08-12', recommendedReorder: 5 },
    movementHistory: [],
  },
  {
    id: 'p12',
    name: '4-Door Storage Cabinet (Melamine)',
    sku: 'CAB-4ML-012',
    category: 'Cabinets',
    description: '4-door melamine storage cabinet with adjustable shelves.',
    stock: 14,
    branch: 'Davao Oriental Branch',
    reorderPoint: 6,
    supplier: 'KabinetPro Davao',
    unitType: 'Unit',
    lastUpdated: '2026-06-25',
    status: 'Sufficient',
    barcode: '8901234500012',
    forecast: { days7: 13, days30: 11, stockoutDate: '2026-08-25', recommendedReorder: 8 },
    movementHistory: [],
  },
];

export const STOCK_MOVEMENTS = [
  { id: 'MOV-1042', productId: 'p1', productName: '3-Seater Fabric Sofa (Beige)',         quantity: -2, type: 'Sale Deduction', branch: 'Davao Oriental Branch', date: '2026-06-23', notes: 'Sales order SO-4421' },
  { id: 'MOV-1041', productId: 'p1', productName: '3-Seater Fabric Sofa (Beige)',         quantity: 10, type: 'Restock',        branch: 'Davao Oriental Branch', date: '2026-06-20', notes: 'Supplier delivery RST-8821' },
  { id: 'MOV-1040', productId: 'p1', productName: '3-Seater Fabric Sofa (Beige)',         quantity: -3, type: 'Transfer Out',   branch: 'Davao Oriental Branch', date: '2026-06-18', notes: 'Transfer to Davao City Branch' },
  { id: 'MOV-1039', productId: 'p2', productName: '6-Seater Dining Table Set (Narra)',    quantity: -1, type: 'Stock Count Adjustment', branch: 'Davao Oriental Branch', date: '2026-06-22', notes: 'Physical count variance' },
  { id: 'MOV-1038', productId: 'p4', productName: 'Queen Size Bed Frame (Walnut Veneer)', quantity: 4,  type: 'Transfer In',   branch: 'General Santos Branch',  date: '2026-06-19', notes: 'Received from Davao Oriental' },
  { id: 'MOV-1037', productId: 'p3', productName: 'Ergonomic Office Chair (Black Mesh)',  quantity: -4, type: 'Sale Deduction', branch: 'Davao Oriental Branch', date: '2026-06-23', notes: 'Bulk office order' },
];

export const TRANSFERS = [
  { id: 'TRF-301', productId: 'p1', productName: '3-Seater Fabric Sofa (Beige)',         quantity: 4, sourceBranch: 'Davao Oriental Branch', destinationBranch: 'Davao City Branch',    status: 'Pending Approval', submittedBy: 'Ana Reyes', submittedDate: '2026-06-25', approvalInfo: null,                             notes: 'Davao City showroom restock' },
  { id: 'TRF-300', productId: 'p2', productName: '6-Seater Dining Table Set (Narra)',    quantity: 2, sourceBranch: 'Davao Oriental Branch', destinationBranch: 'General Santos Branch',status: 'Approved',          submittedBy: 'Ana Reyes', submittedDate: '2026-06-24', approvalInfo: 'Approved by Operating Manager', notes: 'Branch showroom replenishment' },
  { id: 'TRF-299', productId: 'p1', productName: '3-Seater Fabric Sofa (Beige)',         quantity: 3, sourceBranch: 'Davao Oriental Branch', destinationBranch: 'Davao City Branch',    status: 'Completed',         submittedBy: 'Ana Reyes', submittedDate: '2026-06-18', approvalInfo: 'Completed by receiving branch', notes: 'Routine stock rebalancing' },
  { id: 'TRF-298', productId: 'p5', productName: '3-Door Wardrobe (White Gloss)',         quantity: 3, sourceBranch: 'Davao City Branch',    destinationBranch: 'General Santos Branch',status: 'Rejected',          submittedBy: 'Ana Reyes', submittedDate: '2026-06-18', approvalInfo: 'Rejected: insufficient stock',  notes: 'Cancelled' },
  { id: 'TRF-297', productId: 'p6', productName: 'Coffee Table (Tempered Glass & Steel)', quantity: 5, sourceBranch: 'Davao Oriental Branch', destinationBranch: 'General Santos Branch',status: 'Submitted',         submittedBy: 'Ana Reyes', submittedDate: '2026-06-25', approvalInfo: null,                             notes: 'Awaiting review' },
];

export const RESTOCK_RECORDS = [
  { id: 'RST-8821', productId: 'p1', productName: '3-Seater Fabric Sofa (Beige)',         supplier: 'PhilFurniture Manufacturing', quantity: 10, dateReceived: '2026-06-20', deliveryRef: 'DEL-4421', branch: 'Davao Oriental Branch' },
  { id: 'RST-8819', productId: 'p2', productName: '6-Seater Dining Table Set (Narra)',    supplier: 'Mindanao Wood Crafts',        quantity: 6,  dateReceived: '2026-06-18', deliveryRef: 'DEL-4398', branch: 'Davao Oriental Branch' },
  { id: 'RST-8815', productId: 'p6', productName: 'Coffee Table (Tempered Glass & Steel)',supplier: 'Glasscraft Furniture',        quantity: 12, dateReceived: '2026-06-15', deliveryRef: 'DEL-4355', branch: 'Davao Oriental Branch' },
  { id: 'RST-8810', productId: 'p5', productName: '3-Door Wardrobe (White Gloss)',         supplier: 'KabinetPro Davao',           quantity: 8,  dateReceived: '2026-06-12', deliveryRef: 'DEL-4310', branch: 'Davao City Branch' },
];

export const NOTIFICATIONS = [
  { id: 'wn1', type: 'critical', title: 'Critical stock alert',         message: 'Queen Size Bed Frame (Walnut Veneer) at General Santos Branch is critically low (4 units).', time: '9:30 AM',   read: false, relatedTo: '/warehouse/product/p4' },
  { id: 'wn2', type: 'low',      title: 'Low stock alert',              message: '6-Seater Dining Table Set (Narra) below reorder point at Davao Oriental Branch.',             time: '9:15 AM',   read: false, relatedTo: '/warehouse/product/p2' },
  { id: 'wn3', type: 'transfer', title: 'Transfer approval required',   message: 'Transfer TRF-301 (Sofa x4 to Davao City) pending approval.',                                  time: '8:45 AM',   read: false, relatedTo: '/warehouse/transfers/TRF-301' },
  { id: 'wn4', type: 'transfer', title: 'Transfer rejected',            message: 'Transfer TRF-298 (Wardrobe to GenSan) was rejected — insufficient stock.',                    time: 'Yesterday', read: true,  relatedTo: '/warehouse/transfers/TRF-298' },
  { id: 'wn5', type: 'restock',  title: 'Restock confirmed',            message: 'Restock RST-8821 for 3-Seater Fabric Sofa recorded (10 units).',                             time: 'Jun 20',    read: true,  relatedTo: '/warehouse/restock-history/RST-8821' },
  { id: 'wn6', type: 'forecast', title: 'Forecast stockout warning',    message: 'Ergonomic Office Chair predicted stockout — reorder 15 units recommended.',                  time: 'Jun 23',    read: true,  relatedTo: '/warehouse/product/p3' },
];

export const DASHBOARD_SUMMARY = {
  totalProducts: PRODUCTS.length,
  lowStockAlerts: PRODUCTS.filter((p) => p.status === 'Low Stock' || p.status === 'Critical Stock').length,
  pendingRestocks: 3,
  movementsToday: STOCK_MOVEMENTS.filter((m) => m.date === '2026-06-25').length || 4,
};

export const TOP_MOVING_PRODUCTS = [
  { name: '3-Seater Fabric Sofa (Beige)',          movements: 18 },
  { name: 'Ergonomic Office Chair (Black Mesh)',   movements: 24 },
  { name: '6-Seater Dining Table Set (Narra)',     movements: 9 },
];

export const INVENTORY_HEALTH = {
  sufficient:  PRODUCTS.filter((p) => p.status === 'Sufficient').length,
  low:         PRODUCTS.filter((p) => p.status === 'Low Stock').length,
  critical:    PRODUCTS.filter((p) => p.status === 'Critical Stock').length,
  outOfStock:  PRODUCTS.filter((p) => p.status === 'Out of Stock').length,
};

export const AUDIT_LOGS = [
  { id: 'wa1', action: 'Product creation',   detail: 'Created Outdoor Rattan Set 4-pc (OUT-RT4-011)',        timestamp: '2026-06-10 10:00 AM' },
  { id: 'wa2', action: 'Stock adjustment',   detail: 'Count adjustment for 6-Seater Dining Set (-1 unit)',   timestamp: '2026-06-22 02:15 PM' },
  { id: 'wa3', action: 'Restock',            detail: 'Restock RST-8821 recorded — 10 Sofas received',        timestamp: '2026-06-20 09:30 AM' },
  { id: 'wa4', action: 'Transfer',           detail: 'Transfer TRF-299 completed to Davao City Branch',      timestamp: '2026-06-18 04:00 PM' },
  { id: 'wa5', action: 'Product update',     detail: 'Updated reorder point for Queen Bed Frame',            timestamp: '2026-06-19 11:20 AM' },
];

export const EXISTING_SKUS = PRODUCTS.map((p) => p.sku);

export function getProductById(id)  { return PRODUCTS.find((p) => p.id === String(id)) ?? null; }
export function getMovementById(id) { return STOCK_MOVEMENTS.find((m) => m.id === id) ?? null; }
export function getTransferById(id) { return TRANSFERS.find((t) => t.id === id) ?? null; }
export function getRestockById(id)  { return RESTOCK_RECORDS.find((r) => r.id === id) ?? null; }
export function getStockStatus(stock, reorderPoint) {
  if (stock <= 0) return 'Out of Stock';
  if (stock <= reorderPoint * 0.3) return 'Critical Stock';
  if (stock <= reorderPoint) return 'Low Stock';
  return 'Sufficient';
}

// ── Customer Credit History (maintained by Warehouse Personnel) ───────────────
// Warehouse staff access this to verify credit standing before processing
// large inventory releases or transfers tied to customer orders.

export const CUSTOMER_CREDIT_RECORDS = [
  {
    id: 'CCR-001',
    clientName: 'Luntiang Tahanan Interiors',
    accountNumber: 'ACC-1001',
    branch: 'Davao City Branch',
    creditLimit: 200000,
    outstandingBalance: 48500,
    creditUtilization: 24,
    status: 'Overdue',
    daysOverdue: 14,
    lastPaymentDate: '2026-06-20',
    lastPaymentAmount: 12000,
    totalPurchases: 842000,
    paymentHistory: [
      { date: '2026-06-20', amount: 12000, method: 'Bank Transfer', status: 'Confirmed', receipt: 'RCP-001' },
      { date: '2026-06-18', amount: 8500,  method: 'Cash',          status: 'Confirmed', receipt: 'RCP-002' },
      { date: '2026-06-15', amount: 5000,  method: 'Check',         status: 'Confirmed', receipt: 'RCP-003' },
      { date: '2026-06-01', amount: 15000, method: 'Bank Transfer', status: 'Confirmed', receipt: 'RCP-004' },
    ],
    delinquencyFlags: ['14 days overdue — balance ₱48,500'],
    riskLevel: 'Medium',
  },
  {
    id: 'CCR-002',
    clientName: 'Casa Moderna Furniture',
    accountNumber: 'ACC-1002',
    branch: 'Davao City Branch',
    creditLimit: 150000,
    outstandingBalance: 22000,
    creditUtilization: 15,
    status: 'Pending',
    daysOverdue: 9,
    lastPaymentDate: '2026-06-19',
    lastPaymentAmount: 10000,
    totalPurchases: 445000,
    paymentHistory: [
      { date: '2026-06-19', amount: 10000, method: 'Check', status: 'Confirmed', receipt: 'RCP-010' },
      { date: '2026-06-05', amount: 8000,  method: 'Cash',  status: 'Confirmed', receipt: 'RCP-011' },
    ],
    delinquencyFlags: ['9 days overdue'],
    riskLevel: 'Low',
  },
  {
    id: 'CCR-003',
    clientName: 'Furniture Plus GenSan',
    accountNumber: 'ACC-2001',
    branch: 'General Santos Branch',
    creditLimit: 500000,
    outstandingBalance: 0,
    creditUtilization: 0,
    status: 'Current',
    daysOverdue: 0,
    lastPaymentDate: '2026-06-25',
    lastPaymentAmount: 128000,
    totalPurchases: 842000,
    paymentHistory: [
      { date: '2026-06-25', amount: 128000, method: 'Bank Transfer', status: 'Confirmed', receipt: 'RCP-INV-0088' },
      { date: '2026-06-14', amount: 95000,  method: 'Bank Transfer', status: 'Confirmed', receipt: 'RCP-INV-0085' },
    ],
    delinquencyFlags: [],
    riskLevel: 'Low',
  },
  {
    id: 'CCR-004',
    clientName: 'Abode Furniture Warehouse',
    accountNumber: 'ACC-2004',
    branch: 'General Santos Branch',
    creditLimit: 200000,
    outstandingBalance: 82000,
    creditUtilization: 41,
    status: 'Overdue',
    daysOverdue: 21,
    lastPaymentDate: '2026-06-01',
    lastPaymentAmount: 15000,
    totalPurchases: 298000,
    paymentHistory: [
      { date: '2026-06-01', amount: 15000, method: 'Cash', status: 'Confirmed',     receipt: 'RCP-021' },
      { date: '2026-05-15', amount: 10000, method: 'Cash', status: 'Confirmed',     receipt: 'RCP-018' },
      { date: '2026-05-01', amount: 8000,  method: 'Check',status: 'Late',          receipt: 'RCP-014' },
    ],
    delinquencyFlags: ['21 days overdue', 'Late payment on record', 'Credit hold flagged'],
    riskLevel: 'High',
  },
  {
    id: 'CCR-005',
    clientName: 'Mabuhay Sala Sets',
    accountNumber: 'ACC-1006',
    branch: 'Davao City Branch',
    creditLimit: 100000,
    outstandingBalance: 38000,
    creditUtilization: 38,
    status: 'Blacklisted',
    daysOverdue: 28,
    lastPaymentDate: '2026-05-28',
    lastPaymentAmount: 5000,
    totalPurchases: 155000,
    paymentHistory: [
      { date: '2026-05-28', amount: 5000,  method: 'Cash', status: 'Confirmed', receipt: 'RCP-030' },
      { date: '2026-04-30', amount: 3000,  method: 'Cash', status: 'Late',      receipt: 'RCP-026' },
    ],
    delinquencyFlags: ['28 days overdue', 'Blacklisted — no new orders allowed', '3 consecutive missed payments'],
    riskLevel: 'Critical',
  },
];

export function getCreditRecordById(id) {
  return CUSTOMER_CREDIT_RECORDS.find((r) => r.id === id) ?? null;
}

export function getCreditRecordByAccount(accountNumber) {
  return CUSTOMER_CREDIT_RECORDS.find((r) => r.accountNumber === accountNumber) ?? null;
}
