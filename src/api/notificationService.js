import apiClient from './apiClient.js';

export async function fetchNotifications() {
  try {
    const response = await apiClient.get('/notifications');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch notifications:', error);
    return { success: false, data: [], count: 0 };
  }
}

export async function markNotificationRead(id) {
  try {
    const response = await apiClient.patch(`/notifications/${id}/read`);
    return response.data;
  } catch (error) {
    console.error('Failed to mark notification read:', error);
    return { success: false };
  }
}
