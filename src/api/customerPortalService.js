import apiClient from './apiClient.js';

export async function fetchPortalInvitation(token) {
  try {
    const response = await apiClient.get(`/auth/portal/invitation/${encodeURIComponent(token)}`);
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.message || 'Invalid activation link.',
    };
  }
}

export async function activatePortalAccount({ token, password, confirm_password }) {
  try {
    const response = await apiClient.post('/auth/portal/activate', {
      token,
      password,
      confirm_password,
    });
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.message || 'Activation failed.',
    };
  }
}

export async function fetchCustomerPortalMe() {
  try {
    const response = await apiClient.get('/customer-portal/me');
    return response.data;
  } catch (error) {
    return { success: false, data: null };
  }
}

export async function updateCustomerPortalContact({ contact_phone, portal_email }) {
  try {
    const response = await apiClient.put('/customer-portal/me', { contact_phone, portal_email });
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to update contact information.',
    };
  }
}

export async function fetchCustomerPortalProducts() {
  try {
    const response = await apiClient.get('/customer-portal/products');
    return response.data;
  } catch (error) {
    return { success: false, data: [] };
  }
}

export async function fetchCustomerPurchaseRequests() {
  try {
    const response = await apiClient.get('/customer-portal/purchase-requests');
    return response.data;
  } catch (error) {
    return { success: false, data: [] };
  }
}

export async function submitCustomerPurchaseRequest(payload) {
  try {
    const response = await apiClient.post('/customer-portal/purchase-requests', payload);
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to submit request.',
    };
  }
}

export async function lookupCustomersForDuplicate(params) {
  try {
    const response = await apiClient.get('/customers/lookup', { params });
    return response.data;
  } catch (error) {
    return { success: false, data: [] };
  }
}

export async function fetchCustomerPortalPayments(params = {}) {
  try {
    const response = await apiClient.get('/customer-portal/payments', { params });
    return response.data;
  } catch (error) {
    return { success: false, data: [] };
  }
}

export async function fetchCustomerPortalReceipts() {
  try {
    const response = await apiClient.get('/customer-portal/receipts');
    return response.data;
  } catch (error) {
    return { success: false, data: [] };
  }
}

export async function fetchCustomerPortalReceiptById(receiptId) {
  try {
    const response = await apiClient.get(`/customer-portal/receipts/${receiptId}`);
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.message || 'Receipt not found.',
    };
  }
}

export async function fetchCustomerStatementSummary() {
  try {
    const response = await apiClient.get('/customer-portal/statements/summary');
    return response.data;
  } catch (error) {
    return { success: false, data: null };
  }
}

export async function resendCustomerPortalInvitation(customerId, portalEmail) {
  try {
    const response = await apiClient.post(`/customers/${customerId}/portal/resend`, { portal_email: portalEmail });
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to resend invitation.',
    };
  }
}
