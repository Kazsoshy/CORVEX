import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import LeafletMap from '../common/LeafletMap';
import { Pagination } from '../shared/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { NavIcon } from '../../navIcons';
import { fetchSawResults, recomputeOrgSawResults } from '../../api/sawResultsService';
import { formatCurrency, formatDisplayDateTime } from '../../utils/formatters.js';
import { downloadPdf } from '../../utils/dataExport.js';

const BRANCH_COLORS = ['#255684', '#0c1031', '#c2410c', '#0d9f6e', '#7c3aed'];

function scoreTone(score) {
  const value = Number(score) || 0;
  if (value >= 0.75) return 'high';
  if (value >= 0.45) return 'mid';
  return 'low';
}

function hasCoords(lat, lng) {
  const a = Number(lat);
  const b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && !(a === 0 && b === 0);
}

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function round3(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

function hasStoredFactors(row) {
  return [
    'outstanding_balance',
    'days_overdue',
    'distance_km',
    'balance_norm',
    'days_norm',
    'distance_norm',
    'weight_balance',
    'weight_days',
    'weight_distance',
  ].every((key) => finite(row?.[key]) != null);
}

function recomputedScore(row) {
  if (!hasStoredFactors(row)) return null;
  return round3(
    Number(row.weight_balance) * Number(row.balance_norm)
    + Number(row.weight_days) * Number(row.days_norm)
    + Number(row.weight_distance) * Number(row.distance_norm)
  );
}

function scoreMatchesStoredFactors(row) {
  const next = recomputedScore(row);
  const stored = finite(row?.score);
  if (next == null || stored == null) return null;
  return Math.abs(next - stored) < 0.0005;
}

function expectedNorms(row) {
  const maxBalance = finite(row?.cohort_max_balance);
  const maxDays = finite(row?.cohort_max_days);
  const minDistance = finite(row?.cohort_min_distance);
  const balance = finite(row?.outstanding_balance);
  const days = finite(row?.days_overdue);
  const distance = finite(row?.distance_km);
  if ([maxBalance, maxDays, minDistance, balance, days, distance].some((n) => n == null)) return null;
  return {
    balance_norm: maxBalance > 0 ? round2(balance / maxBalance) : 0,
    days_norm: maxDays > 0 ? round2(days / maxDays) : 0,
    distance_norm: distance > 0 && minDistance > 0 ? round2(minDistance / distance) : 0,
  };
}

function normsMatchCohort(row) {
  const expected = expectedNorms(row);
  if (!expected || !hasStoredFactors(row)) return null;
  return ['balance_norm', 'days_norm', 'distance_norm'].every(
    (key) => Math.abs(expected[key] - Number(row[key])) < 0.001
  );
}

function formatFactorNumber(value, digits) {
  const n = finite(value);
  if (n == null) return '—';
  return n.toFixed(digits);
}

function formatSavedMoney(value) {
  const n = finite(value);
  if (n == null) return '—';
  return formatCurrency(n);
}

function SawFactorCell({ row }) {
  if (!hasStoredFactors(row)) {
    return <span className="saw-factors-bad">Not stored</span>;
  }
  const expected = expectedNorms(row);
  const normsOk = normsMatchCohort(row);
  const maxBalance = formatSavedMoney(row.cohort_max_balance);
  const maxDays = finite(row.cohort_max_days) == null ? '—' : Math.round(Number(row.cohort_max_days));
  const minDistance = formatFactorNumber(row.cohort_min_distance, 3);
  return (
    <div className="saw-factors-cell">
      <div className="saw-factors-math">
        {formatFactorNumber(row.weight_balance, 2)}×{formatFactorNumber(row.balance_norm, 2)}
        {' + '}
        {formatFactorNumber(row.weight_days, 2)}×{formatFactorNumber(row.days_norm, 2)}
        {' + '}
        {formatFactorNumber(row.weight_distance, 2)}×{formatFactorNumber(row.distance_norm, 2)}
      </div>
      {expected ? (
        <>
          <div className="saw-factors-cohort">
            Balance {formatSavedMoney(row.outstanding_balance)} / {maxBalance} = {formatFactorNumber(expected.balance_norm, 2)}
          </div>
          <div className="saw-factors-cohort">
            Days {Math.round(Number(row.days_overdue))} / {maxDays} = {formatFactorNumber(expected.days_norm, 2)}
          </div>
          <div className="saw-factors-cohort">
            Closest {minDistance} km / {formatFactorNumber(row.distance_km, 3)} km = {formatFactorNumber(expected.distance_norm, 2)}
          </div>
          <div className={normsOk ? 'saw-factors-ok' : 'saw-factors-bad'}>
            {normsOk ? 'Normalized values match' : 'Normalized values do not match the saved inputs'}
          </div>
        </>
      ) : (
        <div className="saw-factors-bad">Cohort totals were not saved</div>
      )}
    </div>
  );
}

function SawScoreCheck({ row }) {
  const next = recomputedScore(row);
  const matches = scoreMatchesStoredFactors(row);
  if (next == null) return <span className="saw-factors-bad">Cannot recompute</span>;
  return (
    <span className={matches ? 'saw-factors-ok' : 'saw-factors-bad'}>
      {matches ? `Recomputed ${next.toFixed(3)}` : `Recomputed ${next.toFixed(3)} ≠ stored`}
    </span>
  );
}

function ranksFollowScores(rows) {
  const ordered = [...rows].sort(
    (a, b) => Number(b.score) - Number(a.score) || Number(a.customer_id) - Number(b.customer_id)
  );
  return ordered.every((row, index) => Number(row.ranking) === index + 1);
}

function exportSawPdf(rows) {
  const exportRows = rows.map((row) => ({
    Rank: row.ranking,
    Customer: row.customer_name || '',
    Branch: row.branch_name || '',
    Territory: row.territory_name || '',
    Collector: row.collector_name || '',
    Balance: finite(row.outstanding_balance) == null ? '' : formatCurrency(row.outstanding_balance),
    'Days overdue': finite(row.days_overdue) == null ? '' : Math.round(Number(row.days_overdue)),
    'Distance km': finite(row.distance_km) == null ? '' : Number(row.distance_km).toFixed(3),
    'Balance norm': finite(row.balance_norm) == null ? '' : Number(row.balance_norm).toFixed(2),
    'Days norm': finite(row.days_norm) == null ? '' : Number(row.days_norm).toFixed(2),
    'Distance norm': finite(row.distance_norm) == null ? '' : Number(row.distance_norm).toFixed(2),
    'Recomputed score': recomputedScore(row) ?? '',
    Score: Number(row.score) || 0,
    Latitude: row.latitude ?? '',
    Longitude: row.longitude ?? '',
    Generated: row.generated_at || '',
  }));
  return downloadPdf(exportRows, {
    filename: `saw-priority-${new Date().toISOString().slice(0, 10)}.pdf`,
    title: 'SAW Collection Priority',
    subtitle: 'Customer prioritization ranking',
  });
}

export function SawResultsPage({ navigate, showToast }) {
  const [results, setResults] = useState([]);
  const [summary, setSummary] = useState(null);
  const [byBranch, setByBranch] = useState([]);
  const [weights, setWeights] = useState({ balance: 0.4, daysOverdue: 0.3, distance: 0.3 });
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState('');
  const [branchId, setBranchId] = useState('all');
  const [sortKey, setSortKey] = useState('ranking');
  const [scoreBand, setScoreBand] = useState('all');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const params = {};
        if (search.trim()) params.search = search.trim();
        if (branchId !== 'all') params.branch_id = branchId;
        params.limit = 5000;
        const result = await fetchSawResults(params);
        if (cancelled) return;
        if (result.success) {
          setResults(result.data || []);
          setSummary(result.summary || null);
          setByBranch(result.byBranch || []);
          if (result.weights) setWeights(result.weights);
        } else {
          setResults([]);
          showToast?.(result.message || 'Failed to load SAW results.', 'error');
        }
      } catch {
        if (!cancelled) showToast?.('Failed to load SAW results.', 'error');
      }
      if (!cancelled) setLoading(false);
    }
    const timer = setTimeout(load, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, branchId, showToast, reloadKey]);

  async function handleRecompute() {
    setRecomputing(true);
    try {
      const result = await recomputeOrgSawResults();
      if (result.success) {
        showToast?.(result.message || 'SAW results refreshed.', 'success');
        setReloadKey((key) => key + 1);
      } else {
        showToast?.(result.message || 'Failed to recompute SAW.', 'error');
      }
    } catch {
      showToast?.('Failed to recompute SAW.', 'error');
    } finally {
      setRecomputing(false);
    }
  }

  const sorted = useMemo(() => {
    let rows = [...results];
    if (scoreBand === 'high') rows = rows.filter((r) => Number(r.score) >= 0.75);
    else if (scoreBand === 'mid') rows = rows.filter((r) => Number(r.score) >= 0.45 && Number(r.score) < 0.75);
    else if (scoreBand === 'low') rows = rows.filter((r) => Number(r.score) < 0.45);

    if (sortKey === 'score') {
      rows.sort((a, b) => Number(b.score) - Number(a.score));
    } else if (sortKey === 'balance') {
      rows.sort((a, b) => Number(b.outstanding_balance) - Number(a.outstanding_balance));
    } else {
      rows.sort((a, b) => Number(a.ranking) - Number(b.ranking) || Number(b.score) - Number(a.score));
    }
    return rows;
  }, [results, sortKey, scoreBand]);

  const pagination = usePagination(sorted);
  const rows = pagination.paginatedData;

  const topThree = useMemo(() => sorted.slice(0, 3), [sorted]);

  const bandCounts = useMemo(() => {
    const high = results.filter((r) => Number(r.score) >= 0.75).length;
    const mid = results.filter((r) => Number(r.score) >= 0.45 && Number(r.score) < 0.75).length;
    const low = results.filter((r) => Number(r.score) < 0.45).length;
    return { high, mid, low };
  }, [results]);

  const chartData = useMemo(
    () => byBranch.map((branch, index) => ({
      name: String(branch.branchName || 'Branch').replace(' Branch', ''),
      ranked: branch.rankedCount,
      avg: Number(branch.avgScore || 0),
      fill: BRANCH_COLORS[index % BRANCH_COLORS.length],
    })),
    [byBranch]
  );

  const scoreHistogram = useMemo(() => {
    const buckets = [
      { name: '0–0.25', min: 0, max: 0.25, count: 0 },
      { name: '0.25–0.5', min: 0.25, max: 0.5, count: 0 },
      { name: '0.5–0.75', min: 0.5, max: 0.75, count: 0 },
      { name: '0.75–1.0', min: 0.75, max: 1.01, count: 0 },
    ];
    results.forEach((row) => {
      const score = Number(row.score) || 0;
      const bucket = buckets.find((b) => score >= b.min && score < b.max);
      if (bucket) bucket.count += 1;
    });
    return buckets;
  }, [results]);

  const mapMarkers = useMemo(
    () => sorted
      .filter((row) => hasCoords(row.latitude, row.longitude))
      .slice(0, 60)
      .map((row) => ({
        id: row.result_id || row.customer_id,
        position: [Number(row.latitude), Number(row.longitude)],
        label: String(row.ranking || '#'),
        color: scoreTone(row.score) === 'high' ? '#b91c1c' : scoreTone(row.score) === 'mid' ? '#c2410c' : '#255684',
        popup: `#${row.ranking} · ${row.customer_name} · ${Number(row.score).toFixed(3)} · ${row.branch_name || ''}`,
      })),
    [sorted]
  );

  const mapBounds = mapMarkers.map((marker) => marker.position);
  const mapCenter = mapBounds[0] || [6.7534, 125.6558];
  const mappedCount = mapMarkers.length;
  const topScore = Number(summary?.topScore || 0);
  const missingFactors = Number(summary?.missingFactors ?? results.filter((row) => !hasStoredFactors(row)).length);
  const fullQueueLoaded = !search.trim()
    && branchId === 'all'
    && scoreBand === 'all'
    && results.length > 0
    && results.length === Number(summary?.total || 0);
  const scoresCheckOut = fullQueueLoaded && results.every((row) => scoreMatchesStoredFactors(row) && normsMatchCohort(row));
  const ranksCheckOut = fullQueueLoaded && ranksFollowScores(results);

  if (loading && !results.length) return <LoadingState message="Loading SAW results…" />;

  return (
    <div className="page saw-results-page">
      <section className="panel content-panel relative overflow-hidden saw-hero">
        <div className="saw-hero-glow" aria-hidden="true" />
        <div className="saw-results-toolbar">
          <div>
            <p className="saw-eyebrow">Customer Prioritization</p>
            <h3 style={{ margin: 0 }}>SAW Collection Priority</h3>
            <p className="text-ink/70" style={{ margin: '6px 0 0', fontSize: '0.88rem', maxWidth: 560 }}>
              Each saved row keeps the balance, days overdue, distance, and normalized values that produced its score. Rank is the order of those scores.
            </p>
          </div>
          <div className="saw-results-actions">
            <button
              className="button"
              type="button"
              onClick={handleRecompute}
              disabled={recomputing}
            >
              {recomputing ? 'Recomputing…' : 'Recompute Org SAW'}
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                if (exportSawPdf(sorted)) showToast?.('SAW priority exported as PDF.', 'success');
              }}
              disabled={!sorted.length}
            >
              Export PDF
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => navigate('/operating-manager/leaflet')}
            >
              Network Map
            </button>
          </div>
        </div>

        <div className="saw-formula-strip">
          <div className="saw-formula-label">Preference score</div>
          <div className="saw-formula-eq">
            <span className="saw-formula-term">
              <em>{Math.round((weights.balance || 0) * 100)}%</em> Balance
            </span>
            <span className="saw-formula-op">+</span>
            <span className="saw-formula-term">
              <em>{Math.round((weights.daysOverdue || 0) * 100)}%</em> Days overdue
            </span>
            <span className="saw-formula-op">+</span>
            <span className="saw-formula-term">
              <em>{Math.round((weights.distance || 0) * 100)}%</em> Distance
            </span>
          </div>
          <div className="saw-formula-meta">
            Last run {summary?.lastGeneratedAt ? formatDisplayDateTime(summary.lastGeneratedAt) : '—'}
            {missingFactors > 0 ? ` · ${missingFactors} row${missingFactors === 1 ? '' : 's'} missing factors` : ''}
          </div>
        </div>

        <div className="saw-stat-grid">
          <div className="saw-stat">
            <span>Ranked customers</span>
            <strong>{summary?.total ?? results.length}</strong>
          </div>
          <div className="saw-stat">
            <span>Average score</span>
            <strong>{Number(summary?.avgScore || 0).toFixed(3)}</strong>
          </div>
          <div className="saw-stat">
            <span>Top score</span>
            <strong>{topScore.toFixed(3)}</strong>
          </div>
          <div className="saw-stat">
            <span>Branches covered</span>
            <strong>{summary?.branchesCovered ?? byBranch.length}</strong>
          </div>
        </div>
      </section>

      {topThree.length > 0 ? (
        <section className="saw-spotlight-grid">
          {topThree.map((row, index) => (
            <article key={row.result_id || row.customer_id} className={`saw-spotlight rank-${index + 1}`}>
              <div className="saw-spotlight-rank">#{index + 1}</div>
              <div className="saw-spotlight-body">
                <h4>{row.customer_name}</h4>
                <p>{row.branch_name || '—'}{row.territory_name ? ` · ${row.territory_name}` : ''}</p>
                <div className="saw-spotlight-meta">
                  <span>{formatSavedMoney(row.outstanding_balance)}</span>
                  <span>{finite(row.days_overdue) == null ? '—' : `${Math.round(Number(row.days_overdue))}d overdue`}</span>
                  <span>{finite(row.distance_km) == null ? '—' : `${Number(row.distance_km).toFixed(1)} km`}</span>
                  <span className={`saw-score-pill ${scoreTone(row.score)}`}>
                    {Number(row.score).toFixed(3)}
                  </span>
                </div>
                <div className="saw-score-meter" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, Math.max(4, Number(row.score) * 100))}%` }} />
                </div>
              </div>
              <button
                className="icon-action-button"
                type="button"
                title="Open customer"
                onClick={() => navigate(`/operating-manager/operations/customers/${row.customer_id}`)}
              >
                <NavIcon name="view" />
              </button>
            </article>
          ))}
        </section>
      ) : null}

      <section className="panel content-panel relative overflow-hidden">
        <div className="saw-filter-bar">
          <div className="search-bar saw-search">
            <NavIcon name="search" />
            <input
              className="search-input"
              type="search"
              placeholder="Search customer, branch, or territory…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="filter-select" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="all">All Branches</option>
            {byBranch.map((branch) => (
              <option key={branch.branchId} value={branch.branchId}>{branch.branchName}</option>
            ))}
          </select>
          <select className="filter-select" value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
            <option value="ranking">Sort: SAW Rank</option>
            <option value="score">Sort: Score</option>
            <option value="balance">Sort: Outstanding</option>
          </select>
          <select className="filter-select" value={scoreBand} onChange={(e) => setScoreBand(e.target.value)}>
            <option value="all">All score bands</option>
            <option value="high">High (≥ 0.75) · {bandCounts.high}</option>
            <option value="mid">Mid (0.45–0.75) · {bandCounts.mid}</option>
            <option value="low">Lower (&lt; 0.45) · {bandCounts.low}</option>
          </select>
        </div>

        <div className="org-leaflet-branch-chips">
          <button
            type="button"
            className={`org-leaflet-chip${branchId === 'all' ? ' active' : ''}`}
            onClick={() => setBranchId('all')}
          >
            All Branches
          </button>
          {byBranch.map((branch, index) => (
            <button
              key={branch.branchId}
              type="button"
              className={`org-leaflet-chip${String(branchId) === String(branch.branchId) ? ' active' : ''}`}
              style={{ '--chip-accent': BRANCH_COLORS[index % BRANCH_COLORS.length] }}
              onClick={() => setBranchId(String(branch.branchId))}
            >
              <span
                className="org-leaflet-chip-dot"
                style={{ background: BRANCH_COLORS[index % BRANCH_COLORS.length] }}
              />
              {String(branch.branchName || '').replace(' Branch', '')}
              <em>{branch.rankedCount}</em>
            </button>
          ))}
        </div>

        <div className="saw-band-legend">
          <button type="button" className={`saw-band high${scoreBand === 'high' ? ' active' : ''}`} onClick={() => setScoreBand(scoreBand === 'high' ? 'all' : 'high')}>
            High priority <em>{bandCounts.high}</em>
          </button>
          <button type="button" className={`saw-band mid${scoreBand === 'mid' ? ' active' : ''}`} onClick={() => setScoreBand(scoreBand === 'mid' ? 'all' : 'mid')}>
            Medium <em>{bandCounts.mid}</em>
          </button>
          <button type="button" className={`saw-band low${scoreBand === 'low' ? ' active' : ''}`} onClick={() => setScoreBand(scoreBand === 'low' ? 'all' : 'low')}>
            Lower <em>{bandCounts.low}</em>
          </button>
        </div>
      </section>

      <div className="saw-split-grid saw-split-3">
        <section className="panel content-panel relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
            <h3 style={{ margin: 0 }}>Ranked by Branch</h3>
          </div>
          {chartData.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#c5c8d0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value, name) => (
                    name === 'avg' ? Number(value).toFixed(3) : value
                  )}
                />
                <Bar dataKey="ranked" name="Ranked customers" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No branch breakdown yet" description="SAW results will appear here after collectors recompute priority." />
          )}
        </section>

        <section className="panel content-panel relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
            <div>
              <h3 style={{ margin: 0 }}>Score Distribution</h3>
              <p className="text-ink/70" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
                How preference scores cluster across the queue
              </p>
            </div>
          </div>
          {results.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={scoreHistogram}>
                <CartesianGrid strokeDasharray="3 3" stroke="#c5c8d0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" name="Customers" fill="#255684" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No scores yet" description="Distribution appears once SAW results exist." />
          )}
        </section>

        <section className="panel content-panel relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
            <div>
              <h3 style={{ margin: 0 }}>Priority Map</h3>
              <p className="text-ink/70" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
                {mappedCount} mapped account{mappedCount === 1 ? '' : 's'} in the current filter
              </p>
            </div>
          </div>
          {mapMarkers.length ? (
            <>
              <div className="org-leaflet-map-shell">
                <LeafletMap
                  center={mapCenter}
                  zoom={branchId === 'all' ? 8 : 12}
                  height={200}
                  fitBounds={mapBounds.length ? mapBounds : null}
                  markers={mapMarkers}
                />
              </div>
              <div className="saw-map-legend">
                <span className="high">High ≥ 0.75</span>
                <span className="mid">Mid 0.45–0.75</span>
                <span className="low">Lower &lt; 0.45</span>
              </div>
            </>
          ) : (
            <EmptyState title="No map pins" description="Ranked customers need latitude and longitude to appear here." />
          )}
        </section>
      </div>

      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3>
            Priority Queue
            <span className="text-ink/70" style={{ fontWeight: 400, fontSize: '0.88rem' }}>
              {' '}({sorted.length})
            </span>
          </h3>
        </div>
        {results.length > 0 ? (
          <p className={`saw-audit-note${scoresCheckOut && ranksCheckOut ? ' ok' : ''}`}>
            {missingFactors > 0
              ? `${missingFactors} saved row${missingFactors === 1 ? '' : 's'} still have only a score and rank. Recompute Org SAW to store the balance, days overdue, distance, and normalized values.`
              : scoresCheckOut && ranksCheckOut
                ? 'Saved scores match the stored weights and normalized values, and the displayed ranks follow those scores.'
                : fullQueueLoaded
                  ? 'A saved score or rank does not match the stored factors. Recompute Org SAW and review the highlighted rows.'
                  : 'Clear the search, branch, and score filters to check that every displayed rank follows the saved scores.'}
          </p>
        ) : null}

        {sorted.length === 0 ? (
          <EmptyState
            title="No SAW results found"
            description="Results appear after collectors recompute SAW or Branch Managers assign collection routes."
          />
        ) : (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Customer</th>
                    <th>Branch</th>
                    <th>Territory</th>
                    <th>Collector</th>
                    <th>Balance</th>
                    <th>Days overdue</th>
                    <th>Distance</th>
                    <th>Normalized values</th>
                    <th>Score</th>
                    <th>Generated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const tone = scoreTone(row.score);
                    const pct = Math.min(100, Math.max(4, Number(row.score) * 100));
                    return (
                      <tr key={row.result_id} className={`saw-row-${tone}`}>
                        <td>
                          <span className={`saw-rank-badge ${Number(row.ranking) <= 3 ? 'top' : ''}`}>
                            #{row.ranking}
                          </span>
                        </td>
                        <td>
                          <strong>{row.customer_name || `Customer #${row.customer_id}`}</strong>
                          {row.address ? (
                            <span className="text-ink/70" style={{ display: 'block', fontSize: '0.8rem' }}>
                              {row.address}
                            </span>
                          ) : null}
                        </td>
                        <td>{row.branch_name || '—'}</td>
                        <td>{row.territory_name || '—'}</td>
                        <td>{row.collector_name || '—'}</td>
                        <td>{formatSavedMoney(row.outstanding_balance)}</td>
                        <td>{finite(row.days_overdue) == null ? '—' : Math.round(Number(row.days_overdue))}</td>
                        <td>{finite(row.distance_km) == null ? '—' : `${Number(row.distance_km).toFixed(3)} km`}</td>
                        <td>
                          <SawFactorCell row={row} />
                        </td>
                        <td>
                          <div className="saw-score-cell">
                            <span className={`saw-score-pill ${tone}`}>
                              {Number(row.score).toFixed(4)}
                            </span>
                            <div className="saw-score-meter compact" aria-hidden="true">
                              <span style={{ width: `${pct}%` }} />
                            </div>
                            <SawScoreCheck row={row} />
                          </div>
                        </td>
                        <td>{formatDisplayDateTime(row.generated_at)}</td>
                        <td className="table-actions">
                          <button
                            className="icon-action-button"
                            type="button"
                            title="Open customer"
                            onClick={() => navigate(`/operating-manager/operations/customers/${row.customer_id}`)}
                          >
                            <NavIcon name="view" />
                          </button>
                          <button
                            className="icon-action-button"
                            type="button"
                            title="View map"
                            onClick={() => navigate('/operating-manager/leaflet')}
                          >
                            <NavIcon name="map" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination {...pagination} />
          </>
        )}
      </section>
    </div>
  );
}
