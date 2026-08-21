import { fetchCustomers, fetchCustomerById } from './salesService.js';
import { getCurrentUser } from './authService.js';

function transformCustomerToAccount(customer) {
  const activity = customer.activity || {};
  const creditInfo = customer.creditInfo || {};
  const paymentHistory = (customer.paymentHistory || []).map((p) => ({
    date: p.payment_date || p.date,
    amount: Number(p.amount),
    collector: p.collector_name || p.collector || '—',
    receipt: p.receipt_number || p.receipt || '—',
  }));

  return {
    id: String(customer.customer_id),
    customerName: `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Unknown Customer',
    accountNumber: `ACC-${customer.customer_id}`,
    address: customer.address || '—',
    phone: customer.contact_phone || '—',
    outstandingBalance: Number(activity.outstanding_balance || 0),
    daysOverdue: 0,
    status: customer.status || 'Inactive',
    assignedToday: customer.status === 'Active',
    lastVisitDate: activity.last_sales_visit || activity.last_collection_date || customer.updated_at || 'N/A',
    distanceKm: 0,
    blacklisted: false,
    paymentHistory,
    branch_id: customer.branch_id,
    branch_name: customer.branch_name,
    credit_limit: Number(creditInfo.credit_limit || 0),
    monthly_income: Number(creditInfo.monthly_income || 0),
    employment_status: creditInfo.employment_status || '—',
    credit_score: creditInfo.credit_score || '—',
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
