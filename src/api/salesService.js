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
