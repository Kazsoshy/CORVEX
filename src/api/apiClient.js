import axios from 'axios';

// Base URL for all API calls — reads from Vite env if available, fallback to localhost
const BASE_URL = import.meta.env?.VITE_API_URL || '/api';

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor — attach auth token and user identity if stored
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('corvex_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Bearer token is now the only auth mechanism needed.
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — handle global errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Dispatch failure event for Super Admin monitoring
    const failureDetail = {
      module: window.location.pathname,
      status: 'Failed',
      type: error.response?.status ? `HTTP ${error.response.status}` : 'Network Error',
      service: error.config?.url ? `API: ${error.config.url}` : 'API Request',
      cause: error.message || 'Unknown API Error',
      logs: JSON.stringify(error.response?.data || {}),
    };
    window.dispatchEvent(new CustomEvent('api-failure', { detail: failureDetail }));

    if (error.response?.status === 401) {
      // Clear stale session
      localStorage.removeItem('corvex_user');
      localStorage.removeItem('corvex_token');
    }
    return Promise.reject(error);
  }
);

/**
 * Generic API request wrapper for standardized error handling.
 */
async function request(method, url, data = null, params = {}) {
  try {
    const response = await apiClient({ method, url, data, params });
    // Assume response.data is formatted like { success, data, ... } from the backend
    if (response.data && typeof response.data === 'object' && 'success' in response.data) {
       return response.data;
    }
    // Fallback if backend doesn't wrap in { success, data }
    return { success: true, data: response.data };
  } catch (error) {
    const message = error?.response?.data?.message || error?.message || 'Unknown API error';
    const detail = error?.response?.data?.error || '';
    console.error(`API Error [${method.toUpperCase()} ${url}]:`, message, detail);
    
    // Return a standardized failure object instead of throwing
    return { 
      success: false, 
      data: null, 
      message, 
      detail,
      // Provide empty array fallbacks for common list structures
      categories: [],
      pagination: { total: 0, page: 1, limit: 20, totalPages: 0 }
    };
  }
}

export const api = {
  get: (url, params = {}) => request('get', url, null, params),
  post: (url, data = {}) => request('post', url, data),
  put: (url, data = {}) => request('put', url, data),
  delete: (url, data = {}) => request('delete', url, data),
};

export default apiClient;
