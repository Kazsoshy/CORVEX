import axios from 'axios';

const OSRM_URL = 'https://router.project-osrm.org';
const FUEL_EFFICIENCY_KM_PER_LITER = 10;
const FUEL_PRICE_PER_LITER = 60; // PHP

/**
 * Solves the Traveling Salesperson Problem (TSP) using OSRM Trip API.
 * Returns the optimized sequence of waypoints.
 * 
 * @param {Array} startCoord - [lat, lng] of the starting point (e.g., collector's location or branch)
 * @param {Array} stops - Array of customer objects that contain { latitude, longitude }
 * @returns {Promise<Array>} The re-ordered array of stops for the most efficient route
 */
export async function getOptimizedSequence(startCoord, stops) {
  if (!stops || stops.length === 0) return [];
  
  // OSRM expects coordinates in lng,lat format
  const coords = [startCoord, ...stops.map(s => [s.latitude, s.longitude])];
  const coordinatesString = coords.map(c => `${c[1]},${c[0]}`).join(';');
  
  try {
    // Request trip optimization, starting at first point, ending anywhere
    const res = await axios.get(`${OSRM_URL}/trip/v1/driving/${coordinatesString}?source=first&roundtrip=false`);
    if (res.data.code !== 'Ok') throw new Error(res.data.message);

    // The waypoints array contains the optimized order.
    // Index 0 is the startCoord. The remaining are the stops.
    const sortedWaypoints = res.data.waypoints.sort((a, b) => a.waypoint_index - b.waypoint_index);
    
    const optimizedStops = [];
    for (let i = 1; i < sortedWaypoints.length; i++) {
      // OSRM returns waypoint_index which correlates to the original array index
      // Original index 1 correlates to stops[0], index 2 to stops[1], etc.
      const originalIndex = sortedWaypoints[i].original_index - 1;
      if (originalIndex >= 0 && originalIndex < stops.length) {
        optimizedStops.push(stops[originalIndex]);
      }
    }
    return optimizedStops;
  } catch (error) {
    console.error('Failed to calculate optimized sequence:', error);
    return stops; // Fallback to original order
  }
}

/**
 * Calculates route metrics (distance, duration) using OSRM Route API.
 * 
 * @param {Array} startCoord - [lat, lng]
 * @param {Array} stops - Array of customer objects that contain { latitude, longitude }
 * @returns {Promise<Object>} { distanceMeters, durationSeconds }
 */
export async function getRouteMetrics(startCoord, stops) {
  if (!stops || stops.length === 0) return { distanceMeters: 0, durationSeconds: 0 };
  
  const coords = [startCoord, ...stops.map(s => [s.latitude, s.longitude])];
  const coordinatesString = coords.map(c => `${c[1]},${c[0]}`).join(';');
  
  try {
    const res = await axios.get(`${OSRM_URL}/route/v1/driving/${coordinatesString}?overview=false`);
    if (res.data.code !== 'Ok') throw new Error(res.data.message);
    
    const route = res.data.routes[0];
    return {
      distanceMeters: route.distance,
      durationSeconds: route.duration
    };
  } catch (error) {
    console.error('Failed to get route metrics:', error);
    return { distanceMeters: 0, durationSeconds: 0 };
  }
}

/**
 * Calculates savings between an original route and an optimized route.
 * 
 * @param {Object} original - Metrics for original route { distanceMeters, durationSeconds }
 * @param {Object} optimized - Metrics for optimized route { distanceMeters, durationSeconds }
 * @returns {Object} Calculated savings
 */
export function calculateSavings(original, optimized) {
  const distanceSavedKm = (original.distanceMeters - optimized.distanceMeters) / 1000;
  const timeSavedSeconds = original.durationSeconds - optimized.durationSeconds;
  
  // If optimized is somehow worse (can happen with simple direct routing vs complex one-ways, though rare with TSP), cap at 0
  const distSavings = Math.max(0, distanceSavedKm);
  const timeSavings = Math.max(0, timeSavedSeconds);
  
  const fuelSavedLiters = distSavings / FUEL_EFFICIENCY_KM_PER_LITER;
  const fuelSavedPHP = fuelSavedLiters * FUEL_PRICE_PER_LITER;
  
  return {
    originalDistanceKm: original.distanceMeters / 1000,
    optimizedDistanceKm: optimized.distanceMeters / 1000,
    distanceSavedKm: distSavings,
    
    originalDurationSec: original.durationSeconds,
    optimizedDurationSec: optimized.durationSeconds,
    timeSavedSeconds: timeSavings,
    
    fuelSavedLiters,
    fuelSavedPHP
  };
}

/**
 * Helper to format seconds into a readable string (e.g., "1h 15m")
 */
export function formatDuration(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
