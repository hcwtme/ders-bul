// server.js — Ders Bul backend giriş noktası
// Sadece Node.js built-in modülleri kullanılır (http, fs, path, node:sqlite, node:crypto).
// Harici paket (express, cors, dotenv...) YOKTUR — internetsiz ortamlarda bile
// `node server.js` ile doğrudan çalışır.

loadDotEnv();

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const { db } = require('./db');
const { Router } = require('./router');
const { register: registerUploads, serveUpload } = require('./uploads');

const PORT = Number(process.env.PORT || 4000);
const CORS_ORIGIN = process.env.CORS_ORIGIN || '';
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
const ERROR_LOG = path.join(__dirname, 'data', 'errors.log');

function logError(error, context = {}) {
  const entry = JSON.stringify({ at: new Date().toISOString(), message: error?.message || String(error), stack: error?.stack, ...context });
  fs.appendFileSync(ERROR_LOG, `${entry}\n`);
  console.error(entry);
}

const router = new Router();
require('./routes/auth').register(router, db);
require('./routes/admin-users').register(router, db);
require('./routes/teachers').register(router, db);
require('./routes/platform').register(router, db);
require('./routes/operations').register(router, db);
registerUploads(router, db);

router.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'ders-bul' });
});

router.get('/robots.txt', (req, res) => {
  const siteUrl = String(process.env.SITE_URL || `http://${req.headers.host}`).replace(/\/+$/, '');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /uploads/\nSitemap: ${siteUrl}/sitemap.xml\n`);
});

router.get('/sitemap.xml', (req, res) => {
  const siteUrl = String(process.env.SITE_URL || `http://${req.headers.host}`).replace(/\/+$/, '');
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${siteUrl}/</loc></url></urlset>`);
});

router.get('/api/site-settings', (req, res) => {
  res.json({
    whatsappNumber: process.env.WHATSAPP_NUMBER || '',
    whatsappLabel: process.env.WHATSAPP_LABEL || 'WhatsApp iletişim hattı',
  });
});

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let filePath = path.join(FRONTEND_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!filePath.startsWith(FRONTEND_DIR)) { res.writeHead(403); res.end('Forbidden'); return true; }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    if (path.extname(url.pathname)) return false;
    // SPA fallback: bilinmeyen frontend rotalarında index.html döndür
    filePath = path.join(FRONTEND_DIR, 'index.html');
    if (!fs.existsSync(filePath)) return false;
  }
  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    const MAX = 2 * 1024 * 1024; // 2MB güvenlik limiti
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX) { reject(new Error('Payload too large')); req.destroy(); return; }
      data += chunk;
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(new Error('Geçersiz JSON gövdesi.')); }
    });
    req.on('error', reject);
  });
}

function enhanceResponse(res) {
  res.status = function (code) { res.statusCode = code; return res; };
  res.json = function (obj) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj));
  };
  return res;
}

const server = http.createServer(async (req, res) => {
  const requestOrigin = req.headers.origin;
  const allowedOrigin = CORS_ORIGIN === '*' ? requestOrigin || '*' : CORS_ORIGIN;
  if (allowedOrigin) res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  if (requestOrigin && allowedOrigin === requestOrigin) res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://unpkg.com 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  if (req.url.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  enhanceResponse(res);

  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/uploads/')) {
    if (serveUpload(req, res, url.pathname)) return;
    return res.status(404).json({ error: 'Yüklenen dosya bulunamadı.' });
  }
  if (url.pathname === '/robots.txt' || url.pathname === '/sitemap.xml') {
    return router.handle(req, res);
  }
  if (!url.pathname.startsWith('/api/')) {
    if (serveStatic(req, res)) return;
    return res.status(404).json({ error: 'Bulunamadı.' });
  }

  try {
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
      req.body = await readJsonBody(req);
    }
  } catch (e) {
    logError(e, { method: req.method, url: req.url });
    return res.status(400).json({ error: e.message || 'Geçersiz istek gövdesi.' });
  }

  router.handle(req, res).catch((error) => {
    logError(error, { method: req.method, url: req.url });
    if (!res.writableEnded) res.status(500).json({ error: 'Sunucu hatası.' });
  });
});

process.on('uncaughtException', (error) => logError(error, { type: 'uncaughtException' }));
process.on('unhandledRejection', (error) => logError(error, { type: 'unhandledRejection' }));

server.listen(PORT, () => {
  console.log(`Ders Bul backend http://localhost:${PORT} adresinde çalışıyor.`);
  console.log(`Frontend de aynı porttan sunuluyor (statik dosyalar): http://localhost:${PORT}`);
});

// --- .env dosyasını harici pakete gerek kalmadan yükleyen küçük yardımcı ---
// (Dosyanın en üstünde çağrıldığı için kendi fs/path require'larını
// bağımsız olarak alır — dıştaki const'ların TDZ'sine takılmamak için.)
function loadDotEnv() {
  const fs = require('node:fs');
  const path = require('node:path');
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
