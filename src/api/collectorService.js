import { fetchCustomers, fetchCustomerById } from './salesService.js';
import { getCurrentUser } from './authService.js';
import apiClient from './apiClient.js';
import { formatDisplayDate } from '../utils/formatters.js';

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
    customer.lastFieldVisitDate ||
    activity.last_collection_date ||
    activity.last_sales_visit ||
    customer.lastVisitDate ||
    customer.lastvisitdate ||               // pg lowercase fallback
    customer.last_sales_visit ||
    customer.last_collection_date ||
    null;

  const lastVisitDate = rawLastVisit && rawLastVisit !== ''
    ? (() => { try { const formatted = formatDisplayDate(rawLastVisit); return formatted === '—' ? rawLastVisit : formatted; } catch { return rawLastVisit; } })()
    : 'No visits yet';

  // Calculate days overdue from earliest open invoice due_date (matches SAW model),
  // falling back to last collection date when invoice due date is unavailable.
  const earliestDueRaw =
    customer.earliestDueDate ||
    customer.earliest_due_date ||
    (Array.isArray(customer.recentSales)
      ? customer.recentSales
          .map((s) => s.due_date)
          .filter(Boolean)
          .sort()[0]
      : null);

  const lastCollectionRaw =
    activity.last_collection_date ||
    customer.lastCollectionDate ||
    customer.lastcollectiondate ||          // pg lowercase fallback
    customer.last_collection_date ||
    null;

  // Days overdue only from unpaid past-due invoices — never invent overdue from collection age.
  let daysOverdue = Number(customer.daysOverdue) || 0;
  const serverHasOverdue = Boolean(customer.hasOverdueInvoice ?? customer.has_overdue_invoice);
  if (serverHasOverdue && earliestDueRaw && !(Number.isFinite(daysOverdue) && daysOverdue > 0)) {
    const manilaToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
    const asOf = new Date(`${manilaToday}T12:00:00`);
    const due = new Date(earliestDueRaw);
    const diff = Math.floor((asOf - due) / 86400000);
    daysOverdue = Math.max(0, diff);
  }
  if (!serverHasOverdue) daysOverdue = 0;

  // Payment standing (not customer account status). Prefer server overdue flag when present.
  const hasOverdue = serverHasOverdue;
  const paymentStanding = outstandingBalance <= 0
    ? 'Current'
    : (hasOverdue ? 'Overdue' : 'Has Balance');

  const creditInfo = customer.creditInfo || {};
  const paymentHistory = (customer.paymentHistory || []).map((p) => ({
    date: p.payment_date || p.date,
    amount: Number(p.amount),
    collector: p.collector_name || p.collector || '—',
    receipt: p.receipt_number || p.receipt || '—',
    method: p.payment_method || 'Cash',
    status: p.payment_status || 'Completed',
  }));

  const customerCode = String(customer.customer_code || '').trim() || null;

  return {
    // Keep raw shared customer fields for Sales-aligned UIs
    ...customer,
    id: String(customer.customer_id),
    customer_id: customer.customer_id,
    customer_code: customerCode,
    customerName: `${customer.first_name || ''} ${customer.middle_name || ''} ${customer.last_name || ''}`.replace(/\s+/g, ' ').trim() || 'Unknown Customer',
    accountNumber: customerCode || '—',
    address: customer.address || '—',
    phone: customer.contact_phone || customer.phone || '—',
    outstandingBalance,
    purchaseVolume,
    daysOverdue: Number(customer.daysOverdue) || daysOverdue,
    // Account status = DB customers.status (Active/Inactive)
    status: customer.status || 'Active',
    paymentStanding,
    delinquencyStatus: paymentStanding,
    rawStatus: customer.status,
    assignedToday: Boolean(customer.todayVisit),
    todayVisit: customer.todayVisit || null,
    lastVisitDate,
    lastFieldVisitDate: customer.lastFieldVisitDate || null,
    earliestDueDate: customer.earliestDueDate || earliestDueRaw || null,
    hasOverdueInvoice: Boolean(customer.hasOverdueInvoice) || hasOverdue,
    unpaidInvoiceCount: customer.unpaidInvoiceCount || 0,
    recentSales: customer.recentSales || [],
    distanceKm: 0,
    paymentHistory,
    branch_id: customer.branch_id,
    branch_name: customer.branch_name,
    account_manager_name: customer.account_manager_name || '—',
    assigned_sales_agent_name: customer.assigned_sales_agent_name || null,
    customer_since: customer.created_at ? formatDisplayDate(customer.created_at) : 'N/A',
    creditInfo,
    credit_limit: Number(creditInfo.credit_limit || 0),
    monthly_income: Number(creditInfo.monthly_income || 0),
    employment_status: creditInfo.employment_status || '—',
    credit_score: creditInfo.credit_score || '—',
    credit_score_approver: creditInfo.approved_by_name || '—',
    latitude: customer.latitude,
    longitude: customer.longitude,
    contact_person_fname: customer.contact_person_fname,
    contact_person_lname: customer.contact_person_lname,
    activity: customer.activity || activity,
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
      pagination: result.pagination || null,
    };
  }
  return { success: false, data: [], pagination: { total: 0, page: 1, limit: 10, totalPages: 0 } };
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

export async function sendReceiptToCustomer(receiptId) {
  try {
    const response = await apiClient.post(`/collector/receipts/${receiptId}/send`);
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to send receipt.',
    };
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

export async function fetchCollectionPaymentById(id) {
  try {
    const response = await apiClient.get(`/collector/payments/${id}`);
    return response.data;
  } catch (error) {
    console.error('Failed to fetch collection payment:', error);
    return { success: false, data: null };
  }
}

export async function fetchTodayFieldVisits() {
  try {
    const response = await apiClient.get('/collector/field-visits/today');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch today field visits:', error);
    return { success: false, data: [], count: 0 };
  }
}

/** SAW-ranked collection priority (Simple Additive Weighting — matches sawmodel.ipynb). */
export async function fetchSawPriority(params = {}) {
  try {
    const response = await apiClient.get('/collector/saw-priority', { params });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch SAW priority:', error);
    return { success: false, data: [], meta: null };
  }
}

export async function recomputeSawPriority() {
  try {
    const response = await apiClient.post('/collector/saw/recompute');
    return response.data;
  } catch (error) {
    console.error('Failed to recompute SAW:', error);
    return { success: false, message: error.response?.data?.message || 'Failed to recompute SAW.' };
  }
}

export function mapSawRowToRouteStop(row, visitByCustomer = new Map()) {
  const id = String(row.customer_id);
  const visit = visitByCustomer.get(id) || (row.visit_id
    ? {
        visit_id: row.visit_id,
        status: row.visit_status,
        visit_type: 'Collection',
        visit_outcome: row.visit_outcome,
        visit_remarks: row.visit_remarks,
        visited_at: row.visited_at,
      }
    : null);
  const visitDone = visit?.status === 'Completed' || row.visit_status === 'Completed';
  const daysOverdue = Number(row.days_overdue) || 0;
  const outstandingBalance = Number(row.outstanding_balance) || 0;
  const delinquencyStatus = outstandingBalance > 0 && daysOverdue > 0
    ? 'Overdue'
    : (outstandingBalance > 0 ? 'Current' : 'Paid');
  const routeSequence = Number.isFinite(Number(row.route_sequence))
    ? Number(row.route_sequence)
    : (Number.isFinite(Number(row.rank)) ? Number(row.rank) : null);

  return {
    id,
    customerName: row.customer_name || 'Customer',
    accountNumber: String(row.customer_code || '').trim() || '—',
    customer_code: String(row.customer_code || '').trim() || null,
    address: row.address || '—',
    phone: row.phone || row.contact_phone || '—',
    outstandingBalance,
    daysOverdue,
    distanceKm: Number(row.distance_km) || 0,
    sawScore: row.score == null || row.score === '' ? null : Number(row.score),
    sawRank: Number.isFinite(Number(row.rank)) ? Number(row.rank) : null,
    rank: Number.isFinite(Number(row.rank)) ? Number(row.rank) : null,
    routeSequence,
    routeIndex: routeSequence,
    legDistanceKm: row.leg_distance_km ?? null,
    legDurationMin: row.leg_duration_min ?? null,
    // Official route visit status is strictly Pending or Completed
    status: visitDone ? 'Completed' : 'Pending',
    visitStatus: visitDone ? 'Completed' : 'Pending',
    delinquencyStatus,
    visitId: visit?.visit_id ?? row.visit_id ?? null,
    visitType: visit?.visit_type || 'Collection',
    visitOutcome: row.visit_outcome ?? visit?.visit_outcome ?? null,
    visitRemarks: row.visit_remarks ?? visit?.visit_remarks ?? null,
    visitedAt: row.visited_at ?? visit?.visited_at ?? null,
    rawStatus: 'Active',
    latitude: row.latitude,
    longitude: row.longitude,
    invoiceStatus: row.invoice_status,
    dueDate: row.due_date,
  };
}

export async function submitFieldVisitOutcome(body) {
  try {
    const response = await apiClient.post('/collector/field-visits/outcome', body);
    return response.data;
  } catch (error) {
    console.error('Failed to record visit outcome:', error);
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to record visit outcome.',
    };
  }
}

export async function fetchFieldActivityReports() {
  try {
    const response = await apiClient.get('/collector/field-reports');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch field activity reports:', error);
    return { success: false, data: [], count: 0 };
  }
}

export async function fetchFieldActivityReportById(reportId) {
  try {
    const response = await apiClient.get(`/collector/field-reports/${reportId}`);
    return response.data;
  } catch (error) {
    console.error('Failed to fetch field activity report:', error);
    return {
      success: false,
      data: null,
      message: error.response?.data?.message || 'Failed to load report.',
    };
  }
}

export async function submitFieldActivityReport(payload) {
  try {
    const response = await apiClient.post('/collector/field-reports', payload);
    return response.data;
  } catch (error) {
    console.error('Failed to submit field activity report:', error);
    return {
      success: false,
      offline: !error.response,
      message: error.response?.data?.message || 'Failed to submit report.',
    };
  }
}

export async function fetchCollectorDashboard() {
  try {
    const response = await apiClient.get('/collector/dashboard');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch collector dashboard:', error);
    return { success: false, data: null, message: error.response?.data?.message || 'Failed to load dashboard.' };
  }
}

export async function fetchCollectorPaymentMethods() {
  try {
    const response = await apiClient.get('/collector/payment-methods');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch payment methods:', error);
    return { success: false, data: [] };
  }
}

export async function submitCollectionPayment(body) {
  try {
    const response = await apiClient.post('/collector/payments', body);
    return response.data;
  } catch (error) {
    console.error('Failed to submit collection payment:', error);
    return {
      success: false,
      offline: !error.response,
      message: error.response?.data?.message || 'Failed to log collection.',
    };
  }
}

/** @deprecated Collectors cannot submit formal CI — use flagCustomerForCreditReview. */
export async function submitCollectorCreditInvestigation(body) {
  try {
    const response = await apiClient.post('/collector/credit-investigations', body);
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.message || 'Collectors cannot submit formal credit investigations.',
    };
  }
}

export async function flagCustomerForCreditReview(body) {
  try {
    const response = await apiClient.post('/collector/credit-review-flags', body);
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to flag customer for credit review.',
    };
  }
}

