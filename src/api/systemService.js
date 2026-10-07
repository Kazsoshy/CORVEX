import apiClient from './apiClient.js';

export async function fetchSystemSettings() {
  try {
    const response = await apiClient.get('/system/settings');
    return response.data;
  } catch (error) {
    return { success: false, message: error.response?.data?.message || 'Failed to load settings.' };
  }
}

export async function saveSystemSettings(payload) {
  try {
    const response = await apiClient.put('/system/settings', payload);
    return response.data;
  } catch (error) {
    return { success: false, message: error.response?.data?.message || 'Failed to save settings.' };
  }
}

export async function resetSystemSettings() {
  try {
    const response = await apiClient.post('/system/settings/reset');
    return response.data;
  } catch (error) {
    return { success: false, message: error.response?.data?.message || 'Failed to restore defaults.' };
  }
}

export async function fetchSystemBackups() {
  try {
    const response = await apiClient.get('/system/backups');
    return response.data;
  } catch (error) {
    return { success: false, data: [], message: error.response?.data?.message || 'Failed to load backups.' };
  }
}

export async function createSystemBackup() {
  try {
    const response = await apiClient.post('/system/backups');
    return response.data;
  } catch (error) {
    return { success: false, message: error.response?.data?.message || 'Failed to create backup.' };
  }
}

export async function downloadSystemBackup(backupId, fileName) {
  try {
    const response = await apiClient.get(`/system/backups/${backupId}/download`, { responseType: 'blob' });
    const blob = response.data;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName || `corvex-backup-${backupId}.json`;
    link.click();
    URL.revokeObjectURL(url);
    return { success: true };
  } catch (error) {
    let message = 'Failed to download backup.';
    const data = error.response?.data;
    if (data instanceof Blob) {
      try {
        const parsed = JSON.parse(await data.text());
        if (parsed?.message) message = parsed.message;
      } catch {
        message = 'Failed to download backup.';
      }
    } else if (data?.message) {
      message = data.message;
    }
    return { success: false, message };
  }
}

export async function restoreSystemBackup(backupId) {
  try {
    const response = await apiClient.post(`/system/backups/${backupId}/restore`);
    return response.data;
  } catch (error) {
    return { success: false, message: error.response?.data?.message || 'Failed to restore backup.' };
  }
}
