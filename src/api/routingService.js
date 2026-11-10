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
 * Fetch the Priority-Aware optimized driving route on OpenStreetMap roads.
 * @param {'recommended'|'saw'|'travel'} [orderMode='recommended']
 * @param {Array<object>} stops — route stops with id, latitude, longitude, rank, saw_score, etc.
 * @param {{ latitude: number, longitude: number } | null} [origin=null]
 */
export async function fetchDrivingRoute(orderMode = 'recommended', stops = [], origin = null) {
  try {
    const response = await apiClient.post('/collector/route/driving', {
      order_mode: orderMode || 'recommended',
      stops,
      ...(origin ? { origin } : {}),
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
