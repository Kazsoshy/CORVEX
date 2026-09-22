import apiClient from './apiClient';

export const fetchDigitalReceipts = async (params = {}) => {
  const query = new URLSearchParams(params).toString();
  const res = await apiClient.get(`/digital-receipts${query ? `?${query}` : ''}`);
  return res.data;
};

export const fetchDigitalReceiptById = async (id) => {
  const res = await apiClient.get(`/digital-receipts/${id}`);
  return res.data;
};
