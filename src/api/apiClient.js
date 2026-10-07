import axios from 'axios';

// Base URL for all API calls — must resolve to .../api (e.g. /api or http://localhost:5000/api)
function resolveApiBaseUrl() {
  const raw = import.meta.env?.VITE_API_URL || '/api';
  if (!raw.startsWith('http')) {
    return raw.startsWith('/') ? raw : `/${raw}`;
  }
  const trimmed = raw.replace(/\/$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

const BASE_URL = resolveApiBaseUrl();

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
