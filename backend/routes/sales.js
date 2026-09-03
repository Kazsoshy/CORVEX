import express from 'express';

const router = express.Router();

router.post('/', async (req, res) => {
  const pool = req.app.locals.pool;
  const { customer_id, cart, payment_method_id, notes } = req.body;

  if (!customer_id || !cart || cart.length === 0 || !payment_method_id) {
    return res.status(400).json({ success: false, message: 'Invalid payload: customer_id, cart, and payment_method_id are required.' });
  }

  const client = await pool.connect();
  
  try {
    await client.query('BEGIN'); // Start transaction

    // Calculate total amount
    const total_amount = cart.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    // Use the branch_id from the authenticated user, or if Super Admin (null), require it from body.
    const branch_id = req.currentUser?.branchId || req.body.branch_id;
    if (!branch_id) {
      throw new Error('branch_id is required');
    }
    const user_id = req.currentUser?.id || null;

    // 1. Verify and deduct inventory for each item
    for (const item of cart) {
      // Check stock FOR UPDATE to lock the row
      const stockRes = await client.query(
        'SELECT available_stock FROM branch_inventory WHERE product_id = $1 AND branch_id = $2 FOR UPDATE',
        [item.id, branch_id]
      );
      
      if (stockRes.rows.length === 0) {
        throw new Error(`Product ${item.id} not found in branch inventory.`);
      }
      
      const currentStock = stockRes.rows[0].available_stock;
      if (currentStock < item.quantity) {
        throw new Error(`Insufficient stock for product ${item.id}. Available: ${currentStock}, Required: ${item.quantity}`);
      }

      // Deduct inventory
      await client.query(
        'UPDATE branch_inventory SET available_stock = available_stock - $1, updated_at = NOW() WHERE product_id = $2 AND branch_id = $3',
        [item.quantity, item.id, branch_id]
      );
    }

    // 2. Insert into sales_invoices
    const invoice_number = `INV-${Date.now()}`;
    const saleRes = await client.query(
      `INSERT INTO sales_invoices (invoice_number, customer_id, sales_agent_id, branch_id, total_amount, payment_method_id, status, invoices_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8) RETURNING id`,
      [invoice_number, customer_id, user_id, branch_id, total_amount, payment_method_id, 'Confirmed', notes]
    );
    const invoice_id = saleRes.rows[0].id;
    
    // 3. Insert sale items and stock movements
    for (const item of cart) {
      await client.query(
        `INSERT INTO sales_invoice_items (invoice_id, product_id, quantity, unit_price, line_total) VALUES ($1, $2, $3, $4, $5)`,
        [invoice_id, item.id, item.quantity, item.unitPrice, item.quantity * item.unitPrice]
      );

      await client.query(
        `INSERT INTO stock_movements (performed_by, product_id, quantity, type, movement_ref, reference_type, reference_id, movement_date, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)`,
        [user_id, item.id, -item.quantity, 'Sale Deduction', `MOV-SALE-${invoice_id}-${item.id}`, 'sale', invoice_id, `Sold via invoice ${invoice_number}`]
      );
    }

    await client.query('COMMIT'); // Commit transaction
    return res.status(201).json({ success: true, message: 'Sale completed successfully.', invoice_id });

  } catch (err) {
    await client.query('ROLLBACK'); // Rollback on error
    console.error('[Sales] Transaction failed:', err.message);
    return res.status(500).json({ success: false, message: 'Sale transaction failed.', error: err.message });
  } finally {
    client.release();
  }
});

export default router;
