import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';

/**
 * A component that injects leaflet-routing-machine into the react-leaflet map.
 * @param {Array} waypoints - Array of [lat, lng] coordinates
 * @param {String} color - Hex color for the route line
 */
export default function RoutingComponent({ waypoints, color = '#2563eb' }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !waypoints || waypoints.length < 2) return;

    const routingWaypoints = waypoints.map(wp => 
      Array.isArray(wp) ? L.latLng(wp[0], wp[1]) : wp
    );

    const routingControl = L.Routing.control({
      waypoints: routingWaypoints,
      lineOptions: {
        styles: [{ color, opacity: 0.8, weight: 5 }]
      },
      show: false, // Hides the text itinerary panel
      addWaypoints: false, // Prevents adding waypoints by clicking
      routeWhileDragging: false,
      fitSelectedRoutes: true,
      showAlternatives: false,
      createMarker: () => null // Prevents default routing markers (we use our own)
    }).addTo(map);

    // Clean up the routing control when the component unmounts or waypoints change
    return () => {
      if (map && routingControl) {
        map.removeControl(routingControl);
      }
    };
  }, [map, waypoints, color]);

  return null;
}
