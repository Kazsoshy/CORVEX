/**
 * Real-time HTTP request inspector.
 * Detects SQL injection payloads, path traversal, and abusive API patterns.
 * Can temporarily block repeat offenders for a short TTL (non-destructive).
 */

import { recordSecurityEvent, updateMonitorHealth } from './eventStore.js';

const SQLI_PATTERNS = [
  /('\s*or\s+'?\d+'?\s*=\s*'?\d+|'\s*or\s+'[^']+'\s*=\s*'[^']+)/i,
  /union(\s|\+|\/\*.*\*\/)+select/i,
  /;\s*(drop|alter|truncate|insert|update|delete)\s+(table|into|from)/i,
  /or\s+1\s*=\s*1/i,
  /'\s*;\s*(drop|delete|update|insert)/i,
  /sleep\s*\(\s*\d+\s*\)/i,
  /benchmark\s*\(/i,
  /information_schema\.(tables|columns)/i,
  /xp_cmdshell/i,
  /load_file\s*\(/i,
  /0x[0-9a-f]{8,}/i,
  /waitfor\s+delay\s+'/i,
];

const TRAVERSAL_PATTERNS = [
  /(\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e\/|\.%2e\/|%2e\.)/i,
  /\/etc\/passwd/i,
  /\/proc\/self/i,
  /windows\\system32/i,
];

const SUSPICIOUS_API_PATTERNS = [
  /<script[\s>]/i,
  /javascript:/i,
  /\$\{.*\}/,
  /\{\{.*\}\}/,
  /%\d{2}%\d{2}%\d{2}%\d{2}/,
];

const blocklist = new Map(); // ip -> unblockAt
const hitCounters = new Map(); // ip -> { count, windowStart }
const BLOCK_TTL_MS = 15 * 60 * 1000;
const HIT_WINDOW_MS = 10 * 60 * 1000;
const HIT_THRESHOLD = 5;

function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function flattenPayload(req) {
  const chunks = [];
  try {
    chunks.push(req.originalUrl || req.url || '');
    if (req.query) chunks.push(JSON.stringify(req.query));
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      chunks.push(JSON.stringify(req.body));
    } else if (typeof req.body === 'string') {
      chunks.push(req.body);
    }
  } catch {
    // ignore serialization errors
  }
  return chunks.join('\n');
}

function matchAny(text, patterns) {
  for (const re of patterns) {
    if (re.test(text)) return re.source;
  }
  return null;
}

function noteHit(ip) {
  const now = Date.now();
  const entry = hitCounters.get(ip) || { count: 0, windowStart: now };
  if (now - entry.windowStart > HIT_WINDOW_MS) {
    entry.count = 0;
    entry.windowStart = now;
  }
  entry.count += 1;
  hitCounters.set(ip, entry);
  return entry.count;
}

export function isIpTemporarilyBlocked(ip) {
  const until = blocklist.get(ip);
  if (!until) return false;
  if (Date.now() > until) {
    blocklist.delete(ip);
    return false;
  }
  return true;
}

export function createSecurityRequestInspector(pool) {
  let lastHealthAt = 0;

  return async function securityRequestInspector(req, res, next) {
    const ip = clientIp(req);

    if (isIpTemporarilyBlocked(ip)) {
      return res.status(429).json({
        success: false,
        message: 'Request blocked by CORVEX security controls due to repeated malicious activity. Try again later.',
      });
    }

    // Skip health checks and static-ish noise
    if (req.path === '/' || req.path === '/api/health') return next();

    const payload = flattenPayload(req);
    const sqli = matchAny(payload, SQLI_PATTERNS);
    const traversal = matchAny(payload, TRAVERSAL_PATTERNS);
    const suspicious = matchAny(payload, SUSPICIOUS_API_PATTERNS);

    if (!sqli && !traversal && !suspicious) {
      const now = Date.now();
      if (now - lastHealthAt > 60_000) {
        lastHealthAt = now;
        updateMonitorHealth(pool, 'request_inspector', 'Active', 'Inspecting live API traffic').catch(() => {});
      }
      return next();
    }

    const hits = noteHit(ip);
    let autoAction = 'alerted';
    let blocked = false;
    if (hits >= HIT_THRESHOLD) {
      blocklist.set(ip, Date.now() + BLOCK_TTL_MS);
      autoAction = 'rate_limited';
      blocked = true;
    }

    const threatType = sqli
      ? 'Potential SQL Injection'
      : traversal
        ? 'Suspicious API Activity'
        : 'Suspicious API Activity';
    const severity = sqli || traversal ? 'High' : 'Medium';
    const matched = sqli || traversal || suspicious;

    try {
      await recordSecurityEvent(pool, {
        eventKey: `req:${threatType}:${ip}:${matched}`.slice(0, 240),
        threatType,
        severity,
        title: sqli ? 'Potential SQL injection attempt' : 'Suspicious API request pattern',
        description: `Request to ${req.method} ${req.originalUrl || req.url} matched security rule (${matched}). Hits from this IP in window: ${hits}.${blocked ? ' Temporary block applied.' : ''}`,
        detectionMethod: 'Live request pattern inspection',
        evidence: {
          method: req.method,
          path: req.originalUrl || req.url,
          matchedRule: matched,
          hits,
          blocked,
          userId: req.currentUser?.id || null,
        },
        sourceIp: ip,
        userId: req.currentUser?.id || null,
        userName: req.currentUser?.fullName || req.currentUser?.email || null,
        affectedResource: req.originalUrl || req.url,
        autoAction,
      });
      await updateMonitorHealth(pool, 'request_inspector', 'Active', `Last hit: ${threatType} from ${ip}`);
    } catch (err) {
      console.error('[Security] request inspector record failed:', err.message);
    }

    if (blocked) {
      return res.status(429).json({
        success: false,
        message: 'Request blocked by CORVEX security controls due to repeated malicious activity. Try again later.',
      });
    }

    return next();
  };
}
