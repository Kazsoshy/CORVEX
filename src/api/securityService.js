import apiClient from './apiClient.js';

export async function fetchSecuritySummary() {
  try {
    const response = await apiClient.get('/security/summary');
    return response.data;
  } catch (err) {
    console.error('Failed to fetch security summary:', err);
    return { success: false, data: null, message: err.response?.data?.message || 'Failed to load security summary.' };
  }
}

export async function fetchSecurityEvents(params = {}) {
  try {
    const response = await apiClient.get('/security/events', { params });
    return response.data;
  } catch (err) {
    console.error('Failed to fetch security events:', err);
    return { success: false, data: [], message: err.response?.data?.message || 'Failed to load security events.' };
  }
}

export async function updateSecurityEventStatus(eventId, status, note = '') {
  try {
    const response = await apiClient.patch(`/security/events/${eventId}`, { status, note });
    return response.data;
  } catch (err) {
    console.error('Failed to update security event:', err);
    return { success: false, message: err.response?.data?.message || 'Failed to update event.' };
  }
}

export async function runSecuritySweep() {
  try {
    const response = await apiClient.post('/security/sweep');
    return response.data;
  } catch (err) {
    console.error('Failed to run security sweep:', err);
    return { success: false, message: err.response?.data?.message || 'Security sweep failed.' };
  }
}
