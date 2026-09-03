import express from 'express';

const router = express.Router();

// Get collector schedule/visits
router.get('/schedule', async (req, res) => {
  const pool = req.app.locals.pool;
  const user = req.currentUser;

  try {
    const q = `
      SELECT fv.id, fv.scheduled_date as "lastVisitDate", fv.status, fv.visit_type,
             c.id as id, c.contact_person_fname || ' ' || c.contact_person_lname as "customerName",
             'ACC-' || c.id as "accountNumber",
             c.contact_person_phone as phone, c.outstanding_balance as "outstandingBalance",
             c.latitude, c.longitude, 'Sample Address' as address
      FROM field_visits fv
      JOIN customers c ON fv.customer_id = c.id
      WHERE fv.user_id = $1 AND fv.scheduled_date <= CURRENT_DATE
      ORDER BY fv.id ASC
    `;
    const result = await pool.query(q, [user.id]);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Error fetching collector schedule:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch schedule' });
  }
});

// Post a collection payment
router.post('/', async (req, res) => {
  const pool = req.app.locals.pool;
  const user = req.currentUser;
  
  const { customer_id, amount, payment_method_id, notes, visit_id, latitude, longitude } = req.body;
  if (!customer_id || !amount || amount <= 0 || !payment_method_id) {
    return res.status(400).json({ success: false, message: 'Invalid payment parameters' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Get and lock customer record
    const custRes = await client.query('SELECT outstanding_balance, u.branch_id FROM customers c JOIN users u ON c.user_id = u.id WHERE c.id = $1 FOR UPDATE', [customer_id]);
    if (custRes.rows.length === 0) throw new Error('Customer not found');
    const customer = custRes.rows[0];

    // 2. Generate Receipt number
    const receipt_number = `RCPT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // 3. Insert collection_payment
    const payRes = await client.query(`
      INSERT INTO collection_payment (receipt_number, customer_id, collector_id, branch_id, amount, payment_method_id, payment_date, payment_time, status, notes)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, CURRENT_TIME, 'Completed', $7)
      RETURNING id
    `, [receipt_number, customer_id, user.id, customer.branch_id, amount, payment_method_id, notes]);
    const collection_id = payRes.rows[0].id;

    // 4. Update customer outstanding balance
    const previous_balance = Number(customer.outstanding_balance);
    const new_balance = previous_balance - amount;
    if (new_balance < 0) {
      throw new Error('Payment amount exceeds outstanding balance');
    }
    await client.query('UPDATE customers SET outstanding_balance = $1 WHERE id = $2', [new_balance, customer_id]);

    // 5. Insert credit_history
    await client.query(`
      INSERT INTO credit_history (customer_id, collection_id, previous_balance, payment_amount, remaining_balance, payment_status, transaction_date)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE)
    `, [customer_id, collection_id, previous_balance, amount, new_balance, new_balance === 0 ? 'Paid' : 'Partial']);

    // 6. Complete field visit if visit_id provided
    if (visit_id) {
      await client.query('UPDATE field_visits SET status = $1 WHERE id = $2', ['Completed', visit_id]);
      
      // Log activity
      await client.query(`
        INSERT INTO field_activity_reports (visit_id, user_id, activity_type, remarks)
        VALUES ($1, $2, $3, $4)
      `, [visit_id, user.id, 'Collection Payment', `Collected ${amount}. GPS: ${latitude},${longitude}. Notes: ${notes || ''}`]);
    }

    await client.query('COMMIT');
    res.json({ success: true, message: 'Collection logged successfully', data: { receipt_number, new_balance } });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error logging collection:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to log collection' });
  } finally {
    client.release();
  }
});

// Collector analytics
router.get('/analytics', async (req, res) => {
  const pool = req.app.locals.pool;
  const user = req.currentUser;

  try {
    const q = `
      SELECT 
        COUNT(CASE WHEN status = 'Completed' THEN 1 END) as completed_visits,
        COUNT(*) as total_visits,
        (SELECT COALESCE(SUM(amount), 0) FROM collection_payment WHERE collector_id = $1 AND payment_date = CURRENT_DATE) as daily_collected
      FROM field_visits 
      WHERE user_id = $1 AND scheduled_date = CURRENT_DATE
    `;
    const result = await pool.query(q, [user.id]);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch analytics' });
  }
});

export default router;
