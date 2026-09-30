import apiClient from './apiClient.js';

export async function fetchMyProfile() {
  try {
    const response = await apiClient.get('/auth/me');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch profile:', error);
    return { success: false, data: null };
  }
}

export async function updateMyProfile(payload) {
  try {
    const response = await apiClient.put('/auth/me', payload);
    return response.data;
  } catch (error) {
    console.error('Failed to update profile:', error);
    return { success: false, message: error.response?.data?.message || 'Update failed.' };
  }
}
