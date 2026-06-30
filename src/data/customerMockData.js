// Furniture retail customer — Davao City branch

export const CUSTOMER_ACCOUNT = {
  accountNumber: 'ACC-2026-00123',
  clientName: 'Luntiang Tahanan Interiors',
  businessType: 'Furniture Retail Store',
  address: '42 Ilustre Ave, Barangay Poblacion, Davao City',
  contactNumber: '+63 912 345 6789',
  email: 'luntiang.tahanan@email.com',
  branch: 'Davao City Branch',
  branchAddress: '88 MacArthur Highway, Davao City',
  branchPhone: '(082) 221-4488',
  branchEmail: 'davao@corvex.ph',
  branchManager: 'Roberto Villanueva',
  accountStatus: 'Active',
  outstandingBalance: 48500,
  creditLimit: 200000,
  nextDueDate: '2026-07-05',
  nextPaymentAmount: 12000,
  daysUntilDue: 11,
};

export const PAYMENTS = [
  { id: 'p1', date: '2026-06-20', amount: 12000, collector: 'Maria Dela Cruz',   receiptNumber: 'RCP-001', type: 'Cash',          status: 'Confirmed' },
  { id: 'p2', date: '2026-06-18', amount: 8500,  collector: 'Maria Dela Cruz',   receiptNumber: 'RCP-002', type: 'Cash',          status: 'Confirmed' },
  { id: 'p3', date: '2026-06-15', amount: 5000,  collector: 'John Dela Cruz',    receiptNumber: 'RCP-003', type: 'Check',         status: 'Confirmed' },
  { id: 'p4', date: '2026-06-10', amount: 15000, collector: 'Maria Dela Cruz',   receiptNumber: 'RCP-004', type: 'Bank Transfer', status: 'Confirmed' },
  { id: 'p5', date: '2026-06-05', amount: 10000, collector: 'John Dela Cruz',    receiptNumber: 'RCP-005', type: 'Cash',          status: 'Confirmed' },
  { id: 'p6', date: '2026-05-30', amount: 8000,  collector: 'Maria Dela Cruz',   receiptNumber: 'RCP-006', type: 'Cash',          status: 'Confirmed' },
];

export const RECEIPTS = PAYMENTS.map((p) => ({
  id: p.receiptNumber,
  receiptNumber: p.receiptNumber,
  date: p.date,
  amount: p.amount,
  paymentId: p.id,
}));

export const STATEMENTS = [
  { id: 's1', month: 'June 2026',  outstandingBalance: 48500, totalPaid: 58500, generatedDate: '2026-06-01' },
  { id: 's2', month: 'May 2026',   outstandingBalance: 62000, totalPaid: 48000, generatedDate: '2026-05-01' },
  { id: 's3', month: 'April 2026', outstandingBalance: 54000, totalPaid: 52000, generatedDate: '2026-04-01' },
];

export const NOTIFICATIONS = [
  { id: 'cn1', type: 'Payment Reminders', message: 'Your payment of PHP 12,000 is due on July 5, 2026.',       read: false, relatedTo: '/customer/home' },
  { id: 'cn2', type: 'Due Date Alerts',   message: '11 days remaining until your next due date.',               read: false, relatedTo: '/customer/home' },
  { id: 'cn3', type: 'Receipt Generated', message: 'Receipt RCP-001 for PHP 12,000 is available for download.', read: true,  relatedTo: '/customer/receipts' },
  { id: 'cn4', type: 'Account Updates',   message: 'Your contact number was updated successfully.',              read: true,  relatedTo: '/customer/account-details' },
];

export const UPCOMING_DUE_DATES = [
  { date: '2026-07-05', amount: 12000, label: 'Next scheduled payment' },
  { date: '2026-08-05', amount: 12000, label: 'Following payment' },
];

export function formatCurrency(amount) { return `₱${Number(amount).toLocaleString('en-PH')}`; }
export function getPaymentById(id)   { return PAYMENTS.find((p) => p.id === id) ?? null; }
export function getReceiptById(id)   { return RECEIPTS.find((r) => r.id === id || r.receiptNumber === id) ?? null; }
export function getStatementById(id) { return STATEMENTS.find((s) => s.id === id) ?? null; }
