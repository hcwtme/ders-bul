// uploads.js — Profil fotoğrafı / kapak görseli yükleme.
// Multipart form-data parse etmek için harici pakete (multer/busboy) ihtiyaç
// duymamak adına, istemciden resmi base64 string olarak JSON içinde alıyoruz.
// Sunucu tarafında: MIME tipi doğrulanıyor, boyut sınırı uygulanıyor, dosya adı
// rastgele üretiliyor (path traversal / dosya adı çakışması engellenmiş oluyor).

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};
const MAX_BYTES = 4 * 1024 * 1024; // 4MB

function register(router, db) {
  const { attachUser, requireAuth } = require('./middleware');

  router.post('/api/uploads/image', attachUser(db), requireAuth, (req, res) => {
    const { mimeType, dataBase64 } = req.body || {};
    const ext = ALLOWED_MIME[mimeType];
    if (!ext) {
      return res.status(400).json({ error: 'Yalnızca JPEG, PNG veya WEBP resim yükleyebilirsiniz.' });
    }
    if (!dataBase64 || typeof dataBase64 !== 'string') {
      return res.status(400).json({ error: 'Resim verisi (dataBase64) gerekli.' });
    }

    let buffer;
    try {
      buffer = Buffer.from(dataBase64, 'base64');
    } catch {
      return res.status(400).json({ error: 'Geçersiz base64 verisi.' });
    }
    if (buffer.length === 0 || buffer.length > MAX_BYTES) {
      return res.status(400).json({ error: `Dosya boyutu en fazla ${MAX_BYTES / (1024 * 1024)}MB olabilir.` });
    }
    if (!looksLikeImage(buffer, mimeType)) {
      return res.status(400).json({ error: 'Dosya içeriği belirtilen resim türüyle uyuşmuyor.' });
    }

    const filename = `${crypto.randomBytes(16).toString('hex')}${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);

    res.status(201).json({ url: `/uploads/${filename}` });
  });
}

// Basit "sihirli sayı" (magic bytes) kontrolü — beyan edilen MIME tipiyle
// dosyanın gerçek içeriğinin örtüştüğünü doğrular (uzantı sahteciliğine karşı).
function looksLikeImage(buffer, mimeType) {
  const b = buffer;
  if (mimeType === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8;
  if (mimeType === 'image/png') return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (mimeType === 'image/webp') {
    return b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
}

function serveUpload(req, res, pathname) {
  const filename = path.basename(pathname); // path traversal engeli
  const filePath = path.join(UPLOAD_DIR, filename);
  if (!filePath.startsWith(UPLOAD_DIR) || !fs.existsSync(filePath)) return false;
  const ext = path.extname(filePath);
  const mime = Object.entries(ALLOWED_MIME).find(([, e]) => e === ext);
  res.writeHead(200, { 'Content-Type': mime ? mime[0] : 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

module.exports = { register, serveUpload, UPLOAD_DIR };
