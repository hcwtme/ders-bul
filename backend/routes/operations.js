const fs = require('node:fs');
const path = require('node:path');
const { attachUser, requireAuth, requirePermission } = require('../middleware');
const { DB_PATH, DATA_DIR } = require('../db');

function register(router, db) {
  router.get('/api/legal', (req, res) => {
    res.json({
      privacy: 'Ders Bul, hesap ve ders başvurusu için gerekli kişisel verileri işler. Veriler amaçla sınırlı tutulur ve kullanıcı talebiyle silme başvurusu yapılabilir.',
      terms: 'Platform yalnızca öğrenci ve öğretmenleri buluşturur. Ders, ödeme ve iletişim bilgilerinin doğruluğundan kullanıcılar sorumludur.',
      kvkk: 'KVKK kapsamındaki erişim, düzeltme, silme ve bilgi talebi için destek kanalını kullanın.',
      contact: process.env.SUPPORT_EMAIL || 'destek@example.com',
    });
  });

  router.get('/api/admin/backups', attachUser(db), requireAuth, requirePermission(db, 'reports.view'), (req, res) => {
    const backupDir = path.join(DATA_DIR, 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const files = fs.readdirSync(backupDir).filter((file) => file.endsWith('.db')).sort().reverse();
    res.json({ backups: files });
  });

  router.post('/api/admin/backups', attachUser(db), requireAuth, requirePermission(db, 'reports.view'), (req, res) => {
    const backupDir = path.join(DATA_DIR, 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const filename = `dersbul-${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
    fs.copyFileSync(DB_PATH, path.join(backupDir, filename));
    res.status(201).json({ filename, message: 'Veritabanı yedeği oluşturuldu.' });
  });
}

module.exports = { register };
