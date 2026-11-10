import { createElement } from 'react';
import { formatCurrency } from './formatters.js';
import { mapSeries, palette } from '../theme/palette.js';
import { paymentStanding, standingFilterMatches } from './customerStanding.js';

/** @deprecated Use MAP_MODES — kept so older imports do not crash during rollout. */
export const LAYER_OPTIONS = [
  'Today\'s Routes',
  'Customers',
  'Coverage',
];

export const MAP_MODES = [
  { key: 'routes', label: "Today's Routes" },
  { key: 'customers', label: 'Customers' },
  { key: 'coverage', label: 'Coverage' },
];

export const PERIOD_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
];

export const STAFF_TYPE_OPTIONS = [
  { value: 'all', label: 'All Staff' },
  { value: 'collectors', label: 'Collectors' },
  { value: 'sales', label: 'Sales Agents' },
];

export const STANDING_OPTIONS = [
  { value: 'all', label: 'All Standing' },
  { value: 'Overdue', label: 'Overdue' },
  { value: 'Has Balance', label: 'With Balance' },
  { value: 'Current', label: 'Current' },
];

const STAFF_COLORS = mapSeries;
const TERRITORY_COLORS = [palette.navy, palette.cyan, palette.midnight, palette.powder, '#2A9B6A', '#d97706'];

export function defaultModeForPage(pageType) {
  if (pageType === 'leafletTerritory') return 'coverage';
  if (pageType === 'leafletDelinquency' || pageType === 'leafletProfitability') return 'customers';
  return 'routes';
}

/** @deprecated Prefer defaultModeForPage */
export function defaultLayersForPage(pageType) {
  const mode = defaultModeForPage(pageType);
  if (mode === 'coverage') return ['Coverage'];
  if (mode === 'customers') return ['Customers'];
  return ["Today's Routes"];
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
    account.customerCode,
    account.assignedStaff,
    account.collectorName,
    account.salesAgentName,
    account.branchName,
    account.territoryName,
    account.address,
  ].some((value) => String(value || '').toLowerCase().includes(q));
}

function resolveMode({ mode, layers }) {
  if (mode === 'routes' || mode === 'customers' || mode === 'coverage') return mode;
  const active = new Set(layers || []);
  if (active.has('Coverage') || active.has('Sales Territories')) return 'coverage';
  if (active.has('Customers') || active.has('Delinquency Clusters') || active.has('Profitability Zones')) return 'customers';
  return 'routes';
}

export const BRANCH_MARKER_COLORS = [
  palette.navy,
  palette.midnight,
  palette.cyan,
  '#2A9B6A',
  palette.powder,
  '#d97706',
];

export function branchMarkerColor(index) {
  return BRANCH_MARKER_COLORS[index % BRANCH_MARKER_COLORS.length];
}

function standingOf(account) {
  return paymentStanding(account);
}

function standingColor(standing) {
  if (standing === 'Overdue') return '#dc2626';
  if (standing === 'Has Balance') return '#d97706';
  return '#1A4162';
}

function accountPopupContent(account, { navigate, opsBase } = {}) {
  const standing = standingOf(account);
  const openCustomer = () => {
    if (navigate && opsBase) navigate(`${opsBase}/customers/${account.id}`);
  };
  const line = (text) => createElement('div', null, text);
  return createElement(
    'div',
    { style: { minWidth: 200, maxWidth: 260, fontSize: '0.82rem', lineHeight: 1.45 } },
    createElement('strong', { style: { display: 'block', marginBottom: 4 } }, account.customerName),
    line(`Code: ${account.customerCode || '—'}`),
    line(`Standing: ${standing}`),
    line(`Balance: ${formatCurrency(account.balance || 0)}`),
    line(`Sales Agent: ${account.salesAgentName || '—'}`),
    line(`Collector: ${account.collectorName || '—'}`),
    line(`Branch: ${account.branchName || '—'}`),
    navigate && opsBase
      ? createElement(
        'button',
        {
          type: 'button',
          className: 'button secondary',
          style: { marginTop: 8, width: '100%', fontSize: '0.78rem', padding: '6px 8px' },
          onClick: openCustomer,
        },
        'Open Customer'
      )
      : null
  );
}

function visitPopup(visit) {
  return `${visit.customerName} · ${visit.visitType} · ${visit.status}`;
}

/**
 * Build Field Map overlays for BM / OM.
 * Modes: routes | customers | coverage
 */
export function buildBranchLeafletView({
  payload,
  mode,
  layers,
  staffId,
  navigate,
  opsBase,
  branchId = 'all',
  staffType = 'all',
  paymentStatus = 'all',
  search = '',
  sawRoads = [],
  focusCustomerId = null,
}) {
  const resolvedMode = resolveMode({ mode, layers });
  const allBranches = payload?.branches || [];
  const branches = allBranches.filter((branch) => (
    !branchId || branchId === 'all' || Number(branch.id) === Number(branchId)
  ));
  const staff = payload?.staff || { collectors: [], salesAgents: [] };
  const filteredCollectors = (staff.collectors || []).filter((person) => matchesBranch(person, branchId));
  const filteredSales = (staff.salesAgents || []).filter((person) => matchesBranch(person, branchId));

  const allAccounts = (payload?.accounts || []).filter((a) => hasCoords(a.lat, a.lng));
  const accounts = allAccounts.filter((a) => {
    if (!matchesBranch(a, branchId)) return false;
    if (!accountMatchesStaff(a, staffId)) return false;
    const standing = standingOf(a);
    if (!standingFilterMatches(standing, paymentStatus)) return false;
    if (!matchesSearch(a, search)) return false;
    if (staffType === 'collectors' && !a.collectorId) return false;
    if (staffType === 'sales' && !a.salesAgentId) return false;
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
      popup: `${branch.name} · Branch`,
    });
    bounds.push([branch.lat, branch.lng]);
  });

  const collectorIndex = new Map(filteredCollectors.map((c, i) => [String(c.id), i]));

  if (resolvedMode === 'routes') {
    const salesAgentIds = new Set(filteredSales.map((person) => String(person.id)));
    const selectedIsSales = staffId !== 'all' && salesAgentIds.has(String(staffId));
    const showSalesAreas = staffType === 'sales' || selectedIsSales || staffType === 'all';
    const showCollectorRoutes = staffType !== 'sales' && !selectedIsSales;

    if (showSalesAreas) {
      const areaAssignments = (payload?.areaAssignments || []).filter((area) => {
        if (!matchesBranch(area, branchId)) return false;
        if (staffType === 'collectors') return false;
        if (staffId && staffId !== 'all' && String(area.salesAgentId) !== String(staffId)) return false;
        return true;
      });
      const salesIndex = new Map(filteredSales.map((person, index) => [String(person.id), index]));
      areaAssignments.forEach((area) => {
        const color = staffColor(salesIndex.get(String(area.salesAgentId)) ?? 0);
        if (!area.hasMapLocation || !hasCoords(area.lat, area.lng)) return;
        markers.push({
          id: `area-${area.assignmentId}`,
          position: [area.lat, area.lng],
          label: 'A',
          color: area.status === 'Done' ? '#2A9B6A' : color,
          popup: [
            area.salesAgentName,
            area.areaName,
            area.territoryName,
            area.status,
            area.workDate,
            `${area.radiusMeters || 800} m coverage`,
          ].filter(Boolean).join(' · '),
        });
        circles.push({
          id: `area-radius-${area.assignmentId}`,
          center: [area.lat, area.lng],
          radius: Number(area.radiusMeters) || 800,
          color: area.status === 'Done' ? '#2A9B6A' : color,
          fillOpacity: 0.12,
        });
        bounds.push([area.lat, area.lng]);
      });
      legend.push({ color: '#408DAD', label: 'Canvass area pin' });
      legend.push({ color: '#2A9B6A', label: 'Completed area' });
    }

    if (showCollectorRoutes) {
      const visibleRoads = (sawRoads || []).filter((road) => {
        if (staffType === 'sales') return false;
        if (staffId && staffId !== 'all' && String(road.collectorId) !== String(staffId)) return false;
        if (branchId && branchId !== 'all' && Number(road.branchId) !== Number(branchId)) return false;
        if (road.listSource && road.listSource !== 'assigned') return false;
        return Array.isArray(road.positions) && road.positions.length >= 2;
      });
      const roadByCollector = new Map(visibleRoads.map((road) => [String(road.collectorId), road]));
      const drawnRoadIds = new Set();

      function drawPlannedRoad(road, color) {
        const distance = road.distanceKm != null ? `${road.distanceKm} km` : null;
        polylines.push({
          id: `planned-road-${road.collectorId}`,
          positions: road.positions,
          color,
          weight: 5,
          opacity: 0.9,
          popup: [road.collectorName, 'Planned collection route', `${road.stops?.length || 0} stops`, distance, road.scheduledDate]
            .filter(Boolean)
            .join(' · '),
        });
        (road.stops || []).forEach((stop) => {
          markers.push({
            id: `planned-stop-${road.collectorId}-${stop.customerId}`,
            position: [Number(stop.lat), Number(stop.lng)],
            label: stop.rank == null ? '•' : String(stop.rank),
            color,
            popup: `${stop.customerName || 'Customer'} · Stop ${stop.rank ?? '—'}`,
          });
          bounds.push([Number(stop.lat), Number(stop.lng)]);
        });
        drawnRoadIds.add(String(road.collectorId));
      }

      const byStaff = new Map();
      visits.forEach((visit) => {
        if (visit.roleSlug === 'sales_staff' || visit.visitType === 'Sales') return;
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
        const color = staffColor(collectorIndex.get(key) ?? Number(key) % STAFF_COLORS.length);
        const staffName = ordered[0]?.staffName || `Staff #${key}`;
        const road = roadByCollector.get(key);
        if (road) {
          drawPlannedRoad(road, color);
          return;
        }
        ordered.forEach((stop, index) => {
          const stopColor = stop.status === 'Missed'
            ? '#dc2626'
            : stop.status === 'Completed'
              ? '#2A9B6A'
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
        drawPlannedRoad(road, staffColor(collectorIndex.get(key) ?? 0));
      });

      legend.push({ color: '#1A4162', label: 'Planned collection route' });
      legend.push({ color: '#2A9B6A', label: 'Completed stop' });
      legend.push({ color: '#dc2626', label: 'Missed stop' });
    }
  }

  if (resolvedMode === 'customers') {
    accounts.forEach((account) => {
      const standing = standingOf(account);
      const focused = focusCustomerId != null && String(focusCustomerId) === String(account.id);
      markers.push({
        id: `acct-${account.id}`,
        position: [account.lat, account.lng],
        label: (account.customerName || 'CU').slice(0, 2).toUpperCase(),
        color: focused ? '#7c3aed' : standingColor(standing),
        popupContent: accountPopupContent(account, { navigate, opsBase }),
      });
      bounds.push([account.lat, account.lng]);
    });
    legend.push({ color: '#1A4162', label: 'Current' });
    legend.push({ color: '#d97706', label: 'With balance' });
    legend.push({ color: '#dc2626', label: 'Overdue' });
  }

  if (resolvedMode === 'coverage') {
    territories.forEach((territory, index) => {
      const assignedIds = new Set((territory.assignedUserIds || []).map((id) => Number(id)));
      if (staffId && staffId !== 'all') {
        const selected = Number(staffId);
        const isDefaultOwner = Number(territory.defaultSalesAgentId) === selected
          || Number(territory.defaultCollectorId) === selected;
        if (!isDefaultOwner && assignedIds.size && !assignedIds.has(selected)) return;
        if (!isDefaultOwner && !assignedIds.size) return;
      }
      const members = allAccounts.filter((account) => {
        if (!matchesBranch(account, branchId)) return false;
        return territory.id && Number(account.territoryId) === Number(territory.id);
      });
      const color = TERRITORY_COLORS[index % TERRITORY_COLORS.length];
      const owners = [
        territory.defaultSalesAgentName ? `SA: ${territory.defaultSalesAgentName}` : null,
        territory.defaultCollectorName ? `Collector: ${territory.defaultCollectorName}` : null,
      ].filter(Boolean).join(' · ') || (territory.assignedNames || []).filter(Boolean).join(', ') || 'Unassigned';
      const popup = [
        territory.name,
        'Approximate Territory Coverage',
        `${members.length} customers in territory`,
        owners,
        territory.radiusMeters ? `${territory.radiusMeters} m radius` : null,
        territory.coverageArea ? `Notes: ${territory.coverageArea}` : null,
      ].filter(Boolean).join(' · ');

      if (territory.hasMapLocation && hasCoords(territory.lat, territory.lng)) {
        markers.push({
          id: `territory-pin-${territory.id}`,
          position: [territory.lat, territory.lng],
          label: 'T',
          color,
          popup,
        });
        circles.push({
          id: `territory-${territory.id}`,
          center: [territory.lat, territory.lng],
          radius: Number(territory.radiusMeters) || 800,
          color,
          fillColor: color,
          fillOpacity: 0.14,
          popup,
        });
        bounds.push([territory.lat, territory.lng]);
        members.forEach((account) => {
          markers.push({
            id: `territory-cust-${territory.id}-${account.id}`,
            position: [account.lat, account.lng],
            label: (account.customerName || 'CU').slice(0, 2).toUpperCase(),
            color,
            popupContent: accountPopupContent(account, { navigate, opsBase }),
          });
          bounds.push([account.lat, account.lng]);
        });
        return;
      }

      // No invented geometry for territories without a stored pin.
      if (!members.length) return;
      const points = members.map((a) => [a.lat, a.lng]);
      const center = centroid(points);
      circles.push({
        id: `territory-fallback-${territory.id}`,
        center,
        radius: coverRadius(points, center),
        color,
        fillColor: color,
        fillOpacity: 0.1,
        popup: `${popup} · Pin missing — customer cluster only`,
      });
      bounds.push(center);
    });
    legend.push({ color: '#1A4162', label: 'Approximate Territory Coverage' });
  }

  const overdueCount = accounts.filter((account) => standingOf(account) === 'Overdue').length;
  const missingLocationCount = Number(payload?.summary?.customersMissingLocation || 0);
  const branchSummary = branches.map((branch) => {
    const branchAccounts = allAccounts.filter((account) => Number(account.branchId) === Number(branch.id));
    return {
      id: branch.id,
      name: branch.name,
      accounts: branchAccounts.length,
      overdue: branchAccounts.filter((account) => standingOf(account) === 'Overdue').length,
      visits: visits.filter((visit) => Number(visit.branchId) === Number(branch.id)).length,
      color: branchMarkerColor(branchColorIndex.get(Number(branch.id)) ?? 0),
    };
  });

  return {
    mode: resolvedMode,
    markers,
    polylines,
    circles,
    polygons,
    legend,
    bounds,
    tableRows: accounts.map((account) => ({
      ...account,
      paymentStatus: standingOf(account),
      onOpen: navigate && opsBase ? () => navigate(`${opsBase}/customers/${account.id}`) : undefined,
    })),
    accountCount: accounts.length,
    visitCount: visits.length,
    overdueCount,
    missingLocationCount,
    customersOnMap: Number(payload?.summary?.customersOnMap ?? accounts.length),
    branchSummary,
    filteredStaff: {
      collectors: filteredCollectors,
      salesAgents: filteredSales,
    },
    emptyMessage: (() => {
      if (resolvedMode === 'routes' && !visits.length && !(sawRoads || []).some((r) => r.listSource === 'assigned')) {
        return staffId !== 'all'
          ? 'No planned stops for this staff member in the selected period.'
          : 'No planned field stops for this period.';
      }
      if (resolvedMode === 'customers' && !accounts.length) {
        if (String(search || '').trim()) return 'No customers match your search.';
        if (paymentStatus && paymentStatus !== 'all') return 'No customers match this standing filter.';
        return 'No customers with a map location yet.';
      }
      if (resolvedMode === 'coverage' && !polygons.length && !circles.length) {
        return 'No Active territory coverage to show. Set a map pin and radius on Branch Territories.';
      }
      return null;
    })(),
  };
}
