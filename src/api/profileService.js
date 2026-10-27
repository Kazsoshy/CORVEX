import apiClient from './apiClient.js';

export async function fetchMyProfile() {
  try {
    const response = await apiClient.get('/auth/me');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch profile:', error);
    return {
      success: false,
      data: null,
      message: error.response?.data?.message || 'Could not load your profile.',
    };
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

export async function fetchMyAvatarBlob() {
  try {
    const response = await apiClient.get('/auth/me/avatar', {
      responseType: 'blob',
      timeout: 20000,
    });
    const blob = response.data;
    if (!(blob instanceof Blob) || !blob.size || !String(blob.type || '').startsWith('image/')) return null;
    return blob;
  } catch (error) {
    if (error.response?.status === 404) return null;
    return null;
  }
}

export async function uploadMyAvatar(file) {
  try {
    const token = localStorage.getItem('corvex_token');
    const response = await fetch(`${apiClient.defaults.baseURL}/auth/me/avatar`, {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: file,
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      localStorage.removeItem('corvex_user');
      localStorage.removeItem('corvex_token');
    }
    if (!response.ok) {
      return { success: false, message: data.message || 'Could not save the photo.' };
    }
    return data;
  } catch {
    return { success: false, message: 'Could not save the photo.' };
  }
}

export async function deleteMyAvatar() {
  try {
    const response = await apiClient.delete('/auth/me/avatar');
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.message || 'Could not remove the photo.',
    };
  }
}
