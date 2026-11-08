import apiClient from './apiClient.js';

export async function fetchMyPreferences() {
  try {
    const response = await apiClient.get('/auth/me/preferences');
    return response.data;
  } catch (error) {
    return {
      success: false,
      data: null,
      message: error.response?.data?.message || 'Could not load preferences.',
    };
  }
}

export async function saveMyPreferences(preferences) {
  try {
    const response = await apiClient.put('/auth/me/preferences', { preferences });
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.message || 'Could not save preferences.',
    };
  }
}
