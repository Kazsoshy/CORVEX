import {
  daysOverdueFromDueDate,
  filterEligibleRows,
  filterOrgEligibleRows,
  haversineKm,
  manilaDateString,
  runSawPipeline,
} from './sawCollection.js';

/**
 * Load invoice-level rows for SAW (ACM-shaped), scoped to one collector.
 */
export async function fetchSawSourceRows(pool, { collectorId, branchId }) {
  const result = await pool.query(
    `
    WITH collector_portfolio AS (
      SELECT DISTINCT customer_id
      FROM (
        SELECT customer_id FROM collection_payment WHERE collector_id = $1
        UNION
        SELECT customer_id FROM field_visits WHERE user_id = $1
      ) p
    ),
    invoice_payments AS (
      SELECT ch.sales_id, COALESCE(SUM(ch.payment_amount), 0) AS paid
      FROM credit_history ch
      WHERE ch.sales_id IS NOT NULL
      GROUP BY ch.sales_id
    ),
    open_invoices AS (
      SELECT
        si.customer_id,
        si.due_date,
        si.total_amount,
        CASE
          WHEN COALESCE(ip.paid, 0) >= si.total_amount THEN 'Paid'
          WHEN COALESCE(ip.paid, 0) > 0 THEN 'Partial'
          ELSE 'Unpaid'
        END AS invoice_status
      FROM sales_invoices si
      LEFT JOIN invoice_payments ip ON ip.sales_id = si.sales_invoices_id
      WHERE si.status IN ('Confirmed', 'Pending Review')
        AND si.due_date IS NOT NULL
        AND si.customer_id IS NOT NULL
    )
    SELECT
      c.customer_id,
      $1::INTEGER AS collector_id,
      c.status,
      COALESCE(ca.outstanding_balance, 0)::FLOAT AS outstanding_balance,
      oi.invoice_status,
      oi.due_date,
      c.latitude::FLOAT AS cust_lat,
      c.longitude::FLOAT AS cust_lon,
      b.latitude::FLOAT AS branch_lat,
      b.longitude::FLOAT AS branch_lon,
      c.first_name,
      c.last_name,
      c.address,
      c.contact_phone
    FROM customers c
    JOIN customer_activity ca ON ca.customer_id = c.customer_id
    JOIN branches b ON b.id = c.branch_id
    JOIN open_invoices oi ON oi.customer_id = c.customer_id
    WHERE c.branch_id = $2
      AND c.status = 'Active'
      AND COALESCE(ca.outstanding_balance, 0) > 0
      AND oi.invoice_status IN ('Unpaid', 'Partial')
      AND c.latitude IS NOT NULL
      AND c.longitude IS NOT NULL
      AND b.latitude IS NOT NULL
      AND b.longitude IS NOT NULL
      AND (
        NOT EXISTS (SELECT 1 FROM collector_portfolio LIMIT 1)
        OR c.customer_id IN (SELECT customer_id FROM collector_portfolio)
      )
    `,
    [collectorId, branchId]
  );
  return result.rows;
}

export async function computeCollectorSawPriority(pool, { collectorId, branchId, asOfDate }) {
  if (branchId == null) {
    return { asOf: asOfDate || manilaDateString(), ranked: [], stats: { eligible: 0, ranked: 0 } };
  }

  const raw = await fetchSawSourceRows(pool, { collectorId, branchId });
  const eligible = filterEligibleRows(raw, collectorId);
  const asOf = asOfDate || manilaDateString();
  const ranked = runSawPipeline(eligible, { asOfDate: asOf });

  return {
    asOf,
    ranked,
    stats: {
      sourceRows: raw.length,
      eligible: eligible.length,
      ranked: ranked.length,
    },
  };
}

/**
 * Load invoice-level rows for org-wide SAW (all branches, no collector portfolio filter).
 */
export async function fetchOrgSawSourceRows(pool) {
  const result = await pool.query(
    `
    WITH invoice_payments AS (
      SELECT ch.sales_id, COALESCE(SUM(ch.payment_amount), 0) AS paid
      FROM credit_history ch
      WHERE ch.sales_id IS NOT NULL
      GROUP BY ch.sales_id
    ),
    open_invoices AS (
      SELECT
        si.customer_id,
        si.due_date,
        si.total_amount,
        CASE
          WHEN COALESCE(ip.paid, 0) >= si.total_amount THEN 'Paid'
          WHEN COALESCE(ip.paid, 0) > 0 THEN 'Partial'
          ELSE 'Unpaid'
        END AS invoice_status
      FROM sales_invoices si
      LEFT JOIN invoice_payments ip ON ip.sales_id = si.sales_invoices_id
      WHERE si.status IN ('Confirmed', 'Pending Review')
        AND si.due_date IS NOT NULL
        AND si.customer_id IS NOT NULL
    )
    SELECT
      c.customer_id,
      COALESCE(c.account_manager_id, 0)::INTEGER AS collector_id,
      c.status,
      COALESCE(ca.outstanding_balance, 0)::FLOAT AS outstanding_balance,
      oi.invoice_status,
      oi.due_date,
      c.latitude::FLOAT AS cust_lat,
      c.longitude::FLOAT AS cust_lon,
      b.latitude::FLOAT AS branch_lat,
      b.longitude::FLOAT AS branch_lon,
      c.first_name,
      c.last_name,
      c.address,
      c.contact_phone,
      c.branch_id
    FROM customers c
    JOIN customer_activity ca ON ca.customer_id = c.customer_id
    JOIN branches b ON b.id = c.branch_id
    JOIN open_invoices oi ON oi.customer_id = c.customer_id
    WHERE c.status = 'Active'
      AND COALESCE(b.status, 'Active') = 'Active'
      AND COALESCE(ca.outstanding_balance, 0) > 0
      AND oi.invoice_status IN ('Unpaid', 'Partial')
      AND c.latitude IS NOT NULL
      AND c.longitude IS NOT NULL
      AND b.latitude IS NOT NULL
      AND b.longitude IS NOT NULL
    `
  );
  return result.rows;
}

export async function computeOrgSawPriority(pool, { asOfDate } = {}) {
  const raw = await fetchOrgSawSourceRows(pool);
  const eligible = filterOrgEligibleRows(raw);
  const asOf = asOfDate || manilaDateString();
  const ranked = runSawPipeline(eligible, { asOfDate: asOf });

  return {
    asOf,
    ranked,
    stats: {
      sourceRows: raw.length,
      eligible: eligible.length,
      ranked: ranked.length,
      branches: new Set(ranked.map((r) => Number(r.branch_id)).filter(Boolean)).size,
    },
  };
}

export function mapSawPriorityRow(row) {
  const name = `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Customer';
  return {
    customer_id: row.customer_id,
    collector_id: row.collector_id,
    customer_name: name,
    address: row.address || '',
    phone: row.contact_phone || '',
    outstanding_balance: Number(row.outstanding_balance) || 0,
    invoice_status: row.invoice_status,
    due_date: row.due_date,
    days_overdue: row.days_overdue,
    distance_km: row.distance_km,
    balance_norm: row.balance_norm,
    days_norm: row.days_norm,
    distance_norm: row.distance_norm,
    score: row.score,
    rank: row.rank,
    generated_at: row.generated_at,
    latitude: row.cust_lat,
    longitude: row.cust_lon,
    visit_id: row.visit_id ?? null,
    visit_status: row.visit_status ?? null,
  };
}

export async function getCollectionAssignmentsForDate(pool, collectorId, scheduledDate) {
  const date = scheduledDate || manilaDateString();
  const result = await pool.query(
    `SELECT fv.visit_id, fv.customer_id, fv.status, fv.scheduled_date
     FROM field_visits fv
     WHERE fv.user_id = $1
       AND fv.visit_type = 'Collection'
       AND fv.scheduled_date = $2::date
     ORDER BY fv.visit_id ASC`,
    [collectorId, date]
  );
  return result.rows;
}

/**
 * When the collector has Collection visits for scheduledDate, return only those customers in SAW order.
 */
export async function computeAssignedSawRoute(pool, { collectorId, branchId, scheduledDate, asOfDate }) {
  const date = scheduledDate || manilaDateString();
  const assignments = await getCollectionAssignmentsForDate(pool, collectorId, date);

  if (!assignments.length) {
    return {
      asOf: asOfDate || manilaDateString(),
      ranked: [],
      stats: { assigned: 0, onRoute: 0 },
      assignmentMode: true,
      scheduledDate: date,
    };
  }

  const assignedIds = new Set(assignments.map((a) => Number(a.customer_id)));
  const visitByCustomer = new Map(assignments.map((a) => [Number(a.customer_id), a]));

  const { asOf, ranked, stats } = await computeCollectorSawPriority(pool, {
    collectorId,
    branchId,
    asOfDate,
  });

  const filtered = ranked.filter((r) => assignedIds.has(Number(r.customer_id)));
  const rankedIds = new Set(filtered.map((r) => Number(r.customer_id)));
  const missingIds = [...assignedIds].filter((id) => !rankedIds.has(id));
  const extras = missingIds.length
    ? await fetchAssignedCustomersOutsideSaw(pool, missingIds, collectorId, asOf)
    : [];

  const withVisit = [...filtered, ...extras].map((row) => {
    const visit = visitByCustomer.get(Number(row.customer_id));
    return {
      ...row,
      visit_id: visit?.visit_id ?? null,
      visit_status: visit?.status ?? null,
    };
  });
  const openStops = withVisit.filter((row) => row.visit_status !== 'Completed');
  const completedStops = withVisit.filter((row) => row.visit_status === 'Completed');
  const rankedAssigned = [...openStops, ...completedStops].map((row, i) => ({
    ...row,
    rank: i + 1,
  }));

  return {
    asOf,
    ranked: rankedAssigned,
    stats: {
      ...stats,
      assigned: assignments.length,
      onRoute: rankedAssigned.length,
      completed: completedStops.length,
    },
    assignmentMode: true,
    scheduledDate: date,
  };
}

/** Assigned stops that no longer qualify for SAW (usually collected in full) still belong on today's route. */
async function fetchAssignedCustomersOutsideSaw(pool, customerIds, collectorId, asOf) {
  const result = await pool.query(
    `SELECT
       c.customer_id,
       c.first_name,
       c.last_name,
       c.address,
       c.contact_phone,
       c.latitude::FLOAT AS cust_lat,
       c.longitude::FLOAT AS cust_lon,
       COALESCE(ca.outstanding_balance, 0)::FLOAT AS outstanding_balance,
       b.latitude::FLOAT AS branch_lat,
       b.longitude::FLOAT AS branch_lon,
       (
         SELECT MIN(si.due_date)
         FROM sales_invoices si
         WHERE si.customer_id = c.customer_id
           AND si.status IN ('Confirmed', 'Pending Review')
       ) AS due_date
     FROM customers c
     LEFT JOIN customer_activity ca ON ca.customer_id = c.customer_id
     LEFT JOIN branches b ON b.id = c.branch_id
     WHERE c.customer_id = ANY($1::int[])
     ORDER BY c.last_name, c.first_name`,
    [customerIds]
  );

  return result.rows.map((row) => {
    const hasCoords = [row.cust_lat, row.cust_lon, row.branch_lat, row.branch_lon]
      .every((n) => Number.isFinite(Number(n)));
    const balance = Number(row.outstanding_balance) || 0;
    return {
      customer_id: row.customer_id,
      collector_id: collectorId,
      first_name: row.first_name,
      last_name: row.last_name,
      address: row.address,
      contact_phone: row.contact_phone,
      outstanding_balance: balance,
      invoice_status: balance > 0 ? 'Partial' : 'Paid',
      due_date: row.due_date,
      days_overdue: daysOverdueFromDueDate(asOf, row.due_date),
      distance_km: hasCoords
        ? haversineKm(row.branch_lat, row.branch_lon, row.cust_lat, row.cust_lon)
        : 0,
      cust_lat: row.cust_lat,
      cust_lon: row.cust_lon,
      score: null,
      generated_at: asOf,
    };
  });
}

export async function assignCollectionVisits(pool, {
  collectorId,
  branchId,
  customerIds,
  scheduledDate,
}) {
  const date = scheduledDate || manilaDateString();
  const uniqueIds = [...new Set(customerIds.map(Number).filter((n) => Number.isFinite(n) && n > 0))];
  const created = [];
  const skipped = [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const customerId of uniqueIds) {
      const check = await client.query(
        `SELECT c.customer_id FROM customers c WHERE c.customer_id = $1 AND c.branch_id = $2`,
        [customerId, branchId]
      );
      if (!check.rows.length) {
        skipped.push({ customer_id: customerId, reason: 'not_in_branch' });
        continue;
      }

      const existing = await client.query(
        `SELECT visit_id FROM field_visits
         WHERE user_id = $1 AND customer_id = $2 AND visit_type = 'Collection'
           AND scheduled_date = $3::date AND status IN ('Pending', 'Completed')`,
        [collectorId, customerId, date]
      );
      if (existing.rows.length) {
        skipped.push({
          customer_id: customerId,
          reason: 'already_scheduled',
          visit_id: existing.rows[0].visit_id,
        });
        continue;
      }

      const ins = await client.query(
        `INSERT INTO field_visits (customer_id, user_id, visit_type, scheduled_date, status)
         VALUES ($1, $2, 'Collection', $3::date, 'Pending')
         RETURNING visit_id, customer_id, scheduled_date, status`,
        [customerId, collectorId, date]
      );
      created.push(ins.rows[0]);
    }
    await client.query('COMMIT');
    return { created, skipped, scheduledDate: date };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function persistSawResults(pool, rankedRows, { replaceAll = false } = {}) {
  if (!rankedRows.length) {
    if (replaceAll) await pool.query(`DELETE FROM saw_results`);
    return 0;
  }

  const customerIds = rankedRows.map((r) => Number(r.customer_id));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (replaceAll) {
      await client.query(`DELETE FROM saw_results`);
    } else {
      await client.query(
        `DELETE FROM saw_results WHERE customer_id = ANY($1::int[])`,
        [customerIds]
      );
    }
    for (const row of rankedRows) {
      await client.query(
        `INSERT INTO saw_results (customer_id, score, ranking, generated_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
        [Number(row.customer_id), row.score, row.rank]
      );
    }
    await client.query('COMMIT');
    return rankedRows.length;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
