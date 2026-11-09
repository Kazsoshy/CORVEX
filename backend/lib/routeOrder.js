/**
 * Route ordering utilities — Priority-Aware Route Optimization
 * combining SAW collection priority with road-network travel efficiency.
 */

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const p1 = (Number(lat1) * Math.PI) / 180;
  const p2 = (Number(lat2) * Math.PI) / 180;
  const dlat = p2 - p1;
  const dlon = ((Number(lon2) - Number(lon1)) * Math.PI) / 180;
  const a = Math.sin(dlat / 2) ** 2
    + Math.cos(p1) * Math.cos(p2) * Math.sin(dlon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Nearest-neighbor visit order from depot (pure distance fallback). */
export function nearestNeighborOrder(depot, stops) {
  const remaining = stops.map((s, i) => ({ ...s, _idx: i }));
  const ordered = [];
  let current = depot;

  while (remaining.length) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i += 1) {
      const d = haversineKm(current.lat, current.lon, remaining[i].lat, remaining[i].lon);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    const next = remaining.splice(best, 1)[0];
    ordered.push(next);
    current = { lat: next.lat, lon: next.lon };
  }
  return ordered;
}

/** SAW rank order (1 = highest priority). */
export function sortStopsBySaw(stops) {
  return [...stops].sort(
    (a, b) => (Number(a.rank) || 999) - (Number(b.rank) || 999)
      || String(a.id ?? a.customer_id ?? '').localeCompare(String(b.id ?? b.customer_id ?? ''))
  );
}

/**
 * Extract normalized SAW priority weight in [0, 1] for each stop.
 * Uses original SAW score when present; otherwise derives from SAW rank.
 * Does NOT mutate or overwrite the stop's original `score` or `rank`.
 */
function computePriorityWeights(stops) {
  const n = stops.length;
  if (!n) return [];

  const rawScores = stops.map((s, idx) => {
    const sc = Number(s.score ?? s.saw_score ?? s.sawScore);
    if (Number.isFinite(sc) && sc > 0) return sc;
    const rk = Number(s.rank ?? s.sawRank);
    if (Number.isFinite(rk) && rk > 0) {
      return Math.max(0.05, (n - rk + 1) / n);
    }
    return Math.max(0.05, (n - idx) / n);
  });

  const maxScore = Math.max(...rawScores, 0.001);
  return rawScores.map((s) => Math.min(1, Math.max(0, s / maxScore)));
}

/**
 * Build fallback straight-line distance matrix (index 0 = depot, 1..N = stops).
 */
export function buildHaversineMatrix(depot, stops) {
  const nodes = [
    { lat: Number(depot.lat ?? depot.latitude), lon: Number(depot.lon ?? depot.longitude) },
    ...stops.map((s) => ({
      lat: Number(s.lat ?? s.latitude ?? s.cust_lat),
      lon: Number(s.lon ?? s.longitude ?? s.cust_lon),
    })),
  ];
  const size = nodes.length;
  const matrix = Array.from({ length: size }, () => Array(size).fill(0));
  for (let i = 0; i < size; i += 1) {
    for (let j = 0; j < size; j += 1) {
      if (i === j) continue;
      matrix[i][j] = haversineKm(nodes[i].lat, nodes[i].lon, nodes[j].lat, nodes[j].lon);
    }
  }
  return matrix;
}

/**
 * Priority-Aware Route Optimization:
 * Produces ONE recommended visiting sequence that balances road travel efficiency
 * (from OSRM road network when available) with SAW collection priority.
 *
 * Objective minimized over visiting permutation pi = (pi_1, ..., pi_N):
 *   J(pi) = sum_{k=1..N} cost(pi_{k-1}, pi_k)
 *         + priorityWeight * avgEdgeCost * sum_{k=1..N} (k - 1) * sawPriority(pi_k)
 *
 * Where:
 * - pi_0 = 0 (collector starting location / branch depot)
 * - cost(u, v) = road driving duration (minutes) or road distance (km) from OSRM Table API
 *   (falls back to haversine distance when road-network matrix is unavailable)
 * - sawPriority(pi_k) in [0, 1] is the normalized SAW score of stop pi_k
 * - (k - 1) penalizes delaying high-SAW-priority customers to later stop indices
 *
 * Original SAW `score` and `rank` are preserved untouched on every stop.
 *
 * @param {object} params
 * @param {{ lat: number, lon: number }} params.depot
 * @param {Array<object>} params.stops
 * @param {number[][]} [params.costMatrix] - (N+1)x(N+1) matrix where 0 is depot and 1..N are stops
 * @param {number[][]} [params.distanceMatrixKm] - (N+1)x(N+1) road distance matrix in km
 * @param {number[][]} [params.durationMatrixMin] - (N+1)x(N+1) road duration matrix in min
 * @param {number} [params.priorityLambda=0.65] - trade-off weight for SAW priority delay penalty
 */
export function optimizePriorityAwareRoute({
  depot,
  stops,
  costMatrix = null,
  distanceMatrixKm = null,
  durationMatrixMin = null,
  priorityLambda = 0.65,
}) {
  if (!Array.isArray(stops) || stops.length === 0) {
    return [];
  }

  // Separate stops with valid coordinates from stops missing coordinates
  const validStops = [];
  const withoutCoords = [];
  stops.forEach((stop) => {
    const lat = Number(stop.lat ?? stop.latitude ?? stop.cust_lat);
    const lon = Number(stop.lon ?? stop.longitude ?? stop.cust_lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      validStops.push({ ...stop, _lat: lat, _lon: lon });
    } else {
      withoutCoords.push({ ...stop });
    }
  });

  if (validStops.length <= 1) {
    const combined = [...validStops, ...sortStopsBySaw(withoutCoords)];
    return combined.map((stop, idx) => {
      const cleaned = { ...stop };
      delete cleaned._lat;
      delete cleaned._lon;
      return {
        ...cleaned,
        sawRank: stop.rank ?? stop.sawRank ?? null,
        sawScore: stop.score ?? stop.saw_score ?? stop.sawScore ?? null,
        routeIndex: idx + 1,
        route_sequence: idx + 1,
      };
    });
  }

  const n = validStops.length;
  const fallbackMatrix = buildHaversineMatrix(depot, validStops);
  const matrix =
    Array.isArray(costMatrix) && costMatrix.length === n + 1
      ? costMatrix
      : fallbackMatrix;

  const priorities = computePriorityWeights(validStops);

  // Compute average finite edge cost to scale the priority delay penalty consistently
  let edgeSum = 0;
  let edgeCount = 0;
  for (let i = 0; i <= n; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      if (i === j) continue;
      const v = Number(matrix[i]?.[j]);
      if (Number.isFinite(v) && v >= 0) {
        edgeSum += v;
        edgeCount += 1;
      }
    }
  }
  const avgEdgeCost = edgeCount > 0 ? edgeSum / edgeCount : 1;

  const safeEdgeCost = (u, v) => {
    const val = Number(matrix[u]?.[v]);
    if (Number.isFinite(val) && val >= 0) return val;
    return Number(fallbackMatrix[u]?.[v]) || avgEdgeCost;
  };

  // Phase 1: Priority-aware greedy construction from depot (node 0)
  // At each step, select unvisited stop j minimizing:
  //   0.55 * (edgeCost(current, j) / maxEdgeFromCurrent) + 0.45 * (1 - priority(j))
  const unvisited = new Set(Array.from({ length: n }, (_, i) => i + 1));
  const tour = [];
  let current = 0;

  while (unvisited.size > 0) {
    const candidates = [...unvisited];
    const maxFromCurrent = Math.max(
      ...candidates.map((c) => safeEdgeCost(current, c)),
      0.001
    );

    let bestNode = candidates[0];
    let bestStepCost = Infinity;

    for (const candidate of candidates) {
      const normTravel = safeEdgeCost(current, candidate) / maxFromCurrent;
      const priorityUrgencyPenalty = 1 - priorities[candidate - 1];
      const stepScore = 0.55 * normTravel + 0.45 * priorityUrgencyPenalty;
      if (stepScore < bestStepCost - 1e-9) {
        bestStepCost = stepScore;
        bestNode = candidate;
      } else if (Math.abs(stepScore - bestStepCost) <= 1e-9) {
        // Tie-break by higher SAW priority (lower rank number)
        const rankA = Number(validStops[candidate - 1].rank) || 999;
        const rankB = Number(validStops[bestNode - 1].rank) || 999;
        if (rankA < rankB) bestNode = candidate;
      }
    }

    tour.push(bestNode);
    unvisited.delete(bestNode);
    current = bestNode;
  }

  // Global tour objective J(pi) combining road travel cost + SAW priority delay penalty
  const tourObjective = (seq) => {
    let travelCost = 0;
    let priorityPenalty = 0;
    let prev = 0;
    for (let pos = 0; pos < seq.length; pos += 1) {
      const node = seq[pos];
      travelCost += safeEdgeCost(prev, node);
      priorityPenalty += pos * priorities[node - 1] * avgEdgeCost * priorityLambda;
      prev = node;
    }
    return travelCost + priorityPenalty;
  };

  // Also compare against pure SAW rank sequence as starting candidate if it has lower J(pi)
  const sawIndexed = Array.from({ length: n }, (_, i) => i + 1).sort((a, b) => {
    const rA = Number(validStops[a - 1].rank) || 999;
    const rB = Number(validStops[b - 1].rank) || 999;
    return rA - rB || a - b;
  });
  let bestTour = tourObjective(sawIndexed) <= tourObjective(tour) ? sawIndexed : tour;
  let bestCost = tourObjective(bestTour);

  // Phase 2: Priority-Constrained 2-opt & adjacent swap local search
  let improved = true;
  let iterations = 0;
  while (improved && iterations < 50) {
    improved = false;
    iterations += 1;

    // Try reversing any segment [i..k]
    for (let i = 0; i < n - 1; i += 1) {
      for (let k = i + 1; k < n; k += 1) {
        const candidate = [
          ...bestTour.slice(0, i),
          ...bestTour.slice(i, k + 1).reverse(),
          ...bestTour.slice(k + 1),
        ];
        const candidateCost = tourObjective(candidate);
        if (candidateCost < bestCost - 1e-6) {
          bestTour = candidate;
          bestCost = candidateCost;
          improved = true;
        }
      }
    }

    // Try relocating single stop i to position k (or-opt1)
    for (let i = 0; i < n; i += 1) {
      for (let k = 0; k < n; k += 1) {
        if (i === k) continue;
        const copy = [...bestTour];
        const [moved] = copy.splice(i, 1);
        copy.splice(k, 0, moved);
        const candidateCost = tourObjective(copy);
        if (candidateCost < bestCost - 1e-6) {
          bestTour = copy;
          bestCost = candidateCost;
          improved = true;
        }
      }
    }
  }

  let prevNode = 0;
  const orderedValid = bestTour.map((nodeIdx, idx) => {
    const stop = { ...validStops[nodeIdx - 1] };
    delete stop._lat;
    delete stop._lon;
    const legDistKm =
      Array.isArray(distanceMatrixKm) && Number.isFinite(distanceMatrixKm[prevNode]?.[nodeIdx])
        ? Math.round(distanceMatrixKm[prevNode][nodeIdx] * 10) / 10
        : null;
    const legDurMin =
      Array.isArray(durationMatrixMin) && Number.isFinite(durationMatrixMin[prevNode]?.[nodeIdx])
        ? Math.round(durationMatrixMin[prevNode][nodeIdx] * 10) / 10
        : null;
    prevNode = nodeIdx;

    return {
      ...stop,
      sawRank: stop.rank ?? stop.sawRank ?? null,
      sawScore: stop.score ?? stop.saw_score ?? stop.sawScore ?? null,
      routeIndex: idx + 1,
      route_sequence: idx + 1,
      legDistanceKm: legDistKm,
      legDurationMin: legDurMin,
    };
  });

  const tail = sortStopsBySaw(withoutCoords).map((stop, idx) => ({
    ...stop,
    sawRank: stop.rank ?? stop.sawRank ?? null,
    sawScore: stop.score ?? stop.saw_score ?? stop.sawScore ?? null,
    routeIndex: orderedValid.length + idx + 1,
    route_sequence: orderedValid.length + idx + 1,
    legDistanceKm: null,
    legDurationMin: null,
  }));

  return [...orderedValid, ...tail];
}
