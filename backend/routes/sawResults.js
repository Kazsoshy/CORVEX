import express from 'express';
import { allow, ROLE_SETS } from '../middleware/auth.js';
import {
  computeOrgSawPriority,
  persistSawResults,
} from '../lib/sawCollectionData.js';
import { SAW_WEIGHTS } from '../lib/sawCollection.js';

const router = express.Router();
router.use(allow(ROLE_SETS.receipts));

const SAW_FROM = `
  FROM saw_results sr
  LEFT JOIN customers c ON c.customer_id = sr.customer_id
  LEFT JOIN branches b ON b.id = c.branch_id
  LEFT JOIN territories t ON t.territory_id = c.territory_id
  LEFT JOIN users mgr ON mgr.id = c.account_manager_id
`;

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/saw-results — Organization SAW ranking (OM / super_admin)
// Query: search, branch_id, page, limit
// ──────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { search, branch_id: branchId, page = 1, limit = 100 } = req.query;

    const conditions = [];
    const params = [];
    let pIdx = 1;

    if (search) {
      conditions.push(`(
        c.first_name ILIKE $${pIdx}
        OR c.last_name ILIKE $${pIdx}
        OR CONCAT(COALESCE(c.first_name, ''), ' ', COALESCE(c.last_name, '')) ILIKE $${pIdx}
        OR b.name ILIKE $${pIdx}
        OR t.territory_name ILIKE $${pIdx}
      )`);
      params.push(`%${search}%`);
      pIdx += 1;
    }

    if (branchId !== undefined && branchId !== '' && branchId !== 'all') {
      conditions.push(`c.branch_id = $${pIdx++}`);
      params.push(Number(branchId));
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const filterParams = [...params];
    const offset = (Number(page) - 1) * Number(limit);
    const limitIdx = pIdx++;
    const offsetIdx = pIdx++;
    params.push(Number(limit), offset);

    const [result, summaryResult, branchResult] = await Promise.all([
      pool.query(
        `SELECT
           sr.result_id,
           sr.customer_id,
           COALESCE(NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''), 'Customer') AS customer_name,
           c.address,
           c.latitude,
           c.longitude,
           c.branch_id,
           b.name AS branch_name,
           t.territory_name,
           sr.outstanding_balance::float AS outstanding_balance,
           sr.days_overdue,
           sr.distance_km::float AS distance_km,
           sr.balance_norm::float AS balance_norm,
           sr.days_norm::float AS days_norm,
           sr.distance_norm::float AS distance_norm,
           sr.cohort_max_balance::float AS cohort_max_balance,
           sr.cohort_max_days,
           sr.cohort_min_distance::float AS cohort_min_distance,
           sr.weight_balance::float AS weight_balance,
           sr.weight_days::float AS weight_days,
           sr.weight_distance::float AS weight_distance,
           COALESCE(NULLIF(TRIM(mgr.full_name), ''), TRIM(CONCAT_WS(' ', mgr.first_name, mgr.last_name))) AS collector_name,
           sr.score::float AS score,
           sr.ranking,
           sr.generated_at
         ${SAW_FROM}
         ${where}
         ORDER BY sr.ranking ASC NULLS LAST, sr.score DESC NULLS LAST, sr.generated_at DESC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        params
      ),
      pool.query(
        `SELECT
           COUNT(*)::int AS total,
           COALESCE(AVG(sr.score), 0)::float AS avg_score,
           COALESCE(MAX(sr.score), 0)::float AS top_score,
           COALESCE(MIN(sr.score), 0)::float AS low_score,
           MAX(sr.generated_at) AS last_generated_at,
           COUNT(DISTINCT c.branch_id)::int AS branches_covered,
           COUNT(*) FILTER (WHERE sr.balance_norm IS NULL)::int AS missing_factors
         ${SAW_FROM}
         ${where}`,
        filterParams
      ),
      // Always return every active branch so OM filters are not Davao-only
      // when secondary branches have customers but no SAW rows yet.
      pool.query(
        `SELECT
           b.id AS branch_id,
           b.name AS branch_name,
           COUNT(sr.result_id)::int AS ranked_count,
           COALESCE(AVG(sr.score), 0)::float AS avg_score,
           COALESCE(MAX(sr.score), 0)::float AS top_score
         FROM branches b
         LEFT JOIN customers c ON c.branch_id = b.id
         LEFT JOIN saw_results sr ON sr.customer_id = c.customer_id
         WHERE COALESCE(b.status, 'Active') = 'Active'
         GROUP BY b.id, b.name
         ORDER BY ranked_count DESC, b.name`
      ),
    ]);

    const summary = summaryResult.rows[0] || {};
    return res.status(200).json({
      success: true,
      data: result.rows,
      count: result.rows.length,
      summary: {
        total: Number(summary.total) || 0,
        avgScore: Number(summary.avg_score) || 0,
        topScore: Number(summary.top_score) || 0,
        lowScore: Number(summary.low_score) || 0,
        lastGeneratedAt: summary.last_generated_at || null,
        branchesCovered: Number(summary.branches_covered) || 0,
        missingFactors: Number(summary.missing_factors) || 0,
      },
      byBranch: branchResult.rows.map((row) => ({
        branchId: Number(row.branch_id),
        branchName: row.branch_name,
        rankedCount: Number(row.ranked_count) || 0,
        avgScore: Number(row.avg_score) || 0,
        topScore: Number(row.top_score) || 0,
      })),
      weights: SAW_WEIGHTS,
    });
  } catch (err) {
    console.error('[SawResults] GET / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch SAW results.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/saw-results/recompute — Org-wide SAW refresh (OM / super_admin)
// ──────────────────────────────────────────────────────────────────────────────
router.post('/recompute', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { asOf, ranked, stats } = await computeOrgSawPriority(pool);
    const saved = await persistSawResults(pool, ranked, { replaceAll: true });

    return res.status(200).json({
      success: true,
      message: saved
        ? `Org SAW refreshed for ${saved} customer(s) across ${stats.branches || 0} branch(es).`
        : 'No eligible customers for org SAW ranking.',
      meta: { asOf, stats, saved },
    });
  } catch (err) {
    console.error('[SawResults] POST /recompute error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to recompute org SAW results.' });
  }
});

export default router;
