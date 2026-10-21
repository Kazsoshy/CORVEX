import { useEffect, useMemo, useState } from 'react';
import LeafletMap from '../common/LeafletMap';
import { Pagination } from '../shared/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { StatusBadge } from '../StatusBadge';
import { NavIcon } from '../../navIcons';
import { getBranchMap, getSawMapRoads } from '../../api/branchManagerService.js';
import { formatCurrency, formatDisplayDate } from '../../utils/formatters.js';
import {
  LAYER_OPTIONS,
  PERIOD_OPTIONS,
  buildBranchLeafletView,
  defaultLayersForPage,
  hasCoords,
  manilaMapDate,
} from '../../utils/branchLeafletLayers.js';

const STAFF_TYPE_OPTIONS = [
  { value: 'all', label: 'All Roles' },
  { value: 'collectors', label: 'Collectors' },
  { value: 'sales', label: 'Sales Agents' },
];

const PAYMENT_OPTIONS = [
  { value: 'all', label: 'All Accounts' },
  { value: 'Overdue', label: 'Overdue Only' },
  { value: 'Current', label: 'Current Only' },
];

function titleForPage(pageType) {
  if (pageType === 'leafletDelinquency') return 'Delinquency Heatmap';
  if (pageType === 'leafletProfitability') return 'Profitability Analysis';
  if (pageType === 'leafletTerritory') return 'Territory Analysis';
  return 'Enterprise Map Intelligence';
}

export function OrgLeafletPage({
  pageType = 'leafletMap',
  navigate,
  showToast,
}) {
  const opsBase = '/operating-manager/operations';
  const [period, setPeriod] = useState('month');
  const [branchId, setBranchId] = useState('all');
  const [staffType, setStaffType] = useState('all');
  const [staffId, setStaffId] = useState('all');
  const [paymentStatus, setPaymentStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [layers, setLayers] = useState(() => defaultLayersForPage(pageType));
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(true);
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
        showToast?.(result.message || 'Failed to load organization map data.', 'error');
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [period, showToast]);

  useEffect(() => {
    setStaffId('all');
  }, [branchId, staffType]);

  useEffect(() => {
    if (!roadsEnabled || staffType === 'sales') {
      setSawRoads([]);
      setSawRoadDate('');
      return undefined;
    }
    let cancelled = false;
    const date = manilaMapDate();
    const params = { date };
    if (branchId !== 'all') params.branch_id = branchId;
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
  }, [roadsEnabled, staffType, branchId, staffId]);

  const view = useMemo(
    () => buildBranchLeafletView({
      payload,
      layers,
      staffId,
      navigate,
      opsBase,
      branchId,
      staffType,
      paymentStatus,
      search,
      sawRoads,
    }),
    [payload, layers, staffId, navigate, branchId, staffType, paymentStatus, search, sawRoads]
  );

  const branches = payload?.branches || [];
  const staff = view.filteredStaff || { collectors: [], salesAgents: [] };
  const selectedBranch = branches.find((branch) => String(branch.id) === String(branchId));
  const mapCenter = selectedBranch && hasCoords(selectedBranch.lat, selectedBranch.lng)
    ? [selectedBranch.lat, selectedBranch.lng]
    : (view.bounds[0] || [6.7534, 125.6558]);
  const pagination = usePagination(view.tableRows);
  const rows = pagination.paginatedData;
  const activeFilterCount = [
    branchId !== 'all',
    staffType !== 'all',
    staffId !== 'all',
    paymentStatus !== 'all',
    Boolean(search.trim()),
  ].filter(Boolean).length;

  const toggleLayer = (layer) => {
    setLayers((current) => (
      current.includes(layer) ? current.filter((item) => item !== layer) : [...current, layer]
    ));
  };

  const resetFilters = () => {
    setBranchId('all');
    setStaffType('all');
    setStaffId('all');
    setPaymentStatus('all');
    setSearch('');
    setPeriod('month');
  };

  if (loading && !payload) return <LoadingState message="Loading organization map..." />;

  return (
    <div className="page org-leaflet-page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="org-leaflet-filter-bar">
          <div>
            <h3 style={{ margin: 0 }}>{titleForPage(pageType)}</h3>
            <p className="text-ink/70" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
              {activeFilterCount ? `${activeFilterCount} active filter${activeFilterCount === 1 ? '' : 's'}` : 'Filter by branch, role, payment health, and staff'}
            </p>
          </div>
          <div className="org-leaflet-filter-actions">
            <button className="button ghost" type="button" onClick={() => setFiltersOpen((open) => !open)}>
              {filtersOpen ? 'Hide Filters' : 'Show Filters'}
            </button>
            <button className="button secondary" type="button" onClick={resetFilters}>Reset</button>
          </div>
        </div>

        {filtersOpen ? (
          <div className="org-leaflet-filter-grid">
            <label className="org-leaflet-field">
              <span>Branch</span>
              <select className="filter-select" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="all">All Branches</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            </label>
            <label className="org-leaflet-field">
              <span>Period</span>
              <select className="filter-select" value={period} onChange={(e) => setPeriod(e.target.value)}>
                {PERIOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="org-leaflet-field">
              <span>Staff Role</span>
              <select className="filter-select" value={staffType} onChange={(e) => setStaffType(e.target.value)}>
                {STAFF_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="org-leaflet-field">
              <span>Staff Member</span>
              <select className="filter-select" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                <option value="all">All Staff</option>
                {staff.collectors.map((collector) => (
                  <option key={`collector-${collector.id}`} value={collector.id}>
                    Collector · {collector.name}{collector.branchName ? ` · ${collector.branchName.replace(' Branch', '')}` : ''}
                  </option>
                ))}
                {staff.salesAgents.map((agent) => (
                  <option key={`sales-${agent.id}`} value={agent.id}>
                    Sales · {agent.name}{agent.branchName ? ` · ${agent.branchName.replace(' Branch', '')}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="org-leaflet-field">
              <span>Payment Health</span>
              <select className="filter-select" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
                {PAYMENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="org-leaflet-field org-leaflet-field-wide">
              <span>Search</span>
              <input
                className="filter-input search"
                type="search"
                value={search}
                placeholder="Customer, staff, territory, or address"
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>
        ) : null}

        <div className="org-leaflet-branch-chips">
          <button
            type="button"
            className={`org-leaflet-chip${branchId === 'all' ? ' active' : ''}`}
            onClick={() => setBranchId('all')}
          >
            All Branches
          </button>
          {(view.branchSummary || []).map((branch) => (
            <button
              key={branch.id}
              type="button"
              className={`org-leaflet-chip${String(branchId) === String(branch.id) ? ' active' : ''}`}
              style={{ '--chip-accent': branch.color }}
              onClick={() => setBranchId(String(branch.id))}
            >
              <span className="org-leaflet-chip-dot" style={{ background: branch.color }} />
              {branch.name.replace(' Branch', '')}
              <em>{branch.accounts}</em>
            </button>
          ))}
        </div>

        <div className="layer-toggles org-leaflet-layers">
          {LAYER_OPTIONS.map((layer) => (
            <label key={layer} className={`toggle-label${layers.includes(layer) ? ' active' : ''}`}>
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

        {sawRoads.length ? (
          <p className="text-ink/70" style={{ margin: '0 0 10px', fontSize: '0.85rem' }}>
            {sawRoads.length} collector SAW road{sawRoads.length === 1 ? '' : 's'} for {formatDisplayDate(sawRoadDate)}. Stop numbers are SAW ranks.
          </p>
        ) : null}
        <div className="org-leaflet-map-shell">
          <LeafletMap
            center={mapCenter}
            zoom={branchId === 'all' ? 8 : 12}
            height={580}
            fitBounds={view.bounds.length ? view.bounds : null}
            markers={view.markers}
            polylines={view.polylines}
            circles={view.circles}
            polygons={view.polygons}
          />
        </div>

        {!view.markers.length && !view.circles.length && !view.polygons.length && !view.polylines.length ? (
          <p className="text-ink/70" style={{ marginTop: 12, fontSize: '0.85rem' }}>
            No mapped features for this filter set. Widen the period, clear payment filters, or choose All Branches.
          </p>
        ) : null}
      </section>

      {(view.branchSummary || []).length > 1 && branchId === 'all' ? (
        <section className="org-leaflet-branch-grid">
          {view.branchSummary.map((branch) => (
            <button
              key={branch.id}
              type="button"
              className="panel content-panel org-leaflet-branch-card"
              onClick={() => setBranchId(String(branch.id))}
            >
              <div className="org-leaflet-branch-card-top">
                <span className="org-leaflet-chip-dot" style={{ background: branch.color }} />
                <strong>{branch.name}</strong>
              </div>
              <div className="org-leaflet-branch-metrics">
                <span><em>{branch.accounts}</em> accounts</span>
                <span><em>{branch.visits}</em> visits</span>
                <span><em>{branch.overdue}</em> overdue</span>
              </div>
            </button>
          ))}
        </section>
      ) : null}

      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
          <div>
            <h3>Customer Pins</h3>
            <p className="text-ink/70" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
              {selectedBranch ? selectedBranch.name : 'All branches'} · {view.accountCount} matching accounts
            </p>
          </div>
        </div>
        {rows.length ? (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Branch</th>
                    <th>Balance</th>
                    <th>Status</th>
                    <th>Last Visit</th>
                    <th>Staff</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((account) => (
                    <tr key={`${account.branchId}-${account.id}`}>
                      <td>{account.customerName}</td>
                      <td>{account.branchName || '—'}</td>
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
          <EmptyState
            title="No customers match these filters"
            description="Try All Branches, clear search, or switch payment health back to All Accounts."
          />
        )}
      </section>

      <div className="flex flex-wrap justify-end gap-2 mt-2">
        <button className="button secondary" type="button" onClick={() => navigate('/operating-manager/leaflet/delinquency')}>
          Delinquency Heatmap
        </button>
        <button className="button secondary" type="button" onClick={() => navigate('/operating-manager/leaflet/profitability')}>
          Profitability Analysis
        </button>
        <button className="button secondary" type="button" onClick={() => navigate('/operating-manager/leaflet/territory')}>
          Territory Analysis
        </button>
      </div>
    </div>
  );
}
