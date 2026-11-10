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

function requestBearer(config) {
  const headers = config?.headers;
  if (!headers) return '';
  const raw = typeof headers.get === 'function'
    ? (headers.get('Authorization') || headers.get('authorization'))
    : (headers.Authorization || headers.authorization || '');
  return String(raw || '').replace(/^Bearer\s+/i, '').trim();
}

function isCredentialCheck(config) {
  const url = String(config?.url || '');
  return url.includes('/auth/login') || url.includes('/portal/');
}

// Response interceptor — keep the sliding session and end rejected sessions
apiClient.interceptors.response.use(
  (response) => {
    const nextToken = response.headers?.['x-session-token'];
    if (nextToken) localStorage.setItem('corvex_token', nextToken);
    return response;
  },
  (error) => {
    const message = String(error.response?.data?.message || '');
    const rejectedSession = error.response?.status === 401
      && !isCredentialCheck(error.config)
      && !/password/i.test(message);
    if (rejectedSession) {
      const failed = requestBearer(error.config);
      const current = localStorage.getItem('corvex_token') || '';
      const staleResponse = Boolean(failed && current && failed !== current);
      if (!staleResponse && (current || failed)) {
        const alreadyCleared = !current;
        localStorage.removeItem('corvex_user');
        localStorage.removeItem('corvex_token');
        localStorage.removeItem('corvex_last_activity');
        localStorage.removeItem('corvex_idle_prompt_at');
        if (!alreadyCleared || !sessionStorage.getItem('corvex_auth_notice')) {
          sessionStorage.setItem(
            'corvex_auth_notice',
            /inactivity/i.test(message)
              ? 'Your session ended after a period of inactivity. Sign in again.'
              : 'Your session is no longer valid. Sign in again.'
          );
        }
        window.dispatchEvent(new Event('corvex-signed-out'));
        window.dispatchEvent(new Event('session-ended'));
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
