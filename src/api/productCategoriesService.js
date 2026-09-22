import apiClient from './apiClient';

export const fetchProductCategories = async (params = {}) => {
  const query = new URLSearchParams(params).toString();
  const res = await apiClient.get(`/product-categories${query ? `?${query}` : ''}`);
  return res.data;
};

export const fetchProductCategoryById = async (id) => {
  const res = await apiClient.get(`/product-categories/${id}`);
  return res.data;
};

export const createProductCategory = async (data) => {
  const res = await apiClient.post('/product-categories', data);
  return res.data;
};

export const updateProductCategory = async (id, data) => {
  const res = await apiClient.put(`/product-categories/${id}`, data);
  return res.data;
};

export const archiveProductCategory = async (id) => {
  const res = await apiClient.delete(`/product-categories/${id}`);
  return res.data;
};
