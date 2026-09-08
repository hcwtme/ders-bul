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
