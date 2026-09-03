import { api } from './apiClient.js';

export const fetchAccounts = () => api.get('/collections/schedule');
export const fetchAccountById = async (id) => {
  const response = await api.get('/collections/schedule');
  const item = response.data?.find(a => String(a.id) === String(id));
  if (item) return { success: true, data: item };
  return { success: false, data: null };
};
export const fetchCollectorAnalytics = () => api.get('/collections/analytics');
export const submitCollectionPayment = (payload) => api.post('/collections', payload);
