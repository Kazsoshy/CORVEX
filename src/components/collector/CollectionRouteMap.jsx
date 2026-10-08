import { useCallback, useEffect, useMemo, useState } from 'react';
import LeafletMap, { createCustomIcon } from '../common/LeafletMap';
import { fetchDrivingRoute, fetchRouteDepot } from '../../api/routingService';
import { formatCurrency } from '../../utils/formatters.js';
import { openPhoneCall } from '../../utils/mapsNavigation';
import { StatusBadge } from '../StatusBadge';
import { LoadingState } from '../shared/LoadingState';

function stopCoords(stop) {
  const lat = Number(stop.latitude);
  const lng = Number(stop.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return null;
}

export default function CollectionRouteMap({
  stops,
  showToast,
  onRoadStats,
  navigate,
}) {
  const [orderMode, setOrderMode] = useState('saw');
  const [depot, setDepot] = useState(null);
  const [routeData, setRouteData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  const coordStops = useMemo(
    () => (stops || []).map((s) => ({ ...s, coords: stopCoords(s) })).filter((s) => s.coords),
    [stops]
  );

  const loadRoute = useCallback(async () => {
    if (!coordStops.length) {
      setRouteData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const payload = coordStops.map((s) => ({
      id: s.id,
      customer_id: s.id,
      latitude: s.coords.lat,
      longitude: s.coords.lng,
      rank: s.rank,
      customer_name: s.customerName,
      address: s.address,
      outstanding_balance: s.outstandingBalance,
      days_overdue: s.daysOverdue,
      saw_score: s.sawScore,
      status: s.status,
      phone: s.phone,
    }));
    const res = await fetchDrivingRoute(orderMode, payload);
    if (res.success) {
      setRouteData(res.data);
      onRoadStats?.(res.data?.road);
      if (res.data?.road?.error && showToast) {
        showToast(`Road routing fallback: ${res.data.road.error}`, 'error');
      }
    } else {
      showToast?.(res.message || 'Road route unavailable.', 'error');
      setRouteData(null);
    }
    setLoading(false);
  }, [coordStops, orderMode, onRoadStats, showToast]);

  useEffect(() => {
    fetchRouteDepot().then((r) => {
      if (r.success) setDepot(r.data);
    });
  }, []);

  useEffect(() => {
    loadRoute();
  }, [loadRoute]);

  const orderedStops = routeData?.orderedStops?.length
    ? routeData.orderedStops
    : coordStops.map((s, i) => ({ ...s, routeIndex: i + 1 }));

  const mapCenter = useMemo(() => {
    if (depot?.latitude && depot?.longitude) return [depot.latitude, depot.longitude];
    if (coordStops[0]?.coords) return [coordStops[0].coords.lat, coordStops[0].coords.lng];
    return [7.0731, 125.6128];
  }, [depot, coordStops]);

  const fitBounds = useMemo(() => {
    const points = [];
    if (depot?.latitude != null) points.push([depot.latitude, depot.longitude]);
    orderedStops.forEach((s) => {
      const lat = Number(s.lat ?? s.latitude ?? s.coords?.lat);
      const lng = Number(s.lon ?? s.longitude ?? s.coords?.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) points.push([lat, lng]);
    });
    return points.length >= 2 ? points : null;
  }, [depot, orderedStops]);

  const markers = useMemo(() => {
    const list = [];
    if (depot?.latitude != null && depot?.longitude != null) {
      list.push({
        id: 'depot',
        position: [depot.latitude, depot.longitude],
        label: 'B',
        color: '#255684',
        popupContent: (
          <div>
            <strong>{depot.name || 'Branch'}</strong>
            <div style={{ fontSize: '0.85rem', marginTop: 4 }}>Start / depot</div>
            <div style={{ fontSize: '0.82rem', color: '#818697' }}>{depot.address || '—'}</div>
          </div>
        ),
      });
    }
    orderedStops.forEach((stop) => {
      const lat = Number(stop.lat ?? stop.latitude ?? stop.coords?.lat);
      const lng = Number(stop.lon ?? stop.longitude ?? stop.coords?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const id = String(stop.id);
      const selected = selectedId === id;
      list.push({
        id,
        position: [lat, lng],
        label: String(stop.routeIndex ?? stop.rank ?? ''),
        color: selected ? '#0c1031' : stop.status === 'Completed' ? '#255684' : '#0c1031',
        icon: createCustomIcon(
          selected ? '#0c1031' : stop.status === 'Completed' ? '#255684' : '#0c1031',
          String(stop.routeIndex ?? stop.rank ?? '')
        ),
        popupContent: (
          <div>
            <strong>#{stop.routeIndex ?? stop.rank} · {stop.customer_name || stop.customerName}</strong>
            <div style={{ marginTop: 6, fontSize: '0.85rem' }}>
              SAW rank #{stop.sawRank ?? stop.rank ?? '—'} · {formatCurrency(stop.outstanding_balance ?? stop.outstandingBalance ?? 0)}
            </div>
            <div style={{ fontSize: '0.82rem', color: '#818697' }}>{stop.address || '—'}</div>
          </div>
        ),
      });
    });
    return list;
  }, [depot, orderedStops, selectedId]);

  const roadPositions = routeData?.road?.positions?.length
    ? routeData.road.positions
    : fitBounds || [];

  const polylines = [
    {
      id: 'osrm-road',
      positions: roadPositions,
      color: orderMode === 'travel' ? '#0c1031' : '#0c1031',
      weight: 4,
      opacity: 0.85,
    },
  ];

  if (!coordStops.length) {
    return null;
  }

  return (
    <div className="grid gap-4" style={{ marginTop: 16 }}>
      <div
        className="panel"
        style={{
          padding: '12px 16px',
          background: 'var(--surface)',
          border: '1px solid var(--surface-3)',
          borderRadius: 8,
        }}
      >
        <p style={{ margin: '0 0 10px', fontSize: '0.88rem', color: '#818697', lineHeight: 1.5 }}>
          <strong style={{ color: '#0c1031' }}>SAW</strong> ranks collection priority (who to visit first).{' '}
          <strong style={{ color: '#0c1031' }}>OSRM</strong> draws the driving path on OpenStreetMap roads.
          Switch order to compare <em>priority</em> vs <em>minimum travel</em>.
        </p>
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="segmented-control">
            <button
              type="button"
              className={orderMode === 'saw' ? 'segment active' : 'segment'}
              onClick={() => setOrderMode('saw')}
            >
              SAW priority order
            </button>
            <button
              type="button"
              className={orderMode === 'travel' ? 'segment active' : 'segment'}
              onClick={() => setOrderMode('travel')}
            >
              Travel optimized
            </button>
          </div>
          <div style={{ fontSize: '0.85rem', color: '#818697' }}>
            {loading ? 'Calculating route…' : (
              <>
                Road: {routeData?.road?.distanceKm != null ? `${routeData.road.distanceKm} km` : '—'}
                {routeData?.road?.durationMin != null ? ` · ~${routeData.road.durationMin} min drive` : ''}
                {routeData?.road?.provider === 'straight-line-fallback' ? ' (fallback)' : ' · OSRM'}
              </>
            )}
          </div>
        </div>
        {routeData?.legend?.[orderMode] ? (
          <p className="muted" style={{ margin: '10px 0 0', fontSize: '0.82rem' }}>
            {routeData.legend[orderMode]}
          </p>
        ) : null}
      </div>

      {loading && !routeData ? (
        <LoadingState message="Loading road route from OSRM…" />
      ) : (
        <LeafletMap
          center={mapCenter}
          zoom={13}
          height={520}
          markers={markers}
          polylines={polylines}
          fitBounds={fitBounds}
        />
      )}

      <div className="corvex-table-wrapper">
        <table className="corvex-table">
          <thead>
            <tr>
              <th>#</th>
              <th>SAW</th>
              <th>Customer</th>
              <th>Balance</th>
              <th>Overdue</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {orderedStops.map((stop) => {
              const id = String(stop.id);
              const name = stop.customer_name || stop.customerName;
              return (
                <tr
                  key={id}
                  className={selectedId === id ? 'clickable-row active' : 'clickable-row'}
                  onClick={() => setSelectedId(id)}
                >
                  <td><strong>{stop.routeIndex ?? '—'}</strong></td>
                  <td>#{stop.sawRank ?? stop.rank ?? '—'}</td>
                  <td>{name}</td>
                  <td>{formatCurrency(stop.outstanding_balance ?? stop.outstandingBalance ?? 0)}</td>
                  <td>{stop.days_overdue ?? stop.daysOverdue ?? 0}d</td>
                  <td><StatusBadge status={stop.status} /></td>
                  <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="button secondary"
                      type="button"
                      style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                      disabled={!navigate}
                      onClick={() => navigate?.(`/collector/map/${id}?from=route`)}
                    >
                      Navigate
                    </button>
                    <button
                      className="button ghost"
                      type="button"
                      style={{ padding: '4px 10px', fontSize: '0.8rem', marginLeft: 6 }}
                      onClick={() => openPhoneCall(stop.phone)}
                    >
                      Call
                    </button>
                    {navigate ? (
                      <button
                        className="icon-action-button"
                        type="button"
                        title="Account"
                        onClick={() => navigate(`/collector/account-detail/${id}?from=route`)}
                      >
                        →
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
