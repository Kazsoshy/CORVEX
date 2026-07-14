import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';

// Fix for default marker icon in leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// A custom DivIcon creator for more modern looking markers if needed
export const createCustomIcon = (color = '#2563eb', label = '') => {
  return L.divIcon({
    className: 'custom-leaflet-marker',
    html: `<div style="
      background-color: ${color};
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 10px;
      font-weight: bold;
    ">${label}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
};

/**
 * Reusable LeafletMap Component
 * @param {Array} markers - Array of { id, position: [lat, lng], popup, icon, color, label }
 * @param {Array} polylines - Array of { id, positions: [[lat, lng], ...], color }
 * @param {Array} center - [lat, lng]
 * @param {Number} zoom - Zoom level
 * @param {String|Number} height - Map height
 */
export default function LeafletMap({ 
  markers = [], 
  polylines = [], 
  center = [12.8797, 121.7740], // Default center: Philippines
  zoom = 5,
  height = 560
}) {
  return (
    <div style={{ height, width: '100%', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--surface-3)' }}>
      <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Domina Temp'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {markers.map((marker) => (
          <Marker 
            key={marker.id} 
            position={marker.position}
            icon={marker.icon || (marker.color ? createCustomIcon(marker.color, marker.label) : new L.Icon.Default())}
          >
            {marker.popup && (
              <Popup>
                <div style={{ padding: '4px' }}>
                  {marker.popup}
                </div>
              </Popup>
            )}
          </Marker>
        ))}

        {polylines.map((line) => (
          <Polyline 
            key={line.id} 
            positions={line.positions} 
            color={line.color || '#2563eb'}
            weight={3}
            opacity={0.7}
          />
        ))}
      </MapContainer>
    </div>
  );
}
