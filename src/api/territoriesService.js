import apiClient from './apiClient';

export const fetchTerritories = async (params = {}) => {
  const query = new URLSearchParams(params).toString();
  const res = await apiClient.get(`/territories${query ? `?${query}` : ''}`);
  return res.data;
};

export const fetchTerritoryById = async (id) => {
  const res = await apiClient.get(`/territories/${id}`);
  return res.data;
};

export const createTerritory = async (data) => {
  const res = await apiClient.post('/territories', data);
  return res.data;
};

export const updateTerritory = async (id, data) => {
  const res = await apiClient.put(`/territories/${id}`, data);
  return res.data;
};

export const deleteTerritory = async (id) => {
  const res = await apiClient.delete(`/territories/${id}`);
  return res.data;
};

/** Active staff in scope who can be assigned to a territory. */
export const fetchAssignableUsers = async (params = {}) => {
  const res = await apiClient.get('/territories/assignable-users', { params });
  return res.data;
};
