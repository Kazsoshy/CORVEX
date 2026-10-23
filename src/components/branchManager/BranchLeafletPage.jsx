import { useEffect, useMemo, useState } from 'react';
import LeafletMap from '../common/LeafletMap';
import { Pagination } from '../shared/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { StatusBadge } from '../StatusBadge';
import { NavIcon } from '../../navIcons';
import { getBranchMap, getSawMapRoads } from '../../api/branchManagerService.js';
import { getCurrentUser } from '../../api/authService.js';
import { formatCurrency, formatDisplayDate } from '../../utils/formatters.js';
import {
  LAYER_OPTIONS,
  PERIOD_OPTIONS,
  buildBranchLeafletView,
  defaultLayersForPage,
  hasCoords,
  manilaMapDate,
} from '../../utils/branchLeafletLayers.js';

export function BranchLeafletPage({
  pageType,
  navigate,
  showToast,
  opsBase,
  branchName,
}) {
  const currentUser = getCurrentUser();
  const isOrgScope = ['operating_manager', 'super_admin'].includes(currentUser?.role?.slug);
  const scopedBranchLabel = branchName
    || currentUser?.branch?.name
    || (isOrgScope ? 'All Branches' : 'Your Branch');
  const [period, setPeriod] = useState('month');
  const [branchId, setBranchId] = useState('all');
  const [staffId, setStaffId] = useState('all');
  const [layers, setLayers] = useState(() => defaultLayersForPage(pageType));
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sawRoads, setSawRoads] = useState([]);
  const [sawRoadDate, setSawRoadDate] = useState('');
  const roadsEnabled = layers.includes('Collector Routes') || layers.includes('Route Efficiency Layer');

  useEffect(() => {
    setLayers(defaultLayersForPage(pageType));
  }, [pageType]);

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
  }, [period]);

  useEffect(() => {
    if (!roadsEnabled) {
      setSawRoads([]);
      setSawRoadDate('');
      return undefined;
    }
    let cancelled = false;
    const date = manilaMapDate();
    const params = { date };
    const scopedBranch = isOrgScope ? branchId : 'all';
    if (scopedBranch !== 'all') params.branch_id = scopedBranch;
    if (staffId !== 'all') params.collector_id = staffId;
    getSawMapRoads(params).then((result) => {
      if (cancelled) return;
      setSawRoads(result.success ? result.data || [] : []);
      setSawRoadDate(result.meta?.scheduledDate || date);
      if (!result.success) showToast?.(result.message || 'SAW road routes are unavailable.', 'error');
    });
    return () => {
      cancelled = true;
    };
  }, [roadsEnabled, branchId, staffId, isOrgScope]);

  const view = useMemo(
    () => buildBranchLeafletView({
      payload,
      layers,
      staffId,
      navigate,
      opsBase,
      branchId: isOrgScope ? branchId : 'all',
      sawRoads,
    }),
    [payload, layers, staffId, navigate, opsBase, isOrgScope, branchId, sawRoads]
  );

  const selectedBranch = (payload?.branches || []).find((branch) => (
    isOrgScope && branchId !== 'all'
      ? String(branch.id) === String(branchId)
      : hasCoords(branch.lat, branch.lng)
  ));
  const mapCenter = selectedBranch && hasCoords(selectedBranch.lat, selectedBranch.lng)
    ? [selectedBranch.lat, selectedBranch.lng]
    : (view.bounds[0] || [7.0731, 125.6128]);
  const pagination = usePagination(view.tableRows);
  const rows = pagination.paginatedData;
  const staff = view.filteredStaff || payload?.staff || { collectors: [], salesAgents: [] };
  const title = pageType === 'leafletDelinquency'
    ? 'Delinquency Heatmap'
    : pageType === 'leafletProfitability'
      ? 'Profitability Zones'
      : pageType === 'leafletTerritory'
        ? 'Territory Map'
        : 'Leaflet | OpenStreetMap';

  const toggleLayer = (layer) => {
    setLayers((current) => (
      current.includes(layer) ? current.filter((item) => item !== layer) : [...current, layer]
    ));
  };

  if (loading && !payload) return <LoadingState variant="map" message="Loading map data..." />;

  return (
    <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
          <div>
            <p className="text-[0.82rem] font-bold tracking-widest uppercase text-navy/60 m-0">{scopedBranchLabel}</p>
            <h3>{title}</h3>
            <p className="text-ink/70" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
              {view.accountCount} mapped accounts · {view.visitCount} scheduled visits
              {payload?.range ? ` · ${formatDisplayDate(payload.range.start)} to ${formatDisplayDate(payload.range.end)}` : ''}
              {!isOrgScope ? ' · your branch only' : ''}
              {sawRoads.length ? ` · ${sawRoads.length} SAW road${sawRoads.length === 1 ? '' : 's'} for ${formatDisplayDate(sawRoadDate)}` : ''}
            </p>
          </div>
        </div>
        <div className="accounts-filters">
          {isOrgScope ? (
            <select className="filter-select" value={branchId} onChange={(e) => { setBranchId(e.target.value); setStaffId('all'); }}>
              <option value="all">All Branches</option>
              {(payload?.branches || []).map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          ) : null}
          <select className="filter-select" value={period} onChange={(e) => setPeriod(e.target.value)}>
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <select className="filter-select" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            <option value="all">{isOrgScope ? 'All Staff' : 'All Branch Staff'}</option>
            {staff.collectors.map((collector) => (
              <option key={`collector-${collector.id}`} value={collector.id}>Collector · {collector.name}</option>
            ))}
            {staff.salesAgents.map((agent) => (
              <option key={`sales-${agent.id}`} value={agent.id}>Sales · {agent.name}</option>
            ))}
          </select>
        </div>
        <div className="layer-toggles">
          {LAYER_OPTIONS.map((layer) => (
            <label key={layer} className="toggle-label">
              <input type="checkbox" checked={layers.includes(layer)} onChange={() => toggleLayer(layer)} />
              {layer}
            </label>
          ))}
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
            center={mapCenter}
            zoom={12}
            height={560}
            fitBounds={view.bounds.length ? view.bounds : null}
            markers={view.markers}
            polylines={view.polylines}
            circles={view.circles}
            polygons={view.polygons}
          />
        </div>
        {!view.markers.length && !view.circles.length && !view.polygons.length && !view.polylines.length ? (
          <p className="text-ink/70" style={{ marginTop: 12, fontSize: '0.85rem' }}>
            No mapped features for this period, staff filter, and layer combination. Try This Month or turn on another layer.
          </p>
        ) : null}
      </section>

      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
          <h3>Customer Pins</h3>
        </div>
        {rows.length ? (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Balance</th>
                    <th>Status</th>
                    <th>Last Visit</th>
                    <th>Staff</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((account) => (
                    <tr key={account.id}>
                      <td>{account.customerName}</td>
                      <td>{formatCurrency(account.balance)}</td>
                      <td><StatusBadge status={account.paymentStatus} /></td>
                      <td>{account.lastVisit ? formatDisplayDate(account.lastVisit) : '—'}</td>
                      <td>{account.assignedStaff}</td>
                      <td className="table-actions">
                        <button
                          className="icon-action-button"
                          type="button"
                          title="View"
                          onClick={() => navigate(`${opsBase}/customers/${account.id}`)}
                        >
                          <NavIcon name="view" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination {...pagination} />
          </>
        ) : (
          <EmptyState title="No customers on map" description="Customers for your branch will appear here once they have location data." />
        )}
      </section>

      <div className="flex justify-end gap-2 mt-4">
        <button className="button secondary" type="button" onClick={() => navigate(`${opsBase}/leaflet/delinquency`)}>Delinquency Heatmap</button>
        <button className="button secondary" type="button" onClick={() => navigate(`${opsBase}/leaflet/profitability`)}>Profitability Zones</button>
      </div>
    </div>
  );
}
