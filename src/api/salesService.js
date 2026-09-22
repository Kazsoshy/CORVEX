import apiClient from './apiClient.js';

export async function fetchCustomers(params = {}) {
  try {
    const response = await apiClient.get('/customers', { params });
    return response.data;
  } catch (error) {
    const message = error?.response?.data?.message || error?.message || 'Unknown error';
    const detail = error?.response?.data?.error || '';
    console.error('Failed to fetch customers:', message, detail);
    return { success: false, data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 }, message, detail };
  }
}

export async function fetchCustomerById(id) {
  try {
    const response = await apiClient.get(`/customers/${id}`);
    return response.data;
  } catch (error) {
    console.error('Failed to fetch customer:', error);
    return { success: false, data: null };
  }
}

export async function createCustomer(payload) {
  try {
    const response = await apiClient.post('/customers', payload);
    return response.data;
  } catch (error) {
    const message = error?.response?.data?.message || error?.message || 'Failed to create customer';
    console.error('Failed to create customer:', error);
    return { success: false, message };
  }
}

export async function fetchTerritories(params = {}) {
  try {
    const response = await apiClient.get('/territories', { params });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch territories:', error);
    return { success: false, data: [] };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Invoice Items API
// ──────────────────────────────────────────────────────────────────────────────

export async function fetchInvoices(params = {}) {
  try {
    const response = await apiClient.get('/sales/invoices', { params });
    return response.data;
  } catch (error) {
    const message = error?.response?.data?.message || error?.message || 'Failed to fetch invoices';
    console.error('Failed to fetch invoices:', error);
    return { success: false, data: [], pagination: { total: 0, page: 1, limit: 50, totalPages: 0 }, message };
  }
}

export async function fetchInvoiceById(invoiceId) {
  try {
    const response = await apiClient.get(`/sales/invoices/${invoiceId}`);
    return response.data;
  } catch (error) {
    const message = error?.response?.data?.message || error?.message || 'Failed to fetch invoice';
    console.error('Failed to fetch invoice:', error);
    return { success: false, data: null, message };
  }
}

export async function fetchPaymentMethods() {
  try {
    const response = await apiClient.get('/sales/payment-methods');
    return response.data;
  } catch (error) {
    const message = error?.response?.data?.message || error?.message || 'Failed to fetch payment methods';
    console.error('Failed to fetch payment methods:', error);
    return { success: false, data: [], message };
  }
}

export async function createSalesInvoice(payload) {
  try {
    const response = await apiClient.post('/sales/invoices', payload);
    return response.data;
  } catch (error) {
    const message = error?.response?.data?.message || error?.message || 'Failed to log sale';
    console.error('Failed to create sales invoice:', error);
    return { success: false, message };
  }
}

export async function fetchInvoiceItems(invoiceId) {
  try {
    const response = await apiClient.get(`/sales/invoices/${invoiceId}/items`);
    return response.data;
  } catch (error) {
    const message = error?.response?.data?.message || error?.message || 'Failed to fetch invoice items';
    console.error('Failed to fetch invoice items:', error);
    return { success: false, data: [], count: 0, message };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Field Visits API
// ──────────────────────────────────────────────────────────────────────────────

export async function fetchFieldVisits() {
  try {
    const response = await apiClient.get('/sales/visits');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch field visits:', error);
    return { success: false, data: [], count: 0 };
  }
}

export async function fetchFieldVisitById(id) {
  try {
    const response = await apiClient.get(`/sales/visits/${id}`);
    return response.data;
  } catch (error) {
    console.error('Failed to fetch field visit:', error);
    return { success: false, data: null };
  }
}

export async function createFieldVisit(data) {
  try {
    const response = await apiClient.post('/sales/visits', data);
    return response.data;
  } catch (error) {
    console.error('Failed to create field visit:', error);
    return { success: false, message: error?.response?.data?.message || 'Failed to create field visit' };
  }
}

export async function updateFieldVisit(id, data) {
  try {
    const response = await apiClient.put(`/sales/visits/${id}`, data);
    return response.data;
  } catch (error) {
    console.error('Failed to update field visit:', error);
    return { success: false, message: error?.response?.data?.message || 'Failed to update field visit' };
  }
}
