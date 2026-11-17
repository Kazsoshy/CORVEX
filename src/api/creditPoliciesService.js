import apiClient from './apiClient.js';

export async function fetchCreditSuggestionPolicies() {
  try {
    const response = await apiClient.get('/approvals/credit-policies');
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: error?.response?.data?.message || 'Failed to load credit policies.',
      data: null,
    };
  }
}

export async function saveCreditSuggestionPolicies(payload) {
  try {
    const response = await apiClient.put('/approvals/credit-policies', payload);
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: error?.response?.data?.message || 'Failed to save credit policies.',
    };
  }
}
