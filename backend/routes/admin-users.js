// routes/admin-users.js — Kullanıcı yönetimi + yetki (RBAC) yönetimi
// Erişim: SUPER_ADMIN her şeyi yapabilir. ADMIN ve ADMIN_HELPER, yalnızca
// kendilerine tanımlı 'users.view' / 'users.edit' / 'teachers.manage'
// izinlerine sahiplerse ilgili uçlara erişebilir.

const { attachUser, requireAuth, requireRole, requirePermission } = require('../middleware');
const { hashPassword } = require('../auth');
const { publicUser, logAdminAction } = require('./auth');

function register(router, db) {
  const auth = [attachUser(db), requireAuth];

  router.get('/api/admin/summary', ...auth, requirePermission(db, 'users.view'), (req, res) => {
    const count = (sql) => db.prepare(sql).get().count;
    res.json({
      students: count("SELECT COUNT(*) AS count FROM users WHERE role_id = (SELECT id FROM roles WHERE name = 'STUDENT')"),
      teachers: count("SELECT COUNT(*) AS count FROM users WHERE role_id = (SELECT id FROM roles WHERE name = 'TEACHER')"),
      pendingTeachers: count("SELECT COUNT(*) AS count FROM users WHERE role_id = (SELECT id FROM roles WHERE name = 'TEACHER') AND teacher_status = 'pending'"),
      activeCourses: count('SELECT COUNT(*) AS count FROM courses WHERE is_active = 1'),
    });
  });

  router.get('/api/admin/payment-settings', ...auth, requirePermission(db, 'payments.view'), (req, res) => {
    const rows = db.prepare("SELECT key, value FROM platform_settings WHERE key IN ('admin_receive_iban', 'payment_instruction')").all();
    const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    res.json({
      adminReceiveIban: settings.admin_receive_iban || '',
      paymentInstruction: settings.payment_instruction || 'Açıklama kısmına ders başvuru numaranızı yazın.',
    });
  });

  router.put('/api/admin/payment-settings', ...auth, requirePermission(db, 'payments.view'), (req, res) => {
    const iban = String(req.body?.adminReceiveIban || '').replace(/\s+/g, '').toUpperCase();
    if (!/^TR\d{24}$/.test(iban)) return res.status(400).json({ error: 'Geçerli bir Türkiye IBAN bilgisi girin.' });
    const instruction = String(req.body?.paymentInstruction || '').trim();
    if (instruction.length < 5 || instruction.length > 500) {
      return res.status(400).json({ error: 'Ödeme açıklaması 5 ile 500 karakter arasında olmalı.' });
    }
    const now = new Date().toISOString();
    const save = db.prepare(`
      INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);
    save.run('admin_receive_iban', iban, now);
    save.run('payment_instruction', instruction, now);
    res.json({ adminReceiveIban: iban, paymentInstruction: instruction, message: 'Ödeme ayarları güncellendi.' });
  });

  router.get('/api/admin/payments', ...auth, requirePermission(db, 'payments.view'), (req, res) => {
    const rows = db.prepare(`
      SELECT a.*, c.title AS course_title, s.full_name AS student_name, t.full_name AS teacher_name,
        tp.payout_iban
      FROM applications a
      JOIN courses c ON c.id = a.course_id
      JOIN users s ON s.id = a.student_id
      JOIN users t ON t.id = a.teacher_id
      LEFT JOIN teacher_profiles tp ON tp.user_id = a.teacher_id
      ORDER BY a.created_at DESC
    `).all();
    res.json({ payments: rows });
  });

  router.get('/api/admin/teacher-commissions', ...auth, requirePermission(db, 'commissions.manage'), (req, res) => {
    const rows = db.prepare(`
      SELECT u.id AS teacher_id, u.full_name, u.email,
        COALESCE(tp.commission_rate, 15) AS commission_rate
      FROM users u
      JOIN roles r ON r.id = u.role_id
      LEFT JOIN teacher_profiles tp ON tp.user_id = u.id
      WHERE r.name = 'TEACHER'
      ORDER BY u.full_name COLLATE NOCASE
    `).all();
    res.json({ teachers: rows });
  });

  router.patch('/api/admin/teacher-commissions/:teacherId', ...auth, requirePermission(db, 'commissions.manage'), (req, res) => {
    const teacherId = Number(req.params.teacherId);
    const rate = Number(req.body?.commissionRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      return res.status(400).json({ error: 'Komisyon oranı 0 ile 100 arasında olmalı.' });
    }
    const teacher = db.prepare(`
      SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.id = ? AND r.name = 'TEACHER'
    `).get(teacherId);
    if (!teacher) return res.status(404).json({ error: 'Öğretmen bulunamadı.' });
    const profile = db.prepare('SELECT id FROM teacher_profiles WHERE user_id = ?').get(teacherId);
    if (profile) {
      db.prepare('UPDATE teacher_profiles SET commission_rate = ?, updated_at = ? WHERE user_id = ?')
        .run(rate, new Date().toISOString(), teacherId);
    } else {
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO teacher_profiles (user_id, full_name, subject, payout_iban, commission_rate, created_at, updated_at)
        SELECT id, full_name, 'Genel', '', ?, ?, ? FROM users WHERE id = ?
      `).run(rate, now, now, teacherId);
    }
    res.json({ teacherId, commissionRate: rate, message: 'Öğretmen komisyon oranı güncellendi.' });
  });

  router.patch('/api/admin/payments/:id/confirm', ...auth, requirePermission(db, 'payments.view'), (req, res) => {
    const application = db.prepare(`
      SELECT a.*, COALESCE(tp.commission_rate, 15) AS current_commission_rate
      FROM applications a LEFT JOIN teacher_profiles tp ON tp.user_id = a.teacher_id
      WHERE a.id = ?
    `).get(Number(req.params.id));
    if (!application) return res.status(404).json({ error: 'Ders ödeme talebi bulunamadı.' });
    if (application.payment_status === 'confirmed') return res.json({ message: 'Ödeme zaten doğrulanmış.' });
    const requestedRate = req.body?.commissionRate === undefined ? application.current_commission_rate : Number(req.body.commissionRate);
    if (!Number.isFinite(requestedRate) || requestedRate < 0 || requestedRate > 100) {
      return res.status(400).json({ error: 'Komisyon oranı 0 ile 100 arasında olmalı.' });
    }
    const commissionCents = Math.round(application.amount_cents * requestedRate / 100);
    const teacherPayoutCents = application.amount_cents - commissionCents;
    const now = new Date().toISOString();
    db.prepare(`UPDATE applications SET payment_status = 'confirmed', commission_rate = ?, commission_cents = ?, teacher_payout_cents = ?, admin_confirmed_at = ?, updated_at = ? WHERE id = ?`)
      .run(requestedRate, commissionCents, teacherPayoutCents, now, now, application.id);
    db.prepare(`
      INSERT OR IGNORE INTO receipts (application_id, receipt_number, total_cents, commission_cents, teacher_payout_cents, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(application.id, `DB-${application.id}-${Date.now()}`, application.amount_cents, commissionCents, teacherPayoutCents, now);
    db.prepare(`INSERT INTO notifications (user_id, type, title, body, related_id, created_at) VALUES (?, 'payment', 'Ödeme doğrulandı', 'Ödemeniz admin tarafından doğrulandı; öğretmen onayı bekleniyor.', ?, ?), (?, 'payment', 'Yeni ödeme doğrulandı', 'Bir öğrencinin ders ödemesi doğrulandı; dersi kabul edebilirsiniz.', ?, ?)`)
      .run(application.student_id, application.id, now, application.teacher_id, application.id, now);
    res.json({ message: 'Ödeme doğrulandı.', commissionRate: requestedRate, commissionCents, teacherPayoutCents });
  });

  router.patch('/api/admin/payments/:id/payout-sent', ...auth, requirePermission(db, 'commissions.manage'), (req, res) => {
    const application = db.prepare('SELECT * FROM applications WHERE id = ?').get(Number(req.params.id));
    if (!application) return res.status(404).json({ error: 'Ödeme kaydı bulunamadı.' });
    if (application.status !== 'accepted') return res.status(409).json({ error: 'Öğretmen dersi kabul etmeden ödeme payı gönderilemez.' });
    const now = new Date().toISOString();
    db.prepare("UPDATE applications SET payout_sent_at = ?, payment_status = 'payout_sent', updated_at = ? WHERE id = ?").run(now, now, application.id);
    db.prepare(`INSERT INTO notifications (user_id, type, title, body, related_id, created_at) VALUES (?, 'payment', 'Öğretmen payı gönderildi', 'Ders payınız admin tarafından gönderildi.', ?, ?)`)
      .run(application.teacher_id, application.id, now);
    res.json({ message: 'Öğretmen payı gönderildi olarak işaretlendi.' });
  });

  router.get('/api/admin/teacher-documents', ...auth, requirePermission(db, 'teachers.manage'), (req, res) => {
    const documents = db.prepare(`
      SELECT d.*, u.full_name AS teacher_name, u.email
      FROM teacher_documents d JOIN users u ON u.id = d.teacher_id
      ORDER BY d.created_at DESC
    `).all();
    res.json({ documents });
  });

  router.patch('/api/admin/teacher-documents/:id', ...auth, requirePermission(db, 'teachers.manage'), (req, res) => {
    const status = String(req.body?.status || '');
    if (!['approved', 'rejected', 'pending'].includes(status)) return res.status(400).json({ error: 'Geçersiz belge durumu.' });
    const result = db.prepare('UPDATE teacher_documents SET status = ?, note = ?, reviewed_at = ? WHERE id = ?')
      .run(status, String(req.body?.note || '').trim().slice(0, 500), new Date().toISOString(), Number(req.params.id));
    if (!result.changes) return res.status(404).json({ error: 'Belge bulunamadı.' });
    res.json({ message: 'Belge durumu güncellendi.' });
  });

  // --- Listeleme -----------------------------------------------------------
  router.get('/api/admin/users', ...auth, requirePermission(db, 'users.view'), (req, res) => {
    const { role, q } = req.query;
    let sql = `
      SELECT u.id, u.email, u.full_name, u.is_active, u.is_blocked, u.teacher_status, u.created_at, r.name AS role
      FROM users u JOIN roles r ON r.id = u.role_id WHERE 1=1
    `;
    const params = [];
    if (role) { sql += ' AND r.name = ?'; params.push(role); }
    if (q) { sql += ' AND (u.email LIKE ? OR u.full_name LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
    sql += ' ORDER BY u.created_at DESC';
    res.json({ users: db.prepare(sql).all(...params) });
  });

  // --- Admin / Admin Helper / Öğretmen / Öğrenci oluşturma (Super Admin) ---
  router.post('/api/admin/users', ...auth, requireRole('SUPER_ADMIN'), (req, res) => {
    const { email, password, fullName, role } = req.body || {};
    const allowedRoles = ['ADMIN', 'ADMIN_HELPER', 'TEACHER', 'STUDENT'];
    if (!allowedRoles.includes(role)) return res.status(400).json({ error: 'Geçersiz rol.' });
    if (!email || !password || password.length < 8 || !fullName) {
      return res.status(400).json({ error: 'E-posta, şifre (min 8 karakter) ve ad soyad gerekli.' });
    }
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing) return res.status(409).json({ error: 'Bu e-posta zaten kayıtlı.' });

    const roleRow = db.prepare('SELECT id FROM roles WHERE name = ?').get(role);
    const { hash, salt } = hashPassword(password);
    const now = new Date().toISOString();
    const teacherStatus = role === 'TEACHER' ? 'approved' : null; // admin eliyle açılan öğretmen direkt onaylı

    const info = db.prepare(`
      INSERT INTO users (email, password_hash, password_salt, full_name, role_id, is_active, is_blocked, teacher_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?, ?)
    `).run(email.toLowerCase(), hash, salt, fullName.trim(), roleRow.id, teacherStatus, now, now);

    logAdminAction(db, {
      actorUserId: req.user.id, action: 'USER_CREATED', targetType: 'user', targetId: info.lastInsertRowid,
      detail: `${req.user.email}, ${email} (${role}) hesabını oluşturdu.`, ip: req.socket.remoteAddress,
    });

    res.status(201).json({ user: publicUser(db, info.lastInsertRowid) });
  });

  // --- Kullanıcı bilgisi düzenleme -----------------------------------------
  router.patch('/api/admin/users/:id', ...auth, requirePermission(db, 'users.edit'), (req, res) => {
    const target = getUserOr404(db, req.params.id, res);
    if (!target) return;
    const { fullName } = req.body || {};
    if (!fullName || fullName.trim().length < 2) return res.status(400).json({ error: 'Geçerli bir ad soyad girin.' });

    db.prepare('UPDATE users SET full_name = ?, updated_at = ? WHERE id = ?')
      .run(fullName.trim(), new Date().toISOString(), target.id);

    logAdminAction(db, {
      actorUserId: req.user.id, action: 'USER_EDITED', targetType: 'user', targetId: target.id,
      detail: `${req.user.email}, kullanıcı #${target.id} bilgilerini güncelledi.`, ip: req.socket.remoteAddress,
    });
    res.json({ user: publicUser(db, target.id) });
  });

  // --- Aktif / Pasif yapma --------------------------------------------------
  router.patch('/api/admin/users/:id/active', ...auth, requirePermission(db, 'users.edit'), (req, res) => {
    const target = getUserOr404(db, req.params.id, res);
    if (!target) return;
    const { isActive } = req.body || {};
    db.prepare('UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?')
      .run(isActive ? 1 : 0, new Date().toISOString(), target.id);

    logAdminAction(db, {
      actorUserId: req.user.id, action: isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED', targetType: 'user', targetId: target.id,
      detail: `${req.user.email}, kullanıcı #${target.id} durumunu ${isActive ? 'aktif' : 'pasif'} yaptı.`, ip: req.socket.remoteAddress,
    });
    res.json({ user: publicUser(db, target.id) });
  });

  // --- Engelleme / Engeli kaldırma ------------------------------------------
  router.patch('/api/admin/users/:id/block', ...auth, requirePermission(db, 'users.edit'), (req, res) => {
    const target = getUserOr404(db, req.params.id, res);
    if (!target) return;
    const { isBlocked } = req.body || {};
    db.prepare('UPDATE users SET is_blocked = ?, updated_at = ? WHERE id = ?')
      .run(isBlocked ? 1 : 0, new Date().toISOString(), target.id);

    logAdminAction(db, {
      actorUserId: req.user.id, action: isBlocked ? 'USER_BLOCKED' : 'USER_UNBLOCKED', targetType: 'user', targetId: target.id,
      detail: `${req.user.email}, kullanıcı #${target.id} kullanıcısını ${isBlocked ? 'engelledi' : 'engelini kaldırdı'}.`, ip: req.socket.remoteAddress,
    });
    res.json({ user: publicUser(db, target.id) });
  });

  // --- Rol değiştirme (yalnızca Super Admin) --------------------------------
  router.patch('/api/admin/users/:id/role', ...auth, requireRole('SUPER_ADMIN'), (req, res) => {
    const target = getUserOr404(db, req.params.id, res);
    if (!target) return;
    const { role } = req.body || {};
    const roleRow = db.prepare('SELECT id FROM roles WHERE name = ?').get(role);
    if (!roleRow) return res.status(400).json({ error: 'Geçersiz rol.' });

    const oldRole = db.prepare('SELECT r.name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?').get(target.id).name;
    db.prepare('UPDATE users SET role_id = ?, updated_at = ? WHERE id = ?').run(roleRow.id, new Date().toISOString(), target.id);

    logAdminAction(db, {
      actorUserId: req.user.id, action: 'ROLE_CHANGED', targetType: 'user', targetId: target.id,
      detail: `${req.user.email}, kullanıcı #${target.id} rolünü ${oldRole} → ${role} yaptı.`, ip: req.socket.remoteAddress,
    });
    res.json({ user: publicUser(db, target.id) });
  });

  // --- Şifre sıfırlama (Super Admin / gerekli izne sahip Admin) ------------
  router.post('/api/admin/users/:id/reset-password', ...auth, requirePermission(db, 'users.edit'), (req, res) => {
    const target = getUserOr404(db, req.params.id, res);
    if (!target) return;
    const { newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'Yeni şifre en az 8 karakter olmalı.' });

    const { hash, salt } = hashPassword(newPassword);
    db.prepare('UPDATE users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?')
      .run(hash, salt, new Date().toISOString(), target.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id); // tüm oturumları düşür

    logAdminAction(db, {
      actorUserId: req.user.id, action: 'PASSWORD_RESET', targetType: 'user', targetId: target.id,
      detail: `${req.user.email}, kullanıcı #${target.id} şifresini sıfırladı.`, ip: req.socket.remoteAddress,
    });
    res.json({ message: 'Şifre sıfırlandı.' });
  });

  // --- Kullanıcı silme (yalnızca Super Admin) -------------------------------
  router.delete('/api/admin/users/:id', ...auth, requireRole('SUPER_ADMIN'), (req, res) => {
    const target = getUserOr404(db, req.params.id, res);
    if (!target) return;
    if (target.id === req.user.id) return res.status(400).json({ error: 'Kendi hesabınızı silemezsiniz.' });

    db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
    logAdminAction(db, {
      actorUserId: req.user.id, action: 'USER_DELETED', targetType: 'user', targetId: target.id,
      detail: `${req.user.email}, kullanıcı #${target.id} (${target.email}) hesabını sildi.`, ip: req.socket.remoteAddress,
    });
    res.json({ message: 'Kullanıcı silindi.' });
  });

  // --- Öğretmen onaylama / reddetme -----------------------------------------
  router.patch('/api/admin/teachers/:id/approve', ...auth, requirePermission(db, 'teachers.manage'), (req, res) => {
    setTeacherStatus(db, req, res, 'approved');
  });
  router.patch('/api/admin/teachers/:id/reject', ...auth, requirePermission(db, 'teachers.manage'), (req, res) => {
    setTeacherStatus(db, req, res, 'rejected');
  });

  // --- Admin Helper'a özel izin açma/kapatma --------------------------------
  router.get('/api/admin/permissions', ...auth, requireRole('SUPER_ADMIN'), (req, res) => {
    res.json({ permissions: db.prepare('SELECT * FROM permissions ORDER BY key').all() });
  });

  router.get('/api/admin/users/:id/permissions', ...auth, requireRole('SUPER_ADMIN'), (req, res) => {
    const target = getUserOr404(db, req.params.id, res);
    if (!target) return;
    const perms = db.prepare(`
      SELECT p.key, p.description,
        COALESCE(up.allowed, 0) AS allowed
      FROM permissions p
      LEFT JOIN user_permissions up ON up.permission_id = p.id AND up.user_id = ?
      ORDER BY p.key
    `).all(target.id);
    res.json({ permissions: perms });
  });

  router.patch('/api/admin/users/:id/permissions', ...auth, requireRole('SUPER_ADMIN'), (req, res) => {
    const target = getUserOr404(db, req.params.id, res);
    if (!target) return;
    const { key, allowed } = req.body || {};
    const perm = db.prepare('SELECT id FROM permissions WHERE key = ?').get(key);
    if (!perm) return res.status(400).json({ error: 'Geçersiz izin anahtarı.' });

    db.prepare(`
      INSERT INTO user_permissions (user_id, permission_id, allowed) VALUES (?, ?, ?)
      ON CONFLICT(user_id, permission_id) DO UPDATE SET allowed = excluded.allowed
    `).run(target.id, perm.id, allowed ? 1 : 0);

    logAdminAction(db, {
      actorUserId: req.user.id, action: 'PERMISSION_CHANGED', targetType: 'user', targetId: target.id,
      detail: `${req.user.email}, kullanıcı #${target.id} için '${key}' iznini ${allowed ? 'açtı' : 'kapattı'}.`,
      ip: req.socket.remoteAddress,
    });
    res.json({ message: 'İzin güncellendi.' });
  });

  // --- Admin log kayıtlarını listeleme --------------------------------------
  router.get('/api/admin/logs', ...auth, requirePermission(db, 'reports.view'), (req, res) => {
    const logs = db.prepare(`
      SELECT al.*, u.email AS actor_email
      FROM admin_logs al LEFT JOIN users u ON u.id = al.actor_user_id
      ORDER BY al.created_at DESC LIMIT 200
    `).all();
    res.json({ logs });
  });
}

function setTeacherStatus(db, req, res, status) {
  const target = db.prepare(`
    SELECT u.*, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?
  `).get(req.params.id);
  if (!target) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
  if (target.role !== 'TEACHER') return res.status(400).json({ error: 'Bu kullanıcı öğretmen değil.' });

  db.prepare('UPDATE users SET teacher_status = ?, updated_at = ? WHERE id = ?')
    .run(status, new Date().toISOString(), target.id);

  logAdminAction(db, {
    actorUserId: req.user.id,
    action: status === 'approved' ? 'TEACHER_APPROVED' : 'TEACHER_REJECTED',
    targetType: 'user', targetId: target.id,
    detail: `${req.user.email}, öğretmen #${target.id} (${target.email}) hesabını ${status === 'approved' ? 'onayladı' : 'reddetti'}.`,
    ip: req.socket.remoteAddress,
  });
  res.json({ user: publicUser(db, target.id) });
}

function getUserOr404(db, id, res) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) { res.status(404).json({ error: 'Kullanıcı bulunamadı.' }); return null; }
  return user;
}

module.exports = { register };
