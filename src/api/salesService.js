import { api } from './apiClient.js';

export const fetchCustomers = (params = {}) => api.get('/customers', params);
export const fetchCustomerById = (id) => api.get(`/customers/${id}`);
