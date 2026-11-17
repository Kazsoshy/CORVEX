import apiClient from './apiClient';

export const fetchTerritories = async (params = {}) => {
  try {
    const query = new URLSearchParams(params).toString();
    const res = await apiClient.get(`/territories${query ? `?${query}` : ''}`);
    return res.data;
  } catch (error) {
    return {
      success: false,
      data: [],
      message: error?.response?.data?.message || 'Failed to load territories.',
    };
  }
};

export const fetchTerritoryById = async (id) => {
  const res = await apiClient.get(`/territories/${id}`);
  return res.data;
};

export const fetchTerritoryDependencies = async (id) => {
  const res = await apiClient.get(`/territories/${id}/dependencies`);
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

export const geocodeTerritoryBarangay = async (params = {}) => {
  try {
    // /geo/lookup avoids any /:id collision if an older server still treats "geocode" as an id.
    const res = await apiClient.get('/territories/geo/lookup', { params });
    return res.data;
  } catch (error) {
    return {
      success: false,
      message: error?.response?.data?.message || 'Address search failed.',
      data: null,
    };
  }
};

export const searchAddressLocation = async (query, extras = {}) => {
  return geocodeTerritoryBarangay({
    q: query,
    barangay_name: query,
    ...extras,
  });
};

export const reverseGeocodeLocation = async (params = {}) => {
  try {
    const res = await apiClient.get('/territories/geo/reverse', { params });
    return res.data;
  } catch (error) {
    return {
      success: false,
      message: error?.response?.data?.message || 'Reverse geocoding failed.',
      data: null,
    };
  }
};

export const suggestTerritoryForLocation = async (params = {}) => {
  try {
    const res = await apiClient.get('/territories/geo/suggest-territory', { params });
    return res.data;
  } catch (error) {
    return {
      success: false,
      message: error?.response?.data?.message || 'Territory suggestion failed.',
      data: null,
    };
  }
};

export const fetchTerritoryPolicies = async () => {
  const res = await apiClient.get('/territories/policies');
  return res.data;
};

export const saveTerritoryPolicies = async (data) => {
  const res = await apiClient.put('/territories/policies', data);
  return res.data;
};

/** Active staff in scope who can be assigned to a territory (legacy consumers). */
export const fetchAssignableUsers = async (params = {}) => {
  const res = await apiClient.get('/territories/assignable-users', { params });
  return res.data;
};
