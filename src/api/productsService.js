import { api } from './apiClient.js';

export const fetchProducts = (params = {}) => api.get('/products', params);
export const fetchProductById = (id) => api.get(`/products/${id}`);
export const restockProduct = (data) => api.post('/products/restock', data);
export const transferProduct = (data) => api.post('/products/transfer', data);
