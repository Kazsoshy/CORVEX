import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import LeafletMap from '../common/LeafletMap';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { getBranchMap, getSawMapRoads } from '../../api/branchManagerService.js';
import { getCurrentUser } from '../../api/authService.js';
import {
  MAP_MODES,
  PERIOD_OPTIONS,
  STAFF_TYPE_OPTIONS,
  STANDING_OPTIONS,
  buildBranchLeafletView,
  defaultModeForPage,
  hasCoords,
  manilaMapDate,
} from '../../utils/branchLeafletLayers.js';

function isCollectorStaffId(staffId, staff) {
  if (!staffId || staffId === 'all') return false;
  return (staff?.collectors || []).some((c) => String(c.id) === String(staffId));
}

function isSalesStaffId(staffId, staff) {
  if (!staffId || staffId === 'all') return false;
  return (staff?.salesAgents || []).some((a) => String(a.id) === String(staffId));
}

export function BranchLeafletPage({
  pageType,
  navigate,
  showToast,
  opsBase,
  branchName,
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const staffFromQuery = searchParams.get('staff') || 'all';
  const periodFromQuery = searchParams.get('period') || 'today';
  const customerFromQuery = searchParams.get('customer')
    || searchParams.get('customerId')
    || searchParams.get('customer_id')
    || '';
  const currentUser = getCurrentUser();
  const isOrgScope = ['operating_manager', 'super_admin'].includes(currentUser?.role?.slug);
  const scopedBranchLabel = branchName
    || currentUser?.branch?.name
    || (isOrgScope ? 'All Branches' : 'Your Branch');

  const [mode, setMode] = useState(() => (
    customerFromQuery ? 'customers' : (staffFromQuery !== 'all' ? 'routes' : defaultModeForPage(pageType))
  ));
  const [period, setPeriod] = useState(periodFromQuery === 'week' || periodFromQuery === 'month' ? periodFromQuery : 'today');
  const [branchId, setBranchId] = useState('all');
  const [staffType, setStaffType] = useState('all');
  const [staffId, setStaffId] = useState(staffFromQuery);
  const [standing, setStanding] = useState('all');
  const [search, setSearch] = useState('');
  const [focusCustomerId, setFocusCustomerId] = useState(customerFromQuery || null);
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [plannedRoads, setPlannedRoads] = useState([]);

  useEffect(() => {
    setStaffId(staffFromQuery);
    if (customerFromQuery) {
      setMode('customers');
      setFocusCustomerId(customerFromQuery);
    } else if (staffFromQuery !== 'all') {
      setMode('routes');
    }
  }, [staffFromQuery, customerFromQuery]);

  useEffect(() => {
    if (periodFromQuery === 'week' || periodFromQuery === 'month' || periodFromQuery === 'today') {
      setPeriod(periodFromQuery);
    }
  }, [periodFromQuery]);

  useEffect(() => {
    if (customerFromQuery) {
      setMode('customers');
      setFocusCustomerId(customerFromQuery);
      return;
    }
    if (staffFromQuery === 'all') setMode(defaultModeForPage(pageType));
  }, [pageType, staffFromQuery, customerFromQuery]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const result = await getBranchMap({ period });
      if (cancelled) return;
      if (result.success) {
        setPayload(result.data);
      } else {
        setPayload(null);
        showToast?.(result.message || 'Failed to load map data.', 'error');
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [period, showToast]);

  const staffPool = useMemo(() => {
    const staff = payload?.staff || { collectors: [], salesAgents: [] };
    if (!isOrgScope || branchId === 'all') return staff;
    return {
      collectors: (staff.collectors || []).filter((c) => Number(c.branchId) === Number(branchId)),
      salesAgents: (staff.salesAgents || []).filter((a) => Number(a.branchId) === Number(branchId)),
    };
  }, [payload, isOrgScope, branchId]);

  const shouldLoadPlannedRoads = mode === 'routes'
    && staffType !== 'sales'
    && !isSalesStaffId(staffId, staffPool);

  useEffect(() => {
    if (!shouldLoadPlannedRoads) {
      setPlannedRoads([]);
      return undefined;
    }
    let cancelled = false;
    const date = period === 'today'
      ? manilaMapDate()
      : (payload?.range?.end || manilaMapDate());
    const params = { date };
    const scopedBranch = isOrgScope ? branchId : 'all';
    if (scopedBranch !== 'all') params.branch_id = scopedBranch;
    if (staffId !== 'all' && isCollectorStaffId(staffId, staffPool)) {
      params.collector_id = staffId;
    }
    getSawMapRoads(params).then((result) => {
      if (cancelled) return;
      const roads = result.success ? (result.data || []) : [];
      // Only assigned/planned routes — never present eligible ranking as live tracking.
      setPlannedRoads(roads.filter((road) => road.listSource === 'assigned'));
      if (!result.success) {
        showToast?.(result.message || 'Planned collection routes are unavailable.', 'error');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [shouldLoadPlannedRoads, branchId, staffId, isOrgScope, period, payload?.range?.end, staffPool, showToast]);

  const view = useMemo(
    () => buildBranchLeafletView({
      payload,
      mode,
      staffId,
      staffType,
      paymentStatus: standing,
      search,
      navigate,
      opsBase,
      branchId: isOrgScope ? branchId : 'all',
      sawRoads: plannedRoads,
      focusCustomerId,
    }),
    [payload, mode, staffId, staffType, standing, search, navigate, opsBase, isOrgScope, branchId, plannedRoads, focusCustomerId]
  );

  const selectedBranch = (payload?.branches || []).find((branch) => (
    isOrgScope && branchId !== 'all'
      ? String(branch.id) === String(branchId)
      : hasCoords(branch.lat, branch.lng)
  ));
  const mapCenter = selectedBranch && hasCoords(selectedBranch.lat, selectedBranch.lng)
    ? [selectedBranch.lat, selectedBranch.lng]
    : (view.bounds[0] || [7.0731, 125.6128]);

  const searchMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || mode !== 'customers') return [];
    return (view.tableRows || []).slice(0, 8);
  }, [search, mode, view.tableRows]);

  if (loading && !payload) return <LoadingState variant="map" message="Loading field map..." />;

  return (
    <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
          <div>
            <p className="text-[0.82rem] font-bold tracking-widest uppercase text-navy/60 m-0">{scopedBranchLabel}</p>
            <h3>Field Map</h3>
            <p className="text-ink/70" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
              View your branch&apos;s customers and planned field activities.
            </p>
          </div>
        </div>

        <div className="segmented-control" style={{ marginBottom: 12 }}>
          {MAP_MODES.map((item) => (
            <button
              key={item.key}
              className={mode === item.key ? 'segment active' : 'segment'}
              type="button"
              onClick={() => {
                setMode(item.key);
                setFocusCustomerId(null);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="accounts-filters">
          {isOrgScope ? (
            <select
              className="filter-select"
              value={branchId}
              onChange={(e) => {
                setBranchId(e.target.value);
                setStaffId('all');
              }}
            >
              <option value="all">All Branches</option>
              {(payload?.branches || []).map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          ) : null}

          {mode === 'routes' ? (
            <select className="filter-select" value={period} onChange={(e) => setPeriod(e.target.value)}>
              {PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          ) : null}

          <select
            className="filter-select"
            value={staffType}
            onChange={(e) => {
              setStaffType(e.target.value);
              setStaffId('all');
            }}
          >
            {STAFF_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <select
            className="filter-select"
            value={staffId}
            onChange={(e) => {
              const next = e.target.value;
              setStaffId(next);
              const nextParams = new URLSearchParams(searchParams);
              if (next === 'all') nextParams.delete('staff');
              else nextParams.set('staff', next);
              setSearchParams(nextParams, { replace: true });
            }}
          >
            <option value="all">All Staff</option>
            {staffType !== 'sales' && staffPool.collectors.map((collector) => (
              <option key={`collector-${collector.id}`} value={collector.id}>Collector · {collector.name}</option>
            ))}
            {staffType !== 'collectors' && staffPool.salesAgents.map((agent) => (
              <option key={`sales-${agent.id}`} value={agent.id}>Sales · {agent.name}</option>
            ))}
          </select>

          {mode === 'customers' ? (
            <>
              <select className="filter-select" value={standing} onChange={(e) => setStanding(e.target.value)}>
                {STANDING_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <input
                className="filter-select"
                style={{ minWidth: 180 }}
                type="search"
                placeholder="Search customer name"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setFocusCustomerId(null);
                }}
              />
            </>
          ) : null}
        </div>

        {mode === 'customers' && searchMatches.length > 0 && search.trim() ? (
          <div className="map-search-results" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {searchMatches.map((account) => (
              <button
                key={`search-${account.id}`}
                type="button"
                className="button ghost"
                style={{ fontSize: '0.8rem' }}
                onClick={() => setFocusCustomerId(account.id)}
              >
                {account.customerName}
              </button>
            ))}
          </div>
        ) : null}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12, fontSize: '0.85rem', color: 'var(--ink, #0B1E30)' }}>
          {mode === 'customers' ? (
            <>
              <span>Customers on map: <strong>{view.accountCount}</strong></span>
              <span>
                Missing location:{' '}
                <button
                  type="button"
                  className="button ghost"
                  style={{ padding: 0, fontSize: 'inherit', fontWeight: 700 }}
                  onClick={() => navigate(`${opsBase}/customers`)}
                >
                  {view.missingLocationCount}
                </button>
              </span>
            </>
          ) : null}
          {mode === 'routes' ? (
            <span>Planned stops: <strong>{view.visitCount}</strong></span>
          ) : null}
          {mode === 'routes' ? (
            <span className="text-ink/70">Routes are planned schedules — not live GPS tracking.</span>
          ) : null}
          {mode === 'coverage' ? (
            <span className="text-ink/70">Coverage shapes are approximate from customer locations.</span>
          ) : null}
        </div>

        {view.legend.length ? (
          <div className="map-legend">
            {view.legend.map((item) => (
              <span key={item.label} className="map-legend-item">
                <span className="map-legend-swatch" style={{ background: item.color }} />
                {item.label}
              </span>
            ))}
          </div>
        ) : null}

        <div style={{ marginTop: 16 }}>
          <LeafletMap
            center={focusCustomerId
              ? (view.markers.find((m) => String(m.id) === `acct-${focusCustomerId}`)?.position || mapCenter)
              : mapCenter}
            zoom={focusCustomerId ? 15 : 12}
            height={560}
            fitBounds={!focusCustomerId && view.bounds.length ? view.bounds : null}
            markers={view.markers}
            polylines={view.polylines}
            circles={view.circles}
            polygons={view.polygons}
          />
        </div>

        {view.emptyMessage ? (
          <div style={{ marginTop: 12 }}>
            <EmptyState title={view.emptyMessage} description="Adjust filters or choose another map view." />
          </div>
        ) : null}
      </section>
    </div>
  );
}
