import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, Polygon, useMap } from 'react-leaflet';
import L from 'leaflet';
import { brand } from '../../theme/palette.js';
import { NavIcon } from '../../navIcons';

function FitBounds({ bounds, padding = [36, 36] }) {
  const map = useMap();
  useEffect(() => {
    if (!bounds?.length) return;
    try {
      map.fitBounds(bounds, { padding });
    } catch {
      /* ignore invalid bounds */
    }
  }, [bounds, map, padding]);
  return null;
}

function InvalidateSize({ revision = 0 }) {
  const map = useMap();
  useEffect(() => {
    const timers = [0, 80, 200, 400].map((ms) =>
      window.setTimeout(() => {
        try {
          map.invalidateSize({ animate: false });
        } catch {
          /* map may be unmounted */
        }
      }, ms)
    );
    const onResize = () => {
      try {
        map.invalidateSize({ animate: false });
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('resize', onResize);
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      window.removeEventListener('resize', onResize);
    };
  }, [map, revision]);
  return null;
}

function OverlayPopup({ overlay }) {
  if (!overlay?.popupContent && !overlay?.popup) return null;
  return (
    <Popup>
      <div style={{ padding: '4px', minWidth: 160 }}>
        {overlay.popupContent || overlay.popup}
      </div>
    </Popup>
  );
}

// Fix for default marker icon in leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// A custom DivIcon creator for more modern looking markers if needed
export const createCustomIcon = (color = brand, label = '') => {
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
 * @param {Boolean} showFullscreen - Show fullscreen control (default true)
 */
export default function LeafletMap({
  markers = [],
  polylines = [],
  circles = [],
  polygons = [],
  center = [12.8797, 121.7740], // Default center: Philippines
  zoom = 5,
  height = 560,
  fitBounds = null,
  showFullscreen = true,
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sizeRevision, setSizeRevision] = useState(0);
  const resolvedHeight = typeof height === 'number' ? `${height}px` : height;

  useEffect(() => {
    if (!isFullscreen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isFullscreen]);

  useEffect(() => {
    setSizeRevision((current) => current + 1);
  }, [isFullscreen]);

  return (
    <div
      className={`leaflet-map-root${isFullscreen ? ' is-fullscreen-active' : ''}`}
      style={{ height: resolvedHeight, width: '100%' }}
    >
      <div
        className={`leaflet-map-shell${isFullscreen ? ' is-fullscreen' : ''}`}
        style={isFullscreen ? undefined : {
          height: '100%',
          width: '100%',
          borderRadius: '8px',
          overflow: 'hidden',
          border: '1px solid var(--surface-3)',
        }}
      >
        {showFullscreen ? (
          <div className="leaflet-map-controls" role="toolbar" aria-label="Map view controls">
            <button
              type="button"
              className="leaflet-map-control-btn"
              onClick={() => setIsFullscreen((current) => !current)}
              aria-pressed={isFullscreen}
              aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}
              title={isFullscreen ? 'Exit full screen' : 'Full screen'}
            >
              <NavIcon name={isFullscreen ? 'minimize' : 'maximize'} className="nav-svg" />
            </button>
          </div>
        ) : null}

        <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <InvalidateSize revision={sizeRevision} />
          {fitBounds?.length ? <FitBounds bounds={fitBounds} /> : null}

          {polygons.map((polygon) => (
            <Polygon
              key={polygon.id}
              positions={polygon.positions}
              pathOptions={{
                color: polygon.color || brand,
                weight: polygon.weight ?? 2,
                fillColor: polygon.fillColor || polygon.color || brand,
                fillOpacity: polygon.fillOpacity ?? 0.18,
                opacity: polygon.opacity ?? 0.85,
                dashArray: polygon.dashArray,
              }}
            >
              <OverlayPopup overlay={polygon} />
            </Polygon>
          ))}

          {circles.map((circle) => (
            <Circle
              key={circle.id}
              center={circle.center}
              radius={circle.radius ?? 400}
              pathOptions={{
                color: circle.color || brand,
                weight: circle.weight ?? 1,
                fillColor: circle.fillColor || circle.color || brand,
                fillOpacity: circle.fillOpacity ?? 0.22,
                opacity: circle.opacity ?? 0.8,
              }}
            >
              <OverlayPopup overlay={circle} />
            </Circle>
          ))}

          {markers.map((marker) => (
            <Marker
              key={marker.id}
              position={marker.position}
              icon={marker.icon || (marker.color ? createCustomIcon(marker.color, marker.label) : new L.Icon.Default())}
            >
              {(marker.popupContent || marker.popup) && (
                <Popup>
                  <div style={{ padding: '4px', minWidth: 160 }}>
                    {marker.popupContent || marker.popup}
                  </div>
                </Popup>
              )}
            </Marker>
          ))}

          {polylines.map((line) => (
            <Polyline
              key={line.id}
              positions={line.positions}
              color={line.color || brand}
              weight={line.weight ?? 3}
              opacity={line.opacity ?? 0.7}
              dashArray={line.dashArray}
            >
              <OverlayPopup overlay={line} />
            </Polyline>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
