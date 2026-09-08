// auth.js — şifre hashleme + opak session token yönetimi
// crypto.scrypt kullanılıyor (bcrypt paketine gerek yok, Node built-in).

const crypto = require('node:crypto');

const SCRYPT_KEYLEN = 64;
const SESSION_TTL_HOURS = Math.min(Math.max(Number(process.env.SESSION_TTL_HOURS || 24 * 7), 1), 24 * 30);

function hashPassword(plainPassword) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(plainPassword, salt, SCRYPT_KEYLEN).toString('hex');
  return { hash, salt };
}

function verifyPassword(plainPassword, salt, expectedHash) {
  const hash = crypto.scryptSync(plainPassword, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(expectedHash, 'hex');
  if (hash.length !== expected.length) return false;
  return crypto.timingSafeEqual(hash, expected);
}

function createSession(db, userId, ip) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_HOURS * 60 * 60 * 1000);
  db.prepare(`
    INSERT INTO sessions (token, user_id, ip, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(token, userId, ip || null, now.toISOString(), expires.toISOString());
  return { token, expiresAt: expires.toISOString() };
}

function destroySession(db, token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

function getUserBySession(db, token) {
  if (!token) return null;
  const row = db.prepare(`
    SELECT s.expires_at, u.*, r.name AS role
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    JOIN roles r ON r.id = u.role_id
    WHERE s.token = ?
  `).get(token);
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    destroySession(db, token);
    return null;
  }
  return row;
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 128;
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  getUserBySession,
  isValidEmail,
  isValidPassword,
};
