// routes/auth.js — Kayıt / Giriş / Oturum bilgisi / Çıkış
// Herkese açık kayıt sadece STUDENT ve TEACHER rolleri içindir.
// ADMIN / ADMIN_HELPER / SUPER_ADMIN hesapları yalnızca Super Admin tarafından
// admin-users.js üzerinden oluşturulabilir (madde 24: kullanıcı frontend'den
// kendini admin yapamamalı).

const {
  hashPassword, verifyPassword, createSession, destroySession,
  isValidEmail, isValidPassword,
} = require('../auth');
const { attachUser, requireAuth, rateLimit } = require('../middleware');

function logAdminAction(db, { actorUserId = null, action, targetType, targetId, detail, ip }) {
  db.prepare(`
    INSERT INTO admin_logs (actor_user_id, action, target_type, target_id, detail, ip, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(actorUserId, action, targetType || null, targetId || null, detail || null, ip || null, new Date().toISOString());
}

function register(router, db) {
  router.get('/api/auth/providers', (req, res) => {
    res.json({
      google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      apple: Boolean(process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY),
    });
  });

  router.get('/api/auth/oauth/:provider', (req, res) => {
    const provider = String(req.params.provider || '').toLowerCase();
    if (!['google', 'apple'].includes(provider)) return res.status(404).json({ error: 'Desteklenmeyen giriş sağlayıcısı.' });
    return res.status(501).json({ error: `${provider === 'google' ? 'Google' : 'Apple'} girişi için OAuth bilgileri sunucuya eklenmeli.` });
  });

  router.post('/api/auth/register', rateLimit({ windowMs: 60_000, max: 10, key: 'register' }), (req, res) => {
    const { email, password, fullName, role } = req.body || {};

    if (!isValidEmail(email)) return res.status(400).json({ error: 'Geçerli bir e-posta adresi girin.' });
    if (!isValidPassword(password)) return res.status(400).json({ error: 'Şifre en az 8 karakter olmalı.' });
    if (!fullName || fullName.trim().length < 2) return res.status(400).json({ error: 'Ad soyad girin.' });
    if (!['STUDENT', 'TEACHER'].includes(role)) {
      return res.status(400).json({ error: 'Rol yalnızca STUDENT veya TEACHER olabilir.' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing) return res.status(409).json({ error: 'Bu e-posta ile zaten bir hesap var.' });

    const roleRow = db.prepare('SELECT id FROM roles WHERE name = ?').get(role);
    const { hash, salt } = hashPassword(password);
    const now = new Date().toISOString();
    const teacherStatus = role === 'TEACHER' ? 'pending' : null; // öğretmen onay bekler (madde 4)

    const info = db.prepare(`
      INSERT INTO users (email, password_hash, password_salt, full_name, role_id, is_active, is_blocked, teacher_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?, ?)
    `).run(email.toLowerCase(), hash, salt, fullName.trim(), roleRow.id, teacherStatus, now, now);

    const { token, expiresAt } = createSession(db, info.lastInsertRowid, req.socket.remoteAddress);

    res.status(201).json({
      token,
      expiresAt,
      user: publicUser(db, info.lastInsertRowid),
      message: role === 'TEACHER'
        ? 'Kaydınız alındı. Öğretmen hesabınız Super Admin onayından sonra aktif olacak.'
        : 'Kaydınız başarıyla oluşturuldu.',
    });
  });

  router.post('/api/auth/login', rateLimit({ windowMs: 60_000, max: 15, key: 'login' }), (req, res) => {
    const { email, password } = req.body || {};
    if (!isValidEmail(email) || !password) {
      return res.status(400).json({ error: 'E-posta ve şifre gerekli.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
    // Kullanıcı bulunamasa bile bir hash karşılaştırması çalıştırıyoruz ki
    // "kullanıcı var mı yok mu" zamanlama farkından anlaşılmasın.
    const dummySalt = 'a'.repeat(32);
    const dummyHash = 'b'.repeat(128);
    const ok = user
      ? verifyPassword(password, user.password_salt, user.password_hash)
      : (verifyPassword(password, dummySalt, dummyHash), false);

    if (!user || !ok) return res.status(401).json({ error: 'E-posta veya şifre hatalı.' });
    if (user.is_blocked) return res.status(403).json({ error: 'Hesabınız engellenmiş. Destek ile iletişime geçin.' });
    if (!user.is_active) return res.status(403).json({ error: 'Hesabınız pasif durumda.' });

    const { token, expiresAt } = createSession(db, user.id, req.socket.remoteAddress);
    res.json({ token, expiresAt, user: publicUser(db, user.id) });
  });

  router.get('/api/auth/me', attachUser(db), requireAuth, (req, res) => {
    res.json({ user: publicUser(db, req.user.id) });
  });

  router.post('/api/auth/logout', attachUser(db), requireAuth, (req, res) => {
    destroySession(db, req.sessionToken);
    res.json({ message: 'Çıkış yapıldı.' });
  });
}

function publicUser(db, id) {
  const row = db.prepare(`
    SELECT u.id, u.email, u.full_name, u.is_active, u.is_blocked, u.teacher_status, u.created_at, r.name AS role
    FROM users u JOIN roles r ON r.id = u.role_id
    WHERE u.id = ?
  `).get(id);
  return row;
}

module.exports = { register, publicUser, logAdminAction };
