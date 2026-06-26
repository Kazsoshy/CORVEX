export const CUSTOMER_ACCOUNT = {
  accountNumber: 'ACC-2026-00123',
  clientName: 'Juan Santos',
  businessType: 'Sari-Sari Store',
  address: '45 Rizal Avenue, Barangay San Jose, Quezon City',
  contactNumber: '+63 917 123 4567',
  email: 'juan.santos@email.com',
  branch: 'Main Branch',
  branchAddress: '123 Business St, Quezon City',
  branchPhone: '(02) 1234-5678',
  branchEmail: 'mainbranch@corvex.com',
  branchManager: 'Jose Garcia',
  accountStatus: 'Active',
  outstandingBalance: 18500,
  creditLimit: 50000,
  nextDueDate: '2026-07-05',
  nextPaymentAmount: 5000,
  daysUntilDue: 11,
};

export const PAYMENTS = [
  { id: 'p1', date: '2026-06-20', amount: 5000, collector: 'John Collector', receiptNumber: 'RCP-001', type: 'Cash', status: 'Confirmed' },
  { id: 'p2', date: '2026-06-18', amount: 3500, collector: 'Maria Sales', receiptNumber: 'RCP-002', type: 'Cash', status: 'Confirmed' },
  { id: 'p3', date: '2026-06-15', amount: 2000, collector: 'Peter Agent', receiptNumber: 'RCP-003', type: 'Check', status: 'Confirmed' },
  { id: 'p4', date: '2026-06-10', amount: 4500, collector: 'John Collector', receiptNumber: 'RCP-004', type: 'Cash', status: 'Confirmed' },
  { id: 'p5', date: '2026-06-05', amount: 5000, collector: 'Maria Sales', receiptNumber: 'RCP-005', type: 'Cash', status: 'Confirmed' },
  { id: 'p6', date: '2026-05-30', amount: 3000, collector: 'John Collector', receiptNumber: 'RCP-006', type: 'Cash', status: 'Confirmed' },
];

export const RECEIPTS = PAYMENTS.map((p) => ({
  id: p.receiptNumber,
  receiptNumber: p.receiptNumber,
  date: p.date,
  amount: p.amount,
  paymentId: p.id,
}));

export const STATEMENTS = [
  { id: 's1', month: 'June 2026', outstandingBalance: 18500, totalPaid: 20000, generatedDate: '2026-06-01' },
  { id: 's2', month: 'May 2026', outstandingBalance: 22000, totalPaid: 18500, generatedDate: '2026-05-01' },
  { id: 's3', month: 'April 2026', outstandingBalance: 19500, totalPaid: 21000, generatedDate: '2026-04-01' },
];

export const NOTIFICATIONS = [
  { id: 'cn1', type: 'Payment Reminders', message: 'Your payment of PHP 5,000 is due on July 5, 2026.', read: false, relatedTo: '/customer/home' },
  { id: 'cn2', type: 'Due Date Alerts', message: '11 days remaining until your next due date.', read: false, relatedTo: '/customer/home' },
  { id: 'cn3', type: 'Receipt Generated', message: 'Receipt RCP-001 for PHP 5,000 is available.', read: true, relatedTo: '/customer/receipts' },
  { id: 'cn4', type: 'Account Updates', message: 'Your contact number was updated successfully.', read: true, relatedTo: '/customer/account-details' },
];

export const UPCOMING_DUE_DATES = [
  { date: '2026-07-05', amount: 5000, label: 'Next scheduled payment' },
  { date: '2026-08-05', amount: 5000, label: 'Following payment' },
];

export function formatCurrency(amount) {
  return `PHP ${amount.toLocaleString('en-PH')}`;
}

export function getPaymentById(id) {
  return PAYMENTS.find((p) => p.id === id) ?? null;
}

export function getReceiptById(id) {
  return RECEIPTS.find((r) => r.id === id || r.receiptNumber === id) ?? null;
}

export function getStatementById(id) {
  return STATEMENTS.find((s) => s.id === id) ?? null;
}
