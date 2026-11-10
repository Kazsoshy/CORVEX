import { useEffect, useMemo, useRef, useState } from 'react';
import LeafletMap, { createCustomIcon } from '../common/LeafletMap';
import { fetchDrivingRoute, fetchRouteDepot } from '../../api/routingService';
import { formatCurrency, formatPhone } from '../../utils/formatters.js';
import {
  hasCallablePhone,
  openExternalNavigation,
  openPhoneCall,
} from '../../utils/mapsNavigation';
import { StatusBadge } from '../StatusBadge';
import { LoadingState } from '../shared/LoadingState';
import { NavIcon } from '../../navIcons';
import { brand, brandDark, brandHover, textMuted } from '../../theme/palette.js';

function stopCoords(stop) {
  const lat = Number(stop.latitude);
  const lng = Number(stop.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return null;
}

function stopsIdentityKey(stops) {
  return (stops || [])
    .map((s) => `${s.id}:${s.latitude}:${s.longitude}:${s.routeSequence ?? s.rank ?? ''}:${s.status ?? ''}`)
    .join('|');
}

export default function CollectionRouteMap({
  stops,
  showToast,
  onRoadStats,
  navigate,
}) {
  const [depot, setDepot] = useState(null);
  const [routeData, setRouteData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [isMaximized, setIsMaximized] = useState(false);

  const showToastRef = useRef(showToast);
  const onRoadStatsRef = useRef(onRoadStats);
  showToastRef.current = showToast;
  onRoadStatsRef.current = onRoadStats;

  const stopsKey = useMemo(() => stopsIdentityKey(stops), [stops]);

  const coordStops = useMemo(
    () => (stops || []).map((s) => ({ ...s, coords: stopCoords(s) })).filter((s) => s.coords),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stopsKey]
  );

  useEffect(() => {
    fetchRouteDepot().then((r) => {
      if (r.success) setDepot(r.data);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
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
        rank: s.sawRank ?? s.rank,
        saw_score: s.sawScore,
        customer_name: s.customerName,
        address: s.address,
        outstanding_balance: s.outstandingBalance,
        days_overdue: s.daysOverdue,
        status: s.status === 'Completed' ? 'Completed' : 'Pending',
        visit_outcome: s.visitOutcome || null,
        phone: s.phone,
      }));
      const res = await fetchDrivingRoute('recommended', payload);
      if (cancelled) return;
      if (res.success) {
        setRouteData(res.data);
        onRoadStatsRef.current?.(res.data?.road);
      } else {
        showToastRef.current?.(res.message || 'Route path unavailable.', 'error');
        setRouteData(null);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [coordStops]);

  const orderedStops = useMemo(() => {
    const raw = routeData?.orderedStops?.length
      ? routeData.orderedStops
      : coordStops.map((s, i) => ({ ...s, routeIndex: s.routeSequence ?? i + 1 }));
    return raw.map((stop, idx) => {
      const id = String(stop.id ?? stop.customer_id);
      const original = coordStops.find((c) => String(c.id) === id) || {};
      const visitStatus =
        (stop.status || original.status) === 'Completed' ? 'Completed' : 'Pending';
      return {
        ...original,
        ...stop,
        id,
        customerName: stop.customer_name || stop.customerName || original.customerName || 'Customer',
        outstandingBalance: Number(
          stop.outstanding_balance ?? stop.outstandingBalance ?? original.outstandingBalance ?? 0
        ),
        status: visitStatus,
        visitOutcome: stop.visit_outcome ?? stop.visitOutcome ?? original.visitOutcome ?? null,
        phone: stop.phone ?? original.phone ?? '',
        address: stop.address ?? original.address ?? '',
        routeIndex: stop.routeIndex ?? stop.route_sequence ?? idx + 1,
        latitude: Number(stop.lat ?? stop.latitude ?? original.coords?.lat),
        longitude: Number(stop.lon ?? stop.longitude ?? original.coords?.lng),
      };
    });
  }, [routeData, coordStops]);

  useEffect(() => {
    if (!orderedStops.length) {
      setSelectedId(null);
      return;
    }
    if (selectedId && orderedStops.some((s) => String(s.id) === String(selectedId))) {
      return;
    }
    const nextPending = orderedStops.find((s) => s.status !== 'Completed') || orderedStops[0];
    setSelectedId(String(nextPending.id));
  }, [orderedStops, selectedId]);

  const selectedStop = useMemo(
    () => orderedStops.find((s) => String(s.id) === String(selectedId)) || null,
    [orderedStops, selectedId]
  );

  const nextStop = useMemo(
    () => orderedStops.find((s) => s.status !== 'Completed') || null,
    [orderedStops]
  );

  const mapCenter = useMemo(() => {
    if (depot?.latitude && depot?.longitude) return [depot.latitude, depot.longitude];
    if (coordStops[0]?.coords) return [coordStops[0].coords.lat, coordStops[0].coords.lng];
    return [7.0731, 125.6128];
  }, [depot, coordStops]);

  const fitBounds = useMemo(() => {
    const points = [];
    if (depot?.latitude != null) points.push([depot.latitude, depot.longitude]);
    orderedStops.forEach((s) => {
      if (Number.isFinite(s.latitude) && Number.isFinite(s.longitude)) {
        points.push([s.latitude, s.longitude]);
      }
    });
    return points.length >= 2 ? points : null;
  }, [depot, orderedStops]);

  const handleCallStop = (stop) => {
    if (!openPhoneCall(stop?.phone)) {
      showToastRef.current?.('No valid contact number on file for this customer.', 'error');
    }
  };

  const handleNavigateStop = (stop) => {
    const ok = openExternalNavigation({
      latitude: stop?.latitude,
      longitude: stop?.longitude,
      address: stop?.address,
      originLatitude: depot?.latitude,
      originLongitude: depot?.longitude,
    });
    if (!ok) {
      showToastRef.current?.('Location coordinates or address unavailable for navigation.', 'error');
    }
  };

  const markers = useMemo(() => {
    const list = [];
    if (depot?.latitude != null && depot?.longitude != null) {
      list.push({
        id: 'depot',
        position: [depot.latitude, depot.longitude],
        label: 'B',
        color: brand,
        popupContent: (
          <div style={{ minWidth: 180 }}>
            <strong>{depot.name || 'Branch Starting Point'}</strong>
            <div style={{ fontSize: '0.82rem', marginTop: 4, color: textMuted }}>
              {depot.address || 'Starting location'}
            </div>
          </div>
        ),
      });
    }
    orderedStops.forEach((stop) => {
      if (!Number.isFinite(stop.latitude) || !Number.isFinite(stop.longitude)) return;
      const id = String(stop.id);
      const selected = String(selectedId) === id;
      const markerColor = selected ? brandDark : stop.status === 'Completed' ? brandHover : brand;
      const callable = hasCallablePhone(stop.phone);

      list.push({
        id,
        position: [stop.latitude, stop.longitude],
        label: String(stop.routeIndex),
        color: markerColor,
        onClick: () => setSelectedId(id),
        icon: createCustomIcon(markerColor, String(stop.routeIndex)),
        popupContent: (
          <div style={{ minWidth: 220, lineHeight: 1.45 }}>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: brandDark }}>
              Stop #{stop.routeIndex} · {stop.customerName}
            </div>
            <div style={{ marginTop: 6, fontSize: '0.85rem' }}>
              <strong>Balance:</strong> {formatCurrency(stop.outstandingBalance)}
            </div>
            <div style={{ marginTop: 4, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              <strong>Status:</strong> <StatusBadge status={stop.status} />
            </div>
            {stop.phone && stop.phone !== '—' ? (
              <div style={{ marginTop: 4, fontSize: '0.82rem', color: textMuted }}>
                <strong>Contact:</strong> {formatPhone(stop.phone)}
              </div>
            ) : (
              <div style={{ marginTop: 4, fontSize: '0.82rem', color: textMuted }}>
                No contact number on file
              </div>
            )}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                marginTop: 10,
                paddingTop: 8,
                borderTop: '1px solid var(--surface-3)',
              }}
            >
              {callable ? (
                <button
                  type="button"
                  className="button secondary"
                  style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                  onClick={() => handleCallStop(stop)}
                >
                  Call
                </button>
              ) : null}
              <button
                type="button"
                className="button secondary"
                style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                onClick={() => handleNavigateStop(stop)}
              >
                Navigate
              </button>
              {navigate ? (
                <button
                  type="button"
                  className="button"
                  style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                  onClick={() => navigate(`/collector/account-detail/${id}?from=route`)}
                >
                  View Details
                </button>
              ) : null}
            </div>
          </div>
        ),
      });
    });
    return list;
  }, [depot, orderedStops, selectedId, navigate]);

  const roadPositions = routeData?.road?.positions?.length
    ? routeData.road.positions
    : fitBounds || [];

  const polylines = [
    {
      id: 'recommended-road',
      positions: roadPositions,
      color: brand,
      weight: 4,
      opacity: 0.85,
    },
  ];

  if (!coordStops.length) {
    return null;
  }

  return (
    <div className="grid gap-4" style={{ marginTop: 8 }}>
      <div
        className="flex flex-wrap gap-3 items-center justify-between"
        style={{
          padding: '10px 14px',
          background: 'var(--surface)',
          border: '1px solid var(--surface-3)',
          borderRadius: 8,
        }}
      >
        <div className="flex flex-wrap items-center gap-3" style={{ fontSize: '0.88rem' }}>
          {nextStop ? (
            <span>
              <strong>Next Stop:</strong> #{nextStop.routeIndex} {nextStop.customerName}
            </span>
          ) : (
            <span>
              <strong>All assigned visits completed for today</strong>
            </span>
          )}
          {!loading && routeData?.road?.distanceKm != null ? (
            <span style={{ color: textMuted }}>
              · Est. route: {routeData.road.distanceKm} km
              {routeData.road.durationMin != null ? ` (~${routeData.road.durationMin} min drive)` : ''}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="button secondary"
            style={{ padding: '6px 12px', fontSize: '0.82rem' }}
            onClick={() => setIsMaximized((prev) => !prev)}
            aria-pressed={isMaximized}
          >
            <span className="flex items-center gap-1.5">
              <NavIcon name={isMaximized ? 'minimize' : 'maximize'} />
              {isMaximized ? 'Minimize Map' : 'Maximize Map'}
            </span>
          </button>
        </div>
      </div>

      {loading && !routeData ? (
        <LoadingState variant="map" message="Loading route map…" />
      ) : (
        <LeafletMap
          center={mapCenter}
          zoom={13}
          height={isMaximized ? 760 : 480}
          markers={markers}
          polylines={polylines}
          fitBounds={fitBounds}
          showFullscreen
        />
      )}

      {selectedStop ? (
        <div
          className="panel"
          style={{
            padding: '14px 16px',
            background: 'var(--surface)',
            border: '1px solid var(--surface-3)',
            borderRadius: 8,
          }}
        >
          <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span style={{ fontWeight: 700, fontSize: '1rem', color: brandDark }}>
                  Stop #{selectedStop.routeIndex} · {selectedStop.customerName}
                </span>
                <StatusBadge status={selectedStop.status} />
                {selectedStop.visitOutcome ? (
                  <span className="muted" style={{ fontSize: '0.82rem' }}>
                    ({selectedStop.visitOutcome})
                  </span>
                ) : null}
              </div>
              <div
                className="flex flex-wrap gap-4 mt-1.5"
                style={{ fontSize: '0.86rem', color: textMuted }}
              >
                <span>
                  <strong style={{ color: brandDark }}>Outstanding Balance:</strong>{' '}
                  {formatCurrency(selectedStop.outstandingBalance)}
                </span>
                <span>
                  <strong style={{ color: brandDark }}>Contact:</strong>{' '}
                  {hasCallablePhone(selectedStop.phone)
                    ? formatPhone(selectedStop.phone)
                    : 'No contact number'}
                </span>
                {selectedStop.address && selectedStop.address !== '—' ? (
                  <span>{selectedStop.address}</span>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              {hasCallablePhone(selectedStop.phone) ? (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => handleCallStop(selectedStop)}
                >
                  Call
                </button>
              ) : null}
              <button
                type="button"
                className="button secondary"
                onClick={() => handleNavigateStop(selectedStop)}
              >
                Navigate
              </button>
              {navigate ? (
                <button
                  type="button"
                  className="button"
                  onClick={() =>
                    navigate(`/collector/account-detail/${selectedStop.id}?from=route`)
                  }
                >
                  View Details
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
