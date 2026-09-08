// middleware.js — auth guard, RBAC izin kontrolü, basit rate limiting

const { getUserBySession } = require('./auth');

function getBearerToken(req) {
  const header = req.headers['authorization'] || '';
  const [scheme, token] = header.split(' ');
  if (scheme === 'Bearer' && token) return token;
  return null;
}

// req.user'ı doldurur; token yoksa/geçersizse req.user = null (401 fırlatmaz).
function attachUser(db) {
  return (req, res, next) => {
    const token = getBearerToken(req);
    req.user = token ? getUserBySession(db, token) : null;
    req.sessionToken = token;
    next();
  };
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });
  if (req.user.is_blocked) return res.status(403).json({ error: 'Hesabınız engellenmiş.' });
  if (!req.user.is_active) return res.status(403).json({ error: 'Hesabınız pasif durumda.' });
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Bu işlem için yetkiniz yok.' });
    }
    next();
  };
}

// SUPER_ADMIN her zaman geçer. ADMIN: role_permissions üzerinden.
// ADMIN_HELPER: user_permissions tablosundaki override üzerinden (rol izni yok).
function requirePermission(db, key) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });
    if (req.user.role === 'SUPER_ADMIN') return next();

    const perm = db.prepare('SELECT id FROM permissions WHERE key = ?').get(key);
    if (!perm) return res.status(500).json({ error: `Bilinmeyen izin anahtarı: ${key}` });

    const override = db.prepare(
      'SELECT allowed FROM user_permissions WHERE user_id = ? AND permission_id = ?'
    ).get(req.user.id, perm.id);
    if (override) {
      return override.allowed ? next() : res.status(403).json({ error: 'Bu işlem için yetkiniz yok.' });
    }

    const rolePerm = db.prepare(
      'SELECT 1 FROM role_permissions WHERE role_id = ? AND permission_id = ?'
    ).get(req.user.role_id, perm.id);
    if (rolePerm) return next();

    return res.status(403).json({ error: 'Bu işlem için yetkiniz yok.' });
  };
}

// Basit bellek-içi rate limiter (IP + anahtar bazlı). Tek process için yeterli;
// çoklu sunucuya geçilirse Redis gibi paylaşımlı bir store ile değiştirilmeli.
const buckets = new Map();
let lastBucketCleanup = Date.now();
function rateLimit({ windowMs = 60_000, max = 20, key = 'default' } = {}) {
  return (req, res, next) => {
    const ip = req.socket.remoteAddress || 'unknown';
    const bucketKey = `${key}:${ip}`;
    const now = Date.now();
    if (now - lastBucketCleanup > 5 * 60_000) {
      for (const [storedKey, storedEntry] of buckets) {
        if (storedEntry.resetAt < now) buckets.delete(storedKey);
      }
      lastBucketCleanup = now;
    }
    const entry = buckets.get(bucketKey) || { count: 0, resetAt: now + windowMs };
    if (now > entry.resetAt) {
      entry.count = 0;
      entry.resetAt = now + windowMs;
    }
    entry.count += 1;
    buckets.set(bucketKey, entry);
    if (entry.count > max) {
      return res.status(429).json({ error: 'Çok fazla istek gönderildi. Lütfen biraz sonra tekrar deneyin.' });
    }
    next();
  };
}

module.exports = { attachUser, requireAuth, requireRole, requirePermission, rateLimit };
