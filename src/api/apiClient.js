import axios from 'axios';

// Base URL for all API calls — reads from Vite env if available, fallback to localhost
const BASE_URL = import.meta.env?.VITE_API_URL || 'http://localhost:5000';

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
    // Send user identity header so the backend can enforce role/branch middleware
    try {
      const raw = localStorage.getItem('corvex_user');
      if (raw) {
        const user = JSON.parse(raw);
        if (user?.id) {
          config.headers['X-User-Id'] = String(user.id);
        }
      }
    } catch {
      // malformed localStorage entry — ignore
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — handle global errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear stale session
      localStorage.removeItem('corvex_user');
      localStorage.removeItem('corvex_token');
    }
    return Promise.reject(error);
  }
);

export default apiClient;
