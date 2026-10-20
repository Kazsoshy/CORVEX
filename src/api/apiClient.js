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

// Response interceptor — keep the sliding session and end idle sessions
apiClient.interceptors.response.use(
  (response) => {
    const nextToken = response.headers?.['x-session-token'];
    if (nextToken) localStorage.setItem('corvex_token', nextToken);
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      const message = error.response?.data?.message || '';
      localStorage.removeItem('corvex_user');
      localStorage.removeItem('corvex_token');
      if (/inactivity/i.test(message)) {
        sessionStorage.setItem(
          'corvex_auth_notice',
          'Your session ended after 15 minutes of inactivity. Sign in again.'
        );
        window.dispatchEvent(new Event('session-ended'));
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
