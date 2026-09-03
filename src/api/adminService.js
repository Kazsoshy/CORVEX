import { api } from './apiClient.js';

export const fetchUsers = (params = {}) => api.get('/users', params);
