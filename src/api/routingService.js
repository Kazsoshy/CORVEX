import apiClient from './apiClient.js';

export async function fetchRouteDepot() {
  try {
    const response = await apiClient.get('/collector/route/depot');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch route depot:', error);
    return { success: false, data: null };
  }
}

/**
 * @param {'saw'|'travel'} orderMode
 * @param {Array<object>} stops — route stops with id, latitude, longitude, rank, etc.
 */
export async function fetchDrivingRoute(orderMode, stops) {
  try {
    const response = await apiClient.post('/collector/route/driving', {
      order_mode: orderMode,
      stops,
    });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch driving route:', error);
    return {
      success: false,
      message: error.response?.data?.message || 'Could not load road route.',
    };
  }
}
