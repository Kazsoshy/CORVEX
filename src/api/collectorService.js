import { fetchCustomers, fetchCustomerById } from './salesService.js';
import { getCurrentUser } from './authService.js';
import apiClient from './apiClient.js';

function transformCustomerToAccount(customer) {
  // The list endpoint (GET /customers) returns activity fields FLAT at top level:
  //   outstandingBalance, totalPurchaseVolume, lastVisitDate
  // The detail endpoint (GET /customers/:id) returns them NESTED under customer.activity
  // We handle both shapes here.
  const activity = customer.activity || {};

  const outstandingBalance =
    Number(activity.outstanding_balance) ||
    Number(customer.outstandingBalance) ||
    Number(customer.outstandingbalance) ||   // pg lowercase fallback
    Number(customer.outstanding_balance) ||
    0;

  const purchaseVolume =
    Number(activity.purchase_volume) ||
    Number(customer.totalPurchaseVolume) ||
    Number(customer.totalpurchasevolume) ||  // pg lowercase fallback
    Number(customer.purchase_volume) ||
    0;

  const rawLastVisit =
    activity.last_sales_visit ||
    activity.last_collection_date ||
    customer.lastVisitDate ||
    customer.lastvisitdate ||               // pg lowercase fallback
    customer.last_sales_visit ||
    customer.last_collection_date ||
    null;

  const lastVisitDate = rawLastVisit && rawLastVisit !== ''
    ? (() => { try { return new Date(rawLastVisit).toLocaleDateString('en-PH'); } catch { return rawLastVisit; } })()
    : 'N/A';

  // Calculate days overdue from last collection date
  const lastCollectionRaw =
    activity.last_collection_date ||
    customer.lastCollectionDate ||
    customer.lastcollectiondate ||          // pg lowercase fallback
    customer.last_collection_date ||
    null;
  let daysOverdue = 0;
  if (outstandingBalance > 0 && lastCollectionRaw) {
    const daysDiff = Math.floor((Date.now() - new Date(lastCollectionRaw).getTime()) / (1000 * 60 * 60 * 24));
    daysOverdue = Math.max(0, daysDiff - 30); // overdue after 30 days
  } else if (outstandingBalance > 0 && !lastCollectionRaw) {
    daysOverdue = 30; // never collected, has balance — treat as 30 days overdue
  }

  // Derive collector status from balance and overdue days
  const collectorStatus = outstandingBalance > 0
    ? (daysOverdue > 0 ? 'Overdue' : 'Pending')
    : 'Current';

  const creditInfo = customer.creditInfo || {};
  const paymentHistory = (customer.paymentHistory || []).map((p) => ({
    date: p.payment_date || p.date,
    amount: Number(p.amount),
    collector: p.collector_name || p.collector || '—',
    receipt: p.receipt_number || p.receipt || '—',
    method: p.payment_method || 'Cash',
    status: p.payment_status || 'Completed',
  }));

  return {
    id: String(customer.customer_id),
    customerName: `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Unknown Customer',
    accountNumber: `ACC-${customer.customer_id}`,
    address: customer.address || '—',
    phone: customer.contact_phone || customer.phone || '—',
    outstandingBalance,
    purchaseVolume,
    daysOverdue,
    // status used by AccountCard badge and filter — Overdue/Pending/Current
    status: collectorStatus,
    rawStatus: customer.status,
    assignedToday: customer.status === 'Active',
    lastVisitDate,
    distanceKm: 0,
    blacklisted: false,
    paymentHistory,
    branch_id: customer.branch_id,
    branch_name: customer.branch_name,
    account_manager_name: customer.account_manager_name || '—',
    customer_since: customer.created_at
      ? new Date(customer.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
      : 'N/A',
    credit_limit: Number(creditInfo.credit_limit || 0),
    monthly_income: Number(creditInfo.monthly_income || 0),
    employment_status: creditInfo.employment_status || '—',
    credit_score: creditInfo.credit_score || '—',
    credit_score_approver: creditInfo.approved_by_name || '—',
    latitude: customer.latitude,
    longitude: customer.longitude,
    contact_person_fname: customer.contact_person_fname,
    contact_person_lname: customer.contact_person_lname,
    created_at: customer.created_at,
    updated_at: customer.updated_at,
  };
}

export async function fetchAccounts(params = {}) {
  const currentUser = getCurrentUser();
  const branchId = currentUser?.branch?.id;
  const query = branchId ? { ...params, branch_id: branchId } : params;

  const result = await fetchCustomers(query);
  if (result.success && Array.isArray(result.data)) {
    return {
      success: true,
      data: result.data.map(transformCustomerToAccount),
    };
  }
  return { success: false, data: [] };
}

export async function fetchAccountById(id) {
  const result = await fetchCustomerById(id);
  if (result.success && result.data) {
    return {
      success: true,
      data: transformCustomerToAccount(result.data),
    };
  }
  return { success: false, data: null };
}

export { transformCustomerToAccount };

// ──────────────────────────────────────────────────────────────────────────────
// Collection Payments
// ──────────────────────────────────────────────────────────────────────────────
export async function fetchCollectionPayments() {
  try {
    const response = await apiClient.get('/collector/payments');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch collection payments:', error);
    return { success: false, data: [], count: 0 };
  }
}

export async function fetchDigitalReceipts() {
  try {
    const response = await apiClient.get('/collector/receipts');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch digital receipts:', error);
    return { success: false, data: [], count: 0 };
  }
}

export async function fetchDigitalReceiptById(id) {
  try {
    const response = await apiClient.get(`/collector/receipts/${id}`);
    return response.data;
  } catch (error) {
    console.error('Failed to fetch digital receipt:', error);
    return { success: false, data: null };
  }
}
