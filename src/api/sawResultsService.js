import apiClient from './apiClient';

export const fetchSawResults = async (params = {}) => {
  const query = new URLSearchParams(params).toString();
  const res = await apiClient.get(`/saw-results${query ? `?${query}` : ''}`);
  return res.data;
};

export const recomputeOrgSawResults = async () => {
  const res = await apiClient.post('/saw-results/recompute');
  return res.data;
};
