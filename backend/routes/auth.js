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
const crypto = require('node:crypto');

function createVerificationToken() {
  return crypto.randomBytes(24).toString('hex');
}

function ensureNotification(db, userId, type, title, body, relatedId = null) {
  db.prepare(`
    INSERT INTO notifications (user_id, type, title, body, related_id, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `).run(userId, type, title, body, relatedId, new Date().toISOString());
}

function queueEmail(db, { userId, recipient, subject, body }) {
  db.prepare(`
    INSERT INTO email_outbox (user_id, recipient, subject, body, status, created_at)
    VALUES (?, ?, ?, ?, 'queued', ?)
  `).run(userId || null, recipient, subject, body, new Date().toISOString());
}

function logAdminAction(db, { actorUserId = null, action, targetType, targetId, detail, ip }) {
  db.prepare(`
    INSERT INTO admin_logs (actor_user_id, action, target_type, target_id, detail, ip, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(actorUserId, action, targetType || null, targetId || null, detail || null, ip || null, new Date().toISOString());
}

function register(router, db) {
  router.post('/api/auth/register', rateLimit({ windowMs: 60_000, max: 10, key: 'register' }), (req, res) => {
    const payload = req.body || {};
    const email = String(payload.email || '').trim();
    const password = String(payload.password || '');
    const fullName = String(payload.fullName || payload.full_name || '').trim();
    const rawRole = String(payload.role || payload.role_name || '').trim().toUpperCase();
    const role = rawRole === 'TEACHER' || rawRole === 'STUDENT' ? rawRole : (payload.role || '').toString().trim().toUpperCase();
    const payoutIban = String(payload.payoutIban || payload.payout_iban || '').trim();

    if (!isValidEmail(email)) return res.status(400).json({ error: 'Geçerli bir e-posta adresi girin.' });
    if (!isValidPassword(password)) return res.status(400).json({ error: 'Şifre en az 8 karakter olmalı.' });
    if (!fullName || fullName.length < 2) return res.status(400).json({ error: 'Ad soyad girin.' });
    if (!['STUDENT', 'TEACHER'].includes(role)) {
      return res.status(400).json({ error: 'Rol yalnızca STUDENT veya TEACHER olabilir.' });
    }
    const normalizedPayoutIban = String(payoutIban || '').replace(/\s+/g, '').toUpperCase();
    if (role === 'TEACHER' && !/^TR\d{24}$/.test(normalizedPayoutIban)) {
      return res.status(400).json({ error: 'Öğretmen kaydında geçerli bir Türkiye IBAN bilgisi zorunludur.' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing) return res.status(409).json({ error: 'Bu e-posta ile zaten bir hesap var.' });

    const roleRow = db.prepare('SELECT id FROM roles WHERE name = ?').get(role);
    const { hash, salt } = hashPassword(password);
    const now = new Date().toISOString();
    const teacherStatus = role === 'TEACHER' ? 'pending' : null; // öğretmen onay bekler (madde 4)
    const verificationToken = createVerificationToken();
    const verificationExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();

    const info = db.prepare(`
      INSERT INTO users (email, password_hash, password_salt, full_name, role_id, is_active, is_blocked, teacher_status, email_verified, email_verification_token, email_verification_expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, 0, ?, 0, ?, ?, ?, ?)
    `).run(email.toLowerCase(), hash, salt, fullName, roleRow.id, teacherStatus, verificationToken, verificationExpiresAt, now, now);

    if (role === 'TEACHER') {
      db.prepare(`
        INSERT INTO teacher_profiles (user_id, full_name, subject, bio, education, experience, is_online, is_in_person, hourly_price, city, photo_url, payout_iban, rating, reviews_count, created_at, updated_at)
        VALUES (?, ?, 'Genel', '', '', '', 1, 1, 0, '', '', ?, 0, 0, ?, ?)
      `).run(info.lastInsertRowid, fullName, normalizedPayoutIban, now, now);
    }

    ensureNotification(db, info.lastInsertRowid, 'welcome', 'Hesabınız hazır', 'E-posta doğrulamanızı tamamlayın.', info.lastInsertRowid);
    queueEmail(db, {
      userId: info.lastInsertRowid,
      recipient: email.toLowerCase(),
      subject: 'Ders Bul e-posta doğrulama',
      body: `Doğrulama kodunuz: ${verificationToken}`,
    });

    const { token, expiresAt } = createSession(db, info.lastInsertRowid, req.socket.remoteAddress);

    res.status(201).json({
      token,
      expiresAt,
      user: publicUser(db, info.lastInsertRowid),
      message: role === 'TEACHER'
        ? 'Kaydınız alındı. E-posta doğrulaması ve öğretmen onayı gerekiyorsa adım adım tamamlanacak.'
        : 'Kaydınız başarıyla oluşturuldu. E-posta doğrulaması tamamlanmalıdır.',
    });
  });

  router.post('/api/auth/verify-email', attachUser(db), requireAuth, (req, res) => {
    const { token } = req.body || {};
    if (!token || !String(token).trim()) return res.status(400).json({ error: 'Doğrulama kodu gerekli.' });

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    if (user.email_verified) return res.json({ message: 'E-posta zaten doğrulandı.' });
    if (!user.email_verification_token || user.email_verification_token !== String(token).trim()) {
      return res.status(400).json({ error: 'Geçersiz doğrulama kodu.' });
    }
    if (user.email_verification_expires_at && new Date(user.email_verification_expires_at).getTime() < Date.now()) {
      return res.status(410).json({ error: 'Doğrulama kodunun süresi dolmuş.' });
    }

    db.prepare(`
      UPDATE users
      SET email_verified = 1,
          email_verification_token = NULL,
          email_verification_expires_at = NULL,
          updated_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), req.user.id);

    ensureNotification(db, req.user.id, 'success', 'E-posta doğrulandı', 'Hesabınız doğrulandı.', req.user.id);
    res.json({ message: 'E-posta doğrulaması tamamlandı.' });
  });

  router.post('/api/auth/request-email-verification', attachUser(db), requireAuth, (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });

    const newToken = createVerificationToken();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
    db.prepare(`
      UPDATE users
      SET email_verification_token = ?, email_verification_expires_at = ?, updated_at = ?
      WHERE id = ?
    `).run(newToken, expiresAt, new Date().toISOString(), req.user.id);

    queueEmail(db, {
      userId: req.user.id,
      recipient: user.email,
      subject: 'Ders Bul yeni doğrulama kodu',
      body: `Doğrulama kodunuz: ${newToken}`,
    });

    ensureNotification(db, req.user.id, 'info', 'Doğrulama kodu üretildi', 'Yeni doğrulama kodunuz hazır.', req.user.id);
    res.json({ message: 'Yeni doğrulama kodu oluşturuldu.', token: newToken });
  });

  router.post('/api/auth/request-password-reset', rateLimit({ windowMs: 60_000, max: 5, key: 'password-reset' }), (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const generic = 'E-posta kayıtlıysa şifre yenileme bağlantısı gönderildi.';
    if (!isValidEmail(email)) return res.json({ message: generic });
    const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(email);
    if (!user) return res.json({ message: generic });

    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    db.prepare('UPDATE users SET password_reset_token = ?, password_reset_expires_at = ?, updated_at = ? WHERE id = ?')
      .run(resetToken, expiresAt, new Date().toISOString(), user.id);
    queueEmail(db, {
      userId: user.id,
      recipient: user.email,
      subject: 'Ders Bul şifre yenileme',
      body: `Şifre yenileme kodunuz: ${resetToken}`,
    });
    res.json({ message: generic });
  });

  router.post('/api/auth/reset-password', rateLimit({ windowMs: 60_000, max: 10, key: 'password-reset-confirm' }), (req, res) => {
    const token = String(req.body?.token || '').trim();
    const password = req.body?.password;
    if (!token || !isValidPassword(password)) return res.status(400).json({ error: 'Geçerli kod ve en az 8 karakterli yeni şifre gerekli.' });
    const user = db.prepare('SELECT * FROM users WHERE password_reset_token = ?').get(token);
    if (!user || !user.password_reset_expires_at || new Date(user.password_reset_expires_at).getTime() < Date.now()) {
      return res.status(400).json({ error: 'Şifre yenileme kodu geçersiz veya süresi dolmuş.' });
    }
    const { hash, salt } = hashPassword(password);
    db.prepare(`
      UPDATE users SET password_hash = ?, password_salt = ?, password_reset_token = NULL,
        password_reset_expires_at = NULL, updated_at = ? WHERE id = ?
    `).run(hash, salt, new Date().toISOString(), user.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
    res.json({ message: 'Şifreniz yenilendi. Yeniden giriş yapabilirsiniz.' });
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

  router.get('/api/auth/me/notifications', attachUser(db), requireAuth, (req, res) => {
    const rows = db.prepare(`
      SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 25
    `).all(req.user.id);
    res.json({ notifications: rows });
  });

  router.patch('/api/auth/me/notifications/:id/read', attachUser(db), requireAuth, (req, res) => {
    const result = db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
    if (!result.changes) return res.status(404).json({ error: 'Bildirim bulunamadı.' });
    res.json({ message: 'Bildirim okundu.' });
  });

  router.post('/api/auth/logout', attachUser(db), requireAuth, (req, res) => {
    destroySession(db, req.sessionToken);
    res.json({ message: 'Çıkış yapıldı.' });
  });
}

function publicUser(db, id) {
  const row = db.prepare(`
    SELECT u.id, u.email, u.full_name, u.is_active, u.is_blocked, u.teacher_status, u.email_verified, u.created_at, r.name AS role
    FROM users u JOIN roles r ON r.id = u.role_id
    WHERE u.id = ?
  `).get(id);
  return row;
}

module.exports = { register, publicUser, logAdminAction };
