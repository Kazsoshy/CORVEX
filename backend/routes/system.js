import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { requirePermission } from '../middleware/auth.js';
import { AUDIT_STATUS, writeAuditFromReq } from '../lib/auditLog.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.join(__dirname, '..', 'data', 'backups');

const DEFAULT_SETTINGS = {
  companyName: 'CORVEX Furniture',
  companyEmail: 'ops@corvex.ph',
  smsEnabled: 'true',
  otpEnabled: 'true',
  leafletApiKey: '',
  backupSchedule: 'Daily at 02:00 AM',
  notificationsEmail: 'true',
  notificationsSms: 'true',
  logoDataUrl: '',
};

router.use(requirePermission(
  'settings.view',
  'settings.update',
  'backup.view',
  'backup.create',
  'backup.restore',
  'backup.download',
));

function ensureBackupDir() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function parseSettings(rows) {
  const settings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (Object.prototype.hasOwnProperty.call(settings, row.setting_key)) {
      settings[row.setting_key] = row.setting_value ?? '';
    }
  }
  return settings;
}

async function readSettings(pool) {
  const result = await pool.query(`SELECT setting_key, setting_value FROM system_settings`);
  return parseSettings(result.rows);
}

async function writeSettings(pool, settings) {
  const entries = Object.entries(settings).filter(([key]) => Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key));
  for (const [key, value] of entries) {
    await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (setting_key)
       DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = CURRENT_TIMESTAMP`,
      [key, value == null ? '' : String(value)]
    );
  }
}

router.get('/settings', requirePermission('settings.view'), async (req, res) => {
  try {
    const settings = await readSettings(req.app.locals.pool);
    return res.status(200).json({ success: true, data: settings });
  } catch (err) {
    console.error('[System] GET /settings error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load settings.' });
  }
});

router.put('/settings', requirePermission('settings.update'), async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const current = await readSettings(pool);
    const next = { ...current };
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (req.body[key] !== undefined) next[key] = req.body[key] == null ? '' : String(req.body[key]);
    }
    if (next.logoDataUrl && next.logoDataUrl.length > 200000) {
      return res.status(400).json({ success: false, message: 'Logo must be smaller than 150 KB.' });
    }
    await writeSettings(pool, next);
    await writeAuditFromReq(pool, req, {
      module: 'System Configuration',
      activity: 'Update Settings',
      action: 'Update Settings',
      description: 'Updated system configuration settings.',
      status: AUDIT_STATUS.UPDATED,
      affectedRecord: 'system:settings',
    });
    return res.status(200).json({ success: true, message: 'Settings saved.', data: next });
  } catch (err) {
    console.error('[System] PUT /settings error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to save settings.' });
  }
});

router.post('/settings/reset', requirePermission('settings.update'), async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    await writeSettings(pool, DEFAULT_SETTINGS);
    await writeAuditFromReq(pool, req, {
      module: 'System Configuration',
      activity: 'Reset Settings',
      action: 'Reset Settings',
      description: 'Restored system settings to defaults.',
      status: AUDIT_STATUS.RESTORED,
      affectedRecord: 'system:settings',
    });
    return res.status(200).json({ success: true, message: 'Settings restored to defaults.', data: { ...DEFAULT_SETTINGS } });
  } catch (err) {
    console.error('[System] POST /settings/reset error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to restore defaults.' });
  }
});

async function buildSnapshot(pool) {
  const settings = await readSettings(pool);
  const [branches, products, categories, suppliers] = await Promise.all([
    pool.query(`SELECT id, name, address, status FROM branches ORDER BY id`),
    pool.query(`SELECT id, name, sku, unit_price, status FROM products ORDER BY id`),
    pool.query(`SELECT category_id, category_name, status FROM product_categories ORDER BY category_id`),
    pool.query(`SELECT suppliers_id, supplier_name, contact, email, status FROM suppliers ORDER BY suppliers_id`),
  ]);
  return {
    createdAt: new Date().toISOString(),
    settings,
    branches: branches.rows,
    products: products.rows,
    categories: categories.rows,
    suppliers: suppliers.rows,
  };
}

router.get('/backups', requirePermission('backup.view'), async (req, res) => {
  try {
    const result = await req.app.locals.pool.query(
      `SELECT b.backup_id, b.backup_type, b.status, b.size_bytes, b.file_name, b.created_at,
              TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS created_by_name
       FROM system_backups b
       LEFT JOIN users u ON u.id = b.created_by
       ORDER BY b.created_at DESC
       LIMIT 100`
    );
    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[System] GET /backups error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load backups.' });
  }
});

router.post('/backups', requirePermission('backup.create'), async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    ensureBackupDir();
    const snapshot = await buildSnapshot(pool);
    const fileName = `corvex-backup-${Date.now()}.json`;
    const filePath = path.join(BACKUP_DIR, fileName);
    const body = JSON.stringify(snapshot, null, 2);
    fs.writeFileSync(filePath, body, 'utf8');
    const inserted = await pool.query(
      `INSERT INTO system_backups (backup_type, status, size_bytes, created_by, file_name)
       VALUES ('Manual', 'Completed', $1, $2, $3)
       RETURNING backup_id, backup_type, status, size_bytes, file_name, created_at`,
      [Buffer.byteLength(body), req.currentUser.id, fileName]
    );
    await writeAuditFromReq(pool, req, {
      module: 'System Configuration',
      activity: 'Create Backup',
      action: 'Create Backup',
      description: `Created system backup ${fileName}.`,
      status: AUDIT_STATUS.CREATED,
      affectedRecord: `backup:${inserted.rows[0].backup_id}`,
    });
    return res.status(201).json({
      success: true,
      message: 'Backup created. Download it from the history table.',
      data: inserted.rows[0],
    });
  } catch (err) {
    console.error('[System] POST /backups error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to create backup.' });
  }
});

router.get('/backups/:id/download', requirePermission('backup.download'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'Invalid backup ID.' });
    const pool = req.app.locals.pool;
    const result = await pool.query(
      `SELECT file_name FROM system_backups WHERE backup_id = $1`,
      [id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Backup not found.' });
    const fileName = result.rows[0].file_name;
    const filePath = path.join(BACKUP_DIR, path.basename(fileName));
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Backup file is missing on the server.' });
    }
    await writeAuditFromReq(pool, req, {
      module: 'System Configuration',
      activity: 'Download Backup',
      action: 'Download Backup',
      description: `Downloaded system backup ${fileName}.`,
      status: AUDIT_STATUS.EXPORTED,
      affectedRecord: `backup:${id}`,
    });
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(fileName)}"`);
    return res.sendFile(filePath);
  } catch (err) {
    console.error('[System] GET /backups/:id/download error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to download backup.' });
  }
});

router.post('/backups/:id/restore', requirePermission('backup.restore'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'Invalid backup ID.' });
    const pool = req.app.locals.pool;
    const result = await pool.query(`SELECT file_name FROM system_backups WHERE backup_id = $1`, [id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Backup not found.' });
    const filePath = path.join(BACKUP_DIR, path.basename(result.rows[0].file_name));
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Backup file is missing on the server.' });
    }
    const snapshot = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!snapshot?.settings || typeof snapshot.settings !== 'object') {
      return res.status(400).json({ success: false, message: 'Backup file does not contain settings.' });
    }
    const next = { ...DEFAULT_SETTINGS };
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (snapshot.settings[key] !== undefined) next[key] = String(snapshot.settings[key] ?? '');
    }
    await writeSettings(pool, next);
    await writeAuditFromReq(pool, req, {
      module: 'System Configuration',
      activity: 'Restore Backup',
      action: 'Restore Backup',
      description: `Restored company settings from backup #${id}.`,
      status: AUDIT_STATUS.RESTORED,
      affectedRecord: `backup:${id}`,
    });
    return res.status(200).json({
      success: true,
      message: 'Company settings restored from this backup. Transactions, users, and payments were not overwritten.',
      data: next,
    });
  } catch (err) {
    console.error('[System] POST /backups/:id/restore error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to restore backup.' });
  }
});

export default router;
