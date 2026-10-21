import { formatCurrency, formatDisplayDate } from './formatters.js';

export const LAYER_OPTIONS = [
  'Collector Routes',
  'Sales Territories',
  'Payment Behavior Zones',
  'Delinquency Clusters',
  'Profitability Zones',
  'High Collection Areas',
  'Route Efficiency Layer',
];

export const PERIOD_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
];

const STAFF_COLORS = ['#255684', '#7c3aed', '#0d9f6e', '#d97706', '#db2777', '#0891b2', '#4f46e5'];
const TERRITORY_COLORS = ['#255684', '#0d9f6e', '#d97706', '#7c3aed', '#db2777', '#0c1031'];

export function defaultLayersForPage(pageType) {
  if (pageType === 'leafletDelinquency') return ['Delinquency Clusters'];
  if (pageType === 'leafletProfitability') return ['Profitability Zones'];
  if (pageType === 'leafletTerritory') return ['Sales Territories'];
  return ['Collector Routes', 'Delinquency Clusters'];
}

export function manilaMapDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function hasCoords(lat, lng) {
  const a = Number(lat);
  const b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && !(a === 0 && b === 0);
}

function staffColor(index) {
  return STAFF_COLORS[index % STAFF_COLORS.length];
}

function convexHull(points) {
  const pts = points
    .map((p) => [Number(p[1]), Number(p[0])])
    .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts.map(([lng, lat]) => [lat, lng]);

  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper).map(([lng, lat]) => [lat, lng]);
}

function centroid(points) {
  const sum = points.reduce(
    (acc, p) => ({ lat: acc.lat + Number(p[0]), lng: acc.lng + Number(p[1]) }),
    { lat: 0, lng: 0 }
  );
  return [sum.lat / points.length, sum.lng / points.length];
}

function haversineMeters(a, b) {
  const toRad = (n) => (n * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

function coverRadius(points, center) {
  if (points.length <= 1) return 280;
  const farthest = points.reduce((max, p) => Math.max(max, haversineMeters(center, p)), 0);
  return Math.min(1400, Math.max(280, farthest * 1.15));
}

function clusterByGrid(accounts, cellDeg = 0.008) {
  const buckets = new Map();
  accounts.forEach((account) => {
    const gy = Math.floor(account.lat / cellDeg);
    const gx = Math.floor(account.lng / cellDeg);
    const key = `${gy}:${gx}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        id: key,
        accounts: [],
        lat: 0,
        lng: 0,
        overdue: 0,
        current: 0,
        outstanding: 0,
        purchaseVolume: 0,
        collected: 0,
        sales: 0,
      });
    }
    const cell = buckets.get(key);
    cell.accounts.push(account);
    cell.lat += account.lat;
    cell.lng += account.lng;
    cell.outstanding += Number(account.balance || 0);
    cell.purchaseVolume += Number(account.purchaseVolume || 0);
    cell.collected += Number(account.periodCollected || 0);
    cell.sales += Number(account.periodSales || 0);
    if (account.paymentStatus === 'Overdue') cell.overdue += 1;
    else cell.current += 1;
  });

  return [...buckets.values()].map((cell) => {
    const center = [cell.lat / cell.accounts.length, cell.lng / cell.accounts.length];
    const points = cell.accounts.map((a) => [a.lat, a.lng]);
    return {
      ...cell,
      count: cell.accounts.length,
      center,
      radius: coverRadius(points, center),
    };
  });
}

function accountMatchesStaff(account, staffId) {
  if (!staffId || staffId === 'all') return true;
  const id = Number(staffId);
  return Number(account.collectorId) === id || Number(account.salesAgentId) === id;
}

function matchesBranch(item, branchId) {
  if (!branchId || branchId === 'all') return true;
  return Number(item?.branchId) === Number(branchId);
}

function matchesStaffType(roleSlug, staffType) {
  if (!staffType || staffType === 'all') return true;
  if (staffType === 'collectors') return roleSlug === 'collector';
  if (staffType === 'sales') return roleSlug === 'sales_staff';
  return true;
}

function matchesSearch(account, search) {
  const q = String(search || '').trim().toLowerCase();
  if (!q) return true;
  return [
    account.customerName,
    account.assignedStaff,
    account.branchName,
    account.territoryName,
    account.address,
  ].some((value) => String(value || '').toLowerCase().includes(q));
}

export const BRANCH_MARKER_COLORS = ['#255684', '#0c1031', '#c2410c', '#0d9f6e', '#7c3aed', '#db2777'];

export function branchMarkerColor(index) {
  return BRANCH_MARKER_COLORS[index % BRANCH_MARKER_COLORS.length];
}

function visitPopup(visit) {
  return `${visit.customerName} · ${visit.visitType} · ${visit.status}${visit.scheduledDate ? ` · ${formatDisplayDate(visit.scheduledDate)}` : ''}`;
}

function accountPopup(account, extras = []) {
  const lines = [
    account.customerName,
    account.paymentStatus,
    `Balance ${formatCurrency(account.balance || 0)}`,
    account.assignedStaff ? `Staff: ${account.assignedStaff}` : null,
    ...extras,
  ].filter(Boolean);
  return lines.join(' · ');
}

export function buildBranchLeafletView({
  payload,
  layers,
  staffId,
  navigate,
  opsBase,
  branchId = 'all',
  staffType = 'all',
  paymentStatus = 'all',
  search = '',
  sawRoads = [],
}) {
  const active = new Set(layers);
  const allBranches = payload?.branches || [];
  const branches = allBranches.filter((branch) => (
    !branchId || branchId === 'all' || Number(branch.id) === Number(branchId)
  ));
  const staff = payload?.staff || { collectors: [], salesAgents: [] };
  const filteredCollectors = (staff.collectors || []).filter((person) => matchesBranch(person, branchId));
  const filteredSales = (staff.salesAgents || []).filter((person) => matchesBranch(person, branchId));
  const staffPool = [
    ...(staffType === 'sales' ? [] : filteredCollectors),
    ...(staffType === 'collectors' ? [] : filteredSales),
  ];
  const staffIdsInType = new Set(staffPool.map((person) => String(person.id)));

  const allAccounts = (payload?.accounts || []).filter((a) => hasCoords(a.lat, a.lng));
  const accounts = allAccounts.filter((a) => {
    if (!matchesBranch(a, branchId)) return false;
    if (!accountMatchesStaff(a, staffId)) return false;
    if (paymentStatus && paymentStatus !== 'all' && a.paymentStatus !== paymentStatus) return false;
    if (!matchesSearch(a, search)) return false;
    if (staffType === 'collectors' && !a.collectorId) return false;
    if (staffType === 'sales' && !a.salesAgentId) return false;
    if (staffId && staffId !== 'all' && !staffIdsInType.has(String(staffId)) && staffType !== 'all') return false;
    return true;
  });
  const visits = (payload?.visits || []).filter((v) => {
    if (!hasCoords(v.lat, v.lng)) return false;
    if (!matchesBranch(v, branchId)) return false;
    if (!matchesStaffType(v.roleSlug, staffType)) return false;
    if (!staffId || staffId === 'all') return true;
    return String(v.staffId) === String(staffId);
  });
  const territories = (payload?.territories || []).filter((territory) => matchesBranch(territory, branchId));

  const markers = [];
  const polylines = [];
  const circles = [];
  const polygons = [];
  const legend = [];
  const bounds = [];
  const branchColorIndex = new Map(allBranches.map((branch, index) => [Number(branch.id), index]));

  branches.forEach((branch) => {
    if (!hasCoords(branch.lat, branch.lng)) return;
    const color = branchMarkerColor(branchColorIndex.get(Number(branch.id)) ?? 0);
    markers.push({
      id: `branch-${branch.id}`,
      position: [branch.lat, branch.lng],
      label: String(branch.name || 'B').slice(0, 2).toUpperCase(),
      color,
      popup: `${branch.name} · Branch depot`,
    });
    bounds.push([branch.lat, branch.lng]);
  });

  const collectorIndex = new Map(filteredCollectors.map((c, i) => [String(c.id), i]));
  const showRoutes = active.has('Collector Routes') || active.has('Route Efficiency Layer');
  const efficiencyMode = active.has('Route Efficiency Layer');
  const visibleSawRoads = (sawRoads || []).filter((road) => {
    if (staffType === 'sales') return false;
    if (staffId && staffId !== 'all' && String(road.collectorId) !== String(staffId)) return false;
    if (branchId && branchId !== 'all' && Number(road.branchId) !== Number(branchId)) return false;
    return Array.isArray(road.positions) && road.positions.length >= 2;
  });
  const roadByCollector = new Map(visibleSawRoads.map((road) => [String(road.collectorId), road]));
  const drawnRoadIds = new Set();

  function drawSawRoad(road, color) {
    const distance = road.distanceKm != null ? `${road.distanceKm} km` : null;
    const source = road.listSource === 'assigned' ? 'Assigned route' : 'Eligible SAW ranking';
    const surface = road.provider === 'osrm' ? 'OSRM road' : 'SAW stop order';
    polylines.push({
      id: `saw-road-${road.collectorId}`,
      positions: road.positions,
      color,
      weight: 5,
      opacity: 0.9,
      popup: [road.collectorName, 'SAW road', source, surface, `${road.stops?.length || 0} stops`, distance, road.scheduledDate]
        .filter(Boolean)
        .join(' · '),
    });
    (road.stops || []).forEach((stop) => {
      markers.push({
        id: `saw-stop-${road.collectorId}-${stop.customerId}`,
        position: [Number(stop.lat), Number(stop.lng)],
        label: stop.rank == null ? '•' : String(stop.rank),
        color,
        popup: `#${stop.rank ?? '—'} · ${stop.customerName || 'Customer'}${stop.score != null ? ` · ${Number(stop.score).toFixed(3)}` : ''}`,
      });
      bounds.push([Number(stop.lat), Number(stop.lng)]);
    });
    drawnRoadIds.add(String(road.collectorId));
  }

  if (showRoutes) {
    const depotById = new Map(
      branches.filter((branch) => hasCoords(branch.lat, branch.lng)).map((branch) => [Number(branch.id), branch])
    );
    const fallbackDepot = branches.find((branch) => hasCoords(branch.lat, branch.lng));
    const byStaff = new Map();
    visits.forEach((visit) => {
      const key = String(visit.staffId);
      if (!byStaff.has(key)) byStaff.set(key, []);
      byStaff.get(key).push(visit);
    });

    byStaff.forEach((stops, key) => {
      const ordered = [...stops].sort((a, b) => {
        const dateCmp = String(a.scheduledDate || '').localeCompare(String(b.scheduledDate || ''));
        if (dateCmp) return dateCmp;
        return Number(a.visitId) - Number(b.visitId);
      });
      const points = ordered.map((s) => [s.lat, s.lng]);
      const depot = depotById.get(Number(ordered[0]?.branchId)) || fallbackDepot;
      if (depot && points.length) {
        points.unshift([depot.lat, depot.lng]);
      }
      const completed = ordered.filter((s) => s.status === 'Completed').length;
      const missed = ordered.filter((s) => s.status === 'Missed').length;
      const rate = ordered.length ? Math.round((completed / ordered.length) * 100) : 0;
      const color = efficiencyMode
        ? (rate >= 80 ? '#0d9f6e' : rate >= 50 ? '#d97706' : '#dc2626')
        : staffColor(collectorIndex.get(key) ?? 0);
      const staffName = ordered[0]?.staffName || `Staff #${key}`;
      const isSales = ordered.some((s) => s.visitType === 'Sales') && ordered.every((s) => s.visitType !== 'Collection');
      const road = roadByCollector.get(key);
      if (road && !isSales) {
        drawSawRoad(road, color);
        return;
      }

      if (points.length >= 2) {
        polylines.push({
          id: `route-${key}`,
          positions: points,
          color,
          weight: efficiencyMode ? 5 : 4,
          opacity: 0.85,
          dashArray: efficiencyMode && rate < 80 ? '8 6' : isSales ? '6 6' : undefined,
          popup: `${staffName} · ${ordered.length} stops · ${rate}% completed${missed ? ` · ${missed} missed` : ''}`,
        });
      }

      ordered.forEach((stop, index) => {
        const stopColor = stop.status === 'Missed'
          ? '#dc2626'
          : stop.status === 'Completed'
            ? '#0d9f6e'
            : color;
        markers.push({
          id: `stop-${stop.visitId}`,
          position: [stop.lat, stop.lng],
          label: String(index + 1),
          color: stopColor,
          popup: `${staffName} · ${visitPopup(stop)}`,
        });
        bounds.push([stop.lat, stop.lng]);
      });
    });

    roadByCollector.forEach((road, key) => {
      if (drawnRoadIds.has(key)) return;
      drawSawRoad(road, staffColor(collectorIndex.get(key) ?? 0));
    });

    if (active.has('Collector Routes')) {
      legend.push({
        color: '#255684',
        label: visibleSawRoads.length ? 'SAW road routes' : 'Collector / sales routes',
      });
    }
    if (efficiencyMode) {
      legend.push({ color: '#0d9f6e', label: 'Efficient (≥80% completed)' });
      legend.push({ color: '#d97706', label: 'Watch (50–79%)' });
      legend.push({ color: '#dc2626', label: 'Inefficient (<50% or missed)' });
    }
  }

  if (active.has('Sales Territories')) {
    territories.forEach((territory, index) => {
      const assignedIds = new Set((territory.assignedUserIds || []).map((id) => Number(id)));
      if (staffId && staffId !== 'all' && assignedIds.size && !assignedIds.has(Number(staffId))) return;
      const members = accounts.filter((account) => {
        if (territory.id && Number(account.territoryId) === Number(territory.id)) return true;
        if (!assignedIds.size) return false;
        return assignedIds.has(Number(account.collectorId)) || assignedIds.has(Number(account.salesAgentId));
      });
      const points = members.map((a) => [a.lat, a.lng]);
      if (!points.length) return;
      const color = TERRITORY_COLORS[index % TERRITORY_COLORS.length];
      const hull = convexHull(points);
      const assignedNames = (territory.assignedNames || []).filter(Boolean).join(', ') || 'Unassigned';
      const popup = `${territory.name} · ${members.length} accounts · ${assignedNames}${territory.coverageArea ? ` · ${territory.coverageArea}` : ''}`;
      if (hull.length >= 3) {
        polygons.push({
          id: `territory-${territory.id}`,
          positions: hull,
          color,
          fillColor: color,
          fillOpacity: 0.16,
          popup,
        });
        hull.forEach((p) => bounds.push(p));
      } else {
        const center = centroid(points);
        circles.push({
          id: `territory-${territory.id}`,
          center,
          radius: coverRadius(points, center),
          color,
          fillColor: color,
          fillOpacity: 0.18,
          popup,
        });
        bounds.push(center);
      }
    });
    legend.push({ color: '#255684', label: 'Sales territories' });
  }

  const cells = clusterByGrid(accounts);

  if (active.has('Payment Behavior Zones')) {
    cells.forEach((cell) => {
      const delinquent = cell.overdue >= cell.current;
      const color = delinquent ? '#dc2626' : '#0d9f6e';
      circles.push({
        id: `pay-${cell.id}`,
        center: cell.center,
        radius: cell.radius,
        color,
        fillColor: color,
        fillOpacity: delinquent ? 0.28 : 0.18,
        popup: `${delinquent ? 'Overdue-heavy' : 'Current-paying'} zone · ${cell.count} accounts · ${cell.overdue} overdue`,
      });
      bounds.push(cell.center);
    });
    legend.push({ color: '#0d9f6e', label: 'Current-paying zones' });
    legend.push({ color: '#dc2626', label: 'Overdue payment zones' });
  }

  if (active.has('Delinquency Clusters')) {
    cells.filter((cell) => cell.overdue > 0).forEach((cell) => {
      circles.push({
        id: `delq-${cell.id}`,
        center: cell.center,
        radius: Math.min(1600, cell.radius + cell.overdue * 40),
        color: '#b91c1c',
        fillColor: '#ef4444',
        fillOpacity: Math.min(0.45, 0.16 + cell.overdue * 0.08),
        popup: `Delinquency cluster · ${cell.overdue} overdue · ${formatCurrency(cell.outstanding)} outstanding`,
      });
      bounds.push(cell.center);
    });
    accounts.filter((a) => a.paymentStatus === 'Overdue').forEach((account) => {
      markers.push({
        id: `overdue-${account.id}`,
        position: [account.lat, account.lng],
        label: (account.customerName || 'CU').slice(0, 2).toUpperCase(),
        color: '#dc2626',
        popup: accountPopup(account, [`Overdue ${formatCurrency(account.balance || 0)}`]),
      });
      bounds.push([account.lat, account.lng]);
    });
    legend.push({ color: '#dc2626', label: 'Delinquent accounts / clusters' });
  }

  if (active.has('Profitability Zones')) {
    cells.forEach((cell) => {
      const net = cell.purchaseVolume - cell.outstanding;
      const color = net >= 0 ? '#0d9f6e' : '#dc2626';
      circles.push({
        id: `profit-${cell.id}`,
        center: cell.center,
        radius: cell.radius,
        color,
        fillColor: color,
        fillOpacity: net >= 0 ? 0.18 : 0.28,
        popup: `Profitability · purchases ${formatCurrency(cell.purchaseVolume)} · outstanding ${formatCurrency(cell.outstanding)} · net ${formatCurrency(net)}`,
      });
      bounds.push(cell.center);
    });
    legend.push({ color: '#0d9f6e', label: 'Higher purchase vs outstanding' });
    legend.push({ color: '#dc2626', label: 'Outstanding exceeds purchases' });
  }

  if (active.has('High Collection Areas')) {
    const collecting = cells.filter((cell) => cell.collected > 0);
    const source = collecting.length ? collecting : cells.filter((cell) => cell.outstanding > 0);
    source.forEach((cell) => {
      const amount = collecting.length ? cell.collected : cell.outstanding;
      const color = '#0891b2';
      circles.push({
        id: `collect-${cell.id}`,
        center: cell.center,
        radius: Math.min(1500, 300 + Math.log10(amount + 10) * 180),
        color,
        fillColor: color,
        fillOpacity: 0.22,
        popup: collecting.length
          ? `High collection area · ${formatCurrency(cell.collected)} collected this period · ${cell.count} accounts`
          : `Collection opportunity · ${formatCurrency(cell.outstanding)} outstanding · ${cell.count} accounts`,
      });
      bounds.push(cell.center);
    });
    legend.push({ color: '#0891b2', label: collecting.length ? 'High collection this period' : 'Collection opportunity (no payments in period)' });
  }

  const zoneOnly = ['Payment Behavior Zones', 'Delinquency Clusters', 'Profitability Zones', 'High Collection Areas', 'Sales Territories']
    .some((name) => active.has(name));
  if (!showRoutes && !zoneOnly) {
    accounts.forEach((account) => {
      markers.push({
        id: `acct-${account.id}`,
        position: [account.lat, account.lng],
        label: (account.customerName || 'CU').slice(0, 2).toUpperCase(),
        color: account.paymentStatus === 'Overdue' ? '#ef4444' : '#255684',
        popup: accountPopup(account),
      });
      bounds.push([account.lat, account.lng]);
    });
  }

  const tableRows = accounts.map((account) => ({
    ...account,
    onOpen: navigate && opsBase ? () => navigate(`${opsBase}/customers/${account.id}`) : undefined,
  }));

  const overdueCount = accounts.filter((account) => account.paymentStatus === 'Overdue').length;
  const branchSummary = branches.map((branch) => {
    const branchAccounts = accounts.filter((account) => Number(account.branchId) === Number(branch.id));
    return {
      id: branch.id,
      name: branch.name,
      accounts: branchAccounts.length,
      overdue: branchAccounts.filter((account) => account.paymentStatus === 'Overdue').length,
      visits: visits.filter((visit) => Number(visit.branchId) === Number(branch.id)).length,
      color: branchMarkerColor(branchColorIndex.get(Number(branch.id)) ?? 0),
    };
  });

  return {
    markers,
    polylines,
    circles,
    polygons,
    legend,
    bounds,
    tableRows,
    accountCount: accounts.length,
    visitCount: visits.length,
    overdueCount,
    branchSummary,
    filteredStaff: {
      collectors: filteredCollectors,
      salesAgents: filteredSales,
    },
  };
}
